

function checkedEnv(name,value,{prefixes=[]}={}){
  const v=String(value||"").trim();
  if(!v)throw new Error(`${name} manquante.`);
  const bad=[...v].find(ch=>ch.codePointAt(0)>127);
  if(bad){
    throw new Error(`${name} invalide : contient un caractère masqué/non ASCII. Recopie la valeur complète depuis le tableau de bord, sans points ••• ni espaces.`);
  }
  if(/\s/.test(v))throw new Error(`${name} invalide : contient un espace ou un retour à la ligne.`);
  if(prefixes.length && !prefixes.some(x=>v.startsWith(x))){
    throw new Error(`${name} invalide : préfixe inattendu.`);
  }
  return v;
}

function env(){
  return {
    url:process.env.SUPABASE_URL,
    pub:checkedEnv("SUPABASE_PUBLISHABLE_KEY",process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,{prefixes:["sb_publishable_","eyJ"]}),
    secret:checkedEnv("SUPABASE_SECRET_KEY",process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{prefixes:["sb_secret_","eyJ"]})
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

async function stripePost(path,params){
  const key=checkedEnv("STRIPE_SECRET_KEY",process.env.STRIPE_SECRET_KEY,{prefixes:["sk_test_","sk_live_"]});
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{
    method:"POST",
    headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams(params).toString()
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||`Stripe ${r.status}`);
  return data;
}
export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Méthode non autorisée."});
  try{
    const user=await authUser(req);
    if(!user)return json(res,401,{error:"Connexion WarBoost requise."});
    const price=checkedEnv("STRIPE_PRICE_PRO_MONTHLY",process.env.STRIPE_PRICE_PRO_MONTHLY,{prefixes:["price_"]});
    const sub=await getSubscription(user.id);
    if(isPro(sub))return json(res,409,{error:"Ton abonnement PRO est déjà actif."});
    const appUrl=(process.env.APP_URL||"https://warboost.fr").replace(/\/+$/,"");
    const p={
      mode:"subscription",
      "line_items[0][price]":price,
      "line_items[0][quantity]":"1",
      success_url:`${appUrl}/?billing=success`,
      cancel_url:`${appUrl}/?billing=cancel`,
      allow_promotion_codes:"true",
      client_reference_id:user.id,
      "metadata[user_id]":user.id,
      "subscription_data[metadata][user_id]":user.id
    };
    if(sub?.stripe_customer_id)p.customer=sub.stripe_customer_id;
    else if(user.email)p.customer_email=user.email;
    const session=await stripePost("checkout/sessions",p);
    return json(res,200,{url:session.url});
  }catch(e){
    console.error("checkout",e);
    return json(res,500,{error:e.message||"Impossible d'ouvrir Stripe Checkout."});
  }
}
