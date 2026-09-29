import assert from "node:assert/strict";
import fs from "node:fs";
import {sanitize,usefulState} from "../api/scan.js";
import {classifyDroneScreen,parseDronePowerUnits} from "../lib/drone-scan.js";
import {createScanReviewDraft,applyOwnedScanReview} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";

const now="2026-09-29T12:00:00.000Z";
const visiblePower={power_raw:"9 057 163",power_label:"Puissance du Drone",power_evidence:"visible_drone_power",power_confidence:0.96};
for(const [raw,expected] of [["9 057 163",9057163],["9\u202f057\u202f163",9057163],["9057163",9057163],["9.057.163",9057163],["9,057,163",9057163],["9.057163M",9057163]]){
  assert.equal(parseDronePowerUnits(raw),expected,`raw power ${raw} remains whole units`);
}
for(const raw of ["0,907","0.907","9,057","9.057,163","9 057,163","9057","9 057 16","9 057 163 %","-9057163","NaN"]){
  assert.equal(parseDronePowerUnits(raw),null,`ambiguous power ${raw} is rejected`);
}
assert.equal(classifyDroneScreen({screen_type:"attributes",screen_title:"Boost de Combat"}),"combat_boost","visible title overrides a contradictory classification");
const boost=sanitize({screen_type:"attributes",screen_title:"Boost de Combat",boostCombat:{level:"Lv.400"},drone:{level:150,...visiblePower}},now,"drone");
assert.deepEqual(boost.drone.boostCombat,{level:400,updated_at:now});
assert.equal(boost.drone.level,undefined,"Lv.400 never becomes general Drone level");
assert.equal(boost.drone.power_m,9.057163,"stored canonical millions preserve 9 057 163 raw units");
assert.equal(usefulState("drone",boost),true);
const boostOnly=sanitize({screen_type:"combat_boost",boostCombat:{level:400},drone:{power_m:0.907}},now,"drone");
assert.equal(boostOnly.drone.power_m,undefined,"unverified decimal cannot be accepted from legacy Vision output");
assert.equal(usefulState("drone",boostOnly),true,"Boost level alone remains reviewable");
const attributes=sanitize({screen_type:"attributes",drone:{level:150,...visiblePower}},now,"drone");
assert.equal(attributes.drone.level,150);
assert.equal(attributes.drone.boostCombat,undefined);
for(const screen_type of ["components","skill_chip","unknown"]){
  const ignored=sanitize({screen_type,drone:{level:400,boostCombat:{level:400},power_m:0.907}},now,"drone");
  assert.equal(ignored.drone,undefined,`${screen_type} cannot claim a Drone level or ambiguous power`);
  assert.equal(usefulState("drone",ignored),false);
}
for(const altered of [
  {power_raw:"0,907"},
  {power_raw:"9057163",power_confidence:0.7},
  {power_raw:"9057163",power_evidence:"visible_combat_rate"},
  {power_raw:"9057163",power_label:""},
  {power_raw:"9057163",power_label:"exact visible label for Drone power"}
]){
  const result=sanitize({screen_type:"combat_boost",boostCombat:{level:400},drone:{...visiblePower,...altered}},now,"drone");
  assert.equal(result.drone.power_m,undefined,"unreliable power is omitted, not replaced with zero");
}
const patch=createScanReviewDraft("drone",boostOnly);
assert.deepEqual(patch,{drone:{boostCombat:{level:400}}},"review excludes provenance and unsourced power");
const groups=buildScanReviewGroups("drone",patch);
assert.deepEqual(groups.map(group=>group.kind),["drone","boostCombat"]);
assert.equal(groups[0].rows[0].status,"missing","uncertain power shows a missing review field");
const {html,rows}=renderScanReviewMarkup(groups,key=>key,text=>String(text).replaceAll("&","&amp;"));
assert.match(html,/scan_review_group_boostCombat/);
assert.match(html,/scan_review_drone_power_missing/);
assert.ok(rows.some(row=>row.path.join(".")==="drone.boostCombat.level"));
const owned={owner:"player-a",patch};
const blank=applyOwnedScanReview(owned,"player-a",[{path:["drone","power_m"],value:""}]);
assert.deepEqual(blank.patch,patch,"blank power leaves confirmed state untouched");
const corrected=applyOwnedScanReview(owned,"player-a",[
  {path:["drone","boostCombat","level"],value:"401"},
  {path:["drone","power_m"],value:"9 057 163"}
]);
assert.deepEqual(corrected.errors,[]);
assert.equal(corrected.patch.drone.boostCombat.level,401);
assert.equal(corrected.patch.drone.power_m,9.057163);
for(const invalid of ["0,907","9.057,163","garbled"]){
  const result=applyOwnedScanReview(owned,"player-a",[{path:["drone","power_m"],value:invalid}]);
  assert.equal(result.errors[0]?.reason,"invalid_number","ambiguous manual correction cannot be saved");
}
assert.equal(applyOwnedScanReview(owned,"player-b",[]),null,"another account cannot confirm the scan");
const previous=normalizeState({drone:{level:160,power_m:12.4,boostCombat:{level:390,updated_at:now}}});
const retained=normalizeState({...previous,drone:{...previous.drone,...blank.patch.drone,boostCombat:{...previous.drone.boostCombat,...blank.patch.drone.boostCombat}}});
assert.equal(retained.drone.level,160,"Boost scan preserves confirmed general level");
assert.equal(retained.drone.power_m,12.4,"unreadable power preserves confirmed power");
assert.equal(retained.drone.boostCombat.level,400,"Boost level survives normalization and saving");
assert.equal(mergeNewest(retained,{drone:{level:170,boostCombat:{level:null},updated_at:"2026-09-30T12:00:00.000Z"}}).drone.boostCombat.level,400,"a newer partial cloud update cannot clear confirmed Boost level");
const texts=fs.readFileSync(new URL("../i18n.js",import.meta.url),"utf8");
const translations=texts.match(/const SCAN_REVIEW_DRONE_TEXT=\{([\s\S]*?)\n\};/)?.[1]||"";
assert.equal(translations.split("\n").filter(line=>line.includes("¦")).length,23,"all 22 languages (23 regional locales) have Drone labels and missing-power state");
const unsupported=texts.match(/const SCAN_DRONE_UNSUPPORTED_TEXT=\{([\s\S]*?)\n\};/)?.[1]||"";
assert.equal(unsupported.split("\n").filter(line=>line.includes("¦")).length,23,"Components and Skill Chip feedback is localized in every locale");
console.log("PASS: Drone sub-screens, raw power, review, corrections, confirmed-data preservation and 22-language coverage");