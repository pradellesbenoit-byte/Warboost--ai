
function env(){
  return {
    url:process.env.SUPABASE_URL,
    pub:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,
    secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}
function json(res,status,data){
  res.setHeader("Cache-Control","no-store");
  return res.status(status).json(data);
}
async function authUser(req){
  const {url,pub}=env();
  if(!url||!pub)throw new Error("Supabase public non configuré.");
  const h=req.headers?.authorization||req.headers?.Authorization||"";
  const m=String(h).match(/^Bearer\s+(.+)$/i);
  if(!m)return null;
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:pub,Authorization:`Bearer ${m[1]}`}});
  if(!r.ok)return null;
  return await r.json();
}
function adminHeaders(extra={}){
  const {secret}=env();
  const h={apikey:secret,"Content-Type":"application/json",...extra};
  if(secret && !String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;
  return h;
}
async function adminRest(path,opts={}){
  const {url,secret}=env();
  if(!url||!secret)throw new Error("SUPABASE_SECRET_KEY manquante.");
  return fetch(`${url}/rest/v1/${path}`,{...opts,headers:adminHeaders(opts.headers||{})});
}
async function getSubscription(userId){
  const r=await adminRest(`warboost_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if(!r.ok)throw new Error(`Lecture abonnement impossible (${r.status}).`);
  const rows=await r.json();
  return rows?.[0]||null;
}
function isPro(sub){return !!sub && ["active","trialing"].includes(String(sub.status||""))}
function today(){return new Date().toISOString().slice(0,10)}

async function stripeGet(path){
  const key=String(process.env.STRIPE_SECRET_KEY||"").trim();
  if(!key)return null;
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{
    headers:{Authorization:`Bearer ${key}`}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||`Stripe ${r.status}`);
  return data;
}
function stripePeriodEnd(sub){
  const item=sub?.items?.data?.[0]||{};
  return sub?.current_period_end||item?.current_period_end||null;
}
function stripeCancelAt(sub){
  const v=Number(sub?.cancel_at||0);
  return Number.isFinite(v)&&v>0?v:null;
}
function stripeCancellationScheduled(sub){
  return !!sub?.cancel_at_period_end || !!stripeCancelAt(sub);
}
async function reconcileSubscription(userId,stored){
  if(!stored?.stripe_subscription_id || !process.env.STRIPE_SECRET_KEY)return stored;
  try{
    const live=await stripeGet(`subscriptions/${encodeURIComponent(stored.stripe_subscription_id)}`);
    if(!live)return stored;
    const item=live.items?.data?.[0]||{};
    const periodEnd=stripePeriodEnd(live);
    const cancelAt=stripeCancelAt(live);
    const cancellationScheduled=stripeCancellationScheduled(live);
    const accessEnd=cancellationScheduled&&cancelAt?cancelAt:periodEnd;
    const row={
      user_id:userId,
      stripe_customer_id:String(live.customer||stored.stripe_customer_id||"")||null,
      stripe_subscription_id:String(live.id||stored.stripe_subscription_id||"")||null,
      stripe_price_id:item.price?.id||stored.stripe_price_id||null,
      plan:["active","trialing"].includes(String(live.status||""))?"pro":"free",
      status:String(live.status||"inactive"),
      // Stripe peut représenter une résiliation planifiée via cancel_at_period_end
      // ou via cancel_at selon la configuration / version d'API du portail.
      cancel_at_period_end:cancellationScheduled,
      current_period_end:accessEnd?new Date(Number(accessEnd)*1000).toISOString():null,
      updated_at:new Date().toISOString()
    };
    const changed =
      String(stored.status||"")!==row.status ||
      !!stored.cancel_at_period_end!==row.cancel_at_period_end ||
      String(stored.current_period_end||"")!==String(row.current_period_end||"") ||
      String(stored.plan||"")!==row.plan;
    if(changed){
      const wr=await adminRest("warboost_subscriptions?on_conflict=user_id",{
        method:"POST",
        headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify(row)
      });
      if(!wr.ok)console.warn("billing reconcile write",wr.status);
    }
    return {...stored,...row};
  }catch(e){
    console.warn("billing reconcile Stripe",e?.message||e);
    return stored;
  }
}

export default async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{error:"Méthode non autorisée."});
  try{
    const user=await authUser(req);
    if(!user)return json(res,401,{error:"Connexion WarBoost requise."});
    let sub=await getSubscription(user.id);
    sub=await reconcileSubscription(user.id,sub);
    const plan=isPro(sub)?"pro":"free";
    const limit=plan==="pro"?50:2;
    const day=today();
    const ur=await adminRest(`warboost_ai_usage?user_id=eq.${encodeURIComponent(user.id)}&usage_day=eq.${day}&select=used`);
    if(!ur.ok)throw new Error(`Lecture quota impossible (${ur.status}).`);
    const usage=await ur.json();
    const used=Number(usage?.[0]?.used||0);
    return json(res,200,{
      billingConfigured:!!(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PRICE_PRO_MONTHLY&&process.env.STRIPE_WEBHOOK_SECRET),
      priceLabel:process.env.STRIPE_PRO_PRICE_LABEL||"4,99 € / mois",
      plan,status:sub?.status||"inactive",customer:!!sub?.stripe_customer_id,
      cancel_at_period_end:!!sub?.cancel_at_period_end,current_period_end:sub?.current_period_end||null,
      used,limit,remaining:Math.max(0,limit-used)
    });
  }catch(e){
    console.error("billing-status",e);
    return json(res,500,{error:"Impossible de lire l'abonnement WarBoost."});
  }
}
