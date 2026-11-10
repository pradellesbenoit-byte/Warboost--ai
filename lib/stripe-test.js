import {fetchWithTimeout} from "./http-timeout.js";
import {env,billingError,billingDatabaseConfigured} from "./billing-store.js";

export const PRO_PLAN=Object.freeze({id:"warboost-pro-monthly",amount:499,currency:"eur",interval:"month",price_label:"4,99 € / mois"});
export const STRIPE_API_VERSION="2025-02-24.acacia";
export const STRIPE_LIVE_API_VERSION="2025-03-31.basil";
export const LIVE_PRO_PRICE_ID="price_1UZcYaGfZaFP6KvgypF2VKY9";
export const LIVE_PRO_PRODUCT_ID="prod_VaoAeQc4DQLtEG";
export const MANAGED_PAYMENTS_PRODUCT_TAX_CODE="txcd_10105001";
export const testPriceId=()=>env("STRIPE_PRICE_PRO_MONTHLY");
export const testProductId=()=>env("STRIPE_PRODUCT_PRO");
export const livePriceId=()=>env("STRIPE_LIVE_PRICE_PRO_MONTHLY");
export const liveProductId=()=>env("STRIPE_LIVE_PRODUCT_PRO");
export const billingAppUrl=()=>env("WARBOOST_APP_URL").replace(/\/+$/,"");
export const liveBillingAppUrl=()=>env("WARBOOST_LIVE_APP_URL").replace(/\/+$/,"");
function stableUrl(value){
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&!u.hostname.endsWith(".vercel.app")&&!["localhost","127.0.0.1","demo.warboost.fr"].includes(u.hostname)}catch{return false}
}
function exactWarboostUrl(value,path="/"){
  try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="warboost.fr"&&!u.port&&!u.username&&!u.password&&u.pathname===path&&!u.search&&!u.hash}catch{return false}
}
const liveFlag=name=>env(name)==="true";
const testKeyReady=()=>/^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(env("STRIPE_SECRET_KEY"));
const liveKeyReady=()=>/^(?:sk|rk)_live_[A-Za-z0-9_]+$/.test(env("STRIPE_LIVE_SECRET_KEY"));
const testWebhookReady=()=>/^whsec_[A-Za-z0-9_]+$/.test(env("STRIPE_WEBHOOK_SECRET"));
const liveWebhookReady=()=>/^whsec_[A-Za-z0-9_]+$/.test(env("STRIPE_LIVE_WEBHOOK_SECRET"));
export function managedPaymentsProductEligible(product){
  return product?.object==="product"&&product.active===true&&product.livemode===true&&
    product.id===LIVE_PRO_PRODUCT_ID&&product.tax_code===MANAGED_PAYMENTS_PRODUCT_TAX_CODE;
}
function liveRequirements(){
  const database=billingDatabaseConfigured(),secret_key=liveKeyReady(),webhook_secret=liveWebhookReady();
  const database_verified=liveFlag("WARBOOST_LIVE_DATABASE_VERIFIED");
  const price_id=livePriceId()===LIVE_PRO_PRICE_ID,product_id=liveProductId()===LIVE_PRO_PRODUCT_ID;
  const app_url=exactWarboostUrl(liveBillingAppUrl()),terms_url=exactWarboostUrl(env("WARBOOST_LIVE_TERMS_URL"),"/legal.html");
  const privacy_url=exactWarboostUrl(env("WARBOOST_LIVE_PRIVACY_URL"),"/privacy.html");
  const legal_confirmed=liveFlag("WARBOOST_LIVE_LEGAL_CONFIRMED");
  const managed_payments_enabled=liveFlag("WARBOOST_LIVE_MANAGED_PAYMENTS_ENABLED");
  const managed_payments_verified=liveFlag("WARBOOST_LIVE_MANAGED_PAYMENTS_VERIFIED");
  const price_verified=liveFlag("WARBOOST_LIVE_PRICE_VERIFIED");
  const webhook_verified=liveFlag("WARBOOST_LIVE_WEBHOOK_VERIFIED");
  const tax_verified=liveFlag("WARBOOST_LIVE_TAX_VERIFIED");
  const activation_approved=liveFlag("WARBOOST_LIVE_ACTIVATION_APPROVED");
  const operations_ready=database&&database_verified&&secret_key&&webhook_secret&&price_id&&product_id&&app_url;
  const checkout_ready=operations_ready&&terms_url&&privacy_url&&legal_confirmed&&managed_payments_enabled&&
    managed_payments_verified&&price_verified&&webhook_verified&&tax_verified&&activation_approved;
  return {database,database_verified,secret_key,webhook_secret,price_id,product_id,app_url,terms_url,privacy_url,legal_confirmed,
    managed_payments_enabled,managed_payments_verified,price_verified,webhook_verified,tax_verified,activation_approved,
    operations_ready,checkout_ready};
}
export function commercialConfig(){
  const raw=env("WARBOOST_COMMERCIAL_MODE").toLowerCase();
  const mode=raw==="test"?"test":raw==="live"?"live":raw==="preview"?"preview":"off";
  const stable_domain=stableUrl(billingAppUrl());
  const provider_ready=testKeyReady()&&Boolean(testPriceId()&&testProductId()&&testWebhookReady())&&
    testPriceId()!==LIVE_PRO_PRICE_ID&&testProductId()!==LIVE_PRO_PRODUCT_ID;
  const database_ready=billingDatabaseConfigured();
  const legal_ready=Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")&&env("WARBOOST_SUPPORT_EMAIL")&&stableUrl(env("WARBOOST_TERMS_URL"))&&stableUrl(env("WARBOOST_PRIVACY_URL")));
  const live=liveRequirements(),test_configured=stable_domain&&provider_ready&&database_ready;
  const live_payments_ready=mode==="live"&&liveFlag("WARBOOST_LIVE_PAYMENTS_ENABLED")&&live.checkout_ready;
  return {mode,live:mode==="live",live_blocked:mode==="live"&&!live_payments_ready,preview:mode==="preview",
    configured:mode==="live"?live.operations_ready:test_configured,payments_enabled:live_payments_ready,
    test_payments_enabled:mode==="test"&&test_configured,live_payments_enabled:live_payments_ready,
    portal_enabled:mode==="test"?test_configured:mode==="live"&&live.operations_ready,
    stable_domain:mode==="live"?live.app_url:stable_domain,legal_ready:mode==="live"?live.legal_confirmed&&live.terms_url&&live.privacy_url:legal_ready,
    provider_ready:mode==="live"?live.secret_key&&live.webhook_secret&&live.price_id&&live.product_id:provider_ready,
    database_ready,plan:{...PRO_PLAN},consent_version:"2026-11-pro-live-managed-payments-v1",
    activation_requirements:mode==="live"?live:{
      stable_domain,legal_identity:Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")),support_email:Boolean(env("WARBOOST_SUPPORT_EMAIL")),
      terms_url:stableUrl(env("WARBOOST_TERMS_URL")),privacy_url:stableUrl(env("WARBOOST_PRIVACY_URL")),
      provider_credentials:provider_ready,database:database_ready
    }};
}
export function checkedTestConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="test")throw billingError("SAFE_LAUNCH_PAYMENT_DISABLED","Paiements réels désactivés. Mode Stripe TEST requis.",403);
  if(!testKeyReady())throw billingError("STRIPE_TEST_KEY_REQUIRED","Seules les clés Stripe TEST sont autorisées.");
  if(testPriceId()===LIVE_PRO_PRICE_ID||testProductId()===LIVE_PRO_PRODUCT_ID)
    throw billingError("STRIPE_TEST_LIVE_ID_MISMATCH","Un tarif ou produit LIVE ne peut pas être utilisé en TEST.",403);
  if(!cfg.configured)throw billingError("COMMERCIAL_NOT_READY","Configuration Stripe TEST incomplète.");
  return cfg;
}
export function checkedLiveConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="live")throw billingError("LIVE_BILLING_DISABLED","La facturation LIVE est désactivée.",403);
  if(!liveKeyReady())throw billingError("STRIPE_LIVE_KEY_REQUIRED","La clé Stripe LIVE dédiée est absente ou invalide.",403);
  if(livePriceId()!==LIVE_PRO_PRICE_ID||liveProductId()!==LIVE_PRO_PRODUCT_ID)
    throw billingError("STRIPE_LIVE_CATALOG_MISMATCH","Le tarif ou produit LIVE configuré ne correspond pas au catalogue WarBoost vérifié.",403);
  if(!cfg.live_payments_enabled)throw billingError("LIVE_ACTIVATION_REQUIREMENTS_MISSING","Les prérequis LIVE ne sont pas explicitement validés; aucun paiement n’est lancé.",403);
  return cfg;
}
export function checkedLiveOperationsConfig({webhook=false}={}){
  const cfg=commercialConfig(),live=liveRequirements();
  if(!liveKeyReady())throw billingError("STRIPE_LIVE_KEY_REQUIRED","La clé Stripe LIVE dédiée est absente ou invalide.",403);
  if(webhook){
    if(!liveWebhookReady()||!billingDatabaseConfigured())
      throw billingError("LIVE_WEBHOOK_NOT_READY","La réception LIVE signée n’est pas configurée.",503);
    return cfg;
  }
  if(cfg.mode!=="live"||!live.operations_ready)
    throw billingError("LIVE_OPERATIONS_NOT_READY","Le portail LIVE n’est pas configuré.",503);
  return cfg;
}
export async function providerRequest(path,{method="GET",params,idempotencyKey}={}){
  checkedTestConfig();
  const headers={authorization:`Bearer ${env("STRIPE_SECRET_KEY")}`,"Stripe-Version":STRIPE_API_VERSION};
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const options={method,headers};
  if(params){headers["content-type"]="application/x-www-form-urlencoded";options.body=new URLSearchParams(params).toString()}
  const r=await fetchWithTimeout(`https://api.stripe.com/v1/${path}`,options,10000,{code:"STRIPE_TIMEOUT",message:"Stripe TEST ne répond pas."});
  const body=await r.json().catch(()=>({}));
  // Never return provider error messages or raw responses: they may contain personal data.
  if(!r.ok)throw billingError("PAYMENT_PROVIDER_ERROR","Stripe TEST a refusé la demande.",502);
  const testObject=body.object==="list"&&Array.isArray(body.data)?body.data.every(x=>x.livemode===false):body.livemode===false;
  if(!testObject)throw billingError("STRIPE_TEST_OBJECT_REQUIRED","Objet Stripe hors mode TEST refusé.");
  return body;
}
export async function liveProviderRequest(path,{method="GET",params,idempotencyKey,operation="checkout"}={}){
  if(operation==="checkout")checkedLiveConfig();
  else checkedLiveOperationsConfig({webhook:operation==="webhook"});
  const headers={authorization:`Bearer ${env("STRIPE_LIVE_SECRET_KEY")}`,"Stripe-Version":STRIPE_LIVE_API_VERSION};
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const options={method,headers};
  if(params){headers["content-type"]="application/x-www-form-urlencoded";options.body=new URLSearchParams(params).toString()}
  const r=await fetchWithTimeout(`https://api.stripe.com/v1/${path}`,options,10000,{code:"STRIPE_TIMEOUT",message:"Stripe LIVE ne répond pas."});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw billingError("PAYMENT_PROVIDER_ERROR","Stripe LIVE a refusé la demande.",502);
  const valid=body.object==="list"&&Array.isArray(body.data)?
    (body.livemode===undefined||body.livemode===true)&&body.data.every(x=>x?.livemode===true):body.livemode===true;
  if(!valid)throw billingError("STRIPE_LIVE_OBJECT_REQUIRED","Objet Stripe hors mode LIVE refusé.",502);
  return body;
}
export function priceMatches(p,mode="test"){
  const product=typeof p?.product==="string"?p.product:p?.product?.id;
  const live=mode==="live";
  return p?.id===(live?LIVE_PRO_PRICE_ID:testPriceId())&&p?.livemode===live&&
    product===(live?LIVE_PRO_PRODUCT_ID:testProductId())&&p?.unit_amount===499&&p?.currency==="eur"&&
    p?.type==="recurring"&&p?.billing_scheme==="per_unit"&&p?.recurring?.interval==="month"&&p?.recurring?.interval_count===1&&p?.recurring?.usage_type==="licensed";
}
export async function verifiedProviderPrice(){
  const p=await providerRequest(`prices/${encodeURIComponent(testPriceId())}`);
  if(p.active!==true||!priceMatches(p))throw billingError("PRO_PRICE_MISMATCH","Prix TEST attendu : produit WarBoost PRO, 4,99 EUR, chaque mois.");
  const product=await providerRequest(`products/${encodeURIComponent(testProductId())}`);
  if(product.id!==testProductId()||product.active!==true)throw billingError("PRO_PRODUCT_MISMATCH","Produit WarBoost PRO TEST invalide.");
  return p;
}
export async function verifiedLiveProviderPrice(){
  checkedLiveConfig();
  const p=await liveProviderRequest(`prices/${encodeURIComponent(LIVE_PRO_PRICE_ID)}`);
  if(p.active!==true||p.tax_behavior!=="inclusive"||!priceMatches(p,"live"))
    throw billingError("PRO_LIVE_PRICE_MISMATCH","Le prix LIVE doit être actif, 4,99 EUR par mois et taxes incluses.");
  const product=await liveProviderRequest(`products/${encodeURIComponent(LIVE_PRO_PRODUCT_ID)}`);
  if(!managedPaymentsProductEligible(product))
    throw billingError("MANAGED_PAYMENTS_PRODUCT_INELIGIBLE","Le produit LIVE doit être actif et porter le code fiscal Managed Payments attendu.");
  return p;
}
export function stripeCheckoutUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="checkout.stripe.com"}catch{return false}}
export function stripePortalUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="billing.stripe.com"}catch{return false}}