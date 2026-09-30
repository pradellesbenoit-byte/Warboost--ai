import assert from "node:assert/strict";
import fs from "node:fs";
import {sanitize,usefulState} from "../api/scan.js";
import {canonicalTechnologyName,finalizeTechnologyReview,mergeTechnologyBranches,TECHNOLOGY_NAMES} from "../lib/technology-scan.js";
import {createScanReviewDraft,applyOwnedScanReview} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";

const at1="2026-09-29T12:00:00.000Z",at2="2026-09-30T12:00:00.000Z";
const card=(name,value,state="percent")=>({name,name_evidence:"visible_text",name_confidence:0.98,value_evidence:"same_card",value_confidence:0.97,...(state==="percent"?{percent:value}:{state})});
const first=[
  card("Développement",null,"max"),card("Économie","99 %"),card("Héros","93 %"),
  card("Unités",null,"max"),card("Équipe 1",null,"max"),card("Équipe 2","30 %"),
  card("Équipe 3","32 %"),card("Duel d’Alliances",null,"max"),card("Camion Interurbain",null,"max")
];
const second=[
  card("Forces Spéciales",null,"max"),card("Assiéger pour Saisir",null,"max"),
  card("Fortification des Défenses","76 %"),card("Spécialisation Tank","54 %"),
  card("Spécialisation Missile","6 %"),card("Spécialisation Avion","0 %"),
  card("L’Ère du Pétrole","92 %"),card("Équipe 4",null,"locked"),card("Arme Tactique",null,"locked")
];
const scan1=sanitize({technology:{cards:first}},at1,"season");
const scan2=sanitize({technology:{cards:second}},at2,"season");
assert.equal(usefulState("season",scan1),true);
assert.equal(scan1.technology.branches.team_3.percent,32);
assert.equal(scan2.technology.branches.oil_era.percent,92);
assert.equal(scan2.technology.branches.missile_specialization.percent,6);
assert.equal(scan2.technology.branches.defensive_fortification.percent,76);
assert.equal(scan2.technology.branches.aircraft_specialization.percent,0);
for(const name of ["Développement","Unités","Équipe 1","Duel d’Alliances","Camion Interurbain","Forces Spéciales","Assiéger pour Saisir"]){
  const key=canonicalTechnologyName(name),entry=(scan1.technology.branches[key]||scan2.technology.branches[key]);
  assert.equal(entry.state,"max",name);
  assert.equal(entry.percent,undefined,"Max Level does not invent 100%");
}
for(const name of ["Équipe 4","Arme Tactique"]){
  const entry=scan2.technology.branches[canonicalTechnologyName(name)];
  assert.equal(entry.state,"locked");assert.equal(entry.percent,undefined,"locked does not invent zero");
}
assert.equal(scan1.technology.type_mastery_pct,undefined);
assert.equal(Object.keys(TECHNOLOGY_NAMES).length,18);
const extra=sanitize({technology:{cards:[card("Recherche Inédite","41 %")]}},at1,"season");
assert.equal(extra.technology.branches.custom_recherche_inedite.percent,41,"new visibly named branches do not map to generic labels");
assert.equal(canonicalTechnologyName("新科技"),"custom_新科技","visible non-Latin branch titles retain stable keys");
const draft1=createScanReviewDraft("season",scan1);
const reviewed1=applyOwnedScanReview({owner:"a",patch:draft1},"a",[]);
assert.equal(reviewed1.errors.length,0);
const confirmed1=finalizeTechnologyReview(reviewed1.patch.technology,at1);
const confirmed2=finalizeTechnologyReview(createScanReviewDraft("season",scan2).technology,at2);
const combined=mergeTechnologyBranches(confirmed1.branches,confirmed2.branches);
assert.equal(Object.keys(combined).length,18,"two captures merge without duplicates");
assert.equal(normalizeState({technology:{branches:combined}}).technology.branches.aircraft_specialization.percent,0);
const recent={...combined,team_3:{...combined.team_3,percent:48,updated_at:"2026-10-01T12:00:00.000Z"}};
assert.equal(mergeTechnologyBranches(recent,confirmed1.branches).team_3.percent,48,"older reading cannot replace newer confirmation");
assert.equal(mergeNewest({technology:{branches:recent}},{technology:{branches:confirmed1.branches}}).technology.branches.team_3.percent,48);
assert.equal(mergeTechnologyBranches(recent,{}).team_3.percent,48,"partial capture preserves prior branches");
const uncertain=sanitize({technology:{cards:[
  {...card("Équipe 3","99 %"),name_confidence:0.5},
  {...card("Équipe 3","77 %"),name:"unknown card"},
  {...card("Héros","88 %"),value_evidence:"adjacent_card"},
  card("Équipe 4","0 %","locked"),
  {name:"Équipe 2",name_evidence:"visible_text",name_confidence:0.97,percent:"illegible"}
]}},at2,"season");
assert.equal(uncertain.technology.branches.team_3,undefined,"uncertain name must not map");
assert.equal(uncertain.technology.branches.heroes.state,"unknown","a value without same-card evidence cannot be proposed");
assert.equal(uncertain.technology.branches.team_2.state,"unknown","uncertain value stays pending");
assert.equal(uncertain.technology.branches.team_4.percent,undefined,"locked overrides any numeric OCR");
assert.equal(sanitize({technology:{cards:[{...card("Équipe 4",null,"locked"),prerequisite:"QG 40"}]}},at2,"season").technology.branches.team_4.prerequisite,undefined,"unverified prerequisites are not invented");
const actualLockScan=sanitize({technology:{cards:[
  {name:"Équipe 4",name_evidence:"visible_text",name_confidence:1,state:"locked",state_evidence:"same_card",state_confidence:0.99,value_evidence:""},
  {name:"Arme Tactique",name_evidence:"visible_text",name_confidence:1,state:"locked",state_evidence:"same_card",state_confidence:0.99,value_evidence:""},
  {name:"Spécialisation Avion",name_evidence:"visible_text",name_confidence:1,state:"percent",percent:"0%",value_evidence:"same_card",value_confidence:0.99},
  {name:"Développement",name_evidence:"visible_text",name_confidence:1,state:"max",value_evidence:""}
]}},at2,"season");
for(const key of ["team_4","tactical_weapon"]){
  assert.equal(actualLockScan.technology.branches[key].state,"locked",`${key}: explicit lock is valid without numeric value evidence`);
  assert.equal(actualLockScan.technology.branches[key].percent,undefined,`${key}: locked never creates 0%`);
  assert.equal(actualLockScan.technology.branches[key].progress_pct,undefined,`${key}: locked never creates progress_pct`);
}
assert.equal(actualLockScan.technology.branches.aircraft_specialization.percent,0,"real 0% stays numeric");
assert.equal(actualLockScan.technology.branches.development.state,"max");
assert.equal(actualLockScan.technology.branches.development.percent,undefined,"max is not 100%");
assert.equal(actualLockScan.technology.branches.development.progress_pct,undefined);
const legacyExplicitLock=sanitize({technology:{cards:[
  {name:"Équipe 4",name_evidence:"visible_text",name_confidence:1,state:"locked"}
]}},at2,"season");
assert.equal(legacyExplicitLock.technology.branches.team_4.state,"locked","explicit text state is accepted without a numeric percent");
const unsafeLock=sanitize({technology:{cards:[
  {name:"Équipe 4",name_evidence:"visible_text",name_confidence:0.5,state:"locked"},
  {name:"Équipe 4",name_evidence:"visible_text",name_confidence:1.1,state:"locked"},
  {name:"Arme Tactique",name_evidence:"visible_text",name_confidence:1,state:"locked",state_evidence:"adjacent_card",state_confidence:0.99}
]}},at2,"season");
assert.equal(unsafeLock.technology.branches.team_4,undefined,"low-confidence title cannot authorize a lock");
assert.equal(unsafeLock.technology.branches.tactical_weapon.state,"unknown","explicit evidence from an adjacent card is rejected");
assert.equal(finalizeTechnologyReview(unsafeLock.technology,at2).branches.tactical_weapon,undefined,"an uncertain adjacent-card status cannot be saved");
const lockedReview=createScanReviewDraft("season",actualLockScan);
const lockedMarkup=renderScanReviewMarkup(buildScanReviewGroups("season",lockedReview),key=>({
  scan_review_status_pending:"À confirmer",
  scan_technology_state_locked:"Verrouillée",
  scan_technology_state_max:"Niveau Max"
}[key]||key),value=>String(value).replaceAll("&","&amp;"));
assert.match(lockedMarkup.html,/Équipe 4 — Verrouillée/);
assert.match(lockedMarkup.html,/Arme Tactique — Verrouillée/);
const lockedBranches=finalizeTechnologyReview(lockedReview.technology,at2).branches;
assert.equal(lockedBranches.team_4.state,"locked");
assert.equal(lockedBranches.team_4.percent,undefined);
assert.equal(lockedBranches.tactical_weapon.state,"locked");
assert.equal(lockedBranches.tactical_weapon.percent,undefined);
assert.equal(mergeTechnologyBranches(confirmed2.branches,lockedBranches).team_4.state,"locked");
const oldTeam4={team_4:{name:"Équipe 4",state:"locked",updated_at:at2}};
assert.equal(mergeTechnologyBranches({...oldTeam4,team_4:{...oldTeam4.team_4,updated_at:"2026-10-01T12:00:00.000Z"}},
  {team_4:{name:"Équipe 4",state:"percent",percent:0,updated_at:at2}}).team_4.state,"locked","older numeric scan cannot overwrite newer lock");
const protectedTextStates={
  team_4:{name:"Équipe 4",state:"locked",updated_at:"2026-10-01T12:00:00.000Z"},
  development:{name:"Développement",state:"max",updated_at:"2026-10-01T12:00:00.000Z"}
};
const olderNumericStates={
  team_4:{name:"Équipe 4",state:"percent",percent:0,updated_at:at2},
  development:{name:"Développement",state:"percent",percent:100,updated_at:at2}
};
const protectedMerge=mergeTechnologyBranches(protectedTextStates,olderNumericStates);
assert.equal(protectedMerge.team_4.state,"locked","older 0% cannot overwrite a newer lock");
assert.equal(protectedMerge.team_4.percent,undefined);
assert.equal(protectedMerge.development.state,"max","older 100% cannot overwrite a newer max state");
assert.equal(protectedMerge.development.percent,undefined);
assert.equal(mergeTechnologyBranches(protectedTextStates,{
  team_4:{name:"Équipe 4",state:"unknown",updated_at:"2026-10-02T12:00:00.000Z"}
}).team_4.state,"locked","newer uncertain reading cannot erase a lock");
const duplicate=sanitize({technology:{cards:[card("Équipe 3","32 %"),card("Équipe 3","92 %")]}},at2,"season");
assert.equal(duplicate.technology.branches.team_3,undefined,"conflicting cards are never merged by position");
assert.equal(duplicate.technology.unmapped.length,2,"both conflicting cards remain available for manual review");
const uncertainDraft=createScanReviewDraft("season",uncertain);
const corrected=applyOwnedScanReview({owner:"a",patch:uncertainDraft},"a",[
  {path:["technology","unmapped",0,"name"],value:"Équipe 3"},
  {path:["technology","unmapped",0,"percent"],value:"32"},
  {path:["technology","unmapped",0,"state"],value:"percent"}
]);
assert.equal(corrected.errors.length,0);
assert.equal(finalizeTechnologyReview(corrected.patch.technology,at2).branches.team_3.percent,32);
assert.equal(finalizeTechnologyReview(uncertainDraft.technology,at2).branches.team_3,undefined);
const groups=buildScanReviewGroups("season",draft1);
const rendered=renderScanReviewMarkup(groups,key=>({"scan_review_status_pending":"À confirmer","scan_technology_state_max":"Niveau Max","scan_technology_state_locked":"Verrouillée"}[key]||key),x=>String(x).replaceAll("&","&amp;"));
assert.match(rendered.html,/Équipe 3/);
assert.match(rendered.html,/Niveau Max/);
assert.doesNotMatch(rendered.html,/Maîtrise du type|Technologie du héros|Siège et conquête/);
assert.ok(rendered.rows.some(row=>row.path.join(".")==="technology.branches.team_3.percent"));
const i18n=fs.readFileSync(new URL("../i18n.js",import.meta.url),"utf8");
assert.equal((i18n.match(/const TECHNOLOGY_REVIEW_TEXT=\{([\s\S]*?)\n\};/)?.[1]||"").split("\n").filter(line=>line.includes("¦")).length,23);
console.log("PASS: 18 named technology cards, max/locked/zero, editable review, uncertain OCR, two-capture merge, freshness and 22-language states");