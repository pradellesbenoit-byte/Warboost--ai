function env(name){return String(process.env[name]||"").trim()}
async function call(url,{headers={},body}={}){const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);try{const r=await fetch(url,{method:"POST",signal:ctrl.signal,headers:{"content-type":"application/json",...headers},body:JSON.stringify(body||{})});const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data.message||`Last War source HTTP ${r.status}`),{status:r.status});return data}finally{clearTimeout(timeout)}}
export function providerConfig(){return {public:Boolean(env("WARBOOST_PUBLIC_LASTWAR_URL")),trusted:Boolean(env("WARBOOST_LASTWAR_PROVIDER_URL"))}}
export async function fetchLastWarState({player_id,identity,alliance}){
  const payload={player_id,identity,alliance};
  const publicUrl=env("WARBOOST_PUBLIC_LASTWAR_URL");
  if(publicUrl){const body=await call(publicUrl,{body:payload});return {provider:body.provider||"public-lastwar",kind:"public",state:body.state||body}}
  const trusted=env("WARBOOST_LASTWAR_PROVIDER_URL");
  if(trusted){const secret=env("WARBOOST_PROVIDER_SECRET");const body=await call(trusted,{headers:secret?{"x-warboost-provider-secret":secret}:{},body:payload});return {provider:body.provider||"warboost-connector",kind:"trusted",state:body.state||body}}
  throw Object.assign(new Error("No compatible public Last War source is configured."),{code:"PROVIDER_NOT_CONNECTED"});
}
