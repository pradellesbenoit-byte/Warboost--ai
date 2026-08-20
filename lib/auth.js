function token(req){
  return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
}

function pick(...names){
  for(const name of names){
    const value=process.env[name];
    if(typeof value==="string" && value.trim()) return value.trim();
  }
  return "";
}

export async function requireUser(req){
  const access=token(req);
  if(!access)throw Object.assign(new Error("Connexion WarBoost requise"),{status:401,code:"AUTH_REQUIRED"});

  const url=pick("SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL").replace(/\/$/,"");
  const publicKey=pick(
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY"
  );

  if(!url||!publicKey){
    throw Object.assign(new Error("Authentification serveur non configurée"),{status:503,code:"AUTH_NOT_CONFIGURED"});
  }

  const r=await fetch(`${url}/auth/v1/user`,{
    headers:{
      apikey:publicKey,
      authorization:`Bearer ${access}`
    }
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok||!body?.id){
    throw Object.assign(new Error("Session WarBoost invalide ou expirée"),{status:401,code:"AUTH_INVALID"});
  }
  return body;
}
