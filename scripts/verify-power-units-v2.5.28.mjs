import assert from "node:assert/strict";
import fs from "node:fs";
import {canonicalPowerMillions} from "../lib/power-units.js";
import {normalizeState} from "../lib/normalize.js";
import {normalizeProgressionSnapshots,progressionComparison,strongestSquadFromState} from "../lib/progression-history.js";

assert.equal(canonicalPowerMillions("34.29M"),34.29);
assert.equal(canonicalPowerMillions("34,29 M"),34.29);
assert.equal(canonicalPowerMillions("42.77M"),42.77);
assert.equal(canonicalPowerMillions("219M"),219);
assert.equal(canonicalPowerMillions(34),34);
assert.equal(canonicalPowerMillions(43),43);
assert.equal(canonicalPowerMillions(219),219);
assert.equal(canonicalPowerMillions(34_290_000),34.29);
assert.equal(canonicalPowerMillions(42_770_000),42.77);
assert.equal(canonicalPowerMillions(219_000_000),219);

const heroes=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
const state=normalizeState({
  player:{power_m:219_000_000},
  drone:{level:150,power_m:12_500_000},
  squads:[
    {id:1,power:42.77,heroes:[]},
    {id:2,power:34_290_000,heroes:heroes.map((name,index)=>({name,power:1_000_000+index}))},
    {id:3,power:31,heroes:[]},
    {id:4,power:29,heroes:[]}
  ],
  exclusive_weapons:[{hero_name:"Kimberly",weapon_name:"Test",power:34_290_000}]
});
assert.equal(state.player.power_m,219);
assert.equal(state.drone.power_m,12.5);
assert.deepEqual(state.squads.map(s=>s.power),[42.77,34.29,31,29]);
assert.deepEqual(state.squads[1].heroes.map(h=>h.name),heroes);
assert.deepEqual(state.squads[1].heroes.map(h=>h.power),[1_000_000,1_000_001,1_000_002,1_000_003,1_000_004]);
assert.equal(state.exclusive_weapons[0].power,34_290_000);
assert.equal(strongestSquadFromState({squads:[{power:34_290_000},{power:42.77}]}).power_m,42.77);

const snapshots=normalizeProgressionSnapshots([
  {at:"2026-09-17T10:00:00Z",main_squad_power_m:42.77,main_squad_updated_at:"2026-09-17T10:00:00Z",squad_powers:[42.77,33.9,null,null]},
  {at:"2026-09-18T10:00:00Z",main_squad_power_m:43_290_000,main_squad_updated_at:"2026-09-18T10:00:00Z",squad_powers:[43_290_000,34_290_000,null,null]}
]);
assert.equal(snapshots[1].main_squad_power_m,43.29);
assert.deepEqual(snapshots[1].squad_powers,[43.29,34.29,null,null]);
const comparison=progressionComparison(snapshots,30);
assert.equal(comparison.main_squad.change_m,0.52);
assert.equal(comparison.main_squad.pct,1.2);
assert.ok(Math.abs(comparison.main_squad.pct)<100);

const scan=fs.readFileSync(new URL("../api/scan.js",import.meta.url),"utf8");
assert.match(scan,/canonicalPowerMillions\(raw\?\.power_m\?\?raw\?\.power\)/);
assert.match(scan,/return 34\.29 for a visible 34\.29M, never 34290000/);

console.log("WarBoost power-unit normalization: PASS");