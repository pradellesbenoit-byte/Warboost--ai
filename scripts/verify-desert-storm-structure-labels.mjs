import assert from "node:assert/strict";
import fs from "node:fs";
import {buildDesertStormPlan} from "../lib/desert-storm-plan.js";
import {desertStormMissionLabel} from "../lib/desert-storm-labels.js";

const fr={
  refinery:"Raffinerie de Pétrole",
  hospital:"Hôpital de Front",
  science:"Pôle scientifique",
  info:"Centre d’information",
  mobile:"Groupe mobile",
  free_capture:"captures libres",
  silo:"Silo nucléaire",
  anchor:"ancrage",
  support:"renfort",
  arsenal:"Arsenal",
  mercenary:"Usine de mercenaires",
  central_buff:"buff central",
  central_buffs:"buffs centraux",
  hold:"Tenir",
  weak_side:"côté faible",
  wells:"Puits de pétrole",
  if_stable:"si le front est stable",
  best_objectives:"meilleurs objectifs"
};
const translate=key=>fr[key]||key;
const i18n=fs.readFileSync(new URL("../i18n.js",import.meta.url),"utf8");
assert.match(i18n,/ds_refinery:"Raffinerie de Pétrole",ds_hospital:"Hôpital de Front"/);

assert.equal(desertStormMissionLabel("refinery_science",{translate,groupIndex:0}),"Raffinerie de Pétrole 1 + Pôle scientifique");
assert.equal(desertStormMissionLabel("refinery_info",{translate,groupIndex:1}),"Raffinerie de Pétrole 2 + Centre d’information");
assert.equal(desertStormMissionLabel("hospital_pair",{translate,groupIndex:2}),"Hôpital de Front 1");
assert.equal(desertStormMissionLabel("hospital_pair",{translate,groupIndex:3}),"Hôpital de Front 2");
assert.match(desertStormMissionLabel("refinery_info_hospital",{translate,groupIndex:1}),/Raffinerie de Pétrole 2/);
assert.match(desertStormMissionLabel("refinery_info_hospital",{translate,groupIndex:1}),/Hôpital de Front 1/);
assert.match(desertStormMissionLabel("refinery_info_hospital",{translate,groupIndex:1}),/Hôpital de Front 2/);
assert.equal(desertStormMissionLabel("hold_refinery",{translate,groupIndex:1}),"Tenir Raffinerie de Pétrole 2");

const member=(name,index)=>({name,role:"R4",lifecycle_key:`member|884|ALL4|${index}`,power_m:100,hq_level:30});
const members=Array.from({length:20},(_,i)=>member(`Joueur${i+1}`,i+1));
const plan=buildDesertStormPlan(members,members.map(x=>x.lifecycle_key),{nowMs:Date.parse("2026-09-18T12:00:00Z")});
assert.deepEqual(plan.groups.map(g=>g.mission.opening),["refinery_science","refinery_info","hospital_pair","hospital_pair","mobile_capture"]);
console.log("WarBoost Desert Storm structure labels verification: PASS");