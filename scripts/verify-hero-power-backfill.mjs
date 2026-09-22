import assert from "node:assert/strict";
import {backfillConfirmedHeroPowers} from "../lib/squad-identity.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";
import {normalizeState} from "../lib/normalize.js";

const emptyHero=()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null});
const emptySquad=id=>({id,name:`Squad ${id}`,updated_at:"2026-09-20T10:00:00.000Z",needs_rescan:false,heroes:Array.from({length:5},emptyHero)});
const namedHero=(name,power=null)=>({...emptyHero(),name,power,level:150,stars:5,exclusive:8,gear:"T1"});
const legacy={
  player_id:"legacy-power-backfill",
  updated_at:"2026-09-22T08:00:00.000Z",
  hero_profiles:[],
  exclusive_weapons:[],
  hero_progression:[
    {hero_name:"Carlie",power_m:5.665085,updated_at:"2026-09-22T09:00:00.000Z"}
  ],
  progression_snapshots:[
    {at:"2026-09-22T10:00:00.000Z",hero_powers:[{hero_name:"Swift",power:5269612}]}
  ],
  hero_scan_history:[
    {captured_at:"2026-09-22T11:00:00.000Z",state:{squads:[{heroes:[namedHero("Fiona","4.960000 M")]}]}}
  ],
  squads:[
    {...emptySquad(1),heroes:[namedHero("Carlie"),namedHero("Tesla"),emptyHero(),emptyHero(),emptyHero()]},
    {...emptySquad(2),heroes:[namedHero("Swift"),emptyHero(),emptyHero(),emptyHero(),emptyHero()]},
    {...emptySquad(3),heroes:[namedHero("Fiona"),emptyHero(),emptyHero(),emptyHero(),emptyHero()]},
    emptySquad(4)
  ]
};

const restored=backfillConfirmedHeroPowers(legacy,{now:"2026-09-22T12:00:00.000Z"});
assert.equal(restored.changed,true);
const state=restored.state;
const profile=name=>state.hero_profiles.find(row=>row.hero_name===name);
assert.equal(profile("Carlie").power,5_665_085);
assert.equal(profile("Swift").power,5_269_612);
assert.equal(profile("Fiona").power,4_960_000);
assert.equal(state.squads[0].heroes[0].power,5_665_085);
assert.equal(state.squads[1].heroes[0].power,5_269_612);
assert.equal(state.squads[2].heroes[0].power,4_960_000);
assert.equal(state.squads[0].heroes[1].power,null);
assert.equal(state.squads[0].heroes[0].level,150);
assert.equal(state.squads[0].heroes[0].gear,"T1");

const second=backfillConfirmedHeroPowers(state,{now:"2026-09-22T13:00:00.000Z"});
assert.equal(second.changed,false);
assert.deepEqual(second.state,state);

const normalized=normalizeState(legacy);
assert.equal(normalized.hero_progression[0].power,5_665_085);
assert.equal(normalized.progression_snapshots[0].hero_powers[0].power,5_269_612);

const cloud=hydrateCloudState(legacy,{hero_profiles:[],exclusive_weapons:[],hero_progression:[],progression_snapshots:[],squads:[]},legacy.player_id);
assert.equal(cloud.squads[0].heroes[0].power,5_665_085);
assert.equal(cloud.squads[1].heroes[0].power,5_269_612);
assert.equal(cloud.squads[2].heroes[0].power,4_960_000);
assert.equal(cloud.player_id,legacy.player_id);

console.log("PASS: legacy hero powers backfill from progression, snapshots, and scan history without overwriting unrelated fields");