import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {parseRosterConfidence,safeRosterDiagnostic,recordRosterDiagnostic,rosterDiagnostics,rosterFailureKind,rosterReplyConfirmed,adoptRosterOnlyReply,rosterImportRequest} from "../lib/roster-sync.js";
import {ROSTER_SYNC_LOCALES,rosterSyncCopy} from "../lib/roster-sync-copy.js";
import {applyRosterImportLifecycle} from "../lib/alliance-roster-lifecycle.js";
import {createAnalysisIndicator,beginLoadingButton} from "../lib/analysis-indicator.js";
import {normalizeServerId,normalizeAllianceTag} from "../lib/alliance-identity.js";
const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
let passed=0;
async function test(name,fn){await fn();passed++;console.log("PASS",name)}
const plain=value=>JSON.parse(JSON.stringify(value));
const slice=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
await test("absent, invalid and ambiguous confidence stays unknown",()=>{
  for(const value of [null,undefined,""," ","null","bad",false,[],{},-1,2,80,Infinity,NaN])
    assert.equal(parseRosterConfidence(value),null);
});
await test("explicit zero, fractional and explicitly percent confidence parsed",()=>{
  for(const value of [0,"0","0.0","0,0","0 %"])assert.equal(parseRosterConfidence(value),0);
  for(const value of [.8,"0,8","80%"])assert.equal(parseRosterConfidence(value),.8);
});
const mergeContext=vm.createContext({currentRosterIdentityContext:()=>({alliance_tag:"TEST"}),
  cleanRosterOcrName:v=>v,rosterIdentityKey:v=>v.toLowerCase(),scanRole:v=>/^R[1-5]$/.test(v)?v:null,
  parseRosterConfidence,rosterSyncCopy,lang:"fr"});
vm.runInContext(slice("function mergeRosterScanRows(","function resolveCurrentRosterScanDraft("),mergeContext);
await test("three synthetic captures and successive merge preserve identity, grade, HQ and power",()=>{
  const original=[{name:"Synthetic A",role:"R3",hq_level:35,power_m:229},
    {name:"Synthetic B",role:"R4",hq_level:31,power_m:180,confidence:null},
    {name:"Synthetic C",role:"R2",hq_level:20,power_m:99}];
  let rows=[];for(const row of original)rows=mergeContext.mergeRosterScanRows(rows,[row]);
  for(let i=0;i<4;i++)rows=mergeContext.mergeRosterScanRows([],rows);
  for(const row of original){
    const actual=rows.find(r=>r.name===row.name);
    for(const key of ["name","role","hq_level","power_m"])assert.equal(actual[key],row[key]);
    assert.equal(actual.confidence,null);
  }
  assert.equal(mergeContext.mergeRosterScanRows([],[{...original[0],confidence:0}])[0].confidence,0);
});
await test("unknown confidence UI is not zero; names are left editable, not guessed",()=>{
  assert.match(mergeContext.rosterConfidenceLabel(null),/Non renseignée.*À vérifier/);
  assert.equal(mergeContext.rosterConfidenceLabel(0),"0 %");
  assert.match(app,/esc\(rosterConfidenceLabel\(r\.confidence\)\)/);
  assert.match(app,/rosterSyncCopy\(lang\)\.verifyName/);
});
await test("all 22 locales have complete feedback, without modifying existing dictionaries",()=>{
  assert.equal(ROSTER_SYNC_LOCALES.length,22);
  for(const locale of ROSTER_SYNC_LOCALES)
    assert.ok(Object.values(rosterSyncCopy(locale)).every(value=>typeof value==="string"&&value.length>0));
});
await test("private diagnostics bounded, no raw message, token, profile, email or SQL",()=>{
  for(let i=0;i<9;i++)recordRosterDiagnostic(safeRosterDiagnostic({code:"database_permissions_missing"},
    {status:503},{error:"database_permissions_missing",upstream_code:"42501",
      message:"do-not-log-this-token mail@example.test",state:{player:{name:"Private Name"}},query:"private SQL"}));
  const data=rosterDiagnostics();assert.equal(data.length,5);assert.equal(data[0].upstream_code,"42501");
  assert.doesNotMatch(JSON.stringify(data),/do-not-log|mail@|Private Name|private SQL|message|player/);
  assert.equal(safeRosterDiagnostic({code:"do-not-log-this-token"}).code,"roster_sync_failed");
});
await test("action categories cover auth, consent, roles, conflicts, network, timeout and server",()=>{
  for(const [code,kind,status] of [["AUTH_REQUIRED","auth",401],["BETA_CONSENT_REQUIRED","consent",428],
    ["BETA_INVITE_REQUIRED","beta",403],["r4_r5_required","role",403],["profile_write_conflict","conflict",409],
    ["alliance_write_conflict","conflict",409],["network_error","network",null],["request_timeout","timeout",null],
    ["SUPABASE_SERVICE_TIMEOUT","timeout",503],["database_permissions_missing","server",503],
    ["roster_sync_unconfirmed","unconfirmed",200]])
    assert.equal(rosterFailureKind({code,http_status:status}),kind);
  assert.equal(rosterFailureKind({code:"roster_canonical_persist_required",authorization_allowed:false}),"role");
});
const owner="synthetic-owner",revision="2026-10-12T08:00:00.000Z";
const seed=()=>({player_id:owner,player:{name:"Synthetic Manager",server_id:"123",role:"R4"},
  alliance:{tag:"TEST",server_id:"123",members:[{name:"Existing",role:"R3",hq_level:30,power_m:150}],
    roster_review:[],former_members:[],roster_updated_at:revision},sync:{sources:{}}});
function browserContext(){
  const state=seed();
  const context=vm.createContext({state,cloudSession:{access_token:"synthetic-session",user:{id:owner}},
    normalizeServerId,normalizeAllianceTag,
    betaAccessAllowed:()=>true,betaConsentAccepted:()=>true,authHeaders:h=>h,cloudRevision:revision,
    localStateRevision:0,lang:"fr",t:key=>key,parseRosterConfidence,safeRosterDiagnostic,
     recordRosterDiagnostic,rosterFailureKind,rosterSyncCopy,rosterReplyConfirmed,adoptRosterOnlyReply,rosterImportRequest,
    canonicalRosterMemberKey:r=>r.name,
    applyRosterImportLifecycle,
    mergeStateProtected:(base,incoming,{preferBase=false}={})=>structuredClone(preferBase?base:incoming),
    reconcileCloudSquads:(_base,_incoming,merged)=>({state:merged}),
    hydrateCloudState:v=>structuredClone(v),initialState:seed,preservePendingRoster:(_local,remote)=>remote,
    adoptCanonicalPendingAccounts:v=>v,saveState:()=>true,render:()=>{},$:()=>null,
    renderRosterSyncDiagnostic:()=>{},beginLoadingButton,analysisIndicator:createAnalysisIndicator()});
  vm.runInContext(slice("function beginRosterUpdateFeedback(","let rosterImportInFlight=false;"),context);
  vm.runInContext(slice("async function persistRosterCandidate(","function renderRosterSyncDiagnostic("),context);
  vm.runInContext(slice("let rosterImportInFlight=false;","function renderRosterScanFiles("),context);
  return context;
}
const status=()=>({id:"synthetic-status",textContent:"",classList:{remove(){}}});
const row={name:"Synthetic New",role:"R3",hq_level:35,power_m:229};
await test("late roster success or failure cannot overwrite a different alliance or server",async()=>{
  for(const field of ["tag","server_id","id"]){
    for(const fail of [false,true,"timeout"]){
      const c=browserContext();let settle,reject;
      c.fetchJsonBounded=()=>new Promise((resolve,no)=>{settle=resolve;reject=no});
      const pending=c.applyRosterRows([row],{status:status()});
      c.state.alliance[field]="different-synthetic-scope";
      const before=JSON.stringify(c.state);
      if(fail==="timeout")reject(new Error("synthetic_timeout"));
      else settle({response:{ok:!fail,status:fail?503:200},json:fail?{error:"sync_failed"}:
        {ok:true,state:seed(),roster_confirmation:{requested:true,persisted:true}}});
      const result=await pending;
      assert.equal(result.synced,false);
      assert.equal(JSON.stringify(c.state),before,"late data must not be merged into the new scope");
    }
  }
});
await test("actual browser importer shows effective error, retains rows and safe pending state",async()=>{
  for(const code of ["AUTH_REQUIRED","BETA_CONSENT_REQUIRED","r4_r5_required","alliance_write_conflict","request_timeout"]){
    const c=browserContext(),notice=status();
    c.fetchJsonBounded=async()=>({response:{ok:false,status:code==="alliance_write_conflict"?409:503},
      json:{error:code,message:"private backend data",roster_confirmation:{write_state:"unknown"}}});
    const result=await c.applyRosterRows([row],{status:notice});
    assert.equal(result.synced,false);assert.equal(c.state.alliance.roster_sync_status,"pending");
    assert.ok(c.state.alliance.members.some(r=>r.name==="Existing"));
    assert.ok(c.state.alliance.members.some(r=>r.name===row.name));
    assert.doesNotMatch(notice.textContent,/null|private backend data/);
    assert.ok(notice.textContent.includes(c.state.alliance.roster_sync_error));
    assert.match(notice.textContent,/Actualise.*revérifie/);
  }
});
await test("HTTP 200 alone, profile-only or malformed reply never marks roster synced",async()=>{
  for(const reply of [{},{ok:true,state:seed()},{
    ok:true,state:{...seed(),alliance:{...seed().alliance,roster_sync_status:"synced"}},
    roster_confirmation:{requested:true,persisted:false}}]){
    const c=browserContext();c.fetchJsonBounded=async()=>({response:{ok:true,status:200},json:reply});
    const result=await c.applyRosterRows([row],{status:status()});
    assert.equal(result.synced,false);assert.equal(result.diagnostic.code,"roster_sync_unconfirmed");
  }
});
await test("explicit canonical acknowledgement accepted, including safe older API acknowledgement",async()=>{
  for(const extra of [{roster_confirmation:{requested:true,persisted:true}}, {alliance_pending_source:"canonical"}]){
    const c=browserContext();
    c.fetchJsonBounded=async(_path,request)=>{
      const body=JSON.parse(request.body);assert.equal(body.base_roster_updated_at,revision);
       assert.equal(body.operation,"alliance_roster");assert.equal(body.state,undefined);
       return {response:{ok:true,status:200},json:{ok:true,state:{...seed(),
         alliance:{...seed().alliance,members:body.roster_patch.members,roster_sync_status:"synced"}},updated_at:revision,...extra}};
    };
    assert.equal((await c.applyRosterRows([row])).synced,true);
  }
});
await test("retry retains original complete-snapshot date; duplicate simultaneous confirmation not sent",async()=>{
  const c=browserContext();let finish,calls=0;
  c.fetchJsonBounded=()=>{calls++;return new Promise(resolve=>{finish=resolve})};
  const first=c.applyRosterRows([row],{complete:true,status:status()});
  assert.equal(await c.applyRosterRows([row],{complete:true}),null);assert.equal(calls,1);
  finish({response:{ok:false,status:500},json:{error:"sync_failed"}});
  await first;const snapshot=c.state.alliance.roster_snapshot_complete_at;
  c.fetchJsonBounded=async()=>({response:{ok:false,status:409},json:{error:"alliance_write_conflict"}});
  await c.applyRosterRows([row],{complete:true});
  assert.equal(c.state.alliance.roster_snapshot_complete_at,snapshot);
  assert.equal(c.state.alliance.members.filter(r=>r.name===row.name).length,1,"actual lifecycle deduplicates a retry");
});
await test("wrong account, missing consent and beta access do not issue network writes",async()=>{
  for(const kind of ["owner","auth","consent","beta"]){
    const c=browserContext();let calls=0;c.fetchJsonBounded=async()=>{calls++;throw Error("must not run")};
    if(kind==="auth")c.cloudSession.access_token=null;
    if(kind==="consent")c.betaConsentAccepted=()=>false;
    if(kind==="beta")c.betaAccessAllowed=()=>false;
    const candidate=seed();if(kind==="owner")candidate.player_id="another-owner";
    await assert.rejects(c.persistRosterCandidate(candidate));assert.equal(calls,0);
  }
});
await test("failed local persistence is not described as data saved on device",async()=>{
  const c=browserContext(),notice=status();c.saveState=()=>false;
  c.fetchJsonBounded=async()=>{throw Object.assign(Error("private"),{name:"TypeError"})};
  const result=await c.applyRosterRows([row],{status:notice});
  assert.equal(result.locally_saved,false);assert.match(notice.textContent,/Sauvegarde locale impossible/);
  assert.doesNotMatch(notice.textContent,/Roster conservé/);
});
await test("partial-write API error remains pending with true technical outcome and preserved data",async()=>{
  const c=browserContext(),notice=status();
  c.fetchJsonBounded=async()=>({response:{ok:false,status:503},json:{error:"database_permissions_missing",
    upstream_code:"42501",roster_confirmation:{persisted:true,write_state:"confirmed"}}});
  const result=await c.applyRosterRows([row],{status:notice});
  assert.equal(result.synced,false);assert.equal(result.diagnostic.write_state,"confirmed");
  assert.equal(result.diagnostic.upstream_code,"42501");assert.match(notice.textContent,/peuvent déjà avoir eu lieu/);
  assert.ok(c.state.alliance.members.some(r=>r.name==="Existing"));
});
await test("late account change cannot save a result into another account",async()=>{
  const c=browserContext();let saved=0;c.saveState=()=>{saved++;return true};
  c.fetchJsonBounded=async()=>{c.cloudSession.user.id="other-owner";return {response:{ok:true,status:200},json:{ok:true,state:seed()}}};
  const result=await c.applyRosterRows([row]);assert.equal(result.synced,false);
  assert.equal(saved,0);assert.equal(result.error.code,"account_changed");
});
await test("new local edits during successful request remain pending, never claim fully synced",async()=>{
  const c=browserContext(),notice=status();
  c.fetchJsonBounded=async(_path,request)=>{
    const body=JSON.parse(request.body);c.localStateRevision++;
    c.state.alliance.roster_sync_status="pending";c.state.alliance.members[0].hq_level=36;
    return {response:{ok:true,status:200},json:{ok:true,roster_confirmation:{requested:true,persisted:true},
       state:{...seed(),alliance:{...seed().alliance,members:body.roster_patch.members,roster_sync_status:"synced"}}}};
  };
  const result=await c.applyRosterRows([row],{status:notice});
  assert.equal(result.synced,false);assert.equal(result.roster_persisted,true);
  assert.equal(c.state.alliance.members[0].hq_level,36);assert.match(notice.textContent,/en attente/);
});
// Run the actual API control flow and actual normalization/authorization/merge helpers.
// Only authentication and database transports are replaced; no production calls.
const api=await readFile(new URL("../api/sync.js",import.meta.url),"utf8"),imports={};
for(const [,names,path] of api.matchAll(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];/gm)){
  const module=await import(new URL(path,new URL("../api/sync.js",import.meta.url)));
  for(const name of names.split(",").map(n=>n.trim()))imports[name]=module[name];
}
async function serverCase({role="R4",stale=false,snapshotFailure=false,noContext=false,unavailable=false,readFailure=false,reloadFailure=false,request}={}){
  const canonical={name:"Synthetic Manager",role,server_id:"123",alliance_tag:"TEST",player_id:owner,
    identity_basis:"lastwar_nickname_server_alliance",
    warboost_linked:true,rank_confirmation_status:"confirmed_manual",hq_level:35,power_m:229};
  const state=imports.normalizeState({...seed(),player:{...seed().player,role},
    alliance:{...seed().alliance,members:[canonical,row],roster_sync_status:"pending"}});
  let ctx={alliance:{id:"synthetic-alliance",owner_player_id:"different-owner",tag:"TEST",server_id:"123",
    roster:[canonical],roster_updated_at:revision,updated_at:revision},
    membership:{alliance_id:"synthetic-alliance",player_id:owner,role},roster:[canonical],cloud_roster:[canonical]};
  let writes=0,profiles=0;const writePayloads=[];
  const context=vm.createContext({...imports,
    configured:()=>!unavailable,userConfigured:()=>false,
    requireProductUser:async()=>({user:{id:owner}}),betaAccessForUserAsync:async()=>({allowed:true}),
    getProfile:async()=>({state:structuredClone(state),updated_at:revision}),
    getAllianceRoster:async()=>{if(reloadFailure&&writes>0)throw Object.assign(Error("private endpoint"),{status:503,code:"SUPABASE_SERVICE_TIMEOUT"});if(readFailure)throw Object.assign(Error("private SQL"),{status:503,code:"database_schema_missing",body:{code:"42P01"}});return noContext?null:structuredClone(ctx)},
    updateAllianceScopeRoster:async patch=>{writes++;writePayloads.push(plain(patch.roster));ctx.alliance={...ctx.alliance,...patch,updated_at:"2026-10-12T09:00:00.000Z",roster_updated_at:"2026-10-12T09:00:00.000Z"};ctx.roster=patch.roster;ctx.cloud_roster=patch.roster;return structuredClone(ctx.alliance)},
    saveProfileIfUnchanged:async()=>{profiles++;return {updated_at:revision}},
    insertSnapshot:async()=>{if(snapshotFailure)throw Object.assign(Error("private SQL"),{status:503,code:"database_permissions_missing",body:{code:"42501"}})},
    joinAlliance:async()=>{throw Error("unexpected membership mutation")},
    console});
  vm.runInContext(api.replace(/^import .*$/gm,"").replace("export default async function handler","async function handler"),context);
  const response={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=plain(body);return this}};
   await context.handler({method:"POST",headers:{},body:request||{state,base_updated_at:revision,base_roster_updated_at:stale?"old":revision}},response);
  return {...response,writes,profiles,writePayloads};
}
await test("actual API success positively acknowledges canonical roster persistence",async()=>{
  const result=await serverCase();
  assert.equal(result.statusCode,200,JSON.stringify(result.body));assert.ok(result.writes>0);
  assert.equal(result.body.roster_confirmation.persisted,true);assert.ok(rosterReplyConfirmed(result.body));
});
await test("actual API stale roster revision rejected before any write",async()=>{
  const result=await serverCase({stale:true});
  assert.equal(result.statusCode,409);assert.equal(result.body.error,"alliance_write_conflict");
  assert.equal(result.writes,0);assert.equal(result.profiles,0);
});
await test("legacy pending-roster request is isolated and cannot attempt a personal snapshot write",async()=>{
  const result=await serverCase({snapshotFailure:true});
  assert.equal(result.statusCode,200);assert.ok(result.writes>0);assert.equal(result.profiles,0);
  assert.equal(result.body.roster_confirmation.persisted,true);
  assert.equal(result.body.roster_confirmation.write_state,"confirmed");
  assert.equal(result.body.state,undefined);assert.doesNotMatch(JSON.stringify(result.body),/private SQL/);
});
await test("failed post-write readback never returns stale canonical data as synced",async()=>{
  const result=await serverCase({reloadFailure:true});
  assert.equal(result.statusCode,503);assert.ok(result.writes>0);assert.equal(result.profiles,0);
  assert.equal(result.body.roster_confirmation.persisted,true);
  assert.equal(result.body.error,"SUPABASE_SERVICE_TIMEOUT");
  assert.equal(result.body.state,undefined);assert.equal(result.body.ok,undefined);
});
await test("actual API R3, missing canonical context and cloud outage cannot report sync success",async()=>{
  for(const options of [{role:"R3"},{noContext:true},{unavailable:true},{readFailure:true}]){
    const result=await serverCase(options);assert.notEqual(result.statusCode,200);
     // Refused roster requests have no availability/profile/membership side effects.
     assert.equal(result.writes,0);
    assert.equal(result.profiles,0);
    assert.equal(result.body.roster_confirmation.persisted,false);
  }
});
await test("real browser importer and API roster-only round trip preserve personal fields and suppress auto-save",async()=>{
  const c=browserContext(),saveOptions=[];
  c.state.squads=[{id:1,power:44.43,heroes:[{name:"DVA",confirmation:"synthetic"}]},{id:2,power:99}];
  c.state.drone={level:100};c.state.technology={hero_tech_pct:25};
  const personal=plain({squads:c.state.squads,drone:c.state.drone,technology:c.state.technology,player:c.state.player});
  c.saveState=options=>{saveOptions.push(options);return true};
  c.fetchJsonBounded=async(_path,request)=>{
    const body=JSON.parse(request.body);
    assert.equal(body.operation,"alliance_roster");assert.equal(body.state,undefined);
    const response=await serverCase({request:body});
    assert.equal(response.profiles,0);
    return {response:{ok:response.statusCode===200,status:response.statusCode},json:response.body};
  };
  const result=await c.applyRosterRows([row]);
  assert.equal(result.synced,true);
  assert.deepEqual(plain({squads:c.state.squads,drone:c.state.drone,technology:c.state.technology,player:c.state.player}),personal);
  assert.ok(saveOptions.length>0&&saveOptions.every(o=>o?.cloudSave===false));
});
await test("actual saveState local-only option disables automatic profile scheduling, default remains unchanged",()=>{
  let scheduled=0,stored=0;
  const c=vm.createContext({state:seed(),cloudSession:{user:{id:owner}},APP_VERSION:"synthetic",
    STORE_KEY:"synthetic",localStateRevision:0,suppressPush:false,render:()=>{},
    repairLegacySquadIdentity:state=>({state}),backfillConfirmedHeroPowers:state=>({state}),
    safeLocalSet:()=>{stored++;return true},rememberLastGoodState:()=>{},rememberAccountState:()=>{},
    hasMeaningfulCore:()=>true,scheduleServerSave:()=>{scheduled++}});
  vm.runInContext(slice("function saveState(","function scheduleServerSave("),c);
  assert.equal(c.saveState({cloudSave:false}),true);assert.equal(stored,1);assert.equal(scheduled,0);
  assert.equal(c.saveState(),true);assert.equal(stored,2);assert.equal(scheduled,1);
});
await test("actual manual retry uses roster-only path, without profile recovery or personal sync",async()=>{
  const c=browserContext(),saveOptions=[],notice={textContent:"",setAttribute(){},removeAttribute(){}};
  c.state.alliance.roster_sync_status="pending";c.state.alliance.members.push(row);
  c.requireBetaAccess=()=>true;c.requireBetaConsent=()=>true;c.hasMeaningfulCore=()=>false;
  c.reconcileAuthenticatedRuntime=()=>{throw Error("must not recover or write profile for roster retry")};
  c.saveState=options=>{saveOptions.push(options);return true};
  c.$=()=>notice;
  c.fetchJsonBounded=async(_path,request)=>{
    const body=JSON.parse(request.body);assert.equal(body.operation,"alliance_roster");
    const response=await serverCase({request:body});
    return {response:{ok:response.statusCode===200,status:response.statusCode},json:response.body};
  };
  vm.runInContext(slice("async function syncAll(){",'$("#syncAllBtn").addEventListener'),c);
  await c.syncAll();
  assert.equal(c.state.alliance.roster_sync_status,"synced");
  assert.equal(saveOptions.length,1);assert.equal(saveOptions[0].cloudSave,false);
});
await test("actual roster button feedback is immediate, blocks doubles and cleans up verified/error/timeout replies",async()=>{
  for(const outcome of ["confirmed","unconfirmed-200","409","timeout"]){
    const c=browserContext(),notice=status(),button={disabled:false,textContent:"Import",attrs:{},
      setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};
    c.$=id=>id==="#rosterImportBtn"?button:null;
    let settle,calls=0;
    c.fetchJsonBounded=()=>{calls++;return new Promise((resolve,reject)=>{settle={resolve,reject}})};
    const pending=c.applyRosterRows([row],{status:notice});
    assert.equal(button.disabled,true);assert.equal(button.textContent,"alliance_update_busy");
    assert.equal(button.attrs["data-wb-analysis-active"],"true");
    assert.equal(await c.applyRosterRows([row],{status:notice}),null);assert.equal(calls,1);
    if(outcome==="timeout")settle.reject(Object.assign(Error("private detail"),{code:"request_timeout"}));
    else settle.resolve({response:{ok:outcome!=="409",status:outcome==="409"?409:200},
      json:outcome==="confirmed"?{ok:true,operation:"alliance_roster",player_id:owner,
        alliance_pending_source:"canonical",roster_confirmation:{requested:true,persisted:true},
        alliance:{members:[row],canonical_roster:[row],roster_sync_status:"synced",roster_updated_at:revision}}
        :outcome==="409"?{error:"alliance_write_conflict",roster_confirmation:{write_state:"not_attempted"}}:{ok:true}});
    const result=await pending;
    assert.equal(button.disabled,false);assert.equal(button.attrs["data-wb-analysis-active"],undefined);
    assert.equal(result.synced,outcome==="confirmed");
    assert.equal(notice.textContent.includes("alliance_update_done"),outcome==="confirmed");
    if(outcome!=="confirmed"){assert.equal(c.state.alliance.roster_sync_status,"pending");
      assert.match(notice.textContent,new RegExp(result.diagnostic.code));assert.doesNotMatch(notice.textContent,/private detail/)}
  }
});
console.log(`PASS roster sync feedback: ${passed} test groups (synthetic fixtures and controlled transports; no real OCR/cloud validation)`);
