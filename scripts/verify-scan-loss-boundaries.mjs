import assert from "node:assert/strict";
import {syntheticFormationPng} from "./fixtures/formation-image.mjs";
import sharp from "sharp";
import {recognizeHeroIdentity} from "../lib/hero-recognition.js";
import {reconcileEquipmentZoom,readScannedEquipment} from "../lib/equipment-scan.js";
import {parseGear} from "../lib/gear.js";
import {createFormationEquipmentZooms,mergeFormationPortraitZoomGroups,normalizeFormationLayouts} from "../lib/formation-batch.js";
import {sanitizeFormationBatch} from "../api/scan.js";
import {loadHeroReferenceImages} from "../api/_hero-reference-images.js";

// Provider replies and images below are synthetic; these verify crop provenance,
// NOT live OCR accuracy. No profile/storage/authentication handler is invoked.
const bank=await loadHeroReferenceImages(),references=bank.references;
const portrait=(name,confidence=.99,variant="normal")=>({
  candidate_name:name,confidence,variant,
  reference_id:references.find(ref=>ref.canonicalName===name&&ref.variant===variant).id,
  visible_features:["distinct visible hairstyle","distinct visible facial detail"]
});
const piece=(slot_index,level)=>({slot_index,visible:true,visibility_confidence:.99,
  level,level_confidence:level===null?null:.99,
  level_evidence:level===null?"unreadable":"visible_equipment_label",
  rarity:null,rarity_confidence:null,rarity_evidence:"unreadable"});
let checks=0;
async function test(label,run){await run();checks++;console.log(`PASS ${label}`)}
await test("Tank strong name survives a contradictory portrait already capped below strong",()=>{
  const observed={name_text:"Murphy",name_evidence:"visible_text",name_confidence:.99,
    portrait:{...portrait("Williams"),zoom_evidence:{confidence_cap:.74}}};
  const result=recognizeHeroIdentity(observed,references);
  assert.equal(result.name,"Murphy");
  assert.equal(result.evidence.portrait.diagnostic.arbitration.decision,"strong_ocr_over_weak_portrait");
  assert.equal(result.evidence.portrait.diagnostic.raw_confidence,.99);
  assert.equal(result.evidence.portrait.diagnostic.arbitration.admissible_portrait_confidence,.74);
});
await test("two genuinely strong contradictory identities remain blank; no evidence remains blank",()=>{
  const result=recognizeHeroIdentity({name_text:"Murphy",name_evidence:"visible_text",
    name_confidence:.99,portrait:portrait("Williams")},references);
  assert.equal(result.name,null);
  assert.equal(result.evidence.portrait.diagnostic.arbitration.decision,"strong_signals_conflict");
  assert.equal(recognizeHeroIdentity({},references).name,null);
  assert.equal(recognizeHeroIdentity({portrait:portrait("Williams")},[]).evidence.portrait.reference_verified,false);
});
await test("equipment zoom fills unreadable gaps, preserves genuine zero and never boosts confidence",()=>{
  const merged=reconcileEquipmentZoom({pieces:[piece(0,40),piece(1,null)]},
    {pieces:[piece(1,0),{...piece(0,40),level_confidence:.95},piece(3,40)]});
  const reading=readScannedEquipment(merged.equipment);
  assert.deepEqual(parseGear(reading.value).segments.map(row=>[row.slot,row.level]),[[0,40],[1,0],[3,40]]);
  assert.equal(reading.evidence.pieces[0].level_confidence,.95);
});
await test("contradictory equipment levels stay unreadable, not zero or the latest value",()=>{
  const merged=reconcileEquipmentZoom({pieces:[piece(2,40)]},{pieces:[piece(2,30)]});
  assert.equal(merged.equipment.pieces[0].level,null);
  assert.equal(merged.evidence.conflicts[0].reason,"conflicting_values");
  assert.equal(parseGear(readScannedEquipment(merged.equipment).value).segments[0].level,null);
});
await test("low-confidence equipment stays absent, without falling back to old values",()=>{
  const merged=reconcileEquipmentZoom(null,{pieces:[{...piece(1,40),visibility_confidence:.89}]});
  assert.equal(readScannedEquipment(merged.equipment).value,null);
});
await test("normal versus Awakening references of Kimberly do not become a false hero conflict",()=>{
  const full={captures:[{image_index:0,screen_type:"formation_details",squads:[{
    heroes:Array.from({length:5},()=>({portrait:portrait("Kimberly")}))
  }]}]};
  const zoom={formations:[{image_index:0,portraits:Array.from({length:5},(_,slot_index)=>({
    slot_index,portrait:portrait("Kimberly",.95,"awakening")
  }))}]};
  const merged=mergeFormationPortraitZoomGroups(full,zoom,{imageIndexes:[0],references});
  const result=recognizeHeroIdentity(merged.captures[0].squads[0].heroes[0],references);
  assert.equal(result.name,"Kimberly");assert.equal(result.evidence.requires_confirmation,true);
  assert.equal(result.evidence.portrait.match_verified,false);
  assert.equal(result.evidence.portrait.confidence,.95);
  assert.equal(merged.captures[0].squads[0].heroes[0].portrait.zoom_evidence.selection,"same_identity_variant_uncertain");
});
await test("misclassified overview requires strong title OCR AND five rows before enabling crops",()=>{
  const capture={image_index:0,screen_type:"formation_overview",
    details_layout:{title_text:"DÉTAILS DE LA FORMATION",title_confidence:.99,row_count:5,rows_confidence:.99},
    squads:[{heroes:Array.from({length:5},()=>({}))}]};
  const input={captures:[capture]},before=JSON.stringify(input);
  assert.equal(normalizeFormationLayouts(input).captures[0].screen_type,"formation_details");
  assert.equal(JSON.stringify(input),before);
  for(const change of [{title_confidence:.89},{row_count:4},{rows_confidence:.89},{title_text:"Formation actuelle"}]){
    assert.equal(normalizeFormationLayouts({captures:[{...capture,details_layout:{...capture.details_layout,...change}}]})
      .captures[0].screen_type,"formation_overview");
  }
  assert.equal(normalizeFormationLayouts({captures:[{...capture,details_layout:null}]}).captures[0].screen_type,"formation_overview");
  assert.deepEqual(normalizeFormationLayouts({captures:[null,42,[]]}),{captures:[null,42,[]]});
});
for(const [kind,palette,names,power] of [
  ["Tank","tank",["Murphy","Williams","Kimberly","Marshall","Stetmann"],"35,19 M"],
  ["Avion","aircraft",["Carlie","Lucius","Morrison","DVA","Skyler"],"44,43 M"]
]){
  await test(`${kind} synthetic source creates five ordered equipment crops without a portrait or weapon`,async()=>{
    const bytes=await syntheticFormationPng({palette});
    const crops=await createFormationEquipmentZooms(`data:image/png;base64,${bytes.toString("base64")}`,4);
    assert.equal(crops.length,5);
    for(const [slot,crop] of crops.entries()){
      assert.equal(crop.image_index,4);assert.equal(crop.slot_index,slot);
      const metadata=await sharp(Buffer.from(crop.image_url.split(",")[1],"base64")).metadata();
      assert.equal(metadata.width,1024);assert.equal(metadata.height,256);
    }
  });
  await test(`${kind} simulated cropped readings survive normalization at the original five slots`,()=>{
    const full={captures:[{image_index:4,screen_type:"formation_details",exclusive_weapons:[],
      squads:[{power,power_confidence:.99,heroes:names.map(name=>({
        name_text:name,name_evidence:"visible_text",name_confidence:.99,name_image_index:4,
        level:155,stars:5,portrait:portrait(name),equipment:null
      }))}]}]};
    full.captures.push(...Array.from({length:4},(_,image_index)=>({
      image_index,screen_type:"unknown",squads:[],exclusive_weapons:[],equipment_details:[]
    })));
    const zoom={formations:[{image_index:4,portraits:names.map((name,slot_index)=>({
      slot_index,portrait:portrait(name),equipment:{pieces:[0,1,2,3].map(slot=>piece(slot,40))}
    })).reverse()}]};
    const merged=mergeFormationPortraitZoomGroups(full,zoom,{imageIndexes:[4],references});
    const result=sanitizeFormationBatch(merged,{count:5,scanType:"squad1",references,now:"2026-10-11T12:00:00Z"});
    const heroes=result.state.squads[0].heroes;
    assert.deepEqual(heroes.map(hero=>hero.name),names);
    assert.equal(result.state.squads[0].power,Number(power.replace(" M","").replace(",",".")));
    for(const [slot,hero] of heroes.entries()){
      assert.deepEqual(parseGear(hero.gear).segments.map(row=>row.level),[40,40,40,40]);
      assert.equal(hero.scan_evidence.equipment.hero_slot_index,slot);
      assert.equal(hero.scan_evidence.equipment.source_image_index,4);
    }
    const wrong=mergeFormationPortraitZoomGroups(full,zoom,{imageIndexes:[2],references});
    assert.equal(wrong.captures[0].squads[0].heroes[0].equipment,null);
  });
}
console.log(`PASS ${checks} scan loss-boundary checks (synthetic crop inputs; simulated recognition)`);
