function env(name){return String(process.env[name]||"").trim()}
function enabled(name){return /^(1|true|yes|on)$/i.test(env(name))}
async function call(url,{headers={},body}={}){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);
  try{
    const r=await fetch(url,{method:"POST",signal:ctrl.signal,headers:{"content-type":"application/json",...headers},body:JSON.stringify(body||{})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(data.message||`Last War source HTTP ${r.status}`),{status:r.status});
    return data;
  }finally{clearTimeout(timeout)}
}
function officialHeaders(){
  const token=env("WARBOOST_LASTWAR_OFFICIAL_TOKEN");
  return token?{authorization:`Bearer ${token}`}:{ };
}
export function providerConfig(){
  const official=Boolean(env("WARBOOST_LASTWAR_OFFICIAL_URL"));
  const approved=Boolean(env("WARBOOST_LASTWAR_PROVIDER_URL"));
  const legacy=Boolean(env("WARBOOST_PUBLIC_LASTWAR_URL"))&&enabled("WARBOOST_ALLOW_LEGACY_PROVIDER");
  return {
    official,
    approved,
    legacy,
    authorization_status:(official||approved)?"configured":"pending",
    approval_required:true
  };
}
export async function fetchLastWarState({player_id,identity,alliance}){
  const payload={
    player_id,
    identity,
    alliance,
    consent:{granted:true,scope:"read_only_account_analysis",source:"warboost_authenticated_user"},
    requested_fields:["player","squads","heroes","exclusive_weapons","gear","drone","technology","profession","season","vs","alliance"]
  };

  // Preferred path: an official Last War / FirstFun endpoint explicitly authorized for WarBoost.
  const officialUrl=env("WARBOOST_LASTWAR_OFFICIAL_URL");
  if(officialUrl){
    const body=await call(officialUrl,{headers:{...officialHeaders(),"x-warboost-integration":"official-read-only-v1"},body:payload});
    return {provider:body.provider||"lastwar-official",kind:"official",capabilities:Array.isArray(body.capabilities)?body.capabilities:[],state:body.state||body};
  }

  // Approved partner/connector path. This must only point to a data source authorized by Last War / FirstFun.
  const trusted=env("WARBOOST_LASTWAR_PROVIDER_URL");
  if(trusted){
    const secret=env("WARBOOST_PROVIDER_SECRET");
    const body=await call(trusted,{headers:{...(secret?{"x-warboost-provider-secret":secret}:{}),"x-warboost-integration":"approved-connector-v1"},body:payload});
    return {provider:body.provider||"warboost-approved-connector",kind:"approved",capabilities:Array.isArray(body.capabilities)?body.capabilities:[],state:body.state||body};
  }

  // Backward compatibility only. Disabled by default so WarBoost never silently relies on an unapproved source.
  const publicUrl=env("WARBOOST_PUBLIC_LASTWAR_URL");
  if(publicUrl&&enabled("WARBOOST_ALLOW_LEGACY_PROVIDER")){
    const body=await call(publicUrl,{body:payload});
    return {provider:body.provider||"legacy-public-source",kind:"legacy",capabilities:Array.isArray(body.capabilities)?body.capabilities:[],state:body.state||body};
  }

  throw Object.assign(new Error("Official Last War data access is not configured yet. WarBoost Scan and cloud data remain available."),{code:"PROVIDER_NOT_CONNECTED"});
}
