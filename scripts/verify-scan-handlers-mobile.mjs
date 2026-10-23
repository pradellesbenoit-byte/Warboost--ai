import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {scanSquadId} from "../lib/player-scan-types.js";
import {scanRequestMatches} from "../lib/scan-review.js";
import {playerScanBatchLimit} from "../lib/player-scan-batch.js";

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
function setup(type="squad1"){
  const nodes=new Map(),writes=[],renders=[];
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set();
      nodes.set(id,{value:"",checked:false,dataset:{},textContent:"",disabled:false,
        events:{},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),
          contains:k=>classes.has(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
        removeAttribute(k){delete this[k]},replaceChildren(){this.innerHTML=""},
        addEventListener(event,handler){this.events[event]=handler}});
    }
    return nodes.get(id);
  }
  node("scanType").value=type;node("scanType").dataset.previousType=type;
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
  vm.createContext(ctx);
  for(const name of ["discardScanReviewDraft","clearScanImage","beginNewScanFileSelection",
    "scanCaptureFingerprint","scanRequestIsCurrent","updateTechnologyScanPreview",
    "requireScanSquadTarget","restorePendingScans","analyzeReviewedScan"])
    vm.runInContext(fn(name),ctx);
  for(const [id,event,optional] of [["scanFile","change",false],["scanType","change",true],
    ["clearScanCaptureBtn","click",true],["discardScanReviewBtn","click",true],
    ["scanImageBatchList","click",true],
    ["analyzeScanBtn","click",false]])vm.runInContext(listener(id,event,optional),ctx);
  return {ctx,node,writes,renders,setOwner:value=>owner=value,
    select:async(...data)=>node("scanFile").events.change({target:{files:data.map((d,i)=>({name:`synthetic-${i}.png`,data:d})),value:""}}),
    target:async value=>{node("scanType").value=value;await node("scanType").events.change()},
    analyze:()=>node("analyzeScanBtn").events.click({stopImmediatePropagation(){}})};
}

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
test("analyze requires target acknowledgment and only stages a review",async()=>{
  const h=setup();await h.select("one");let calls=0;
  h.ctx.analyzePlayerCaptureBatch=async()=>{calls++;return {state:{squads:[{heroes:[]}]}}};
  await h.analyze();assert.equal(calls,0);
  h.node("scanSquadTargetConfirmed").checked=true;
  await h.analyze();assert.equal(calls,1);assert.equal(h.renders.length,1);
  assert.deepEqual(h.writes,[]);
});
for(const action of ["target","clear","owner","new-file"])test(`late Vision response ignored after ${action}`,async()=>{
  const h=setup(),gate=deferred();await h.select("one");
  h.node("scanSquadTargetConfirmed").checked=true;
  h.ctx.analyzePlayerCaptureBatch=()=>gate.promise;
  const loading=h.analyze();
  if(action==="target")await h.target("squad4");
  if(action==="clear")h.node("clearScanCaptureBtn").events.click();
  if(action==="owner")h.setOwner("other-synthetic-owner");
  if(action==="new-file")await h.select("new");
  gate.resolve({state:{squads:[{heroes:[]}]}});await loading;
  assert.equal(h.renders.length,0);assert.equal(h.ctx.pendingScanReview,null);
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
