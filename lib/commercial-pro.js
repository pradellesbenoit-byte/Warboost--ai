import crypto from "node:crypto";
import {env,billingRpc,billingRow,billingError,getSubscription as getTestSubscription,billingDb,billingDatabaseConfigured} from "./billing-store.js";
import {commercialConfig,checkedTestConfig,checkedLiveConfig,checkedLiveOperationsConfig,providerRequest,liveProviderRequest,
  verifiedProviderPrice,verifiedLiveProviderPrice,priceMatches,testPriceId,testProductId,livePriceId,billingAppUrl,
  liveBillingAppUrl,stripeCheckoutUrl,stripePortalUrl,PRO_PLAN,LIVE_PRO_PRICE_ID,LIVE_PRO_PRODUCT_ID,
  managedPaymentsProductEligible} from "./stripe-test.js";
export {commercialConfig,PRO_PLAN};
export const COMMERCIAL_CONSENT_VERSION="2026-10-stripe-test-v1";
export const LIVE_COMMERCIAL_CONSENT_VERSION="2026-11-pro-live-managed-payments-v1";

export async function getSubscription(userId){
  if(!userId||!billingDatabaseConfigured())return null;
  if(commercialConfig().mode==="live"){
    try{return await billingRow("warboost_live_subscriptions","user_id",userId)}
    catch(e){if(e.code==="COMMERCIAL_SCHEMA_MISSING")return null;throw e}
  }
  return getTestSubscription(userId);
}
export function subscriptionActive(row,now=Date.now()){
  const mode=commercialConfig().mode,periodEnd=Date.parse(row?.current_period_end);
  if(row?.plan!=="pro"||!Number.isFinite(periodEnd)||periodEnd<=now)return false;
  if(mode==="test")return row?.livemode===false&&row?.stripe_price_id===testPriceId()&&row?.stripe_product_id===testProductId()&&
    ["active","trialing"].includes(row?.status);
  if(mode==="live")return row?.livemode===true&&row?.stripe_price_id===LIVE_PRO_PRICE_ID&&row?.stripe_product_id===LIVE_PRO_PRODUCT_ID&&row?.status==="active";
  return false;
}
export async function commercialStatusForUser(user){
  const sub=await getSubscription(user?.id);
  return {...commercialConfig(),active:subscriptionActive(sub),status:sub?.status||"free",subscription:sub?{plan:sub.plan,status:sub.status,cancel_at_period_end:Boolean(sub.cancel_at_period_end),current_period_end:sub.current_period_end}:null};
}
export async function createCheckoutForUser(user){
  const cfg=checkedTestConfig();
  await verifiedProviderPrice();
  // A DB lease plus a persistent nonce works across processes, tabs and serverless instances.
  const slot=await billingRpc("warboost_claim_checkout",{p_user_id:user.id});
  if(slot.state==="blocked")throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement existe déjà. Utilisez le portail client.",409);
  if(slot.state==="busy")throw billingError("CHECKOUT_IN_PROGRESS","Une préparation est déjà en cours. Réessayez dans quelques secondes.",409);
  if(slot.state==="open"&&stripeCheckoutUrl(slot.url))return {url:slot.url,plan:{...PRO_PLAN},test:true};
  let customer=slot.customer_id;
  if(!customer){
    const c=await providerRequest("customers",{method:"POST",params:{"metadata[warboost_user_id]":user.id},idempotencyKey:`wb-test-customer-${user.id}`});
    customer=c.id;
    await billingRpc("warboost_link_customer",{p_user_id:user.id,p_nonce:slot.nonce,p_customer_id:customer});
  }
  const subscriptions=await providerRequest(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
  if(subscriptions.has_more||subscriptions.data?.some(s=>!["canceled","incomplete_expired"].includes(s.status)))
    throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement Stripe existe déjà. Utilisez le portail client.",409);
  const params={mode:"subscription","line_items[0][price]":testPriceId(),"line_items[0][quantity]":"1",customer,
    expires_at:String(Math.floor(Date.parse(slot.expires_at)/1000)),success_url:`${billingAppUrl()}/?billing=test-success`,
    cancel_url:`${billingAppUrl()}/?billing=test-cancel`,client_reference_id:String(user.id),
    "metadata[user_id]":String(user.id),"subscription_data[metadata][user_id]":String(user.id)};
  const session=await providerRequest("checkout/sessions",{method:"POST",params,idempotencyKey:`wb-test-checkout-${user.id}-${slot.nonce}`});
  if(!stripeCheckoutUrl(session.url))throw billingError("CHECKOUT_URL_MISSING","URL Stripe Checkout TEST invalide.",502);
  await billingRpc("warboost_finish_checkout",{p_user_id:user.id,p_nonce:slot.nonce,p_session_id:session.id,p_url:session.url});
  return {url:session.url,plan:{...PRO_PLAN},test:true,payments_enabled:cfg.payments_enabled};
}
export async function createLiveCheckoutForUser(user,{consentVersion=""}={}){
  if(!user?.id)throw billingError("AUTH_REQUIRED","Connexion requise.",401);
  const cfg=checkedLiveConfig();
  if(consentVersion!==LIVE_COMMERCIAL_CONSENT_VERSION)
    throw billingError("COMMERCIAL_CONSENT_REQUIRED","Confirmez le prix et le renouvellement mensuel avant de continuer.",428);
  await verifiedLiveProviderPrice();
  const oldTest=await getTestSubscription(user.id);
  if(oldTest?.stripe_subscription_id&&!["canceled","incomplete_expired","inactive","free"].includes(oldTest.status))
    throw billingError("LEGACY_SUBSCRIPTION_REVIEW_REQUIRED","Un abonnement historique doit être vérifié avant une souscription LIVE.",409);
  const linked=await billingRow("warboost_live_billing_accounts","user_id",user.id);
  const existing=await billingRow("warboost_live_subscriptions","user_id",user.id);
  if(existing?.stripe_subscription_id&&!["canceled","incomplete_expired","inactive","free"].includes(existing.status))
    throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement LIVE existe déjà. Utilisez le portail client.",409);
  if(linked?.stripe_customer_id){
    const customer=await liveProviderRequest(`customers/${encodeURIComponent(linked.stripe_customer_id)}`);
    if(customer.id!==linked.stripe_customer_id||customer.metadata?.warboost_user_id!==user.id)
      throw billingError("BILLING_OWNER_MISMATCH","Le client Stripe LIVE n’appartient pas à ce compte.",400);
    const subscriptions=await liveProviderRequest(`subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=100`);
    if(subscriptions.has_more||subscriptions.data?.some(s=>!["canceled","incomplete_expired"].includes(s.status)))
      throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement LIVE existe déjà. Utilisez le portail client.",409);
  }
  const slot=await billingRpc("warboost_live_claim_checkout",{p_user_id:user.id});
  if(slot.state==="blocked")throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement LIVE existe déjà. Utilisez le portail client.",409);
  if(slot.state==="busy")throw billingError("CHECKOUT_IN_PROGRESS","Une préparation est déjà en cours. Réessayez dans quelques secondes.",409);
  if(slot.state==="open"&&stripeCheckoutUrl(slot.url))return {url:slot.url,plan:{...PRO_PLAN},live:true,payments_enabled:cfg.live_payments_enabled};
  await billingRpc("warboost_live_record_consent",{p_user_id:user.id,p_version:LIVE_COMMERCIAL_CONSENT_VERSION,
    p_price:LIVE_PRO_PRICE_ID,p_terms:env("WARBOOST_LIVE_TERMS_URL"),p_privacy:env("WARBOOST_LIVE_PRIVACY_URL")});
  let customer=slot.customer_id||linked?.stripe_customer_id;
  if(!customer){
    const created=await liveProviderRequest("customers",{method:"POST",params:{"metadata[warboost_user_id]":user.id},
      idempotencyKey:`wb-live-customer-${user.id}`});
    customer=created.id;
    await billingRpc("warboost_live_link_customer",{p_user_id:user.id,p_nonce:slot.nonce,p_customer_id:customer});
  }
  const subscriptions=await liveProviderRequest(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
  if(subscriptions.has_more||subscriptions.data?.some(s=>!["canceled","incomplete_expired"].includes(s.status)))
    throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement LIVE existe déjà. Utilisez le portail client.",409);
  const base=liveBillingAppUrl();
  const params={mode:"subscription",locale:"auto","managed_payments[enabled]":"true",
    "line_items[0][price]":livePriceId(),"line_items[0][quantity]":"1",customer,billing_address_collection:"required",
    expires_at:String(Math.floor(Date.parse(slot.expires_at)/1000)),
    success_url:`${base}/?billing=live-success`,cancel_url:`${base}/?billing=live-cancel`,
    client_reference_id:String(user.id),"metadata[user_id]":String(user.id),
    "metadata[warboost_checkout_model]":"managed_payments","metadata[consent_version]":LIVE_COMMERCIAL_CONSENT_VERSION,
    "subscription_data[metadata][user_id]":String(user.id),
    "subscription_data[metadata][warboost_checkout_model]":"managed_payments",
    "subscription_data[metadata][consent_version]":LIVE_COMMERCIAL_CONSENT_VERSION};
  const session=await liveProviderRequest("checkout/sessions",{method:"POST",params,idempotencyKey:`wb-live-checkout-${user.id}-${slot.nonce}`});
  if(!stripeCheckoutUrl(session.url))throw billingError("CHECKOUT_URL_MISSING","URL Stripe Checkout LIVE invalide.",502);
  await billingRpc("warboost_live_finish_checkout",{p_user_id:user.id,p_nonce:slot.nonce,p_session_id:session.id,p_url:session.url});
  return {url:session.url,plan:{...PRO_PLAN},live:true,payments_enabled:cfg.live_payments_enabled};
}
export async function createPortalForUser(user){
  checkedTestConfig();
  const account=await billingRow("warboost_billing_accounts","user_id",user.id);
  if(!account?.stripe_customer_id)throw billingError("BILLING_CUSTOMER_MISSING","Aucun client Stripe TEST lié à votre compte.",409);
  const session=await providerRequest("billing_portal/sessions",{method:"POST",params:{customer:account.stripe_customer_id,return_url:`${billingAppUrl()}/?billing=test-portal-return`}});
  if(!stripePortalUrl(session.url))throw billingError("BILLING_PORTAL_URL_MISSING","URL du portail Stripe TEST invalide.",502);
  return {url:session.url,test:true};
}
export async function createLivePortalForUser(user){
  checkedLiveOperationsConfig();
  const account=await billingRow("warboost_live_billing_accounts","user_id",user.id);
  if(!account?.stripe_customer_id)throw billingError("BILLING_CUSTOMER_MISSING","Aucun client Stripe LIVE lié à votre compte.",409);
  const session=await liveProviderRequest("billing_portal/sessions",{method:"POST",
    params:{customer:account.stripe_customer_id,return_url:`${liveBillingAppUrl()}/?billing=live-portal-return`},operation:"portal"});
  if(!stripePortalUrl(session.url))throw billingError("BILLING_PORTAL_URL_MISSING","URL du portail Stripe LIVE invalide.",502);
  return {url:session.url,live:true};
}
export function verifyWebhookSignature(raw,header,nowMs=Date.now(),mode="test"){
  const secret=env(mode==="live"?"STRIPE_LIVE_WEBHOOK_SECRET":"STRIPE_WEBHOOK_SECRET");if(!secret)return false;
  const parts=String(header||"").split(",").map(s=>s.trim().split("="));
  const ts=Number(parts.find(([k])=>k==="t")?.[1]);
  if(!Number.isInteger(ts)||ts<=0||Math.abs(nowMs-ts*1000)>300000)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${ts}.${raw}`).digest();
  return parts.some(([k,v])=>{if(k!=="v1"||!/^[a-f0-9]{64}$/i.test(v||""))return false;return crypto.timingSafeEqual(expected,Buffer.from(v,"hex"))});
}
const supported=new Set(["checkout.session.completed","checkout.session.async_payment_succeeded","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_succeeded","invoice.payment_failed"]);
const idOf=v=>typeof v==="string"?v:v?.id||null;
function periodEnd(sub,item){const n=Number(item?.current_period_end||sub.current_period_end||sub.trial_end);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null}
export async function processWebhook(raw,signatureHeader){
  checkedTestConfig();
  if(!verifyWebhookSignature(raw,signatureHeader))throw billingError("INVALID_WEBHOOK_SIGNATURE","Signature Stripe invalide.",400);
  let event;try{event=JSON.parse(raw)}catch{throw billingError("INVALID_WEBHOOK_JSON","Événement invalide.",400)}
  if(!/^evt_[a-zA-Z0-9_]+$/.test(event?.id||"")||typeof event.type!=="string"||!Number.isInteger(event.created))throw billingError("INVALID_WEBHOOK_EVENT","Événement incomplet.",400);
  if(event.livemode!==false)throw billingError("STRIPE_LIVE_EVENT_REJECTED","Événement live refusé.",400);
  const obj=event.data?.object||{},customer=idOf(obj.customer),subscription=obj.object==="subscription"?obj.id:idOf(obj.subscription||obj.parent?.subscription_details?.subscription);
  const token=crypto.randomUUID();
  const claim=await billingRpc("warboost_begin_billing_event",{p_event_id:event.id,p_event_type:event.type,p_created:event.created,p_customer:customer,p_subscription:subscription,p_token:token});
  if(claim.state==="processed")return {ok:true,duplicate:true};
  if(claim.state==="busy")throw billingError("BILLING_EVENT_BUSY","Événement en cours, nouvelle livraison requise.",409);
  let account=null,locked=false;
  try{
    if(!supported.has(event.type)||!customer||!subscription){
      await billingRpc("warboost_end_billing_event",{p_event_id:event.id,p_token:token,p_status:"ignored",p_error:null});
      return {ok:true,ignored:true};
    }
    account=await billingRow("warboost_billing_accounts","stripe_customer_id",customer);
    if(!account){
      await billingRpc("warboost_end_billing_event",{p_event_id:event.id,p_token:token,p_status:"ignored",p_error:"UNLINKED_CUSTOMER"});
      return {ok:true,ignored:true};
    }
    await billingDb(`warboost_billing_events?event_id=eq.${encodeURIComponent(event.id)}&processing_token=eq.${encodeURIComponent(token)}`,{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:account.user_id})
    });
    locked=await billingRpc("warboost_lock_billing_account",{p_user_id:account.user_id,p_token:token});
    if(!locked)throw billingError("BILLING_ACCOUNT_BUSY","Synchronisation en cours, nouvelle livraison requise.",409);
    // Read Stripe's CURRENT state, not the delayed event snapshot; serialize per customer.
    const sub=await providerRequest(`subscriptions/${encodeURIComponent(subscription)}`);
    if(idOf(sub.customer)!==customer||(sub.metadata?.user_id&&sub.metadata.user_id!==account.user_id)||
       (obj.client_reference_id&&obj.client_reference_id!==account.user_id))
      throw billingError("BILLING_OWNER_MISMATCH","Compte de facturation incompatible.",400);
    const items=sub.items?.data||[],item=items[0];
    const expected=sub.items?.has_more!==true&&items.length===1&&item.quantity===1&&priceMatches(item.price);
    const outcome=await billingRpc("warboost_apply_billing_snapshot",{p_user_id:account.user_id,p_token:token,p_event_id:event.id,p_created:event.created,
      p_customer:customer,p_subscription:sub.id,p_price:item?.price?.id||null,p_product:idOf(item?.price?.product),
      p_plan:expected?"pro":"free",p_status:sub.status||"inactive",p_cancel:Boolean(sub.cancel_at_period_end),p_period_end:periodEnd(sub,item)});
    await billingRpc("warboost_end_billing_event",{p_event_id:event.id,p_token:token,p_status:outcome?"processed":"ignored",p_error:null});
    return {ok:true,processed:Boolean(outcome),ignored:!outcome};
  }catch(error){
    // Only a fixed error code, never the event body, email, card data or provider message.
    try{await billingRpc("warboost_end_billing_event",{p_event_id:event.id,p_token:token,p_status:"failed",p_error:error.code||"BILLING_INTERNAL_ERROR"})}catch{}
    throw error;
  }finally{
    if(locked)try{await billingRpc("warboost_unlock_billing_account",{p_user_id:account.user_id,p_token:token})}catch{}
  }
}
export async function processLiveWebhook(raw,signatureHeader){
  checkedLiveOperationsConfig({webhook:true});
  if(!verifyWebhookSignature(raw,signatureHeader,Date.now(),"live"))
    throw billingError("INVALID_WEBHOOK_SIGNATURE","Signature Stripe LIVE invalide.",400);
  let event;try{event=JSON.parse(raw)}catch{throw billingError("INVALID_WEBHOOK_JSON","Événement Stripe LIVE invalide.",400)}
  if(!/^evt_[a-zA-Z0-9_]+$/.test(event?.id||"")||typeof event.type!=="string"||!Number.isInteger(event.created))
    throw billingError("INVALID_WEBHOOK_EVENT","Événement LIVE incomplet.",400);
  if(event.livemode!==true)throw billingError("STRIPE_TEST_EVENT_REJECTED","Événement TEST refusé sur le webhook LIVE.",400);
  const obj=event.data?.object||{},customer=idOf(obj.customer),subscription=obj.object==="subscription"?obj.id:
    idOf(obj.subscription||obj.parent?.subscription_details?.subscription),token=crypto.randomUUID();
  const claim=await billingRpc("warboost_live_begin_billing_event",{p_event_id:event.id,p_event_type:event.type,
    p_created:event.created,p_customer:customer,p_subscription:subscription,p_token:token});
  if(claim.state==="processed")return {ok:true,duplicate:true};
  if(claim.state==="busy")throw billingError("BILLING_EVENT_BUSY","Événement LIVE en cours, nouvelle livraison requise.",409);
  let account=null,locked=false;
  try{
    if(!supported.has(event.type)||!customer||!subscription){
      await billingRpc("warboost_live_end_billing_event",{p_event_id:event.id,p_token:token,p_status:"ignored",p_error:null});
      return {ok:true,ignored:true};
    }
    account=await billingRow("warboost_live_billing_accounts","stripe_customer_id",customer);
    if(!account){
      await billingRpc("warboost_live_end_billing_event",{p_event_id:event.id,p_token:token,p_status:"ignored",p_error:"UNLINKED_CUSTOMER"});
      return {ok:true,ignored:true};
    }
    await billingDb(`warboost_live_billing_events?event_id=eq.${encodeURIComponent(event.id)}&processing_token=eq.${encodeURIComponent(token)}`,{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:account.user_id})
    });
    locked=await billingRpc("warboost_live_lock_billing_account",{p_user_id:account.user_id,p_token:token});
    if(!locked)throw billingError("BILLING_ACCOUNT_BUSY","Synchronisation LIVE en cours, nouvelle livraison requise.",409);
    const sub=await liveProviderRequest(`subscriptions/${encodeURIComponent(subscription)}`,{operation:"webhook"});
    if(idOf(sub.customer)!==customer||(sub.metadata?.user_id&&sub.metadata.user_id!==account.user_id)||
      (obj.client_reference_id&&obj.client_reference_id!==account.user_id))
      throw billingError("BILLING_OWNER_MISMATCH","Compte de facturation LIVE incompatible.",400);
    const items=sub.items?.data||[],item=items[0],productId=idOf(item?.price?.product);
    const product=productId?await liveProviderRequest(`products/${encodeURIComponent(productId)}`,{operation:"webhook"}):null;
    const prior=await billingRow("warboost_live_subscriptions","user_id",account.user_id);
    const modelVerified=sub.metadata?.warboost_checkout_model==="managed_payments";
    const alreadyLinked=prior?.stripe_subscription_id===sub.id&&prior?.plan==="pro";
    const valid=sub.livemode===true&&sub.status==="active"&&(modelVerified||alreadyLinked)&&
      managedPaymentsProductEligible(product)&&sub.items?.has_more!==true&&items.length===1&&item.quantity===1&&
      priceMatches(item.price,"live")&&item.price.tax_behavior==="inclusive";
    const outcome=await billingRpc("warboost_live_apply_billing_snapshot",{p_user_id:account.user_id,p_token:token,
      p_event_id:event.id,p_created:event.created,p_customer:customer,p_subscription:sub.id,
      p_price:item?.price?.id||null,p_product:productId,p_plan:valid?"pro":"free",p_status:sub.status||"inactive",
      p_cancel:Boolean(sub.cancel_at_period_end),p_period_end:periodEnd(sub,item)});
    await billingRpc("warboost_live_end_billing_event",{p_event_id:event.id,p_token:token,
      p_status:outcome?"processed":"ignored",p_error:null});
    return {ok:true,processed:Boolean(outcome),ignored:!outcome};
  }catch(error){
    try{await billingRpc("warboost_live_end_billing_event",{p_event_id:event.id,p_token:token,
      p_status:"failed",p_error:error.code||"BILLING_INTERNAL_ERROR"})}catch{}
    throw error;
  }finally{
    if(locked)try{await billingRpc("warboost_live_unlock_billing_account",{p_user_id:account.user_id,p_token:token})}catch{}
  }
}
const MAX_BILLING_BODY_BYTES=1024*1024;
function boundedRawText(value){
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(String(value));
  if(bytes.byteLength>MAX_BILLING_BODY_BYTES)throw billingError("BODY_TOO_LARGE","Corps trop volumineux.",413);
  return bytes.toString("utf8");
}
function parseJsonBody(raw){
  try{
    const value=JSON.parse(raw);
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  }catch{return {}}
}
export async function readJsonRequestBody(req){
  if(Buffer.isBuffer(req?.rawBody))return parseJsonBody(boundedRawText(req.rawBody));
  if(typeof req?.rawBody==="string")return parseJsonBody(boundedRawText(req.rawBody));
  // This is for authenticated application JSON only, never the signed webhook route.
  const parsed=req?.body;
  if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)&&!Buffer.isBuffer(parsed)){
    let serialized;
    try{serialized=JSON.stringify(parsed)}catch{throw billingError("INVALID_JSON_BODY","Requête JSON invalide.",400)}
    if(typeof serialized==="string"&&Buffer.byteLength(serialized)>MAX_BILLING_BODY_BYTES)
      throw billingError("BODY_TOO_LARGE","Corps trop volumineux.",413);
    return parsed;
  }
  if(typeof parsed==="string")return parseJsonBody(boundedRawText(parsed));
  return parseJsonBody(await readRawBody(req));
}
export async function readRawBody(req){
  if(Buffer.isBuffer(req?.rawBody))return boundedRawText(req.rawBody);
  if(typeof req?.rawBody==="string")return boundedRawText(req.rawBody);
  // Drain the original stream before consulting any lazy parsed-body getter.
  const chunks=[];let size=0;
  if(typeof req?.[Symbol.asyncIterator]==="function"){
    for await(const chunk of req){
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      size+=bytes.byteLength;
      if(size>MAX_BILLING_BODY_BYTES)throw billingError("BODY_TOO_LARGE","Corps trop volumineux.",413);
      chunks.push(bytes);
    }
  }
  if(size)return Buffer.concat(chunks,size).toString("utf8");
  // A raw text body can preserve exact UTF-8 bytes; a parsed object cannot prove a signature.
  const body=req?.body;
  if(typeof body==="string")return boundedRawText(body);
  if(body&&typeof body==="object")throw billingError("RAW_BODY_REQUIRED","Corps brut Stripe requis.",400);
  return "";
}
export function paymentWebhookSignature(req){return String(req.headers?.["stripe-signature"]||"")}