import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {translator} from "../i18n.js";
import {buildPlayerScanOptions,normalizePlayerScanType,scanSquadId} from "../lib/player-scan-types.js";
import {sanitize,usefulState} from "../api/scan.js";
import {createScanReviewDraft,scanReviewEntries,applyOwnedScanReview,scanRequestMatches} from "../lib/scan-review.js";
import {applyReviewedSquad} from "../lib/squad-scan-review.js";
import {reconcileConfirmedSquad,repairLegacySquadIdentity} from "../lib/squad-identity.js";
import {confirmedSquadHints} from "../lib/squad-scan-evidence.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {stampConfirmedRecord} from "../lib/field-freshness.js";
import {confirmedHeroPower} from "../lib/hero-power.js";
import {reviewedSquadPower} from "../lib/squad-scan-review.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";
import {associateSquadWeaponProof} from "../lib/squad-capture.js";
import {catalogHeroName} from "../lib/heroes.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {buildGlobalDiagnostic} from "../lib/player-global-diagnostic.js";

// Actual parsing/review/confirmation modules, synthetic Vision observations.
// DOM stubs exercise production target/weapon helpers; no account or cloud write.
const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const at="2026-10-11T11:00:00.000Z",later="2026-10-11T12:00:00.000Z";
const clone=value=>JSON.parse(JSON.stringify(value));
const teams=[
  ["Murphy","Williams","Kimberly","Marshall","Stetmann"],
  ["DVA","Carlie","Lucius","Skyler","Morrison"],
  ["Tesla","Adam","Fiona","Swift","McGregor"],
  ["Mason","Violet","Scarlett","Sarah","Venom"]
];
const initial=()=>normalizeState({player_id:"test-owner",player:{name:"Test",hq_level:35},
  squads:[1,2,3,4].map(id=>({id,heroes:[]})),technology:{hero_tech_pct:12}});
const raw=(id,names=teams[id-1],power=40+id)=>({screen_type:"formation_details",squads:[{
  // Deliberately misleading source id: only the player's target controls routing.
  id:1,power,heroes:names.map(name=>({name_text:name,name_evidence:"visible_text",name_confidence:.98,
    level:150+id,stars:5,equipment:{pieces:[0,1,2,3].map(slot=>({
      slot_index:slot,visible:true,visibility_confidence:.99,level:40,level_confidence:.99,
      level_evidence:"visible_equipment_label"
    }))}}))
}]});
let checks=0;
function test(label,run){run();checks++;console.log(`PASS ${label}`)}
function confirmedBase(){
  let state=initial();
  for(let id=1;id<=4;id++)state=reconcileConfirmedSquad(state,{squadId:id,names:teams[id-1],updatedAt:at}).state;
  return state;
}
function review(state,id,observation=raw(id),time=later){
  const parsed=sanitize(observation,time,`squad${id}`);
  assert.ok(usefulState(parsed,`squad${id}`));
  const patch=createScanReviewDraft(`squad${id}`,parsed,{includeHeroNames:true});
  assert.deepEqual(Object.keys(patch.squads),[String(id-1)]);
  const edits=scanReviewEntries(patch).map(row=>({path:row.path,value:row.value}));
  const result=applyOwnedScanReview({owner:"test-owner",patch},"test-owner",edits);
  assert.deepEqual(result.errors,[]);
  const working=clone(state);
  working.squads[id-1].power=result.patch.squads[id-1].power;
  const applied=applyReviewedSquad(working,{squadId:id,heroes:result.patch.squads[id-1].heroes,
    updatedAt:time,identityReviewConfirmed:true,powerConfirmed:true});
  return {state:applied.state,parsed};
}

test("four distinct labels and types; unavailable choices never become Squad 1",()=>{
  const options=buildPlayerScanOptions(translator("fr"));
  for(let id=1;id<=4;id++){
    assert.equal(options.find(row=>row.value===`squad${id}`).label,`Escouade ${id}`);
    assert.equal(normalizePlayerScanType(`squad${id}`,options),`squad${id}`);
    assert.equal(scanSquadId(`squad${id}`),id);
  }
  assert.equal(normalizePlayerScanType("squad4",options.filter(row=>row.value!=="squad4")),"profile");
  assert.equal(scanSquadId("Formation actuelle"),null);
  assert.equal(scanSquadId("squad0"),null);
});

for(let id=1;id<=4;id++)test(`Squad ${id}: parsing, review, equipment, save/reload and hints stay isolated`,()=>{
  const base=confirmedBase(),before=clone(base),result=review(base,id);
  assert.deepEqual(base,before,"input is never mutated");
  for(let other=1;other<=4;other++)if(other!==id)
    assert.deepEqual(result.state.squads[other-1],base.squads[other-1],"other confirmed squads remain byte-for-byte identical");
  assert.equal(result.state.squads[id-1].power,40+id);
  assert.deepEqual(result.state.squads[id-1].heroes.map(h=>h.name),teams[id-1]);
  assert.ok(result.state.squads[id-1].heroes.every(h=>h.level===150+id&&h.stars===5&&h.gear));
  const storage=JSON.stringify(result.state),reopened=normalizeState(JSON.parse(storage));
  const restored=reconcileCloudSquads(reopened,base,base).state;
  assert.deepEqual(restored.squads[id-1].heroes.map(h=>h.name),teams[id-1]);
  assert.equal(restored.squads[id-1].power,40+id);
  assert.deepEqual(confirmedSquadHints(restored,id,"test-owner"),teams[id-1]);
  assert.deepEqual(result.state.technology,base.technology);
});

test("successive scans and corrected values in Squad 2 leave all other squads intact",()=>{
  const base=confirmedBase(),first=review(base,2).state;
  const second=review(first,2,raw(2,teams[1],49),"2026-10-11T13:00:00.000Z").state;
  assert.equal(second.squads[1].power,49);
  for(const index of [0,2,3])assert.deepEqual(second.squads[index],base.squads[index]);
  const diagnostic=buildGlobalDiagnostic(second,{now:later});
  assert.ok(diagnostic,"the real diagnostic accepts all four independently stored squads");
  assert.equal(diagnostic.inputs.heroes.find(hero=>hero.name==="DVA").level,152);
  assert.equal(diagnostic.inputs.heroes.find(hero=>hero.name==="Murphy").level,base.squads[0].heroes[0].level);
  assert.equal(second.squads[0].power,base.squads[0].power);
});

for(let id=1;id<=4;id++)test(`Squad ${id}: partial confirmations, stale import and reload preserve all four squads`,()=>{
  let base=confirmedBase();
  for(let target=1;target<=4;target++)base=review(base,target).state;
  const before=clone(base),hero=base.squads[id-1].heroes[0];
  const partial=applyReviewedSquad(base,{squadId:id,updatedAt:"2026-10-11T13:00:00.000Z",
    heroes:[{name:hero.name,level:170},{level:199,exclusive:99}],identityReviewConfirmed:true});
  assert.equal(partial.complete,false);
  assert.equal(partial.state.squads[id-1].heroes[0].level,170);
  assert.deepEqual(partial.state.squads[id-1].heroes[0].gear,hero.gear);
  assert.equal(partial.state.squads[id-1].power,before.squads[id-1].power);
  assert.deepEqual(partial.state.squads[id-1].confirmed_composition,before.squads[id-1].confirmed_composition);
  assert.deepEqual(partial.state.squads[id-1].heroes[1],before.squads[id-1].heroes[1],
    "unidentified partial slot cannot modify an existing hero");
  const stale=applyReviewedSquad(partial.state,{squadId:id,updatedAt:"2026-09-01T00:00:00.000Z",
    heroes:[{name:hero.name,level:10}],identityReviewConfirmed:true});
  for(let other=1;other<=4;other++)if(other!==id)
    assert.deepEqual(stale.state.squads[other-1],before.squads[other-1]);
  const reopened=normalizeState(JSON.parse(JSON.stringify(stale.state)));
  assert.equal(reopened.squads[id-1].heroes[0].level,170);
  assert.deepEqual(reopened.squads[id-1].heroes[0].gear,hero.gear);
  for(let other=1;other<=4;other++)if(other!==id)
    assert.deepEqual(reopened.squads[other-1],normalizeState(before).squads[other-1],
      "compare the same reload normalization, including removal of absent source metadata");
  assert.deepEqual(reopened.technology,before.technology);
  assert.deepEqual(base,before,"confirmed source was not mutated");
});

test("legacy current-formation data is not reassigned; empty scans do not inject names",()=>{
  const legacy=initial();
  legacy.squads[0].heroes=teams[0].map(name=>({name,level:155}));
  const before=clone(legacy);
  assert.deepEqual(confirmedSquadHints(legacy,1,"test-owner"),[]);
  const ambiguous=sanitize(raw(2,Array(5).fill("")),later,"squad2");
  assert.ok(ambiguous.squads[1].heroes.every(h=>!h.name));
  assert.deepEqual(legacy,before);
  const draft=createScanReviewDraft("squad1",before,{includeHeroNames:true});
  assert.ok(draft.squads[0],"historical explicit Squad 1 remains in its original slot");
  assert.equal(draft.squads[1],undefined);
});

test("explicit weapon association preserves sparse target indexes 1..4",()=>{
  for(let id=1;id<=4;id++){
    const patch={squads:[]};patch.squads[id-1]={heroes:[{name:"DVA"}]};
    const associated=associateSquadWeaponProof(patch,{hero_name:"DVA",level:28},0,{squadId:id});
    assert.equal(associated.squads[id-1].heroes[0].exclusive,"28");
    assert.deepEqual(Object.keys(associated.squads),Object.keys(clone(patch).squads));
    if(id!==1)assert.equal(associated.squads[0],null);
    assert.throws(()=>associateSquadWeaponProof(patch,{hero_name:"Skyler",level:1},0,{squadId:id}),/conflicting/);
  }
});

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const firstLine=source.slice(start,source.indexOf("\n",start));
  return firstLine.endsWith("}")?firstLine:source.slice(start,source.indexOf("\n}",start)+2);
}
test("production review helpers use the chosen squad for identities and weapon bonus rows",()=>{
  const ctx={scanSquadId,canonicalStoredHeroName:catalogHeroName,isGenericHeroName:()=>false,
    buildScanReviewGroups,t:translator("fr"),lang:"fr"};
  vm.createContext(ctx);
  vm.runInContext(["scanFormationSlotIdentity","scanWeaponAssociationOptions","scanReviewGroupsWithWeapons","scanReviewTranslator"].map(fn).join("\n"),ctx);
  for(let id=1;id<=4;id++){
    const data={squads:[],exclusive_weapons:[{hero_name:"DVA",weapon_name:"Lame de Frappe",level:28}]};
    data.squads[id-1]={heroes:[{name:"DVA",exclusive:"28"}]};
    const draft={type:`squad${id}`,patch:data};
    assert.equal(ctx.scanFormationSlotIdentity(draft,0),"DVA");
    assert.equal(ctx.scanReviewTranslator(draft.type)("scan_review_squad_heading"),`Escouade ${id}`);
    const groups=ctx.scanReviewGroupsWithWeapons(draft);
    assert.ok(groups.some(group=>group.rows.some(row=>row.path[0]==="exclusive_weapons"&&row.field==="weapon_name")));
  }
});

test("production target guard blocks unacknowledged legacy/default choice and stale responses",()=>{
  const controls={scanType:{value:"squad2"},scanSquadTargetConfirmed:{checked:false},scanStatus:{}};
  const ctx={$:selector=>controls[selector.slice(1)],scanSquadId,lang:"fr",t:translator("fr"),scanRequestMatches,
    pendingScanOwner:()=>"test-owner",scanCaptureFingerprint:()=>"capture",scanInputRevision:7};
  vm.createContext(ctx);
  vm.runInContext(fn("requireScanSquadTarget")+"\n"+fn("scanRequestIsCurrent"),ctx);
  const request={owner:"test-owner",scanType:"squad2",imageFingerprint:"capture",revision:7};
  assert.equal(ctx.requireScanSquadTarget("squad2"),false);
  assert.equal(ctx.scanRequestIsCurrent(request),false);
  controls.scanSquadTargetConfirmed.checked=true;
  assert.equal(ctx.scanRequestIsCurrent(request),true);
  controls.scanType.value="squad3";
  assert.equal(ctx.scanRequestIsCurrent(request),false);
  assert.equal(ctx.requireScanSquadTarget("technology"),true);
});

test("production squad-change handler keeps images, clears old review and invalidates the request",()=>{
  const selector={value:"squad3",dataset:{previousType:"squad2"},addEventListener:(_,callback)=>{ctx.change=callback}};
  const controls={scanType:selector,scanSquadTargetConfirmed:{checked:true},scanStatus:{}};
  const ctx={$:id=>controls[id.slice(1)],scanSquadId,scanInputRevision:10,lang:"fr",t:translator("fr"),
    scanImageDataList:["image-a","image-b"],pendingScanReview:{type:"squad2"},pendingHeroSquadId:2,
    discardScanReviewDraft:()=>{ctx.pendingScanReview=null},clearScanImage:()=>{throw new Error("squad retarget must keep captures")},
    updateScanCaptureMode:()=>{}};
  vm.createContext(ctx);
  const start=source.indexOf('$("#scanType")?.addEventListener("change",()=>{');
  vm.runInContext(source.slice(start,source.indexOf("\n});",start)+4),ctx);
  ctx.change();
  assert.equal(ctx.scanInputRevision,11);
  assert.equal(ctx.pendingScanReview,null);
  assert.equal(controls.scanSquadTargetConfirmed.checked,false);
  assert.deepEqual(ctx.scanImageDataList,["image-a","image-b"]);
  assert.equal(selector.dataset.previousType,"squad3");
});

for(let id=1;id<=4;id++)test(`production confirm handler saves only Squad ${id} in isolated storage`,()=>{
  const base=normalizeState(confirmedBase()),parsed=sanitize(raw(id),later,`squad${id}`);
  const patch=createScanReviewDraft(`squad${id}`,parsed,{includeHeroNames:true});
  const draft={owner:"test-owner",type:`squad${id}`,request:{},patch,scannedAt:later};
  let storage=null;
  const ctx={
    state:clone(base),pendingScanReview:draft,pendingScanOwner:()=>"test-owner",
    requireScanSquadTarget:()=>true,scanRequestIsCurrent:()=>true,
    scanReviewFormEdits:()=>({edits:scanReviewEntries(patch).map(row=>({path:row.path,value:row.value})),issues:[]}),
    applyOwnedScanReview,createScanReviewDraft,stampConfirmedRecord,confirmedHeroPower,reviewedSquadPower,
    applyReviewedSquad,repairLegacySquadIdentity,canonicalStoredHeroName:catalogHeroName,safeClone:clone,
    // Real generic merge module; profile/cloud writer intentionally replaced.
    mergeStateProtected:(a,b)=>mergeNewest(a,b),
    saveState:()=>{storage=JSON.stringify(ctx.state);return true},
    recordProgressionSnapshot:()=>{},updateSquadCaptureHelp:()=>{},filterReviewedSquadWeapons:()=>[],
    discardScanReviewDraft:()=>{ctx.pendingScanReview=null},invalidatePlayerAdvice:()=>{},
    showSquadScanStatus:()=>{},$:()=>null,lang:"fr",t:key=>key
  };
  vm.createContext(ctx);
  vm.runInContext(fn("confirmScanReview"),ctx);
  ctx.confirmScanReview();
  assert.ok(storage,"save must occur");
  const reopened=normalizeState(JSON.parse(storage));
  assert.equal(reopened.squads[id-1].power,40+id);
  assert.deepEqual(reopened.squads[id-1].heroes.map(hero=>hero.name),teams[id-1]);
  for(let other=1;other<=4;other++)if(other!==id){
    assert.deepEqual(reopened.squads[other-1].confirmed_composition,base.squads[other-1].confirmed_composition);
    assert.equal(reopened.squads[other-1].power,base.squads[other-1].power);
    assert.deepEqual(reopened.squads[other-1].heroes,base.squads[other-1].heroes);
  }
  assert.equal(ctx.pendingScanReview,null);
  // A failed local write must restore the previous four squads and leave
  // review available. Never show a successful confirmation on quota failure.
  ctx.state=clone(base);ctx.pendingScanReview=draft;
  ctx.saveState=()=>false;
  ctx.confirmScanReview();
  assert.deepEqual(ctx.state,base,"storage failure rolls back the entire tentative merge");
  assert.equal(ctx.pendingScanReview,draft,"failed save retains review for correction");
  // Real handler rejects late/stale review before touching storage.
  ctx.saveState=()=>{throw new Error("stale review must never save")};
  ctx.scanRequestIsCurrent=()=>false;
  ctx.confirmScanReview();
  assert.equal(ctx.pendingScanReview,null);
  assert.deepEqual(ctx.state,base);
});
console.log(`PASS ${checks} squad target checks (synthetic OCR; isolated DOM/storage; no live account writes)`);
