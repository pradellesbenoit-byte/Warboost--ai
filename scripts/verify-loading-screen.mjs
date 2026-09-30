import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createLoadingScreenController,
  LOADING_ARTWORK_PATH,
  revealExactLoadingArtwork
} from "../lib/loading-screen.js";
import {
  createReturnViewController,
  normalizeReturnView,
  RETURN_VIEW_STORAGE_KEY
} from "../lib/return-view.js";
import {LANGUAGES,translator} from "../i18n.js";

class FakeClassList{
  values=new Set();
  contains(name){return this.values.has(name)}
  add(name){this.values.add(name)}
  remove(name){this.values.delete(name)}
  toggle(name,force){
    const next=force===undefined?!this.values.has(name):Boolean(force);
    if(next)this.values.add(name);else this.values.delete(name);
    return next;
  }
}
class FakeElement{
  constructor(id="",classes=[]){
    this.id=id;this.classList=new FakeClassList();classes.forEach(name=>this.classList.add(name));
    this.attributes=new Map();this.dataset={};this.textContent="";this.hidden=false;this.src="";
    this.scrollTop=0;
  }
  setAttribute(name,value){this.attributes.set(name,String(value))}
  getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null}
  hasAttribute(name){return this.attributes.has(name)}
  removeAttribute(name){this.attributes.delete(name);if(name==="src")this.src=""}
  async decode(){}
}
class FakeDocument{
  constructor(){
    this.body=new FakeElement("body");
    this.elements=new Map([
      ["loadingScreen",new FakeElement("loadingScreen")],
      ["loadingArtwork",new FakeElement("loadingArtwork")],
      ["loadingTitle",new FakeElement("loadingTitle")],
      ["loadingContext",new FakeElement("loadingContext")],
      ["loadingStage",new FakeElement("loadingStage")],
      ["loadingRetry",new FakeElement("loadingRetry",["hidden"])],
      ["appContent",new FakeElement("appContent")],
      ["backdrop",new FakeElement("backdrop")],
      ["allianceDrawer",new FakeElement("allianceDrawer",["drawer","open"])]
    ]);
    this.elements.get("allianceDrawer").setAttribute("aria-hidden","false");
    this.elements.get("allianceDrawer").scrollTop=321;
  }
  getElementById(id){return this.elements.get(id)||null}
  querySelectorAll(selector){
    const nodes=[...this.elements.values()].filter(node=>node.classList.contains("drawer"));
    return selector===".drawer.open"?nodes.filter(node=>node.classList.contains("open")):nodes;
  }
}
function makeStorage(){
  const values=new Map();
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    has:key=>values.has(key)
  };
}

// The initial screen is a modal, updates its truthful stage, and hides without
// imposing a minimum delay after the real startup work has completed.
{
  const doc=new FakeDocument(),storageCalls=[],scrollCalls=[];
  const windowRef={scrollX:55,scrollY:89,scrollTo:(x,y)=>scrollCalls.push([x,y])};
  const controller=createLoadingScreenController({
    documentRef:doc,windowRef,translate:key=>key,now:()=>100,
    setTimeoutFn:(fn,delay)=>{storageCalls.push(delay);fn()}
  });
  assert.equal(controller.isVisible(),true);
  assert.equal(doc.getElementById("appContent").hasAttribute("inert"),true);
  assert.equal(doc.getElementById("allianceDrawer").getAttribute("aria-hidden"),"true");
  controller.show("resume","cloud");
  assert.equal(doc.getElementById("loadingTitle").textContent,"loading_resume_title");
  assert.equal(doc.getElementById("loadingStage").textContent,"loading_stage_cloud");
  controller.setStage("expired");controller.setRetryVisible(true);
  assert.equal(doc.getElementById("loadingRetry").textContent,"loading_sign_in");
  await controller.hide();
  assert.equal(controller.isVisible(),false);
  assert.equal(storageCalls.length,0);
  assert.equal(doc.body.classList.contains("loading-active"),false);
  assert.equal(doc.getElementById("appContent").hasAttribute("inert"),false);
  assert.equal(doc.getElementById("allianceDrawer").getAttribute("aria-hidden"),"false");
  assert.deepEqual(scrollCalls,[[55,89]]);
}

// A newer show request wins over an older pending hide request.
{
  let now=0,finishWait;
  const doc=new FakeDocument();
  const controller=createLoadingScreenController({
    documentRef:doc,translate:key=>key,now:()=>now,minVisibleMs:100,
    setTimeoutFn:fn=>{finishWait=fn;return 1}
  });
  const oldHide=controller.hide();
  controller.show("update","version");
  now=100;finishWait();
  assert.equal(await oldHide,false);
  assert.equal(controller.isVisible(),true);
  assert.equal(controller.getState().mode,"update");
  assert.equal(controller.getState().stage,"version");
}

// Only the explicitly approved image path is revealed; HTML/error responses
// leave the artwork slot empty rather than substituting an unrelated image.
{
  const image=new FakeElement("loadingArtwork"),requests=[];
  const missing=await revealExactLoadingArtwork({
    imageElement:image,path:LOADING_ARTWORK_PATH,
    fetchImpl:async(path,options)=>{
      requests.push({path,options});
      return {ok:false,headers:{get:()=>"text/html"}};
    }
  });
  assert.equal(missing,false);
  assert.equal(requests[0].path,LOADING_ARTWORK_PATH);
  assert.equal(requests[0].options.method,"HEAD");
  assert.equal(image.hidden,true);
  assert.equal(image.src,"");

  const available=await revealExactLoadingArtwork({
    imageElement:image,path:LOADING_ARTWORK_PATH,
    fetchImpl:async()=>({ok:true,headers:{get:()=>"image/webp"}})
  });
  assert.equal(available,true);
  assert.equal(image.hidden,false);
  assert.equal(image.src,LOADING_ARTWORK_PATH);
}

// A service-worker reload can restore the current drawer and both page/drawer
// scroll positions, while private drawers remain gated by current access.
{
  const doc=new FakeDocument(),storage=makeStorage(),scrolled=[],opened=[];
  const windowRef={scrollX:7,scrollY:88,scrollTo:(x,y)=>scrolled.push([x,y])};
  const controller=createReturnViewController({
    documentRef:doc,windowRef,storage,openDrawer:name=>opened.push(name),
    canRestorePrivateData:()=>true,requestFrame:fn=>fn()
  });
  const saved=controller.remember("alliance");
  assert.deepEqual(saved,{drawer:"alliance",pageX:7,pageY:88,drawerY:321});
  assert.deepEqual(controller.read(),saved);
  doc.getElementById("allianceDrawer").scrollTop=0;
  const restored=controller.restore();
  assert.equal(restored.ok,true);
  assert.deepEqual(opened,["alliance"]);
  assert.deepEqual(scrolled,[[7,88]]);
  assert.equal(doc.getElementById("allianceDrawer").scrollTop,321);
  assert.equal(storage.has(RETURN_VIEW_STORAGE_KEY),false);

  controller.remember("alliance");
  let blockedOpen=false;
  const locked=createReturnViewController({
    documentRef:doc,windowRef,storage,openDrawer:()=>{blockedOpen=true},
    canRestorePrivateData:()=>false,requestFrame:fn=>fn()
  });
  assert.equal(locked.restore().reason,"private-data-not-ready");
  assert.equal(blockedOpen,false);
  assert.deepEqual(normalizeReturnView({drawer:"not-a-drawer",pageX:-4,pageY:2_000_000,drawerY:"bad"}),{
    drawer:null,pageX:0,pageY:1_000_000,drawerY:0
  });
}

// All supported app languages receive translated startup, resume, failure, and
// recovery copy; the Auto selector is not counted as a language.
{
  const languages=LANGUAGES.filter(([code])=>code!=="auto");
  assert.equal(languages.length,23);
  const keys=[
    "loading_open_title","loading_resume_title","loading_update_title","loading_context",
    "loading_stage_profile","loading_stage_session","loading_stage_cloud","loading_stage_alliance",
    "loading_stage_scans","loading_stage_version","loading_stage_error","loading_stage_expired",
    "loading_continue","loading_sign_in"
  ];
  const english=translator("en-GB");
  for(const [code] of languages){
    const t=translator(code);
    for(const key of keys){
      const text=t(key);
      assert.ok(text&&text!==key,`${code} is missing ${key}`);
      if(code!=="en-GB"&&code!=="en-US")assert.notEqual(text,english(key),`${code} is using English fallback for ${key}`);
    }
  }
}

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../loading-screen.css",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
assert.match(index,/id="loadingScreen"/);
assert.match(index,/id="loadingScreen"[^>]*tabindex="-1"/);
assert.match(index,/id="appContent"/);
assert.match(app,/loadingScreen\?\.show\(mode,"profile"\)/);
assert.match(app,/await initCloudAuth\(\)/);
assert.match(app,/restorePendingScans\(\)/);
assert.match(app,/STARTUP_SCAN_RESTORE_WAIT_MS=5000/);
assert.match(app,/Promise\.race\(\[\s*restorePendingScans\(\)/);
assert.match(app,/scanInputRevision!==inputRevision\|\|scanFileSelectionRevision!==fileRevision/);
assert.match(app,/serviceWorkerUpdatePromise/);
assert.match(app,/returnViewController\?\.restore\(\)/);
assert.match(app,/returnViewController\?\.capture\(\)/);
assert.match(app,/onSuspend:\(\)=>\{stopForegroundRefreshes\(\);loadingScreen\?\.show\("resume","cloud"\)\}/);
assert.doesNotMatch(app,/onSuspend:[^\n]*closeDrawers/);
assert.match(app,/finishOperation\(\)/);
assert.match(sw,/lib\/loading-screen\.js\?v=warboost-startup-screen-r1/);
assert.match(sw,/loading-screen\.css\?v=warboost-startup-screen-r1/);
assert.match(css,/env\(safe-area-inset-/);
assert.match(css,/@media\(max-width:540px\)/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.equal(LOADING_ARTWORK_PATH,"/assets/warboost-loading-scene.webp");

console.log("WarBoost loading, safe resume, route restoration, artwork slot, and localization: PASS");