import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {mergePlayerScanBatch,analyzePlayerCaptureBatch} from "../lib/player-scan-batch.js";
import {buildGlobalDiagnostic,resolveDiagnosticState} from "../lib/player-global-diagnostic.js";
import {renderGlobalDiagnostic} from "../lib/player-global-diagnostic-ui.js";
import {buildDiagnosticShop} from "../lib/diagnostic-shop.js";
import {renderDiagnosticShop} from "../lib/diagnostic-shop-ui.js";
import {createScanReviewDraft,scanReviewEntries,applyOwnedScanReview,scanRequestMatches} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {sanitizeDroneScan} from "../lib/drone-scan.js";
import {mergeKnownResources,mergeDroneFacts} from "../lib/player-known-facts.js";
import {normalizeState} from "../lib/normalize.js";
import {playerAdviceInputSignature} from "../lib/player-advice-signature.js";

const old="2020-01-01T00:00:00Z",now=new Date().toISOString();
const confirmed=(values,at=now)=>({...values,source:"confirmed_scan",updated_at:at,
  field_updated_at:Object.fromEntries(Object.keys(values).map(k=>[k,at])),
  field_source:Object.fromEntries(Object.keys(values).map(k=>[k,"confirmed_scan"]))});
const result=state=>({state,scanned_at:now});
let batch=mergePlayerScanBatch("drone",[result({drone:confirmed({level:140})}),result({drone:confirmed({boostCombat:{level:400}})})]);
assert.equal(batch.state.drone.level,140);assert.equal(batch.state.drone.boostCombat.level,400);
batch=mergePlayerScanBatch("drone",[result({drone:confirmed({power_m:8})}),result({drone:confirmed({power_m:4},old)})]);
assert.equal(batch.state.drone.power_m,8,"older field evidence never wins");
batch=mergePlayerScanBatch("drone",[result({drone:{level:140}}),result({drone:{level:99,field_confidence:{level:0.2}}})]);
assert.equal(batch.state.drone.level,140,"uncertain fields do not replace readable observations");
const names=["Kimberly","Murphy","Williams","Marshall","Mason"];
const heroes=names.map(name=>({name,level:100}));
batch=mergePlayerScanBatch("squad2",[result({squads:[null,{heroes}]}),result({squads:[null,{heroes:[{name:"Marshall",stars:4},{name:"Kimberly",power:2_000_000}]}]})]);
assert.equal(batch.state.squads[1].heroes.length,5);assert.equal(batch.state.squads[1].heroes[0].name,"Kimberly");
assert.equal(batch.state.squads[1].heroes[0].power,2_000_000);assert.equal(batch.state.squads[1].heroes[3].stars,4);
assert.throws(()=>mergePlayerScanBatch("squad2",[result({squads:[null,{heroes}]}),result({squads:[null,{heroes:[{name:"DVA"}]}]})]),/même escouade/);
batch=mergePlayerScanBatch("exclusive",[result({exclusive_weapons:[{hero_name:"Kimberly",level:10}]}),result({exclusive_weapons:[{hero_name:"Kimberly",power:2_000_000}]})]);
assert.equal(batch.state.exclusive_weapons.length,1);assert.equal(batch.state.exclusive_weapons[0].level,10);
batch=mergePlayerScanBatch("shop",[result({shop:{offers:[{item_name:"Test fragment",store:"A",price:5}]}}),result({shop:{offers:[{item_name:"Test fragment",store:"A",quantity:10}]}})]);
assert.equal(batch.state.shop.offers.length,1);assert.equal(batch.state.shop.offers[0].price,5);
let calls=0;
const request=async()=>{calls++;return {response:{ok:true},json:result({player:{hq_level:25}})}};
await analyzePlayerCaptureBatch({type:"profile",images:["same","same"],request});assert.equal(calls,1,"identical captures incur one request");
let current=true;
assert.equal(await analyzePlayerCaptureBatch({type:"profile",images:["one","two"],isCurrent:()=>current,
  request:async()=>{current=false;return request()}}),null,"changed account/capture cancels all results");
await assert.rejects(()=>analyzePlayerCaptureBatch({type:"profile",images:["one","two"],request:async({image_data_url})=>image_data_url==="two"?{response:{ok:false},json:{error:"provider_failure"}}:request()}),/provider_failure/,"partial failures never confirm a partial batch");
const review=createScanReviewDraft("squad1",{squads:[{heroes}]},{includeHeroNames:true});
assert.equal(scanReviewEntries(review).filter(e=>e.path.at(-1)==="name").length,5);
assert.equal(buildScanReviewGroups("squad1",review).flatMap(g=>g.rows).filter(r=>r.field==="name").length,5,"all five identities visible in the same editable review");
const unknownNames=createScanReviewDraft("squad1",{squads:[{heroes:[{level:100}]}]},{includeHeroNames:true});
assert.equal(buildScanReviewGroups("squad1",unknownNames).flatMap(g=>g.rows).filter(r=>r.field==="name").length,5,"unreadable names remain manually correctable without a second confirmation");
assert.equal(applyOwnedScanReview({owner:"A",patch:review},"B",[]),null);
assert.equal(scanRequestMatches({owner:"A",scanType:"profile",imageFingerprint:"x",revision:1},{owner:"B",scanType:"profile",imageFingerprint:"x",revision:1}),false);
const state={player_id:"fixture-A",player:{hq_level:25},squads:[{heroes:[{name:"Kimberly",...confirmed({level:150,power:3_000_000})}]}],
  hero_profiles:[{hero_name:"Kimberly",...confirmed({level:100,power:1_000_000},old)}],
  drone:confirmed({level:140,boostCombat:{level:400},components:[{name:"Test component",level:8}]}),
  technology:{branches:{unit:{name:"Test branch",state:"percent",percent:30}}},
  resources:confirmed({diamonds:100}),shop:{updated_at:now,offers:[{item_name:"Test fragment",price:5,currency:"diamonds"}]},
  progression_snapshots:[{at:old,hero_powers:[{hero_name:"Kimberly",power:1_000_000}]}]};
const resolved=resolveDiagnosticState(state);assert.equal(resolved.squads[0].heroes[0].level,150);
assert.equal(resolved.squads[0].heroes[0].power,3_000_000);
assert.equal(resolveDiagnosticState({...state,hero_profiles:[{hero_name:"Kimberly",...confirmed({power:0})}]}).squads[0].heroes[0].power,3_000_000,"zero power remains unknown, not a destructive replacement");
let diagnostic=buildGlobalDiagnostic(state,{priorities:[{kind:"level",hero:"Kimberly",target:"Kimberly",title:"Test level",action:"Check level",reason:"Test reason",next_target:"Lv.151"}],shop:{recommendations:[{item:"Test fragment",verdict_key:"buy_now"}]}},"fr");
assert(diagnostic.priorities.length<=3);assert.equal(diagnostic.seven_days.length,7);
assert.match(diagnostic.priorities[0].impact,/déjà observée/);assert.equal(diagnostic.purchases.length,1);
assert.equal(buildGlobalDiagnostic({...state,resources:{},shop:{offers:state.shop.offers}},{shop:{recommendations:[{item:"Test fragment",verdict_key:"buy_now"}]}}).purchases.length,0);
assert.equal(buildGlobalDiagnostic({...state,shop:{updated_at:old,offers:state.shop.offers}},{shop:{recommendations:[{item:"Test fragment",verdict_key:"buy_now"}]}}).purchases.length,0);
assert.equal(buildGlobalDiagnostic({...state,resources:confirmed({diamonds:100},old)},{shop:{recommendations:[{item:"Test fragment",verdict_key:"buy_now"}]}}).purchases.length,0,"old stocks do not fund a current purchase");
const empty=buildGlobalDiagnostic({});assert.equal(empty.purchases.length,0);assert(empty.missing.some(x=>/Stocks/.test(x)));
const persisted=normalizeState(JSON.parse(JSON.stringify(state)));
assert.equal(persisted.drone.components[0].level,8);assert.equal(persisted.resources.diamonds,100);
assert.equal(buildGlobalDiagnostic(persisted).inputs.hq,25);
assert.notEqual(playerAdviceInputSignature(state),playerAdviceInputSignature({...state,player_id:"fixture-B"}));
assert.notEqual(playerAdviceInputSignature(state),playerAdviceInputSignature({...state,resources:{diamonds:99}}));
assert.equal(mergeKnownResources(confirmed({diamonds:100}),confirmed({diamonds:30},old)).diamonds,100);
assert.equal(mergeDroneFacts({boostCombat:confirmed({level:400})},{boostCombat:confirmed({level:200},old)}).boostCombat.level,400);
const extracted={screen_type:"components",drone:{components:[{name:"Test component",level:8,confidence:0.95,evidence:"visible_same_card"}]}};
assert.equal(sanitizeDroneScan(extracted,now).drone.components[0].level,8);
assert.equal(sanitizeDroneScan({...extracted,drone:{components:[{name:"Test component",level:8,evidence:"visible_same_card"}]}},now).drone.components,undefined);
assert.equal(sanitizeDroneScan(extracted,now).drone.level,undefined);
const html=renderGlobalDiagnostic({...diagnostic,priorities:[{title:'<img src=x onerror="boom">',action:"Do it",why:"<script>",impact:"Unknown"}]});
assert(!html.includes("<script>"));assert(!html.includes("<img src=x"));assert(html.includes("&lt;img"));
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
assert.match(app,/baseReview!==undefined/,"concurrent newer confirmations block old reviews");
assert.match(app,/pendingExclusiveRequest\|\|!scanRequestIsCurrent/,"exclusive confirmation is account/capture bound");
assert.match(app,/reconcileConfirmedSquad\(merged/,"hero identity and stats finalized in the same confirmation");
function functionSource(name){
  const start=app.indexOf(`function ${name}(`),open=app.indexOf("){",start)+1;let depth=0;
  for(let i=open;i<app.length;i++){if(app[i]==="{")depth++;if(app[i]==="}"&&!--depth)return app.slice(start,i+1)}
  throw new Error(`function_missing:${name}`);
}
const nodes=new Map(),node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:"A-file.png",innerHTML:"A-file.png",textContent:"Analyzing…",disabled:true,open:true,
    dataset:{scanReviewStatusKey:"old"},style:{removeProperty(key){delete this[key]}},
    classList:{add(){},remove(){},toggle(){}},removeAttribute(){}});
  return nodes.get(id);
};
const context={$:node,t:k=>k,lang:"fr",scanInputRevision:0,scanFileSelectionRevision:0,pendingExclusiveRequest:{owner:"A"},
  discardScanReviewDraft(){},renderRosterScanFiles(){},renderRosterScanDraft(){},scanImageData:"A-image",scanImageDataList:["A-image"],scanImageName:"A-file.png",
  pendingHeroSquadId:1,pendingHeroSuggestions:[],pendingHeroScanSlots:[],pendingHeroScannedAt:now,pendingHeroOwner:"A",
  rosterScanFiles:[],rosterScanDraft:[],pendingExclusiveScan:[],pendingExclusiveScannedAt:now,
  PLAYER_SCAN_BATCH_LIMIT:3,esc:String,aiUsesNativeCopy:()=>true,aiUiText:()=>({}),currentPlayerAdviceAnalysis:null,
  activeAcquisitionShopView:null,renderTechnologyAdvicePanel(){},renderGlobalDiagnostic,
  state,buildDiagnosticShop,renderDiagnosticShop,
  diagnosticDisclosures:{capture(){},restore(){}}};
vm.runInNewContext(`${functionSource("updateTechnologyScanPreview")}\n${functionSource("resetPendingScanUi")}\n${functionSource("renderProPriority")}\nresetPendingScanUi();renderProPriority({global_diagnostic:${JSON.stringify(diagnostic)}});`,context);
assert.equal(node("#scanImageBatchList").innerHTML,"","actual account-reset handler removes foreign filenames");
assert.equal(node("#scanStatus").textContent,"scan_wait","actual handler clears stale progress");
assert.equal(node("#analyzeScanBtn").disabled,false);
assert.equal(context.pendingExclusiveRequest,null);
for(const id of ["#proExclusiveCompareDetails","#proMetaSourcesDetails","#proShopDetails"]){
  assert.equal(node(id).style.display,"none","actual global renderer hides legacy wrapper summaries");
  assert.equal(node(id).open,false);
}
console.log("Player batch merging, deduplication, freshness, uncertainty, review, diagnostics, reopen and isolation passed.");