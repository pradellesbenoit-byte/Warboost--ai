function env(){return {url:process.env.SUPABASE_URL,pub:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY}}
function json(res,status,data){res.setHeader("Cache-Control","no-store");return res.status(status).json(data)}
async function authUser(req){const {url,pub}=env();if(!url||!pub)throw new Error("Supabase public non configuré.");const h=req.headers?.authorization||req.headers?.Authorization||"";const m=String(h).match(/^Bearer\s+(.+)$/i);if(!m)return null;const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:pub,Authorization:`Bearer ${m[1]}`}});if(!r.ok)return null;return r.json()}
function adminHeaders(extra={}){const {secret}=env();const h={apikey:secret,"Content-Type":"application/json",...extra};if(secret&&!String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;return h}
async function getSubscription(userId){const {url,secret}=env();if(!url||!secret)throw new Error("Supabase admin non configuré.");const r=await fetch(`${url}/rest/v1/warboost_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`,{headers:adminHeaders()});if(!r.ok)throw new Error(`Lecture abonnement impossible (${r.status}).`);const rows=await r.json();return rows?.[0]||null}
function isPro(sub){return !!sub&&["active","trialing"].includes(String(sub.status||""))}
function num(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null}
function toMillions(v){const n=num(v);if(!n)return null;return n>100000?n/1000000:n}
export default async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{error:"Méthode non autorisée."});
  let user;try{user=await authUser(req);if(!user)return json(res,401,{error:"Connecte ton compte WarBoost."});const sub=await getSubscription(user.id);if(!isPro(sub))return json(res,403,{error:"La recherche publique joueur est réservée à WarBoost PRO."})}catch(e){console.error("lastwar entitlement",e);return json(res,503,{error:"Vérification du compte WarBoost indisponible."})}
  const key=process.env.LASTWAR_TOOLS_API_KEY;if(!key)return json(res,503,{error:"Recherche publique non configurée. Ajoute LASTWAR_TOOLS_API_KEY dans Vercel. Le scan de captures V19 fonctionne sans cette clé."});
  const name=String(req.query?.name||"").trim();const server=String(req.query?.server_id||"").trim();if(!name||!/^\d{1,6}$/.test(server))return json(res,400,{error:"Pseudo ou serveur invalide."});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(`https://api.lastwar.tools/world/find-player?name=${encodeURIComponent(name)}&server_id=${encodeURIComponent(server)}`,{headers:{"X-API-Key":key,Accept:"application/json"},signal:controller.signal});
    const data=await r.json().catch(()=>({}));if(!r.ok)return json(res,r.status===429?429:502,{error:data?.error||data?.message||`LastWar Tools indisponible (${r.status}).`});if(!data?.found||!data?.player)return json(res,404,{error:"Joueur introuvable sur ce serveur."});
    const x=data.player;
    const player={name:x.name||name,server,alliance:x.alliance_tag||x.alliance||null,role:x.role||null,hq_level:num(x.hq_level||x.level),power_m:toMillions(x.power||x.power_value||x.player_power),coordinates:(x.x!=null&&x.y!=null)?`${x.x}, ${x.y}`:null,drone:{level:null,power_m:null},technology_pct:null,gear_pct:null,main_squad_type:null,squads:[],confidence:0.95,notes:["La recherche publique ne fournit pas les héros et équipements détaillés. Ajoute des captures pour compléter la fiche."],public_raw:{x:x.x??null,y:x.y??null,shielded:x.shielded??null}};
    return json(res,200,{player,notice:"Profil public importé. Complète-le avec le scan de captures pour les équipements, héros et statistiques détaillées."});
  }catch(e){if(e?.name==="AbortError")return json(res,504,{error:"La recherche Last War a expiré. Réessaie."});console.error("lastwar lookup",e);return json(res,500,{error:"Erreur serveur pendant la recherche publique."})}finally{clearTimeout(timeout)}
}
