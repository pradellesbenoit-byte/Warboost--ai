import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {scanSquadId} from "../lib/player-scan-types.js";
import {scanRequestMatches} from "../lib/scan-review.js";
import {playerScanBatchLimit,analyzePlayerCaptureBatch} from "../lib/player-scan-batch.js";
import {analysisFailureMessage,scanResponseError} from "../lib/analysis-indicator.js";
import {SCAN_FAILURE_LOCALES,SCAN_FAILURE_KEYS,scanFailureCopy} from "../lib/scan-failure-copy.js";
import {freeScanCopy,manualScanDestination} from "../lib/free-scan-copy.js";
import {normalizeAllianceRole} from "../lib/alliance-activity.js";
import {confirmedCanonicalSelfRole} from "../lib/alliance-rank-management.js";
import {translator,dirFor} from "../i18n.js";

// Execute production functions and registered listeners, never a rewritten
// selection implementation. All storage, decoding and Vision are local doubles.
const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const line=source.slice(start,source.indexOf("\n",start));
  const body=line.endsWith("}")?line:source.slice(start,source.indexOf("\n}",start)+2);
  return source.slice(start-6,start)==="async "?`async ${body}`:body;
}
function listener(id,event,optional=true){
  const start=source.indexOf(`$("#${id}")${optional?"?.":"."}addEventListener("${event}",`);
  assert.ok(start>=0,`${id}/${event}`);
  // These application listeners terminate on their own line.
  const end=source.indexOf("\n});",start);
  if(source.slice(start,source.indexOf("\n",start)).endsWith(");"))
    return source.slice(start,source.indexOf("\n",start));
  return source.slice(start,end+4);
}
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(type="squad1",{injectManualFallback=false}={}){
  const nodes=new Map(),writes=[],renders=[];
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set();
      nodes.set(id,{value:"",checked:false,dataset:{},textContent:"",disabled:false,
        events:{},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),
          contains:k=>classes.has(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
        removeAttribute(k){delete this[k]},replaceChildren(){this.innerHTML=""},
        scrollIntoView(){},
        addEventListener(event,handler){this.events[event]=handler}});
    }
    return nodes.get(id);
  }
  node("scanType").value=type;node("scanType").dataset.previousType=type;
  node("scanManualFallback").classList.add("hidden");
  let owner="synthetic-owner";
  const ctx={
    $:id=>node(id.slice(1)),scanSquadId,scanRequestMatches,playerScanBatchLimit,
    scanInputRevision:0,scanFileSelectionRevision:0,scanImageData:null,
    scanImageDataList:[],scanImageNames:[],scanImageName:"capture.jpg",
    pendingScanReview:null,pendingExclusiveRequest:null,pendingExclusiveScan:[],
    pendingHeroSquadId:null,pendingHeroSuggestions:[],pendingHeroScanSlots:[],
    pendingHeroScannedAt:null,pendingHeroOwner:"",pendingExclusiveScannedAt:null,
    pendingScanRestoreInFlight:null,pendingScanRestoreOwner:"",
    loadPendingTechnologyFiles:async()=>[],loadPendingSingleScan:async()=>null,
    loadPendingRosterFiles:async()=>[],
    pendingScanOwner:()=>owner,lang:"fr",t:k=>k,esc:String,
    clearPendingSingleScan:async()=>true,clearPendingTechnologyFiles:async()=>true,
    savePendingSingleScan:async()=>{writes.push("single");return true},
    savePendingTechnologyFiles:async()=>{writes.push("technology");return true},
    beginActiveLoadingOperation:()=>()=>{},MAX_FORMATION_BATCH_LENGTH:12000000,
    imageToDataUrlLimited:async file=>file.data,
    updateScanCaptureMode:()=>ctx.updateTechnologyScanPreview(),
    createScanReviewDraft:()=>({}),state:{squads:[]},
    requireBetaAccess:()=>true,requireBetaConsent:()=>true,
    cloudSession:{access_token:"synthetic-not-a-real-token"},
    analyzePlayerCaptureBatch:async()=>null,fetchWarBoostScan:()=>{throw new Error("unexpected request")},
    scanResultHasUsefulData:()=>true,scanReviewEntries:()=>[{}],
    renderScanReview:draft=>{renders.push(draft);ctx.pendingScanReview=draft;return true},
    squadCaptureSummary:()=>"",analysisFailureMessage:()=>"synthetic-error"
  };
  ctx.manualDestinationOpened=[];
  ctx.openDrawer=target=>ctx.manualDestinationOpened.push(target);
  vm.createContext(ctx);
  for(const name of ["discardScanReviewDraft","clearScanImage","beginNewScanFileSelection",
    "scanCaptureFingerprint","scanRequestIsCurrent","updateTechnologyScanPreview",
    "requireScanSquadTarget","restorePendingScans","analyzeReviewedScan","analyzeExclusiveScan"])
    vm.runInContext(fn(name),ctx);
  if(injectManualFallback){
    ctx.freeScanCopy=freeScanCopy;ctx.manualScanDestination=manualScanDestination;
    vm.runInContext(fn("showFreeManualScanFallback"),ctx);
    vm.runInContext(fn("openFreeManualScanDestination"),ctx);
    vm.runInContext(listener("scanManualFallbackBtn","click",true),ctx);
  }
  for(const [id,event,optional] of [["scanFile","change",false],["scanType","change",true],
    ["clearScanCaptureBtn","click",true],["discardScanReviewBtn","click",true],
    ["scanImageBatchList","click",true],
    ["analyzeScanBtn","click",false]])vm.runInContext(listener(id,event,optional),ctx);
  return {ctx,node,writes,renders,setOwner:value=>owner=value,
    select:async(...data)=>node("scanFile").events.change({target:{files:data.map((d,i)=>({name:`synthetic-${i}.png`,data:d})),value:""}}),
    target:async value=>{node("scanType").value=value;await node("scanType").events.change()},
    analyze:()=>node("analyzeScanBtn").events.click({stopImmediatePropagation(){}})};
}
const missingProvider=(proof=true)=>({
  response:{ok:false,status:503},
  json:{code:"SCAN_NOT_CONFIGURED",message:"PRIVATE_PROVIDER_DIAGNOSTIC",...(proof?{quota_reserved:false}:{})}
});
for(const locale of SCAN_FAILURE_LOCALES)test(`${locale}: safe scan errors resolve in the selected language, not provider text`,()=>{
  const t=translator(locale),copy=scanFailureCopy(locale);
  assert.equal(SCAN_FAILURE_LOCALES.length,22);
  for(const key of SCAN_FAILURE_KEYS){
    assert.equal(t(key),copy[key]);assert.ok(t(key).trim());
    if(locale!=="en")assert.notEqual(t(key),scanFailureCopy("en")[key]);
  }
  assert.equal(analysisFailureMessage(scanResponseError(...Object.values(missingProvider())),t,locale),freeScanCopy(locale).apiUnavailable);
  assert.equal(analysisFailureMessage({code:"SCAN_MANUAL_ONLY",status:503},t,locale),freeScanCopy(locale).apiUnavailable);
  assert.equal(analysisFailureMessage(scanResponseError(...Object.values(missingProvider(false))),t),t("scan_error"));
  for(const [code,key] of [
    ["SCAN_REQUEST_TIMEOUT","scan_timeout"],["VISION_TIMEOUT","scan_timeout"],
    ["FREE_SCAN_QUOTA_EXCEEDED","scan_quota_refused"],["SCAN_RATE_LIMITED","scan_rate_limited"],
    ["AUTH_REQUIRED","scan_auth_required"],["AUTH_INVALID","scan_auth_required"],
    ["EMAIL_CONFIRMATION_REQUIRED","scan_email_required"],["BETA_CONSENT_REQUIRED","scan_consent_required"],
    ["PRO_REQUIRED","scan_pro_required"],["UNKNOWN","scan_error"],["constructor","scan_error"]
  ])assert.equal(analysisFailureMessage({code,message:"PRIVATE_PROVIDER_DIAGNOSTIC"},t),t(key));
  assert.equal(dirFor(locale),locale==="ar"?"rtl":"ltr");
});
for(const type of ["profile","squad1","technology"])for(const locale of ["fr","en-GB","es","ar"])
test(`real ${type} scan button opens FREE manual path in ${locale}`,async()=>{
  const h=setup(type,{injectManualFallback:true});h.ctx.t=translator(locale);h.ctx.lang=locale;
  let visionCalls=0,requests=0;
  h.ctx.analyzePlayerCaptureBatch=async()=>{visionCalls++;return null};
  h.ctx.fetchWarBoostScan=async()=>{requests++;return missingProvider()};
  await h.select("synthetic-capture");
  if(type==="squad1")h.node("scanSquadTargetConfirmed").checked=true;
  await h.analyze();
  assert.equal(h.node("scanStatus").textContent,freeScanCopy(locale).unavailable);
  assert.equal(h.node("analyzeScanBtn").disabled,false);
  assert.equal(h.renders.length,0);assert.equal(h.ctx.pendingScanReview,null);
  assert.deepEqual(plain(h.ctx.scanImageDataList),["synthetic-capture"]);
  const copy=freeScanCopy(locale),fallback=h.node("scanManualFallback"),button=h.node("scanManualFallbackBtn");
  assert.equal(fallback.classList.contains("hidden"),false);
  assert.equal(h.node("scanManualFallbackMessage").textContent,`${copy.unavailable} ${copy.manualAvailability}`);
  assert.equal(button.dataset.manualScanDestination,manualScanDestination(type));
  assert.equal(button.dataset.manualScanType,type);
  assert.equal(visionCalls,0);assert.equal(requests,0);
  assert.deepEqual(h.writes,type==="profile"?["single"]:type==="technology"?["technology"]:[]);
});
for(const locale of ["fr","en-GB","es","ar"])
test(`real exclusive scan button offers FREE manual entry in ${locale}`,async()=>{
  const h=setup("exclusive",{injectManualFallback:true});h.ctx.t=translator(locale);h.ctx.lang=locale;
  let visionCalls=0,requests=0;
  h.ctx.analyzePlayerCaptureBatch=async()=>{visionCalls++;return null};
  h.ctx.fetchWarBoostScan=async()=>{requests++;return missingProvider()};
  await h.select("synthetic-capture");
  await h.analyze();
  const copy=freeScanCopy(locale),fallback=h.node("scanManualFallback"),button=h.node("scanManualFallbackBtn");
  assert.equal(h.node("scanStatus").textContent,copy.unavailable);
  assert.equal(fallback.classList.contains("hidden"),false);
  assert.equal(h.node("scanManualFallbackMessage").textContent,`${copy.unavailable} ${copy.manualAvailability}`);
  assert.equal(button.dataset.manualScanDestination,manualScanDestination("exclusive"));
  assert.equal(button.dataset.manualScanType,"exclusive");
  await button.events.click({currentTarget:button});
  assert.deepEqual(plain(h.ctx.manualDestinationOpened),["player"]);
  assert.equal(visionCalls,0);assert.equal(requests,0);
  assert.equal(h.node("analyzeScanBtn").disabled,false);
  assert.equal(h.renders.length,0);assert.equal(h.ctx.pendingScanReview,null);
  assert.deepEqual(plain(h.ctx.scanImageDataList),["synthetic-capture"]);
  assert.deepEqual(h.writes,["single"]);
});
test("partial-batch errors stay cautious; FREE technology batch never requests paid Vision",async()=>{
  const t=translator("fr");
  for(const result of [
    missingProvider(false),
    {response:{ok:false,status:503},json:{code:"SCAN_NOT_CONFIGURED",quota_reserved:"false"}},
    {response:{ok:false,status:500},json:{code:"SCAN_NOT_CONFIGURED",quota_reserved:false}},
    {response:{ok:false,status:503},json:{code:"VISION_HTTP_ERROR",quota_reserved:false,message:"PRIVATE_PROVIDER_DIAGNOSTIC"}}
  ])assert.notEqual(analysisFailureMessage(scanResponseError(result.response,result.json),t),t("scan_unavailable_no_charge"));
  let calls=0;
  await assert.rejects(analyzePlayerCaptureBatch({type:"profile",images:["first","second"],request:async()=>{
    if(calls++===0)return {response:{ok:true,status:200},json:{state:{player:{hq_level:31}},scanned_at:"2026-10-25T00:00:00Z"}};
    return missingProvider();
  }}),error=>{
    assert.equal(error.quotaReserved,undefined);
    assert.equal(analysisFailureMessage(error,t),t("scan_error"));
    return true;
  });
  const h=setup("technology",{injectManualFallback:true});
  h.ctx.t=t;h.ctx.lang="fr";h.ctx.proFeatureAllowed=()=>false;
  let visionCalls=0,serverRequests=0;
  h.ctx.analyzePlayerCaptureBatch=async()=>{visionCalls++;return null};
  h.ctx.fetchWarBoostScan=async()=>{serverRequests++;return missingProvider()};
  await h.select("technology-capture-1","technology-capture-2");
  assert.equal(h.ctx.playerScanBatchLimit("technology"),3);
  assert.equal(h.ctx.scanImageDataList.length,2,"two images form a partial Technology batch");
  await h.analyze();
  const copy=freeScanCopy("fr");
  assert.equal(h.node("scanStatus").textContent,copy.unavailable);
  assert.equal(h.node("scanManualFallbackMessage").textContent,`${copy.unavailable} ${copy.manualAvailability}`);
  assert.equal(h.node("scanManualFallback").classList.contains("hidden"),false);
  assert.equal(h.node("scanManualFallbackBtn").dataset.manualScanDestination,"technology");
  assert.equal(visionCalls,0,"FREE scan never starts the Vision batch analyzer");
  assert.equal(serverRequests,0,"without a scan request, the server cannot reserve a scan quota or call a provider");
  assert.equal(h.ctx.pendingScanReview,null);assert.equal(h.renders.length,0);
  assert.deepEqual(h.writes,["technology"],"only the local pending capture draft is retained");
});
test("FREE profile scan offers manual entry and preserves capture without Vision",async()=>{
  for(const response of [missingProvider(false),{response:{ok:false,status:503},json:{code:"VISION_HTTP_ERROR",message:"PRIVATE_PROVIDER_DIAGNOSTIC"}}]){
    const h=setup("profile",{injectManualFallback:true});h.ctx.t=translator("fr");h.ctx.lang="fr";
    let accessChecks=0,consentChecks=0,providerCalls=0;
    h.ctx.requireBetaAccess=()=>{accessChecks++;return true};
    h.ctx.requireBetaConsent=()=>{consentChecks++;return true};
    h.ctx.analyzePlayerCaptureBatch=analyzePlayerCaptureBatch;
    h.ctx.fetchWarBoostScan=async()=>{providerCalls++;return response};
    h.ctx.state={squads:[{heroes:[{name:"ConfirmedSyntheticHero"}]}]};
    const savedBefore=plain(h.ctx.state);
    await h.select("synthetic-capture");await h.analyze();
    const copy=freeScanCopy("fr");
    assert.equal(h.node("scanStatus").textContent,copy.unavailable);
    assert.equal(h.node("scanManualFallback").classList.contains("hidden"),false);
    assert.equal(h.node("scanManualFallbackMessage").textContent,`${copy.unavailable} ${copy.manualAvailability}`);
    assert.equal(h.node("scanManualFallbackBtn").dataset.manualScanDestination,manualScanDestination("profile"));
    assert.equal(providerCalls,0,"the FREE button must not reach the provider endpoint");
    assert.equal(accessChecks,1);assert.equal(consentChecks,1);
    assert.ok(h.ctx.cloudSession.access_token,"the fixture represents an authenticated user");
    assert.equal(h.node("scanStatus").textContent.includes("PRIVATE"),false);
    assert.deepEqual(plain(h.ctx.scanImageDataList),["synthetic-capture"]);
    assert.equal(h.node("scanPreview").src,"synthetic-capture");
    assert.deepEqual(h.writes,["single"],"capture remains only as a local pending draft");
    assert.deepEqual(plain(h.ctx.state),savedBefore,"existing confirmed data is unchanged");
    assert.equal(h.ctx.pendingScanReview,null);assert.equal(h.renders.length,0);
  }
});
function installRosterRoleContext(h,role){
  const userId="synthetic-roster-manager";
  Object.assign(h.ctx,{
    normalizeAllianceRole,confirmedCanonicalSelfRole,
    state:{player_id:userId,player:{name:"Test",role,server_id:"884"},alliance:{
      cloud_role_verified:true,role,server_id:"884",tag:"ALL4",
      members:[{player_id:userId,warboost_linked:true,name:"Test",role,server_id:"884",alliance_tag:"ALL4"}]
    }},
    cloudSession:{access_token:"synthetic-not-a-real-token",user:{id:userId}}
  });
  for(const name of ["normalizedRole","allianceRoleEvidence","allianceCommandAccess",
    "hasDeclaredAllianceCommandRole","managerOnlyMessage","showAllianceRoleGuard"])
    vm.runInContext(fn(name),h.ctx);
}
test("real roster click handler offers FREE manual entry to verified R4/R5 without Vision",async()=>{
  for(const role of ["R4","R5"]){
    const h=setup("profile"),t=translator("es");h.ctx.lang="es";h.ctx.t=t;
    installRosterRoleContext(h,role);h.ctx.freeScanCopy=freeScanCopy;
    let accessChecks=0,consentChecks=0,providerCalls=0,manualFocus=0;
    h.ctx.requireBetaAccess=()=>{accessChecks++;return true};
    h.ctx.requireBetaConsent=()=>{consentChecks++;return true};
    h.ctx.rosterScanFiles=[{name:"synthetic.png",data:"synthetic-capture"}];
    h.ctx.rosterScanDraft=[];
    h.ctx.fetchWarBoostScan=async()=>{providerCalls++;return missingProvider()};
    h.node("rosterScanAddMemberBtn").focus=()=>{manualFocus++};
    assert.equal(h.ctx.allianceCommandAccess().verifiedAllowed,true);
    vm.runInContext(listener("rosterScanAnalyzeBtn","click",true),h.ctx);
    await h.node("rosterScanAnalyzeBtn").events.click();
    const expected=`${freeScanCopy("es").unavailable} ${t("roster_manual_add")}`;
    assert.equal(h.node("rosterScanStatus").textContent,expected);
    assert.equal(h.node("rosterScanStatus").classList.contains("hidden"),false);
    assert.equal(h.node("rosterScanAnalyzeBtn").disabled,false);
    assert.equal(accessChecks,1);assert.equal(consentChecks,1);
    assert.equal(manualFocus,1,"authorized manager is directed to the existing manual member editor");
    assert.equal(providerCalls,0,"free roster capture must never call the Vision endpoint");
    assert.deepEqual(plain(h.ctx.rosterScanFiles),[{name:"synthetic.png",data:"synthetic-capture"}]);
    assert.deepEqual(plain(h.ctx.rosterScanDraft),[]);
    assert.equal(h.writes.length,0,"opening free manual entry does not import or save roster changes");
  }
});
test("real roster click handler keeps FREE manual roster entry behind verified R4/R5 authorization",async()=>{
  const h=setup("profile"),t=translator("es");h.ctx.lang="es";h.ctx.t=t;
  installRosterRoleContext(h,"R3");h.ctx.freeScanCopy=freeScanCopy;
  let providerCalls=0,manualFocus=0;
  h.ctx.rosterScanFiles=[{name:"synthetic.png",data:"synthetic-capture"}];
  h.ctx.rosterScanDraft=[];
  h.ctx.fetchWarBoostScan=async()=>{providerCalls++;return missingProvider()};
  h.node("rosterScanAddMemberBtn").focus=()=>{manualFocus++};
  h.node("rosterScanStatus").querySelector=()=>null;
  assert.equal(h.ctx.allianceCommandAccess().verifiedAllowed,false);
  assert.equal(h.ctx.allianceCommandAccess().allowed,false);
  vm.runInContext(listener("rosterScanAnalyzeBtn","click",true),h.ctx);
  await h.node("rosterScanAnalyzeBtn").events.click();
  const status=h.node("rosterScanStatus");
  assert.ok(status.innerHTML.includes("R3"),"canonical R3 refusal remains visible");
  assert.equal(status.classList.contains("hidden"),false);
  assert.equal(status.innerHTML.includes(freeScanCopy("es").unavailable),false);
  assert.equal(manualFocus,0,"R3 is not offered roster management");
  assert.equal(providerCalls,0);
  assert.deepEqual(plain(h.ctx.rosterScanFiles),[{name:"synthetic.png",data:"synthetic-capture"}]);
  assert.deepEqual(plain(h.ctx.rosterScanDraft),[]);
  assert.equal(h.writes.length,0);
});

for(let squad=1;squad<=4;squad++)test(`real picker/clear/target handlers: squad ${squad}`,async()=>{
  const h=setup(`squad${squad}`);
  await h.select("image-one","image-two");
  assert.deepEqual(plain(h.ctx.scanImageDataList),["image-one","image-two"]);
  assert.equal(h.node("scanPreview").src,"image-one");
  assert.deepEqual(h.writes,[],"squad photos are not persisted by picker");
  h.node("scanSquadTargetConfirmed").checked=true;
  await h.target(`squad${squad%4+1}`);
  assert.equal(h.node("scanSquadTargetConfirmed").checked,false);
  assert.deepEqual(plain(h.ctx.scanImageDataList),["image-one","image-two"]);
  assert.match(h.node("scanImageBatchList").innerHTML,new RegExp(`squad ${squad%4+1}`));
  h.ctx.pendingScanReview={private:"synthetic-review"};
  h.node("clearScanCaptureBtn").events.click();
  assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
  assert.equal(h.node("scanFile").value,"");
  assert.equal(h.node("scanPreview").src,undefined);
  assert.equal(h.ctx.pendingScanReview,null);
  assert.equal(h.node("clearScanCaptureBtn").classList.contains("hidden"),true);
});
test("successive picker events replace selection; old decoding cannot overwrite newer files",async()=>{
  const h=setup(),gate=deferred();
  h.ctx.imageToDataUrlLimited=async file=>file.data==="old"?gate.promise:file.data;
  const old=h.select("old");await Promise.resolve();await Promise.resolve();
  await h.select("new-a","new-b");gate.resolve("old-decoded");await old;
  assert.deepEqual(plain(h.ctx.scanImageDataList),["new-a","new-b"]);
});
test("clear during decoding remains cleared after the delayed decoder returns",async()=>{
  const h=setup(),gate=deferred();h.ctx.imageToDataUrlLimited=()=>gate.promise;
  const loading=h.select("old");await Promise.resolve();await Promise.resolve();
  h.node("clearScanCaptureBtn").events.click();gate.resolve("old");await loading;
  assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
});
test("changing squad during decoding refuses a late capture attributed to the previous target",async()=>{
  const h=setup(),gate=deferred();h.ctx.imageToDataUrlLimited=()=>gate.promise;
  const loading=h.select("old");await Promise.resolve();await Promise.resolve();
  await h.target("squad2");gate.resolve("old");await loading;
  assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
});
test("changing owner during decoding refuses the previous owner's capture",async()=>{
  const h=setup(),gate=deferred();h.ctx.imageToDataUrlLimited=()=>gate.promise;
  const loading=h.select("old");await Promise.resolve();await Promise.resolve();
  h.setOwner("other-synthetic-owner");gate.resolve("old");await loading;
  assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
  assert.deepEqual(h.writes,[]);
});
test("gallery cancellation preserves the selected batch",async()=>{
  const h=setup();await h.select("one");await h.select();
  assert.deepEqual(plain(h.ctx.scanImageDataList),["one"]);
});
test("cancel review leaves captures but never saves a confirmation",async()=>{
  const h=setup();await h.select("one");h.ctx.pendingScanReview={};
  h.node("discardScanReviewBtn").events.click();
  assert.equal(h.ctx.pendingScanReview,null);assert.deepEqual(h.writes,[]);
  assert.deepEqual(plain(h.ctx.scanImageDataList),["one"]);
});
test("FREE manual fallback requires target acknowledgment and never starts Vision",async()=>{
  const h=setup("squad1",{injectManualFallback:true});h.ctx.t=translator("fr");h.ctx.lang="fr";
  await h.select("one");let calls=0,requests=0;
  h.ctx.analyzePlayerCaptureBatch=async()=>{calls++;return {state:{squads:[{heroes:[]}]}}};
  h.ctx.fetchWarBoostScan=async()=>{requests++;return missingProvider()};
  await h.analyze();assert.equal(calls,0);
  assert.equal(h.node("scanStatus").textContent,translator("fr")("scan_target_required"));
  assert.equal(h.node("scanManualFallback").classList.contains("hidden"),true);
  h.node("scanSquadTargetConfirmed").checked=true;
  await h.analyze();assert.equal(calls,0);assert.equal(requests,0);
  assert.equal(h.node("scanStatus").textContent,freeScanCopy("fr").unavailable);
  assert.equal(h.node("scanManualFallback").classList.contains("hidden"),false);
  assert.equal(h.renders.length,0);assert.deepEqual(h.writes,[]);
  assert.deepEqual(plain(h.ctx.scanImageDataList),["one"]);
});
for(const action of ["target","clear","owner","new-file"])test(`late simulated Vision response ignored after ${action}`,async()=>{
  const h=setup("squad1",{injectManualFallback:true}),gate=deferred();
  h.ctx.t=translator("fr");h.ctx.lang="fr";
  h.ctx.state={player_id:"synthetic-owner",squads:[{power:45.6,heroes:[{name:"ConfirmedHero"}]}]};
  const savedBefore=plain(h.ctx.state);
  await h.select("one");h.node("scanSquadTargetConfirmed").checked=true;
  let freeAnalyzerCalls=0,freeRequests=0,legacyRequests=0;
  h.ctx.analyzePlayerCaptureBatch=async()=>{freeAnalyzerCalls++;return null};
  h.ctx.fetchWarBoostScan=async()=>{freeRequests++;return missingProvider()};
  await h.analyze();
  assert.equal(freeAnalyzerCalls,0,"the FREE button does not start a new analysis");
  assert.equal(freeRequests,0,"the FREE button does not send a scan request");
  assert.equal(h.node("scanManualFallback").classList.contains("hidden"),false);
  assert.equal(h.node("scanStatus").textContent,freeScanCopy("fr").unavailable);

  // Model a response from a legacy request already in flight. This request is
  // local and deferred; the external-network fixture blocks any real provider.
  h.ctx.analyzePlayerCaptureBatch=analyzePlayerCaptureBatch;
  h.ctx.fetchWarBoostScan=()=>{legacyRequests++;return gate.promise};
  const loading=h.ctx.analyzeReviewedScan();
  await Promise.resolve();await Promise.resolve();
  assert.equal(legacyRequests,1,"exactly one already-started request is simulated");
  if(action==="target")await h.target("squad4");
  if(action==="clear")h.node("clearScanCaptureBtn").events.click();
  if(action==="owner")h.setOwner("other-synthetic-owner");
  if(action==="new-file")await h.select("new");
  gate.resolve({response:{ok:true,status:200},json:{
    batch_analysis:true,capture_count:1,state:{squads:[{heroes:[{name:"StaleHero"}]}]}
  }});
  await loading;
  assert.equal(legacyRequests,1,"late response does not trigger a retry");
  assert.equal(h.renders.length,0);assert.equal(h.ctx.pendingScanReview,null);
  assert.deepEqual(plain(h.ctx.state),savedBefore,"confirmed player data is unchanged");
  if(action==="clear")assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
  if(action==="owner")assert.equal(h.ctx.pendingScanOwner(),"other-synthetic-owner");
  if(action==="new-file")assert.deepEqual(plain(h.ctx.scanImageDataList),["new"]);
  if(action==="target")assert.equal(h.node("scanType").value,"squad4");
});
test("technology batch selects two captures; clear also removes the local preview",async()=>{
  const h=setup("technology");await h.select("tech-zero","tech-max");
  assert.deepEqual(h.writes,["technology"]);
  assert.deepEqual(plain(h.ctx.scanImageDataList),["tech-zero","tech-max"]);
  h.node("clearScanCaptureBtn").events.click();
  assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
});
test("actual per-image remove handler preserves the other capture then clears the last",async()=>{
  const h=setup();await h.select("first","second");
  const remove=index=>h.node("scanImageBatchList").events.click({
    target:{closest:()=>({dataset:{removeScanCapture:String(index)}})}});
  h.ctx.pendingScanReview={};
  await remove(0);
  assert.deepEqual(plain(h.ctx.scanImageDataList),["second"]);
  assert.equal(h.ctx.pendingScanReview,null);
  assert.equal(h.node("scanPreview").src,"second");
  await remove(0);
  assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
  assert.equal(h.node("scanPreview").src,undefined);
});
test("clear while pending-photo restoration is running prevents resurrection",async()=>{
  const h=setup(),gate=deferred();
  h.ctx.loadPendingTechnologyFiles=()=>gate.promise;
  h.ctx.loadPendingSingleScan=async()=>({image_data_url:"old",scan_type:"squad1"});
  const restoring=h.ctx.restorePendingScans();
  h.node("clearScanCaptureBtn").events.click();gate.resolve([]);
  const result=await restoring;
  assert.equal(result.stale,true);
  assert.deepEqual(plain(h.ctx.scanImageDataList),[]);
});
test("obsolete decoder failure cannot overwrite the current ready status",async()=>{
  const h=setup(),gate=deferred();
  h.ctx.imageToDataUrlLimited=async file=>{
    if(file.data==="old"){await gate.promise;throw new Error("synthetic-decode-failure")}
    return file.data;
  };
  const old=h.select("old");await Promise.resolve();await Promise.resolve();
  await h.select("new");gate.resolve();await old;
  assert.equal(h.node("scanStatus").textContent,"scan_ready");
  assert.deepEqual(plain(h.ctx.scanImageDataList),["new"]);
});
