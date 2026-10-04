import {fetchWithTimeout} from "./http-timeout.js";
import {env,billingError,billingDatabaseConfigured} from "./billing-store.js";

export const PRO_PLAN=Object.freeze({id:"warboost-pro-monthly",amount:499,currency:"eur",interval:"month",price_label:"4,99 € / mois"});
export const STRIPE_API_VERSION="2025-02-24.acacia";
export const testPriceId=()=>env("STRIPE_PRICE_PRO_MONTHLY");
export const testProductId=()=>env("STRIPE_PRODUCT_PRO");
export const billingAppUrl=()=>env("WARBOOST_APP_URL").replace(/\/+$/,"");
function stableUrl(value){
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&!u.hostname.endsWith(".vercel.app")&&!["localhost","127.0.0.1","demo.warboost.fr"].includes(u.hostname)}catch{return false}
}
export function commercialConfig(){
  const raw=env("WARBOOST_COMMERCIAL_MODE").toLowerCase();
  const mode=raw==="test"?"test":raw==="preview"?"preview":"off";
  const stable_domain=stableUrl(billingAppUrl());
  const provider_ready=/^(sk|rk)_test_/.test(env("STRIPE_SECRET_KEY"))&&Boolean(testPriceId()&&testProductId()&&env("STRIPE_WEBHOOK_SECRET"));
  const database_ready=billingDatabaseConfigured();
  const legal_ready=Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")&&env("WARBOOST_SUPPORT_EMAIL")&&stableUrl(env("WARBOOST_TERMS_URL"))&&stableUrl(env("WARBOOST_PRIVACY_URL")));
  const configured=stable_domain&&provider_ready&&database_ready;
  return {mode,live:false,live_blocked:true,preview:mode==="preview",configured,payments_enabled:false,test_payments_enabled:mode==="test"&&configured,
    stable_domain,legal_ready,provider_ready,database_ready,plan:{...PRO_PLAN},
    activation_requirements:{stable_domain,legal_identity:Boolean(env("WARBOOST_LEGAL_BUSINESS_NAME")),support_email:Boolean(env("WARBOOST_SUPPORT_EMAIL")),terms_url:stableUrl(env("WARBOOST_TERMS_URL")),privacy_url:stableUrl(env("WARBOOST_PRIVACY_URL")),provider_credentials:provider_ready,database:database_ready}};
}
export function checkedTestConfig(){
  const cfg=commercialConfig();
  if(cfg.mode!=="test")throw billingError("SAFE_LAUNCH_PAYMENT_DISABLED","Paiements réels désactivés. Mode Stripe TEST requis.",403);
  if(!/^(sk|rk)_test_/.test(env("STRIPE_SECRET_KEY")))throw billingError("STRIPE_TEST_KEY_REQUIRED","Seules les clés Stripe TEST sont autorisées.");
  if(!cfg.configured)throw billingError("COMMERCIAL_NOT_READY","Configuration Stripe TEST incomplète.");
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
export function priceMatches(p){
  const product=typeof p?.product==="string"?p.product:p?.product?.id;
  return p?.id===testPriceId()&&p?.livemode===false&&product===testProductId()&&p?.unit_amount===499&&p?.currency==="eur"&&
    p?.type==="recurring"&&p?.billing_scheme==="per_unit"&&p?.recurring?.interval==="month"&&p?.recurring?.interval_count===1&&p?.recurring?.usage_type==="licensed";
}
export async function verifiedProviderPrice(){
  const p=await providerRequest(`prices/${encodeURIComponent(testPriceId())}`);
  if(p.active!==true||!priceMatches(p))throw billingError("PRO_PRICE_MISMATCH","Prix TEST attendu : produit WarBoost PRO, 4,99 EUR, chaque mois.");
  const product=await providerRequest(`products/${encodeURIComponent(testProductId())}`);
  if(product.id!==testProductId()||product.active!==true)throw billingError("PRO_PRODUCT_MISMATCH","Produit WarBoost PRO TEST invalide.");
  return p;
}
export function stripeCheckoutUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="checkout.stripe.com"}catch{return false}}
export function stripePortalUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="billing.stripe.com"}catch{return false}}