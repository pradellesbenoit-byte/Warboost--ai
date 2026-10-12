import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {rosterImportRequest,adoptRosterOnlyReply,rosterReplyConfirmed,safeRosterDiagnostic} from "../lib/roster-sync.js";

const api=await readFile(new URL("../api/sync.js",import.meta.url),"utf8"),imports={};
for(const [,names,path] of api.matchAll(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];/gm)){
  const module=await import(new URL(path,new URL("../api/sync.js",import.meta.url)));
  for(const name of names.split(",").map(n=>n.trim()))imports[name]=module[name];
}
const copy=value=>JSON.parse(JSON.stringify(value));
const owner="synthetic-account",revision="2026-10-12T08:00:00.000Z",nextRevision="2026-10-12T09:00:00.000Z";
const member={name:"Synthetic Manager",player_id:owner,warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance",
  role:"R4",server_id:"123",alliance_tag:"TEST",hq_level:35,power_m:229};
const other={name:"Synthetic Existing",role:"R3",server_id:"123",alliance_tag:"TEST",hq_level:30,power_m:150};
const newMember={name:"Synthetic New",role:"R2",server_id:"123",alliance_tag:"TEST",hq_level:20,power_m:99};
function harness(options={}){
  const cloud=imports.normalizeState({player_id:owner,player:{name:member.name,server_id:"123",role:"R4",hq_level:35},
    alliance:{id:"synthetic-alliance",tag:"TEST",server_id:"123",members:[member,other],roster_updated_at:revision},
    squads:[{id:1,power:44.43,updated_at:revision}],drone:{level:100},technology:{hero_tech_pct:17},
    hero_progression:[{hero_name:"Murphy",stars:5}],confirmed_history:["synthetic-confirmation"]});
  // Saved opaque historical fields must remain byte-for-byte unchanged, not normalized and rewritten.
  cloud.extra_history={retained:true};
  let canonical=copy([member,other]),version=revision,attempts=0,successfulWrites=0,otherWrites=0;
  if(options.role)canonical[0].role=options.role;
  if(options.unlinked){canonical[0].warboost_linked=false;delete canonical[0].player_id}
  const before=copy(cloud);
  const context=vm.createContext({...imports,console,
    configured:()=>!options.unavailable,userConfigured:()=>Boolean(options.userMode),
    requireProductUser:async(_req,config)=>{
      assert.equal(config.consent,true);
      if(options.authError)throw Object.assign(Error("private auth detail"),{status:options.authError==="AUTH_REQUIRED"?401:428,code:options.authError});
      return {user:{id:owner}};
    },
    betaAccessForUserAsync:async()=>({allowed:!options.noBeta}),
    getProfile:async id=>{assert.equal(id,owner);return {state:copy(cloud),updated_at:revision}},
    getProfileForUser:async(id,token)=>{assert.equal(id,owner);assert.equal(token,"synthetic-token");return {state:copy(cloud),updated_at:revision}},
    getAllianceRoster:async()=>{
      if(options.reloadFailure&&successfulWrites)throw Object.assign(Error("private SQL"),{code:"SUPABASE_SERVICE_TIMEOUT",status:503});
      const id=options.wrongMembership?"wrong-alliance":"synthetic-alliance";
      const observed=copy(canonical);
      if(options.readMismatch&&successfulWrites)observed.pop();
      return {alliance:{id:"synthetic-alliance",server_id:"123",tag:"TEST",owner_player_id:"another-account",
        roster:observed,updated_at:version,roster_updated_at:version},
        membership:{alliance_id:id,player_id:owner,role:options.role||"R4"},
        roster:copy(canonical),cloud_roster:[],roster_tombstones:[]};
    },
    updateAllianceScopeRoster:async patch=>{
      attempts++;
      if(options.casRace||patch.expected_updated_at!==version)
        throw Object.assign(Error("private SQL"),{code:"alliance_write_conflict",status:409});
      assert.deepEqual(Object.keys(patch).sort(),["alliance_id","expected_updated_at","roster","roster_tombstones"]);
      assert.equal(patch.alliance_id,"synthetic-alliance");
      canonical=copy(patch.roster);version=nextRevision;successfulWrites++;
      if(options.lostResponse)throw Object.assign(Error("private endpoint"),{code:"SUPABASE_SERVICE_TIMEOUT",status:503});
      return {roster:copy(canonical),updated_at:version,roster_updated_at:version};
    },
    saveProfileIfUnchanged:async()=>{otherWrites++;throw Error("unexpected personal write")},
    saveProfileForUserIfUnchanged:async()=>{otherWrites++;throw Error("unexpected personal write")},
    insertSnapshot:async()=>{otherWrites++;throw Error("unexpected history write")},
    insertSnapshotForUser:async()=>{otherWrites++;throw Error("unexpected history write")},
    joinAlliance:async()=>{otherWrites++;throw Error("unexpected membership write")}});
  vm.runInContext(api.replace(/^import .*$/gm,"").replace("export default async function handler","async function handler"),context);
  const local=copy(cloud);local.squads[0].power=99;local.player.hq_level=1;
  local.drone.level=1;local.technology.hero_tech_pct=0;local.extra_history={retained:false};
  local.alliance.members=[newMember];local.alliance.roster_sync_status="pending";
  const request=rosterImportRequest(local,"fr");
  async function send(body=request){
    const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(data){this.body=copy(data);return this}};
    await context.handler({method:"POST",headers:{authorization:"Bearer synthetic-token"},body},res);
    assert.deepEqual(cloud,before,"personal cloud data and history unchanged");
    return res;
  }
  return {send,local,request,cloud,get canonical(){return canonical},get version(){return version},
    get attempts(){return attempts},get successfulWrites(){return successfulWrites},get otherWrites(){return otherWrites}};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log("PASS",name)}

await test("browser request excludes profile, squads, history, links and unrelated roster fields",()=>{
  const h=harness();h.local.alliance.members[0]={...newMember,player_id:"other",warboost_linked:true,
    email:"private@example.test",squad_heroes:["DVA"],membership_status:"left"};
  const body=rosterImportRequest(h.local,"fr");
  assert.equal(body.state,undefined);assert.equal(body.base_updated_at,undefined);
  assert.equal(body.roster_patch.members[0].player_id,undefined);
  assert.doesNotMatch(JSON.stringify(body),/private@|squad_heroes|warboost_linked|extra_history/);
});
await test("actual API accepts roster despite divergent squad and never writes personal data or history",async()=>{
  for(const userMode of [false,true]){
    const h=harness({userMode}),result=await h.send({...h.request,state:h.local});
    assert.equal(result.statusCode,200,JSON.stringify(result.body));
    assert.equal(result.body.state,undefined);assert.ok(rosterReplyConfirmed(result.body));
    assert.equal(h.otherWrites,0);assert.equal(h.successfulWrites,1);
    assert.deepEqual(h.canonical.map(r=>r.name),[member.name,other.name,newMember.name]);
    assert.equal(h.canonical[0].player_id,owner);assert.equal(h.canonical[0].warboost_linked,true);
  }
});
await test("adopting roster response preserves all local personal changes and pending-save state",async()=>{
  const h=harness();h.local.sync.pending_cloud_save=true;
  const result=await h.send(),adopted=adoptRosterOnlyReply(h.local,result.body);
  for(const key of Object.keys(h.local).filter(key=>key!=="alliance"))assert.deepEqual(adopted[key],h.local[key]);
  assert.equal(adopted.alliance.roster_sync_status,"synced");
  const concurrent=adoptRosterOnlyReply(h.local,result.body,{changedDuringSync:true});
  assert.deepEqual(concurrent.alliance.members,h.local.alliance.members);
  assert.equal(concurrent.alliance.roster_sync_status,"pending");
  assert.throws(()=>adoptRosterOnlyReply(h.local,{...result.body,player_id:"another-account"}));
});
await test("empty or complete smaller imports never implicitly remove members",async()=>{
  const h=harness(),empty=await h.send({...h.request,roster_patch:{...h.request.roster_patch,members:[]}});
  assert.equal(empty.statusCode,422);assert.equal(h.attempts,0);
  const result=await h.send({...h.request,roster_patch:{...h.request.roster_patch,members:[newMember],
    roster_snapshot_complete_at:"2099-01-01T00:00:00Z",roster_removal_tombstones:[member]}});
  assert.equal(result.statusCode,200);assert.equal(h.canonical.length,3);
});
await test("roster version required and stale or concurrent revisions rejected before successful write",async()=>{
  for(const mode of ["missing","stale","race"]){
    const h=harness({casRace:mode==="race"}),body=copy(h.request);
    if(mode==="missing")delete body.base_roster_updated_at;
    if(mode==="stale")body.base_roster_updated_at="old";
    const result=await h.send(body);
    assert.equal(result.statusCode,409);assert.equal(h.successfulWrites,0);
    assert.equal(result.body.roster_confirmation.write_state,"not_attempted");
  }
});
await test("R3, unlinked identity or different membership cannot grant themselves R4 from browser",async()=>{
  for(const opts of [{role:"R3"},{unlinked:true},{wrongMembership:true}]){
    const h=harness(opts),result=await h.send({...h.request,state:{...h.local,player:{role:"R5"}}});
    assert.equal(result.statusCode,403);assert.equal(result.body.error,"r4_r5_required");
    assert.equal(h.attempts,0);assert.equal(h.otherWrites,0);
    assert.equal(result.body.roster_confirmation.write_state,"not_attempted");
  }
});
await test("R4 and R5 canonical authorization succeeds without membership mutation",async()=>{
  for(const role of ["R4","R5"]){const h=harness({role}),result=await h.send();assert.equal(result.statusCode,200);assert.equal(h.otherWrites,0)}
});
await test("wrong alliance, server and cross-scope rows are rejected without writes",async()=>{
  for(const patch of [{server_id:"456"},{alliance_tag:"OTHER"},{alliance_id:"other"},
    {members:[{...newMember,server_id:"456"}]}]){
    const h=harness(),result=await h.send({...h.request,roster_patch:{...h.request.roster_patch,...patch}});
    assert.equal(result.statusCode,403);assert.equal(result.body.error,"roster_scope_mismatch");assert.equal(h.attempts,0);
  }
});
await test("session, consent, beta and cloud failures explicitly report not_attempted",async()=>{
  for(const options of [{authError:"AUTH_REQUIRED"},{authError:"BETA_CONSENT_REQUIRED"},{noBeta:true},{unavailable:true}]){
    const h=harness(options),result=await h.send();
    assert.notEqual(result.statusCode,200);assert.equal(h.attempts,0);assert.equal(h.otherWrites,0);
    assert.equal(result.body.roster_confirmation.write_state,"not_attempted");
    assert.doesNotMatch(JSON.stringify(result.body),/private auth|Synthetic Manager/);
  }
});
await test("personal sync still refuses ambiguous squads, before all writes",async()=>{
  const h=harness(),result=await h.send({operation:"player_sync",state:h.local,base_updated_at:revision,base_roster_updated_at:revision});
  assert.equal(result.statusCode,409);assert.equal(result.body.error,"squad_freshness_ambiguous");
  assert.equal(result.body.roster_confirmation.write_state,"not_attempted");
  assert.equal(h.attempts,0);assert.equal(h.otherWrites,0);
});
await test("lost PATCH response stays unknown and stale replay cannot repeat a write",async()=>{
  const h=harness({lostResponse:true}),result=await h.send();
  assert.equal(result.statusCode,503);assert.equal(result.body.roster_confirmation.write_state,"unknown");
  assert.equal(h.successfulWrites,1);assert.equal(h.canonical.length,3);
  const retry=await h.send();
  assert.equal(retry.statusCode,409);assert.equal(h.attempts,1);assert.equal(h.canonical.length,3);
  assert.equal(retry.body.roster_confirmation.write_state,"not_attempted");
});
await test("failed readback acknowledges partial write but never reports synced; diagnostics contain no PII",async()=>{
  const h=harness({reloadFailure:true}),result=await h.send();
  assert.equal(result.statusCode,503);assert.equal(result.body.roster_confirmation.write_state,"confirmed");
  assert.equal(result.body.state,undefined);assert.equal(rosterReplyConfirmed(result.body),false);
  assert.doesNotMatch(JSON.stringify(result.body),/private SQL|Synthetic Manager|synthetic-account|email/);
  const diagnostic=safeRosterDiagnostic({}, {status:result.statusCode},result.body);
  assert.equal(diagnostic.write_state,"confirmed");assert.equal(h.otherWrites,0);
});
await test("fresh-version repeat is additive and preserves exactly one row per identity",async()=>{
  const h=harness();assert.equal((await h.send()).statusCode,200);
  assert.equal((await h.send({...h.request,base_roster_updated_at:h.version})).statusCode,200);
  assert.equal(h.canonical.length,3);assert.equal(new Set(h.canonical.map(r=>r.name)).size,3);
});
await test("readback with wrong roster contents is never accepted even with correct version",async()=>{
  const h=harness({readMismatch:true}),result=await h.send();
  assert.equal(result.statusCode,409);assert.equal(result.body.error,"roster_sync_unconfirmed");
  assert.equal(result.body.roster_confirmation.write_state,"confirmed");
  assert.equal(result.body.authorization.allowed,true);assert.equal(rosterReplyConfirmed(result.body),false);
});
console.log(`PASS roster-only operation: ${passed} groups; actual handler/helpers, synthetic auth and DB transports, no real cloud writes.`);
