export const WARBOOST_IDLE_TIMEOUT_MS=30*60*1000;
const DEFAULT_STORAGE_KEY="warboost-idle-v1";
const ACTIVITY_EVENTS=["touchstart","pointerdown","click","keydown","input"];

function safeRead(storage,key){
  try{
    const value=JSON.parse(storage?.getItem?.(key)||"null");
    return value&&typeof value==="object"?value:{};
  }catch{return {}}
}

export function createIdleLifecycle({
  windowRef=globalThis.window,
  documentRef=globalThis.document,
  storage=(()=>{try{return globalThis.localStorage}catch{return null}})(),
  storageKey=DEFAULT_STORAGE_KEY,
  now=()=>Date.now(),
  setTimeoutFn=(fn,delay)=>setTimeout(fn,delay),
  clearTimeoutFn=id=>clearTimeout(id),
  idleMs=WARBOOST_IDLE_TIMEOUT_MS,
  scrollThrottleMs=5000,
  persistThrottleMs=10000,
  softReturnThrottleMs=2500,
  retryThrottleMs=5000,
  onSuspend=()=>{},
  onBackground=()=>{},
  onResume=async()=>({ok:true}),
  onRecentReturn=()=>{}
}={}){
  let started=false,suspended=false,lastActivityAt=0,suspendedAt=null,lastScrollAt=0,lastPersistAt=0,lastSoftReturnAt=0,retryAfter=0,timer=null,resumeInFlight=null;
  const listeners=[];

  function persist(force=false){
    const stamp=now();
    if(!force&&stamp-lastPersistAt<persistThrottleMs)return;
    lastPersistAt=stamp;
    try{storage?.setItem?.(storageKey,JSON.stringify({version:1,lastActivityAt,suspendedAt}))}catch{}
  }
  function schedule(){
    if(timer!==null){clearTimeoutFn(timer);timer=null}
    if(!started||suspended)return;
    const delay=Math.max(0,lastActivityAt+idleMs-now());
    timer=setTimeoutFn(checkDeadline,delay);
  }
  function enterSuspended(reason="idle-timeout"){
    if(suspended)return false;
    suspended=true;
    suspendedAt=Math.max(1,lastActivityAt+idleMs);
    persist(true);
    try{onSuspend({reason,lastActivityAt,suspendedAt})}catch{}
    if(timer!==null){clearTimeoutFn(timer);timer=null}
    return true;
  }
  function checkDeadline(){
    timer=null;
    if(!started||suspended)return;
    const remaining=lastActivityAt+idleMs-now();
    if(remaining>0){schedule();return}
    enterSuspended("idle-timeout");
  }
  async function resume(reason="return",{bypassRetryThrottle=false}={}){
    if(resumeInFlight)return resumeInFlight;
    const elapsed=Math.max(0,now()-lastActivityAt);
    if(!suspended&&elapsed<idleMs)return {ok:true,skipped:true,reason:"not-idle"};
    if(!suspended)enterSuspended("return-after-idle");
    if(!bypassRetryThrottle&&now()<retryAfter)return {ok:false,skipped:true,reason:"resume-retry-throttled"};
    const task=Promise.resolve().then(()=>onResume({reason,lastActivityAt,suspendedAt,elapsed})).then(result=>{
      if(result?.ok!==false){
        suspended=false;suspendedAt=null;lastActivityAt=now();retryAfter=0;persist(true);schedule();
      }else{
        retryAfter=now()+retryThrottleMs;persist(true);
      }
      return result;
    }).catch(error=>{
      retryAfter=now()+retryThrottleMs;persist(true);
      return {ok:false,error};
    }).finally(()=>{if(resumeInFlight===task)resumeInFlight=null});
    resumeInFlight=task;
    return task;
  }
  function returnFrom(reason="return",options={}){
    if(!started)return Promise.resolve({ok:true,skipped:true,reason:"not-started"});
    if(documentRef?.visibilityState==="hidden"&&reason!=="online")return Promise.resolve({ok:true,skipped:true,reason:"document-hidden"});
    const elapsed=Math.max(0,now()-lastActivityAt);
    if(suspended||elapsed>=idleMs){
      if(!suspended)enterSuspended("return-after-idle");
      return resume(reason,options);
    }
    lastActivityAt=now();persist();schedule();
    if(now()-lastSoftReturnAt>=softReturnThrottleMs){
      lastSoftReturnAt=now();
      try{onRecentReturn({reason,elapsed,lastActivityAt})}catch{}
    }
    return Promise.resolve({ok:true,skipped:true,reason:"not-idle"});
  }
  function noteActivity(event={}){
    if(!started||event?.isTrusted===false)return false;
    const stamp=now();
    if(event?.type==="scroll"){
      if(stamp-lastScrollAt<scrollThrottleMs)return false;
      lastScrollAt=stamp;
    }
    const overdue=suspended||stamp-lastActivityAt>=idleMs;
    if(overdue&&!suspended)enterSuspended("activity-after-idle");
    lastActivityAt=stamp;persist(overdue);schedule();
    if(overdue)void resume("interaction");
    return true;
  }
  function handleVisibilityChange(){
    if(!started)return Promise.resolve({ok:true,skipped:true,reason:"not-started"});
    if(documentRef?.visibilityState==="hidden"){
      persist(true);
      try{onBackground({at:now(),lastActivityAt,suspended})}catch{}
      return Promise.resolve({ok:true,skipped:true,reason:"hidden"});
    }
    return returnFrom("visibilitychange");
  }
  function handlePageHide(){
    if(started)persist(true);
  }
  function handleReturnEvent(event){
    if(event?.type==="pageshow"&&event.persisted)returnFrom("pageshow-bfcache");
    else returnFrom(event?.type||"focus");
  }
  function add(target,type,handler,options){
    if(!target?.addEventListener)return;
    target.addEventListener(type,handler,options);
    listeners.push(()=>target.removeEventListener?.(type,handler,options));
  }
  function start(){
    if(started)return {started:true,suspended};
    started=true;
    const saved=safeRead(storage,storageKey),stamp=now();
    lastActivityAt=Number.isFinite(Number(saved.lastActivityAt))&&Number(saved.lastActivityAt)>0?Number(saved.lastActivityAt):stamp;
    suspendedAt=Number.isFinite(Number(saved.suspendedAt))&&Number(saved.suspendedAt)>0?Number(saved.suspendedAt):null;
    suspended=Boolean(suspendedAt)||stamp-lastActivityAt>=idleMs;
    for(const type of ACTIVITY_EVENTS)add(documentRef,type,noteActivity,{capture:true,passive:true});
    add(documentRef,"scroll",noteActivity,{capture:true,passive:true});
    add(documentRef,"visibilitychange",handleVisibilityChange);
    add(windowRef,"focus",handleReturnEvent);
    add(windowRef,"pageshow",handleReturnEvent);
    add(windowRef,"pagehide",handlePageHide);
    if(documentRef?.visibilityState==="hidden"){
      try{onBackground({at:stamp,lastActivityAt,suspended})}catch{}
    }
    if(suspended){
      if(!suspendedAt)suspendedAt=lastActivityAt+idleMs;
      persist(true);
      try{onSuspend({reason:"startup-after-idle",lastActivityAt,suspendedAt})}catch{}
      if(documentRef?.visibilityState!=="hidden")void resume("startup-return");
    }else schedule();
    return {started:true,suspended};
  }
  function stop(){
    if(!started)return;
    started=false;
    if(timer!==null){clearTimeoutFn(timer);timer=null}
    for(const remove of listeners.splice(0))remove();
    persist(true);
  }
  return {
    start,stop,noteActivity,handleVisibilityChange,returnFrom,
    isSuspended:()=>suspended,
    isIdleDue:()=>suspended||now()-lastActivityAt>=idleMs,
    isResuming:()=>Boolean(resumeInFlight),
    getState:()=>({suspended,lastActivityAt,suspendedAt,resuming:Boolean(resumeInFlight)})
  };
}