import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {LANGUAGES,translator} from "../i18n.js";
import {SHOP_REFERENCE_CATALOG,SHOP_REFERENCE_DATE,SHOP_REFERENCE_SOURCE} from "../lib/shop-catalog.js";
import {
  ACQUISITION_I18N_KEYS,
  formatAcquisitionCost,
  resourceAcquisitionForPriority,
} from "../lib/resource-acquisition.js";

function analysisFor(priority,priorities=[priority]){
  return {priorities,bottleneck:priorities[0]||priority};
}

const localeCodes=LANGUAGES.map(([code])=>code).filter(code=>code!=="auto");
assert.equal(localeCodes.length,23,"All 23 declared UI locales should be covered");
for(const code of localeCodes){
  const t=translator(code);
  for(const key of ACQUISITION_I18N_KEYS){
    assert.notEqual(t(key),key,`${code} is missing ${key}`);
  }
}

const exclusive={kind:"exclusive",resource_family:"exclusive_weapon_shards",hero:"Carlie",current:1,rank:1};
const exclusiveView=resourceAcquisitionForPriority(exclusive,analysisFor(exclusive),{});
assert.equal(exclusiveView.known,true);
assert.equal(exclusiveView.resourceFamily,"exclusive_weapon_shards");
assert.equal(exclusiveView.options.length,3);
assert.deepEqual(exclusiveView.options.map(option=>option.type),["internal","internal","paid"]);
assert.equal(exclusiveView.options[0].amount,300);
assert.equal(exclusiveView.options[1].amount,2500);
assert.equal(exclusiveView.options[0].referenceDate,null,"A manually supplied cost must not inherit a date when the catalog has no observed price.");
assert.equal(exclusiveView.options[1].referenceDate,SHOP_REFERENCE_DATE,"A matched in-game cost should expose its observation date.");
assert.equal(exclusiveView.options[1].referenceSource,SHOP_REFERENCE_SOURCE);
assert.equal(exclusiveView.options[2].priceEur,17);
assert.equal(exclusiveView.options[2].amount,2000);
assert.equal(exclusiveView.options[2].currency,"gold_brick");
assert.equal(formatAcquisitionCost(exclusiveView.options[1],(key,vars={})=>key==="acq_cost_format"?`${vars.amount} ${vars.currency}${vars.suffix}`:key,"fr").match(/2[\s\u00a0\u202f]500/)?.[0]!==undefined,true);

const lockedExclusive={...exclusive,current:0};
assert.equal(resourceAcquisitionForPriority(lockedExclusive,analysisFor(lockedExclusive),{}).noteKey,"acq_weapon_locked");

const droneParts={kind:"drone",resource_family:"drone_parts",target:"Drone parts",rank:1};
const dronePartsView=resourceAcquisitionForPriority(droneParts,analysisFor(droneParts),{});
assert.equal(dronePartsView.id,"drone_parts","drone_parts family should not fall through to components");
assert.equal(dronePartsView.resourceFamily,"drone_parts");
assert.deepEqual(dronePartsView.options.map(option=>option.type),["internal","internal","paid"]);
assert.equal(dronePartsView.options[2].priceEur,4.19);

const droneChips={kind:"drone",resource_family:"drone_chips",target:"Drone chips",rank:1};
const droneChipsView=resourceAcquisitionForPriority(droneChips,analysisFor(droneChips),{});
assert.equal(droneChipsView.id,"drone_chips","drone_chips family should resolve without keyword parsing");
assert.equal(droneChipsView.resourceFamily,"drone_chips");
assert.deepEqual(droneChipsView.options.map(option=>option.type),["internal","internal","paid"]);
assert.equal(droneChipsView.options[0].amount,50000);
assert.equal(droneChipsView.options[2].priceEur,42.49);

const components={kind:"drone",resource_family:"drone_components",target:"Drone components",rank:1};
const componentsView=resourceAcquisitionForPriority(components,analysisFor(components),{});
assert.equal(componentsView.resourceFamily,"drone_components");
assert.deepEqual(componentsView.options.map(option=>option.type),["internal","paid","paid"]);
assert.deepEqual(componentsView.options.slice(1).map(option=>option.priceEur),[4.19,42.49]);
assert.ok(componentsView.options.every(option=>option.type!=="internal"||option.observed));

const nonBottleneck=resourceAcquisitionForPriority(
  {...components,rank:2,target:"Drone components"},
  {priorities:[{kind:"gear",resource_family:"gear_materials",target:"Gear",rank:1},{...components,rank:2,target:"Drone components"}]},
  {},
);
assert.equal(nonBottleneck.options.some(option=>option.type==="paid"),false,"Paid options must stay hidden outside the main bottleneck");

const confirmedUr=resourceAcquisitionForPriority(
  {kind:"stars",resource_family:"hero_shards",hero:"Monica",rank:1},
  analysisFor({kind:"stars",resource_family:"hero_shards",hero:"Monica",rank:1}),
  {squads:[{heroes:[{name:"Monica",rarity:"UR"}]}]},
);
assert.equal(confirmedUr.known,true);
assert.deepEqual(confirmedUr.options.map(option=>option.amount),[300,3000,null]);
const unknownRarity=resourceAcquisitionForPriority(
  {kind:"stars",resource_family:"hero_shards",hero:"Monica",rank:1},
  analysisFor({kind:"stars",resource_family:"hero_shards",hero:"Monica",rank:1}),
  {},
);
assert.equal(unknownRarity.noteKey,"acq_hero_rarity_unconfirmed");

const broadTech={kind:"technology",technology_lane:"tactical_weapon_pct",target:"Technology",rank:1};
assert.equal(resourceAcquisitionForPriority(broadTech,analysisFor(broadTech),{}).known,false,"A general tech lane must not imply armament");

const unknownPrice=formatAcquisitionCost({amount:null,currency:"alliance_coins"},(key)=>key,"fr");
assert.equal(unknownPrice,"acq_price_unknown");
const observedPaid=SHOP_REFERENCE_CATALOG.find(row=>row.item==="Composant de Drone"&&row.currency==="EUR");
assert.equal(componentsView.options[2].priceEur,Number(observedPaid.price));
assert.equal(componentsView.options[2].observed,true);

for(const [priority,state={},family] of [
  [{kind:"gear",resource_family:"gear_materials",rank:1},{}, "gear_materials"],
  [{kind:"level",resource_family:"hero_xp",rank:1},{}, "hero_xp"],
  [{kind:"armament",target:"Noyau d’Armement",rank:1},{}, "armament_core"],
  [{kind:"armament",target:"Recherche Spéciale d’Armement",rank:1},{}, "armament_research"],
]){
  const view=resourceAcquisitionForPriority(priority,analysisFor(priority),state);
  assert.equal(view.resourceFamily,family);
  assert.ok(view.options.filter(option=>option.type==="internal").every(option=>option.observed),`${family} must use exact catalog matches`);
}

const acquisitionUi=await readFile(new URL("../app.js",import.meta.url),"utf8");
assert.match(acquisitionUi,/option\.referenceDate/,"The acquisition UI should show a matched reference date.");
assert.match(acquisitionUi,/const observed=option\.observed/,"Observed provenance should be visible for in-game and paid references.");

console.log(`resource acquisition verification passed (${localeCodes.length} locales)`);