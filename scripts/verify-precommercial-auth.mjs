import test from "node:test";
import assert from "node:assert/strict";
import {createWarBoostSupabaseAuthClient} from "../lib/browser-auth.js";
import {LANGUAGES,translator} from "../i18n.js";

// Reserved .invalid domain, synthetic tokens and injected transport ONLY.
// No Supabase, e-mail, Stripe, Vision or player data is accessed.
const storageKey="sb-fiction-auth-token";
const account=id=>({id,email:`${id}@example.invalid`});
const session=(id,expires_at=Math.floor(Date.now()/1000)+3600)=>({
  access_token:`synthetic-access-${id}`,refresh_token:`synthetic-refresh-${id}`,
  expires_at,user:account(id)
});
const response=(payload,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload});
function memory(initial){
  const rows=new Map(initial?[[storageKey,JSON.stringify(initial)]]:[]);
  return {getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),
    removeItem:key=>rows.delete(key),session:()=>JSON.parse(rows.get(storageKey)||"null")};
}
function client(storage,transport){
  return createWarBoostSupabaseAuthClient({url:"https://fiction.supabase.invalid",key:"synthetic-publishable",
    storage,fetchImpl:async(url,options)=>{
      assert.equal(new URL(url).origin,"https://fiction.supabase.invalid");
      return transport(new URL(url),options);
    }});
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((done,fail)=>{resolve=done;reject=fail});
  return {promise,resolve,reject};
}

test("new signup without session waits for OTP and persists no authenticated session",async()=>{
  const store=memory(),calls=[];
  const auth=client(store,async(url,options)=>{
    calls.push(url.pathname);assert.equal(JSON.parse(options.body).email,"new@example.invalid");
    return response({user:account("new")});
  }).auth;
  const result=await auth.signUp({email:"NEW@example.invalid",password:"synthetic-only"});
  assert.equal(result.error,null);assert.equal(result.data.session,null);
  assert.equal(store.session(),null);assert.deepEqual(calls,["/auth/v1/signup"]);
});
test("invalid or expired OTP never creates a session",async()=>{
  for(const status of [400,403]){
    const store=memory(),auth=client(store,async()=>response({error_code:"otp_expired"},status)).auth;
    const result=await auth.verifyOtp({email:"new@example.invalid",token:"synthetic-otp"});
    assert.ok(result.error);assert.equal(store.session(),null);
  }
});
test("successful OTP restores the same synthetic account after client reload",async()=>{
  const store=memory(),auth=client(store,async()=>response(session("new"))).auth;
  assert.equal((await auth.verifyOtp({email:"new@example.invalid",token:"synthetic-otp"})).error,null);
  const restored=client(store,async()=>{throw new Error("Unexpected transport")}).auth;
  assert.equal((await restored.getSession()).data.session.user.id,"new");
});
test("resend and recovery requests send no actual e-mail and create no session",async()=>{
  const store=memory(),paths=[],auth=client(store,async url=>{paths.push(url.pathname);return response({})}).auth;
  assert.equal((await auth.resend({email:"new@example.invalid"})).error,null);
  assert.equal((await auth.resetPasswordForEmail("new@example.invalid")).error,null);
  assert.deepEqual(paths,["/auth/v1/resend","/auth/v1/recover"]);assert.equal(store.session(),null);
});
test("recovery bearer refused by Auth cannot become a recovery session",async()=>{
  const store=memory(),events=[],auth=client(store,async()=>response({error_code:"bad_jwt"},401)).auth;
  auth.onAuthStateChange(event=>events.push(event));
  const result=await auth.consumeRecoverySessionFromUrl("https://warboost.invalid/#type=recovery&access_token=synthetic-invalid",{cleanUrl:false});
  assert.ok(result.error);assert.equal(result.data.session,null);assert.equal(store.session(),null);
  assert.deepEqual(events,[]);
});
test("network failure verifying recovery preserves the previous authenticated session",async()=>{
  const store=memory(session("previous")),auth=client(store,async()=>{throw new TypeError("synthetic offline")}).auth;
  const result=await auth.consumeRecoverySessionFromUrl("https://warboost.invalid/#type=recovery&access_token=synthetic-invalid",{cleanUrl:false});
  assert.ok(result.error);assert.equal(store.session().user.id,"previous");
});
test("successful verified recovery permits password update on the verified account only",async()=>{
  const store=memory(),auth=client(store,async(url,options)=>{
    assert.equal(url.pathname,"/auth/v1/user");
    if(options.method==="PUT")assert.equal(JSON.parse(options.body).password,"synthetic-new-password");
    return response(account("recovered"));
  }).auth;
  const result=await auth.consumeRecoverySessionFromUrl("https://warboost.invalid/#type=recovery&access_token=synthetic-recovery",{cleanUrl:false});
  assert.equal(result.error,null);assert.equal(result.data.session.user.id,"recovered");
  assert.equal((await auth.updateUser({password:"synthetic-new-password"})).error,null);
});
test("parallel session checks share one refresh request",async()=>{
  const store=memory(session("a",1)),pending=deferred();let calls=0;
  const auth=client(store,async()=>{calls++;return pending.promise}).auth;
  const a=auth.getSession(),b=auth.getSession();
  pending.resolve(response(session("a")));
  await Promise.all([a,b]);assert.equal(calls,1);
});
test("late refresh cannot resurrect a signed-out account",async()=>{
  const store=memory(session("a")),pending=deferred(),events=[];
  const auth=client(store,async url=>url.searchParams.get("grant_type")==="refresh_token"?pending.promise:response({})).auth;
  auth.onAuthStateChange(event=>events.push(event));
  const refresh=auth.refreshSession();await auth.signOut();
  pending.resolve(response(session("a")));await refresh;
  assert.equal(store.session(),null);assert.ok(!events.includes("TOKEN_REFRESHED"));
});
test("late account A refresh cannot overwrite a newer account B login",async()=>{
  const store=memory(session("a")),pending=deferred();
  const auth=client(store,async url=>url.searchParams.get("grant_type")==="refresh_token"?pending.promise:response(session("b"))).auth;
  const refresh=auth.refreshSession();
  await auth.signInWithPassword({email:"b@example.invalid",password:"synthetic"});
  pending.resolve(response(session("a")));await refresh;
  assert.equal(store.session().user.id,"b");
});
test("late logout response cannot clear a newer login",async()=>{
  const store=memory(session("a")),pending=deferred();
  const auth=client(store,async url=>url.pathname.endsWith("/logout")?pending.promise:response(session("b"))).auth;
  const logout=auth.signOut();
  await auth.signInWithPassword({email:"b@example.invalid",password:"synthetic"});
  pending.resolve(response({}));await logout;
  assert.equal(store.session()?.user.id,"b");
});
test("an expired rejected refresh signs out; a transient error preserves the stored session",async()=>{
  for(const status of [400,503]){
    const store=memory(session("a",1)),auth=client(store,async()=>response({error:"invalid_grant"},status)).auth;
    await auth.getSession();
    assert.equal(store.session()?.user.id||null,status===400?null:"a");
  }
});
test("a late failed getSession refresh cannot clear a newer login",async()=>{
  const store=memory(session("a",1)),pending=deferred();
  const auth=client(store,async url=>url.searchParams.get("grant_type")==="refresh_token"?pending.promise:response(session("b"))).auth;
  const restore=auth.getSession();
  await auth.signInWithPassword({email:"b@example.invalid",password:"synthetic"});
  pending.resolve(response({error:"invalid_grant"},400));await restore;
  assert.equal(store.session()?.user.id,"b");
});
test("late profile response cannot replace the newer account",async()=>{
  const store=memory(session("a")),pending=deferred();
  const auth=client(store,async(url,options)=>options.method==="PUT"?pending.promise:response(session("b"))).auth;
  const update=auth.updateUser({password:"synthetic-new"});
  await auth.signInWithPassword({email:"b@example.invalid",password:"synthetic"});
  pending.resolve(response(account("a")));
  assert.ok((await update).error);assert.equal(store.session().user.id,"b");
});
test("late sign-in persistence cannot emit SIGNED_IN after sign-out",async()=>{
  const store=memory(),pending=deferred(),events=[];let writes=0;
  store.flush=()=>++writes===1?pending.promise:Promise.resolve();
  const auth=client(store,async url=>response(url.pathname.endsWith("/logout")?{}:session("a"))).auth;
  auth.onAuthStateChange(event=>events.push(event));
  const login=auth.signInWithPassword({email:"a@example.invalid",password:"synthetic"});
  while(!writes)await new Promise(resolve=>setImmediate(resolve));
  await auth.signOut();pending.resolve();
  assert.ok((await login).error);assert.equal(store.session(),null);assert.deepEqual(events,["SIGNED_OUT"]);
});
test("failed persistence from an old account cannot clear a newer session",async()=>{
  const store=memory(),pending=deferred();let writes=0;
  store.flush=()=>++writes===1?pending.promise:Promise.resolve();
  const auth=client(store,async(url,options)=>response(session(JSON.parse(options.body).email.startsWith("a")?"a":"b"))).auth;
  const old=auth.signInWithPassword({email:"a@example.invalid",password:"synthetic"});
  while(!writes)await new Promise(resolve=>setImmediate(resolve));
  await auth.signInWithPassword({email:"b@example.invalid",password:"synthetic"});
  pending.reject(new Error("Synthetic storage failure"));assert.ok((await old).error);
  assert.equal(store.session().user.id,"b");
});
test("rejected recovery removes callback credentials from the browser URL",async()=>{
  const oldLocation=globalThis.location,oldHistory=globalThis.history;let cleaned="";
  globalThis.location={href:"https://warboost.invalid/reset-password.html?type=recovery&error_code=otp_expired#access_token=synthetic"};
  globalThis.history={replaceState:(_state,_title,url)=>{cleaned=url}};
  try{
    const store=memory(),auth=client(store,async()=>{throw new Error("Unexpected network")}).auth;
    const result=await auth.consumeRecoverySessionFromUrl();
    assert.ok(result.error);assert.equal(cleaned,"/reset-password.html");assert.equal(store.session(),null);
  }finally{
    if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
    if(oldHistory===undefined)delete globalThis.history;else globalThis.history=oldHistory;
  }
});
test("superseded authentication feedback exists in all 23 locales / 22 languages",()=>{
  let count=0;
  for(const [code] of LANGUAGES){
    if(code==="auto")continue;
    const text=translator(code)("auth_request_superseded");
    assert.ok(text&&text!=="auth_request_superseded",code);
    if(!code.startsWith("en"))assert.notEqual(text,translator("en-GB")("auth_request_superseded"),code);
    count++;
  }
  assert.equal(count,23);
});
