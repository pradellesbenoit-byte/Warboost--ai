import {fetchWithTimeout} from "./http-timeout.js";
import {env,billingError,billingDatabaseConfigured} from "./billing-store.js";

export const PRO_PLAN=Object.freeze({id:"warboost-pro-monthly",amount:499,currency:"eur",interval:"month",price_label:"4,99 € / mois"});
export const STRIPE_API_VERSION="2025-02-24.acacia";
export const STRIPE_MANAGED_PAYMENTS_API_VERSION="2025-03-31.basil";
export const MANAGED_PAYMENTS_PRODUCT_TAX_CODE="txcd_10105001";
export const testPriceId=()=>env("STRIPE_PRICE_PRO_MONTHLY");
export const testProductId=()=>env("STRIPE_PRODUCT_PRO");
export const livePriceId=()=>env("STRIPE_LIVE_PRICE_PRO_MONTHLY");
export const liveProductId=()=>env("STRIPE_LIVE_PRODUCT_PRO");
export const billingAppUrl=(mode="test")=>env(mode==="live"?"WARBOOST_LIVE_APP_URL":"WARBOOST_APP_URL").replace(/\/+$/,"");
function stableUrl(value){
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&!u.hostname.endsWith(".vercel.app")&&!["localhost","127.0.0.1","demo.warboost.fr"].includes(u.hostname)}catch{return false}
}
function exactWarboostUrl(value,path="/"){
  try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="warboost.fr"&&!u.port&&!u.username&&!u.password&&u.pathname===path&&!u.search&&!u.hash}catch{return false}
}
const liveFlag=name=>env(name)==="true";
const liveManagedPaymentsEnabled=()=>liveFlag("WARBOOST_LIVE_MANAGED_PAYMENTS_ENABLED");
const liveManagedPaymentsVerified=()=>liveFlag("WARBOOST_LIVE_MANAGED_PAYMENTS_VERIFIED");
const testKey=()=>/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(env("STRIPE_SECRET_KEY"));
const liveKey=()=>/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(env("STRIPE_LIVE_SECRET_KEY"));
const safeStripeId=(value,prefix)=>new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
const liveIdsReady=()=>safeStripeId(livePriceId(),"price")&&safeStripeId(liveProductId(),"prod");
const liveWebhookReady=()=>/^whsec_[A-Za-z0-9]+$/.test(env("STRIPE_LIVE_WEBHOOK_SECRET"));
export function managedPaymentsProductEligible(product){
  return product?.object==="product"&&product.active===true&&product.tax_code===MANAGED_PAYMENTS_PRODUCT_TAX_CODE;
}
export function stripeCheckoutLocale(value){
  const input=String(value||"").trim();
  const supported=new Set(["auto","bg","cs","da","de","el","en","en-GB","es","es-419","et","fi","fil","fr","hr","hu","id","it","ja","ko","lt","lv","ms","mt","nb","nl","pl","pt","pt-BR","ro","ru","sk","sl","sv","th","tr","vi","zh","zh-HK","zh-TW"]);
  return supported.has(input)?input:"auto";
}
const liveConsentReady=()=>liveFlag("WARBOOST_LIVE_ACTIVATION_APPROVED")&&liveFlag("WARBOOST_LIVE_CATALOG_VERIFIED")&&
  liveFlag("WARBOOST_LIVE_LEGAL_CONFIRMED")&&liveManagedPaymentsEnabled()&&liveManagedPaymentsVerified()&&
  liveFlag("WARBOOST_LIVE_LEGACY_RECONCILED");
function liveRequirements(){
  return {
    explicit_enabled:liveFlag("WARBOOST_LIVE_PAYMENTS_ENABLED"),
    activation_approved:liveFlag("WARBOOST_LIVE_ACTIVATION_APPROVED"),
    catalog_verified:liveFlag("WARBOOST_LIVE_CATALOG_VERIFIED"),
    legal_confirmed:liveFlag("WARBOOST_LIVE_LEGAL_CONFIRMED"),
    managed_payments_enabled:liveManagedPaymentsEnabled(),
    managed_payments_verified:liveManagedPaymentsVerified(),
    managed_payments_product_tax_code:MANAGED_PAYMENTS_PRODUCT_TAX_CODE,
    international_sales_enabled:liveFlag("WARBOOST_LIVE_INTERNATIONAL_SALES_ENABLED"),
    legacy_reconciled:liveFlag("WARBOOST_LIVE_LEGACY_RECONCILED"),
    live_secret_key:liveKey(),live_webhook_secret:liveWebhookReady(),live_price_product_ids:liveIdsReady(),
    live_domain:exactWarboostUrl(billingAppUrl("live")),
    legal_identity:Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")),
    support_email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env("WARBOOST_SUPPORT_EMAIL")),
    terms_url:exactWarboostUrl(env("WARBOOST_LIVE_TERMS_URL"),"/legal.html"),
    privacy_url:exactWarboostUrl(env("WARBOOST_LIVE_PRIVACY_URL"),"/privacy.html"),
    database:billingDatabaseConfigured()
  };
}
export function commercialConfig(){
  const raw=env("WARBOOST_COMMERCIAL_MODE").toLowerCase();
  const mode=raw==="test"?"test":raw==="live"?"live":raw==="preview"?"preview":"off";
  const stable_domain=stableUrl(billingAppUrl());
  const test_provider_ready=testKey()&&safeStripeId(testPriceId(),"price")&&safeStripeId(testProductId(),"prod")&&/^whsec_[A-Za-z0-9]+$/.test(env("STRIPE_WEBHOOK_SECRET"));
  const database_ready=billingDatabaseConfigured();
  const live_requirements=liveRequirements();
  const live_runtime_ready=live_requirements.live_secret_key&&live_requirements.live_webhook_secret&&live_requirements.live_price_product_ids&&live_requirements.live_domain&&database_ready;
  const live_legal_ready=live_requirements.legal_identity&&live_requirements.support_email&&live_requirements.terms_url&&live_requirements.privacy_url;
  const live_payments_ready=mode==="live"&&liveFlag("WARBOOST_LIVE_PAYMENTS_ENABLED")&&live_runtime_ready&&live_legal_ready&&
    live_requirements.international_sales_enabled&&live_requirements.managed_payments_enabled&&
    live_requirements.managed_payments_verified&&liveConsentReady();
  const test_configured=stable_domain&&test_provider_ready&&database_ready;
  const configured=mode==="live"?live_runtime_ready:mode==="test"?test_configured:false;
  return {mode,live:mode==="live",live_blocked:mode==="live"&&!live_payments_ready,preview:mode==="preview",configured,
    payments_enabled:live_payments_ready,test_payments_enabled:mode==="test"&&test_configured,
    managed_payments_enabled:mode==="live"&&live_requirements.managed_payments_enabled,
    adaptive_pricing_enabled:mode==="live"&&live_requirements.managed_payments_enabled&&live_requirements.managed_payments_verified,
    portal_enabled:mode==="live"?live_runtime_ready:mode==="test"&&test_configured,
    stable_domain:mode==="live"?live_requirements.live_domain:stable_domain,legal_ready:mode==="live"?live_legal_ready:
      Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")&&env("WARBOOST_SUPPORT_EMAIL")&&stableUrl(env("WARBOOST_TERMS_URL"))&&stableUrl(env("WARBOOST_PRIVACY_URL"))),
    provider_ready:mode==="live"?live_runtime_ready&&live_legal_ready:test_provider_ready&&stable_domain&&database_ready,
    database_ready,plan:{...PRO_PLAN},consent_version:"2026-11-pro-managed-payments-v1",
    activation_requirements:mode==="live"?live_requirements:{
      stable_domain,legal_identity:Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")),support_email:Boolean(env("WARBOOST_SUPPORT_EMAIL")),
      terms_url:stableUrl(env("WARBOOST_TERMS_URL")),privacy_url:stableUrl(env("WARBOOST_PRIVACY_URL")),
      provider_credentials:test_provider_ready,database:database_ready
    }};
}
export function checkedTestConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="test")throw billingError("SAFE_LAUNCH_PAYMENT_DISABLED","Paiements réels désactivés. Mode Stripe TEST requis.",403);
  if(!testKey())throw billingError("STRIPE_TEST_KEY_REQUIRED","Seules les clés Stripe TEST sont autorisées.");
  if(!cfg.configured)throw billingError("COMMERCIAL_NOT_READY","Configuration Stripe TEST incomplète.");
  return cfg;
}
export function checkedLiveConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="live")throw billingError("LIVE_BILLING_DISABLED","La facturation LIVE est désactivée.",403);
  if(!liveKey())throw billingError("STRIPE_LIVE_KEY_REQUIRED","Une clé Stripe LIVE dédiée est requise.");
  if(!cfg.payments_enabled)throw billingError("LIVE_ACTIVATION_REQUIREMENTS_MISSING","La facturation LIVE reste désactivée tant que Managed Payments, le compte marchand et ses prérequis ne sont pas explicitement vérifiés.");
  return cfg;
}
export function checkedLiveOperationsConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="live"||!cfg.configured||!liveKey()||!liveWebhookReady())
    throw billingError("LIVE_OPERATIONS_NOT_READY","Les opérations LIVE existantes ne sont pas disponibles.",403);
  return cfg;
}
export function checkedLivePortalConfig(){
  const cfg=checkedLiveOperationsConfig();
  if(!cfg.portal_enabled)throw billingError("LIVE_PORTAL_NOT_READY","Le portail LIVE n’est pas disponible.",403);
  return cfg;
}
function checkedMode(mode){
  if(mode==="live")return checkedLiveConfig();
  return checkedTestConfig();
}
function secretForMode(mode){return mode==="live"?env("STRIPE_LIVE_SECRET_KEY"):env("STRIPE_SECRET_KEY")}
export async function providerRequest(path,{method="GET",params,idempotencyKey,mode="test",portalSession=false,existingOperation=false}={}){
  if(mode==="live"&&(portalSession||existingOperation))checkedLiveOperationsConfig();else checkedMode(mode);
  const headers={authorization:`Bearer ${secretForMode(mode)}`,
    "Stripe-Version":mode==="live"?STRIPE_MANAGED_PAYMENTS_API_VERSION:STRIPE_API_VERSION};
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const options={method,headers};
  if(params){headers["content-type"]="application/x-www-form-urlencoded";options.body=new URLSearchParams(params).toString()}
  const r=await fetchWithTimeout(`https://api.stripe.com/v1/${path}`,options,10000,{code:"STRIPE_TIMEOUT",message:mode==="live"?"Stripe LIVE ne répond pas.":"Stripe TEST ne répond pas."});
  const body=await r.json().catch(()=>({}));
  // Never return provider error messages or raw responses: they may contain personal data.
  if(!r.ok)throw billingError("PAYMENT_PROVIDER_ERROR",mode==="live"?"Le prestataire de paiement a refusé la demande.":"Stripe TEST a refusé la demande.",502);
  const expectedLive=mode==="live",isList=body?.object==="list";
  const providerObjects=isList&&Array.isArray(body.data)?body.data:[body];
  const listModeMismatch=isList&&Object.prototype.hasOwnProperty.call(body,"livemode")&&body.livemode!==expectedLive;
  if((isList&&(!Array.isArray(body.data)||listModeMismatch))||(!isList&&body?.livemode!==expectedLive)||
     providerObjects.some(x=>x?.livemode!==expectedLive))
    throw billingError(expectedLive?"STRIPE_LIVE_OBJECT_REQUIRED":"STRIPE_TEST_OBJECT_REQUIRED",expectedLive?"Objet Stripe LIVE requis.":"Objet Stripe TEST requis.");
  return body;
}
export function priceMatches(p,mode="test"){
  const product=typeof p?.product==="string"?p.product:p?.product?.id;
  const live=mode==="live",expectedPrice=live?livePriceId():testPriceId(),expectedProduct=live?liveProductId():testProductId();
  return p?.id===expectedPrice&&p?.livemode===live&&product===expectedProduct&&p?.unit_amount===499&&p?.currency==="eur"&&
    p?.type==="recurring"&&p?.billing_scheme==="per_unit"&&p?.recurring?.interval==="month"&&p?.recurring?.interval_count===1&&p?.recurring?.usage_type==="licensed";
}
export async function verifiedProviderPrice(mode="test"){
  checkedMode(mode);
  const price=mode==="live"?livePriceId():testPriceId(),productId=mode==="live"?liveProductId():testProductId();
  const p=await providerRequest(`prices/${encodeURIComponent(price)}`,{mode});
  if(p.active!==true||!priceMatches(p,mode)||(mode==="live"&&p.tax_behavior!=="inclusive"))
    throw billingError("PRO_PRICE_MISMATCH",mode==="live"?"Le prix LIVE doit être actif, 4,99 EUR TTC par mois et correspondre au produit vérifié.":"Prix TEST attendu : produit WarBoost PRO, 4,99 EUR, chaque mois.");
  const product=await providerRequest(`products/${encodeURIComponent(productId)}`,{mode});
  if(product.id!==productId||product.active!==true||product.livemode!==(mode==="live"))
    throw billingError("PRO_PRODUCT_MISMATCH",mode==="live"?"Produit WarBoost PRO LIVE invalide.":"Produit WarBoost PRO TEST invalide.");
  if(mode==="live"&&!managedPaymentsProductEligible(product))
    throw billingError("MANAGED_PAYMENTS_PRODUCT_INELIGIBLE","Le produit LIVE doit avoir une catégorie Managed Payments éligible et vérifiée.");
  return p;
}
export function stripeCheckoutUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="checkout.stripe.com"}catch{return false}}
export function stripePortalUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="billing.stripe.com"}catch{return false}}