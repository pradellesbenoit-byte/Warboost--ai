import assert from "node:assert/strict";
import sharp from "sharp";
import {sanitizeFormationBatch} from "../api/scan.js";
import {createFormationPortraitZooms,createFormationEquipmentZooms,mergeFormationPortraitZoomGroups} from "../lib/formation-batch.js";
import {HERO_RECOGNITION_LIBRARY} from "../lib/hero-recognition.js";
import {parseGear} from "../lib/gear.js";

// Synthetic observations and pixels ONLY. No provider, player data or DB calls.
const at="2026-10-18T09:00:00Z";
const teams=[
  ["Murphy","Williams","Kimberly","Marshall","Stetmann"],
  ["Violet","Mason","Scarlett","Richard","Monica"],
  ["DVA","Skyler","Lucius","Carlie","Morrison"],
  ["Tesla","Adam","McGregor","Venom","Swift"],
  ["Murphy","DVA","Tesla","Kimberly","Adam"]
];
const references=HERO_RECOGNITION_LIBRARY.map(hero=>({
  id:`synthetic-${hero.canonicalName}`,canonicalName:hero.canonicalName,variant:"normal",status:"verified"
}));
const heroType=name=>HERO_RECOGNITION_LIBRARY.find(hero=>hero.canonicalName===name).type;
const portrait=name=>({candidate_name:name,confidence:.96,variant:"normal",
  reference_id:`synthetic-${name}`,visible_features:["distinct visible face","distinct visible hair"]});
const equipment=row=>({pieces:Array.from({length:4},(_,slot_index)=>({
  slot_index,visible:true,visibility_confidence:.99,level:row*4+slot_index,
  level_confidence:.99,level_evidence:"visible_equipment_label",
  rarity:null,rarity_confidence:null,rarity_evidence:"unreadable"
}))});
const fixture=names=>({
  captures:[{image_index:0,screen_type:"formation_details",exclusive_weapons:[],
    squads:[{power:"35.66M",power_confidence:.99,heroes:names.map((name,slot_index)=>({
      slot_index,name_text:null,name_evidence:"unreadable",name_confidence:null,name_image_index:0,
      portrait:portrait(name),equipment:equipment(slot_index),level:155,level_confidence:.99
    }))}]}]
});
const zoomFixture=names=>({formations:[{image_index:0,portraits:names.map((name,slot_index)=>({
  slot_index,portrait:portrait(name),equipment:equipment(slot_index)
}))}]});
const merge=(raw,zoom)=>mergeFormationPortraitZoomGroups(raw,zoom,{imageIndexes:[0],references});
const parse=(raw,id=1)=>sanitizeFormationBatch(raw,{count:1,now:at,scanType:`squad${id}`,references});
let groups=0;
async function test(label,run){await run();groups++;console.log(`PASS ${label}`)}

await test("80 Tank/Aircraft/Missile/mixed cases: explicit row class excludes incompatible view, never assigns by team",()=>{
  for(const names of teams)for(let id=1;id<=4;id++)for(const slot of [1,2])for(const rejected of ["full_capture","zoom"]){
    const raw=fixture(names),zoom=zoomFixture(names),hero=raw.captures[0].squads[0].heroes[slot];
    const type=heroType(names[slot]);
    const other=HERO_RECOGNITION_LIBRARY.find(candidate=>candidate.type!==type).canonicalName;
    Object.assign(hero,{class_text:type,class_evidence:"visible_text",class_confidence:.99});
    if(rejected==="full_capture")hero.portrait=portrait(other);
    else zoom.formations[0].portraits[slot].portrait=portrait(other);
    // Both passes may return rows in reverse order: equipment moves with its row.
    raw.captures[0].squads[0].heroes.reverse();zoom.formations[0].portraits.reverse();
    const before=JSON.stringify([raw,zoom]),merged=merge(raw,zoom);
    assert.equal(JSON.stringify([raw,zoom]),before);
    const observation=merged.captures[0].squads[0].heroes[slot].portrait;
    assert.equal(observation.zoom_evidence.excluded_by_class[rejected],true);
    assert.equal(observation.zoom_evidence.excluded_by_class[rejected==="zoom"?"full_capture":"zoom"],false);
    assert.equal(observation.confidence,.96,"class never increases visual confidence");
    const output=parse(merged,id),squad=output.state.squads[id-1];
    assert.deepEqual(squad.heroes.map(row=>row.name),names);
    squad.heroes.forEach((row,index)=>{
      assert.equal(row.level,155);
      assert.deepEqual(parseGear(row.gear).segments.map(piece=>[piece.slot,piece.level]),
        [0,1,2,3].map(piece=>[piece,index*4+piece]));
      assert.equal(row.scan_evidence.identity.requires_confirmation,true);
    });
    output.state.squads.forEach((row,index)=>{if(index!==id-1)assert.equal(row,undefined)});
  }
});
await test("missing/weak/unreadable/invalid class or team declaration cannot settle two strong portraits",()=>{
  for(const change of [
    {},{team_type:"tank"},{class_text:"tank",class_evidence:"unreadable",class_confidence:.99},
    ...[null,.87,2,"invalid"].map(class_confidence=>({class_text:"tank",class_evidence:"visible_text",class_confidence}))
  ]){
    const raw=fixture(teams[0]),zoom=zoomFixture(teams[0]);
    Object.assign(raw.captures[0].squads[0].heroes[2],change,{portrait:portrait("DVA")});
    const merged=merge(raw,zoom);
    assert.equal(merged.captures[0].squads[0].heroes[2].portrait.zoom_evidence.selection,"conflict");
    assert.ok(!parse(merged).state.squads[0].heroes[2].name);
  }
});
await test("Marshall/Williams remains unresolved even with a strongly read Tank class",()=>{
  const raw=fixture(teams[0]),zoom=zoomFixture(teams[0]),hero=raw.captures[0].squads[0].heroes[1];
  Object.assign(hero,{class_text:"tank",class_evidence:"visible_text",class_confidence:.99,
    portrait:portrait("Marshall"),name_text:"Marshall",name_evidence:"visible_text",name_confidence:.99});
  const merged=merge(raw,zoom),row=parse(merged).state.squads[0].heroes[1];
  assert.ok(!row.name);
  assert.equal(row.scan_evidence.identity.portrait.diagnostic.zoom_evidence.selection,"conflict");
  assert.equal(parseGear(row.gear).segments.length,4);
});
await test("class alone or an invalid reference never supplies a hero; adjacent row class is not shared",()=>{
  const raw=fixture(teams[0]),zoom=zoomFixture(teams[0]),heroes=raw.captures[0].squads[0].heroes;
  Object.assign(heroes[0],{class_text:"tank",class_evidence:"visible_text",class_confidence:.99,portrait:null});
  zoom.formations[0].portraits[0].portrait={...portrait("Murphy"),reference_id:"not-attested"};
  heroes[2].portrait=portrait("DVA");
  const merged=merge(raw,zoom),rows=parse(merged).state.squads[0].heroes;
  assert.ok(!rows[0].name);
  assert.ok(!rows[2].name,"row 1's class cannot resolve row 3");
});
await test("equipment conflicts remain unreadable in their own piece; zero and other rows survive",()=>{
  const raw=fixture(teams[0]),zoom=zoomFixture(teams[0]);
  zoom.formations[0].portraits[1].equipment.pieces[3].level=40;
  const merged=merge(raw,zoom),rows=parse(merged).state.squads[0].heroes;
  assert.deepEqual(parseGear(rows[1].gear).segments.map(piece=>piece.level),[4,5,6,null]);
  assert.equal(parseGear(rows[0].gear).segments[0].level,0);
  for(const index of [0,2,3,4])
    assert.deepEqual(parseGear(rows[index].gear).segments.map(piece=>piece.level),[0,1,2,3].map(piece=>index*4+piece));
});
await test("real pixel extraction at three supported sizes keeps all 20 tiles in exact row/piece positions",async()=>{
  for(const [width,height] of [[600,1336],[900,2004],[1008,2244]]){
    const tops=[.484,.548,.609,.670,.732];
    const tiles=tops.flatMap((top,row)=>Array.from({length:4},(_,piece)=>
      `<rect x="${Math.round(width*(.230+piece*.120))}" y="${Math.round(height*top)}" width="${Math.round(width*.107)}" height="${Math.round(height*.054)}" fill="rgb(${40+row*40},${40+piece*50},100)"/>`)).join("");
    const png=await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#142030"/>${tiles}</svg>`)).png().toBuffer();
    const image=`data:image/png;base64,${png.toString("base64")}`;
    const [portraits,crops]=await Promise.all([createFormationPortraitZooms(image,3),createFormationEquipmentZooms(image,3)]);
    assert.equal(portraits.length,5);assert.equal(crops.length,5);
    for(const [row,crop] of crops.entries()){
      assert.equal(crop.image_index,3);assert.equal(crop.slot_index,row);
      const {data,info}=await sharp(Buffer.from(crop.image_url.split(",")[1],"base64")).raw().toBuffer({resolveWithObject:true});
      for(let piece=0;piece<4;piece++){
        const offset=(128*info.width+128+piece*256)*info.channels;
        assert.deepEqual([...data.subarray(offset,offset+3)],[40+row*40,40+piece*50,100]);
      }
    }
  }
});
console.log(`PASS ${groups} class/slot regression groups (80 arbitration cases; synthetic Vision, no real OCR claim)`);
