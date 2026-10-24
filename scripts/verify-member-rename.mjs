import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {randomUUID} from "node:crypto";
import * as rank from "../lib/alliance-rank-management.js";
import * as identity from "../lib/alliance-identity.js";
import * as lifecycle from "../lib/alliance-roster-lifecycle.js";
import * as canonicalAccess from "../lib/canonical-alliance-access.js";
import * as authorization from "../lib/alliance-authorization.js";
import {prepareRosterRename,applyCanonicalRenames,protectCanonicalRosterNames} from "../lib/alliance-member-rename.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {mergeCanonicalRoster,replaceCanonicalRosterFromCompleteSnapshot} from "../lib/alliance-scope.js";
import {mergeCloudRosterWithIdentity} from "../lib/alliance-roster-merge.js";
import {mergeSharedAllianceRoster} from "../lib/shared-alliance-roster.js";
import {buildEventStrategy} from "../lib/event-strategy.js";
import {renderEventStrategy} from "../lib/event-strategy-ui.js";

const scope={serverId:"884",allianceTag:"ALL4"};
const row=(name,id,role="R3")=>({name,player_id:id,role,server_id:"884",alliance_tag:"ALL4",
  canonical_member_key:`canonical:${name.toLowerCase()}|884|ALL4`,warboost_linked:Boolean(id),
  identity_basis:id?"lastwar_nickname_server_alliance":null,
  activity_events:[{event_type:"desert_storm",event_date:"2026-09-30",participation_status:"participated",source:"manual",updated_at:"2026-09-30T12:00:00Z"}],
  event_availability:[],availability_history:[],membership_history:[{type:"joined",at:"2026-09-01T00:00:00Z"}],
  scans:[{name,level:31}],snapshots:[{name,power:12}],ai_data:{target:"retain"}});
const a=row("Ancien","player-a"),b=row("Autre","player-b"),manager=row("Chef","manager","R4");
const now="2026-10-03T12:00:00Z",request={member_key:a.canonical_member_key,expected_name:a.name,new_name:"Nouveau",lifecycle_key:lifecycle.rosterLifecycleKey(a)};
const context={...scope,actorId:"manager",memberId:"immutable-a",now};
const before=JSON.stringify([a,b,manager]);
const renamed=prepareRosterRename([a,b,manager],request,context),next=renamed.member;
assert.equal(next.player_id,a.player_id);assert.equal(next.canonical_member_key,a.canonical_member_key);
assert.equal(next.role,"R3");assert.equal(next.warboost_linked,true);assert.equal(next.identity_basis,a.identity_basis);
assert.equal(next.server_id,a.server_id);assert.equal(next.alliance_tag,a.alliance_tag);
for(const field of ["activity_events","membership_history","event_availability","availability_history","scans","snapshots","ai_data"])
  assert.deepEqual(next[field],a[field]);
assert.equal(JSON.stringify([a,b,manager]),before);
assert.equal(lifecycle.rosterLifecycleKey(next),lifecycle.rosterLifecycleKey(a));
for(const name of ["Ancien","Nouveau"]){
  const imported=lifecycle.applyRosterImportLifecycle({members:renamed.roster},[{name,role:"R3",server_id:"884",alliance_tag:"ALL4"}],{complete:false,now});
  assert.equal(imported.members.length,3,"a subsequent old/new nickname-only import keeps the same member");
  assert.equal(imported.members[0].player_id,"player-a");
  assert.equal(imported.members[0].name,"Nouveau");
}
assert.deepEqual(next.name_audit[0],{old_name:"Ancien",new_name:"Nouveau",actor_player_id:"manager",at:now});
assert.equal(renamed.roster.length,3);
const again=prepareRosterRename(renamed.roster,{...request,expected_name:"Nouveau",new_name:"Final"},
  {...context,memberId:"must-not-replace",now:"2026-10-03T13:00:00Z"});
assert.equal(again.member.roster_member_id,"immutable-a");
assert.deepEqual(again.member.name_aliases,["Ancien","Nouveau"]);assert.equal(again.member.name_audit.length,2);
for(const [change,code] of [
  [{new_name:"Autre"},"nickname_taken"],[{new_name:"AUTRE"},"nickname_taken"],
  [{new_name:" "},"nickname_invalid"],[{new_name:"x".repeat(81)},"nickname_invalid"],
  [{expected_name:"Stale"},"member_name_changed"],[{member_key:"missing"},"member_not_found"]
])assert.throws(()=>prepareRosterRename([a,b,manager],{...request,...change},context),e=>e.code===code);
assert.throws(()=>prepareRosterRename([a,b,manager],request,{...context,serverId:"999"}),e=>e.code==="member_not_found");
assert.throws(()=>prepareRosterRename([a,b,manager],request,{...context,extraRows:[row("Nouveau","different-account")]}),e=>e.code==="nickname_identity_conflict");
assert.throws(()=>prepareRosterRename([a,{...a,canonical_member_key:"orphan",player_id:"different"},manager],request,context),e=>e.code==="member_identity_ambiguous");

const state={player_id:"player-a",player:{name:"Ancien",server_id:"884",hq_level:31},alliance:{id:"alliance",server_id:"884",tag:"ALL4",members:renamed.roster,
  desert_storm:{registered_keys:[lifecycle.rosterLifecycleKey(a)],plan:{groups:[{members:["Ancien"]}],substitutes:[{name:"Ancien",player_id:"player-a",role:"defense"}]}},
  canyon:{plan:{participants:[{name:"Ancien",player_id:"player-a"}]}},
  event_availability:[{member_name:"Ancien",canonical_member_key:a.canonical_member_key}]},
  vs:{leaderboard:[{name:"Ancien",player_id:"player-a"}],personal_name:"Ancien"},
  season:{participants:[{member_name:"Ancien"}]},snapshots:[{player:{name:"Ancien"}}]};
const projected=applyCanonicalRenames(state);
assert.equal(projected.player.name,"Nouveau");
assert.equal(projected.alliance.desert_storm.plan.groups[0].members[0],"Nouveau");
assert.equal(projected.alliance.canyon.plan.participants[0].name,"Nouveau");
assert.equal(projected.alliance.event_availability[0].member_name,"Nouveau");
assert.equal(projected.vs.leaderboard[0].name,"Nouveau");assert.equal(projected.vs.personal_name,"Nouveau");
assert.equal(projected.season.participants[0].member_name,"Nouveau");
assert.equal(projected.snapshots[0].player.name,"Ancien","immutable historical snapshot");
assert.deepEqual(projected.alliance.desert_storm.registered_keys,state.alliance.desert_storm.registered_keys);
assert.equal(applyCanonicalRenames({...state,player_id:"other-account"}).player.name,"Ancien","never change another account's own name");
assert.equal(applyCanonicalRenames({...state,alliance:{...state.alliance,server_id:"999",tag:"OTHER"}}).player.name,"Ancien","cross-scope evidence ignored");
const reopened=normalizeState(JSON.parse(JSON.stringify(projected)));
assert.equal(reopened.player.name,"Nouveau");assert.equal(reopened.alliance.members[0].roster_member_id,"immutable-a");
assert.equal(reopened.alliance.members[0].name_audit.length,1);
const originalNormalized=normalizeState({...state,alliance:{...state.alliance,members:[a,b,manager]}});
for(const field of ["activity_events","membership_history","event_availability","availability_history"])
  assert.deepEqual(reopened.alliance.members[0][field],originalNormalized.alliance.members[0][field],"normalization retains "+field);
for(const event_type of ["desert_storm","canyon_storm","vs","season"]){
  const plan=buildEventStrategy({event_type,members:renamed.roster,availability:[{
    canonical_member_key:next.canonical_member_key,member_name:"Nouveau",event_type,
    status:"present",source:"alliance_manager_manual",updated_at:now
  }],nowMs:Date.parse(now)});
  assert.equal(plan.assignments[0]?.name,"Nouveau",event_type+" current assignment");
  assert.ok(renderEventStrategy(plan,{locale:"fr"}).includes("Nouveau"),event_type+" rendered player label");
}
const stale={...state,updated_at:"2099-01-01T00:00:00Z",alliance:{...state.alliance,members:[{...a,updated_at:"2099-01-01T00:00:00Z"},b,manager]}};
for(const merged of [mergeNewest(reopened,stale),mergeNewest(stale,reopened)]){
  assert.equal(merged.player.name,"Nouveau");assert.equal(merged.alliance.members.length,3);
  assert.equal(merged.alliance.members[0].name,"Nouveau");assert.equal(merged.alliance.members[0].player_id,"player-a");
}
for(const merge of [mergeCanonicalRoster,replaceCanonicalRosterFromCompleteSnapshot]){
  const result=merge(renamed.roster,[{...a,name_confirmed_at:"2099-01-01T00:00:00Z",name_aliases:["Forgery"]},b,manager],scope);
  assert.equal(result[0].name,"Nouveau");assert.equal(result[0].name_confirmed_at,now);
  assert.equal(result.length,3);assert.equal(result[0].name_audit.length,1);
  const oldWithoutKey={...a};delete oldWithoutKey.canonical_member_key;
  assert.equal(merge(renamed.roster,[oldWithoutKey,b,manager],scope).length,3,"old nickname-only imports do not create a duplicate");
}
assert.throws(()=>protectCanonicalRosterNames(renamed.roster,[{...a,player_id:"different"}],scope),e=>e.code==="nickname_identity_conflict");
assert.throws(()=>protectCanonicalRosterNames(renamed.roster,[{...a,player_id:null,canonical_member_key:"orphan-key"}],scope),e=>e.code==="nickname_identity_conflict");
const shared=mergeSharedAllianceRoster(renamed.roster,[a,b,manager],scope);
assert.equal(shared[0].name,"Nouveau");assert.equal(shared[0].player_id,"player-a");
const linked=mergeCloudRosterWithIdentity(renamed.roster,[a,b,manager],scope);
assert.equal(linked.roster.length,3);assert.equal(linked.roster[0].warboost_linked,true);
assert.equal(linked.roster[0].name,"Nouveau");assert.equal(linked.unlinked_accounts.length,0);

// Actual route/auth/CAS contract, with fully offline dependencies.
let actor="manager",actorRole="R4",revision="initial",conflict=false,writes=0,roster=[a,b,manager];
const alliance=()=>({id:"alliance",server_id:"884",tag:"ALL4",owner_player_id:"owner",roster,updated_at:revision});
const deps={...rank,...identity,...lifecycle,...canonicalAccess,...authorization,prepareRosterRename,randomUUID,
  configured:()=>true,requireBetaUser:async()=>({user:{id:actor}}),
  getAllianceMembership:async()=>({alliance_id:"alliance",player_id:actor,role:actorRole}),
  getProfile:async()=>({state:{player:{name:actor==="manager"?"Chef":"Autre",server_id:"884",role:actorRole},alliance:{tag:"ALL4"}}}),
  getAllianceRoster:async()=>({alliance:structuredClone(alliance()),roster:structuredClone(roster),cloud_roster:[],
    membership:{alliance_id:"alliance",role:actorRole}}),
  getAllianceById:async()=>alliance(),
  updateAllianceScopeRoster:async input=>{
    if(conflict||input.expected_updated_at!==revision)throw Object.assign(new Error("conflict"),{code:"alliance_write_conflict",status:409});
    writes++;roster=structuredClone(input.roster);revision=`revision-${writes}`;
    return {...alliance(),roster_updated_at:revision};
  }};
const source=fs.readFileSync("api/alliance-role.js","utf8").replace(/^import .*;\r?\n/gm,"").replace(/export function /g,"function ").replace("export default async function handler","async function handler");
const box=vm.createContext({...deps});vm.runInContext(source+"\nthis.handler=handler",box);
async function post(change={}){
  let result;
  const res={setHeader(){},status(status){this.code=status;return this},json(body){result={status:this.code,body};return result}};
  await box.handler({method:"POST",body:{action:"rename_member",confirmed:true,alliance_id:"alliance",server_id:"884",alliance_tag:"ALL4",...request,...change}},res);
  return result;
}
assert.equal((await post()).status,200);assert.equal(writes,1);assert.equal(roster[0].player_id,"player-a");
assert.equal((await post()).body.error,"member_name_changed");
assert.equal((await post({alliance_id:"another"})).status,403);
assert.equal((await post({confirmed:false})).status,400);
assert.equal((await post({expected_name:"Nouveau",new_name:"Autre"})).body.error,"nickname_taken");
conflict=true;
assert.equal((await post({expected_name:"Nouveau",new_name:"Final"})).body.error,"alliance_write_conflict");
assert.equal(writes,1);assert.equal(roster[0].name,"Nouveau");assert.equal(roster[0].name_audit.length,1);
conflict=false;actor="player-b";actorRole="R1";
assert.equal((await post({expected_name:"Nouveau",role:"R5"})).status,403,"browser-declared R5 never grants access");
actor="owner";actorRole="R5";
assert.equal((await post({expected_name:"Nouveau",new_name:"Final"})).status,200);
assert.equal(writes,2);assert.equal(roster[0].role,"R3");assert.equal(roster[0].name_audit.length,2);
for(const route of ["api/state.js","api/sync.js"])assert.ok(fs.readFileSync(route,"utf8").includes("protectCanonicalRosterNames"));
assert.ok(fs.readFileSync("app.js","utf8").includes("if(!currentScope()){dialog.close();return false}"));
// Execute the actual UI submit callback against a delayed response and changed scope.
const appSource=fs.readFileSync("app.js","utf8"),start=appSource.indexOf("function openMemberRename("),
  end=appSource.indexOf("\nfunction attachMemberRenameAction",start);
let captured,resolveResponse,uiWrites=0,closed=false;
const ui=vm.createContext({
  state:{...structuredClone(state),player_id:"manager",player:{name:"Chef",server_id:"884"},alliance:{...structuredClone(state.alliance),members:[a,b,manager]}},
  cloudSession:{user:{id:"manager"}},canonicalRosterReady:true,
  hasDeclaredAllianceCommandRole:()=>true,
  normalizeServerId:identity.normalizeServerId,normalizeAllianceTag:identity.normalizeAllianceTag,
  showMemberRenameDialog:opts=>{captured=opts},
  fetchJsonBounded:()=>new Promise(resolve=>{resolveResponse=resolve}),authHeaders:()=>({}),
  mergeSharedAllianceRoster,applyCanonicalRenames,rankChangeDraft:new Map(),
  saveState:()=>{uiWrites++},render:()=>{},alliancePlayerProfileIsOpen:()=>false
});
vm.runInContext(appSource.slice(start,end)+"\nthis.openMemberRename=openMemberRename",ui);
ui.openMemberRename(a.canonical_member_key);
const pending=captured.onSubmit("Nouveau",{close(){closed=true}});
const otherState={player_id:"account-b",player:{name:"Other account"},alliance:{id:"elsewhere",server_id:"999",tag:"OTHER",members:[]}};
ui.state=structuredClone(otherState);ui.cloudSession={user:{id:"account-b"}};
resolveResponse({response:{ok:true},json:{ok:true,mode:"member_renamed",roster:renamed.roster}});
assert.equal(await pending,false);assert.equal(uiWrites,0);assert.equal(closed,true);
assert.equal(JSON.stringify(ui.state),JSON.stringify(otherState),"late response cannot contaminate account B");
// Same account but a different alliance is protected too.
ui.state={...structuredClone(state),player_id:"manager",alliance:{...structuredClone(state.alliance),members:[a,b,manager]}};
ui.cloudSession={user:{id:"manager"}};ui.openMemberRename(a.canonical_member_key);
const alliancePending=captured.onSubmit("Nouveau",{close(){}});
ui.state.alliance.id="changed-alliance";
resolveResponse({response:{ok:true},json:{ok:true,mode:"member_renamed",roster:renamed.roster}});
assert.equal(await alliancePending,false);assert.equal(uiWrites,0);assert.equal(ui.state.alliance.members[0].name,"Ancien");
console.log("Member rename: stable identity, history/link/selection retention, display propagation, reload/stale sync, anti-duplicates, account isolation, real handler R4/R5 authorization and atomic conflict/audit: PASS");