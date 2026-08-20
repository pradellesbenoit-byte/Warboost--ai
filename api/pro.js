import {requireUser} from "../lib/auth.js";

const stripeKey=()=>String(process.env.STRIPE_SECRET_KEY||"").trim();
const priceId=()=>String(process.env.STRIPE_PRO_PRICE_ID||process.env.STRIPE_PRICE_ID_PRO||process.env.STRIPE_PRICE_ID||"").trim();

function origin(req){
  const explicit=String(process.env.WARBOOST_APP_URL||"").trim().replace(/\/$/,"");
  if(explicit)return explicit;
  const proto=String(req.headers?.["x-forwarded-proto"]||"https").split(",")[0].trim();
  const host=String(req.headers?.["x-forwarded-host"]||req.headers?.host||"warboost.fr").split(",")[0].trim();
  return `${proto}://${host}`;
}
function form(data){
  const p=new URLSearchParams();
  Object.entries(data).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=="")p.append(k,String(v))});
  return p;
}
async function stripe(path,{method="GET",body}={}){
  const key=stripeKey();
  if(!key)throw Object.assign(new Error("Stripe n'est pas configuré sur le serveur."),{status:503,code:"STRIPE_NOT_CONFIGURED"});
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{
    method,
    headers:{Authorization:`Bearer ${key}`,...(body?{"Content-Type":"application/x-www-form-urlencoded"}:{})},
    body:body?form(body):undefined
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j?.error?.message||`Stripe HTTP ${r.status}`),{status:r.status,code:j?.error?.code||"STRIPE_ERROR"});
  return j;
}
async function findCustomer(email){
  const q=new URLSearchParams({email:String(email||""),limit:"10"});
  const list=await stripe(`customers?${q.toString()}`);
  return list?.data?.find(c=>!c.deleted)||null;
}
async function ensureCustomer(user){
  let c=await findCustomer(user.email);
  if(c)return c;
  return stripe("customers",{method:"POST",body:{email:user.email,"metadata[warboost_user_id]":user.id}});
}
async function subscriptionStatus(customerId){
  if(!customerId)return {active:false,status:"free",subscription:null};
  const q=new URLSearchParams({customer:customerId,status:"all",limit:"20"});
  const list=await stripe(`subscriptions?${q.toString()}`);
  const subs=Array.isArray(list?.data)?list.data:[];
  const current=subs.sort((a,b)=>(b.created||0)-(a.created||0)).find(s=>["active","trialing","past_due","unpaid","paused"].includes(s.status))||subs[0]||null;
  return {active:Boolean(current&&["active","trialing"].includes(current.status)),status:current?.status||"free",subscription:current};
}
async function planInfo(){
  const pid=priceId();
  if(!pid)return null;
  try{
    const p=await stripe(`prices/${encodeURIComponent(pid)}?expand%5B%5D=product`);
    return {id:p.id,amount:p.unit_amount??null,currency:p.currency||"eur",interval:p.recurring?.interval||null,name:typeof p.product==="object"?p.product?.name||"WarBoost PRO":"WarBoost PRO"};
  }catch{return {id:pid,amount:null,currency:"eur",interval:null,name:"WarBoost PRO"}}
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");

  // Diagnostic public sûr : ne renvoie jamais les valeurs secrètes.
  if(req.method==="GET" && String(req.query?.debug||"")==="1"){
    const key=stripeKey();
    const pid=priceId();
    const out={
      ok:true,
      env:{
        has_stripe_secret_key:Boolean(key),
        stripe_key_mode:key.startsWith("sk_test_")?"test":key.startsWith("sk_live_")?"live":key?"unknown":"missing",
        has_pro_price_id:Boolean(pid),
        price_id_format:pid.startsWith("price_")?"price":"invalid"
      },
      stripe:{reachable:false,http_status:null,error_code:null,message:null},
      configured:false
    };
    if(!key||!pid){
      out.stripe.message=!key?"STRIPE_SECRET_KEY absente":"STRIPE_PRO_PRICE_ID absent";
      return res.status(200).json(out);
    }
    try{
      const r=await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(pid)}`,{headers:{Authorization:`Bearer ${key}`}});
      const j=await r.json().catch(()=>({}));
      out.stripe.reachable=true;
      out.stripe.http_status=r.status;
      if(r.ok){
        out.configured=true;
        out.stripe.price_active=j?.active!==false;
        out.stripe.currency=j?.currency||null;
        out.stripe.interval=j?.recurring?.interval||null;
      }else{
        out.stripe.error_code=j?.error?.code||j?.error?.type||"stripe_error";
        out.stripe.message=j?.error?.message||`Stripe HTTP ${r.status}`;
      }
    }catch(e){
      out.stripe.message="Connexion Stripe impossible";
    }
    return res.status(200).json(out);
  }

  try{
    const user=await requireUser(req);
    const configured=Boolean(stripeKey()&&priceId());
    if(req.method==="GET"){
      if(!stripeKey())return res.status(200).json({ok:true,configured:false,active:false,status:"free",plan:null});
      const customer=await findCustomer(user.email);
      const sub=await subscriptionStatus(customer?.id);
      return res.status(200).json({ok:true,configured,active:sub.active,status:sub.status,customer_id:customer?.id||null,plan:await planInfo()});
    }
    if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
    const action=String(req.query?.action||req.body?.action||"").toLowerCase();
    if(!configured)throw Object.assign(new Error("La formule PRO n'est pas encore reliée à un prix Stripe."),{status:503,code:"PRO_NOT_CONFIGURED"});
    const customer=await ensureCustomer(user);
    if(action==="checkout"){
      const base=origin(req);
      const session=await stripe("checkout/sessions",{method:"POST",body:{
        mode:"subscription",customer:customer.id,
        "line_items[0][price]":priceId(),"line_items[0][quantity]":"1",
        success_url:`${base}/?pro=success`,cancel_url:`${base}/?pro=cancel`,
        allow_promotion_codes:"true",client_reference_id:user.id,
        "metadata[warboost_user_id]":user.id,"subscription_data[metadata][warboost_user_id]":user.id
      }});
      return res.status(200).json({ok:true,url:session.url});
    }
    if(action==="portal"){
      const session=await stripe("billing_portal/sessions",{method:"POST",body:{customer:customer.id,return_url:`${origin(req)}/`}});
      return res.status(200).json({ok:true,url:session.url});
    }
    return res.status(400).json({error:"unknown_action"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"pro_error",message:e.message})}
}
