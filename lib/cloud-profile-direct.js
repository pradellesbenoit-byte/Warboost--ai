function trimSlash(v){return String(v||'').trim().replace(/\/+$/,'')}
function safeJson(text){try{return text?JSON.parse(text):null}catch{return null}}

export async function readOwnProfileDirect({url,key,accessToken,userId,fetchImpl=globalThis.fetch,timeoutMs=9000}={}){
  const base=trimSlash(url),anon=String(key||'').trim(),token=String(accessToken||'').trim(),uid=String(userId||'').trim();
  if(!/^https:\/\//i.test(base)||!anon||!token||!uid||typeof fetchImpl!=='function')return {ok:false,status:0,error:'direct_profile_unavailable'};
  const Controller=globalThis.AbortController,controller=typeof Controller==='function'?new Controller():null;
  const timer=controller?setTimeout(()=>controller.abort(),Math.max(1500,Number(timeoutMs)||9000)):null;
  try{
    const endpoint=`${base}/rest/v1/wb1_profiles?player_id=eq.${encodeURIComponent(uid)}&select=state,updated_at&limit=1`;
    const r=await fetchImpl(endpoint,{method:'GET',cache:'no-store',headers:{apikey:anon,authorization:`Bearer ${token}`,accept:'application/json'},...(controller?{signal:controller.signal}:{})});
    const text=await r.text(),body=safeJson(text);
    if(!r.ok)return {ok:false,status:Number(r.status)||0,error:String(body?.code||body?.message||`direct_profile_http_${r.status}`)};
    const row=Array.isArray(body)?body[0]:null;
    return {ok:true,status:r.status,state:row?.state&&typeof row.state==='object'?row.state:null,updated_at:row?.updated_at||null,cloud_empty:!row?.state};
  }catch(error){
    const timedOut=String(error?.name||'')==='AbortError'||Boolean(controller?.signal?.aborted);
    return {ok:false,status:0,error:timedOut?'direct_profile_timeout':'direct_profile_network'};
  }finally{if(timer)clearTimeout(timer)}
}
