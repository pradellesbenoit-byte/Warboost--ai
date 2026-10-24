import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {normalizeState} from "../../lib/normalize.js";
import {mergeNewest} from "../../lib/normalize.js";
import {prepareLegacyV1State,restoreLegacyV1State} from "../../lib/legacy-squad-compat.js";
import {hasExplicitSquadConfirmation,normalizeSquadSlots,repairLegacySquadIdentity,reconcileConfirmedSquad,swapSquads} from "../../lib/squad-identity.js";
import {reconcileCloudSquads} from "../../lib/squad-freshness.js";
import {prepareOfflineTransition,restoreOfflineBackup} from "./v1-compatibility.mjs";
import {canonicalHeroName} from "../../lib/heroes.js";
import {canonicalPowerMillions} from "../../lib/power-units.js";
import {confirmedHeroPower,heroPowerIsConfirmed} from "../../lib/hero-power.js";
import {mergeFreshRecord} from "../../lib/field-freshness.js";
import {fixedHeroSlots,confirmedCompositionForSquad,mergeSquadIdentityHistory} from "../../lib/squad-identity.js";

const oldSource=execFileSync("git",["show","59945b3:lib/normalize.js"],{encoding:"utf8"});
const {normalizeState:oldNormalize}=await import(
  "data:text/javascript;base64,"+Buffer.from(oldSource).toString("base64"));
const A="00000000-0000-4000-8000-000000000001";
const B="00000000-0000-4000-8000-000000000002";
export function legacyFixture(owner=A){
  const groups=[
    ["Murphy","Williams","Kimberly","Marshall","Stetmann"],
    ["DVA","Carlie","Lucius","Morrison","Schuyler"],
    ["Tesla","Swift","Fiona","Adam","McGregor"],
    ["Mason","Violet","Scarlett","Richard","Sarah"]
  ];
  return oldNormalize({player_id:owner,updated_at:"2026-01-01T10:00:00Z",
    player:{name:"Synthetic",server_id:"999",hq_level:35},
    squads:groups.map((names,index)=>({id:index+1,power:30+index,
      heroes:names.map(name=>({name,level:150,stars:null,power:null,
        exclusive:"legacy weapon note",gear:"four saved pieces level 40"}))
    }))
  });
}
const projection=state=>state.squads.map(squad=>squad.heroes.map(hero=>
  ["name","level","stars","power","exclusive","gear"].map(key=>hero[key]??null)));
test("regression: V1 saved heroes retain identities, slots and fields over V2 write/reload",()=>{
  const old=legacyFixture(),next=normalizeState(old);
  assert.deepEqual(projection(next),projection(old));
  const written=JSON.parse(JSON.stringify(next));
  assert.deepEqual(projection(normalizeState(written)),projection(old));
});
test("regression: independent V1 owners retain all four squads without source mutation",()=>{
  const a=legacyFixture(A),b=legacyFixture(B),before=JSON.stringify([a,b]);
  assert.deepEqual(projection(normalizeState(a)),projection(a));
  assert.deepEqual(projection(normalizeState(b)),projection(b));
  assert.equal(JSON.stringify([a,b]),before);
});
test("no invented V2 confirmation, timestamp, stars or individual power",()=>{
  const next=normalizeState(legacyFixture());
  for(const squad of next.squads){
    assert.equal(hasExplicitSquadConfirmation(squad),false);
    assert.equal(squad.composition_source,"legacy_saved_v1");
    assert.equal(squad.composition_confirmed_at,null);
    assert.ok(squad.confirmed_composition.every(name=>name===""));
    for(const hero of squad.heroes){assert.equal(hero.stars,null);assert.equal(hero.power,null)}
  }
});
test("transition is idempotent and has an exact account-scoped reverse document",()=>{
  const old=legacyFixture(),before=JSON.stringify(old),first=normalizeState(old);
  for(let i=0;i<3;i++){
    const next=normalizeState(JSON.parse(JSON.stringify(first)));
    assert.deepEqual(projection(next),projection(first));
    assert.deepEqual(next.legacy_v1_backup,first.legacy_v1_backup);
    assert.deepEqual(restoreLegacyV1State(next,A),old);
  }
  assert.equal(JSON.stringify(old),before);
  assert.throws(()=>restoreLegacyV1State(first,B),/owner/);
});
test("foreign backup/slot marker and malformed or duplicate squad IDs fail closed",()=>{
  const next=normalizeState(legacyFixture());
  for(const mutate of [
    s=>{s.player_id=B},s=>{s.squads[0].legacy_v1.owner_id=B},
    s=>{s.squads[0].legacy_v1.squad_id=4}
  ]){
    const changed=structuredClone(next);mutate(changed);
    assert.throws(()=>normalizeState(changed),/legacy_/);
  }
  const invalid=legacyFixture();invalid.squads[1].id=1;
  assert.throws(()=>prepareLegacyV1State(invalid),/shape/);
});
test("bootstrap repair preserves saved positions and keeps unknown powers unknown",()=>{
  const old=legacyFixture(),next=normalizeState(old);
  const repaired=repairLegacySquadIdentity(next).state;
  assert.deepEqual(projection(repaired),projection(old));
  assert.deepEqual(projection(normalizeState(repaired)),projection(old));
});
test("new unconfirmed identity proposal cannot replace or erase a saved legacy slot",()=>{
  const next=normalizeState(legacyFixture()),squad=structuredClone(next.squads[0]);
  squad.heroes[1].name="Richard";squad.heroes[1].level=1;
  const retained=normalizeSquadSlots(squad,1);
  assert.equal(retained.heroes[1].name,next.squads[0].heroes[1].name);
  assert.equal(retained.heroes[1].level,next.squads[0].heroes[1].level);
  assert.equal(retained.composition_conflict.reason,"legacy_identity_change_requires_confirmation");
});
test("separately reviewed field updates persist but unreviewed fields do not replace history",()=>{
  const next=normalizeState(legacyFixture()),hero=next.squads[0].heroes[0];
  hero.level=155;hero.stars=5;
  hero.field_source={level:"confirmed_manual"};
  hero.field_updated_at={level:"2026-02-01T00:00:00Z"};
  const reloaded=normalizeState(next);
  assert.equal(reloaded.squads[0].heroes[0].level,155);
  assert.equal(reloaded.squads[0].heroes[0].stars,null);
});
test("explicit new composition and deliberate clear beat an older V1 snapshot",()=>{
  const old=legacyFixture(),saved=normalizeState(old);
  const names=["Murphy","Williams","Kimberly","Marshall","Tesla"];
  const confirmed=reconcileConfirmedSquad(saved,{
    squadId:1,names,updatedAt:"2026-02-01T00:00:00Z"
  }).state;
  const result=reconcileCloudSquads(confirmed,normalizeState(old),mergeNewest(confirmed,old)).state;
  assert.deepEqual(normalizeState(result).squads[0].heroes.map(hero=>hero.name),names);
  const cleared=structuredClone(confirmed);
  cleared.squads[0]={id:1,composition_source:"explicit_swap_empty",
    composition_changed_at:"2026-03-01T00:00:00Z",updated_at:"2026-03-01T00:00:00Z",heroes:[]};
  const merged=reconcileCloudSquads(cleared,normalizeState(old),mergeNewest(cleared,old)).state;
  assert.ok(normalizeState(merged).squads[0].heroes.every(hero=>hero.name===""));
});
test("offline compatibility report now accepts preserved V1 fields and still restores originals",()=>{
  const old=legacyFixture(),result=prepareOfflineTransition({accountId:A,state:old});
  assert.equal(result.compatible,true);
  assert.deepEqual(restoreOfflineBackup(result.backup,A).state,old);
});
test("explicit swap preserves both payloads and their original reverse document",()=>{
  const old=legacyFixture(),saved=normalizeState(old);
  const swapped=swapSquads(saved,{fromSquadId:1,toSquadId:2,updatedAt:"2026-02-01T00:00:00Z"}).state;
  const roundTrip=normalizeState(swapped);
  assert.deepEqual(roundTrip.squads[0].heroes.map(hero=>hero.name),old.squads[1].heroes.map(hero=>hero.name));
  assert.deepEqual(roundTrip.squads[1].heroes.map(hero=>hero.name),old.squads[0].heroes.map(hero=>hero.name));
  assert.deepEqual(restoreLegacyV1State(roundTrip,A),old);
});
test("V1 generated placeholders are not upgraded into real hero identities",()=>{
  const old=legacyFixture();
  old.squads[0].heroes[3]={name:"Hero 4",level:null,stars:null,power:null,exclusive:null,gear:null};
  const next=normalizeState(old);
  assert.equal(next.squads[0].heroes[3].name,"");
  assert.deepEqual(restoreLegacyV1State(next,A),old);
});
test("actual browser mergeSquadPayload retains transitioned V1 data before simulated save",()=>{
  const source=readFileSync(new URL("../../app.js",import.meta.url),"utf8");
  const functionSource=name=>{
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0);
    const line=source.slice(start,source.indexOf("\n",start));
    return line.endsWith("}")?line:source.slice(start,source.indexOf("\n}",start)+2);
  };
  const context=vm.createContext({
    canonicalStoredHeroName:canonicalHeroName,canonicalPowerMillions,
    confirmedHeroPower,heroPowerIsConfirmed,mergeFreshRecord,
    normalizeSquadSlots,fixedHeroSlots,confirmedCompositionForSquad,mergeSquadIdentityHistory
  });
  for(const name of ["emptyHero","emptySquad","mergeHeroSlotIdentitySafe","mergeSquadComposition","mergeSquadPayload"])
    vm.runInContext(functionSource(name),context);
  const old=legacyFixture(),transitioned=prepareLegacyV1State(old),saved=normalizeState(old);
  context.incoming=transitioned.squads;
  const merged=vm.runInContext("incoming.map((squad,index)=>mergeSquadPayload(emptySquad(index+1),squad,index+1))",context);
  assert.deepEqual(projection(normalizeState({...saved,squads:JSON.parse(JSON.stringify(merged))})),projection(old));
  assert.match(source,/base=prepareLegacyV1State\(base\)/);
  assert.match(source,/incoming=prepareLegacyV1State\(incoming\)/);
});
