import assert from "node:assert/strict";
import fs from "node:fs";
import {reconcileConfirmedSquad,repairLegacySquadIdentity} from "../lib/squad-identity.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";

const names=["Tesla","Adam","McGregor","Swift","Fiona"];
const hero=(name,power)=>({name,level:150,stars:5,power,exclusive:null,gear:null,awakening:null});
const squad=(id,composition=names)=>({
  id,name:`Squad ${id}`,power:40,updated_at:"2026-09-20T10:00:00.000Z",needs_rescan:false,
  composition_changed_at:"2026-09-20T10:00:00.000Z",
  composition_confirmed_at:"2026-09-20T10:00:00.000Z",
  composition_source:"explicit_confirmation",
  confirmed_composition:[...composition],composition_conflict:null,
  heroes:composition.map((name,i)=>hero(name,5+i/10))
});
const base={
  player_id:"player-1",hero_profiles:[],hero_progression:[],exclusive_weapons:[],
  squads:[squad(1),squad(2),squad(3),squad(4)]
};

// A partial scan with a missing first OCR row must not shift or erase Tesla.
{
  const partialScan=[{},hero("Adam",99),hero("McGregor",98),hero("Swift",97),hero("Fiona",96)];
  const out=reconcileConfirmedSquad(base,{squadId:3,names,incomingHeroes:partialScan,updatedAt:"2026-09-22T10:00:00.000Z"}).state;
  assert.equal(out.squads.length,4);
  assert.ok(out.squads.every(s=>s.heroes.length===5));
  assert.deepEqual(out.squads[2].heroes.map(h=>h.name),names);
  assert.deepEqual(out.squads[2].confirmed_composition,names);
  assert.equal(out.squads[2].heroes[0].power,5);
  assert.equal(out.squads[2].heroes[1].power,99);
  console.log("PASS: partial Escouade 3 scan keeps Tesla in slot 1 and never shifts Adam/McGregor/Swift/Fiona");
}

// A sparse cloud payload and a newer merge keep all five confirmed positions.
{
  const sparse=[null,hero("Adam",99),hero("McGregor",98),hero("Swift",97),hero("Fiona",96)];
  const remote={...base,updated_at:"2026-09-22T10:01:00.000Z",squads:[squad(1),squad(2),{...squad(3),needs_rescan:true,heroes:sparse},squad(4)]};
  const hydrated=hydrateCloudState(remote,base,"player-1");
  assert.deepEqual(hydrated.squads[2].heroes.map(h=>h.name),names);
  const merged=mergeNewest(base,remote);
  assert.deepEqual(merged.squads[2].heroes.map(h=>h.name),names);
  assert.deepEqual(merged.squads[2].confirmed_composition,names);
  console.log("PASS: cloud hydration and local/cloud merge preserve the confirmed five-slot composition");
}

// Backfill materializes five positions without shifting a legacy sparse squad.
{
  const normalized=normalizeState({
    squads:[
      squad(1),squad(2),
      {...squad(3),needs_rescan:true,confirmed_composition:names,heroes:[null,hero("Adam",99),hero("McGregor",98),hero("Swift",97),hero("Fiona",96)]},
      {...squad(4),heroes:[]}
    ]
  });
  assert.ok(normalized.squads.every(s=>s.heroes.length===5));
  assert.deepEqual(normalized.squads[2].heroes.map(h=>h.name),names);
  assert.deepEqual(normalized.squads[2].confirmed_composition,names);
  assert.equal(normalized.squads[3].heroes.length,5);
  console.log("PASS: normalization/backfill always emits four escouades with five fixed materialized slots");
}

// Duplicate repair is non-destructive and creates a visible verification conflict.
{
  const duplicate=structuredClone(base);
  duplicate.squads[3].heroes[0]=hero("Tesla",77);
  const repaired=repairLegacySquadIdentity(duplicate,{now:"2026-09-22T10:02:00.000Z"}).state;
  assert.equal(repaired.squads[0].heroes[0].name,"Tesla");
  assert.equal(repaired.squads[3].heroes[0].name,"Tesla");
  assert.equal(repaired.squads[0].composition_conflict.status,"needs_verification");
  assert.equal(repaired.squads[3].composition_conflict.status,"needs_verification");
  assert.equal(repaired.squads[0].needs_rescan,true);
  console.log("PASS: duplicate repair preserves both confirmed slots and marks the conflict for verification");
}

// The browser must also materialize five rows for rendering and confirmation.
{
  const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
  assert.match(app,/Array\.from\(\{length:5\},\(_,j\)=>\{const h=heroes\[j\]/);
  assert.match(app,/const heroes=fixedHeroSlots\(sq\.heroes\);rows\.innerHTML=Array\.from\(\{length:5\}/);
  assert.doesNotMatch(app,/\(sq\.heroes\|\|\[\]\)\.map/);
  assert.doesNotMatch(app,/\(sq\.heroes\|\|\[\]\)\.slice\(0,5\)\.map/);
  console.log("PASS: Player rendering and hero confirmation never iterate a sparse hero array directly");
}

console.log("WarBoost V2.5.28 hero slot integrity verification complete.");