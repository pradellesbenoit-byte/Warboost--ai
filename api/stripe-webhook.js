import {createHmac,timingSafeEqual} from "node:crypto";

function adminHeaders(extra={}){
  const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h={apikey:secret,"Content-Type":"application/json",...extra};
  if(secret && !String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;
  return h;
}
async function adminRest(path,opts={}){
  const url=process.env.SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)throw new Error("Supabase admin non configuré.");
  return fetch(`${url}/rest/v1/${path}`,{...opts,headers:adminHeaders(opts.headers||{})});
}
function secureEq(a,b){
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
function verifyStripe(raw,header,secret){
  const parts=String(header||"").split(",").map(x=>x.trim());
  const t=parts.find(x=>x.startsWith("t="))?.slice(2);
  const sigs=parts.filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
  if(!t||!sigs.length)return false;
  if(Math.abs(Date.now()/1000-Number(t))>300)return false;
  const expected=createHmac("sha256",secret).update(`${t}.${raw}`,"utf8").digest("hex");
  return sigs.some(s=>secureEq(expected,s));
}
async function stripeGet(path){
  const key=process.env.STRIPE_SECRET_KEY;
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{headers:{Authorization:`Bearer ${key}`}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||`Stripe ${r.status}`);
  return data;
}
async function findUserByCustomer(customer){
  if(!customer)return null;
  const r=await adminRest(`warboost_subscriptions?stripe_customer_id=eq.${encodeURIComponent(customer)}&select=user_id`);
  if(!r.ok)return null;
  const rows=await r.json();
  return rows?.[0]?.user_id||null;
}
async function upsertSubscription(userId,sub){
  if(!userId||!sub)return;
  const item=sub.items?.data?.[0]||{};
  const periodEnd=sub.current_period_end||item.current_period_end||null;
  const cancelAt=Number(sub.cancel_at||0)>0?Number(sub.cancel_at):null;
  const cancellationScheduled=!!sub.cancel_at_period_end||!!cancelAt;
  const accessEnd=cancellationScheduled&&cancelAt?cancelAt:periodEnd;
  const row={
    user_id:userId,
    stripe_customer_id:String(sub.customer||"")||null,
    stripe_subscription_id:String(sub.id||"")||null,
    stripe_price_id:item.price?.id||null,
    plan:["active","trialing"].includes(String(sub.status||""))?"pro":"free",
    status:String(sub.status||"inactive"),
    // Accepte les deux représentations Stripe d'une résiliation planifiée.
    cancel_at_period_end:cancellationScheduled,
    current_period_end:accessEnd?new Date(Number(accessEnd)*1000).toISOString():null,
    updated_at:new Date().toISOString()
  };
  const r=await adminRest("warboost_subscriptions?on_conflict=user_id",{
    method:"POST",
    headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify(row)
  });
  if(!r.ok)throw new Error(`Upsert abonnement impossible (${r.status}).`);
}
async function handleSubscription(sub){
  const userId=sub.metadata?.user_id||await findUserByCustomer(sub.customer);
  if(userId)await upsertSubscription(userId,sub);
}
async function handleCheckout(session){
  const userId=session.metadata?.user_id||session.client_reference_id;
  if(!userId||!session.subscription)return;
  const sub=await stripeGet(`subscriptions/${encodeURIComponent(session.subscription)}`);
  await upsertSubscription(userId,sub);
}
export default {
  async fetch(request){
    if(request.method!=="POST")return Response.json({error:"Méthode non autorisée."},{status:405});
    try{
      const secret=process.env.STRIPE_WEBHOOK_SECRET;
      if(!secret)return Response.json({error:"Webhook Stripe non configuré."},{status:503});
      const raw=await request.text();
      const signature=request.headers.get("stripe-signature");
      if(!verifyStripe(raw,signature,secret))return Response.json({error:"Signature Stripe invalide."},{status:400});
      const event=JSON.parse(raw);
      if(event.type==="checkout.session.completed")await handleCheckout(event.data.object);
      else if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
        await handleSubscription(event.data.object);
      }
      return Response.json({received:true});
    }catch(e){
      console.error("stripe-webhook",e);
      return Response.json({error:"Erreur webhook WarBoost."},{status:500});
    }
  }
};
