import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sanitize,usefulState} from "../api/scan.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const now="2026-09-18T12:00:00.000Z";

// Real-player regression: DVA's exclusive weapon screen shows a localized Lv.26 label
// and can omit secondary values from the provider response.
{
  const state=sanitize({
    exclusive_weapon:{
      hero_name:"D.V.A",
      weapon_name:"Lame de Frappe DVA",
      level:"Lv.26",
      hero_atk_bonus:"12%"
    }
  },now,"exclusive");
  assert.deepEqual(state.exclusive_weapons,[{
    updated_at:now,
    hero_name:"DVA",
    weapon_name:"Lame de Frappe DVA",
    level:26,
    hero_atk_bonus:12
  }]);
  assert.equal(usefulState("exclusive",state),true);
  console.log("PASS: DVA exclusive weapon Lv.26 is accepted with partial secondary stats");
}

// Layout/language aliases are accepted without inventing values.
{
  const state=sanitize({
    exclusiveWeapon:{
      hero:{name:"DVA"},
      weapon:{name:"DVA Strike Blade"},
      visible_level:"Niv. 26"
    }
  },now,"exclusive");
  assert.equal(state.exclusive_weapons[0].hero_name,"DVA");
  assert.equal(state.exclusive_weapons[0].weapon_name,"DVA Strike Blade");
  assert.equal(state.exclusive_weapons[0].level,26);
  assert.equal(Object.hasOwn(state.exclusive_weapons[0],"power"),false);
  assert.equal(Object.hasOwn(state.exclusive_weapons[0],"hero_hp_bonus"),false);
  console.log("PASS: alternate weapon layout and level label stay partial and non-invented");
}

// Existing squad and Drone scan paths remain useful and valid.
{
  const drone=sanitize({drone:{level:150}},now,"drone");
  const squad=sanitize({squads:[{id:1,power:"34.29M",heroes:[{name:"DVA",level:150}]}]},now,"squad1");
  assert.equal(usefulState("drone",drone),true);
  assert.equal(usefulState("squad1",squad),true);
  assert.equal(squad.squads[0].power,34.29);
  console.log("PASS: Drone and squad scan usefulness remains intact");
}

const scan=fs.readFileSync(path.join(root,"api/scan.js"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const analysis=app.slice(app.indexOf("async function analyzeExclusiveScan"),app.indexOf('$("#analyzeScanBtn").addEventListener("click",async()=>'));
assert.match(scan,/partial_results_allowed:scanType==="exclusive"/);
assert.match(scan,/requires_confirmation:\/\^squad\[1-4\]\$\/i\.test\(scanType\)\|\|scanType==="exclusive"/);
assert.match(app,/event\.stopImmediatePropagation\(\)/);
assert.match(app,/renderExclusiveConfirmation\(rows\)/);
assert.match(app,/mergeStateProtected\(state,\{exclusive_weapons:confirmed\}/);
assert.doesNotMatch(analysis,/saveState\(\)/);
assert.match(analysis,/savePendingSingleScan/);
assert.match(html,/id="exclusiveConfirmPanel"/);
assert.match(html,/id="saveExclusiveConfirmBtn"/);
console.log("PASS: exclusive scan stages Vision data, confirms it, then saves only after confirmation");
console.log("WarBoost V2.5.28 exclusive scan verification: PASS");