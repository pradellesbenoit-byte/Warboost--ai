import crypto from "node:crypto";
import {env,billingRpc,billingRow,billingError,getSubscription,billingDb} from "./billing-store.js";
import {commercialConfig,checkedTestConfig,checkedLiveConfig,checkedLiveProviderConfig,providerRequest,liveProviderRequest,verifiedProviderPrice,priceMatches,testPriceId,testProductId,livePriceId,liveProductId,liveApprovedBillingCountries,billingAppUrl,stableUrl,stripeCheckoutUrl,stripePortalUrl,PRO_PLAN,COMMERCIAL_CONSENT_VERSION} from "./stripe-test.js";
export {commercialConfig,PRO_PLAN,getSubscription};

export function subscriptionActive(row,now=Date.now()){
  const idsMatch=row?.livemode===true?row?.stripe_price_id===livePriceId()&&row?.stripe_product_id===liveProductId():
    row?.livemode===false&&row?.stripe_price_id===testPriceId()&&row?.stripe_product_id===testProductId();
  return idsMatch&&row?.plan==="pro"&&
    ["active","trialing"].includes(row?.status)&&Number.isFinite(Date.parse(row?.current_period_end))&&Date.parse(row.current_period_end)>now;
}
export async function commercialStatusForUser(user){
  const sub=await getSubscription(user?.id);
  return {...commercialConfig(),active:subscriptionActive(sub),status:sub?.status||"free",subscription:sub?{plan:sub.plan,status:sub.status,cancel_at_period_end:Boolean(sub.cancel_at_period_end),current_period_end:sub.current_period_end}:null};
}
const normalizeCountry=value=>String(value||"").trim().toUpperCase();
const providerFor=mode=>mode==="live"?liveProviderRequest:providerRequest;
const testCheckoutSlot=async userId=>billingRpc("warboost_claim_checkout",{p_user_id:userId});
const liveCheckoutSlot=async userId=>billingRpc("warboost_live_claim_checkout",{p_user_id:userId});
function validateLiveConsent(consent){
  const cfg=checkedLiveConfig(),version=String(consent?.commercial_consent_version||"");
  const country=normalizeCountry(consent?.billing_country);
  if(consent?.commercial_consent_accepted!==true||version!==COMMERCIAL_CONSENT_VERSION)
    throw billingError("COMMERCIAL_CONSENT_REQUIRED","Veuillez accepter les conditions de l’abonnement avant de continuer.",428);
  if(!/^[A-Z]{2}$/.test(country)||!liveApprovedBillingCountries().includes(country))
    throw billingError("BILLING_COUNTRY_NOT_APPROVED","Le pays de facturation doit être renseigné et autorisé avant la souscription.",403);
  const terms=cfg.terms_url,privacy=cfg.privacy_url;
  if(!stableUrl(terms)||!stableUrl(privacy))throw billingError("LIVE_LEGAL_REQUIREMENTS_MISSING","Les pages légales HTTPS sont requises avant toute souscription LIVE.",503);
  return {version,terms,privacy,country};
}
export async function recordLiveConsent(user,consent){
  const consentEventId=crypto.randomUUID();
  const saved=await billingRpc("warboost_live_record_commercial_consent",{p_consent_event_id:consentEventId,
    p_user_id:user.id,p_consent_version:consent.version,
    p_terms_url:consent.terms,p_privacy_url:consent.privacy,p_billing_country:consent.country});
  if(saved!==consentEventId)throw billingError("COMMERCIAL_CONSENT_NOT_RECORDED","Le consentement n’a pas pu être enregistré.",503);
  const rows=await billingDb(`warboost_live_commercial_consents?consent_event_id=eq.${encodeURIComponent(consentEventId)}&select=*&limit=1`);
  const row=rows?.[0];
  if(row?.consent_event_id!==consentEventId||row?.user_id!==user.id||row?.consent_version!==consent.version||
     row?.billing_country!==consent.country||row?.terms_url!==consent.terms||row?.privacy_url!==consent.privacy||
     !Number.isFinite(Date.parse(row?.accepted_at||"")))
    throw billingError("COMMERCIAL_CONSENT_NOT_CONFIRMED","Le consentement commercial n’a pas été confirmé par le serveur.",409);
  return row;
}
export async function createCheckoutForUser(user,{mode=commercialConfig().mode,commercialConsent=null}={}){
  const live=mode==="live",cfg=live?checkedLiveConfig():checkedTestConfig();
  const consentInput=live?validateLiveConsent(commercialConsent):null;
  await verifiedProviderPrice(mode);
  const consent=live?await recordLiveConsent(user,consentInput):null;
  const provider=providerFor(mode),priceId=live?livePriceId():testPriceId();
  // A DB lease plus a persistent nonce works across processes, tabs and serverless instances.
  const slot=await (live?liveCheckoutSlot(user.id):testCheckoutSlot(user.id));
  if(slot.state==="blocked")throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement existe déjà. Utilisez le portail client.",409);
  if(slot.state==="busy")throw billingError("CHECKOUT_IN_PROGRESS","Une préparation est déjà en cours. Réessayez dans quelques secondes.",409);
  if(slot.state==="open"&&stripeCheckoutUrl(slot.url))return {url:slot.url,plan:{...PRO_PLAN},test:!live,live,mode};
  let customer=slot.customer_id;
  if(!customer){
    const customerParams={"metadata[warboost_user_id]":user.id};
    if(live)customerParams["address[country]"]=consent.billing_country;
    const c=await provider("customers",{method:"POST",params:customerParams,idempotencyKey:`wb-${mode}-customer-${user.id}`});
    if(c.object!=="customer"||c.livemode!==live)throw billingError("STRIPE_CUSTOMER_MODE_MISMATCH","Le client Stripe ne correspond pas au mode demandé.",502);
    customer=c.id;
    await billingRpc(live?"warboost_live_link_customer":"warboost_link_customer",{p_user_id:user.id,p_nonce:slot.nonce,p_customer_id:customer});
  }
  if(live){
    const linked=await provider(`customers/${encodeURIComponent(customer)}`);
    if(linked.id!==customer||linked.livemode!==true||normalizeCountry(linked.address?.country)!==consent.billing_country)
      throw billingError("BILLING_COUNTRY_MISMATCH","Le pays de facturation Stripe ne correspond pas au pays autorisé déclaré.",403);
  }
  const subscriptions=await provider(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
  if(subscriptions.has_more||subscriptions.data?.some(s=>!["canceled","incomplete_expired"].includes(s.status)))
    throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement Stripe existe déjà. Utilisez le portail client.",409);
  const billingMode=live?"live":"test",params={mode:"subscription","line_items[0][price]":priceId,"line_items[0][quantity]":"1",customer,
    expires_at:String(Math.floor(Date.parse(slot.expires_at)/1000)),success_url:`${billingAppUrl()}/?billing=${billingMode}-success`,
    cancel_url:`${billingAppUrl()}/?billing=${billingMode}-cancel`,client_reference_id:String(user.id),
    "metadata[user_id]":String(user.id),"subscription_data[metadata][user_id]":String(user.id)};
  if(live){
    params.billing_address_collection="required";
    params["automatic_tax[enabled]"]="true";
    params["metadata[commercial_consent_version]"]=COMMERCIAL_CONSENT_VERSION;
    params["subscription_data[metadata][commercial_consent_version]"]=COMMERCIAL_CONSENT_VERSION;
  }
  const session=await provider("checkout/sessions",{method:"POST",params,idempotencyKey:`wb-${mode}-checkout-${user.id}-${slot.nonce}`});
  if(!stripeCheckoutUrl(session.url)||session.livemode!==live)throw billingError("CHECKOUT_URL_MISSING","URL Stripe Checkout invalide pour le mode demandé.",502);
  await billingRpc(live?"warboost_live_finish_checkout":"warboost_finish_checkout",{p_user_id:user.id,p_nonce:slot.nonce,p_session_id:session.id,p_url:session.url});
  return {url:session.url,plan:{...PRO_PLAN},test:!live,live,mode,payments_enabled:cfg.live_payments_enabled===true};
}
export async function createPortalForUser(user,{mode=commercialConfig().mode}={}){
  const live=mode==="live",cfg=commercialConfig();
  if(live)checkedLiveProviderConfig();else checkedTestConfig();
  if(live&&!cfg.stable_domain)throw billingError("LIVE_APP_URL_REQUIRED","Une URL HTTPS stable est requise pour le portail LIVE.",503);
  const account=await billingRow("warboost_billing_accounts","user_id",user.id);
  const customer=account?.[live?"stripe_live_customer_id":"stripe_customer_id"];
  if(!customer)throw billingError("BILLING_CUSTOMER_MISSING",`Aucun client Stripe ${live?"LIVE":"TEST"} lié à votre compte.`,409);
  const session=await providerFor(mode)("billing_portal/sessions",{method:"POST",params:{customer,return_url:`${billingAppUrl()}/?billing=${live?"live":"test"}-portal-return`}});
  if(!stripePortalUrl(session.url)||session.livemode!==live)throw billingError("BILLING_PORTAL_URL_MISSING","URL du portail Stripe invalide pour le mode demandé.",502);
  return {url:session.url,test:!live,live,mode};
}
export function verifyWebhookSignature(raw,header,nowMs=Date.now(),mode="test"){
  const secret=mode==="live"?env("STRIPE_LIVE_WEBHOOK_SECRET"):env("STRIPE_WEBHOOK_SECRET");if(!secret)return false;
  const parts=String(header||"").split(",").map(s=>s.trim().split("="));
  const ts=Number(parts.find(([k])=>k==="t")?.[1]);
  if(!Number.isInteger(ts)||ts<=0||Math.abs(nowMs-ts*1000)>300000)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${ts}.${raw}`).digest();
  return parts.some(([k,v])=>{if(k!=="v1"||!/^[a-f0-9]{64}$/i.test(v||""))return false;return crypto.timingSafeEqual(expected,Buffer.from(v,"hex"))});
}
const supported=new Set(["checkout.session.completed","checkout.session.async_payment_succeeded","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_succeeded","invoice.payment_failed"]);
const idOf=v=>typeof v==="string"?v:v?.id||null;
function periodEnd(sub,item){const n=Number(item?.current_period_end||sub.current_period_end||sub.trial_end);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null}
export async function processWebhook(raw,signatureHeader,mode="test"){
  const live=mode==="live";
  if(live)checkedLiveProviderConfig({webhook:true});else checkedTestConfig();
  if(!verifyWebhookSignature(raw,signatureHeader,Date.now(),mode))throw billingError("INVALID_WEBHOOK_SIGNATURE","Signature Stripe invalide.",400);
  let event;try{event=JSON.parse(raw)}catch{throw billingError("INVALID_WEBHOOK_JSON","Événement invalide.",400)}
  if(!/^evt_[a-zA-Z0-9_]+$/.test(event?.id||"")||typeof event.type!=="string"||!Number.isInteger(event.created))throw billingError("INVALID_WEBHOOK_EVENT","Événement incomplet.",400);
  if(event.livemode!==live)throw billingError(live?"STRIPE_TEST_EVENT_REJECTED":"STRIPE_LIVE_EVENT_REJECTED",live?"Événement TEST refusé sur le canal LIVE.":"Événement LIVE refusé sur le canal TEST.",400);
  const obj=event.data?.object||{},customer=idOf(obj.customer),subscription=obj.object==="subscription"?obj.id:idOf(obj.subscription||obj.parent?.subscription_details?.subscription);
  const token=crypto.randomUUID();
  const prefix=live?"warboost_live_":"warboost_",ledger=live?"warboost_live_billing_events":"warboost_billing_events";
  const claim=await billingRpc(`${prefix}begin_billing_event`,{p_event_id:event.id,p_event_type:event.type,p_created:event.created,p_customer:customer,p_subscription:subscription,p_token:token});
  if(claim.state==="processed")return {ok:true,duplicate:true};
  if(claim.state==="busy")throw billingError("BILLING_EVENT_BUSY","Événement en cours, nouvelle livraison requise.",409);
  let account=null,locked=false;
  try{
    if(!supported.has(event.type)||!customer||!subscription){
       await billingRpc(`${prefix}end_billing_event`,{p_event_id:event.id,p_token:token,p_status:"ignored",p_error:null});
      return {ok:true,ignored:true};
    }
    account=await billingRow("warboost_billing_accounts",live?"stripe_live_customer_id":"stripe_customer_id",customer);
    if(!account){
      await billingRpc(`${prefix}end_billing_event`,{p_event_id:event.id,p_token:token,p_status:"ignored",p_error:"UNLINKED_CUSTOMER"});
      return {ok:true,ignored:true};
    }
    await billingDb(`${ledger}?event_id=eq.${encodeURIComponent(event.id)}&processing_token=eq.${encodeURIComponent(token)}`,{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_id:account.user_id})
    });
    locked=await billingRpc("warboost_lock_billing_account",{p_user_id:account.user_id,p_token:token});
    if(!locked)throw billingError("BILLING_ACCOUNT_BUSY","Synchronisation en cours, nouvelle livraison requise.",409);
    // Read Stripe's CURRENT state, not the delayed event snapshot; serialize per customer.
    const provider=providerFor(mode),sub=await provider(`subscriptions/${encodeURIComponent(subscription)}`);
    if(idOf(sub.customer)!==customer||(sub.metadata?.user_id&&sub.metadata.user_id!==account.user_id)||
       (obj.client_reference_id&&obj.client_reference_id!==account.user_id))
      throw billingError("BILLING_OWNER_MISMATCH","Compte de facturation incompatible.",400);
    const items=sub.items?.data||[],item=items[0];
    // The Customer address is prefilled from the buyer's own country choice
    // before hosted Checkout. It is not independent proof of the final billing
    // country. Until a signed, authoritative pre-charge country flow is stored,
    // LIVE events may reconcile status but must never grant paid PRO.
    const countryAllowed=!live;
    const expected=sub.livemode===live&&sub.items?.has_more!==true&&items.length===1&&item.quantity===1&&priceMatches(item.price,mode);
    const outcome=await billingRpc(live?"warboost_live_apply_billing_snapshot":"warboost_apply_billing_snapshot",{p_user_id:account.user_id,p_token:token,p_event_id:event.id,p_created:event.created,
      p_customer:customer,p_subscription:sub.id,p_price:item?.price?.id||null,p_product:idOf(item?.price?.product),
      p_plan:expected&&countryAllowed?"pro":"free",p_status:sub.status||"inactive",p_cancel:Boolean(sub.cancel_at_period_end),p_period_end:periodEnd(sub,item)});
    await billingRpc(`${prefix}end_billing_event`,{p_event_id:event.id,p_token:token,p_status:outcome?"processed":"ignored",p_error:null});
    return {ok:true,processed:Boolean(outcome),ignored:!outcome,access_granted:expected&&countryAllowed};
  }catch(error){
    // Only a fixed error code, never the event body, email, card data or provider message.
    try{await billingRpc(`${prefix}end_billing_event`,{p_event_id:event.id,p_token:token,p_status:"failed",p_error:error.code||"BILLING_INTERNAL_ERROR"})}catch{}
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