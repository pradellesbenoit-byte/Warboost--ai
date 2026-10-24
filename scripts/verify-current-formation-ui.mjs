import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {playerScanBatchLimit} from "../lib/player-scan-batch.js";
import {associateSquadWeaponProof,squadWeaponProof} from "../lib/squad-capture.js";
import {applyOwnedScanReview} from "../lib/scan-review.js";
import {catalogHeroName} from "../lib/heroes.js";
import {buildPlayerScanOptions,normalizePlayerScanType,scanSquadId} from "../lib/player-scan-types.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {translator} from "../i18n.js";

const app=fs.readFileSync("app.js","utf8");
function source(name){
  const start=app.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const rest=app.slice(start),end=rest.slice(1).search(/\n(?:async )?function /);
  return end<0?rest:rest.slice(0,end+1);
}
const nodes=new Map(),handlers={};
function $(id){
  if(!nodes.has(id))nodes.set(id,{value:"",textContent:"",innerHTML:"",dataset:{},
    classList:{toggle(){},add(){},remove(){}},removeAttribute(){},
    addEventListener(event,fn){handlers[`${id}:${event}`]=fn}});
  return nodes.get(id);
}
const state={player_id:"A",squads:[{id:1,power:44.43,heroes:[{name:"DVA",level:155}]}]};
const before=JSON.stringify(state);
const context={$,$$:()=>[],t:translator("fr"),lang:"fr",esc:String,playerScanBatchLimit,scanSquadId,state,
  scanImageDataList:Array.from({length:6},(_,i)=>`image-${i}`),scanImageNames:Array.from({length:6},(_,i)=>`capture-${i}.png`),
  scanImageData:"image-0",scanImageName:"captures",scanInputRevision:0,scanFileSelectionRevision:0,
  pendingExclusiveRequest:{owner:"A"},pendingExclusiveScan:[],pendingExclusiveScannedAt:null,
  pendingScanOwner:()=>"A",discardScanReviewDraft(){context.discarded=true},
  clearPendingSingleScan:async()=>true,clearPendingTechnologyFiles:async()=>true};
$("#scanType").value="squad1";
vm.createContext(context);
vm.runInContext(source("updateTechnologyScanPreview"),context);
context.updateTechnologyScanPreview();
assert.match($("#scanImageBatchList").innerHTML,/6\/6/);
assert.equal(($("#scanImageBatchList").innerHTML.match(/data-remove-scan-capture=/g)||[]).length,6);
const listenerStart=app.indexOf('$("#scanImageBatchList")?.addEventListener("click"');
const listenerEnd=app.indexOf("\nasync function analyzeExclusiveScan",listenerStart);
vm.runInContext(app.slice(listenerStart,listenerEnd),context);
await handlers["#scanImageBatchList:click"]({target:{closest:()=>({dataset:{removeScanCapture:"2"}})}});
assert.equal(context.scanImageDataList.length,5);
assert.ok(!context.scanImageNames.includes("capture-2.png"));
assert.match($("#scanImageBatchList").innerHTML,/5\/6/);
assert.equal(context.scanInputRevision,1);
assert.equal(context.pendingExclusiveRequest,null);
assert.equal(context.discarded,true);
while(context.scanImageDataList.length)
  await handlers["#scanImageBatchList:click"]({target:{closest:()=>({dataset:{removeScanCapture:"0"}})}});
assert.match($("#scanImageBatchList").innerHTML,/0\/6/);
assert.equal(context.scanImageData,null);
assert.equal(JSON.stringify(state),before);
console.log("PASS real selection removal handler: 6/6 → 5/6 → 0/6, invalidation, unchanged confirmed profile");

const options=buildPlayerScanOptions(translator("fr"));
assert.deepEqual(options.filter(option=>/^squad/.test(option.value)).map(option=>option.value),["squad1","squad2","squad3","squad4"]);
for(const type of ["squad1","squad2","squad3","squad4"])assert.equal(normalizePlayerScanType(type),type);
console.log("PASS four squad scan targets remain distinct");

const proof=squadWeaponProof({hero_name:"Skyler",visible_title:"Lame Magique — Schuyler",name_evidence:"visible_text",
  name_confidence:.98,level:1,level_confidence:.98,weapon_name:"Lame Magique"});
const draft={owner:"A",type:"squad1",request:{owner:"A"},scannedAt:"2026-10-08T00:00:00Z",
  patch:{squads:[{heroes:Array.from({length:5},()=>({name:"",level:155})),power:44.43}]},unlinkedWeapons:[proof]};
draft.data=draft.patch;
Object.assign(context,{pendingScanReview:draft,canonicalStoredHeroName:catalogHeroName,isGenericHeroName:()=>false,
  heroDisplayName:name=>name,scanRequestIsCurrent:()=>true,associateSquadWeaponProof,applyOwnedScanReview,
  scanReviewFormEdits:()=>({edits:[{path:["squads",0,"power"],value:"45,12 M"}],issues:[]}),
  setScanReviewError(){context.error=true},renderScanReview(value){context.rendered=value;return true},
  window:{confirm:()=>true}});
for(const name of ["scanFormationSlotIdentity","scanWeaponAssociationOptions","associatePendingSquadWeapon","filterReviewedSquadWeapons"])
  vm.runInContext(source(name),context);
assert.equal(context.scanFormationSlotIdentity(draft,0),"","never use old saved DVA for an unresolved scan slot");
const card={querySelector:selector=>({value:selector.includes("weapon-slot")?"2":"Skyler"})};
assert.equal(context.associatePendingSquadWeapon({dataset:{associateWeapon:"0"},closest:()=>card}),true);
assert.equal(context.rendered.data.squads[0].heroes[2].name,"Skyler");
assert.equal(context.rendered.data.squads[0].heroes[2].exclusive,"1");
assert.equal(context.rendered.data.squads[0].power,45.12,"association retains edits made before clicking");
assert.equal(context.rendered.unlinkedWeapons.length,0);
assert.equal(JSON.stringify(state),before,"association is only a draft, not a profile save");
context.scanRequestIsCurrent=()=>false;context.rendered=null;
assert.equal(context.associatePendingSquadWeapon({dataset:{associateWeapon:"0"},closest:()=>card}),false);
assert.equal(context.rendered,null);
console.log("PASS real association handler: explicit identity, preserved edits, no legacy names, no save, stale request blocked");

context.buildScanReviewGroups=buildScanReviewGroups;
vm.runInContext(source("scanReviewTranslator"),context);
vm.runInContext(source("scanReviewGroupsWithWeapons"),context);
const groups=context.scanReviewGroupsWithWeapons(draft),markup=renderScanReviewMarkup(groups,context.scanReviewTranslator("squad1"),String);
assert.match(markup.html,/Escouade 1/);
assert.doesNotMatch(markup.html,/Escouade [234]/);
assert.ok(markup.rows.some(row=>row.path[0]==="exclusive_weapons"&&row.field==="level"));
assert.ok(!markup.rows.some(row=>row.path[0]==="exclusive_weapons"&&/power/.test(row.field)));
assert.ok(!markup.rows.some(row=>row.path.includes("heroes")&&row.field==="power"));
assert.ok(groups.find(group=>group.kind==="hero"&&group.number===3).rows.some(row=>row.path[0]==="exclusive_weapons"));
const filtered=context.filterReviewedSquadWeapons(draft.data.squads[0].heroes,[{hero_name:"Schuyler",level:1},{hero_name:"Tesla",level:30}]);
assert.equal(filtered.length,1);assert.equal(filtered[0].hero_name,"Skyler");
console.log("PASS single formation sheet, per-hero weapon data and exclusion of foreign weapon identities");
