import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sanitize,usefulState} from "../api/scan.js";
import {parseHeroPower} from "../lib/hero-power.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const now="2026-09-18T12:00:00.000Z";

for(const [input,expected] of [
  ["5665085",5665085],
  ["5 665 085",5665085],
  ["5.665.085",5665085],
  ["5,665,085",5665085],
  ["5,65 M",5650000],
  ["5 269 612",5269612]
])assert.equal(parseHeroPower(input),expected);

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

// Real-player regression: Swift's exclusive weapon screen includes a visible
// hero, level, full weapon power and secondary stats.
{
  const state=sanitize({
    exclusive_weapon:{
      hero_name:"Swift",
      weapon_name:"Swift Exclusive Weapon",
      level:"Niv. 3",
      power:"526612",
      hero_hp_bonus:"8%",
      hero_atk_bonus:"12%",
      hero_def_bonus:"6%",
      all_damage_resistance_pct:"4.5%",
      max_skill_level:"3"
    }
  },now,"exclusive");
  assert.deepEqual(state.exclusive_weapons,[{
    updated_at:now,
    hero_name:"Swift",
    weapon_name:"Swift Exclusive Weapon",
    level:3,
    power:526612,
    hero_hp_bonus:8,
    hero_atk_bonus:12,
    hero_def_bonus:6,
    all_damage_resistance_pct:4.5,
    max_skill_level:3
  }]);
  assert.equal(usefulState("exclusive",state),true);
  console.log("PASS: Swift exclusive weapon power 526612 and visible stats survive sanitization");
}

{
  const state=sanitize({
    exclusive_weapons:[
      {hero_name:"Carly",power:"5 665 085"},
      {hero_name:"Swift",power:"5 269 612"}
    ]
  },now,"exclusive");
  assert.deepEqual(state.exclusive_weapons.map(x=>[x.hero_name,x.power]),[
    ["Carlie",5665085],
    ["Swift",5269612]
  ]);
  console.log("PASS: localized Carlie/Carly and Swift exclusive powers survive scan sanitization");
}

{
  const state=sanitize({
    exclusive_weapons:[{hero_name:"Carlie",power:"5.67M?"}]
  },now,"exclusive");
  assert.equal(state.exclusive_weapons[0].power,undefined);
  assert.equal(state.exclusive_weapons[0].power_raw,"5.67M?");
  assert.equal(state.exclusive_weapons[0].power_parse_status,"needs_verification");
  console.log("PASS: unreadable visible exclusive power stays editable and unconfirmed");
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
const css=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const analysis=app.slice(app.indexOf("async function analyzeExclusiveScan"),app.indexOf('$("#analyzeScanBtn").addEventListener("click",async()=>'));
assert.match(scan,/partial_results_allowed:scanType==="exclusive"/);
assert.match(scan,/requires_confirmation:\/\^squad\[1-4\]\$\/i\.test\(scanType\)\|\|scanType==="exclusive"/);
assert.match(app,/event\.stopImmediatePropagation\(\)/);
assert.match(app,/renderExclusiveConfirmation\(rows\)/);
assert.match(app,/type="text" inputmode="decimal"/);
assert.match(app,/scan_exclusive_power_verify/);
assert.match(app,/exclusivePowerNeedsVerification/);
assert.match(app,/exclusiveResultFieldCount\(rows\)/);
assert.match(app,/scrollIntoView\(\{behavior:"smooth",block:"nearest"\}\)/);
assert.match(app,/scan_exclusive_result_ready/);
assert.match(app,/scan_exclusive_no_data/);
assert.match(app,/scan_exclusive_analysis_failed/);
assert.match(app,/mergeStateProtected\(state,\{exclusive_weapons:confirmed\}/);
assert.match(app,/openSquadCaptureHelp\(true\)/);
assert.match(app,/scan_wrong_squad_capture/);
assert.doesNotMatch(analysis,/saveState\(\)/);
assert.match(analysis,/savePendingSingleScan/);
assert.match(html,/id="exclusiveConfirmPanel"/);
assert.match(html,/id="saveExclusiveConfirmBtn"/);
assert.match(html,/id="squadCaptureHelp"/);
assert.match(html,/id="squadCaptureHelpBtn"/);
assert.match(html,/id="squadCaptureAckBtn"/);
assert.match(html,/scan_squad_capture_step3/);
assert.match(html,/id="collapseAllSquadsBtn"/);
assert.match(app,/class="squadHead"/);
assert.match(app,/<details class="squad"/);
assert.match(app,/<summary class="squadHead">/);
assert.match(app,/querySelectorAll\("#squadList details\.squad"\)/);
assert.match(app,/squad\.open=false/);
assert.doesNotMatch(app,/data-squad-toggle/);
assert.doesNotMatch(app,/squadAccordionOpenIds/);
assert.doesNotMatch(app,/body\.hidden=!open/);
assert.match(css,/\.squadCaptureStepGood/);
assert.match(css,/\.squadSectionToolbar/);
assert.match(css,/\.squad\[open\] \.squadHead \.chev::before[\s\S]*content:"⌃"/);
assert.match(css,/\.squad:not\(\[open\]\)>\.squadBody[\s\S]*display:none/);
assert.match(css,/\.squad\[open\]>\.squadBody[\s\S]*display:block/);
assert.match(css,/\.squadHead::?-webkit-details-marker/);
assert.match(css,/touch-action:manipulation/);
assert.match(scan,/formation_overview/);
assert.match(scan,/WRONG_SQUAD_CAPTURE/);
console.log("PASS: exclusive scan stages Vision data, confirms it, then saves only after confirmation");
console.log("WarBoost V2.5.28 exclusive scan verification: PASS");