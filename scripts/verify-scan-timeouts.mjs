import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {syntheticFormationPng} from "./fixtures/formation-image.mjs";
import vm from "node:vm";
import {translator} from "../i18n.js";
import {createScanTiming,SCAN_SERVER_BUDGET_MS} from "../api/_scan-timing.js";
import {openaiVision,visionRequestContent} from "../api/scan.js";
import {loadHeroReferenceImages} from "../api/_hero-reference-images.js";

// Dummy key supplied by npm; all provider traffic is mocked, never billed.
let checks=0;
async function test(label,work){await work();checks++;console.log(`PASS ${label}`)}
const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
const scanFunction=app.match(/async function fetchWarBoostScan\(payload\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(scanFunction);
await test("only the scan frontend uses 90s; general request deadlines stay unchanged",async()=>{
  let finished=0;
  const context=vm.createContext({
    lang:"fr",t:translator("fr"),beginActiveLoadingOperation:()=>()=>{finished++},authHeaders:()=>({}),
    fetchJsonBounded:async(url,init,timeout)=>{
      assert.equal(url,"/api/scan");assert.equal(timeout,90000);
      assert.equal(JSON.parse(init.body).scan_type,"exclusive");return {response:{ok:true},json:{ok:true}};
    }
  });
  vm.runInContext(scanFunction,context);
  await vm.runInContext('fetchWarBoostScan({scan_type:"exclusive"})',context);
  assert.equal(finished,1);
  assert.match(app,/async function fetchSessionCritical\(input,init=\{\},timeoutMs=10000\)/);
  assert.match(app,/async function fetchJsonBounded\(input,init=\{\},timeoutMs=12000\)/);
});
await test("scan timeout has a clear French message and always releases busy state",async()=>{
  let finished=0;
  const context=vm.createContext({
    lang:"fr",t:translator("fr"),beginActiveLoadingOperation:()=>()=>{finished++},authHeaders:()=>({}),
    fetchJsonBounded:async()=>{throw Object.assign(new Error("WarBoost request timed out"),{code:"request_timeout"})}
  });
  vm.runInContext(scanFunction,context);
  await assert.rejects(vm.runInContext("fetchWarBoostScan({})",context),error=>
    error.code==="SCAN_REQUEST_TIMEOUT"&&error.timeout_ms===90000&&/L’analyse du scan.*Garde-la et réessaie/.test(error.message));
  assert.equal(finished,1);
  context.fetchJsonBounded=async()=>{throw Object.assign(new Error("Unauthorized"),{code:"AUTH_REQUIRED"})};
  await assert.rejects(vm.runInContext("fetchWarBoostScan({})",context),{code:"AUTH_REQUIRED"});
  assert.equal(finished,2);
});

const image="data:image/png;base64,AA==";
const bank=await loadHeroReferenceImages();
const capture=await syntheticFormationPng();
const formationImage=`data:image/png;base64,${capture.toString("base64")}`;
const formation={captures:[{image_index:0,screen_type:"formation_details",
  squads:[{power:"44,43 M",heroes:Array.from({length:5},()=>({level:155}))}],exclusive_weapons:[]}]};
const reply=raw=>({ok:true,json:async()=>({output_text:JSON.stringify(raw)})});
await test("Skyler exclusive scan has one provider image, no atlas or optional portrait request",async()=>{
  const original=globalThis.fetch,events=[],raw={exclusive_weapons:[{hero_name:"Skyler",weapon_name:"Lame Magique",level:1}]};
  let calls=0;
  globalThis.fetch=async(_,init)=>{
    calls++;
    const content=JSON.parse(init.body).input[0].content;
    assert.equal(content.filter(row=>row.type==="input_image").length,1);
    assert.ok(!content.some(row=>row.text?.startsWith("REFERENCE ATLAS")));
    return reply(raw);
  };
  try{
    assert.deepEqual(await openaiVision({image,scanType:"exclusive",locale:"fr",referenceBank:bank,
      timing:createScanTiming({log:e=>events.push(e)})}),raw);
    assert.equal(calls,1);assert.deepEqual(events.map(e=>e.stage),["vision_primary"]);
  }finally{globalThis.fetch=original}
});
await test("weapon-only Formation batch cannot trigger cropping or a second provider pass",async()=>{
  const original=globalThis.fetch;
  let calls=0;
  const raw={captures:[{image_index:0,screen_type:"exclusive_weapon_detail",squads:[],exclusive_weapons:[]}]};
  globalThis.fetch=async()=>{calls++;return reply(raw)};
  try{
    assert.deepEqual(await openaiVision({images:[image],scanType:"squad1",referenceBank:bank,
      timing:createScanTiming({log:()=>{}})}),raw);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original}
});
await test("slow first pass leaves insufficient budget: skip zoom and preserve the whole formation",async()=>{
  const original=globalThis.fetch,events=[];
  let clock=15000,calls=0;
  const timing=createScanTiming({startedAt:0,now:()=>clock,log:e=>events.push(e)});
  globalThis.fetch=async()=>{calls++;clock=75000;return reply(formation)};
  try{
    assert.deepEqual(await openaiVision({images:[formationImage],scanType:"squad1",referenceBank:bank,timing}),formation);
    assert.equal(calls,1);assert.equal(events.at(-1).status,"skipped_budget");
  }finally{globalThis.fetch=original}
});
await test("hung optional response is aborted within remaining budget, even after headers arrive",async()=>{
  const originalFetch=globalThis.fetch,originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  const timers=[],events=[];let clock=10000,calls=0,signal;
  globalThis.setTimeout=(fn,ms)=>{const timer={fn,ms,cleared:false};timers.push(timer);return timer};
  globalThis.clearTimeout=timer=>{if(timer)timer.cleared=true};
  const timing=createScanTiming({startedAt:0,now:()=>clock,log:e=>events.push(e)});
  globalThis.fetch=async(_,init)=>{
    calls++;
    if(calls===1){clock=46000;return reply(formation)}
    signal=init.signal;
    const optional=timers.find(timer=>timer.ms===32000);
    assert.ok(optional,"80s total minus 46s elapsed and 2s return reserve");
    queueMicrotask(()=>{clock=78000;optional.fn()});
    return {ok:true,json:()=>new Promise(()=>{})};
  };
  try{
    assert.deepEqual(await openaiVision({images:[formationImage],scanType:"squad1",referenceBank:bank,timing}),formation);
    assert.equal(calls,2);assert.equal(signal.aborted,true);
    assert.equal(events.at(-1).status,"timeout");
    assert.ok(timers.some(timer=>timer.ms===46000),"provider deadline remains 46 seconds");
    assert.ok(timers.every(timer=>timer.cleared),"no dangling deadline timers");
  }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear}
});
await test("optional error returns the exact first result; telemetry contains no private evidence",async()=>{
  const events=[],timing=createScanTiming({log:e=>events.push(e)});
  assert.equal(await timing.optionalPortrait(async()=>{throw new Error("private OCR and filename")},formation),formation);
  await assert.rejects(timing.measure("access",async()=>{throw new Error("private token")}));
  timing.finish();
  assert.doesNotMatch(JSON.stringify(events),/private|filename|token|OCR|image/);
  for(const event of events)assert.deepEqual(Object.keys(event).sort(),["duration_ms","elapsed_ms","stage","status"]);
  assert.equal(events[0].status,"error");
  assert.equal(events.at(-1).stage,"total");
});
await test("refinement success still uses verified atlases and the existing deadline reserve",async()=>{
  assert.equal(SCAN_SERVER_BUDGET_MS,80000);
  const events=[],timing=createScanTiming({log:e=>events.push(e)});
  const refined={captures:formation.captures,refined:true};
  assert.equal(await timing.optionalPortrait(async()=>refined,formation),refined);
  assert.equal(events[0].status,"ok");
  const content=visionRequestContent({images:[formationImage],scanType:"squad1",referenceBank:bank});
  assert.equal(content.filter(row=>row.type==="input_image").length,1+bank.atlases.length);
});
console.log(`PASS ${checks} scan timeout checks (mocked provider; no live Vision request)`);
