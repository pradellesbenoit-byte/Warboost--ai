import assert from "node:assert/strict";
import fs from "node:fs";
import {mergeConfirmedExclusiveWeaponPowers,backfillConfirmedHeroPowers} from "../lib/squad-identity.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";
import {confirmedHeroPowerMillions} from "../lib/hero-power.js";

const confirmedRows=[
  {hero_name:"Carlie",weapon_name:"Carlie's EX",level:3,power:5_665_085,updated_at:"2026-09-22T10:00:00.000Z"},
  {hero_name:"Swift",weapon_name:"Swift's EX",level:4,power:5_269_612,updated_at:"2026-09-22T10:00:00.000Z"}
];
const hero=(name,power)=>({name,level:150,stars:5,power,exclusive:8,gear:null,awakening:null});
const emptySquad=id=>({id,name:`Squad ${id}`,power:null,updated_at:"2026-09-20T10:00:00.000Z",needs_rescan:false,heroes:Array.from({length:5},()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null}))});
const base={
  player_id:"power-test",hero_profiles:[],hero_progression:[],exclusive_weapons:[],
  squads:[emptySquad(1),{...emptySquad(2),heroes:[hero("DVA",5_650_000),hero("Lucius",5_530_000),hero("Skyler",5_110_000),hero("Morrison",5_100_000),hero("Carlie",null)]},{...emptySquad(3),heroes:[hero("Tesla",5_760_000),hero("Adam",5_580_000),hero("McGregor",6_070_000),hero("Swift",null),hero("Fiona",4_960_000)]},emptySquad(4)]
};

const saved=mergeConfirmedExclusiveWeaponPowers({...base,exclusive_weapons:confirmedRows},{weapons:confirmedRows,updatedAt:"2026-09-22T10:00:00.000Z"}).state;
assert.equal(saved.exclusive_weapons.find(x=>x.hero_name==="Carlie").power,5_665_085);
assert.equal(saved.exclusive_weapons.find(x=>x.hero_name==="Swift").power,5_269_612);
assert.equal(saved.hero_profiles.find(x=>x.hero_name==="Carlie").power,5_665_085);
assert.equal(saved.hero_profiles.find(x=>x.hero_name==="Swift").power,5_269_612);
assert.equal(saved.squads[1].heroes[4].power,5_665_085);
assert.equal(saved.squads[2].heroes[3].power,5_269_612);
assert.deepEqual(saved.squads[1].heroes.slice(0,4).map(x=>x.power),[5_650_000,5_530_000,5_110_000,5_100_000]);
assert.deepEqual(saved.squads[2].heroes.slice(0,3).map(x=>x.power),[5_760_000,5_580_000,6_070_000]);
console.log("PASS: confirmed Carlie and Swift exclusive powers persist in weapons, profiles, and exact squad slots");

const reopened=normalizeState({
  ...saved,
  squads:saved.squads.map(s=>({...s,heroes:s.heroes.map(h=>({...h,power:["Carlie","Swift"].includes(h.name)?null:h.power}))}))
});
assert.equal(confirmedHeroPowerMillions(reopened.squads[1].heroes[4].power),5.665085);
assert.equal(confirmedHeroPowerMillions(reopened.squads[2].heroes[3].power),5.269612);
console.log("PASS: close/reopen normalization backfills empty Carlie and Swift slots");

const cloudRemote={
  ...saved,
  exclusive_weapons:confirmedRows.map(x=>({...x,power:null})),
  hero_profiles:saved.hero_profiles.map(x=>({...x,power:null})),
  squads:saved.squads.map(s=>({...s,heroes:s.heroes.map(h=>({...h,power:["Carlie","Swift"].includes(h.name)?null:h.power}))}))
};
const hydrated=hydrateCloudState(cloudRemote,saved,"power-test");
assert.equal(hydrated.squads[1].heroes[4].power,5_665_085);
assert.equal(hydrated.squads[2].heroes[3].power,5_269_612);
const merged=mergeNewest(saved,cloudRemote);
assert.equal(merged.squads[1].heroes[4].power,5_665_085);
assert.equal(merged.squads[2].heroes[3].power,5_269_612);
console.log("PASS: cloud hydration and local/cloud merge reject empty or zero remote power");

const backfilled=backfillConfirmedHeroPowers({
  ...saved,
  squads:saved.squads.map(s=>({...s,heroes:s.heroes.map(h=>({...h,power:["Carlie","Swift"].includes(h.name)?0:h.power}))}))
}).state;
assert.equal(backfilled.squads[1].heroes[4].power,5_665_085);
assert.equal(backfilled.squads[2].heroes[3].power,5_269_612);
assert.deepEqual(backfilled.squads[1].heroes.slice(0,4).map(x=>x.power),[5_650_000,5_530_000,5_110_000,5_100_000]);
assert.deepEqual(backfilled.squads[2].heroes.slice(0,3).map(x=>x.power),[5_760_000,5_580_000,6_070_000]);
console.log("PASS: valid DVA/Lucius/Skyler/Morrison and other hero powers remain unchanged");

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
assert.match(app,/const identityPower=profilePower\?\?weaponPower/);
assert.match(app,/state=mergeConfirmedExclusiveWeaponPowers\(staged,\{weapons:confirmed,updatedAt:now\}\)\.state/);
console.log("PASS: Player display prioritizes confirmed identity power and confirmed exclusive scans use the persistence path");

console.log("WarBoost V2.5.28 exclusive power persistence verification complete.");