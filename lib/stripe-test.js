import {fetchWithTimeout} from "./http-timeout.js";
import {env,billingError,billingDatabaseConfigured} from "./billing-store.js";

export const PRO_PLAN=Object.freeze({id:"warboost-pro-monthly",amount:499,currency:"eur",interval:"month",price_label:"4,99 € / mois"});
export const STRIPE_API_VERSION="2025-02-24.acacia";
export const COMMERCIAL_CONSENT_VERSION="2026-11-warboost-pro-monthly-v1";
export const testPriceId=()=>env("STRIPE_PRICE_PRO_MONTHLY");
export const testProductId=()=>env("STRIPE_PRODUCT_PRO");
export const livePriceId=()=>env("STRIPE_LIVE_PRICE_PRO_MONTHLY");
export const liveProductId=()=>env("STRIPE_LIVE_PRODUCT_PRO");
export const billingAppUrl=()=>env("WARBOOST_APP_URL").replace(/\/+$/,"");
export function stableUrl(value){
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&!u.hostname.endsWith(".vercel.app")&&!["localhost","127.0.0.1","demo.warboost.fr"].includes(u.hostname)}catch{return false}
}
export function liveApprovedBillingCountries(){
  return [...new Set(env("WARBOOST_LIVE_APPROVED_BILLING_COUNTRIES").split(/[,\s]+/).map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z]{2}$/.test(x)))].sort();
}
export function commercialConfig(){
  const raw=env("WARBOOST_COMMERCIAL_MODE").toLowerCase();
  const mode=raw==="test"?"test":raw==="preview"?"preview":raw==="live"?"live":"off";
  const stable_domain=stableUrl(billingAppUrl());
  const provider_ready=/^(sk|rk)_test_/.test(env("STRIPE_SECRET_KEY"))&&Boolean(testPriceId()&&testProductId()&&env("STRIPE_WEBHOOK_SECRET"));
  const live_provider_ready=/^(sk|rk)_live_/.test(env("STRIPE_LIVE_SECRET_KEY"))&&Boolean(livePriceId()&&liveProductId()&&env("STRIPE_LIVE_WEBHOOK_SECRET"));
  const database_ready=billingDatabaseConfigured();
  const legal_ready=Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")&&env("WARBOOST_SUPPORT_EMAIL")&&stableUrl(env("WARBOOST_TERMS_URL"))&&stableUrl(env("WARBOOST_PRIVACY_URL")));
  const live_automatic_tax=env("WARBOOST_LIVE_AUTOMATIC_TAX_ENABLED")==="true";
  const live_tax_code_ready=Boolean(env("STRIPE_LIVE_TAX_CODE"));
  const live_tax_ready=env("WARBOOST_LIVE_TAX_READY")==="true"&&live_automatic_tax&&live_tax_code_ready&&liveApprovedBillingCountries().length>0;
  // Hosted Checkout collects the billing address during payment. A country
  // chosen in our UI or copied onto a Customer is not authoritative pre-charge
  // evidence, so an environment flag must never unlock LIVE Checkout.
  const precharge_country_guard=false;
  const live_enabled=mode==="live"&&env("WARBOOST_LIVE_PAYMENTS_ENABLED")==="true"&&stable_domain&&
    live_provider_ready&&database_ready&&legal_ready&&live_tax_ready&&precharge_country_guard;
  const live_webhooks_enabled=(mode==="live"||mode==="off")&&env("WARBOOST_LIVE_WEBHOOKS_ENABLED")==="true"&&live_provider_ready&&database_ready;
  const configured=stable_domain&&provider_ready&&database_ready;
  const live_requirements={
    explicit_live_enable:env("WARBOOST_LIVE_PAYMENTS_ENABLED")==="true",
    stable_domain,live_provider_credentials:live_provider_ready,database:database_ready,legal_ready,
    legal_identity:Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")),support_email:Boolean(env("WARBOOST_SUPPORT_EMAIL")),
    terms_url:stableUrl(env("WARBOOST_TERMS_URL")),privacy_url:stableUrl(env("WARBOOST_PRIVACY_URL")),
    tax_configuration:live_tax_ready,automatic_tax:live_automatic_tax,tax_code:live_tax_code_ready,approved_billing_countries:liveApprovedBillingCountries(),
    precharge_country_guard:precharge_country_guard,
    precharge_country_guard_reason:"hosted_checkout_cannot_verify_billing_country_before_payment"
  };
  return {mode,live:live_enabled,live_blocked:!live_enabled,preview:mode==="preview",configured,payments_enabled:live_enabled,
    test_payments_enabled:mode==="test"&&configured,live_payments_enabled:live_enabled,live_webhooks_enabled,
    stable_domain,legal_ready,provider_ready,database_ready,live_provider_ready,live_tax_ready,
    terms_url:stableUrl(env("WARBOOST_TERMS_URL"))?env("WARBOOST_TERMS_URL"):"",
    privacy_url:stableUrl(env("WARBOOST_PRIVACY_URL"))?env("WARBOOST_PRIVACY_URL"):"",
    commercial_consent_version:COMMERCIAL_CONSENT_VERSION,
    plan:{...PRO_PLAN},activation_requirements:{
      stable_domain,legal_identity:Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")),
      support_email:Boolean(env("WARBOOST_SUPPORT_EMAIL")),terms_url:stableUrl(env("WARBOOST_TERMS_URL")),
      privacy_url:stableUrl(env("WARBOOST_PRIVACY_URL")),provider_credentials:provider_ready,database:database_ready,
      live:live_requirements
    }};
}
export function checkedTestConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="test")throw billingError("SAFE_LAUNCH_PAYMENT_DISABLED","Paiements réels désactivés. Mode Stripe TEST requis.",403);
  if(!/^(sk|rk)_test_/.test(env("STRIPE_SECRET_KEY")))throw billingError("STRIPE_TEST_KEY_REQUIRED","Seules les clés Stripe TEST sont autorisées.");
  if(!cfg.configured)throw billingError("COMMERCIAL_NOT_READY","Configuration Stripe TEST incomplète.");
  return cfg;
}
export function checkedLiveConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="live")throw billingError("SAFE_LAUNCH_PAYMENT_DISABLED","Le mode Stripe LIVE n'est pas sélectionné.",403);
  const missing=Object.entries(cfg.activation_requirements.live).filter(([key,value])=>key!=="approved_billing_countries"&&value!==true).map(([key])=>key);
  if(!cfg.live_payments_enabled)throw Object.assign(billingError("LIVE_ACTIVATION_REQUIREMENTS_MISSING","Activation Stripe LIVE bloquée : configuration commerciale, fiscale ou de sécurité incomplète.",503),{requirements:missing});
  if(!/^(sk|rk)_live_/.test(env("STRIPE_LIVE_SECRET_KEY")))throw billingError("STRIPE_LIVE_KEY_REQUIRED","Clé Stripe LIVE dédiée requise.");
  return cfg;
}
export function checkedLiveProviderConfig({webhook=false}={}){
  const cfg=commercialConfig();
  if(!/^(sk|rk)_live_/.test(env("STRIPE_LIVE_SECRET_KEY"))||!cfg.live_provider_ready||!cfg.database_ready||
    !env("STRIPE_LIVE_WEBHOOK_SECRET")||!(cfg.mode==="live"||webhook&&cfg.live_webhooks_enabled))
    throw billingError("LIVE_PROVIDER_NOT_CONFIGURED","Canal Stripe LIVE non configuré.",503);
  return cfg;
}
export async function providerRequestForMode(path,mode,{method="GET",params,idempotencyKey}={}){
  const live=mode==="live";
  if(live)checkedLiveProviderConfig({webhook:true});else if(mode==="test")checkedTestConfig();else throw billingError("PAYMENT_MODE_INVALID","Mode de paiement refusé.",403);
  const secret=live?env("STRIPE_LIVE_SECRET_KEY"):env("STRIPE_SECRET_KEY");
  const expectedLive=live;
  const headers={authorization:`Bearer ${secret}`,"Stripe-Version":STRIPE_API_VERSION};
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const options={method,headers};
  if(params){headers["content-type"]="application/x-www-form-urlencoded";options.body=new URLSearchParams(params).toString()}
  const r=await fetchWithTimeout(`https://api.stripe.com/v1/${path}`,options,10000,{code:"STRIPE_TIMEOUT",message:live?"Stripe LIVE ne répond pas.":"Stripe TEST ne répond pas."});
  const body=await r.json().catch(()=>({}));
  // Never return provider error messages or raw responses: they may contain personal data.
  if(!r.ok)throw billingError("PAYMENT_PROVIDER_ERROR",live?"Stripe LIVE a refusé la demande.":"Stripe TEST a refusé la demande.",502);
  const expectedValue=expectedLive===true;
  const correctMode=body.object==="list"&&Array.isArray(body.data)?
    (body.livemode===undefined||body.livemode===expectedValue)&&body.data.every(x=>x.livemode===expectedValue):
    body.livemode===expectedValue;
  if(!correctMode)throw billingError(live?"STRIPE_LIVE_OBJECT_REQUIRED":"STRIPE_TEST_OBJECT_REQUIRED",live?"Objet Stripe hors mode LIVE refusé.":"Objet Stripe hors mode TEST refusé.");
  return body;
}
export async function providerRequest(path,options={}){return providerRequestForMode(path,"test",options)}
export async function liveProviderRequest(path,options={}){return providerRequestForMode(path,"live",options)}
export function priceMatches(p,mode="test"){
  const live=mode==="live",expectedPrice=live?livePriceId():testPriceId(),expectedProduct=live?liveProductId():testProductId();
  const product=typeof p?.product==="string"?p.product:p?.product?.id;
  return p?.id===expectedPrice&&p?.livemode===live&&product===expectedProduct&&p?.unit_amount===499&&p?.currency==="eur"&&
    (!live||p?.tax_behavior==="inclusive")&&p?.type==="recurring"&&p?.billing_scheme==="per_unit"&&
    p?.recurring?.interval==="month"&&p?.recurring?.interval_count===1&&p?.recurring?.usage_type==="licensed";
}
export async function verifiedProviderPrice(mode="test"){
  const live=mode==="live",priceId=live?livePriceId():testPriceId(),productId=live?liveProductId():testProductId(),request=live?liveProviderRequest:providerRequest;
  const p=await request(`prices/${encodeURIComponent(priceId)}`);
  if(p.active!==true||!priceMatches(p,mode))throw billingError(live?"PRO_LIVE_PRICE_MISMATCH":"PRO_PRICE_MISMATCH",`Prix Stripe ${live?"LIVE":"TEST"} attendu : produit WarBoost PRO, 4,99 EUR, chaque mois.`);
  const product=await request(`products/${encodeURIComponent(productId)}`);
  if(product.id!==productId||product.active!==true||(live&&product.tax_code!==env("STRIPE_LIVE_TAX_CODE")))
    throw billingError(live?"PRO_LIVE_PRODUCT_MISMATCH":"PRO_PRODUCT_MISMATCH",`Produit WarBoost PRO ${live?"LIVE":"TEST"} invalide.`);
  return p;
}
export function stripeCheckoutUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="checkout.stripe.com"}catch{return false}}
export function stripePortalUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="billing.stripe.com"}catch{return false}}