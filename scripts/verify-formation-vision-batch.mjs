import assert from "node:assert/strict";
import {syntheticFormationPng} from "./fixtures/formation-image.mjs";
import sharp from "sharp";
import {openaiVision,sanitizeFormationBatch,validateScanImageBatch,visionRequestContent} from "../api/scan.js";
import {analyzePlayerCaptureBatch} from "../lib/player-scan-batch.js";
import {KNOWN_EXCLUSIVE_WEAPONS,MAX_FORMATION_BATCH_LENGTH,FORMATION_BATCH_SCHEMA,FORMATION_PORTRAIT_ZOOM_SCHEMA,
  createFormationPortraitZooms,mergeFormationPortraitZooms,mergeFormationPortraitZoomGroups,normalizeFormationSlots} from "../lib/formation-batch.js";
import {parseGear} from "../lib/gear.js";
import {catalogHeroName} from "../lib/heroes.js";
import {recognizeHeroIdentity,HERO_RECOGNITION_LIBRARY} from "../lib/hero-recognition.js";
import {portraitDiagnosticLabel} from "../lib/portrait-diagnostics.js";
import {createScanReviewDraft} from "../lib/scan-review.js";
import {loadHeroReferenceImages} from "../server/_hero-reference-images.js";

// Synthetic provider output and a mocked network; never calls a paid provider.
// The npm script supplies a dummy key only to this test process.
const names=["DVA","Skyler","Lucius","Carlie","Morrison"],at="2026-10-09T12:00:00Z";
const refs=names.map(canonicalName=>({id:`unit-${canonicalName}`,canonicalName,variant:"normal",status:"verified"}));
const images=Array.from({length:6},(_,i)=>`data:image/png;base64,${Buffer.from(`transport-fixture-${i}`).toString("base64")}`);
const formation=(index,heroNames=names)=>({image_index:index,screen_type:"formation_details",exclusive_weapons:[],squads:[{
  power:"44,43 M",power_confidence:.99,heroes:heroNames.map(name=>({name_text:null,name_evidence:"unreadable",name_confidence:null,
    name_image_index:index,level:155,level_confidence:.99,stars:5,stars_confidence:.99,
    portrait:{candidate_name:name,confidence:.96,variant:"normal",reference_id:`unit-${name}`,
      visible_features:[`visible face detail for ${name}`,`visible clothing detail for ${name}`]}}))
}]});
const weapon=(name,index,level)=>({image_index:index,screen_type:"exclusive_weapon_detail",squads:[],exclusive_weapons:[{
  hero_name:name,visible_title:`${KNOWN_EXCLUSIVE_WEAPONS[catalogHeroName(name)]||"Visible weapon"} — ${name}`,
  weapon_name:KNOWN_EXCLUSIVE_WEAPONS[catalogHeroName(name)]||null,name_text:name,name_evidence:"visible_text",
  name_confidence:.99,level,level_confidence:.98,hero_hp_bonus:12345,hero_atk_bonus:678,
  field_confidence:{hero_hp_bonus:.99,hero_atk_bonus:.98},
  // Unexpected provider fields must also be ignored defensively.
  weapon_power_text:name==="DVA"?"7 624 892":"5 071 933",hero_power:7624892,power:7624892
}]});
const fixture=()=>({captures:[weapon("Carlie",0,9),weapon("Schuyler",1,1),formation(2),
  weapon("Morrison",3,7),weapon("DVA",4,28),weapon("Lucius",5,15)]});
const parse=(raw,count=6,references=refs)=>sanitizeFormationBatch(raw,{count,now:at,scanType:"squad1",references});
let checks=0;
async function test(label,fn){await fn();checks++;console.log(`PASS ${label}`)}

await test("synthetic formation fixtures contain no EXIF, XMP or IPTC metadata",async()=>{
  for(const palette of ["tank","aircraft"]){
    const bytes=await syntheticFormationPng({palette});
    const metadata=await sharp(bytes).metadata();
    assert.equal(metadata.width,1008);assert.equal(metadata.height,2244);
    assert.equal(metadata.exif,undefined);assert.equal(metadata.xmp,undefined);
    assert.equal(metadata.iptc,undefined);
  }
});
await test("real OpenAI request builder sends six indexed captures and atlases in ONE strict-schema request",async()=>{
  const bank=await loadHeroReferenceImages();
  assert.equal(bank.available,true);assert.ok(bank.atlases.length>0);
  // Check player content independently of the atlas adapter's internal format.
  const content=visionRequestContent({images,scanType:"squad1",locale:"fr",referenceBank:{...bank,atlases:[]}});
  assert.equal(content.filter(row=>row.type==="input_image").length,6);
  assert.equal(content.filter(row=>row.text?.startsWith("PLAYER CAPTURE image_index=")).length,6);
  assert.match(content[0].text,/not.*player captures|NOT player captures/i);
  assert.match(content[0].text,/Never identify by[\s\S]*stars, level, power/);
  assert.match(content[0].text,/current value to the LEFT of the arrow[\s\S]*exclude the green preview/i);
  let count=0,body;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    count++;assert.equal(url,"https://api.openai.com/v1/responses");
    body=JSON.parse(options.body);
    return {ok:true,json:async()=>({output_text:JSON.stringify(fixture()),
      output:[{content:[{type:"output_text",text:JSON.stringify(fixture())}]}]})};
  };
  try{
    const raw=await openaiVision({images,scanType:"squad1",locale:"fr",referenceBank:bank});
    assert.equal(count,1);assert.equal(body.input[0].content.filter(row=>row.type==="input_image").length,6+bank.atlases.length);
    assert.equal(body.text.format.strict,true);assert.deepEqual(body.text.format.schema,FORMATION_BATCH_SCHEMA);
    assert.deepEqual(raw,fixture());
  }finally{globalThis.fetch=original}
});
await test("synthetic formation yields five crops tied to its source image and exact details rows",async()=>{
  const bytes=await syntheticFormationPng();
  const capture=`data:image/png;base64,${bytes.toString("base64")}`;
  const zooms=await createFormationPortraitZooms(capture,5);
  assert.equal(zooms.length,5);
  for(let slot=0;slot<5;slot++){
    assert.equal(zooms[slot].image_index,5);
    assert.equal(zooms[slot].slot_index,slot);
    const metadata=await sharp(Buffer.from(zooms[slot].image_url.split(",")[1],"base64")).metadata();
    assert.equal(metadata.width,384);assert.equal(metadata.height,384);
  }
  assert.deepEqual(await createFormationPortraitZooms(images[0],0),[],"invalid image bytes cannot create a zoom request");
  assert.deepEqual(await createFormationPortraitZooms(capture,6),[],"zoom indexes cannot escape the six-capture batch");
});
await test("second synthetic formation crops five exact portrait rows and masks level/star UI from zooms",async()=>{
  const bytes=await syntheticFormationPng({palette:"tank"});
  const capture=`data:image/png;base64,${bytes.toString("base64")}`;
  const zooms=await createFormationPortraitZooms(capture,0);
  assert.equal(zooms.length,5);
  for(let slot=0;slot<5;slot++){
    assert.equal(zooms[slot].image_index,0);
    assert.equal(zooms[slot].slot_index,slot);
    const {data,info}=await sharp(Buffer.from(zooms[slot].image_url.split(",")[1],"base64"))
      .raw().toBuffer({resolveWithObject:true});
    const pixel=(x,y)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
    assert.deepEqual(pixel(192,300),[20,24,32],"level and star UI below the portrait is masked");
    assert.notDeepEqual(pixel(192,150),[20,24,32],"the upper portrait remains visible");
    assert.notDeepEqual(pixel(192,225),[20,24,32],"nose/moustache above the Lv label is not blanketed");
    assert.deepEqual(pixel(192,260),[20,24,32],"the Lv digits remain masked");
  }
});
await test("zoom extraction maps each row crop to its own source pixels",async()=>{
  const width=1008,height=2244,left=Math.round(width*.105),cropWidth=Math.round(width*.118),cropHeight=Math.round(height*.054);
  const tops=[.484,.548,.609,.670,.732],colors=["#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff"];
  const marks=tops.map((ratio,slot)=>({input:Buffer.from(
    `<svg width="80" height="80"><rect width="80" height="80" fill="${colors[slot]}"/></svg>`),
    left:left+18,top:Math.round(height*ratio)+18}));
  const source=await sharp({create:{width,height,channels:3,background:"#102030"}}).composite(marks).png().toBuffer();
  const zooms=await createFormationPortraitZooms(`data:image/png;base64,${source.toString("base64")}`,2);
  assert.equal(zooms.length,5);
  for(let slot=0;slot<5;slot++){
    const {data,info}=await sharp(Buffer.from(zooms[slot].image_url.split(",")[1],"base64"))
      .raw().toBuffer({resolveWithObject:true});
    const offset=(192*info.width+192)*info.channels;
    assert.deepEqual([...data.subarray(offset,offset+3)],colors[slot].slice(1).match(/../g).map(value=>parseInt(value,16)));
  }
});
await test("zoom pass corrects a proven details layout, binds its five crops and leaves weapons/power unchanged",async()=>{
  const bank=await loadHeroReferenceImages(),slots=["Carlie","Lucius","Morrison","DVA","Skyler"];
  const bytes=await syntheticFormationPng();
  const capture=`data:image/png;base64,${bytes.toString("base64")}`;
  const batchImages=[...images.slice(0,5),capture];
  const raw={captures:[weapon("Skyler",0,1),weapon("Carlie",1,9),weapon("DVA",2,28),
    weapon("Morrison",3,7),weapon("Lucius",4,15),formation(5)]};
  raw.captures[5].screen_type="formation_overview";
  raw.captures[5].details_layout={title_text:"DÉTAILS DE LA FORMATION",title_confidence:.99,
    row_count:5,rows_confidence:.99};
  for(const hero of raw.captures[5].squads[0].heroes){
    hero.name_text=null;hero.name_evidence="unreadable";hero.name_confidence=null;
    hero.portrait={candidate_name:null,confidence:null,variant:null,reference_id:null,visible_features:[]};
  }
  const zoomResult={formations:[{image_index:5,portraits:slots.map((name,slot_index)=>({slot_index,portrait:{
    candidate_name:name,confidence:.96,variant:"normal",
    reference_id:bank.references.find(reference=>reference.canonicalName===name&&reference.variant==="normal").id,
    visible_features:[`visible ${name} face detail`,`visible ${name} hair detail`]
  }}))}]};
  const bodies=[];let calls=0;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,"https://api.openai.com/v1/responses");
    const body=JSON.parse(options.body);bodies.push(body);calls++;
    const result=calls===1?raw:zoomResult;
    return {ok:true,json:async()=>({output_text:JSON.stringify(result)})};
  };
  let merged;
  try{
    merged=await openaiVision({images:batchImages,scanType:"squad1",locale:"fr",referenceBank:bank});
  }finally{globalThis.fetch=original}
  assert.equal(calls,2);
  assert.equal(merged.captures[5].screen_type,"formation_details");
  assert.equal(raw.captures[5].screen_type,"formation_overview","provider input was not mutated");
  assert.equal(bodies[0].input[0].content.filter(row=>row.type==="input_image").length,6+bank.atlases.length);
  assert.deepEqual(bodies[0].text.format.schema,FORMATION_BATCH_SCHEMA);
  const zoomContent=bodies[1].input[0].content;
  assert.equal(bodies[1].text.format.strict,true);
  assert.deepEqual(bodies[1].text.format.schema,FORMATION_PORTRAIT_ZOOM_SCHEMA);
  assert.equal(zoomContent.filter(row=>row.type==="input_image").length,11+bank.atlases.length);
  assert.match(zoomContent[0].text,/slot-bound second look/i);
  assert.equal(zoomContent.filter(row=>row.text?.startsWith("DERIVED EQUIPMENT ROW ZOOM parent_image_index=5;")).length,5);
  assert.equal(zoomContent.filter(row=>row.text?.startsWith("DERIVED PORTRAIT ZOOM parent_image_index=5")).length,5);
  assert.ok(zoomContent.some(row=>row.text==="DERIVED PORTRAIT ZOOM parent_image_index=5; slot_index=3; source_region=left portrait of that exact hero-details row."));
  const untouchedWeapons=JSON.stringify(raw.captures.slice(0,5));
  assert.equal(JSON.stringify(merged.captures.slice(0,5)),untouchedWeapons);
  assert.deepEqual(merged.captures[5].squads[0].heroes.map(hero=>hero.portrait.candidate_name),slots);
  assert.ok(merged.captures[5].squads[0].heroes.every((hero,index)=>
    hero.portrait.zoom_evidence.source_image_index===5&&hero.portrait.zoom_evidence.slot_index===index&&
    hero.portrait.zoom_evidence.derived_from_same_capture));
  const output=parse(merged,6,bank.references),squad=output.state.squads[0];
  assert.deepEqual(squad.heroes.map(hero=>hero.name),slots);
  assert.deepEqual(squad.heroes.map(hero=>hero.exclusive),["9","15","7","28","1"]);
  assert.equal(squad.power,44.43);
  assert.ok(squad.heroes.every(hero=>hero.scan_evidence.identity.requires_confirmation));
  assert.ok(squad.heroes.every(hero=>hero.scan_evidence.identity.portrait.diagnostic.zoom_evidence.derived_from_same_capture));
});
await test("two formation zoom groups preserve parent indices, slot order, and interleaved weapon data",async()=>{
  const bank=await loadHeroReferenceImages(),bytes=await syntheticFormationPng();
  const capture=`data:image/png;base64,${bytes.toString("base64")}`;
  const secondSlots=[...names].reverse();
  const batchImages=[images[0],capture,images[2],images[3],capture,images[5]];
  const raw={captures:[weapon("Carlie",0,9),formation(1),weapon("Skyler",2,1),
    weapon("Morrison",3,7),formation(4,secondSlots),weapon("Lucius",5,15)]};
  for(const index of [1,4])for(const hero of raw.captures[index].squads[0].heroes){
    hero.name_text=null;hero.name_evidence="unreadable";hero.name_confidence=null;
    hero.portrait={candidate_name:null,confidence:null,variant:null,reference_id:null,visible_features:[]};
  }
  const resultFor=(image_index,slotNames)=>({image_index,portraits:slotNames.map((name,slot_index)=>({
    slot_index,portrait:{candidate_name:name,confidence:.96,variant:"normal",
      reference_id:bank.references.find(reference=>reference.canonicalName===name&&reference.variant==="normal").id,
      visible_features:[`visible ${name} face detail`,`visible ${name} hair detail`]}
  }))});
  const zoomResult={formations:[resultFor(4,secondSlots),resultFor(1,names)]};
  const bodies=[];let calls=0;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,"https://api.openai.com/v1/responses");
    bodies.push(JSON.parse(options.body));calls++;
    return {ok:true,json:async()=>({output_text:JSON.stringify(calls===1?raw:zoomResult)})};
  };
  let merged;
  try{merged=await openaiVision({images:batchImages,scanType:"squad1",locale:"fr",referenceBank:bank})}
  finally{globalThis.fetch=original}
  assert.equal(calls,2);
  assert.deepEqual(bodies[1].text.format.schema,FORMATION_PORTRAIT_ZOOM_SCHEMA);
  const content=bodies[1].input[0].content;
  assert.match(content[0].text,/Never transfer a portrait, slot, or evidence between groups/i);
  for(const index of [1,4]){
    assert.ok(content.some(row=>row.text===`PLAYER CAPTURE image_index=${index}; unchanged parent image for all derived crops.`));
    assert.equal(content.filter(row=>row.text?.startsWith(`DERIVED PORTRAIT ZOOM parent_image_index=${index};`)).length,5);
    const captureRow=content.findIndex(row=>row.text===`PLAYER CAPTURE image_index=${index}; unchanged parent image for all derived crops.`);
    assert.equal(content[captureRow+1].image_url,capture);
  }
  assert.deepEqual(merged.captures.filter(row=>row.screen_type==="exclusive_weapon_detail"),
    raw.captures.filter(row=>row.screen_type==="exclusive_weapon_detail"));
  assert.deepEqual(merged.captures.find(row=>row.image_index===1).squads[0].heroes.map(hero=>hero.portrait.candidate_name),names);
  assert.deepEqual(merged.captures.find(row=>row.image_index===4).squads[0].heroes.map(hero=>hero.portrait.candidate_name),secondSlots);
  for(const [imageIndex,slotNames] of [[1,names],[4,secondSlots]]){
    const heroes=merged.captures.find(row=>row.image_index===imageIndex).squads[0].heroes;
    assert.ok(heroes.every((hero,slot)=>hero.portrait.zoom_evidence.source_image_index===imageIndex&&
      hero.portrait.zoom_evidence.slot_index===slot&&hero.portrait.candidate_name===slotNames[slot]));
  }
  const partial=mergeFormationPortraitZoomGroups(raw,{formations:[resultFor(1,names)]},
    {imageIndexes:[1,4],references:bank.references});
  assert.ok(partial.captures.find(row=>row.image_index===1).squads[0].heroes.every(hero=>hero.portrait.zoom_evidence));
  assert.deepEqual(partial.captures.find(row=>row.image_index===4),raw.captures.find(row=>row.image_index===4),
    "a missing zoom group must leave its parent capture unmodified for review");
});
await test("a failed optional zoom request preserves the complete first-pass result",async()=>{
  const bank=await loadHeroReferenceImages(),bytes=await syntheticFormationPng();
  const capture=`data:image/png;base64,${bytes.toString("base64")}`;
  const raw={captures:[formation(0)]};let calls=0;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{
    calls++;
    if(calls===1)return {ok:true,json:async()=>({output_text:JSON.stringify(raw)})};
    throw new Error("synthetic optional-pass outage");
  };
  try{
    const output=await openaiVision({images:[capture],scanType:"squad1",locale:"fr",referenceBank:bank});
    assert.deepEqual(output,raw);
  }finally{globalThis.fetch=original}
  assert.equal(calls,2);
});
await test("different eligible full-image and zoom identities remain unresolved with review evidence",()=>{
  const base={captures:[formation(0)]},zoomed={image_index:0,portraits:names.map((name,slot_index)=>({slot_index,
    portrait:{candidate_name:name,confidence:.96,variant:"normal",reference_id:`unit-${name}`,
      visible_features:["visible eye detail","visible hair detail"]}
  }))};
  base.captures[0].squads[0].heroes[0].portrait={candidate_name:"Carlie",confidence:.95,variant:"normal",
    reference_id:"unit-Carlie",visible_features:["visible eye detail","visible hair detail"]};
  zoomed.portraits[0].portrait={candidate_name:"DVA",confidence:.96,variant:"normal",reference_id:"unit-DVA",
    visible_features:["visible eye detail","visible hair detail"]};
  const merged=mergeFormationPortraitZooms(base,zoomed,{imageIndex:0,references:refs});
  const slot=merged.captures[0].squads[0].heroes[0];
  assert.equal(slot.portrait.candidate_name,null);
  assert.equal(slot.portrait.zoom_evidence.selection,"conflict");
  const reviewed=parse(merged,1).state.squads[0].heroes[0].scan_evidence.identity;
  assert.notEqual(reviewed.method,"verified_portrait_reference");
  assert.equal(reviewed.portrait.diagnostic.zoom_evidence.zoom.candidate_name,"DVA");
  assert.equal(reviewed.portrait.diagnostic.zoom_evidence.full_capture.candidate_name,"Carlie");
  assert.equal(reviewed.portrait.diagnostic.reason,"conflicting_identity");
});
await test("three disputed rows on a simulated second capture stay blank and explicitly require confirmation",async()=>{
  const bank=await loadHeroReferenceImages();
  const bytes=await syntheticFormationPng({palette:"tank"});
  const capture=`data:image/png;base64,${bytes.toString("base64")}`;
  const crops=await createFormationPortraitZooms(capture,0);
  assert.equal(crops.length,5);
  const verified=name=>bank.references.find(reference=>reference.canonicalName===name&&
    reference.variant==="normal"&&reference.status==="verified");
  const referenceId=name=>{
    const match=verified(name);assert.ok(match,`missing attested reference for ${name}`);return match.id;
  };
  const proposal=name=>({candidate_name:name,confidence:.96,variant:"normal",
    reference_id:referenceId(name),visible_features:["distinctive hair shape","visible facial detail"]});
  const firstPassNames=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
  const zoomNames=["Murphy","Marshall","Williams","Kimberly","Stetmann"];
  const raw={captures:[formation(0,firstPassNames)]};
  for(let slot=0;slot<5;slot++)raw.captures[0].squads[0].heroes[slot].portrait=proposal(firstPassNames[slot]);
  const zoomed={image_index:0,portraits:zoomNames.map((name,slot_index)=>({slot_index,portrait:proposal(name)}))};
  const merged=mergeFormationPortraitZooms(raw,zoomed,{imageIndex:0,references:bank.references});
  const output=sanitizeFormationBatch(merged,{count:1,now:at,scanType:"squad1",references:bank.references});
  const heroes=output.state.squads[0].heroes;
  for(const slot of [1,2,3]){
    assert.equal(heroes[slot].name,undefined,`conflicting row ${slot+1} must not receive a name`);
    const identity=heroes[slot].scan_evidence.identity;
    assert.equal(identity.candidate,null);
    assert.equal(identity.status,"unresolved");
    assert.equal(identity.requires_confirmation,true);
    assert.equal(identity.method,"unresolved");
    assert.equal(identity.portrait.diagnostic.reason,"conflicting_identity");
    assert.equal(identity.portrait.diagnostic.zoom_evidence.full_capture.candidate_name,firstPassNames[slot]);
    assert.equal(identity.portrait.diagnostic.zoom_evidence.zoom.candidate_name,zoomNames[slot]);
  }
  assert.deepEqual(heroes.map(hero=>hero.name),["Murphy",undefined,undefined,undefined,"Stetmann"]);
  assert.ok(heroes[0].scan_evidence.identity.requires_confirmation);
  assert.ok(heroes[4].scan_evidence.identity.requires_confirmation);
  assert.equal(output.state.exclusive_weapons,undefined);
});
await test("six random-order images prefill five reference-matched heroes and associate weapons by canonical identity",async()=>{
  const output=parse(fixture()),calls=[];
  const merged=await analyzePlayerCaptureBatch({type:"squad1",images,request:async payload=>{
    calls.push(payload);return {response:{ok:true},json:output};
  }});
  assert.equal(calls.length,1);assert.deepEqual(calls[0].image_data_urls,images);
  assert.equal(merged.state.squads[0].power,44.43);
  assert.deepEqual(merged.state.squads[0].heroes.map(hero=>hero.name),names);
  assert.deepEqual(merged.state.squads[0].heroes.map(hero=>hero.exclusive),["28","1","15","9","7"]);
  assert.ok(merged.state.squads[0].heroes.every(hero=>hero.scan_evidence.identity.tier==="strong"&&hero.scan_evidence.identity.requires_confirmation));
  assert.ok(merged.state.squads[0].heroes.every(hero=>hero.scan_evidence.identity.method==="portrait_weapon_text"));
});
await test("response entry order does not change slot order or associations",()=>{
  const raw=fixture(),a=parse(raw),b=parse({captures:[...raw.captures].reverse()});
  assert.deepEqual(a.state,b.state);assert.equal(a.capture_count,6);
});
await test("medium reference match is prefilled to confirm; weak portrait plus a named weapon stays blank",()=>{
  const raw=fixture(),heroes=raw.captures[2].squads[0].heroes;
  heroes[0].portrait.confidence=.76;heroes[1].portrait.confidence=.4;
  const output=parse(raw),q=output.state.squads[0];
  assert.equal(q.heroes[0].name,"DVA");assert.equal(q.heroes[0].scan_evidence.identity.tier,"medium");
  assert.equal(q.heroes[1].name,undefined);
  assert.ok(output.complementary_evidence.pending.some(row=>row.hero_name==="Skyler"));
  assert.equal(q.heroes[1].exclusive,undefined);
});
await test("foreign weapon never fills an unresolved formation slot",()=>{
  const raw=fixture();raw.captures[5]=weapon("Tesla",5,3);
  const output=parse(raw);
  assert.deepEqual(output.state.squads[0].heroes.map(hero=>hero.name),names);
  assert.ok(output.complementary_evidence.pending.some(row=>row.hero_name==="Tesla"));
  assert.equal(output.state.squads[0].heroes[2].exclusive,undefined);
});
await test("weapon OCR falsely claimed as formation OCR is not trusted without a compatible portrait",()=>{
  const raw=fixture(),hero=raw.captures[2].squads[0].heroes[0];
  Object.assign(hero,{portrait:null,name_text:"DVA",name_evidence:"visible_text",name_confidence:.99,name_image_index:4});
  assert.equal(parse(raw).state.squads[0].heroes[0].name,undefined);
});
await test("central weapon number and bogus hero power are ignored; total 44.43M and bonuses survive",()=>{
  const raw=fixture();
  raw.captures[2].squads[0].heroes[0].power=7624892;
  const output=parse(raw),q=output.state.squads[0];
  assert.equal(q.power,44.43);assert.ok(q.heroes.every(hero=>hero.power===undefined));
  assert.ok(output.state.exclusive_weapons.every(row=>!Object.keys(row).some(key=>/power/.test(key))));
  assert.ok(output.state.exclusive_weapons.every(row=>row.hero_hp_bonus===12345&&row.hero_atk_bonus===678));
  const draft=createScanReviewDraft("squad1",output.state,{includeHeroNames:true});
  assert.equal(draft.squads[0].power,44.43);
});
await test("stars, level and power cannot act as identity keys",()=>{
  const raw=fixture();
  for(const hero of raw.captures[2].squads[0].heroes)Object.assign(hero,{portrait:null,name_text:null,level:155,stars:5,power:7624892});
  const output=parse(raw);
  assert.ok(output.state.squads[0].heroes.every(hero=>!hero.name&&!hero.exclusive&&!hero.power));
  assert.equal(output.complementary_evidence.pending.length,5);
});
await test("numeric frame details cannot masquerade as distinguishing portrait evidence",()=>{
  for(const features of [["niveau 155","5 étoiles"],["hero_level=155","stars5"],["155","5"]]){
    const raw=fixture();
    for(const hero of raw.captures[2].squads[0].heroes)hero.portrait.visible_features=features;
    assert.ok(parse(raw).state.squads[0].heroes.every(hero=>!hero.name&&!hero.exclusive));
  }
});
await test("reference-only strong proposals require an attached verified ID and confirmation",()=>{
  const raw={captures:[formation(0)]},output=parse(raw,1);
  assert.ok(output.state.squads[0].heroes.every(hero=>hero.name&&hero.scan_evidence.identity.method==="verified_portrait_reference"&&hero.scan_evidence.identity.requires_confirmation));
  const unverified=parse(raw,1,[]);
  assert.ok(unverified.state.squads[0].heroes.every(hero=>!hero.name&&hero.scan_evidence.identity.tier==="low"));
});
await test("no weapon is invented from a named hero or the reference association dictionary",()=>{
  const raw={captures:[formation(0)]};
  const output=parse(raw,1);
  assert.equal((output.state.exclusive_weapons||[]).length,0);
  assert.ok(output.state.squads[0].heroes.every(hero=>hero.exclusive===undefined));
  assert.equal(Object.keys(KNOWN_EXCLUSIVE_WEAPONS).length,13);
  for(const hero of ["Sarah","Violet","Braz","Venom","Mason"])assert.equal(KNOWN_EXCLUSIVE_WEAPONS[hero],undefined);
  Object.assign(raw.captures[0].squads[0].heroes[4],{name_text:"Violet",name_evidence:"visible_text",name_confidence:.99,portrait:null});
  const unknown=parse(raw,1).state.squads[0].heroes[4];
  assert.equal(unknown.name,"Violet");assert.equal(unknown.exclusive,undefined);
  assert.equal(catalogHeroName("Stethmann"),"Stetmann");
});
await test("one formation plus two weapons and formation-only remain coherent",()=>{
  const raw={captures:[weapon("DVA",0,28),formation(1),weapon("Skyler",2,1)]},output=parse(raw,3);
  assert.equal(output.state.exclusive_weapons.length,2);assert.equal(output.state.squads[0].power,44.43);
  assert.equal(parse({captures:[formation(0)]},1).state.squads[0].power,44.43);
});
await test("five weapons without formation are recognized but blocked before any saving",async()=>{
  const raw={captures:names.map((name,index)=>weapon(name,index,1))},output=parse(raw,5);
  assert.equal(output.state.squads,undefined);
  await assert.rejects(()=>analyzePlayerCaptureBatch({type:"squad1",images:images.slice(0,5),
    request:async()=>({response:{ok:true},json:output})}),/Détails de la formation/);
});
await test("truncated/duplicate/out-of-range indices and stale responses are rejected",async()=>{
  for(const raw of [{captures:fixture().captures.slice(0,5)},
    {captures:fixture().captures.map(row=>({...row,image_index:0}))},
    {captures:fixture().captures.map(row=>({...row,image_index:7}))}])assert.throws(()=>parse(raw),/indices|captures du lot/);
  assert.throws(()=>parse({squads:[]}),/captures du lot/);
  let current=true;
  assert.equal(await analyzePlayerCaptureBatch({type:"squad1",images,isCurrent:()=>current,request:async()=>{
    current=false;return {response:{ok:true},json:parse(fixture())};
  }}),null);
});
await test("six-image transport stays bounded for Vercel; other scan types retain their limits",()=>{
  assert.equal(validateScanImageBatch("squad1",{image_data_urls:images}).ok,true);
  assert.equal(validateScanImageBatch("squad1",{image_data_urls:[...images,images[0]]}).status,413);
  assert.equal(validateScanImageBatch("squad1",{image_data_urls:[`data:image/png;base64,${"a".repeat(MAX_FORMATION_BATCH_LENGTH)}`]}).status,413);
  assert.equal(validateScanImageBatch("technology",{image_data_urls:images}).status,413);
  assert.equal(validateScanImageBatch("drone",{image_data_url:images[0]}).ok,true);
});
const tanks=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
const tankRefs=tanks.map(canonicalName=>({id:`unit-${canonicalName}`,canonicalName,variant:"normal",status:"verified"}));
const tankPortrait=(name,confidence=.96)=>({candidate_name:name,confidence,variant:"normal",
  reference_id:`unit-${name}`,visible_features:["distinctive facial contour","visible hairstyle and headwear"]});
const tankIdentity=(name,score,portrait)=>recognizeHeroIdentity({
  name_text:name,name_evidence:"visible_text",name_confidence:score,portrait,level:155,stars:5
},tankRefs);
await test("weak contradictory name OCR never vetoes a strong attested Tank portrait",()=>{
  for(const name of tanks){
    for(const score of [.3,.75]){
      const identity=tankIdentity(name==="Murphy"?"Williams":"Murphy",score,tankPortrait(name));
      assert.equal(identity.name,name);
      assert.equal(identity.evidence.requires_confirmation,true);
      assert.equal(identity.evidence.portrait.diagnostic.arbitration.decision,"verified_portrait_over_weak_ocr");
      assert.match(portraitDiagnosticLabel(identity.evidence),/à confirmer/);
    }
  }
});
await test("strong name plus weak portrait uses only the name; two strong conflicting signals stay blank",()=>{
  const textWins=tankIdentity("Murphy",.99,tankPortrait("Williams",.75));
  assert.equal(textWins.name,"Murphy");assert.equal(textWins.evidence.requires_confirmation,true);
  assert.equal(textWins.evidence.method,"visible_text");
  const disputed=tankIdentity("Murphy",.99,tankPortrait("Williams"));
  assert.equal(disputed.name,null);assert.equal(disputed.evidence.candidate,null);
  assert.equal(disputed.evidence.portrait.diagnostic.arbitration.decision,"strong_signals_conflict");
  const withClass=recognizeHeroIdentity({name_text:"Murphy",name_evidence:"visible_text",name_confidence:.99,
    portrait:formation(0).squads[0].heroes[0].portrait,
    class_text:"Tank",class_evidence:"visible_text",class_confidence:.99},[...tankRefs,...refs]);
  assert.equal(withClass.name,null,"class must not resolve two strong contradictory identities");
});
await test("no proof, numerical identity hints, unverified references and a claimed Tank team never fill a slot",()=>{
  for(const raw of [
    {name:"Mason",level:155,stars:5,previous_composition:tanks},
    {class_text:"Tank",class_evidence:"visible_text",class_confidence:.99,level:155,stars:5},
    {name_text:"Murphy",name_evidence:"visible_text",name_confidence:.2,
      portrait:{...tankPortrait("Williams"),reference_id:"not-in-bank"}},
    {portrait:{...tankPortrait("Williams"),visible_features:["Level 155","5 stars","44.43 M"]}}
  ])assert.equal(recognizeHeroIdentity(raw,tankRefs).name,null);
  const blank=tankIdentity("Murphy",.2,tankPortrait("Williams",.6));
  assert.equal(blank.name,null);
  assert.equal(HERO_RECOGNITION_LIBRARY.length,31);
  assert.equal(HERO_RECOGNITION_LIBRARY.filter(hero=>hero.type==="tank").length,13);
});
await test("visible class only excludes mismatches; unsupported claimed team context does not select heroes",()=>{
  const proposal={portrait:formation(0).squads[0].heroes[0].portrait};
  const visible={class_text:"Tank",class_confidence:.99,class_evidence:"visible_text"};
  assert.equal(recognizeHeroIdentity({...proposal,...visible},refs).name,null);
  assert.equal(recognizeHeroIdentity({...proposal,...visible,class_evidence:"inferred_from_team"},refs).name,"DVA");
  assert.equal(recognizeHeroIdentity({...proposal,...visible,class_confidence:.4},refs).name,"DVA");
});
await test("same-slot Tank crop resolves weak OCR with shuffled rows; no cross-slot or foreign weapon injection",()=>{
  const base={captures:[weapon("DVA",0,28),formation(1,tanks),weapon("Kimberly",2,5)]};
  const rows=base.captures[1].squads[0].heroes;
  rows.forEach((hero,index)=>{hero.portrait=tankPortrait(tanks[index])});
  Object.assign(rows[1],{name_text:"Murphy",name_evidence:"visible_text",name_confidence:.3,
    portrait:{...tankPortrait("Murphy"),confidence:.4}});
  const zoomed={formations:[{image_index:1,portraits:tanks.map((name,slot_index)=>({
    slot_index,portrait:tankPortrait(name)
  })).reverse()}]};
  const inputBefore=JSON.stringify(base);
  const merged=mergeFormationPortraitZoomGroups(base,zoomed,{imageIndexes:[1],references:[...tankRefs,...refs]});
  assert.equal(JSON.stringify(base),inputBefore,"raw observations must remain untouched");
  for(let slot=0;slot<5;slot++){
    const evidence=merged.captures[1].squads[0].heroes[slot].portrait.zoom_evidence;
    assert.equal(evidence.source_image_index,1);assert.equal(evidence.slot_index,slot);
  }
  const result=sanitizeFormationBatch(merged,{count:3,now:at,scanType:"squad1",references:[...tankRefs,...refs]});
  assert.deepEqual(result.state.squads[0].heroes.map(hero=>hero.name),tanks);
  const heroes=result.state.squads[0].heroes;
  assert.equal(heroes[1].level,155);assert.equal(heroes[1].stars,5);
  assert.equal(result.state.exclusive_weapons.find(row=>row.hero_name==="Kimberly").level,5);
  assert.equal(heroes[2].scan_evidence.identity.corroborating_weapon.hero_name,"Kimberly");
  for(const [slot,hero] of heroes.entries()){
    assert.equal(hero.scan_evidence.identity.requires_confirmation,true);
    if(slot!==2)assert.equal(hero.scan_evidence.identity.corroborating_weapon,undefined);
  }
  assert.equal(result.state.squads[0].power,44.43);
});
await test("strong same-slot crop may propose over a weaker full portrait without raising confidence",()=>{
  const base={captures:[formation(0,tanks)]};
  base.captures[0].squads[0].heroes.forEach((hero,slot)=>{hero.portrait=tankPortrait(tanks[slot])});
  base.captures[0].squads[0].heroes[1].portrait=tankPortrait("Murphy",.75);
  const zoomed={formations:[{image_index:0,portraits:tanks.map((name,slot_index)=>({
    slot_index,portrait:tankPortrait(name)
  }))}]};
  const merged=mergeFormationPortraitZoomGroups(base,zoomed,{imageIndexes:[0],references:tankRefs});
  const portrait=merged.captures[0].squads[0].heroes[1].portrait;
  assert.equal(portrait.candidate_name,"Williams");
  assert.equal(portrait.zoom_evidence.selection,"zoom_over_weak_full");
  assert.equal(portrait.zoom_evidence.confidence_cap,.75);
  assert.equal(portrait.zoom_evidence.full_capture.candidate_name,"Murphy");
  const result=sanitizeFormationBatch(merged,{count:1,now:at,scanType:"squad1",references:tankRefs});
  const identity=result.state.squads[0].heroes[1].scan_evidence.identity;
  assert.equal(identity.candidate,"Williams");assert.equal(identity.confidence,.75);
  assert.equal(identity.tier,"medium");assert.equal(identity.requires_confirmation,true);
});
const compositions=[
  tanks,["Violet","Mason","Scarlett","Richard","Monica"],
  ["Williams","Murphy","Stetmann","Kimberly","Marshall"],
  names,["Tesla","Adam","McGregor","Venom","Swift"]
];
const allRefs=HERO_RECOGNITION_LIBRARY.map(hero=>({
  id:`unit-${hero.canonicalName}`,canonicalName:hero.canonicalName,variant:"normal",status:"verified"
}));
const equipmentFor=row=>({pieces:Array.from({length:4},(_,slot_index)=>({
  slot_index,visible:true,visibility_confidence:.99,level:row*4+slot_index,
  level_confidence:.99,level_evidence:"visible_equipment_label",
  rarity:null,rarity_confidence:null,rarity_evidence:"unreadable"
}))});
await test("explicit row positions preserve 20 distinct pieces across varied teams and all four squad targets",()=>{
  for(const composition of compositions)for(let squad=1;squad<=4;squad++){
    const raw={captures:[formation(0,composition)]};
    raw.captures[0].squads[0].power="35.66M";
    raw.captures[0].squads[0].heroes.forEach((hero,slot)=>{
      hero.slot_index=slot;hero.level=150+slot;hero.equipment=equipmentFor(slot);
    });
    raw.captures[0].squads[0].heroes.reverse();
    const before=JSON.stringify(raw);
    const output=sanitizeFormationBatch(raw,{count:1,now:at,scanType:`squad${squad}`,references:allRefs});
    assert.equal(JSON.stringify(raw),before);
    const target=output.state.squads[squad-1];
    assert.equal(target.power,35.66);
    assert.deepEqual(target.heroes.map(hero=>hero.name),composition);
    assert.deepEqual(target.heroes.map(hero=>hero.level),[150,151,152,153,154]);
    target.heroes.forEach((hero,slot)=>{
      assert.deepEqual(parseGear(hero.gear).segments.map(piece=>[piece.slot,piece.level]),
        [0,1,2,3].map(piece=>[piece,slot*4+piece]));
      assert.equal(hero.scan_evidence.identity.requires_confirmation,true);
    });
    output.state.squads.forEach((row,index)=>{if(index!==squad-1)assert.equal(row,undefined)});
  }
});
await test("partial duplicate and invalid row indexes fail closed; historical unindexed responses still work",()=>{
  const original={captures:[formation(0)]},before=JSON.stringify(original);
  assert.deepEqual(normalizeFormationSlots(original),original);
  assert.equal(JSON.stringify(original),before);
  for(const indexes of [[0,1,1,3,4],[0,1,2,3,5],[0,1,2,3,null],[0,1,2,3,"4"]]){
    const raw=structuredClone(original);
    raw.captures[0].squads[0].heroes.forEach((hero,index)=>{hero.slot_index=indexes[index]});
    assert.throws(()=>normalizeFormationSlots(raw),error=>error.code==="INVALID_FORMATION_BATCH");
    assert.throws(()=>parse(raw,1),error=>error.code==="INVALID_FORMATION_BATCH");
  }
  const legacy=structuredClone(original);
  legacy.captures[0].squads[0].heroes.forEach(hero=>{hero.slot_index=null});
  assert.deepEqual(parse(legacy,1).state.squads[0].heroes.map(hero=>hero.name),names);
});
await test("reordered first pass and reordered zooms bind by actual row, never array return order",()=>{
  const raw={captures:[formation(0,tanks)]};
  raw.captures[0].squads[0].heroes.forEach((hero,slot)=>{
    hero.slot_index=slot;hero.portrait=tankPortrait(tanks[slot]);hero.equipment=equipmentFor(slot);
  });
  raw.captures[0].squads[0].heroes.reverse();
  const zoomed={formations:[{image_index:0,portraits:tanks.map((name,slot_index)=>({
    slot_index,portrait:tankPortrait(name)
  })).reverse()}]};
  const merged=mergeFormationPortraitZoomGroups(raw,zoomed,{imageIndexes:[0],references:allRefs});
  merged.captures[0].squads[0].heroes.forEach((hero,slot)=>{
    assert.equal(hero.portrait.zoom_evidence.selection,"agreement");
    assert.equal(hero.portrait.zoom_evidence.slot_index,slot);
    assert.equal(hero.portrait.zoom_evidence.full_capture.candidate_name,tanks[slot]);
    assert.equal(hero.equipment.pieces[0].level,slot*4);
  });
});
await test("appearance-qualified candidates use the same canonical matcher in full/zoom arbitration",()=>{
  for(const name of ["Williams","Kimberly","Skyler","Tesla"]){
    const raw={captures:[formation(0)]};
    raw.captures[0].squads[0].heroes[0].portrait={
      ...tankPortrait(name),candidate_name:`${name} normal`
    };
    const zoomed={formations:[{image_index:0,portraits:names.map((_,slot_index)=>({
      slot_index,portrait:slot_index===0?tankPortrait("Murphy",.75):null
    }))}]};
    const merged=mergeFormationPortraitZoomGroups(raw,zoomed,{imageIndexes:[0],references:allRefs});
    const portrait=merged.captures[0].squads[0].heroes[0].portrait;
    assert.equal(portrait.zoom_evidence.selection,"full_over_weak_zoom");
    const identity=recognizeHeroIdentity({portrait},allRefs);
    assert.equal(identity.name,name);
    assert.equal(identity.evidence.confidence,.75);
    assert.equal(identity.evidence.requires_confirmation,true);
  }
});
await test("unvalidated high-score visual references cannot veto strong independently visible name OCR",()=>{
  for(const [text,visual] of [["Williams","Marshall"],["Kimberly","DVA"],["Tesla","Murphy"],["Skyler","Tesla"]]){
    for(const reference_id of [null,"missing-reference",`unit-${text}`]){
      const identity=recognizeHeroIdentity({name_text:text,name_evidence:"visible_text",name_confidence:.99,
        portrait:{...tankPortrait(visual),reference_id}},allRefs);
      assert.equal(identity.name,text);
      assert.equal(identity.evidence.method,"visible_text");
      assert.equal(identity.evidence.requires_confirmation,true);
      assert.equal(identity.evidence.portrait.reference_verified,false);
      assert.equal(identity.evidence.portrait.candidate,visual);
      assert.equal(identity.evidence.portrait.diagnostic.accepted,false);
    }
  }
});
await test("documented Tank rows 2/3 remain unresolved with two strong valid visual contradictions",()=>{
  const raw={captures:[formation(0,tanks),weapon("Kimberly",1,16)]};
  raw.captures[0].squads[0].heroes.forEach((hero,slot)=>{
    hero.slot_index=slot;hero.portrait=tankPortrait(tanks[slot]);hero.equipment=equipmentFor(slot);
  });
  raw.captures[0].squads[0].heroes[1].portrait=tankPortrait("Marshall");
  raw.captures[0].squads[0].heroes[2].portrait=tankPortrait("DVA");
  for(const slot of [1,2]){
    Object.assign(raw.captures[0].squads[0].heroes[slot],{
      name_text:slot===1?"Marshall":"DVA",name_evidence:"visible_text",name_confidence:.99
    });
  }
  const zoomed={formations:[{image_index:0,portraits:tanks.map((name,slot_index)=>({
    slot_index,portrait:tankPortrait(name)
  }))}]};
  const merged=mergeFormationPortraitZoomGroups(raw,zoomed,{imageIndexes:[0],references:allRefs});
  const output=sanitizeFormationBatch(merged,{count:2,now:at,scanType:"squad2",references:allRefs});
  const heroes=output.state.squads[1].heroes;
  for(const slot of [1,2]){
    assert.ok(!heroes[slot].name);
    assert.equal(heroes[slot].scan_evidence.identity.candidate,null);
    assert.equal(heroes[slot].scan_evidence.identity.portrait.diagnostic.reason,"conflicting_identity");
    assert.equal(heroes[slot].scan_evidence.identity.portrait.diagnostic.zoom_evidence.name_ocr.confidence,.99);
    assert.equal(heroes[slot].scan_evidence.identity.corroborating_weapon,undefined);
  }
  for(const [slot,hero] of heroes.entries()){
    assert.equal(parseGear(hero.gear).segments.length,4);
    assert.deepEqual(parseGear(hero.gear).segments.map(piece=>piece.level),[0,1,2,3].map(i=>slot*4+i));
  }
  assert.equal(heroes[0].name,"Murphy");
  assert.equal(heroes[3].name,"Marshall");
  assert.equal(heroes[4].name,"Stetmann");
});
console.log(`PASS ${checks} formation Vision batch checks (mocked provider; NOT real-capture recognition accuracy)`);
