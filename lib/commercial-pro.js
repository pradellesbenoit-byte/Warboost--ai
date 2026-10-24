import crypto from "node:crypto";
import {env,billingRpc,billingRow,billingError,getSubscription,billingDb} from "./billing-store.js";
import {commercialConfig,checkedTestConfig,providerRequest,verifiedProviderPrice,priceMatches,testPriceId,testProductId,billingAppUrl,stripeCheckoutUrl,stripePortalUrl,PRO_PLAN} from "./stripe-test.js";
export {commercialConfig,PRO_PLAN,getSubscription};
export const COMMERCIAL_CONSENT_VERSION="2026-10-stripe-test-v1";

export function subscriptionActive(row,now=Date.now()){
  return commercialConfig().mode==="test"&&row?.livemode===false&&row?.plan==="pro"&&row?.stripe_price_id===testPriceId()&&row?.stripe_product_id===testProductId()&&
    ["active","trialing"].includes(row?.status)&&Number.isFinite(Date.parse(row?.current_period_end))&&Date.parse(row.current_period_end)>now;
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
export async function createPortalForUser(user){
  checkedTestConfig();
  const account=await billingRow("warboost_billing_accounts","user_id",user.id);
  if(!account?.stripe_customer_id)throw billingError("BILLING_CUSTOMER_MISSING","Aucun client Stripe TEST lié à votre compte.",409);
  const session=await providerRequest("billing_portal/sessions",{method:"POST",params:{customer:account.stripe_customer_id,return_url:`${billingAppUrl()}/?billing=test-portal-return`}});
  if(!stripePortalUrl(session.url))throw billingError("BILLING_PORTAL_URL_MISSING","URL du portail Stripe TEST invalide.",502);
  return {url:session.url,test:true};
}
export function verifyWebhookSignature(raw,header,nowMs=Date.now()){
  const secret=env("STRIPE_WEBHOOK_SECRET");if(!secret)return false;
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
export async function readRawBody(req){
  if(Buffer.isBuffer(req.rawBody))return req.rawBody.toString("utf8");
  if(typeof req.rawBody==="string")return req.rawBody;
  if(typeof req.body==="string")return req.body;
  // Parsed JSON is NOT reconstructed: the signed byte representation must stay intact.
  if(req.body&&typeof req.body==="object")throw billingError("RAW_BODY_REQUIRED","Corps brut Stripe requis.",400);
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw billingError("BODY_TOO_LARGE","Corps trop volumineux.",413);chunks.push(chunk)}
  return Buffer.concat(chunks).toString("utf8");
}
export function paymentWebhookSignature(req){return String(req.headers?.["stripe-signature"]||"")}