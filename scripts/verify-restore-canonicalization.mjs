import assert from "node:assert/strict";
import fs from "node:fs";
import {canonicalRosterMemberKey,previewAllianceRankChanges,resolveCanonicalRosterMember,rankManagementKey} from "../lib/alliance-rank-management.js";
import {desertStormMemberKeys,normalizeDesertStormSelections} from "../lib/desert-storm-selection.js";
import {buildDesertStormPlan} from "../lib/desert-storm-plan.js";

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const stateApi=fs.readFileSync(new URL("../api/state.js",import.meta.url),"utf8");
const fastStart=stateApi.indexOf("if(fastRestore)");
const fastEnd=stateApi.indexOf("\n    const {user}=await requireBetaUser",fastStart);
const fastBlock=stateApi.slice(fastStart,fastEnd);
assert.match(fastBlock,/canonicalizeAllianceState\(current,playerId\)/);
assert.match(fastBlock,/status:"canonicalization_deferred"/);
assert.doesNotMatch(fastBlock,/status:"deferred_fast_restore"/);
assert.match(app,/STATE_API_CANONICAL/);
assert.match(app,/canonicalRosterReady=j\?\.alliance_roster_repair\?\.status==="canonical_roster_applied"/);
assert.match(app,/canonicalRosterReady&&hasDeclaredAllianceCommandRole\(\)/);
assert.match(app,/allowed:canonicalRosterReady&&access\.allowed/);

const context={serverId:"884",allianceTag:"ALL4"};
const member=(name,role,extra={})=>({...extra,name,role,server_id:"884",alliance_tag:"ALL4",warboost_linked:true});
const alice=member("Alice","R5",{power_m:130});
const bob=member("Bob","R5",{power_m:120});
const clara=member("Clara","R3",{power_m:110});
const restoredRoster=[alice,bob,clara].map(row=>({...row,canonical_member_key:canonicalRosterMemberKey(row,context)}));

// restore=1 -> canonical roster -> R5 to R3: the draft resolves by the hydrated key
const rankKey=rankManagementKey(restoredRoster[0]);
const preview=previewAllianceRankChanges(restoredRoster,[{key:rankKey,to_role:"R3"}],{maxR4:10});
assert.equal(preview.ok,true);
assert.equal(preview.changes[0].from_role,"R5");
const resolution=resolveCanonicalRosterMember(restoredRoster,{member_key:restoredRoster[0].canonical_member_key,name:"Alice",server_id:"884",alliance_tag:"ALL4",from_role:"R5"},context);
assert.equal(resolution.ok,true);
assert.equal(resolution.mode,"member_key");
assert.match(app,/member_key:memberKey\|\|null/);
assert.match(app,/from_role:change\.from_role/);

// restore=1 -> three historical/lifecycle selections -> cumulative clicks and plan
const legacyKeys=restoredRoster.map(desertStormMemberKeys).map(keys=>keys.find(key=>!key.startsWith("canonical:")));
let registered=normalizeDesertStormSelections([legacyKeys[0]],restoredRoster);
for(const key of [restoredRoster[1].canonical_member_key,restoredRoster[2].canonical_member_key]){
  registered=normalizeDesertStormSelections([...registered,key],restoredRoster);
}
assert.deepEqual(registered,restoredRoster.map(row=>row.canonical_member_key));
const plan=buildDesertStormPlan(restoredRoster,registered,{nowMs:Date.parse("2026-09-19T12:00:00Z")});
assert.equal(plan.registered_count,3);
assert.deepEqual(plan.starters.map(row=>row.name),["Alice","Bob","Clara"]);
console.log("PASS: restore=1 canonicalizes before R5→R3 and preserves three cumulative Desert Storm selections");