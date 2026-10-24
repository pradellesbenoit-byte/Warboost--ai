import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {promptFor,sanitize,usefulState} from "../api/scan.js";

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

// A large number below the weapon level is never weapon power or hero power.
{
  const state=sanitize({
    exclusive_weapon:{
      hero_name:"Swift",
      weapon_name:"Swift Exclusive Weapon",
      level:"Niv. 3",
      power:"526612",
      visible_power:"5 266 12",
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
    hero_hp_bonus:8,
    hero_atk_bonus:12,
    hero_def_bonus:6,
    all_damage_resistance_pct:4.5,
    max_skill_level:3
  }]);
  assert.ok(state.exclusive_weapons.every(row=>!Object.keys(row).some(key=>/power/i.test(key))));
  assert.equal(usefulState("exclusive",state),true);
  console.log("PASS: exclusive central number is excluded while level and visible stats survive sanitization");
}

{
  const state=sanitize({
    exclusive_weapons:[
      {hero_name:"Carly",power:"5 665 085",power_raw:"5 665 085",weapon_power:"5665085",hero_power:"5665085"},
      {hero_name:"Swift",power:"5 269 612",power_text:"5 269 612",combat_power_value:"5269612"}
    ]
  },now,"exclusive");
  assert.deepEqual(state.exclusive_weapons.map(x=>x.hero_name),["Carlie","Swift"]);
  assert.ok(state.exclusive_weapons.every(row=>!Object.keys(row).some(key=>/power/i.test(key))));
  console.log("PASS: legacy provider power aliases are stripped from exclusive scan results");
}

{
  const state=sanitize({
    exclusive_weapons:[{hero_name:"Carlie",power:"5.67M?",power_raw:"5.67M?",exclusive_power:"5.67M?"}]
  },now,"exclusive");
  assert.ok(state.exclusive_weapons.every(row=>!Object.keys(row).some(key=>/power/i.test(key))));
  assert.equal(usefulState("exclusive",state),true);
  console.log("PASS: unreadable exclusive central number is also excluded");
}

// Existing squad and Drone scan paths remain useful and valid.
{
  const drone=sanitize({screen_type:"attributes",drone:{level:150}},now,"drone");
  const squad=sanitize({squads:[{id:1,power:"34.29M",heroes:[{name:"DVA",level:150}]}]},now,"squad1");
  assert.equal(usefulState("drone",drone),true);
  assert.equal(usefulState("squad1",squad),true);
  assert.equal(squad.squads[0].power,34.29);
  console.log("PASS: Drone and squad scan usefulness remains intact");
}

const scan=fs.readFileSync(path.join(root,"api/scan.js"),"utf8");
const exclusivePrompt=promptFor("exclusive","fr");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const css=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const analysis=app.slice(app.indexOf("async function analyzeExclusiveScan"),app.indexOf('$("#analyzeScanBtn").addEventListener("click",async event=>'));
const exclusiveReview=app.slice(app.indexOf("function renderExclusiveConfirmation"),app.indexOf("function heroConfirmOptions"));
assert.match(scan,/partial_results_allowed:scanType==="exclusive"/);
assert.match(scan,/requires_confirmation:\/\^squad\[1-4\]\$\/i\.test\(scanType\)\|\|scanType==="exclusive"/);
assert.match(app,/event\.stopImmediatePropagation\(\)/);
assert.match(app,/renderExclusiveConfirmation\(rows\)/);
assert.match(exclusiveReview,/Object\.fromEntries\(usableFields\.filter/);
assert.doesNotMatch(exclusiveReview,/data-exclusive-field="power"|power_raw|exclusivePower/);
assert.doesNotMatch(analysis,/needsPowerReview|exclusivePower|power_raw|w\.power/);
assert.match(app,/exclusiveResultFieldCount\(rows\)/);
assert.match(app,/scrollIntoView\(\{behavior:"smooth",block:"nearest"\}\)/);
assert.match(app,/scan_exclusive_result_ready/);
assert.match(app,/scan_exclusive_no_data/);
assert.match(app,/scan_exclusive_analysis_failed/);
assert.match(app,/mergeStateProtected\(state,\{exclusive_weapons:observed\},\{preferBase:false\}\)/);
assert.match(app,/openSquadCaptureHelp\(true\)/);
assert.match(app,/scan_wrong_squad_capture/);
assert.doesNotMatch(analysis,/saveState\(\)/);
assert.match(analysis,/scanRequestIsCurrent\(request\)/);
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
assert.match(scan,/classifySquadCapture/);
assert.match(exclusivePrompt,/large number directly below the weapon level is intentionally excluded/i);
assert.match(exclusivePrompt,/never return it as power, power_raw, weapon_power or hero_power/i);
assert.doesNotMatch(exclusivePrompt,/"power":/);
// A readable complementary weapon screen must not abort the whole squad lot.
// Missing formation guidance now belongs to the completed batch, not each image.
assert.match(fs.readFileSync("lib/player-scan-batch.js","utf8"),/WRONG_SQUAD_CAPTURE/);
console.log("PASS: exclusive scan stages Vision data, confirms it, then saves only after confirmation");
console.log("WarBoost V2.5.28 exclusive scan verification: PASS");