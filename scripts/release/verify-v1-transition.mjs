import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {prepareOfflineTransition,restoreOfflineBackup} from "./v1-compatibility.mjs";
import {normalizeState} from "../../lib/normalize.js";

// Execute the ACTUAL normalizer of the verified V1 main, not a reimplementation.
const BASE="59945b3e8f50c9f2c8b3cb58bd16fe8f6f1daa54";
const oldSource=execFileSync("git",["show",`${BASE}:lib/normalize.js`],{encoding:"utf8"});
const {normalizeState:oldNormalize}=await import(
  "data:text/javascript;base64,"+Buffer.from(oldSource).toString("base64"));
const A="00000000-0000-4000-8000-000000000001";
const B="00000000-0000-4000-8000-000000000002";
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(owner=A){
  return oldNormalize({
    player_id:owner,updated_at:"2026-01-01T10:00:00.000Z",
    player:{name:"Synthetic only",server_id:"999",hq_level:35,power_m:123.45},
    alliance:{tag:"TEST",name:"Synthetic alliance",role:"R5",members:[]},
    drone:{level:120,power_m:4.5},
    squads:Array.from({length:4},(_,index)=>({
      id:index+1,name:`Synthetic squad ${index+1}`,power:35+index,
      heroes:["Murphy","Williams","Kimberly","Marshall","Stetmann"].map(name=>({
        name,level:155,stars:null,power:null,gear:"four pieces level 40",
        exclusive:"legacy text only"
      }))
    }))
  });
}
test("real V1 normalizer produces four squads and twenty legacy hero records",()=>{
  const state=fixture();assert.equal(state.squads.length,4);
  assert.equal(state.squads.flatMap(row=>row.heroes).length,20);
  assert.equal(state.player.hq_level,35);
});
test("reproduce P0: direct V2 normalization does not retain active V1 hero fields",()=>{
  const state=fixture(),next=normalizeState(clone(state));
  assert.notEqual(next.squads[0].heroes[0].name,state.squads[0].heroes[0].name);
  const result=prepareOfflineTransition({accountId:A,state});
  assert.equal(result.compatible,false);
  assert.ok(result.blockers.some(row=>row.path==="squads.0.heroes.0.name"));
  assert.ok(result.blockers.some(row=>row.path==="squads.3.heroes.4.level"));
});
test("proposal never mutates V1 state or snapshot documents",()=>{
  const state=fixture(),snapshots=[{player_id:A,state:clone(state),source:"synthetic"}];
  const before=JSON.stringify({state,snapshots});
  prepareOfflineTransition({accountId:A,state,snapshots});
  assert.equal(JSON.stringify({state,snapshots}),before);
});
test("offline rollback restores four squads and all legacy text exactly",()=>{
  const state=fixture(),snapshots=[{player_id:A,state:clone(state)}];
  const result=prepareOfflineTransition({accountId:A,state,snapshots});
  result.candidate.squads[0].heroes[0].name="Modified proposal";
  const restored=restoreOfflineBackup(result.backup,A);
  assert.deepEqual(restored,{state,snapshots});
  assert.deepEqual(restoreOfflineBackup(result.backup,A),restored);
});
test("A and B cannot adopt, preview or restore each other's documents",()=>{
  assert.throws(()=>prepareOfflineTransition({accountId:B,state:fixture(A)}),/owner/);
  const backup=prepareOfflineTransition({accountId:A,state:fixture(A)}).backup;
  assert.throws(()=>restoreOfflineBackup(backup,B),/owner/);
  assert.notDeepEqual(fixture(A).player_id,fixture(B).player_id);
});
test("cross-account snapshot is refused before normalization",()=>{
  assert.throws(()=>prepareOfflineTransition({
    accountId:A,state:fixture(),snapshots:[{player_id:B,state:fixture(B)}]
  }),/snapshot_owner/);
  assert.throws(()=>prepareOfflineTransition({
    accountId:A,state:fixture(),snapshots:[{player_id:A,state:fixture(B)}]
  }),/snapshot_owner/);
});
test("changed backup is rejected instead of pretending restoration succeeded",()=>{
  const backup=prepareOfflineTransition({accountId:A,state:fixture()}).backup;
  backup.payload.state.player.hq_level=99;
  assert.throws(()=>restoreOfflineBackup(backup,A),/integrity/);
});
test("incomplete legacy names and unknown powers are not fabricated",()=>{
  const state=fixture();state.squads[0].heroes[1].name="";
  const result=prepareOfflineTransition({accountId:A,state});
  assert.equal(result.candidate.squads[0].heroes[1].name,"");
  for(const squad of result.candidate.squads)
    for(const hero of squad.heroes){assert.equal(hero.power,null);assert.equal(hero.stars,null)}
});
test("R1 through R5 survive in rollback without conferring cloud authority",()=>{
  for(const role of ["R1","R2","R3","R4","R5"]){
    const state=fixture();state.player.role=role;
    const proposal=prepareOfflineTransition({accountId:A,state});
    assert.equal(restoreOfflineBackup(proposal.backup,A).state.player.role,role);
    assert.ok(!Object.hasOwn(proposal,"authorized"));
  }
});
test("V1 code rollback alone cannot preserve all V2 metadata",()=>{
  const legacy=fixture();
  const original=clone(legacy);
  const next=normalizeState(clone(legacy));
  next.technology={branches:[{name:"Synthetic technology",percentage:0}]};
  next.squads[0].composition_confirmed_at="2026-01-01T11:00:00.000Z";
  const downgraded=oldNormalize(next);
  assert.notDeepEqual(downgraded,next);
  assert.equal(downgraded.squads[0].composition_confirmed_at,undefined);
  // A return to V1 must not be represented as a reversible data migration.
  assert.deepEqual(legacy,original);
});
