function pick(...names){
  for(const name of names){
    const value=process.env[name];
    if(typeof value==="string" && value.trim()) return value.trim();
  }
  return "";
}

export default function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");

  const url=pick(
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "VITE_SUPABASE_URL"
  );

  const key=pick(
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY"
  );

  const configured=Boolean(url && key);
  const branchHost=String(process.env.VERCEL_BRANCH_URL||"").trim().replace(/^https?:\/\//i,"").replace(/\/+$/g,"");
  const recoveryRedirect=process.env.VERCEL_ENV==="preview"&&branchHost?`https://${branchHost}/reset-password.html`:"";
  const payload={
    configured,
    url: configured ? url : "",
    key: configured ? key : "",
    recovery_redirect_url:recoveryRedirect
  };

  if(String(req.query?.debug||"")==="1"){
    payload.debug={
      vercel_env:process.env.VERCEL_ENV||null,
      has_vercel_branch_url:Boolean(branchHost),
      recovery_redirect_mode:recoveryRedirect?"stable-preview-branch":"current-origin-fallback",
      has_SUPABASE_URL:Boolean(String(process.env.SUPABASE_URL||"").trim()),
      has_NEXT_PUBLIC_SUPABASE_URL:Boolean(String(process.env.NEXT_PUBLIC_SUPABASE_URL||"").trim()),
      has_VITE_SUPABASE_URL:Boolean(String(process.env.VITE_SUPABASE_URL||"").trim()),
      has_SUPABASE_ANON_KEY:Boolean(String(process.env.SUPABASE_ANON_KEY||"").trim()),
      has_SUPABASE_PUBLISHABLE_KEY:Boolean(String(process.env.SUPABASE_PUBLISHABLE_KEY||"").trim()),
      has_NEXT_PUBLIC_SUPABASE_ANON_KEY:Boolean(String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"").trim()),
      has_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:Boolean(String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"").trim()),
      has_VITE_SUPABASE_ANON_KEY:Boolean(String(process.env.VITE_SUPABASE_ANON_KEY||"").trim())
    };
  }

  return res.status(200).json(payload);
}
