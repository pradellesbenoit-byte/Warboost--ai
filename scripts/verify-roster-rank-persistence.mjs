import assert from "node:assert/strict";
import fs from "node:fs";
import {canonicalRosterMemberKey,previewAllianceRankChanges,applyAllianceRankChanges,rankManagementKey} from "../lib/alliance-rank-management.js";
import {mergeCanonicalRoster} from "../lib/alliance-scope.js";

const context={serverId:"884",allianceTag:"ALL4"};
const member=(name,role,extra={})=>({...extra,name,role,server_id:"884",alliance_tag:"ALL4",updated_at:extra.updated_at||"2026-09-20T10:00:00.000Z"});
const key=row=>canonicalRosterMemberKey(row,context);
const r4Rows=Array.from({length:9},(_,i)=>member(`R4 ${i+1}`,"R4"));
const target=member("Target R3","R3",{player_id:"target",warboost_linked:true,activity_events:[{id:"event-target"}],membership_history:[{type:"joined",at:"2026-01-01"}]});

{
  const preview=previewAllianceRankChanges([...r4Rows,target],[{key:key(target),to_role:"R4"}],{maxR4:10});
  assert.equal(preview.ok,true);
  assert.equal(preview.before.R4,9);
  assert.equal(preview.after.R4,10);
  assert.equal(preview.changes.length,1);
}

{
  const full=[...Array.from({length:10},(_,i)=>member(`R4 full ${i+1}`,"R4")),member("Target R3","R3")];
  const preview=previewAllianceRankChanges(full,[{key:key(full.at(-1)),to_role:"R4"}],{maxR4:10});
  assert.equal(preview.ok,false);
  assert.equal(preview.errors[0].code,"r4_limit");
  assert.equal(preview.errors[0].count,11);
}

{
  const full=[...Array.from({length:10},(_,i)=>member(`R4 rotation ${i+1}`,"R4")),member("Target rotation","R3")];
  const promote=full.at(-1),demote=full[0];
  const preview=previewAllianceRankChanges(full,[{key:key(promote),to_role:"R4"},{key:key(demote),to_role:"R3"}],{maxR4:10});
  assert.equal(preview.ok,true);
  assert.equal(preview.after.R4,10);
  assert.equal(preview.changes.length,2);
}

{
  const duplicateOld=member("Target duplicate","R3",{updated_at:"2026-09-19T10:00:00.000Z"});
  const duplicateCurrent=member("Target duplicate","R3",{updated_at:"2026-09-20T10:00:00.000Z",player_id:"target"});
  const preview=previewAllianceRankChanges([...r4Rows,duplicateOld,duplicateCurrent],[{key:key(duplicateCurrent),to_role:"R4"}],{maxR4:10});
  assert.equal(preview.ok,true,"the target must be counted once, not as two R3 rows");
  assert.equal(preview.before.R4,9);
  assert.equal(preview.after.R4,10);
}

{
  const original=member("Preserve me","R3",{player_id:"p1",warboost_linked:true,activity_events:[{id:"activity-1"}],membership_history:[{type:"joined",at:"2026-01-01"}]});
  const applied=applyAllianceRankChanges([original],[{key:rankManagementKey(original),to_role:"R4"}],{now:"2026-09-20T12:00:00.000Z"});
  assert.equal(applied.changed,true);
  assert.equal(applied.members[0].role,"R4");
  assert.equal(applied.members[0].player_id,"p1");
  assert.equal(applied.members[0].warboost_linked,true);
  assert.deepEqual(applied.members[0].activity_events,[{id:"activity-1"}]);
  assert.equal(applied.members[0].membership_history.length,2);
}

{
  const existing=Array.from({length:95},(_,i)=>member(`Existing ${i+1}`,i===0?"R5":"R3"));
  const added=Array.from({length:5},(_,i)=>member(`New ${i+1}`,"R1"));
  const hundred=mergeCanonicalRoster(existing,added,context);
  assert.equal(hundred.length,100);
  const partial=mergeCanonicalRoster(hundred,[added[0],member("New 101","R1")],context);
  assert.equal(partial.length,101,"a later partial import must not remove existing members");
  const duplicate=mergeCanonicalRoster(partial,[{...added[0],power_m:42}],context);
  assert.equal(duplicate.length,101,"an exact duplicate must not increase the roster");
}

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const sync=fs.readFileSync(new URL("../api/sync.js",import.meta.url),"utf8");
const roleApi=fs.readFileSync(new URL("../api/alliance-role.js",import.meta.url),"utf8");
const normalize=fs.readFileSync(new URL("../lib/normalize.js",import.meta.url),"utf8");
assert.match(app,/async function persistRosterCandidate/);
assert.match(app,/roster_sync_status="pending"/);
assert.match(app,/if\(result\?\.synced\)/);
assert.match(sync,/requestedRosterSync=current\.alliance\?\.roster_sync_status==="pending"/);
assert.match(sync,/rosterPersisted=false/);
assert.match(sync,/roster_canonical_persist_required/);
assert.match(sync,/roster_sync_status:rosterPersisted\|\|!requestedRosterSync\?"synced"/);
assert.match(app,/preservePendingRoster/);
assert.match(roleApi,/dedupeCanonicalRosterRows/);
assert.match(roleApi,/Effectue une rétrogradation et une promotion dans la même requête/);
assert.match(normalize,/roster_sync_status/);
console.log("PASS: rank final-state validation, canonical deduplication, additive roster persistence and CAS-safe pending state");