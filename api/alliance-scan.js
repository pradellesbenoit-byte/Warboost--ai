function env(){
  return {url:process.env.SUPABASE_URL,pub:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY};
}
function json(res,status,data){res.setHeader("Cache-Control","no-store");return res.status(status).json(data)}
async function authUser(req){
  const {url,pub}=env();if(!url||!pub)throw new Error("Supabase public non configuré.");
  const h=req.headers?.authorization||req.headers?.Authorization||"";const m=String(h).match(/^Bearer\s+(.+)$/i);if(!m)return null;
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:pub,Authorization:`Bearer ${m[1]}`}});if(!r.ok)return null;return r.json();
}
function adminHeaders(extra={}){const {secret}=env();const h={apikey:secret,"Content-Type":"application/json",...extra};if(secret&&!String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;return h}
async function adminRest(path,opts={}){const {url,secret}=env();if(!url||!secret)throw new Error("SUPABASE_SECRET_KEY manquante.");return fetch(`${url}/rest/v1/${path}`,{...opts,headers:adminHeaders(opts.headers||{})})}
async function getSubscription(userId){const r=await adminRest(`warboost_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`);if(!r.ok)throw new Error(`Lecture abonnement impossible (${r.status}).`);const rows=await r.json();return rows?.[0]||null}
function isPro(sub){return !!sub&&["active","trialing"].includes(String(sub.status||""))}
function today(){return new Date().toISOString().slice(0,10)}
async function rpc(name,body){const r=await adminRest(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.message||data?.hint||`RPC ${name} ${r.status}`);return data}
async function reserveCredit(userId){const limit=50;const rows=await rpc("consume_warboost_ai_credit",{p_user:userId,p_day:today(),p_limit:limit});const row=Array.isArray(rows)?rows[0]:rows;const used=Number(row?.used||0);return {allowed:!!row?.allowed,plan:"pro",used,limit,remaining:Math.max(0,limit-used)}}
async function refundCredit(userId){try{await rpc("refund_warboost_ai_credit",{p_user:userId,p_day:today()})}catch(e){console.error("alliance scan quota refund",e)}}
function outputText(data){if(data?.output_text)return data.output_text;const out=[];for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&c?.text)out.push(c.text);return out.join("\n")}
function parseJson(text){const t=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```$/i,"").trim();return JSON.parse(t)}

export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Méthode non autorisée."});
  if(!process.env.OPENAI_API_KEY)return json(res,500,{error:"OPENAI_API_KEY manquante dans Vercel."});
  let user,usage;
  try{
    user=await authUser(req);if(!user)return json(res,401,{error:"Connecte ton compte WarBoost pour importer ton alliance."});
    const sub=await getSubscription(user.id);if(!isPro(sub))return json(res,403,{error:"L’import automatique d’alliance est réservé à WarBoost PRO."});
    usage=await reserveCredit(user.id);if(!usage.allowed)return json(res,429,{error:"Quota IA PRO du jour atteint.",usage});
  }catch(e){console.error("alliance scan entitlement",e);return json(res,503,{error:"Vérification du compte WarBoost indisponible."})}

  const images=Array.isArray(req.body?.images)?req.body.images:[];
  if(!images.length||images.length>6){await refundCredit(user.id);return json(res,400,{error:"Envoie entre 1 et 6 captures de la liste des membres."})}
  if(images.some(x=>typeof x!=="string"||!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(x))){await refundCredit(user.id);return json(res,400,{error:"Format d’image non accepté."})}
  if(images.reduce((n,x)=>n+x.length,0)>3900000){await refundCredit(user.id);return json(res,413,{error:"Captures trop lourdes après compression. Réessaie avec moins d’images."})}

  const content=[{type:"input_text",text:"Analyse ces captures de la liste des membres d'une alliance dans Last War: Survival. Extrais TOUS les joueurs réellement visibles. Ne complète rien de mémoire. Fusionne les doublons entre captures. Pour chaque joueur, lis le pseudo, le rang R1-R5, la puissance et le niveau QG/HQ uniquement quand ils sont visibles. Convertis la puissance en millions. Retourne uniquement le JSON demandé."}];
  for(const image_url of images)content.push({type:"input_image",image_url,detail:"high"});
  const model=process.env.OPENAI_VISION_MODEL||process.env.OPENAI_MODEL||"gpt-5";
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({model,reasoning:{effort:"minimal"},instructions:'Tu es WarBoost V19.2 Alliance 100. Réponds en JSON strict avec la structure exacte: {"alliance":{"name":string|null,"server":string|null},"players":[{"name":string,"rank":string|null,"power_m":number|null,"hq_level":number|null}],"confidence":number,"notes":[string]}. N’invente jamais une valeur. Ignore les lignes qui ne correspondent pas clairement à un joueur. rank doit être R1, R2, R3, R4 ou R5 si visible, sinon null. confidence est entre 0 et 1.',input:[{role:"user",content}],text:{format:{type:"json_object"}}})});
    const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={error:{message:raw.slice(0,500)}}}
    if(!r.ok){await refundCredit(user.id);return json(res,r.status===429?429:502,{error:data?.error?.message||"Erreur du moteur d’import alliance."})}
    let parsed;try{parsed=parseJson(outputText(data))}catch(e){await refundCredit(user.id);return json(res,502,{error:"Le scan du roster a répondu dans un format inexploitable. Réessaie avec des captures plus nettes."})}
    const players=Array.isArray(parsed?.players)?parsed.players.filter(p=>p&&p.name).slice(0,120):[];
    return json(res,200,{alliance:parsed?.alliance||{},players,confidence:parsed?.confidence||null,notes:Array.isArray(parsed?.notes)?parsed.notes:[],model,usage});
  }catch(e){await refundCredit(user.id);if(e?.name==="AbortError")return json(res,504,{error:"Le scan du roster a mis trop de temps. Réessaie avec moins de captures."});console.error("alliance scan",e);return json(res,500,{error:"Erreur serveur pendant l’import de l’alliance."})}finally{clearTimeout(timeout)}
}
