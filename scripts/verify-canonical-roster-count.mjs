import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {mergeSharedAllianceRoster,activeCanonicalRoster,reconcileCanonicalAlliance} from "../lib/shared-alliance-roster.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";
import {sanitizeCanonicalRoster} from "../lib/alliance-scope.js";
import {mergeRosterLifecycleMetadata,preserveVerifiedR5,currentActiveRosterMembers,rosterLifecycleCounts,rosterRemovalTombstoneRow} from "../lib/alliance-roster-lifecycle.js";

const scope={serverId:"884",allianceTag:"ALL4"},stamp="2026-10-05T12:00:00.000Z";
const row=(name,extra={})=>({name,server_id:"884",alliance_tag:"ALL4",role:"R1",membership_status:"active",...extra});
const canonical=n=>Array.from({length:n},(_,i)=>row(`Member${i}`,{canonical_member_key:`canonical:member${i}|884|ALL4`,role:i===0?"R4":"R1",canonical_presence_at:stamp}));
const removed=Array.from({length:6},(_,i)=>row(`Former${i}`,{role:i===0?"R5":"R1"}));
const tombstones=removed.map(m=>rosterRemovalTombstoneRow({...m,removed_at:"2026-10-01T00:00:00.000Z"}));
const defaults=normalizeState({});
const state=(members,extra={})=>({...structuredClone(defaults),player_id:"fixture-account",player:{...defaults.player,name:"Member0",server_id:"884"},alliance:{...defaults.alliance,tag:"ALL4",server_id:"884",members,...extra}});
const count=(value,n,label)=>{
  const alliance=value.alliance||value;
  assert.equal(alliance.members.length,n,label);
  assert.equal(currentActiveRosterMembers(alliance.members).length,n,`${label}: active view`);
  assert.equal(rosterLifecycleCounts(alliance).active,n,`${label}: lifecycle counter`);
  assert.equal(new Set(alliance.members.map(m=>m.name.toLowerCase())).size,n,`${label}: unique identities`);
  assert.ok(alliance.members.every(m=>m.name.startsWith("Member")),`${label}: no former rows`);
};

// Execute actual application functions, not an imitation of their merge logic.
async function browserFunctions(){
  const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8"),context={console,Date,JSON,structuredClone,setTimeout,clearTimeout,APP_VERSION:"2.5.32"};
  for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](\.\/(?:lib\/[^"']+|i18n\.js))["']/g)){
    const module=await import(new URL(`../${match[2].slice(2)}`,import.meta.url));
    for(const part of match[1].split(",")){const [name,alias]=part.trim().split(/\s+as\s+/);context[alias||name]=module[name]}
  }
  vm.createContext(context);
  const functions=["hasValue","safeFields","allianceMemberKey","confirmedRankTimestamp","mergeAllianceMembersProtected","mergeSquadPayload","cleanShopSnapshot","mergeShopState","mergeVsState","mergeExclusiveWeapons","mergeHeroProgression","mergeHeroProfiles","emptySquad","mergeState","mergeStateProtected","preservePendingRoster","currentActiveRosterMembers"];
  for(const match of source.slice(source.indexOf("function emptyHero("),source.indexOf("function pendingIdentityAliasesFor(")).matchAll(/^function (\w+)\(/gm)){
    if(!["initialState"].includes(match[1])&&!functions.includes(match[1]))functions.unshift(match[1]);
  }
  for(const name of functions){
    const start=source.indexOf(`function ${name}(`);
    if(start<0){assert.equal(typeof context[name],"function",name);continue}
    const end=source.indexOf("\nfunction ",start+1);
    vm.runInContext(source.slice(start,end<0?source.length:end),context);
  }
  return context;
}
const browser=await browserFunctions();

async function apiFunctions(path,shared,dirty){
  const source=fs.readFileSync(new URL(path,import.meta.url),"utf8");
  const alliance={id:"fixture-alliance",server_id:"884",tag:"ALL4",roster:[...shared,...tombstones],roster_updated_at:stamp,updated_at:stamp};
  const context={console,Date,JSON,URL,structuredClone,process:{env:{}},setTimeout,clearTimeout};
  for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/gm)){
    const module=await import(match[2].startsWith(".")?new URL(match[2],new URL(path,import.meta.url)):match[2]);
    for(const part of match[1].split(",")){const [name,alias]=part.trim().split(/\s+as\s+/);context[alias||name]=module[name]}
    if(match[2].includes("supabase.js")){
      for(const part of match[1].split(",")){const name=part.trim();context[name]=()=>{throw new Error(`Unexpected database call: ${name}`)}}
    }
  }
  const user={id:"fixture-account"};
  Object.assign(context,{
    configured:()=>true,userConfigured:()=>false,
    requireBetaUser:async()=>({user}),
    requireProductUser:async()=>({user,entitlement:{active:true,source:"beta"}}),
    betaAccessForUserAsync:async()=>({allowed:true,configured:true}),
    getProfile:async()=>({state:dirty,updated_at:stamp}),
    getAllianceMembership:async()=>({alliance_id:alliance.id,player_id:user.id,role:"R4"}),
    getAllianceRoster:async()=>({alliance,membership:{alliance_id:alliance.id,player_id:user.id,role:"R4"},roster:shared,cloud_roster:[],roster_tombstones:tombstones}),
    updateAllianceScopeRoster:async()=>alliance,
    joinAlliance:async()=>({alliance_id:alliance.id,player_id:user.id,role:"R4"}),
    saveProfileIfUnchanged:async(id,state)=>({state,updated_at:stamp}),
    insertSnapshot:async()=>null
  });
  vm.createContext(context);
  vm.runInContext(source.replace(/^import .*;\r?$/gm,"").replace(/\bexport (?:default )?/g,""),context);
  return context;
}
async function responseOf(handler,req){
  let body,status=200;
  const res={setHeader(){},status(code){status=code;return this},json(value){body=value;return this}};
  await handler(req,res);
  assert.equal(status,200,body?.error||body?.message||"API response");
  return body;
}

for(const n of [99,100]){
  const shared=canonical(n),local=[...shared.map((m,i)=>({...m,power_m:i+1})),...removed,...tombstones];
  // 99 canonical + six local ghosts reproduces a phone displaying 105.
  assert.equal(local.filter(m=>!m.__warboost_type).length,n+6);
  const dirty=state(local,{roster_removal_tombstones:tombstones,former_members:removed});
  const remote=state(shared,{canonical_roster:shared,roster_updated_at:stamp});
  count({members:mergeSharedAllianceRoster(shared,local,scope)},n,"shared cloud hydration");
  assert.equal(mergeSharedAllianceRoster(shared,local,scope)[1].power_m,2,"exact member enrichment survives");
  count({members:sanitizeCanonicalRoster([...shared,...tombstones,{...shared[0]},row("Deleted",{membership_status:"left_confirmed"})],scope)},n,"canonical sanitization/diagnostic");
  const lifecycle=mergeRosterLifecycleMetadata(local,shared,{removal_tombstones:tombstones,authoritative:true});
  count({members:preserveVerifiedR5(local,lifecycle,{removal_tombstones:tombstones,authoritative:true}).rows},n,"server lifecycle and obsolete R5");
  for(const preferBase of [false,true]){
    count(browser.mergeStateProtected(dirty,remote,{preferBase}),n,"browser cloud restoration / in-flight save");
    count(browser.mergeStateProtected(remote,dirty,{preferBase}),n,"browser reverse restore");
  }
  count(browser.mergeState(dirty,remote),n,"browser ordinary merge");
  count(browser.mergeState(remote,dirty),n,"browser cached/backup merge");
  count(browser.preservePendingRoster({...dirty,alliance:{...dirty.alliance,roster_sync_status:"pending"}},remote),n,"pending roster restoration");
  const merged=mergeNewest(dirty,remote);
  count(merged,n,"server synchronization");
  count(mergeNewest(remote,dirty),n,"server reverse merge");
  count(normalizeState(JSON.parse(JSON.stringify(merged))),n,"persist/reopen normalization");
  count(hydrateCloudState(merged,normalizeState({}),"fixture-account"),n,"cloud hydration");
  let restored=merged;
  for(let i=0;i<3;i++)restored=mergeNewest(normalizeState(JSON.parse(JSON.stringify(restored))),dirty);
  count(restored,n,"repeated sync with obsolete personal profile");
  browser.state={...remote,alliance:{...remote.alliance,roster_review:[{...shared[2],membership_status:"review",missing_from_snapshot_at:"2026-10-06T00:00:00.000Z"}],former_members:[shared[3]]}};
  assert.equal(browser.currentActiveRosterMembers(browser.state.alliance.members,browser.state.alliance.roster_review,browser.state.alliance.former_members).length,n,"all screen selectors ignore obsolete local lifecycle blockers once membership is canonical");
  const stateApi=await apiFunctions("../api/state.js",shared,dirty);
  count((await stateApi.canonicalizeAllianceState(dirty,"fixture-account")).state,n,"actual API canonicalization");
  const syncApi=await apiFunctions("../api/sync.js",shared,dirty);
  const synced=await responseOf(syncApi.handler,{method:"POST",headers:{},body:{state:dirty,base_updated_at:stamp}});
  count(synced.state,n,"actual API sync with mocked isolated database");
  const diagnosticApi=await apiFunctions("../api/alliance-role.js",shared,dirty);
  const diagnostic=await responseOf(diagnosticApi.handler,{method:"GET",headers:{},query:{action:"roster_diagnostic"}});
  assert.equal(diagnostic.canonical_count,n,"actual diagnostic active count");
  assert.equal(diagnostic.roster.length,n,"actual diagnostic excludes tombstone rows");
}
const newer=state(canonical(99),{canonical_roster:canonical(99),roster_updated_at:stamp});
const phone102=state([...canonical(99),...removed.slice(0,3)],{roster_removal_tombstones:tombstones});
assert.equal(phone102.alliance.members.length,102);
count(browser.mergeStateProtected(phone102,newer,{preferBase:true}),99,"real 102-line stale-phone scenario");
count(mergeNewest(phone102,newer),99,"102-line profile synchronization");
const older=state(canonical(100),{canonical_roster:canonical(100),roster_updated_at:"2026-10-01T00:00:00.000Z"});
count(mergeNewest(newer,older),99,"stale canonical snapshot cannot roll back deletion");
count(browser.mergeStateProtected(newer,older,{preferBase:false}),99,"browser anti-rollback");
assert.equal(activeCanonicalRoster([...canonical(100),row("Overflow")],scope).length,100,"hard maximum");
assert.equal(mergeSharedAllianceRoster([],removed,scope).length,0,"empty canonical roster never revives local rows");
assert.equal(reconcileCanonicalAlliance(newer.alliance,{},{...newer.alliance,tag:"OTHER",members:[]}).canonical_roster,undefined,"snapshot cannot leak across alliance");
console.log("PASS canonical roster counts: 99/100, local ghosts/tombstones, R5, all browser/server merge and restoration paths, deduplication, empty roster, scope isolation.");
