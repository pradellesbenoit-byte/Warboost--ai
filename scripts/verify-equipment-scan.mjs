import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {sanitizeFormationBatch} from "../api/scan.js";
import {parseGear,sanitizeGear} from "../lib/gear.js";
import {readScannedEquipment,mergeReviewedGear} from "../lib/equipment-scan.js";
import {buildScanReviewGroups,serializeScanReviewGear} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {createScanReviewDraft,applyOwnedScanReview} from "../lib/scan-review.js";
import {applyReviewedSquad} from "../lib/squad-scan-review.js";
import {FORMATION_BATCH_SCHEMA} from "../lib/formation-batch.js";

// Synthetic extraction responses: tests the real pipeline, not live OCR accuracy.
const names=["Murphy","Williams","Kimberly","Marshall","Stetmann"],at="2026-10-11T12:00:00Z";
const piece=(slot_index,level,changes={})=>({slot_index,visible:true,visibility_confidence:.99,
  level,level_confidence:.99,level_evidence:"visible_equipment_label",
  rarity:"orange",rarity_confidence:.99,rarity_evidence:"clear_quality_indicator",...changes});
const equipment=(levels=[20,30,40,0])=>({pieces:levels.map((level,slot)=>piece(slot,level))});
const formation=(image_index=0)=>({image_index,screen_type:"formation_details",exclusive_weapons:[],equipment_details:[],
  squads:[{power:"44,43 M",power_confidence:.99,heroes:names.map((name,slot)=>({
    name_text:name,name_evidence:"visible_text",name_confidence:.99,name_image_index:image_index,
    level:155,level_confidence:.99,stars:5,stars_confidence:.99,
    equipment:slot===1?equipment():null
  }))}]});
const weapon=(image_index=1)=>({image_index,screen_type:"exclusive_weapon_detail",squads:[],
  exclusive_weapons:[{hero_name:"Williams",name_text:"Williams",name_evidence:"visible_text",
    name_confidence:.99,level:16,level_confidence:.99,weapon_name:"Chasseur de tempête",hero_hp_bonus:12345,
    field_confidence:{hero_hp_bonus:.99},power:5071933}],equipment_details:[]});
const parse=captures=>sanitizeFormationBatch({captures},{count:captures.length,now:at,scanType:"squad1"});
const slots=value=>parseGear(value).segments;
let checks=0;
function test(label,fn){fn();checks++;console.log(`PASS ${label}`)}

test("real Vision schema requests bounded, per-piece levels/quality and evidence",()=>{
  const capture=FORMATION_BATCH_SCHEMA.properties.captures.items;
  const spec=capture.properties.squads.items.properties.heroes.items.properties.equipment;
  assert.equal(spec.properties.pieces.maxItems,4);
  assert.ok(spec.properties.pieces.items.required.includes("level_evidence"));
  assert.ok(spec.properties.pieces.items.required.includes("rarity_evidence"));
});
test("four visible pieces keep their actual order, zero level and hero/image source",()=>{
  const raw=formation(0);raw.squads[0].heroes[1].equipment.pieces.reverse();
  const before=JSON.stringify(raw),result=parse([raw]),hero=result.state.squads[0].heroes[1];
  assert.equal(JSON.stringify(raw),before);
  assert.deepEqual(slots(hero.gear).map(piece=>piece.slot),[0,1,2,3]);
  assert.deepEqual(slots(hero.gear).map(piece=>piece.level),[20,30,40,0]);
  assert.equal(slots(hero.gear).reduce((sum,piece)=>sum+piece.count,0),4);
  assert.equal(hero.scan_evidence.equipment.source_image_index,0);
  assert.equal(hero.scan_evidence.equipment.hero_slot_index,1);
  assert.equal(hero.level,155);assert.equal(hero.stars,5);
  assert.equal(result.state.squads[0].power,44.43);
});
test("partial levels and ambiguous colors retain visible counts and exact positions, never compact gaps",()=>{
  const raw=formation();raw.squads[0].heroes[1].equipment={pieces:[
    piece(3,null,{rarity_evidence:"ambiguous"}),piece(1,30,{level_confidence:.4,rarity_evidence:"ambiguous"}),
    piece(0,20),piece(2,40)
  ]};
  const hero=parse([raw]).state.squads[0].heroes[1];
  assert.deepEqual(slots(hero.gear).map(piece=>piece.level),[20,null,40,null]);
  assert.equal(slots(hero.gear)[1].rarity,null);assert.equal(slots(hero.gear)[3].rarity,null);
  assert.equal(hero.scan_evidence.equipment.partial,true);
  assert.equal(sanitizeGear("count=4"),"count=4","count-only is useful evidence");
  const sparse=readScannedEquipment({pieces:[piece(3,15),piece(1,40)]});
  assert.deepEqual(slots(sparse.value).map(piece=>piece.slot),[1,3]);
  assert.deepEqual(slots(sparse.value).map(piece=>piece.level),[40,15]);
});
test("no readable equipment never copies hero/exclusive levels or a legacy provider fallback",()=>{
  const raw=formation(),hero=raw.squads[0].heroes[1];
  hero.gear="count=4;level=99";hero.equipment={pieces:[]};
  assert.equal(parse([raw,weapon()]).state.squads[0].heroes[1].gear,undefined);
  const invalid=readScannedEquipment({pieces:[piece(0,155),piece(1,16,{level_evidence:"unreadable"})]});
  assert.deepEqual(slots(invalid.value).map(piece=>piece.level),[null,null]);
  assert.equal(readScannedEquipment({pieces:[piece(0,40,{visibility_confidence:.4})]}).value,null);
  assert.equal(readScannedEquipment(null).value,null);
});
test("invalid/duplicated equipment slots cannot contaminate another piece",()=>{
  const observed=readScannedEquipment({pieces:[piece(1,20),piece(1,60),piece(3,40),piece(5,90)]});
  assert.deepEqual(slots(observed.value).map(piece=>piece.slot),[3]);
  assert.equal(slots(observed.value)[0].level,40);
  assert.equal(sanitizeGear("slot=1;count=1;level=40|slot=1;count=1;level=60"),null);
  assert.equal(sanitizeGear("slot=0;count=1;levels=20,30"),null);
});
test("exclusive weapon enriches only the compatible hero, never its equipment or another hero",()=>{
  const raw=formation(),arm=weapon();
  arm.equipment_details=[{name_text:"Murphy",name_evidence:"visible_text",name_confidence:.99,equipment:equipment([99,99,99,99])}];
  const output=parse([arm,raw]),heroes=output.state.squads[0].heroes;
  assert.deepEqual(heroes.map(hero=>hero.name),names);
  assert.equal(heroes[0].gear,undefined);assert.equal(heroes[2].gear,undefined);
  assert.deepEqual(slots(heroes[1].gear).map(piece=>piece.level),[20,30,40,0]);
  assert.equal(output.state.exclusive_weapons[0].level,16);
  assert.equal(output.state.exclusive_weapons[0].hero_hp_bonus,12345);
  assert.ok(!Object.hasOwn(output.state.exclusive_weapons[0],"power"));
});
test("named hero-detail gear only enriches a uniquely identified formation hero, preserving source slots",()=>{
  const raw=formation();raw.squads[0].heroes[1].equipment=null;
  const detail={image_index:1,screen_type:"hero_detail",squads:[],exclusive_weapons:[],
    equipment_details:[{name_text:"Williams",name_evidence:"visible_text",name_confidence:.99,equipment:equipment()}]};
  const out=parse([detail,raw]),hero=out.state.squads[0].heroes[1];
  assert.deepEqual(slots(hero.gear).map(piece=>piece.level),[20,30,40,0]);
  const proof=hero.scan_evidence.equipment.supplements[0];
  assert.equal(proof.source_image_index,1);assert.equal(proof.formation_image_index,0);
  assert.equal(proof.destination_hero_slot_index,1);
  detail.equipment_details[0].name_text="DVA";
  const unlinked=parse([detail,raw]);
  assert.equal(unlinked.state.squads[0].heroes[1].gear,undefined);
  assert.equal(unlinked.unmatched_equipment.length,1);
  assert.equal(parse([{...detail,image_index:0}]).state.squads,undefined,"a named detail is never a composition");
});
test("strong conflicting equipment readings are retained for review, not silently overwritten",()=>{
  const detail={image_index:1,screen_type:"hero_detail",squads:[],exclusive_weapons:[],
    equipment_details:[{name_text:"Williams",name_evidence:"visible_text",name_confidence:.99,equipment:equipment([99,30,40,0])}]};
  const out=parse([formation(),detail]);
  assert.equal(slots(out.state.squads[0].heroes[1].gear)[0].level,20);
  assert.ok(out.conflicts.includes("squads.0.heroes.1.gear"));
});
test("review/render/edits keep partial levels, unknown rarity and sparse original piece indexes",()=>{
  const raw=formation();raw.squads[0].heroes[1].equipment={pieces:[piece(3,null,{rarity_evidence:"ambiguous"}),piece(1,30)]};
  const state=parse([raw]).state,groups=buildScanReviewGroups("squad1",state);
  const group=groups.find(group=>group.kind==="hero"&&group.number===2);
  const row=group.rows.find(row=>row.field==="gear");
  assert.equal(row.status,"pending");assert.deepEqual(row.value.map(piece=>piece.slot),[1,3]);
  const serialized=serializeScanReviewGear(row.value.map(piece=>({...piece,levels:piece.levels.join("/")})));
  assert.equal(serialized.value,state.squads[0].heroes[1].gear);
  const {html}=renderScanReviewMarkup([group],key=>key,value=>String(value).replace(/"/g,"&quot;"));
  assert.match(html,/data-scan-gear-slot="1"/);assert.match(html,/data-scan-gear-slot="3"/);
  const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
  const collector=source.match(/function scanReviewFormEdits\(draft\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(collector,"test the actual browser form collector");
  const counts=row.value.map(piece=>({value:String(piece.count),dataset:{scanGearSlot:String(piece.slot)}}));
  const container={
    querySelectorAll(selector){
      if(selector.includes("data-scan-gear-count"))return counts;
      const index=Number(selector.match(/data-scan-gear-part="(\d+)"/)?.[1]);
      return row.value[index]?.rarity?[{value:row.value[index].rarity}]:[];
    },
    querySelector(selector){
      const index=Number(selector.match(/data-scan-gear-part="(\d+)"/)?.[1]);
      return {value:row.value[index].levels.join("/")};
    }
  };
  const context={serializeScanReviewGear,$:()=>container};
  runInNewContext(`${collector};this.collect=scanReviewFormEdits;`,context);
  const collected=context.collect({type:"squad1",displayRows:[row]});
  assert.equal(collected.edits[0].value,serialized.value,"the real DOM collector keeps sparse piece slots");
  const draft={owner:"test-owner",type:"squad1",patch:createScanReviewDraft("squad1",state,{includeHeroNames:true})};
  const reviewed=applyOwnedScanReview(draft,"test-owner",[{path:["squads",0,"heroes",1,"gear"],value:serialized.value}]);
  assert.equal(reviewed.patch.squads[0].heroes[1].gear,serialized.value);
});
test("confirmation preserves unknown confirmed piece values and never applies to another hero",()=>{
  const old="2026-10-10T12:00:00Z",oldGear="slot=0;count=1;level=40;rarity=red|slot=1;count=1;level=40;rarity=red|slot=2;count=1;level=40;rarity=red|slot=3;count=1;level=40;rarity=red";
  const base={squads:[{id:1,power:44.43,heroes:names.map(name=>({name,gear:oldGear,level:155,stars:5,
    updated_at:old,source:"confirmed_manual"})),confirmed_composition:names,composition_confirmed_at:old,
    composition_source:"explicit_confirmation"}],sync:{sources:{}}};
  const fresh=readScannedEquipment({pieces:[piece(1,25,{rarity_evidence:"ambiguous"})]}).value;
  const before=JSON.stringify(base),result=applyReviewedSquad(base,{squadId:1,heroes:[{name:"Williams",gear:fresh}],updatedAt:at});
  assert.equal(JSON.stringify(base),before);
  assert.equal(result.state.squads[0].heroes[0].gear,oldGear);
  const retained=slots(result.state.squads[0].heroes[1].gear);
  assert.deepEqual(retained.map(piece=>piece.level),[40,25,40,40]);
  assert.ok(retained.every(piece=>piece.rarity==="red"));
  const complete=applyReviewedSquad(base,{squadId:1,heroes:names.map(name=>({name,...(name==="Williams"?{gear:fresh}:{})})),updatedAt:at});
  assert.deepEqual(slots(complete.state.squads[0].heroes[1].gear).map(piece=>piece.level),[40,25,40,40]);
  const ambiguous="count=3;level=40;rarity=orange|count=1;level=50;rarity=red";
  assert.equal(mergeReviewedGear(ambiguous,fresh),undefined,"never infer a legacy group's physical slots");
});
console.log(`PASS ${checks} equipment pipeline checks (simulated OCR; no live Vision call)`);
