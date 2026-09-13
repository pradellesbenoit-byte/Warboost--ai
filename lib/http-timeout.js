export function timeoutError(code="UPSTREAM_TIMEOUT",message="Upstream service timed out"){
  return Object.assign(new Error(message),{status:504,code,timeout:true});
}

export async function fetchWithTimeout(input,init={},timeoutMs=7000,{code="UPSTREAM_TIMEOUT",message="Upstream service timed out"}={}){
  const ms=Math.max(500,Number(timeoutMs)||7000),controller=new AbortController();
  const parent=init?.signal;
  let timedOut=false,parentAbort=null;
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},ms);
  if(parent){
    if(parent.aborted)controller.abort();
    else{parentAbort=()=>controller.abort();parent.addEventListener("abort",parentAbort,{once:true})}
  }
  try{
    return await fetch(input,{...init,signal:controller.signal});
  }catch(error){
    if(timedOut)throw timeoutError(code,message);
    if(controller.signal.aborted&&parent?.aborted)throw error;
    throw error;
  }finally{
    clearTimeout(timer);
    if(parentAbort)parent.removeEventListener("abort",parentAbort);
  }
}
