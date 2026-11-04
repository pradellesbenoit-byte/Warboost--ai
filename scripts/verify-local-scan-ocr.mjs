import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import {localOcrWorkerOptions,parseLocalScanOcrData,runLocalScanOcrBatch} from "../lib/local-scan-ocr-engine.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const appSource=await readFile(path.join(root,"app.js"),"utf8");
const require=createRequire(import.meta.url);
const nodeWorkerPath=path.join(path.dirname(require.resolve("tesseract.js")),"worker-script/node/index.js");
const {createWorker}=Tesseract;

test("Tesseract uses only explicit same-origin worker/core/language assets and disables persistent model cache",()=>{
  const options=localOcrWorkerOptions();
  assert.equal(options.workerPath,"/assets/local-ocr/worker.min.js");
  assert.equal(options.corePath,"/assets/local-ocr/core");
  assert.equal(options.langPath,"/assets/local-ocr/lang");
  assert.equal(options.workerBlobURL,false);
  assert.equal(options.cacheMethod,"none");
  assert.equal(options.gzip,true);
});

test("real Tesseract.js OCR reads generated text with local language data and no network",async()=>{
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="500"><rect width="100%" height="100%" fill="white"/><text x="50" y="180" font-family="DejaVu Sans, sans-serif" font-size="100" font-weight="700" fill="black">TOTAL POWER 45.64M</text></svg>`);
  const png=await sharp(svg).png().toBuffer();
  const blank=await sharp({create:{width:1000,height:500,channels:3,background:"#ffffff"}}).png().toBuffer();
  const languagePath=path.join(root,"node_modules/@tesseract.js-data/eng/4.0.0_best_int");
  const [recognized,empty]=await runLocalScanOcrBatch([png,blank],{
    language:"eng",scanType:"squad1",langPath:languagePath,timeoutMs:60000,
    workerFactory:(language,oem,options)=>createWorker(language,oem,{
      ...options,
      workerPath:nodeWorkerPath,
      corePath:undefined
    }),
    onProgress:message=>assert.ok(!("text" in message),"progress must not expose recognized/private text")
  });
  assert.ok(!nodeWorkerPath.startsWith("/assets/"),"Node OCR uses Tesseract's Node worker, not the browser asset URL");
  const normalized=recognized.text.toUpperCase().replace(/\s+/g," ").trim();
  assert.match(normalized,/TOTAL POWER\s+45[.,]64\s*M/);
  assert.ok(recognized.lines.some(line=>line.confidence!==null&&line.confidence>70));
  assert.equal(recognized.candidates.length,1);
  assert.equal(recognized.candidates[0].field,"squad_power_m");
  assert.equal(recognized.candidates[0].value,45.64);
  assert.equal(empty.candidates.length,0);
  assert.equal(empty.text.trim(),"");
});

test("field candidates require a high-confidence visible label; explicit zero stays zero",()=>{
  const technology=parseLocalScanOcrData({lines:[{text:"Development 0%",confidence:98,words:[]}]}, "technology");
  assert.equal(technology.candidates.length,1);
  assert.equal(technology.candidates[0].value,0);
  assert.equal(technology.candidates[0].state,"percent");
  const max=parseLocalScanOcrData({lines:[{text:"Development Level Max",confidence:98,words:[]}]}, "technology");
  assert.equal(max.candidates[0]?.state,"max");
  const locked=parseLocalScanOcrData({lines:[{text:"Development Locked",confidence:98,words:[]}]}, "technology");
  assert.equal(locked.candidates[0]?.state,"locked");
  assert.equal(parseLocalScanOcrData({lines:[{text:"Development 0%",confidence:70,words:[]}]}, "technology").candidates.length,0);
  assert.equal(parseLocalScanOcrData({lines:[{text:"Carlie DVA Exclusive Weapon Lv29",confidence:99,words:[]}]}, "squad1").candidates.length,0);
  assert.equal(parseLocalScanOcrData({lines:[{text:"45.6M",confidence:99,words:[]}]}, "squad1").candidates.length,0);
});

test("the real app gate requires beta access, consent, a valid session and matching owner",()=>{
  const start=appSource.indexOf("function localScanOcrGate(){");
  const end=appSource.indexOf('\n$("#localScanOcrStartBtn")',start);
  assert.ok(start>=0&&end>start,"real local OCR gate must exist in app.js");
  const gate=appSource.slice(start,end);
  const run=({allowed=true,consent=true,session={access_token:"synthetic",user:{id:"owner-a"}},owner="owner-a"}={})=>{
    const calls={drawer:0};
    const context={
      cloudSession:session,state:{player_id:owner},lang:"en-GB",
      requireBetaAccess:()=>allowed,requireBetaConsent:()=>consent,
      pendingScanOwner:s=>`user:${s?.user?.id||""}`,
      localScanOcrCopy:()=>({error:"error",login:"login"}),
      openDrawer:()=>calls.drawer++,authMessage:()=>{},
       $:selector=>selector==="#scanType"?{value:"squad1"}:{textContent:""}
    };
    vm.runInNewContext(`${gate}\nglobalThis.result=localScanOcrGate()`,context);
    return {result:context.result,calls};
  };
  assert.equal(run().result.owner,"user:owner-a");
  assert.equal(run({consent:false}).result,null);
  assert.equal(run({allowed:false}).result,null);
  assert.equal(run({session:null}).result,null);
  assert.equal(run({owner:"owner-b"}).result,null);
  assert.equal(run({session:null}).calls.drawer,1);
});

test("the real OCR UI path has no profile/cloud writes or scan-review mutations",()=>{
  const start=appSource.indexOf('$("#localScanOcrStartBtn")?.addEventListener');
  const end=appSource.indexOf('$("#scanType")?.addEventListener("change"',start);
  assert.ok(start>=0&&end>start,"real OCR event handlers must exist");
  const handlers=appSource.slice(start,end);
  assert.match(handlers,/import\("\/assets\/local-ocr\/ocr-engine\.js"\)/);
  assert.doesNotMatch(handlers,/\b(?:fetch|fetchJsonBounded|saveState|pushServerState|pendingScanReview|localStorage|indexedDB)\b/);
});

test("cancellation terminates a running worker and emits no report",async()=>{
  const controller=new AbortController();
  let terminated=0,reported=false;
  const workerFactory=async(_language,_oem,options)=>{
    assert.equal(options.cacheMethod,"none");
    assert.equal(options.workerBlobURL,false);
    return {recognize:()=>new Promise(()=>{}),terminate:async()=>{terminated++}};
  };
  const pending=runLocalScanOcrBatch([Buffer.from("synthetic")],{
    language:"eng",scanType:"squad1",signal:controller.signal,workerFactory,timeoutMs:60000
  }).then(()=>{reported=true});
  await new Promise(resolve=>setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending,error=>error.code==="cancelled");
  assert.equal(terminated,1);
  assert.equal(reported,false);
});
