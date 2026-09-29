import assert from "node:assert/strict";
import fs from "node:fs";
import {mergeNewest,normalizeState} from "../lib/normalize.js";
import {reconcileConfirmedSquad,swapSquads} from "../lib/squad-identity.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";

const namesOld=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
const namesNew=["DVA","Lucius","Carlie","Skyler","Morrison"];
const namesLatest=["Tesla","Swift","Violet","Mason","Monica"];
const at1="2026-09-28T10:00:00.000Z",at2="2026-09-28T11:00:00.000Z",at3="2026-09-28T12:00:00.000Z";
function initial(owner="account-A"){
  return normalizeState({player_id:owner,squads:[1,2,3,4].map(id=>({id,heroes:[]}))});
}
function confirm(state,id,names,at){
  return reconcileConfirmedSquad(state,{squadId:id,names,updatedAt:at}).state;
}
function reload(local,cloud){
  const saved=JSON.parse(JSON.stringify(local));
  const remote=normalizeState(JSON.parse(JSON.stringify(cloud)));
  return reconcileCloudSquads(saved,remote,remote);
}

const old=confirm(initial(),1,namesOld,at1);
const first=confirm(old,1,namesNew,at2);
const restored=reload(first,{...old,updated_at:at3});
assert.deepEqual(restored.state.squads[0].heroes.map(hero=>hero.name),namesNew,"a newly confirmed Squad 1 survives closing and reopening");
assert.deepEqual(restored.localNewer,[1],"a newer device squad must be queued to resync even if the cloud profile revision is newer");
assert.deepEqual(old.squads[0].heroes.map(hero=>hero.name),namesOld,"the old cloud profile was not mutated");

const latest=confirm(first,1,namesLatest,at3);
assert.deepEqual(reload(latest,first).state.squads[0].confirmed_composition,namesLatest,"the second confirmation beats the first");
assert.deepEqual(reload(first,latest).state.squads[0].confirmed_composition,namesLatest,"a genuinely newer cloud squad replaces older local data");
const second=confirm(first,2,namesLatest,at3);
assert.deepEqual(second.squads[0].confirmed_composition,namesNew,"Squad 2 confirmation does not overwrite Squad 1");
assert.deepEqual(reload(second,first).state.squads[0].confirmed_composition,namesNew,"a cloud merge leaves Squad 1 in its stable slot");
assert.deepEqual(reload(second,first).state.squads[1].confirmed_composition,namesLatest,"a newer Squad 2 is preserved independently");
const beforeSwap=confirm(confirm(initial(),1,namesOld,at2),2,namesLatest,at1);
const swapped=swapSquads(beforeSwap,{fromSquadId:1,toSquadId:2,updatedAt:at3}).state;
const swappedRestored=reload(swapped,beforeSwap);
assert.deepEqual(swappedRestored.state.squads[0].confirmed_composition,namesLatest,"a recent swap into Squad 1 beats the old Squad 1 confirmation");
assert.deepEqual(swappedRestored.state.squads[1].confirmed_composition,namesOld,"a recent swap into Squad 2 keeps both compositions without duplication");
assert.deepEqual(swappedRestored.localNewer,[1,2]);
const movedIntoEmpty=swapSquads(old,{fromSquadId:1,toSquadId:2,updatedAt:at3}).state;
const emptySwapRestored=reload(movedIntoEmpty,old);
assert.deepEqual(emptySwapRestored.state.squads[0].heroes.map(hero=>hero.name),["","","","",""],"an intentionally emptied Squad 1 is not refilled by stale cloud data");
assert.equal(emptySwapRestored.state.squads[0].composition_source,"explicit_swap_empty","the dated empty slot survives serialization");
assert.deepEqual(emptySwapRestored.state.squads[1].confirmed_composition,namesOld,"the moved squad remains in Squad 2, without duplication");
assert.deepEqual(emptySwapRestored.localNewer,[1,2]);

assert.throws(()=>reconcileCloudSquads(first,{...old,player_id:"account-B"},old),/squad_owner_mismatch/,"account B cannot hydrate account A's squads");
const otherAccount=confirm(initial("account-B"),1,namesLatest,at3);
assert.throws(()=>reconcileCloudSquads(first,otherAccount,first),/squad_owner_mismatch/);
const pending=JSON.parse(JSON.stringify({...first,sync:{pending_cloud_save:true,last_error:"request_timeout"}}));
assert.deepEqual(reload(pending,old).state.squads[0].confirmed_composition,namesNew,"a failed network save cannot erase the locally persisted confirmation");
const delayed=reload(latest,first);
assert.deepEqual(delayed.state.squads[0].confirmed_composition,namesLatest,"an earlier in-flight POST response cannot roll back a later confirmation");
assert.deepEqual(delayed.localNewer,[1],"the response must trigger another POST for the later confirmation");

const misleadingCloud=normalizeState({...old,updated_at:at3,squads:[{...old.squads[0],updated_at:at3}]});
const naiveSyncMerge=mergeNewest(first,misleadingCloud);
assert.deepEqual(naiveSyncMerge.squads[0].confirmed_composition,namesOld,"reproduce the old /api/sync bug: later squad scan timestamp beats a newer confirmation");
const protectedSyncMerge=reconcileCloudSquads(first,misleadingCloud,naiveSyncMerge);
assert.deepEqual(protectedSyncMerge.state.squads[0].confirmed_composition,namesNew,"the server sync merge must restore the latest confirmed squad");
const moreRecentPower=normalizeState({...old,squads:[{...old.squads[0],power:42,updated_at:at3}]});
const powerMerged=reload(first,moreRecentPower).state.squads[0];
assert.deepEqual(powerMerged.confirmed_composition,namesNew,"later power cannot replace the newer confirmed composition");
assert.equal(powerMerged.power,42,"later independent power observation is not lost");
assert.equal(powerMerged.power_sync_status,"pending","power from an older composition is not represented as confirmed for the new composition");
assert.equal(powerMerged.needs_rescan,true,"the user is asked to recheck power for the changed composition");

const ambiguous=confirm(old,1,namesNew,at1);
const unresolved=reload(ambiguous,old);
assert.deepEqual(unresolved.state.squads[0].confirmed_composition,namesNew,"equal-time disagreement keeps the local candidate");
assert.deepEqual(unresolved.conflicts,[1],"equal-time disagreement is explicitly marked for review");
assert.equal(unresolved.state.squads[0].composition_conflict.reason,"squad_freshness_ambiguous");

const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
assert.match(source,/const squadResult=reconcileCloudSquads\(state,remote,merged\)/,"both restore paths protect squads by their own confirmation");
assert.match(source,/scheduleCloudRetry\(750\)/,"newer local squads are scheduled for cloud retry");
assert.match(source,/localStateRevision!==pushRevision/,"an edit during an in-flight save cannot be discarded by its older response");
assert.match(source,/if\(String\(cloudSession\?\.user\?\.id\|\|""\)!==userId\)return \{skipped:true,reason:"account_changed"\}/,"a late response cannot enter another account");
assert.match(source,/if\(!saveState\(\)\)throw new Error\("local_squad_save_failed"\)/,"a failed local write cannot be reported as a successful hero save");
assert.match(source,/control.disabled=false;control.textContent=t\(key\)/,"reopening hero confirmation unlocks its buttons");
assert.match(source,/async function syncAll\(\)[\s\S]*?const squadResult=reconcileCloudSquads\(state,remote,merged\)/,"manual sync uses the same squad resolver");
assert.match(source,/async function persistRosterCandidate\(candidate\)[\s\S]*?if\(String\(cloudSession\?\.user\?\.id\|\|""\)!==owner\)throw/,"late roster sync responses cannot enter a different account");
const syncApi=fs.readFileSync(new URL("../api/sync.js",import.meta.url),"utf8");
assert.match(syncApi,/const squadResult=reconcileCloudSquads\(current,cloudState,base\)/,"/api/sync protects confirmed squads before it saves");
assert.match(syncApi,/if\(squadResult.conflicts.length\)\s*\{\s*return res.status\(409\)/,"the server refuses an ambiguous squad write");
console.log("PASS: squad confirmation survives restart, two revisions, independent slots, old/new cloud, account isolation, failed save, and ambiguous conflicts");