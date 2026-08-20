export async function fetchLastWarState({player_id,identity,alliance}){
  const url=String(process.env.WARBOOST_LASTWAR_PROVIDER_URL||"").trim();
  if(!url)throw Object.assign(new Error("Aucune source Last War automatique compatible n'est connectée."),{code:"PROVIDER_NOT_CONNECTED"});
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),8000);
  try{
    const r=await fetch(url,{method:"POST",signal:ctrl.signal,headers:{"content-type":"application/json",...(process.env.WARBOOST_PROVIDER_SECRET?{"x-warboost-provider-secret":process.env.WARBOOST_PROVIDER_SECRET}:{})},body:JSON.stringify({player_id,identity,alliance})});
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(body.message||`Source Last War HTTP ${r.status}`),{status:r.status});
    return {provider:body.provider||"warboost-connector",state:body.state||body};
  }finally{clearTimeout(timeout)}
}
