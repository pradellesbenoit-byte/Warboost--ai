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

export function createWarBoostSupabaseAuthClient({url,key,storage=defaultStorage(),fetchImpl=globalThis.fetch,refreshSkewSeconds=60}={}){
  const base=trimSlash(url),anon=String(key||'').trim();
  if(!/^https:\/\//i.test(base))throw Object.assign(new Error('Invalid Supabase URL'),{code:'auth_client_invalid_url'});
  if(!anon)throw Object.assign(new Error('Missing Supabase publishable key'),{code:'auth_client_missing_key'});
  if(typeof fetchImpl!=='function')throw Object.assign(new Error('Fetch API unavailable'),{code:'auth_client_fetch_unavailable'});
  const storageKey=`sb-${projectRef(base)}-auth-token`;
  const listeners=new Set();
  let refreshTimer=null,current=readStoredSession();

  function readStoredSession(){
    if(!storage?.getItem)return null;
    const parsed=safeJsonParse(storage.getItem(storageKey));
    // Supabase-js currently stores the session directly. Accept common wrapper shapes too for forward compatibility.
    return normalizeSession(parsed?.session||parsed?.currentSession||parsed);
  }
  function writeStoredSession(session){
    current=normalizeSession(session);
    if(storage?.setItem&&current)storage.setItem(storageKey,JSON.stringify(current));
    else if(storage?.removeItem&&!current)storage.removeItem(storageKey);
    scheduleRefresh();
  }
  function clearStoredSession(){current=null;if(storage?.removeItem)storage.removeItem(storageKey);if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=null}
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
    try{
      response=await fetchImpl(`${base}/auth/v1${path}`,{
        method,
        headers:{
          'apikey':anon,
          'Authorization':`Bearer ${accessToken||anon}`,
          ...(body===undefined?{}:{'Content-Type':'application/json'})
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
    }catch(cause){
      const error=Object.assign(new Error('Supabase Auth network unavailable'),{code:'auth_network_unavailable',cause});throw error
    }
    let payload={};
    try{payload=await response.json()}catch{}
    if(!response.ok)throw normalizeError(payload,response.status);
    return payload;
  }
  async function refreshSession(){
    const session=current||readStoredSession();
    if(!session?.refresh_token)return {data:{session},error:null};
    try{
      const payload=await request('/token?grant_type=refresh_token',{body:{refresh_token:session.refresh_token}});
      const next=sessionFromPayload(payload);
      if(!next)throw Object.assign(new Error('Invalid refresh response'),{code:'auth_invalid_refresh_response'});
      writeStoredSession(next);emit('TOKEN_REFRESHED',next);return {data:{session:next},error:null};
    }catch(error){return {data:{session},error}}
  }
  async function getSession(){
    let session=current||readStoredSession();
    if(session)current=session;
    if(session?.refresh_token&&Number(session.expires_at||0)<=nowSeconds()+refreshSkewSeconds){
      const refreshed=await refreshSession();
      if(!refreshed.error)session=refreshed.data.session;
      else if(Number(session.expires_at||0)<=nowSeconds())session=null;
    }
    if(session)writeStoredSession(session);
    return {data:{session},error:null};
  }
  async function signInWithPassword({email,password}={}){
    try{
      const payload=await request('/token?grant_type=password',{body:{email:String(email||'').trim().toLowerCase(),password:String(password||'')}});
      const session=sessionFromPayload(payload);if(!session)throw Object.assign(new Error('Invalid sign-in response'),{code:'auth_invalid_signin_response'});
      writeStoredSession(session);emit('SIGNED_IN',session);return {data:{user:session.user,session},error:null};
    }catch(error){return {data:{user:null,session:null},error}}
  }
  async function signUp({email,password}={}){
    try{
      const payload=await request('/signup',{body:{email:String(email||'').trim().toLowerCase(),password:String(password||'')}});
      const session=sessionFromPayload(payload);if(session){writeStoredSession(session);emit('SIGNED_IN',session)}
      return {data:{user:payload?.user||session?.user||null,session},error:null};
    }catch(error){return {data:{user:null,session:null},error}}
  }
  async function verifyOtp({email,token,type='email'}={}){
    try{
      const payload=await request('/verify',{body:{email:String(email||'').trim().toLowerCase(),token:String(token||''),type:String(type||'email')}});
      const session=sessionFromPayload(payload);if(!session)throw Object.assign(new Error('Invalid verification response'),{code:'auth_invalid_verify_response'});
      writeStoredSession(session);emit('SIGNED_IN',session);return {data:{user:session.user,session},error:null};
    }catch(error){return {data:{user:null,session:null},error}}
  }
  async function signOut(){
    const token=current?.access_token;
    try{if(token)await request('/logout',{body:{},accessToken:token})}catch{}
    clearStoredSession();emit('SIGNED_OUT',null);return {error:null};
  }
  function onAuthStateChange(callback){
    if(typeof callback!=='function')return {data:{subscription:{unsubscribe(){}}}};
    listeners.add(callback);
    return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}};
  }

  scheduleRefresh();
  return {auth:{getSession,onAuthStateChange,signInWithPassword,signUp,verifyOtp,signOut,refreshSession},diagnostics:{transport:'direct-supabase-auth-api',external_cdn:false,storage_key:storageKey}};
}
