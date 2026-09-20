import assert from "node:assert/strict";
import {parseHeroPower,confirmedHeroPower,confirmedHeroPowerMillions} from "../lib/hero-power.js";
import {normalizeState} from "../lib/normalize.js";
import {reconcileConfirmedSquad,synchronizeHeroProfiles,mergeConfirmedExclusiveWeaponPowers} from "../lib/squad-identity.js";

assert.equal(parseHeroPower("5,65 M"),5_650_000);
assert.equal(parseHeroPower("5.11M"),5_110_000);
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
  },{},{}],
  exclusive_weapons:[{hero_name:"Carlie",level:2,power:4000000}]
});
const exclusiveApplied=mergeConfirmedExclusiveWeaponPowers(exclusiveBase,{
  weapons:[{hero_name:"Carlie",level:3,power:5665085}],
  updatedAt:"2026-09-20T11:00:00Z"
}).state;
assert.equal(confirmedHeroPowerMillions(exclusiveApplied.squads[1].heroes[4].power),5.665085);
assert.equal(confirmedHeroPowerMillions(exclusiveApplied.squads[1].power),39.73);
assert.equal(exclusiveApplied.hero_profiles.filter(x=>x.hero_name==="Carlie").length,1);
assert.equal(exclusiveApplied.hero_profiles.find(x=>x.hero_name==="Carlie").power,5665085);
const partialExclusive=mergeConfirmedExclusiveWeaponPowers(exclusiveApplied,{
  weapons:[{hero_name:"Carlie",level:4,power:0},{hero_name:"Carlie",level:5}],
  updatedAt:"2026-09-20T12:00:00Z"
}).state;
assert.equal(partialExclusive.squads[1].heroes[4].power,5665085);
assert.equal(partialExclusive.hero_profiles.filter(x=>x.hero_name==="Carlie").length,1);

console.log("PASS: hero powers normalize across units, confirmed values survive partial scans, zeros stay unknown, and squad totals can be marked pending without losing history");