// WarBoost browser-side Supabase Auth client.
// Purpose: keep private-beta authentication independent from third-party CDN script loading.
// Only the Supabase Auth HTTP API is used here; account/player data still flows through WarBoost server APIs.

function trimSlash(v){return String(v||"").trim().replace(/\/+$/,'')}
function projectRef(url){try{return new URL(url).hostname.split('.')[0]||'warboost'}catch{return 'warboost'}}
function defaultStorage(){try{return globalThis.localStorage||null}catch{return null}}
function nowSeconds(){return Math.floor(Date.now()/1000)}
function safeJsonParse(raw){try{return JSON.parse(raw)}catch{return null}}
function normalizeError(payload,status,fallback='Supabase Auth request failed'){
  const message=String(payload?.msg||payload?.message||payload?.error_description||payload?.error||fallback);
  const error=new Error(message);error.status=Number(status)||0;error.code=String(payload?.code||payload?.error_code||payload?.error||'auth_request_failed');return error
}
function definitiveRefreshRejection(error){
  const status=Number(error?.status)||0,detail=`${String(error?.code||'')} ${String(error?.message||'')}`.toLowerCase();
  return [400,401,403].includes(status)&&/invalid[_ -]?grant|refresh[_ -]?token|token[_ -]?expired|jwt[_ -]?expired|unauthorized/.test(detail);
}
function sessionFromPayload(payload){
  if(!payload||typeof payload!=='object')return null;
  if(payload.session&&typeof payload.session==='object')return normalizeSession(payload.session);
  if(!payload.access_token)return null;
  const expiresIn=Number(payload.expires_in)||3600;
  return normalizeSession({
    access_token:payload.access_token,
    refresh_token:payload.refresh_token||null,
    token_type:payload.token_type||'bearer',
    expires_in:expiresIn,
    expires_at:Number(payload.expires_at)||nowSeconds()+expiresIn,
    user:payload.user||null
  });
}
function normalizeSession(session){
  if(!session||typeof session!=='object'||!session.access_token)return null;
  const expiresIn=Number(session.expires_in)||3600;
  return {
    ...session,
    token_type:session.token_type||'bearer',
    expires_in:expiresIn,
    expires_at:Number(session.expires_at)||nowSeconds()+expiresIn,
    user:session.user||null
  };
}

export function createWarBoostSupabaseAuthClient({url,key,storage=defaultStorage(),fetchImpl=globalThis.fetch,refreshSkewSeconds=60,requestTimeoutMs=15000}={}){
  const base=trimSlash(url),anon=String(key||'').trim();
  if(!/^https:\/\//i.test(base))throw Object.assign(new Error('Invalid Supabase URL'),{code:'auth_client_invalid_url'});
  if(!anon)throw Object.assign(new Error('Missing Supabase publishable key'),{code:'auth_client_missing_key'});
  if(typeof fetchImpl!=='function')throw Object.assign(new Error('Fetch API unavailable'),{code:'auth_client_fetch_unavailable'});
  const storageKey=`sb-${projectRef(base)}-auth-token`;
  const listeners=new Set();
  let refreshTimer=null,current=readStoredSession();
  let sessionGeneration=0,authAttempt=0,refreshPending=null;
  const changedSession=()=>Object.assign(new Error('Authentication request superseded'),{code:'auth_session_changed'});
  function beginAuthAttempt(){return {generation:sessionGeneration,attempt:++authAttempt}}
  function checkAuthAttempt(ticket){
    if(ticket.generation!==sessionGeneration||ticket.attempt!==authAttempt)throw changedSession();
  }
  async function acceptAuthSession(session,ticket){
    checkAuthAttempt(ticket);
    const generation=++sessionGeneration;refreshPending=null;
    await writeStoredSession(session);
    if(generation!==sessionGeneration)throw changedSession();
  }

  function readStoredSession(){
    if(!storage?.getItem)return null;
    const parsed=safeJsonParse(storage.getItem(storageKey));
    // Supabase-js currently stores the session directly. Accept common wrapper shapes too for forward compatibility.
    return normalizeSession(parsed?.session||parsed?.currentSession||parsed);
  }
  function writeStoredSession(session){
    current=normalizeSession(session);
    const written=current;
    if(storage?.setItem&&current)storage.setItem(storageKey,JSON.stringify(current));
    else if(storage?.removeItem&&!current)storage.removeItem(storageKey);
    scheduleRefresh();
    const persisted=storage?.flush?.();
    if(persisted?.then)return persisted.catch(error=>{
      if(current===written){
        current=null;
        storage?.removeItem?.(storageKey);
        if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=null;
      }
      throw error;
    });
  }
  function clearStoredSession(){current=null;if(storage?.removeItem)storage.removeItem(storageKey);if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=null;return storage?.flush?.()}
  function emit(event,session=current){for(const cb of [...listeners]){try{cb(event,session)}catch{}}}
  function scheduleRefresh(){
    if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=null;
    if(!current?.refresh_token||!current?.expires_at)return;
    const ms=Math.max(1000,(Number(current.expires_at)-nowSeconds()-refreshSkewSeconds)*1000);
    refreshTimer=setTimeout(()=>{refreshSession().catch(()=>{})},Math.min(ms,2147483000));
    refreshTimer?.unref?.();
  }
  async function request(path,{method='POST',body,accessToken}={}){
    let response;
    const Controller=globalThis.AbortController,controller=typeof Controller==='function'?new Controller():null;
    const timeout=Math.max(3000,Number(requestTimeoutMs)||15000),timer=controller?setTimeout(()=>controller.abort(),timeout):null;
    try{
      response=await fetchImpl(`${base}/auth/v1${path}`,{
        method,
        headers:{
          'apikey':anon,
          'Authorization':`Bearer ${accessToken||anon}`,
          ...(body===undefined?{}:{'Content-Type':'application/json'})
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        ...(controller?{signal:controller.signal}:{})
      });
    }catch(cause){
      const timedOut=String(cause?.name||'')==='AbortError'||Boolean(controller?.signal?.aborted);
      const error=Object.assign(new Error(timedOut?'Supabase Auth request timed out':'Supabase Auth network unavailable'),{code:timedOut?'auth_request_timeout':'auth_network_unavailable',cause});throw error
    }finally{if(timer)clearTimeout(timer)}
    let payload={};
    try{payload=await response.json()}catch{}
    if(!response.ok)throw normalizeError(payload,response.status);
    return payload;
  }
  async function refreshSession(){
    if(refreshPending)return refreshPending;
    const generation=sessionGeneration;
    const session=current||readStoredSession();
    if(!session?.refresh_token)return {data:{session},error:null};
    const work=(async()=>{
      try{
        const payload=await request('/token?grant_type=refresh_token',{body:{refresh_token:session.refresh_token}});
        if(generation!==sessionGeneration)throw changedSession();
        const next=sessionFromPayload(payload);
        if(!next)throw Object.assign(new Error('Invalid refresh response'),{code:'auth_invalid_refresh_response'});
        await writeStoredSession(next);
        if(generation!==sessionGeneration)throw changedSession();
        emit('TOKEN_REFRESHED',next);return {data:{session:next},error:null};
      }catch(error){return {data:{session:generation===sessionGeneration?session:current},error}}
    })();
    refreshPending=work;
    try{return await work}finally{if(refreshPending===work)refreshPending=null}
  }
  async function getSession(){
    const generation=sessionGeneration;
    let session=current||readStoredSession();
    if(session)current=session;
    if(session?.refresh_token&&Number(session.expires_at||0)<=nowSeconds()+refreshSkewSeconds){
      const refreshed=await refreshSession();
      if(generation!==sessionGeneration)return {data:{session:current},error:null};
      if(!refreshed.error)session=refreshed.data.session;
      else{
        // An expired access token plus a temporary network failure is not proof that the
        // refresh token is invalid. Keep the stored session intact and let an explicit retry
        // distinguish a definitive rejection from a connectivity problem.
        session=refreshed.data?.session||session;
        if(Number(session.expires_at||0)<=nowSeconds()&&definitiveRefreshRejection(refreshed.error)){
          session=null;await writeStoredSession(null);emit('SIGNED_OUT',null);
        }
        else return {data:{session},error:null};
      }
    }
    if(session)await writeStoredSession(session);
    return {data:{session:generation===sessionGeneration?session:current},error:null};
  }
  async function signInWithPassword({email,password}={}){
    const ticket=beginAuthAttempt();
    try{
      const payload=await request('/token?grant_type=password',{body:{email:String(email||'').trim().toLowerCase(),password:String(password||'')}});
      const session=sessionFromPayload(payload);if(!session)throw Object.assign(new Error('Invalid sign-in response'),{code:'auth_invalid_signin_response'});
      await acceptAuthSession(session,ticket);emit('SIGNED_IN',session);return {data:{user:session.user,session},error:null};
    }catch(error){return {data:{user:null,session:null},error}}
  }
  async function signUp({email,password}={}){
    const ticket=beginAuthAttempt();
    try{
      const payload=await request('/signup',{body:{email:String(email||'').trim().toLowerCase(),password:String(password||'')}});
      checkAuthAttempt(ticket);
      const session=sessionFromPayload(payload);if(session){await acceptAuthSession(session,ticket);emit('SIGNED_IN',session)}
      return {data:{user:payload?.user||session?.user||null,session},error:null};
    }catch(error){return {data:{user:null,session:null},error}}
  }
  async function verifyOtp({email,token,type='email'}={}){
    const ticket=beginAuthAttempt();
    try{
      const payload=await request('/verify',{body:{email:String(email||'').trim().toLowerCase(),token:String(token||''),type:String(type||'email')}});
      const session=sessionFromPayload(payload);if(!session)throw Object.assign(new Error('Invalid verification response'),{code:'auth_invalid_verify_response'});
      await acceptAuthSession(session,ticket);emit('SIGNED_IN',session);return {data:{user:session.user,session},error:null};
    }catch(error){return {data:{user:null,session:null},error}}
  }
  async function resend({email,type='signup'}={}){
    try{
      const payload=await request('/resend',{body:{email:String(email||'').trim().toLowerCase(),type:String(type||'signup')}});
      return {data:payload||{},error:null};
    }catch(error){return {data:null,error}}
  }
  async function getUser(accessToken=current?.access_token){
    if(!accessToken)return {data:{user:null},error:Object.assign(new Error('Missing access token'),{code:'auth_missing_access_token'})};
    try{
      const payload=await request('/user',{method:'GET',accessToken});
      return {data:{user:payload?.user||payload||null},error:null};
    }catch(error){return {data:{user:null},error}}
  }
  async function resetPasswordForEmail(email,{redirectTo}={}){
    try{
      const cleanEmail=String(email||'').trim().toLowerCase();
      if(!cleanEmail)throw Object.assign(new Error('Missing email'),{code:'auth_missing_email'});
      const target=String(redirectTo||'').trim();
      const suffix=target?`?redirect_to=${encodeURIComponent(target)}`:'';
      const payload=await request(`/recover${suffix}`,{body:{email:cleanEmail}});
      return {data:payload||{},error:null};
    }catch(error){return {data:null,error}}
  }
  async function updateUser(attributes={}){
    const generation=sessionGeneration;
    try{
      const session=current||readStoredSession();
      if(!session?.access_token)throw Object.assign(new Error('Missing recovery session'),{code:'auth_missing_session'});
      const body={};
      if(Object.prototype.hasOwnProperty.call(attributes,'password'))body.password=String(attributes.password||'');
      if(Object.prototype.hasOwnProperty.call(attributes,'email'))body.email=String(attributes.email||'').trim().toLowerCase();
      const payload=await request('/user',{method:'PUT',body,accessToken:session.access_token});
      if(generation!==sessionGeneration)throw changedSession();
      const next={...(current||session),user:payload?.user||payload||session.user||null};
      await writeStoredSession(next);
      if(generation!==sessionGeneration)throw changedSession();
      emit('USER_UPDATED',next);
      return {data:{user:next.user},error:null};
    }catch(error){return {data:{user:null},error}}
  }
  async function consumeRecoverySessionFromUrl(href=globalThis.location?.href,{cleanUrl=true}={}){
    let recoveryCallback=false;
    try{
      const url=new URL(String(href||''),globalThis.location?.origin||'https://warboost.invalid');
      const fragment=new URLSearchParams(url.hash.replace(/^#/,''));
      const query=url.searchParams;
      const errorDescription=fragment.get('error_description')||query.get('error_description');
      const errorCode=fragment.get('error_code')||query.get('error_code')||fragment.get('error')||query.get('error');
      if(errorDescription||errorCode){
        recoveryCallback=true;
        throw Object.assign(new Error(errorDescription||errorCode||'Recovery link error'),{code:errorCode||'auth_recovery_link_error'});
      }
      const type=fragment.get('type')||query.get('type');
      const accessToken=fragment.get('access_token');
      const refreshToken=fragment.get('refresh_token');
      if(type!=='recovery'||!accessToken)return {data:{session:null,event:null},error:null};
      recoveryCallback=true;
      const ticket=beginAuthAttempt();
      const expiresIn=Number(fragment.get('expires_in'))||3600;
      let session=normalizeSession({
        access_token:accessToken,
        refresh_token:refreshToken||null,
        token_type:fragment.get('token_type')||'bearer',
        expires_in:expiresIn,
        expires_at:nowSeconds()+expiresIn,
        user:null
      });
      const userResult=await getUser(accessToken);
      if(userResult.error)throw userResult.error;
      if(!userResult.data?.user?.id)throw Object.assign(new Error('Invalid recovery response'),{code:'auth_invalid_verify_response'});
      session={...session,user:userResult.data.user};
      await acceptAuthSession(session,ticket);emit('PASSWORD_RECOVERY',session);
      return {data:{session,event:'PASSWORD_RECOVERY'},error:null};
    }catch(error){return {data:{session:null,event:null},error}}
    finally{
      if(recoveryCallback&&cleanUrl&&globalThis.history?.replaceState&&globalThis.location){
        try{
          const clean=new URL(globalThis.location.href);clean.hash='';
          for(const key of ['access_token','refresh_token','expires_in','token_type','type','error','error_code','error_description'])clean.searchParams.delete(key);
          globalThis.history.replaceState({},'',clean.pathname+clean.search);
        }catch{/* A browser URL-cleanup failure must not manufacture an authenticated session. */}
      }
    }
  }
  async function signOut(){
    const token=current?.access_token;
    sessionGeneration++;authAttempt++;refreshPending=null;
    const cleared=clearStoredSession();emit('SIGNED_OUT',null);
    await cleared;
    try{if(token)await request('/logout',{body:{},accessToken:token})}catch{}
    return {error:null};
  }
  function onAuthStateChange(callback){
    if(typeof callback!=='function')return {data:{subscription:{unsubscribe(){}}}};
    listeners.add(callback);
    return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}};
  }

  scheduleRefresh();
  return {auth:{getSession,getUser,onAuthStateChange,signInWithPassword,signUp,verifyOtp,resend,resetPasswordForEmail,consumeRecoverySessionFromUrl,updateUser,signOut,refreshSession},diagnostics:{transport:'direct-supabase-auth-api',external_cdn:false,storage_key:storageKey}};
}
