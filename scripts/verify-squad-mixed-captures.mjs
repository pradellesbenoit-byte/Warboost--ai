import assert from "node:assert/strict";
import {sanitize,promptFor,usefulState,visionRequestContent} from "../api/scan.js";
import {classifySquadCapture,squadWeaponProof,squadCaptureSummary,associateSquadWeaponProof} from "../lib/squad-capture.js";
import {mergePlayerScanBatch,analyzePlayerCaptureBatch,playerScanBatchLimit} from "../lib/player-scan-batch.js";
import {createScanReviewDraft} from "../lib/scan-review.js";
import {applyReviewedSquad} from "../lib/squad-scan-review.js";
import {catalogHeroName} from "../lib/heroes.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";

// Representative provider fixtures for the reported case, not a live OCR benchmark.
const at="2026-10-08T19:00:00Z";
const names=["DVA","Skyler","Carlie","Lucius","Morrison"];
const named=name=>({name_text:name,name_evidence:"visible_text",name_confidence:.96,level:155});
const formation=(heroes=names.map(named),type="formation_details")=>({
  screen_type:type,squads:[{id:1,power:"44,43 M",heroes}]
});
const weapon=(name,level)=>({screen_type:"exclusive_weapon_detail",exclusive_weapons:[{
  hero_name:name,visible_title:name==="DVA"?"Lame de Frappe — DVA":"Lame Magique — Skyler",
  weapon_name:name==="DVA"?"Lame de Frappe":"Lame Magique",name_evidence:"visible_text",
  name_confidence:.97,level,level_confidence:.98
}]});
const result=(raw,type="squad1")=>({state:sanitize(raw,at,type),capture_type:classifySquadCapture(raw),scanned_at:at});
let checks=0;
async function test(label,run){await run();checks++;console.log(`PASS ${label}`)}

await test("classify details, overview and named exclusive weapons independently",()=>{
  assert.equal(classifySquadCapture({screen_title:"DÉTAILS DE LA FORMATION"}),"formation_details");
  assert.equal(classifySquadCapture({screen_type:"formation_overview"}),"formation_overview");
  assert.equal(classifySquadCapture({screen_title:"Arme exclusive"}),"exclusive_weapon_detail");
  assert.equal(classifySquadCapture(null),"unknown");
});
await test("reported case: weapon screens first, then 44.43M formation with five level-155 heroes",async()=>{
  const fixtures=[weapon("DVA",28),weapon("Skyler",1),formation()];
  const calls=[];
  const merged=await analyzePlayerCaptureBatch({type:"squad1",images:["dva","skyler","formation"],
    request:async payload=>{calls.push(payload);return {response:{ok:true},json:{...mergePlayerScanBatch("squad1",fixtures.map(raw=>result(raw))),batch_analysis:true,capture_count:3}}}});
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].image_data_urls,["dva","skyler","formation"]);
  assert.equal(merged.state.squads[0].power,44.43);
  assert.deepEqual(merged.state.squads[0].heroes.map(h=>h.name),names);
  assert.ok(merged.state.squads[0].heroes.every(h=>h.level===155));
  assert.equal(merged.state.squads[0].heroes[0].exclusive,"28");
  assert.equal(merged.state.squads[0].heroes[1].exclusive,"1");
  assert.ok(merged.state.squads[0].heroes.slice(2).every(h=>h.exclusive===undefined));
  assert.deepEqual(merged.state.exclusive_weapons.map(row=>row.hero_name),["DVA","Skyler"]);
  assert.equal(catalogHeroName("Schuyler"),"Skyler");
  assert.equal(catalogHeroName("Skyler"),"Skyler");
  const review=createScanReviewDraft("squad1",merged.state,{includeHeroNames:true});
  assert.equal(review.squads[0].heroes[0].exclusive,"28");
  assert.ok(!JSON.stringify(review).includes("scan_evidence"));
  const applied=applyReviewedSquad({player_id:"fixture",squads:[{id:1,heroes:[]}]},{
    squadId:1,heroes:review.squads[0].heroes,powerConfirmed:true,identityReviewConfirmed:true,
    evidence:merged.state.squads[0].heroes.map(h=>h.scan_evidence),updatedAt:at});
  assert.equal(applied.state.squads[0].heroes[0].exclusive,"28");
  assert.match(merged.capture_summary,/DVA.*28/);
  assert.match(merged.capture_summary,/Skyler.*1/);
});
await test("all three capture orders use formation slots, never weapon ordering",()=>{
  const raws=[formation(),weapon("DVA",28),weapon("Skyler",1)];
  for(const order of [[0,1,2],[1,2,0],[2,0,1]]){
    const merged=mergePlayerScanBatch("squad1",order.map(i=>result(raws[i])));
    assert.deepEqual(merged.state.squads[0].heroes.map(h=>h.name),names);
    assert.equal(merged.complementary_evidence.linked.length,2);
  }
});
await test("no identified formation heroes: retain 44.43M and levels, never insert DVA/Skyler",()=>{
  const raw=formation(Array.from({length:5},()=>({name_text:null,name_evidence:"unreadable",level:155})));
  const merged=mergePlayerScanBatch("squad1",[result(weapon("DVA",28)),result(raw),result(weapon("Skyler",1))]);
  assert.equal(merged.state.squads[0].power,44.43);
  assert.ok(merged.state.squads[0].heroes.every(h=>!h.name&&!h.exclusive&&h.level===155));
  assert.equal(merged.complementary_evidence.pending.length,2);
  assert.equal(usefulState("squad1",merged.state),true);
  assert.match(merged.capture_summary,/non relié.*non appliqué/);
});
await test("unknown secondary identity cannot occupy an unidentified primary formation slot",()=>{
  const primary=formation([named("DVA"),{level:155},{level:155},{level:155},{level:155}]);
  const secondary=formation([named("Skyler"),{},{},{},{}]);
  const merged=mergePlayerScanBatch("squad1",[result(primary),result(secondary),result(weapon("Skyler",1))]);
  assert.equal(merged.state.squads[0].heroes[0].name,"DVA");
  assert.ok(merged.state.squads[0].heroes.slice(1).every(h=>!h.name&&!h.exclusive));
  assert.equal(merged.complementary_evidence.pending.length,1);
});
await test("missing numeric fields remain absent, not fabricated zeros",()=>{
  const raw=formation(Array.from({length:5},()=>({level:null,stars:null,name_text:null})));
  raw.squads[0].power=null;
  const state=sanitize(raw,at,"squad1");
  assert.ok(state.squads[0].heroes.every(h=>h.level===undefined&&h.stars===undefined));
  assert.equal(usefulState("squad1",state),false);
});
await test("unresolved mixed scan never reuses a previous composition or changes confirmed hero fields",()=>{
  const raw=formation(Array.from({length:5},()=>({name_text:null,name_evidence:"unreadable",level:155})));
  const merged=mergePlayerScanBatch("squad1",[result(weapon("DVA",28)),result(raw),result(weapon("Skyler",1))]);
  const old={player_id:"fixture",squads:[{id:1,power:40,confirmed_composition:names,composition_source:"explicit_confirmation",
    composition_confirmed_at:at,heroes:names.map(name=>({name,level:150,stars:5,power:5000000,exclusive:"3",
      gear:null,awakening:null,source:"confirmed_manual"}))}]};
  const applied=applyReviewedSquad(old,{squadId:1,heroes:merged.state.squads[0].heroes,
    evidence:merged.state.squads[0].heroes.map(h=>h.scan_evidence),updatedAt:at,powerConfirmed:true});
  assert.deepEqual(applied.state.squads[0].heroes,old.squads[0].heroes);
  assert.ok(applied.pending.some(item=>item.field==="name"));
});
await test("one identified hero: only exact compatible slot enriched, others remain unresolved",()=>{
  const heroes=Array.from({length:5},()=>({level:155}));
  heroes[3]=named("DVA");
  const merged=mergePlayerScanBatch("squad1",[result(formation(heroes)),result(weapon("DVA",28)),result(weapon("Skyler",1))]);
  assert.equal(merged.state.squads[0].heroes[3].exclusive,"28");
  assert.ok(merged.state.squads[0].heroes.filter((_,i)=>i!==3).every(h=>!h.name&&!h.exclusive));
});
await test("weapon cannot inject bogus squads or weapon level/power into formation",()=>{
  const raw={...weapon("DVA",28),squads:[{power:999,heroes:[{name:"DVA",level:28}]}]};
  const sanitized=sanitize(raw,at,"squad1");
  assert.equal(sanitized.squads,undefined);
  const merged=mergePlayerScanBatch("squad1",[result(raw),result(formation())]);
  assert.equal(merged.state.squads[0].power,44.43);
  assert.equal(merged.state.squads[0].heroes[0].level,155);
});
await test("weak, missing and conflicting weapon identities never enrich heroes",()=>{
  for(const patch of [{name_confidence:.3},{name_confidence:null},{name_evidence:"portrait"},{hero_name:"Tesla"}]){
    const raw=weapon("DVA",28);Object.assign(raw.exclusive_weapons[0],patch);
    assert.deepEqual(sanitize(raw,at,"squad1"),{});
  }
  assert.equal(squadWeaponProof({weapon_name:"Lame de Frappe",name_evidence:"visible_text",name_confidence:.99}),null);
});
await test("medium weapon identity remains a proposal requiring confirmation, weak level omitted",()=>{
  const raw=weapon("DVA",28);raw.exclusive_weapons[0].name_confidence=.75;
  assert.equal(sanitize(raw,at,"squad1").exclusive_weapons[0].identity_tier,"medium");
  assert.equal(sanitize(raw,at,"squad1").exclusive_weapons[0].requires_confirmation,true);
  raw.exclusive_weapons[0].level_confidence=.4;
  assert.equal(sanitize(raw,at,"squad1").exclusive_weapons[0].level,undefined);
});
await test("Skyler level 1 and DVA level 28 large weapon numbers are ignored throughout formation review",()=>{
  const dva=weapon("DVA",28),skyler=weapon("Skyler",1);
  for(const [raw,power] of [[dva,"7 619 132"],[skyler,"5 071 933"]]){
    Object.assign(raw.exclusive_weapons[0],{weapon_power_text:power,power,hero_power:power,
      field_confidence:{weapon_power:.99,hero_hp_bonus:.98},hero_hp_bonus:12345});
    // Even a provider's bogus composition attached to a weapon screen is ignored.
    raw.squads=[{power:999,heroes:[{name:"DVA",power}]}];
    const sanitized=sanitize(raw,at,"squad1");
    assert.equal(sanitized.squads,undefined);
    assert.ok(sanitized.exclusive_weapons.every(row=>!Object.keys(row).some(key=>/power/.test(key))));
  }
  const merged=mergePlayerScanBatch("squad1",[result(skyler),result(formation()),result(dva)]);
  assert.equal(merged.state.squads[0].power,44.43);
  assert.ok(merged.state.squads[0].heroes.every(hero=>hero.power===undefined));
  assert.deepEqual(merged.state.exclusive_weapons.map(row=>row.level),[1,28]);
  assert.ok(merged.state.exclusive_weapons.every(row=>row.hero_hp_bonus===12345&&!Object.keys(row).some(key=>/power/.test(key))));
  assert.doesNotMatch(merged.capture_summary,/5 071 933|7 619 132|Puissance de l’arme|Weapon power/);
  const review=createScanReviewDraft("squad1",merged.state,{includeHeroNames:true});
  const groups=buildScanReviewGroups("squad1",review,merged.state.squads[0].heroes.map(hero=>hero.scan_evidence));
  assert.ok(groups.filter(group=>group.kind==="hero").every(group=>!group.rows.some(row=>row.field==="power")));
  const applied=applyReviewedSquad({squads:[{id:1,power:review.squads[0].power}]},{
    squadId:1,heroes:review.squads[0].heroes,powerConfirmed:true,updatedAt:at,
    evidence:merged.state.squads[0].heroes.map(hero=>hero.scan_evidence),identityReviewConfirmed:true});
  assert.equal(applied.state.squads[0].power,44.43);
  assert.ok(!applied.pending.some(item=>item.slot&&item.field==="power"));
});
await test("old weapon power drafts are stripped; genuine optional hero power and confirmed values survive",()=>{
  const old={squads:[{id:1,power:44.43,confirmed_composition:names,composition_source:"explicit_confirmation",
    composition_confirmed_at:at,heroes:names.map(name=>({name,level:155,stars:5,power:5000000,updated_at:at,source:"confirmed_manual"}))}],
    exclusive_weapons:[{hero_name:"DVA",level:28,power:7619132,power_raw:"7 619 132",weapon_power:7619132}]};
  const review=createScanReviewDraft("squad1",old,{includeHeroNames:true});
  assert.deepEqual(review.exclusive_weapons,[{hero_name:"DVA",level:28}]);
  const groups=buildScanReviewGroups("squad1",review);
  assert.ok(groups.filter(group=>group.kind==="hero").every(group=>group.rows.some(row=>row.field==="power"&&row.value===5000000)));
  const applied=applyReviewedSquad(old,{squadId:1,heroes:names.map(name=>({name,level:155,stars:5})),
    powerConfirmed:true,updatedAt:at,identityReviewConfirmed:true});
  assert.ok(applied.state.squads[0].heroes.every(hero=>hero.power===5000000));
  assert.ok(!applied.pending.some(item=>item.slot&&item.field==="power"));
});
await test("duplicate formation identities and conflicting weapon levels are not attached",()=>{
  const duplicates=formation([named("DVA"),named("DVA"),named("Carlie"),{},{}]);
  const merged=mergePlayerScanBatch("squad1",[result(duplicates),result(weapon("DVA",28))]);
  assert.ok(merged.state.squads[0].heroes.every(h=>!h.exclusive));
  const conflict=mergePlayerScanBatch("squad1",[result(formation()),result(weapon("DVA",28)),result(weapon("DVA",1))]);
  assert.equal(conflict.state.squads[0].heroes[0].exclusive,undefined);
  assert.ok(conflict.conflicts.includes("hero.DVA.exclusive"));
});
await test("squad 2 cannot be populated while the selected target is squad 1",()=>{
  const raw=formation();raw.squads[0].id=2;
  const merged=mergePlayerScanBatch("squad1",[result(raw),result(weapon("DVA",28))]);
  assert.ok(merged.state.squads[1]==null);
  assert.equal(merged.state.squads[0].id,1);
});
await test("homogeneous formation batches of 1..3 remain useful without extra requests",async()=>{
  for(let count=1;count<=3;count++){
    let calls=0;
    const merged=await analyzePlayerCaptureBatch({type:"squad1",images:Array.from({length:count},(_,i)=>`image${i}`),
      request:async()=>{calls++;return {response:{ok:true},json:{...mergePlayerScanBatch("squad1",Array.from({length:count},()=>result(formation()))),batch_analysis:true,capture_count:count}}}});
    assert.equal(calls,1);
    assert.equal(merged.state.squads[0].power,44.43);
    assert.deepEqual(merged.state.squads[0].heroes.map(h=>h.name),names);
  }
});
await test("readable overview supplies composition data, details override overview ordering",()=>{
  const overview=formation([...names].reverse().map(named),"formation_overview");
  const only=mergePlayerScanBatch("squad1",[result(overview)]);
  assert.equal(only.state.squads[0].power,44.43);
  const merged=mergePlayerScanBatch("squad1",[result(overview),result(formation())]);
  assert.deepEqual(merged.state.squads[0].heroes.map(h=>h.name),names);
});
await test("homogeneous exclusive batches remain separate from squads; no-formation errors are precise",async()=>{
  for(let count=1;count<=3;count++){
    const merged=mergePlayerScanBatch("exclusive",Array.from({length:count},()=>({state:{exclusive_weapons:[{hero_name:"DVA",level:28}]}})));
    assert.equal(merged.state.exclusive_weapons[0].level,28);
  }
  await assert.rejects(()=>analyzePlayerCaptureBatch({type:"squad1",images:["dva","skyler"],
    request:async()=>({response:{ok:true},json:{...mergePlayerScanBatch("squad1",[result(weapon("DVA",28)),result(weapon("Skyler",1))]),batch_analysis:true,capture_count:2}})}),
    /arme exclusive reconnus.*DVA.*Skyler.*Ajoute une capture/);
});
await test("recognized but empty subtype does not discard a useful formation; provider failures still fail safely",async()=>{
  const merged=await analyzePlayerCaptureBatch({type:"squad1",images:["unknown","formation"],
    request:async()=>({response:{ok:true},json:{...mergePlayerScanBatch("squad1",[{state:{},capture_type:"unknown"},result(formation())]),batch_analysis:true,capture_count:2}})});
  assert.equal(merged.state.squads[0].power,44.43);
  await assert.rejects(()=>analyzePlayerCaptureBatch({type:"squad1",images:["failure"],
    request:async()=>({response:{ok:false},json:{message:"Vision indisponible",code:"VISION_TIMEOUT"}})}),/Vision indisponible/);
});
await test("prompt and request retain subtype schema, named evidence and same hero aliases",()=>{
  const prompt=promptFor("squad1","fr");
  for(const word of ["exclusive_weapon_detail","formation_overview","visible_title","level_confidence","NOT the hero level","Skyler"])assert.ok(prompt.includes(word));
  const content=visionRequestContent({image:"data:image/png;base64,AA==",scanType:"squad1",locale:"fr"});
  assert.match(content[0].text,/do NOT return five hero slots/);
  assert.match(squadCaptureSummary([{type:"formation_details"}],{linked:[],pending:[]},"en"),/formation capture/);
});
await test("six images: one authoritative formation plus five weapons, independent of selection order",async()=>{
  const raws=names.map((name,index)=>({screen_type:"exclusive_weapon_detail",exclusive_weapons:[{
    hero_name:name,visible_title:`Arme visible — ${name==="Skyler"?"Schuyler":name}`,weapon_name:"Arme visible",
    name_evidence:"visible_text",name_confidence:.98,level:index===0?28:index+1,level_confidence:.98,
    hero_atk_bonus:index+10,hero_def_bonus:99,field_confidence:{hero_atk_bonus:.99,hero_def_bonus:.3}
  }]}));
  for(let position=0;position<6;position++){
    const lot=[...raws].reverse();lot.splice(position,0,formation());
    let calls=0;
    const merged=await analyzePlayerCaptureBatch({type:"squad1",images:lot.map((_,i)=>`six-image-${i}`),
      request:async()=>{calls++;return {response:{ok:true},json:{...mergePlayerScanBatch("squad1",lot.map(raw=>result(raw))),batch_analysis:true,capture_count:6}}}});
    assert.equal(calls,1);assert.equal(merged.capture_count,6);
    assert.deepEqual(merged.state.squads[0].heroes.map(h=>h.name),names);
    for(let i=0;i<5;i++)assert.equal(merged.state.squads[0].heroes[i].exclusive,String(i===0?28:i+1));
    assert.equal(merged.state.exclusive_weapons.length,5);
    assert.ok(merged.state.exclusive_weapons.every(row=>row.hero_def_bonus===undefined));
    const review=createScanReviewDraft("squad1",merged.state,{includeHeroNames:true});
    assert.equal(review.exclusive_weapons.length,5);
    assert.equal(review.exclusive_weapons.find(row=>row.hero_name==="Skyler").hero_atk_bonus,11);
    const skylerProof=merged.state.squads[0].heroes[1].scan_evidence.exclusive_weapon;
    assert.equal(skylerProof.field_confidence.hero_atk_bonus,.99);
    assert.equal(skylerProof.field_confidence.hero_def_bonus,.3);
    assert.equal(skylerProof.hero_def_bonus,undefined);
    assert.equal(skylerProof.level_confidence,.98);
    assert.equal(review.exclusive_weapons.find(row=>row.hero_name==="Skyler").field_confidence,undefined);
    const applied=applyReviewedSquad({player_id:"fixture",squads:[{id:1,heroes:[]}]},{
      squadId:1,heroes:review.squads[0].heroes,powerConfirmed:true,identityReviewConfirmed:true,
      evidence:merged.state.squads[0].heroes.map(hero=>hero.scan_evidence),updatedAt:at});
    assert.equal(applied.state.squads[0].composition_conflict.scan_evidence.heroes[1]
      .exclusive_weapon.field_confidence.hero_atk_bonus,.99);
  }
});
await test("five weapons without formation block the batch without inventing a composition",async()=>{
  let calls=0;
  await assert.rejects(()=>analyzePlayerCaptureBatch({type:"squad1",images:names,
    request:async()=>{calls++;return {response:{ok:true},json:{...mergePlayerScanBatch("squad1",names.map(name=>result({
      screen_type:"exclusive_weapon_detail",exclusive_weapons:[{hero_name:name,visible_title:`Arme — ${name}`,
        name_evidence:"visible_text",name_confidence:.95,level:1,level_confidence:.95}]}))),batch_analysis:true,capture_count:5}}}}),/Ajoute une capture/);
  assert.equal(calls,1);
});
await test("weapon belonging to absent hero remains detected-to-associate, never adds a slot",()=>{
  const foreign={screen_type:"exclusive_weapon_detail",exclusive_weapons:[{
    hero_name:"Tesla",visible_title:"Arme — Tesla",name_evidence:"visible_text",name_confidence:.98,level:30,level_confidence:.99}]};
  const merged=mergePlayerScanBatch("squad1",[result(formation()),result(foreign)]);
  assert.deepEqual(merged.state.squads[0].heroes.map(h=>h.name),names);
  assert.equal(merged.complementary_evidence.pending[0].hero_name,"Tesla");
  assert.equal(merged.state.exclusive_weapons,undefined);
});
await test("explicit player association fills only the selected unresolved slot and remains a draft",()=>{
  const original=createScanReviewDraft("squad1",result(formation(Array.from({length:5},()=>({level:155})))).state,{includeHeroNames:true});
  const proof=squadWeaponProof(weapon("Skyler",1).exclusive_weapons[0]);
  const associated=associateSquadWeaponProof(original,proof,3);
  assert.equal(original.squads[0].heroes[3].name,"");
  assert.equal(associated.squads[0].heroes[3].name,"Skyler");
  assert.equal(associated.squads[0].heroes[3].exclusive,"1");
  assert.ok(associated.squads[0].heroes.filter((_,i)=>i!==3).every(h=>!h.name));
  assert.throws(()=>associateSquadWeaponProof(associated,proof,0),/conflicting_weapon_association/);
  const dva=squadWeaponProof(weapon("DVA",28).exclusive_weapons[0]);
  assert.throws(()=>associateSquadWeaponProof(associated,dva,3),/conflicting_weapon_association/);
});
await test("squad-only six-image limit; other scan limits and payloads are unchanged",async()=>{
  assert.equal(playerScanBatchLimit("squad1"),6);
  for(const type of ["profile","drone","technology","exclusive","season","awakening"]){
    assert.equal(playerScanBatchLimit(type),3);
    await assert.rejects(()=>analyzePlayerCaptureBatch({type,images:["a","b","c","d"],request:()=>{throw new Error("must not request")}}),/1 à 3/);
  }
  await assert.rejects(()=>analyzePlayerCaptureBatch({type:"squad1",images:Array.from({length:7},(_,i)=>String(i)),request:()=>{throw new Error("must not request")}}),/1 à 6/);
  const requests=[];
  const tech=await analyzePlayerCaptureBatch({type:"technology",images:["t1","t2","t3"],request:async body=>{
    requests.push(body);return {response:{ok:true},json:{state:{technology:{branches:{research:{percent:10}}}}}};
  }});
  assert.equal(requests.length,1);assert.deepEqual(requests[0].image_data_urls,["t1","t2","t3"]);
  assert.equal(tech.state.technology.branches.research.percent,10);
});
console.log(`PASS ${checks} mixed squad capture regression checks (synthetic provider fixtures, not a live Vision benchmark)`);
