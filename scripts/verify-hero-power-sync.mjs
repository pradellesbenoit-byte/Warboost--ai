import assert from "node:assert/strict";
import {parseHeroPower,confirmedHeroPower,confirmedHeroPowerMillions} from "../lib/hero-power.js";
import {normalizeState} from "../lib/normalize.js";
import {reconcileConfirmedSquad,synchronizeHeroProfiles,mergeConfirmedExclusiveWeaponPowers} from "../lib/squad-identity.js";
import {canonicalHeroName,canonicalExclusiveWeaponHeroName} from "../lib/heroes.js";

assert.equal(parseHeroPower("5,65 M"),5_650_000);
assert.equal(parseHeroPower("5.11M"),5_110_000);
assert.equal(parseHeroPower("5665085"),5_665_085);
assert.equal(parseHeroPower("5 665 085"),5_665_085);
assert.equal(parseHeroPower("5.665.085"),5_665_085);
assert.equal(parseHeroPower("5,665,085"),5_665_085);
assert.equal(parseHeroPower("5,65 M"),5_650_000);
assert.equal(parseHeroPower("5 269 612"),5_269_612);
assert.equal(canonicalHeroName("Carly"),"Carlie");
assert.equal(canonicalHeroName("Charlie"),"Carlie");
assert.equal(canonicalExclusiveWeaponHeroName("Tonnerre Swift",""),"Swift");
assert.equal(canonicalExclusiveWeaponHeroName("Tonnere Swift",""),"Swift");
assert.equal(canonicalExclusiveWeaponHeroName("Tesla","Tonnerre Swift"),"Swift");
assert.equal(confirmedHeroPower("0 M"),null);
assert.equal(confirmedHeroPowerMillions("5,65 M"),5.65);

const squad2=[
  {name:"DVA",power:"5,65 M"},
  {name:"Lucius",power:"5,53 M"},
  {name:"Skyler",power:"5,11 M"},
  {name:"Morrison",power:"5,1 M"},
  {name:"Carlie",power:0}
];
const squad3=[
  {name:"Tesla",power:"5,76 M"},
  {name:"Adam",power:"5,58 M"},
  {name:"McGregor",power:"6,07 M"},
  {name:"Fiona",power:"4,96 M"},
  {name:"Swift",power:null}
];
const normalized=normalizeState({
  squads:[
    {},
    {power:"39,73 M",heroes:squad2},
    {power:"40,6 M",heroes:squad3},
    {}
  ]
});
assert.deepEqual(normalized.squads[1].heroes.slice(0,4).map(h=>confirmedHeroPowerMillions(h.power)),[5.65,5.53,5.11,5.1]);
assert.deepEqual(normalized.squads[2].heroes.slice(0,4).map(h=>confirmedHeroPowerMillions(h.power)),[5.76,5.58,6.07,4.96]);
assert.equal(confirmedHeroPowerMillions(normalized.squads[1].heroes[4].power),null);
assert.equal(confirmedHeroPowerMillions(normalized.squads[1].power),39.73);
assert.equal(confirmedHeroPowerMillions(normalized.squads[2].power),40.6);

const existing=normalizeState({
  squads:[{},{
    power:"39.73 M",
    heroes:[{name:"DVA",power:"5.65 M"},{name:"Lucius",power:"5.53 M"},{name:"Skyler",power:"5.11 M"},{name:"Morrison",power:"5.1 M"},{name:"Carlie",power:"4.2 M"}]
  },{power:"40.6 M",heroes:squad3},{}]
});
const partial=reconcileConfirmedSquad(existing,{squadId:2,names:["DVA","Lucius","Skyler","Morrison","Carlie"],incomingHeroes:[
  {name:"DVA",power:0},
  {name:"Lucius",power:""},
  {name:"Skyler",power:null},
  {name:"Morrison",power:"5.2 M"},
  {name:"Carlie",power:0}
],updatedAt:"2026-09-20T10:00:00Z"}).state;
assert.deepEqual(partial.squads[1].heroes.map(h=>confirmedHeroPowerMillions(h.power)),[5.65,5.53,5.11,5.2,4.2]);

const profiles=synchronizeHeroProfiles(partial,{now:"2026-09-20T10:00:00Z"}).state.hero_profiles;
const dva=profiles.find(h=>h.hero_name==="DVA");
assert.equal(confirmedHeroPowerMillions(dva.power),5.65);
assert.equal(dva.power===0,false);

const noTotal=normalizeState({squads:[{},{
  power:"39.73 M",
  last_confirmed_power:"39.73 M",
  power_sync_status:"pending",
  heroes:squad2
},{},{}]});
assert.equal(confirmedHeroPowerMillions(noTotal.squads[1].power),39.73);
assert.equal(noTotal.squads[1].power_sync_status,"pending");
assert.equal(confirmedHeroPowerMillions(noTotal.squads[1].heroes[0].power),5.65);

const exclusiveBase=normalizeState({
  squads:[{},{
    power:"39.73 M",
    power_sync_status:"confirmed",
    heroes:[{name:"DVA",power:"5.65 M"},{name:"Lucius",power:"5.53 M"},{name:"Skyler",power:"5.11 M"},{name:"Morrison",power:"5.1 M"},{name:"Carlie",power:null}]
  },{power:"40.6 M",heroes:squad3},{}],
  exclusive_weapons:[{hero_name:"Carlie",level:2,power:4000000}]
});
const exclusiveApplied=mergeConfirmedExclusiveWeaponPowers(exclusiveBase,{
  weapons:[{hero_name:"Carly",level:3,power:"5 665 085"},{hero_name:"Swift",level:4,power:"5 269 612"}],
  updatedAt:"2026-09-20T11:00:00Z"
}).state;
assert.equal(confirmedHeroPowerMillions(exclusiveApplied.squads[1].heroes[4].power),5.665085);
assert.equal(confirmedHeroPowerMillions(exclusiveApplied.squads[2].heroes[4].power),5.269612);
assert.equal(confirmedHeroPowerMillions(exclusiveApplied.squads[1].power),39.73);
assert.equal(exclusiveApplied.hero_profiles.filter(x=>x.hero_name==="Carlie").length,1);
assert.equal(exclusiveApplied.hero_profiles.find(x=>x.hero_name==="Carlie").power,5665085);
assert.equal(exclusiveApplied.hero_profiles.find(x=>x.hero_name==="Swift").power,5269612);
const reopened=normalizeState(JSON.parse(JSON.stringify(exclusiveApplied)));
assert.equal(confirmedHeroPowerMillions(reopened.squads[1].heroes[4].power),5.665085);
assert.equal(confirmedHeroPowerMillions(reopened.squads[2].heroes[4].power),5.269612);
const afterSync=mergeConfirmedExclusiveWeaponPowers(reopened,{
  weapons:[{hero_name:"Carlie",power:"5,665,085"},{hero_name:"Swift",power:"5.269.612"}],
  updatedAt:"2026-09-20T12:30:00Z"
}).state;
assert.equal(confirmedHeroPowerMillions(afterSync.squads[1].heroes[4].power),5.665085);
assert.equal(confirmedHeroPowerMillions(afterSync.squads[2].heroes[4].power),5.269612);
assert.equal(afterSync.hero_profiles.find(x=>x.hero_name==="Carlie").power,5665085);
assert.equal(afterSync.hero_profiles.find(x=>x.hero_name==="Swift").power,5269612);
const partialExclusive=mergeConfirmedExclusiveWeaponPowers(exclusiveApplied,{
  weapons:[{hero_name:"Carlie",level:4,power:0},{hero_name:"Carlie",level:5}],
  updatedAt:"2026-09-20T12:00:00Z"
}).state;
assert.equal(partialExclusive.squads[1].heroes[4].power,5665085);
assert.equal(partialExclusive.hero_profiles.filter(x=>x.hero_name==="Carlie").length,1);

const legacyNames=normalizeState({
  squads:[
    {},
    {updated_at:"2026-09-20T08:00:00Z",heroes:[{name:"Charlie",power:null},{name:"Lucius",power:2_000_000},{name:"Morrison",power:2_000_000},{name:"DVA",power:2_000_000},{name:"Carlie",power:null}]},
    {updated_at:"2026-09-20T08:00:00Z",heroes:[{name:"Tesla",power:2_000_000},{name:"Swift",power:null},{name:"Fiona",power:2_000_000},{name:"McGregor",power:2_000_000},{name:"Adam",power:2_000_000}]},
    {}
  ],
  exclusive_weapons:[
    {hero_name:"Charlie",weapon_name:"Arme de Carlie",power:"5,67 M",updated_at:"2026-09-20T09:00:00Z"},
    {hero_name:"Carly",weapon_name:"Arme de Carlie",power:"5,60 M",updated_at:"2026-09-20T08:00:00Z"},
    {hero_name:"Tesla",weapon_name:"Tonnerre Swift",power:"5,12 M",updated_at:"2026-09-20T10:00:00Z"},
    {hero_name:"Tonnere Swift",weapon_name:"Tonnerre Swift",power:"5,10 M",updated_at:"2026-09-20T09:00:00Z"}
  ],
  hero_profiles:[
    {hero_name:"Charlie",power:"5,67 M",updated_at:"2026-09-20T09:00:00Z"},
    {hero_name:"Tonnere Swift",power:"5,12 M",updated_at:"2026-09-20T10:00:00Z"}
  ]
});
assert.equal(legacyNames.exclusive_weapons.length,2,"legacy Carlie/Swift weapon rows are deduplicated");
assert.deepEqual(legacyNames.exclusive_weapons.map(x=>x.hero_name).sort(),["Carlie","Swift"]);
assert.equal(legacyNames.squads[1].heroes[0].name,"Carlie");
assert.equal(confirmedHeroPowerMillions(legacyNames.squads[1].heroes[0].power),5.67);
assert.equal(confirmedHeroPowerMillions(legacyNames.squads[1].heroes[4].power),5.67);
assert.equal(confirmedHeroPowerMillions(legacyNames.squads[2].heroes[1].power),5.12);
assert.equal(legacyNames.hero_profiles.filter(x=>x.hero_name==="Carlie").length,1);
assert.equal(legacyNames.hero_profiles.filter(x=>x.hero_name==="Swift").length,1);
assert.equal(legacyNames.hero_profiles.find(x=>x.hero_name==="Carlie").power,5_670_000);
assert.equal(legacyNames.hero_profiles.find(x=>x.hero_name==="Swift").power,5_120_000);
for(const name of ["DVA","Morrison","Tesla","Lucius","Fiona","McGregor","Adam"]){
  assert.equal(legacyNames.squads.flatMap(s=>s.heroes).filter(h=>h.name===name).length,1,`${name} identity remains untouched`);
}

const newerWins=normalizeState({
  exclusive_weapons:[
    {hero_name:"Charlie",power:5_000_000,updated_at:"2026-09-20T11:00:00Z"},
    {hero_name:"Carlie",power:6_000_000,updated_at:"2026-09-20T12:00:00Z"},
    {hero_name:"Tonnere Swift",weapon_name:"Tonnere Swift",power:5_100_000,updated_at:"2026-09-20T11:00:00Z"},
    {hero_name:"Tesla",weapon_name:"Tonnerre Swift",power:5_900_000,updated_at:"2026-09-20T12:00:00Z"}
  ]
});
assert.equal(newerWins.exclusive_weapons.find(x=>x.hero_name==="Carlie").power,6_000_000);
assert.equal(newerWins.exclusive_weapons.find(x=>x.hero_name==="Swift").power,5_900_000);
assert.equal(newerWins.exclusive_weapons.filter(x=>x.hero_name==="Carlie").length,1);
assert.equal(newerWins.exclusive_weapons.filter(x=>x.hero_name==="Swift").length,1);

console.log("PASS: hero powers normalize across units, confirmed values survive partial scans, zeros stay unknown, and squad totals can be marked pending without losing history");