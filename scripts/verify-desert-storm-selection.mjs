import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {cloudRankManagerAccess,confirmedCanonicalSelfRole} from "../lib/alliance-rank-management.js";
import {desertStormMemberKeys,normalizeDesertStormSelections,toggleDesertStormSelection} from "../lib/desert-storm-selection.js";
import {buildDesertStormPlan} from "../lib/desert-storm-plan.js";
import {mergeDesertStormState} from "../lib/cloud-state-recovery.js";
import {preserveVerifiedR5} from "../lib/alliance-roster-lifecycle.js";
import {normalizeState} from "../lib/normalize.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const app=read("app.js"),api=read("api/alliance-role.js");

const member=(name,role,extra={})=>({name,role,server_id:"884",alliance_tag:"ALL4",warboost_linked:true,...extra});
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R5",ownerPlayerId:"other"}).allowed,true);
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R4",ownerPlayerId:"other"}).allowed,true);
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R3",ownerPlayerId:"other"}).allowed,false);
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R1",ownerPlayerId:"u"}).allowed,true);
assert.equal(confirmedCanonicalSelfRole([member("Me","R4",{player_id:"u"})],"u").ok,true);
assert.equal(confirmedCanonicalSelfRole([member("A","R4",{player_id:"u"}),member("B","R5",{player_id:"u"})],"u").ok,false);

assert.deepEqual(
  mergeDesertStormState(
    {registered_keys:["canonical:alice|884|ALL4"],updated_at:"2026-09-19T12:00:00.000Z"},
    {registered_keys:[],updated_at:"2026-09-19T11:59:00.000Z"}
  ).registered_keys,
  ["canonical:alice|884|ALL4"]
);
assert.deepEqual(
  mergeDesertStormState(
    {registered_keys:["canonical:alice|884|ALL4"],updated_at:"2026-09-19T12:00:00.000Z"},
    {registered_keys:[],updated_at:"2026-09-19T12:01:00.000Z"}
  ).registered_keys,
  []
);
assert.deepEqual(
  mergeDesertStormState(
    {registered_keys:["canonical:alice|884|ALL4"]},
    {registered_keys:["canonical:bob|884|ALL4"]}
  ).registered_keys,
  ["canonical:alice|884|ALL4","canonical:bob|884|ALL4"]
);
const verifiedR5=member("Leader","R5",{membership_status:"active"});
const incompleteRoster=preserveVerifiedR5([verifiedR5],[member("Alice","R4",{membership_status:"active"})]);
assert.equal(incompleteRoster.preserved,true);
assert.equal(incompleteRoster.rows.find(row=>row.name==="Leader")?.role,"R5");

assert.match(api,/req\.body\?\.action==="sync_own_role"/);
assert.match(api,/if\(!access\.owner&&!\["R4","R5"\]\.includes\(self\.role\)\)/);
assert.match(app,/function desertStormSelectionAccess\(\)/);
assert.match(app,/body:JSON\.stringify\(\{action:"sync_own_role"\}\)/);
assert.match(app,/saveState\(\{renderUi:false\}\)/);
assert.match(app,/data-ds-player-key=.*disabled/);
assert.match(app,/ds_selection_requires_verified_access/);
assert.match(app,/ds_selection_syncing/);
assert.match(app,/desertStormRoleResyncAttempted=true/);
assert.match(app,/if\(rosterDiagnosticPromise\|\|!cloudSession\?\.access_token\)return false/);
const picker=app.slice(app.indexOf("function renderDesertStormPicker()"),app.indexOf("function renderDesertStormPlan()"));
assert.match(picker,/if\(!desertStormSelectionAccess\(\)\.allowed\)\{ch\.checked=!ch\.checked;return\}/);
assert.match(app,/toggleDesertStormSelection\(current\.registered_keys,key,ch\.checked\)/);
assert.doesNotMatch(picker,/saveState\(\);\s*render\(\)/);
assert.doesNotMatch(picker,/selected\.has\(b\._key\)/);
assert.match(picker,/const rows=members\.filter/);

const alice=member("Alice","R4",{canonical_member_key:"canonical:alice|884|ALL4",power_m:120});
const bob=member("Bob","R3",{canonical_member_key:"canonical:bob|884|ALL4",power_m:110});
const active=[alice,bob];
const aliceLegacy=desertStormMemberKeys(alice).find(key=>key!=="canonical:alice|884|ALL4");
assert.ok(aliceLegacy);
assert.deepEqual(normalizeDesertStormSelections([aliceLegacy],active),["canonical:alice|884|ALL4"]);
assert.deepEqual(normalizeDesertStormSelections(["canonical:alice|884|ALL4","canonical:bob|884|ALL4"],active),["canonical:alice|884|ALL4","canonical:bob|884|ALL4"]);
assert.deepEqual(normalizeDesertStormSelections(["canonical:alice|884|ALL4","canonical:bob|884|ALL4"],active.filter(m=>m.name==="Alice")),["canonical:alice|884|ALL4","canonical:bob|884|ALL4"]);
const plan=buildDesertStormPlan(active,["canonical:alice|884|ALL4",aliceLegacy],{nowMs:Date.parse("2026-09-19T12:00:00Z")});
assert.equal(plan.registered_count,1);
assert.equal(plan.starters[0].name,"Alice");
assert.deepEqual(normalizeDesertStormSelections(["canonical:alice|884|ALL4"],[bob], [member("Alice","R3",{canonical_member_key:"canonical:alice|884|ALL4"})]),[]);
let cumulative=[];
for(const selected of [alice,bob,alice]){
  const key=desertStormMemberKeys(selected)[0];
  cumulative=normalizeDesertStormSelections([...cumulative,key],active,[member("Former","R1",{canonical_member_key:"canonical:former|884|ALL4"})]);
}
assert.deepEqual(cumulative,["canonical:alice|884|ALL4","canonical:bob|884|ALL4"]);

const bulkRoster=Array.from({length:94},(_,i)=>member(`Bulk ${i+1}`,i<2?"R5":i<9?"R4":"R3",{canonical_member_key:`canonical:bulk-${i+1}`}));
for(const target of [3,10,30,bulkRoster.length]){
  const keys=bulkRoster.map(row=>row.canonical_member_key),tapped=keys.slice(0,target);
  let tappedSelection=[];
  for(const key of tapped)tappedSelection=toggleDesertStormSelection(tappedSelection,key,true);
  assert.deepEqual(tappedSelection,tapped,`stable mobile taps must preserve all ${target} selected players`);
  const removed=tapped[Math.floor(target/2)];
  tappedSelection=toggleDesertStormSelection(tappedSelection,removed,false);
  assert.equal(tappedSelection.length,target-1,`one mobile untap must remove only one player at ${target}`);
  assert.ok(!tappedSelection.includes(removed));
  tappedSelection=toggleDesertStormSelection(tappedSelection,removed,true);
  assert.deepEqual([...tappedSelection].sort(),[...tapped].sort(),`reselecting one player must restore the complete ${target} selection`);
}
let bulkSelected=[];
for(const target of [3,10,30,bulkRoster.length]){
  for(const row of bulkRoster.slice(bulkSelected.length,target))bulkSelected.push(row.canonical_member_key);
  const filtered=bulkRoster.filter((_,i)=>i%2===0);
  bulkSelected=normalizeDesertStormSelections(bulkSelected,filtered);
  const saved=normalizeState({alliance:{members:bulkRoster,desert_storm:{registered_keys:bulkSelected}}});
  const restored=normalizeState(saved);
  assert.equal(restored.alliance.desert_storm.registered_keys.length,target,`selection count must survive ${target} cumulative selections`);
  const planForAll=buildDesertStormPlan(restored.alliance.members,restored.alliance.desert_storm.registered_keys,{nowMs:Date.parse("2026-09-19T12:00:00Z")});
  assert.equal(planForAll.registered_count,target,`plan must retain the full ${target}-member registration count`);
}
console.log("PASS: cumulative selections survive rerender/search and plan generation deduplicates canonical and legacy keys");

console.log("Desert Storm mobile selection safety verification: PASS");