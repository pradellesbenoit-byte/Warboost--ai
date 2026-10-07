import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createFreshLaunchController} from "../lib/fresh-launch.js";
import {createReturnViewController,RETURN_VIEW_STORAGE_KEY} from "../lib/return-view.js";
import * as pending from "../lib/pending-scan-storage.js";
import {applyReviewedSquad} from "../lib/squad-scan-review.js";
import {translator} from "../i18n.js";

let count=0;
async function test(name,run){await run();count++;console.log(`PASS ${name}`)}
const app=fs.readFileSync("app.js","utf8");
const image="data:image/png;base64,aGVsbG8=",owner="fixture-user";
const names=["Kimberly","Murphy","Marshall","DVA","Stetmann"];
const profile={player_id:owner,player:{name:"Fixture",hq_level:31,role:"R5"},alliance:{role:"R5",cloud_role_verified:true},
  squads:[{power:44.43,power_sync_status:"confirmed",confirmed_composition:names,composition_confirmed_at:"2026-10-07T00:00:00Z",composition_source:"explicit_confirmation",
    heroes:names.map(name=>({name,level:150,stars:5,power:5000000}))}],sync:{pending_cloud_save:true}};
const protectedStore=new Map([["confirmed-profile",JSON.stringify(profile)],["auth-session","fixture-session"],["beta-grant","active"],["pro-grant","active"]]);
const storage={getItem:k=>protectedStore.get(k),setItem:(k,v)=>protectedStore.set(k,v),removeItem:k=>protectedStore.delete(k)};
const snapshot=JSON.stringify([...protectedStore]);

await test("old drawer snapshot removed; no saved view written for a new launch",()=>{
  storage.setItem(RETURN_VIEW_STORAGE_KEY,JSON.stringify({drawer:"scan",pageY:800,drawerY:350}));
  const controller=createReturnViewController({storage,persistAcrossReload:false});
  controller.remember("scan");
  assert.equal(storage.getItem(RETURN_VIEW_STORAGE_KEY),undefined);
  const reopened=createReturnViewController({storage,persistAcrossReload:false});
  assert.equal(reopened.restore().reason,"no-saved-view");
  assert.equal(JSON.stringify([...protectedStore]),snapshot);
});
await test("captures available only in the current document and isolated by owner",async()=>{
  await pending.savePendingSingleScan(owner,{image_data_url:image,name:"1000024350.png"});
  assert.equal((await pending.loadPendingSingleScan(owner)).name,"1000024350.png");
  assert.equal(await pending.loadPendingSingleScan("another-owner"),null);
  const reopened=await import("../lib/pending-scan-storage.js?fresh-launch-fixture");
  assert.equal(await reopened.loadPendingSingleScan(owner),null);
});
await test("single, roster and technology captures are cleared, not confirmed profile storage",async()=>{
  const file=new File(["fixture"],"formation.png",{type:"image/png"});
  await pending.savePendingRosterFiles(owner,[file]);
  await pending.savePendingTechnologyFiles(owner,[file]);
  pending.clearPendingScanSession();
  assert.equal(await pending.loadPendingSingleScan(owner),null);
  assert.deepEqual(await pending.loadPendingRosterFiles(owner),[]);
  assert.deepEqual(await pending.loadPendingTechnologyFiles(owner),[]);
  assert.equal(JSON.stringify([...protectedStore]),snapshot);
});
await test("legacy cleanup touches only the old pending capture DB/store",async()=>{
  const old=globalThis.indexedDB,legacy=new Map([["old-capture",image]]),calls=[];
  globalThis.indexedDB={open(name,version){
    calls.push(name);assert.equal(name,"warboost-pending-scans-v1");assert.equal(version,1);
    const request={};
    queueMicrotask(()=>{
      request.result={close(){},transaction(store,mode){
        assert.equal(store,"pending");assert.equal(mode,"readwrite");
        return {objectStore(){return {clear(){const req={};queueMicrotask(()=>{legacy.clear();req.onsuccess()});return req}}}};
      }};
      request.onsuccess();
    });
    return request;
  }};
  try{
    assert.equal(await pending.clearLegacyPendingScans(),true);
    assert.equal(legacy.size,0);assert.equal(calls.length,1);
    await pending.savePendingSingleScan(owner,{image_data_url:image});
    assert.equal(calls.length,1,"new captures must never write IndexedDB");
    assert.equal(JSON.stringify([...protectedStore]),snapshot);
  }finally{globalThis.indexedDB=old}
});

function node(){
  const classes=new Set(["open"]);
  return {value:"1000024350.png",textContent:"Capture prête",dataset:{scanReviewStatusKey:"scan_review_ready",squadPending:"[]"},
    checked:true,disabled:true,src:image,scrollTop:200,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
    removeAttribute(k){delete this[k]},setAttribute(){},replaceChildren(){this.textContent=""},
    close(){this.closed=true},classes};
}
function fixture(){
  const nodes=new Map(),get=k=>{if(!nodes.has(k))nodes.set(k,node());return nodes.get(k)};
  const drawers=[node(),node()],listeners=new Map();
  const windowRef={history:{scrollRestoration:"auto"},scrollTo(x,y){this.scroll=[x,y]},
    addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
  const context=vm.createContext({
    lang:"fr",state:structuredClone(profile),cloudSession:{user:{id:owner},access_token:"fixture-only"},
    betaState:{allowed:true},proState:{active:true},
    scanInputRevision:5,scanFileSelectionRevision:9,pendingScanReview:{patch:{unconfirmed:true}},
    pendingScanRestoreInFlight:Promise.resolve(),pendingScanRestoreOwner:owner,
    scanImageData:image,scanImageDataList:[image],scanImageName:"1000024350.png",
    pendingHeroSuggestions:[{name:"Unknown"}],pendingHeroScanSlots:[{}],pendingExclusiveScan:[{}],
    rosterScanFiles:[{}],rosterScanDraft:[{name:"Unconfirmed"}],
    $:get,$$:()=>drawers,t:translator("fr"),renderRosterScanFiles(){},renderRosterScanDraft(){},updateTechnologyScanPreview(){},
    unmountAuthControls(){},closeAlliancePlayerProfile(){},closeAllianceEventDetail(){},returnViewController:{remember(){},clear(){}}
  });
  const clear=app.slice(app.indexOf("function discardScanReviewDraft(){"),app.indexOf("async function restorePendingScans(){"));
  const close=app.slice(app.indexOf("function closeDrawers("),app.indexOf("\n",app.indexOf("function closeDrawers(")));
  vm.runInContext(`${clear}\n${close}`,context);
  const file=node(),dialog=node();
  const controller=createFreshLaunchController({windowRef,
    documentRef:{querySelectorAll:selector=>selector.includes("file")?[file]:selector.startsWith("dialog")?[dialog]:[]},
    resetTemporary:context.resetPendingScanUi,closeTemporary:context.closeDrawers,
    clearCaptures:pending.clearPendingScanSession,clearLegacyCaptures:async()=>true});
  return {context,nodes,get,drawers,file,dialog,windowRef,listeners,controller};
}
await test("production reset removes scan drafts/files/statuses and closes drawers/dialogs",async()=>{
  const f=fixture(),before=JSON.stringify({state:f.context.state,session:f.context.cloudSession,beta:f.context.betaState,pro:f.context.proState});
  f.controller.start();
  assert.equal(f.context.pendingScanReview,null);assert.equal(f.context.scanImageData,null);
  assert.equal(f.context.scanImageDataList.length,0);assert.equal(f.context.rosterScanDraft.length,0);
  assert.equal(f.context.pendingExclusiveScan.length,0);assert.equal(f.context.pendingHeroSuggestions.length,0);
  assert.equal(f.get("#scanFile").value,"");assert.equal(f.file.value,"");
  assert.equal(f.get("#scanStatus").textContent,translator("fr")("scan_wait"));
  assert.deepEqual(f.get("#scanStatus").dataset,{});
  assert.equal(f.get("#rosterScanFullSnapshot").checked,false);
  assert.equal(f.get("#analyzeScanBtn").disabled,false);
  assert.ok(f.drawers.every(d=>!d.classes.has("open")));assert.equal(f.dialog.closed,true);
  assert.deepEqual(f.windowRef.scroll,[0,0]);assert.equal(f.windowRef.history.scrollRestoration,"manual");
  assert.equal(JSON.stringify({state:f.context.state,session:f.context.cloudSession,beta:f.context.betaState,pro:f.context.proState}),before);
});
await test("pagehide/BFCache invalidate old requests; camera/gallery focus alone does not discard",()=>{
  const f=fixture();f.controller.start();
  f.context.scanImageData=image;f.context.pendingScanReview={unconfirmed:true};
  assert.equal(f.listeners.has("visibilitychange"),false);assert.equal(f.listeners.has("focus"),false);
  const revision=f.context.scanInputRevision;
  f.listeners.get("pagehide")({type:"pagehide"});
  assert.ok(f.context.scanInputRevision>revision);assert.equal(f.context.scanImageData,null);
  f.context.pendingScanReview={unconfirmed:true};f.drawers[0].classList.add("open");
  f.listeners.get("pageshow")({type:"pageshow",persisted:true});
  assert.equal(f.context.pendingScanReview,null);assert.ok(!f.drawers[0].classes.has("open"));
});
await test("late roster OCR result after closing cannot recreate a pending import",async()=>{
  const f=fixture();f.controller.start();
  f.context.rosterScanFiles=[{}];
  Object.assign(f.context,{hasDeclaredAllianceCommandRole:()=>true,requireBetaAccess:()=>true,requireBetaConsent:()=>true,
    pendingScanOwner:()=>owner,imageToDataUrl:async()=>image,showAllianceRoleGuard(){},
    mergeRosterScanRows:()=>{throw Error("stale rows must not be merged")}});
  let resolve,captured;
  f.context.fetchWarBoostScan=()=>new Promise(r=>{resolve=r});
  const original=f.context.$;
  f.context.$=key=>key==="#rosterScanAnalyzeBtn"?{...original(key),addEventListener:(type,fn)=>{captured=fn}}:original(key);
  const start=app.indexOf('$("#rosterScanAnalyzeBtn")?.addEventListener');
  vm.runInContext(app.slice(start,app.indexOf('$("#rosterScanImportBtn")',start)),f.context);
  const running=captured();await new Promise(done=>setImmediate(done));
  assert.equal(typeof resolve,"function","fixture must reach the OCR request before closing");
  f.controller.reset();
  resolve({response:{ok:true},json:{roster_rows:[{name:"Unconfirmed"}]}});
  await running;
  assert.equal(f.context.rosterScanDraft.length,0);assert.equal(f.get("#rosterScanStatus").textContent,"");
});
await test("already confirmed scan and offline pending cloud save survive reopening",()=>{
  const applied=applyReviewedSquad(profile,{squadId:1,heroes:profile.squads[0].heroes,powerConfirmed:true,updatedAt:"2026-10-07T00:00:00Z"});
  assert.equal(applied.pending.length,0);
  const saved=JSON.stringify(applied.state);
  const f=fixture();f.context.state=JSON.parse(saved);f.controller.start();
  assert.equal(JSON.stringify(f.context.state),saved);
  assert.equal(f.context.state.squads[0].power,44.43);
  assert.deepEqual(Array.from(f.context.state.squads[0].confirmed_composition),names);
  assert.equal(f.context.state.sync.pending_cloud_save,true);
});
await test("late image decode failure cannot replace the fresh waiting status",async()=>{
  const f=fixture();f.controller.start();
  f.get("#scanType").value="squad1";
  let captured,rejectImage;
  Object.assign(f.context,{PLAYER_SCAN_BATCH_LIMIT:3,
    beginNewScanFileSelection:()=>({owner,fileRevision:f.context.scanFileSelectionRevision,clearPending:Promise.resolve()}),
    imageToDataUrlLimited:()=>new Promise((resolve,reject)=>{rejectImage=reject})});
  const original=f.context.$;
  f.context.$=key=>key==="#scanFile"?{...original(key),addEventListener:(type,fn)=>{captured=fn}}:original(key);
  const start=app.indexOf('$("#scanFile").addEventListener("change"');
  vm.runInContext(app.slice(start,app.indexOf('$("#scanType")?.addEventListener("change"',start)),f.context);
  const running=captured({target:{files:[{}]}});
  await new Promise(done=>setImmediate(done));
  assert.equal(typeof rejectImage,"function");
  f.controller.reset();rejectImage(Error("fixture decode failed"));await running;
  assert.equal(f.get("#scanStatus").textContent,translator("fr")("scan_wait"));
  assert.equal(f.context.scanImageData,null);
});
await test("startup does not restore navigation and still keeps confirmed cloud flush",()=>{
  assert.match(app,/persistAcrossReload:false/);assert.doesNotMatch(app,/returnViewController\?\.restore\(\)/);
  assert.match(app,/freshLaunch\.start\(\)/);
  assert.match(app,/pagehide",\(\)=>\{if\(cloudDirty\)void pushServerState\(\{keepalive:true\}\)/);
  assert.match(app,/onProgress:[^\n]*scanRequestIsCurrent\(request\)/);
  for(const locale of ["fr","en-GB","en-US"]){
    assert.doesNotMatch(translator(locale)("privacy_scan"),/48/);
    assert.doesNotMatch(translator(locale)("loading_context"),/current screen|écran courant/);
  }
});
console.log(`PASS ${count} fresh-launch scenarios`);
