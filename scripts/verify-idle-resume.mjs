import assert from "node:assert/strict";
import fs from "node:fs";
import {createIdleLifecycle,WARBOOST_IDLE_TIMEOUT_MS} from "../lib/idle-lifecycle.js";
import {runAuthenticatedIdleResume,verifyExistingSupabaseSession} from "../lib/session-resume.js";
import {createWarBoostSupabaseAuthClient} from "../lib/browser-auth.js";

class FakeTarget{
  listeners=new Map();
  addEventListener(type,handler){const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list)}
  removeEventListener(type,handler){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==handler))}
  dispatch(type,properties={}){for(const handler of [...(this.listeners.get(type)||[])])handler({type,isTrusted:true,...properties})}
}
function makeClock(start=1_700_000_000_000){
  let current=start,nextId=0;
  const timers=new Map();
  return {
    now:()=>current,
    setTimeoutFn:(fn,delay)=>{const id=++nextId;timers.set(id,{fn,at:current+Math.max(0,Number(delay)||0)});return id},
    clearTimeoutFn:id=>timers.delete(id),
    advance(ms){
      const target=current+ms;
      for(let count=0;count<10000;count++){
        const due=[...timers.entries()].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!due)break;
        const [id,timer]=due;timers.delete(id);current=timer.at;timer.fn();
      }
      current=target;
    }
  };
}
function makeStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    dump:()=>Object.fromEntries(values)
  };
}
function makeLifecycle(options={}){
  const clock=makeClock(),storage=options.storage||makeStorage(),windowRef=new FakeTarget(),documentRef=new FakeTarget();
  documentRef.visibilityState="visible";
  const lifecycle=createIdleLifecycle({windowRef,documentRef,storage,now:clock.now,setTimeoutFn:clock.setTimeoutFn,clearTimeoutFn:clock.clearTimeoutFn,...options});
  return {clock,storage,windowRef,documentRef,lifecycle};
}
async function flushPromises(){for(let i=0;i<8;i++)await Promise.resolve()}
function response(status,body){
  return {ok:status>=200&&status<300,status,json:async()=>body};
}

// 1. Thirty minutes without input suspends the interface, closes transient UI,
// pauses foreground polling, and never closes the native app.
{
  let closes=0,paused=0,resumes=0,appCloseCalls=0;
  const env=makeLifecycle({onSuspend:()=>{closes++;paused++},onResume:async()=>{resumes++;return {ok:true}}});
  env.windowRef.close=()=>{appCloseCalls++};
  env.lifecycle.start();
  env.clock.advance(WARBOOST_IDLE_TIMEOUT_MS);
  assert.equal(env.lifecycle.isSuspended(),true);
  assert.equal(closes,1);
  assert.equal(paused,1);
  assert.equal(resumes,0);
  assert.equal(appCloseCalls,0);
  assert.ok(JSON.parse(env.storage.getItem("warboost-idle-v1")).suspendedAt);
  await env.lifecycle.returnFrom("pointerdown");
  assert.equal(resumes,1);
  assert.equal(env.lifecycle.isSuspended(),false);
}

// 2. Real activity resets the 30-minute deadline; a return before the deadline
// does not force profile reconciliation.
{
  let suspensions=0,resumes=0,recentReturns=0;
  const env=makeLifecycle({
    onSuspend:()=>{suspensions++},
    onResume:async()=>{resumes++;return {ok:true}},
    onRecentReturn:()=>{recentReturns++}
  });
  env.lifecycle.start();
  env.clock.advance(25*60*1000);
  env.lifecycle.noteActivity({type:"click",isTrusted:true});
  env.clock.advance(10*60*1000);
  assert.equal(suspensions,0);
  env.documentRef.visibilityState="hidden";
  env.documentRef.dispatch("visibilitychange");
  env.clock.advance(10*60*1000);
  env.documentRef.visibilityState="visible";
  await env.lifecycle.handleVisibilityChange();
  assert.equal(resumes,0);
  assert.equal(recentReturns,1);
  assert.equal(env.lifecycle.isSuspended(),false);
}

// 3. A PWA hidden for more than 30 minutes suspends, then visibilitychange
// performs one shared resume despite focus/pageshow events arriving together.
{
  let suspensions=0,resumes=0,finishResume;
  const env=makeLifecycle({
    onSuspend:()=>{suspensions++},
    onResume:()=>{resumes++;return new Promise(resolve=>{finishResume=resolve})}
  });
  env.lifecycle.start();
  env.documentRef.visibilityState="hidden";
  env.documentRef.dispatch("visibilitychange");
  env.clock.advance(WARBOOST_IDLE_TIMEOUT_MS+60_000);
  assert.equal(env.lifecycle.isSuspended(),true);
  assert.equal(suspensions,1);
  env.documentRef.visibilityState="visible";
  env.documentRef.dispatch("visibilitychange");
  const visibilityResume=env.lifecycle.handleVisibilityChange();
  await flushPromises();
  const focusResume=env.lifecycle.returnFrom("focus");
  const pageResume=env.lifecycle.returnFrom("pageshow-bfcache");
  assert.equal(resumes,1);
  finishResume({ok:true});
  await Promise.all([visibilityResume,focusResume,pageResume]);
  assert.equal(env.lifecycle.isSuspended(),false);
  assert.equal(resumes,1);
}

// 4. A valid existing Supabase session is verified, reused, and never signed out.
{
  const session={access_token:"access-valid",refresh_token:"refresh-valid",user:{id:"player-1"}};
  let refreshes=0,reconciliations=0,signedOut=0,setSessionCount=0;
  const auth={
    getSession:async()=>({data:{session},error:null}),
    getUser:async()=>({data:{user:{id:"player-1"}},error:null}),
    refreshSession:async()=>{refreshes++;return {data:{session},error:null}},
    signOut:async()=>{signedOut++}
  };
  const checked=await verifyExistingSupabaseSession(auth);
  assert.equal(checked.ok,true);
  assert.equal(checked.session.access_token,"access-valid");
  assert.equal(refreshes,0);
  const result=await runAuthenticatedIdleResume({
    auth,currentSession:session,setSession:()=>{setSessionCount++},
    reconcile:async(reason,options)=>{reconciliations++;assert.equal(reason,"idle-resume");assert.equal(options.force,true);return {ok:true}}
  });
  assert.equal(result.ok,true);
  assert.equal(setSessionCount,1);
  assert.equal(reconciliations,1);
  assert.equal(signedOut,0);
}

// 5. An expired access token uses the existing refresh token through the normal
// Auth client before profile reconciliation, with no sign-in prompt.
{
  const fixedNow=1_700_000_000_000,realNow=Date.now;
  Date.now=()=>fixedNow;
  try{
    const storage=makeStorage({"sb-project-auth-token":JSON.stringify({
      access_token:"access-expired",refresh_token:"refresh-old",expires_at:Math.floor(fixedNow/1000)-10,user:{id:"player-1"}
    })});
    const requests=[];
    const auth=createWarBoostSupabaseAuthClient({
      url:"https://project.supabase.co",key:"publishable-test-key",storage,
      fetchImpl:async(url,options)=>{
        requests.push({url,options});
        if(String(url).includes("/token?grant_type=refresh_token"))return response(200,{access_token:"access-renewed",refresh_token:"refresh-renewed",expires_in:3600,user:{id:"player-1"}});
        if(String(url).includes("/user"))return response(200,{id:"player-1"});
        if(String(url).includes("/logout"))return response(200,{});
        return response(404,{message:"unexpected auth request"});
      }
    });
    const result=await verifyExistingSupabaseSession(auth.auth);
    assert.equal(result.ok,true);
    assert.equal(result.reauthRequired,undefined);
    assert.equal(result.session.access_token,"access-renewed");
    assert.equal(requests.filter(item=>String(item.url).includes("/token?grant_type=refresh_token")).length,1);
    assert.equal(requests.some(item=>String(item.url).includes("/logout")),false);
    assert.equal(JSON.parse(storage.getItem("sb-project-auth-token")).refresh_token,"refresh-renewed");
  }finally{Date.now=realNow}
}

// 6. An expired session is retained when refresh fails only because the network
// is unavailable; a temporary outage is not treated as a sign-out.
{
  const fixedNow=1_700_000_000_000,realNow=Date.now;
  Date.now=()=>fixedNow;
  try{
    const storage=makeStorage({"sb-project-auth-token":JSON.stringify({
      access_token:"access-expired",refresh_token:"refresh-still-valid",expires_at:Math.floor(fixedNow/1000)-10,user:{id:"player-1"}
    })});
    const auth=createWarBoostSupabaseAuthClient({
      url:"https://project.supabase.co",key:"publishable-test-key",storage,
      fetchImpl:async()=>{throw new Error("offline")}
    });
    const result=await auth.auth.getSession();
    assert.equal(result.data.session.access_token,"access-expired");
    assert.ok(storage.getItem("sb-project-auth-token"));
  }finally{Date.now=realNow}
}

// 7. Only a definitive refresh rejection requires reconnecting; transient
// validation failures retain the session and still attempt the authenticated path.
{
  const session={access_token:"access-old",refresh_token:"refresh-old",user:{id:"player-1"}};
  const invalidAuth={
    getSession:async()=>({data:{session},error:null}),
    getUser:async()=>({data:{user:null},error:Object.assign(new Error("expired"),{status:401})}),
    refreshSession:async()=>({data:{session},error:Object.assign(new Error("invalid_grant"),{status:400,code:"invalid_grant"})})
  };
  const invalid=await verifyExistingSupabaseSession(invalidAuth);
  assert.equal(invalid.reauthRequired,true);
  let reconciliations=0;
  const transientAuth={
    getSession:async()=>({data:{session},error:null}),
    getUser:async()=>({data:{user:null},error:Object.assign(new Error("network unavailable"),{code:"auth_network_unavailable"})})
  };
  const transient=await runAuthenticatedIdleResume({
    auth:transientAuth,currentSession:session,
    reconcile:async()=>{reconciliations++;return {ok:true}}
  });
  assert.equal(transient.ok,true);
  assert.equal(transient.reauthRequired,undefined);
  assert.equal(reconciliations,1);
}

// 8. Idle suspension/resume does not alter the existing player record, Desert
// Storm selections, screenshots, or the Supabase browser session.
{
  const coreKey="warboost_v1_core_state";
  const profile={
    player:{name:"Commander",power_m:125.4},
    scans:{pending:["scan-local-1"]},
    alliance:{desert_storm:{selections:["member-a","member-b"],substitutes:["member-c"]}}
  };
  const serialized=JSON.stringify(profile),storage=makeStorage({[coreKey]:serialized});
  let forcedCalls=0;
  const session={access_token:"access-valid",refresh_token:"refresh-valid",user:{id:"player-1"}};
  const auth={getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session.user},error:null})};
  const env=makeLifecycle({
    storage,
    onResume:()=>runAuthenticatedIdleResume({
      auth,currentSession:session,
      reconcile:async(reason,options)=>{
        forcedCalls++;assert.equal(reason,"idle-resume");assert.equal(options.force,true);
        return {ok:true};
      }
    })
  });
  env.lifecycle.start();
  env.clock.advance(WARBOOST_IDLE_TIMEOUT_MS);
  await env.lifecycle.returnFrom("click");
  assert.equal(forcedCalls,1);
  assert.equal(storage.getItem(coreKey),serialized);
  assert.deepEqual(JSON.parse(storage.getItem(coreKey)),profile);
}

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
assert.match(app,/onSuspend:\(\)=>\{stopForegroundRefreshes\(\);try\{closeDrawers\(\)/);
assert.match(app,/onResume:\(\{reason\}\)=>performIdleResume\(reason\)/);
assert.match(app,/runAuthenticatedIdleResume\(\{[\s\S]*reconcile:reconcileAuthenticatedRuntime/);
assert.match(app,/event==="TOKEN_REFRESHED"&&session/);
assert.match(app,/Mise à jour WarBoost…/);
assert.match(app,/À jour/);
assert.match(index,/app\.js\?v=hf8630-idle-resume-r1/);
assert.match(sw,/warboost-v2-5-30-hf8-6-30-idle-resume-r1/);
assert.doesNotMatch(fs.readFileSync(new URL("../lib/idle-lifecycle.js",import.meta.url),"utf8"),/signOut|removeItem/);

console.log("WarBoost 30-minute inactivity suspension and safe resume: PASS (8 scenarios)");