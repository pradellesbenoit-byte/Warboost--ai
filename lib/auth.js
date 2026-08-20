function token(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
export async function requireUser(req){
  const access=token(req);if(!access)throw Object.assign(new Error("Connexion WarBoost requise"),{status:401,code:"AUTH_REQUIRED"});
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");const anon=String(process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"");
  if(!url||!anon)throw Object.assign(new Error("Authentification serveur non configurée"),{status:503,code:"AUTH_NOT_CONFIGURED"});
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,authorization:`Bearer ${access}`}});const body=await r.json().catch(()=>({}));if(!r.ok||!body?.id)throw Object.assign(new Error("Session WarBoost invalide ou expirée"),{status:401,code:"AUTH_INVALID"});return body
}
