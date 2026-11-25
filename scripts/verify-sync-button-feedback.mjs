import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource=fs.readFileSync("app.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const helperStart=appSource.indexOf("function syncButtonFeedbackMessage(kind){");
const handlerStart=appSource.indexOf("async function syncAll(){",helperStart);
const handlerEnd=appSource.indexOf('\n$("#syncAllBtn").addEventListener("click",syncAll)',handlerStart);
assert.ok(helperStart>=0&&handlerStart>helperStart&&handlerEnd>handlerStart,"sync feedback helpers and handler must remain extractable");
const testedCode=appSource.slice(helperStart,handlerEnd);
const messages={
  account_sync_verified:"SYNC_CONFIRMED",
  account_sync_pending:"SYNC_PENDING",
  account_sync_unconfirmed:"WRITE_UNCONFIRMED",
  account_sync_conflict:"SYNC_CONFLICT",
  beta_signin_required:"SIGN_IN_REQUIRED",
  beta_consent_required:"CONSENT_REQUIRED",
  account_sync_forbidden:"SYNC_FORBIDDEN",
  account_sync_network:"SYNC_NETWORK_ERROR",
  account_sync_timeout:"SYNC_TIMEOUT",
  account_sync_server:"SYNC_SERVER_ERROR"
};
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
function clone(value){return JSON.parse(JSON.stringify(value))}
function makeState({owner="user-1",rosterStatus="synced"}={}){
  return {
    player_id:owner,
    player:{name:"Synthetic commander"},
    alliance:{tag:"TEST",roster_sync_status:rosterStatus,roster_updated_at:"2026-01-01T00:00:00.000Z"},
    squads:[{id:1,power:45,heroes:[{name:"Synthetic hero",level:100}]}],
    sync:{status:"ok",pending_cloud_save:false,sources:{}}
  };
}
function harness({caseType="confirmed",session=true,access=true,consent=true,rosterStatus="synced",reply=null}={}){
  const owner="user-1",baseRevision="2026-01-01T00:00:00.000Z";
  const baseline=makeState({owner,rosterStatus}),squadBefore=clone(baseline.squads);
  const nodes=new Map(["syncAllBtn","syncPlayerBtn","syncAllFeedback","syncPlayerFeedback","playerSyncInfo"].map(id=>[id,{
    id,disabled:false,textContent:"initial",className:"",dataset:{},
    classList:{add(){},remove(){}}
  }]));
  const sandbox={
    cloudSession:session?{access_token:"synthetic-session",user:{id:owner}}:null,
    state:baseline,localStateRevision:7,cloudRevision:baseRevision,lang:"fr",
    navigator:{onLine:true},
    requireBetaAccess:()=>access,
    requireBetaConsent:()=>consent,
    rosterImportInFlight:false,
    $:selector=>nodes.get(String(selector).replace(/^#/,""))||null,
    t:key=>messages[key]||String(key),
    rosterSyncCopy:()=>({pending:"ROSTER_PENDING",refresh:"RETRY_WHEN_READY"}),
    analysisIndicator:{begin:()=>()=>{}},
    hasMeaningfulCore:()=>true,
    reconcileAuthenticatedRuntime:async()=>({ok:true}),
    scheduleCloudPullRetry:()=>{},
    scheduleCloudRetry:()=>{},
    rosterStateFingerprint:state=>JSON.stringify(state.alliance),
    persistRosterCandidate:async()=>reply||{confirmed:true,status:"synced"},
    adoptRosterOnlyReply:(state,ack)=>({...state,alliance:{...state.alliance,roster_sync_status:ack.status||"pending"}}),
    saveState:()=>true,
    render:()=>vm.runInNewContext("__renderFeedback()",sandbox),
    rosterReplyConfirmed:ack=>ack?.confirmed===true,
    authHeaders:headers=>headers,
    fetchJsonBounded:async()=>{
      if(caseType==="network")throw new TypeError("synthetic network failure");
      const bodyState={...clone(baseline),player_id:caseType==="owner-mismatch"?"other-user":owner};
      const response={
        confirmed:{ok:true,status:200},
        unconfirmed:{ok:true,status:200},
        conflict:{ok:false,status:409},
        server:{ok:false,status:503},
        "owner-mismatch":{ok:true,status:200}
      }[caseType];
      const body={
        confirmed:{ok:true,state:bodyState,updated_at:"2026-01-02T00:00:00.000Z"},
        unconfirmed:{ok:true,state:bodyState,updated_at:null},
        conflict:{ok:false,error:"profile_write_conflict",state:bodyState,updated_at:baseRevision},
        server:{ok:false,error:"SERVICE_UNAVAILABLE"},
        "owner-mismatch":{ok:true,state:bodyState,updated_at:"2026-01-02T00:00:00.000Z"}
      }[caseType];
      return {response,json:body};
    },
    hydrateCloudState:remote=>remote,
    initialState:()=>makeState({owner}),
    mergeStateProtected:(local,remote)=>({...local,...remote,squads:clone(local.squads)}),
    reconcileCloudSquads:(local,remote,merged)=>({state:merged,localNewer:[],conflicts:[]}),
    repairLegacySquadIdentity:state=>({state}),
    adoptCanonicalPendingAccounts:state=>state,
    safeRosterDiagnostic:(error,response,body)=>({
      code:error?.code||error?.message||"safe_roster_error",
      http_status:response?.status||error?.http_status||error?.status||null
    }),
    recordRosterDiagnostic:diagnostic=>diagnostic,
    rosterFailureKind:()=> "network",
    renderRosterSyncDiagnostic:()=>{}
  };
  vm.runInNewContext(`let syncButtonFeedbackState=null;\n${testedCode}\nglobalThis.__syncAll=syncAll;globalThis.__renderFeedback=renderSyncButtonFeedback;`,sandbox);
  return {sandbox,nodes,squadBefore,run:()=>vm.runInNewContext("__syncAll()",sandbox)};
}
function bothFeedback(harnessResult){
  return ["syncPlayerFeedback","syncAllFeedback"].map(id=>harnessResult.nodes.get(id).textContent);
}

await test("markup preserves original source IDs and adds one accessible status by each button",()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  const counts=ids.reduce((map,id)=>(map[id]=(map[id]||0)+1,map),{});
  for(const id of ["publicSourceState","scanSourceState","allianceCloudState","syncPlayerBtn","syncAllBtn","syncPlayerFeedback","syncAllFeedback"])
    assert.equal(counts[id],1,`${id} must occur exactly once`);
  assert.deepEqual(Object.entries(counts).filter(([,count])=>count>1),[]);
  for(const id of ["syncPlayerFeedback","syncAllFeedback"]){
    const markup=html.match(new RegExp(`<div id="${id}"[^>]*>`))?.[0]||"";
    assert.match(markup,/role="status"/);
    assert.match(markup,/aria-live="polite"/);
  }
  assert.ok(appSource.includes('$("#syncAllBtn").addEventListener("click",syncAll);$("#syncPlayerBtn").addEventListener("click",syncAll);'),
    "both sync buttons must invoke the same syncAll handler");
});

await test("only a newer, owner-matched server acknowledgement reports success on both buttons",async()=>{
  const h=harness({caseType:"confirmed"});
  await h.run();
  assert.deepEqual(bothFeedback(h),["SYNC_CONFIRMED","SYNC_CONFIRMED"]);
  assert.equal(h.nodes.get("syncAllBtn").disabled,false);
  assert.equal(h.nodes.get("syncPlayerBtn").disabled,false);
  assert.deepEqual(h.sandbox.state.squads,h.squadBefore);
  for(const id of ["syncPlayerFeedback","syncAllFeedback"])h.nodes.get(id).textContent="";
  vm.runInNewContext("__renderFeedback()",h.sandbox);
  assert.deepEqual(bothFeedback(h),["SYNC_CONFIRMED","SYNC_CONFIRMED"],"status must survive a rerender");
});

await test("an HTTP-success response without a confirmed newer write stays pending",async()=>{
  const h=harness({caseType:"unconfirmed"});
  await h.run();
  const feedback=bothFeedback(h).join(" ");
  assert.match(feedback,/SYNC_PENDING/);
  assert.match(feedback,/WRITE_UNCONFIRMED/);
  assert.doesNotMatch(feedback,/SYNC_CONFIRMED/);
  assert.deepEqual(h.sandbox.state.squads,h.squadBefore);
});

await test("409 revision conflicts remain visible as conflicts",async()=>{
  const h=harness({caseType:"conflict"});
  await h.run();
  assert.deepEqual(bothFeedback(h),["SYNC_CONFLICT","SYNC_CONFLICT"]);
  assert.deepEqual(h.sandbox.state.squads,h.squadBefore);
});

await test("network and server failures stay visible without exposing raw details",async()=>{
  const network=harness({caseType:"network"});
  await network.run();
  assert.deepEqual(bothFeedback(network),["SYNC_NETWORK_ERROR","SYNC_NETWORK_ERROR"]);
  assert.doesNotMatch(bothFeedback(network).join(" "),/synthetic|user-1|DATABASE/);
  const server=harness({caseType:"server"});
  await server.run();
  assert.deepEqual(bothFeedback(server),["SYNC_SERVER_ERROR","SYNC_SERVER_ERROR"]);
  assert.deepEqual(server.sandbox.state.squads,server.squadBefore);
});

await test("missing session, access, and consent each produce a visible prerequisite message",async()=>{
  const noSession=harness({session:false});
  await noSession.run();
  assert.deepEqual(bothFeedback(noSession),["SIGN_IN_REQUIRED","SIGN_IN_REQUIRED"]);
  const noAccess=harness({access:false});
  await noAccess.run();
  assert.deepEqual(bothFeedback(noAccess),["SYNC_FORBIDDEN","SYNC_FORBIDDEN"]);
  const noConsent=harness({consent:false});
  await noConsent.run();
  assert.deepEqual(bothFeedback(noConsent),["CONSENT_REQUIRED","CONSENT_REQUIRED"]);
});

await test("profile owner mismatch is reported and server-owned squad state is preserved",async()=>{
  const h=harness({caseType:"owner-mismatch"});
  await h.run();
  assert.match(bothFeedback(h).join(" "),/Compte différent/);
  assert.deepEqual(h.sandbox.state.squads,h.squadBefore);
});

await test("pending roster sync never reports success without roster confirmation",async()=>{
  const h=harness({rosterStatus:"pending",reply:{confirmed:false,status:"pending"}});
  await h.run();
  assert.deepEqual(bothFeedback(h),["ROSTER_PENDING RETRY_WHEN_READY","ROSTER_PENDING RETRY_WHEN_READY"]);
  assert.deepEqual(h.sandbox.state.squads,h.squadBefore);
});

await test("confirmed roster sync can report success only after the explicit roster acknowledgement",async()=>{
  const h=harness({rosterStatus:"pending",reply:{confirmed:true,status:"synced"}});
  await h.run();
  assert.deepEqual(bothFeedback(h),["SYNC_CONFIRMED","SYNC_CONFIRMED"]);
  assert.deepEqual(h.sandbox.state.squads,h.squadBefore);
});

console.log(`PASS sync button feedback: ${passed} regression groups; app.js helpers/handler in VM, synthetic responses only, no network or cloud writes.`);
