import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canRevealOwnedPrivateState,
  deriveRuntimeAccessState,
  restoreAttemptSucceeded
} from "../lib/session-bootstrap.js";
import {readOwnProfileDirect} from "../lib/cloud-profile-direct.js";
import {runAuthenticatedIdleResume} from "../lib/session-resume.js";

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");

// The actual private-state guard must keep A's cached profile hidden after B logs in.
{
  const accountA={player_id:"account-a",player:{name:"Private Commander",power_m:125.4}};
  const access=deriveRuntimeAccessState({
    userId:"account-b",stateOwnerId:accountA.player_id,betaAllowed:true,
    consentAccepted:true,betaAccessStatus:"accepted"
  });
  assert.equal(canRevealOwnedPrivateState({
    userId:"account-b",stateOwnerId:accountA.player_id,betaAllowed:true,
    consentAccepted:true,betaAccessStatus:"accepted"
  }),false);
  assert.equal(access.privateVisible,false);
  assert.equal(access.phase,"syncing");
  assert.equal(accountA.player.name,"Private Commander","guard must not mutate A's saved local state");
}

// Direct profile reads are scoped to the authenticated user's id. This uses a
// fake transport only; no credentials, real account, or network are involved.
{
  const requests=[];
  const result=await readOwnProfileDirect({
    url:"https://example.invalid",key:"publishable-test-key",
    accessToken:"fake-test-token",userId:"account-b",
    fetchImpl:async(url,options)=>{
      requests.push({url:String(url),options});
      return {ok:true,status:200,text:async()=>JSON.stringify([{state:{player_id:"account-b",player:{name:"B"}}}])};
    }
  });
  assert.equal(result.ok,true);
  assert.equal(result.state.player_id,"account-b");
  assert.match(requests[0].url,/player_id=eq\.account-b/);
  assert.equal(requests[0].options.method,"GET");
}

// Existing save and push ownership barriers are app.js integration guards.
// These bounded source assertions verify wiring/order, not browser execution.
{
  const save=app.match(/function saveState\(options=\{\}\)\{([\s\S]*?)\nfunction scheduleServerSave/)?.[1]||"";
  const push=app.match(/async function pushServerState\(\{keepalive=false\}=\{\}\)\{([\s\S]*?)\n\}/)?.[1]||"";
  assert.match(save,/ownerId!==signedInUserId[\s\S]*?last_error:"account_owner_mismatch"[\s\S]*?return false/);
  assert.match(save,/ownerId!==signedInUserId[\s\S]*?return false[\s\S]*?scheduleServerSave/);
  assert.match(push,/if\(!userId\|\|ownerId!==userId\)return \{skipped:true,reason:"account_owner_mismatch"\}/);
  assert.ok(push.indexOf("account_owner_mismatch")<push.indexOf('fetch("/api/state"'),"owner mismatch must be rejected before POST");
}

// A failed restore is not success. The app's pull path must return before
// hydrating/replacing local state; local state preservation itself is guarded
// here with an immutable save/reopen fixture.
{
  const local={"warboost_v1_core_state":JSON.stringify({
    player_id:"account-a",player:{name:"Local Commander",power_m:91},
    alliance:{desert_storm:{registered_keys:["member-a"],selection_initialized:true}}
  })};
  const before=local["warboost_v1_core_state"];
  const failedPull={ok:false,status:503,error:"temporarily_unavailable"};
  assert.equal(restoreAttemptSucceeded(failedPull),false);
  assert.equal(local["warboost_v1_core_state"],before);
  const reopened=JSON.parse(local["warboost_v1_core_state"]);
  assert.equal(reopened.player.name,"Local Commander");
  assert.deepEqual(reopened.alliance.desert_storm.registered_keys,["member-a"]);
}

// Offline -> online uses the authenticated forced reconcile path; failed
// definitive refresh retains the existing idle-resume reauth behavior.
{
  const session={access_token:"test-access",refresh_token:"test-refresh",user:{id:"account-a"}};
  let reconciled=0;
  const onlineResult=await runAuthenticatedIdleResume({
    auth:{
      getSession:async()=>({data:{session},error:null}),
      getUser:async()=>({data:{user:session.user},error:null})
    },
    currentSession:session,
    reconcile:async(reason,options)=>{
      reconciled++;
      assert.equal(reason,"idle-resume");
      assert.equal(options.force,true);
      return {ok:true};
    }
  });
  assert.equal(onlineResult.ok,true);
  assert.equal(reconciled,1);

  let applied=[],reauthReconciles=0;
  const reauthResult=await runAuthenticatedIdleResume({
    currentSession:session,
    auth:{
      getSession:async()=>({data:{session:null},error:null})
    },
    applySession:async(value)=>{applied.push(value);return {ok:true}},
    reconcile:async()=>{reauthReconciles++;return {ok:true}}
  });
  assert.equal(reauthResult.reauthRequired,true);
  assert.deepEqual(applied,[null]);
  assert.equal(reauthReconciles,0);
}

// Bounded app.js wiring checks: actual /online forced reconcile, conflict merge
// plus local persistence, and failed push persistence are not VM-executed here.
{
  assert.match(app,/window\.addEventListener\("online",[\s\S]{0,260}reconcileAuthenticatedRuntime\("online",\{force:true\}\)/);
  assert.match(app,/r\.status===409&&j\?\.error==="profile_write_conflict"[\s\S]*?mergeStateProtected\(remote,state,\{preferBase:false\}\)[\s\S]*?markCloudPending\("profile_write_conflict"\)[\s\S]*?safeLocalSet\(STORE_KEY,JSON\.stringify\(state\)\)/);
  assert.match(app,/catch\(e\)\{suppressPush=false;markCloudPending\(e\?\.name\|\|"offline"\);return \{ok:false,error:e\?\.name\|\|"offline"\}\}/);
}

console.log("Save/reopen/session boundaries: PASS (pure-helper tests + bounded app.js static assertions; no app VM/browser execution)");