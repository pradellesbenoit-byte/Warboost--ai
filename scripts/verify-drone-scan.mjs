import assert from "node:assert/strict";
import fs from "node:fs";
import {sanitize,usefulState,promptFor} from "../api/scan.js";
import {classifyDroneScreen,parseDronePowerUnits} from "../lib/drone-scan.js";
import {createScanReviewDraft,applyOwnedScanReview} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {mergeDroneFacts} from "../lib/player-known-facts.js";

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
// These are regression fixtures, never defaults or game-data rules.
const header=(text,extras={})=>({text,region:"drone_power_header",anchor:"above_drone_attributes",
  evidence:"visible_drone_power",confidence:0.97,...extras});
const attributesCapture=candidates=>({screen_type:"unknown",screen_title:"Attributs du Drone",
  drone:{level:164,power_candidates:candidates}});
for(const text of ["9215521","9 215 521","9\u202f215\u202f521","9.215.521","9,215,521","9  215\t521"]){
  const parsed=sanitize(attributesCapture([header(text)]),now,"drone");
  assert.equal(parsed.drone.level,164,"general level is separate from header power");
  assert.equal(parsed.drone.power_m,9.215521,"an icon-only power header needs no printed label");
  const groups=buildScanReviewGroups("drone",createScanReviewDraft("drone",parsed));
  const row=groups.flatMap(g=>g.rows).find(r=>r.kind==="dronePower");
  assert.equal(row.status,"pending","readable value still requires the normal owner confirmation");assert.equal(row.value,9215521);
  const markup=renderScanReviewMarkup(groups,key=>key,String).html;
  assert.match(markup,/value="9215521"/);assert.doesNotMatch(markup,/<p[^>]*>scan_review_drone_power_missing/);
}
for(const text of ["9057163","9 057 163"])assert.equal(sanitize(attributesCapture([header(text)]),now,"drone").drone.power_m,9.057163);
for(const text of ["0,907","0.907","164","+949001","+17660","20,5 %","120000/240000","Lv.164","0"]){
  assert.equal(sanitize(attributesCapture([header(text)]),now,"drone").drone.power_m,undefined,`invalid header ${text} omitted`);
}
for(const [region,label,text] of [["drone_attributes","PV","949001"],["drone_attributes","ATQ","17660"],
  ["resources","Or","9215521"],["progression","XP","9215521"]]){
  const parsed=sanitize(attributesCapture([header(text,{region,label})]),now,"drone");
  assert.equal(parsed.drone.power_m,undefined,"non-header numeric zones never become power");
}
for(const label of ["+PV","+ATQ","+DEF","+PVtotal","20,5 %","20/30","Ressources","Progression","Food","Iron"]){
  assert.equal(sanitize(attributesCapture([header("9215521",{label})]),now,"drone").drone.power_m,undefined);
  assert.equal(sanitize({screen_type:"attributes",drone:{...visiblePower,power_label:label}},now,"drone").drone?.power_m,undefined);
}
const preferred=attributesCapture([header("9215521",{confidence:0.91}),header("949001",{region:"drone_attributes",confidence:1})]);
Object.assign(preferred.drone,visiblePower,{power_confidence:0.99});
assert.equal(sanitize(preferred,now,"drone").drone.power_m,9.215521,"header location outranks a labelled fallback");
assert.equal(sanitize(attributesCapture([header("9215521"),header("9057163")]),now,"drone").drone.power_m,undefined,"ambiguous headers stay pending");
assert.equal(sanitize(attributesCapture([header("9215521",{confidence:0.5})]),now,"drone").drone.power_m,undefined);
const recent={power_m:10,source:"confirmed_scan",updated_at:now,field_source:{power_m:"confirmed_scan"},field_updated_at:{power_m:now}};
const uncertain=sanitize(attributesCapture([header("9215521",{confidence:0.5})]),now,"drone").drone;
assert.equal(mergeDroneFacts(recent,uncertain).power_m,10,"uncertainty cannot replace a recent confirmation");
assert.equal(mergeDroneFacts(recent,{power_m:9.215521,source:"confirmed_scan",updated_at:"2020-01-01T00:00:00Z"}).power_m,10);
assert.equal(parseDronePowerUnits("150.234"),150234,"positive grouped integers remain accepted at lower supported scales");
assert.equal(parseDronePowerUnits("10 000 000 000"),parseDronePowerUnits("10000000000"));
const implementation=fs.readFileSync(new URL("../lib/drone-scan.js",import.meta.url),"utf8"),prompt=promptFor("drone","fr","");
assert.doesNotMatch(implementation+prompt,/9[\s.,]*215[\s.,]*521|9[\s.,]*057[\s.,]*163/,"no target power constant or example in business logic/prompt");
assert.match(prompt,/above_drone_attributes/);assert.match(prompt,/ICON without any printed power label/);
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