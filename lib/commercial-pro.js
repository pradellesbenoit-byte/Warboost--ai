import crypto from "node:crypto";

export const COMMERCIAL_CONSENT_VERSION="2026-09-10-commercial-v1";
export const PRO_PLAN=Object.freeze({
  id:"warboost-pro-monthly",
  amount:499,
  currency:"eur",
  interval:"month",
  price_label:"4,99 € / mois"
});

function pick(...names){for(const name of names){const v=process.env[name];if(typeof v==="string"&&v.trim())return v.trim()}return ""}
function sbUrl(){return pick("SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL").replace(/\/$/,"")}
function serviceKey(){return pick("SUPABASE_SERVICE_ROLE_KEY")}
function secretKey(){return pick("STRIPE_SECRET_KEY")}
function priceId(){return pick("STRIPE_PRICE_PRO_MONTHLY")}
function webhookSecret(){return pick("STRIPE_WEBHOOK_SECRET")}
function appUrl(){return pick("WARBOOST_APP_URL","APP_URL").replace(/\/+$/,"")}
function businessName(){return pick("WARBOOST_LEGAL_BUSINESS_NAME")}
function supportEmail(){return pick("WARBOOST_SUPPORT_EMAIL")}
function termsUrl(){return pick("WARBOOST_TERMS_URL")}
function privacyUrl(){return pick("WARBOOST_PRIVACY_URL")}
function modeRaw(){return pick("WARBOOST_COMMERCIAL_MODE").toLowerCase()}
function hasStableHttpsUrl(value){try{const u=new URL(value);const h=u.hostname.toLowerCase();return u.protocol==="https:"&&!h.endsWith(".vercel.app")&&!['localhost','127.0.0.1'].includes(h)}catch{return false}}
function validLegalUrl(value){return hasStableHttpsUrl(value)}
function dbConfigured(){return Boolean(sbUrl()&&serviceKey())}

export function commercialConfig(){
  const mode=modeRaw()==="live"?"live":modeRaw()==="preview"?"preview":"off";
  const stable_domain=hasStableHttpsUrl(appUrl());
  const legal_ready=Boolean(businessName()&&supportEmail()&&validLegalUrl(termsUrl())&&validLegalUrl(privacyUrl()));
  const provider_ready=Boolean(secretKey()&&priceId()&&webhookSecret());
  const database_ready=dbConfigured();
  const configured=stable_domain&&legal_ready&&provider_ready&&database_ready;
  const payments_enabled=mode==="live"&&configured;
  return {
    mode,live:mode==="live",preview:mode==="preview",configured,payments_enabled,
    stable_domain,legal_ready,provider_ready,database_ready,
    plan:{...PRO_PLAN},
    activation_requirements:{stable_domain,legal_identity:Boolean(businessName()),support_email:Boolean(supportEmail()),terms_url:validLegalUrl(termsUrl()),privacy_url:validLegalUrl(privacyUrl()),provider_credentials:provider_ready,database:database_ready}
  };
}

function adminHeaders(extra={}){const key=serviceKey();return {apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json",...extra}}
async function parse(r){const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch{body=text}if(!r.ok){const raw=`${body?.code||""} ${body?.message||""}`.toLowerCase();const schema=/42p01|pgrst205|could not find the table|relation .* does not exist/.test(raw);throw Object.assign(new Error(schema?"WarBoost commercial database schema is missing.":(body?.message||`Database HTTP ${r.status}`)),{status:schema?503:r.status,code:schema?"COMMERCIAL_SCHEMA_MISSING":"COMMERCIAL_DATABASE_ERROR",body})}return body}
async function db(path,options={}){if(!dbConfigured())throw Object.assign(new Error("Commercial database is not configured."),{status:503,code:"COMMERCIAL_DATABASE_NOT_CONFIGURED"});return parse(await fetch(`${sbUrl()}/rest/v1/${path}`,{...options,headers:adminHeaders(options.headers||{})}))}

export async function getSubscription(userId){
  if(!userId||!dbConfigured())return null;
  try{const rows=await db(`warboost_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);return rows?.[0]||null}catch(e){if(e?.code==="COMMERCIAL_SCHEMA_MISSING")return null;throw e}
}
export function subscriptionActive(row){
  if(!row||!["active","trialing"].includes(String(row.status||"").toLowerCase()))return false;
  if(row.current_period_end){const end=Date.parse(row.current_period_end);if(Number.isFinite(end)&&end<=Date.now())return false}
  return true;
}
export async function commercialStatusForUser(user){
  const cfg=commercialConfig(),sub=await getSubscription(user?.id),active=subscriptionActive(sub);
  return {
    ...cfg,
    active,
    status:active?"pro":String(sub?.status||"free"),
    subscription:sub?{plan:sub.plan||"free",status:sub.status||"inactive",cancel_at_period_end:Boolean(sub.cancel_at_period_end),current_period_end:sub.current_period_end||null}:null
  };
}

function checkedLiveConfig(){
  const cfg=commercialConfig();
  if(!cfg.live)throw Object.assign(new Error("WarBoost commercial payments are not live."),{status:403,code:"COMMERCIAL_MODE_DISABLED"});
  if(!cfg.configured)throw Object.assign(new Error("WarBoost commercial activation requirements are incomplete."),{status:503,code:"COMMERCIAL_NOT_READY",requirements:cfg.activation_requirements});
  return cfg;
}
async function providerRequest(path,{method="GET",params=null}={}){
  const key=secretKey();if(!key)throw Object.assign(new Error("Payment provider is not configured."),{status:503,code:"PAYMENT_PROVIDER_NOT_CONFIGURED"});
  const options={method,headers:{authorization:`Bearer ${key}`}};
  if(params){options.headers["content-type"]="application/x-www-form-urlencoded";options.body=new URLSearchParams(params).toString()}
  const r=await fetch(`https://api.stripe.com/v1/${path}`,options),body=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(body?.error?.message||`Payment provider HTTP ${r.status}`),{status:502,code:"PAYMENT_PROVIDER_ERROR"});
  return body;
}
async function verifiedProviderPrice(){
  const p=await providerRequest(`prices/${encodeURIComponent(priceId())}`),amount=Number(p?.unit_amount),currency=String(p?.currency||"").toLowerCase(),interval=String(p?.recurring?.interval||"").toLowerCase();
  if(p?.active!==true||amount!==PRO_PLAN.amount||currency!==PRO_PLAN.currency||interval!==PRO_PLAN.interval){
    throw Object.assign(new Error("Configured subscription price does not match the WarBoost PRO price lock."),{status:503,code:"PRO_PRICE_MISMATCH",expected:PRO_PLAN,observed:{active:p?.active===true,amount,currency,interval}})
  }
  return p;
}

export async function createCheckoutForUser(user){
  const cfg=checkedLiveConfig();
  const existing=await getSubscription(user?.id);if(subscriptionActive(existing))throw Object.assign(new Error("WarBoost PRO is already active."),{status:409,code:"PRO_ALREADY_ACTIVE"});
  await verifiedProviderPrice();
  const params={
    mode:"subscription",
    "line_items[0][price]":priceId(),
    "line_items[0][quantity]":"1",
    success_url:`${appUrl()}/?billing=success`,
    cancel_url:`${appUrl()}/?billing=cancel`,
    allow_promotion_codes:"true",
    client_reference_id:String(user.id),
    "metadata[user_id]":String(user.id),
    "subscription_data[metadata][user_id]":String(user.id)
  };
  if(existing?.stripe_customer_id)params.customer=existing.stripe_customer_id;else if(user?.email)params.customer_email=String(user.email);
  const session=await providerRequest("checkout/sessions",{method:"POST",params});
  if(!/^https:\/\//i.test(String(session?.url||"")))throw Object.assign(new Error("Secure checkout URL is missing."),{status:502,code:"CHECKOUT_URL_MISSING"});
  return {url:session.url,plan:{...PRO_PLAN},payments_enabled:cfg.payments_enabled};
}

export async function createPortalForUser(user){
  checkedLiveConfig();
  const sub=await getSubscription(user?.id);if(!sub?.stripe_customer_id)throw Object.assign(new Error("No billing customer is linked to this account."),{status:409,code:"BILLING_CUSTOMER_MISSING"});
  const session=await providerRequest("billing_portal/sessions",{method:"POST",params:{customer:sub.stripe_customer_id,return_url:appUrl()}});
  if(!/^https:\/\//i.test(String(session?.url||"")))throw Object.assign(new Error("Billing portal URL is missing."),{status:502,code:"BILLING_PORTAL_URL_MISSING"});
  return {url:session.url};
}

function signatureParts(value){const out={t:null,v1:[]};for(const part of String(value||"").split(",")){const [k,...rest]=part.split("=");const v=rest.join("=");if(k==="t")out.t=v;else if(k==="v1"&&v)out.v1.push(v)}return out}
function safeEqualHex(a,b){try{const A=Buffer.from(String(a),"hex"),B=Buffer.from(String(b),"hex");return A.length===B.length&&A.length>0&&crypto.timingSafeEqual(A,B)}catch{return false}}
export function verifyWebhookSignature(raw,header,nowMs=Date.now()){
  const secret=webhookSecret();if(!secret)return false;const parts=signatureParts(header),ts=Number(parts.t);if(!Number.isFinite(ts)||Math.abs(nowMs-ts*1000)>5*60*1000)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${parts.t}.${raw}`).digest("hex");return parts.v1.some(v=>safeEqualHex(expected,v));
}

async function getBillingEvent(eventId){try{const rows=await db(`warboost_billing_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id,processed&limit=1`);return rows?.[0]||null}catch(e){if(e?.code==="COMMERCIAL_SCHEMA_MISSING")throw e;throw e}}
async function recordBillingEvent(event){await db("warboost_billing_events?on_conflict=event_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({event_id:event.id,event_type:String(event.type||"unknown"),processed:false,received_at:new Date().toISOString(),updated_at:new Date().toISOString()})})}
async function markBillingEventProcessed(eventId){await db(`warboost_billing_events?event_id=eq.${encodeURIComponent(eventId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({processed:true,processed_at:new Date().toISOString(),updated_at:new Date().toISOString()})})}
function unixIso(value){const n=Number(value);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null}
async function upsertSubscriptionFromProviderObject(object,{userId=null,session=null}={}){
  const uid=String(userId||object?.metadata?.user_id||session?.client_reference_id||session?.metadata?.user_id||"").trim();if(!uid)return false;
  let sub=object;if(String(object?.object)!=="subscription"&&session?.subscription)sub=await providerRequest(`subscriptions/${encodeURIComponent(session.subscription)}`);
  if(String(sub?.object)!=="subscription")return false;
  const item=sub?.items?.data?.[0],payload={user_id:uid,stripe_customer_id:String(sub.customer||session?.customer||"")||null,stripe_subscription_id:String(sub.id||"")||null,stripe_price_id:String(item?.price?.id||priceId()||"")||null,plan:"pro",status:String(sub.status||"inactive"),cancel_at_period_end:Boolean(sub.cancel_at_period_end),current_period_end:unixIso(sub.current_period_end),updated_at:new Date().toISOString()};
  await db("warboost_subscriptions?on_conflict=user_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload)});return true;
}

export async function processWebhook(raw,signatureHeader){
  checkedLiveConfig();if(!verifyWebhookSignature(raw,signatureHeader))throw Object.assign(new Error("Invalid payment webhook signature."),{status:400,code:"INVALID_WEBHOOK_SIGNATURE"});
  let event;try{event=JSON.parse(raw)}catch{throw Object.assign(new Error("Invalid webhook JSON."),{status:400,code:"INVALID_WEBHOOK_JSON"})}
  if(!event?.id||!event?.type)throw Object.assign(new Error("Invalid webhook event."),{status:400,code:"INVALID_WEBHOOK_EVENT"});
  const prior=await getBillingEvent(event.id);if(prior?.processed===true)return {ok:true,duplicate:true};if(!prior)await recordBillingEvent(event);
  const obj=event?.data?.object||{};
  if(event.type==="checkout.session.completed")await upsertSubscriptionFromProviderObject(obj,{userId:obj?.client_reference_id||obj?.metadata?.user_id,session:obj});
  else if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type))await upsertSubscriptionFromProviderObject(obj,{userId:obj?.metadata?.user_id});
  await markBillingEventProcessed(event.id);return {ok:true,processed:true};
}

export async function readRawBody(req){
  if(typeof req?.rawBody==="string")return req.rawBody;
  if(Buffer.isBuffer(req?.rawBody))return req.rawBody.toString("utf8");
  if(typeof req?.body==="string")return req.body;
  if(Buffer.isBuffer(req?.body))return req.body.toString("utf8");
  if(req?.body&&typeof req.body==="object")return JSON.stringify(req.body);
  if(!req||typeof req.on!=="function")return "";
  const chunks=[];for await (const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks).toString("utf8");
}

export function paymentWebhookSignature(req){return String(req?.headers?.["stripe-signature"]||"")}
