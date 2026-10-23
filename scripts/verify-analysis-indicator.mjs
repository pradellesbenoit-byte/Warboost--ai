import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createAnalysisIndicator,analysisFailureMessage,beginLoadingButton} from "../lib/analysis-indicator.js";
import {loadingTargetIds,requestLoadingTargetIds} from "../lib/loading-targets.js";
import {LOADING_TRANSLATIONS} from "../lib/loading-copy.js";
import {ANALYSIS_COPY_KEYS,ANALYSIS_SCAN_TRANSLATIONS} from "../lib/analysis-copy.js";
import {LANGUAGES,translator,resolveLanguage,dirFor} from "../i18n.js";

function node(){return {attrs:{},disabled:false,textContent:"Idle",
  getAttribute(key){return this.attrs[key]??null},
  setAttribute(key,value){this.attrs[key]=value},
  removeAttribute(key){delete this.attrs[key]}}}
const scan=node(),roster=node(),advice=node(),sync=node();
const targets={scan,"scan:roster":roster,"advice:player":advice,sync};
const indicator=createAnalysisIndicator({inlineTarget:kind=>targets[kind]});
assert.equal(indicator.pending,0);
assert.deepEqual(scan.attrs,{},"instant actions show nothing");
const first=indicator.begin("scan"),second=indicator.begin("advice:player");
assert.equal(scan.attrs["data-wb-analysis-active"],"true");
assert.equal(advice.attrs["aria-busy"],"true");
scan.textContent="Analyse en cours… 2/3";
indicator.refresh();assert.equal(scan.textContent,"Analyse en cours… 2/3");
first();first();assert.equal(indicator.pending,1);
assert.equal(scan.attrs["data-wb-analysis-active"],undefined);
assert.equal(advice.attrs["data-wb-analysis-active"],"true");second();
const old=indicator.begin("scan");indicator.cancel("scan");
const current=indicator.begin("scan");old();
assert.equal(scan.attrs["data-wb-analysis-active"],"true");
current();
const outer=indicator.begin("scan:roster"),inner=indicator.begin("scan:roster");
inner();assert.equal(roster.attrs["data-wb-analysis-active"],"true","whole roster batch keeps W between requests");
outer();assert.equal(roster.attrs["aria-busy"],undefined);
sync.setAttribute("aria-busy","false");const finishSync=indicator.begin("sync");finishSync();
assert.equal(sync.attrs["aria-busy"],"false","preserve pre-existing accessibility attributes");

let language="fr";
for(const outcome of ["success","refusal","409","timeout","cancellation"]){
  const button=node();
  const finish=beginLoadingButton(indicator,button,{kind:"roster:update",
    label:()=>translator(language)("alliance_update_busy"),idleLabel:()=>translator(language)("roster_scan_import")});
  assert.equal(button.disabled,true);assert.equal(button.textContent,"Mise à jour de l’alliance en cours…");
  assert.equal(button.attrs["data-wb-analysis-active"],"true");
  language="ja";indicator.refresh();
  assert.equal(button.textContent,translator("ja")("alliance_update_busy"));language="fr";
  try{if(outcome!=="success")throw Error(outcome)}catch{}finally{finish();finish()}
  assert.equal(button.disabled,false);assert.equal(button.attrs["data-wb-analysis-active"],undefined);
  assert.equal(button.textContent,translator("fr")("roster_scan_import"));
}
const button=node(),older=beginLoadingButton(indicator,button,{kind:"old",label:()=>"old"});
indicator.cancel("old");
const newer=beginLoadingButton(indicator,button,{kind:"new",label:()=>"new"});
older();assert.equal(button.disabled,true);assert.equal(button.textContent,"new");
newer();assert.equal(button.attrs["data-wb-analysis-active"],undefined);assert.equal(button.disabled,false);
for(const kind of ["scan","scan:roster","advice:player","advice:alliance","advice:vs","advice:season","sync"])
  assert.ok(loadingTargetIds(kind).length,kind);
for(const path of ["/api/state","/api/sync","/api/alliance-role","/api/support","/api/invite","/api/join","/api/pro"])
  assert.ok(requestLoadingTargetIds(path).length,path);
assert.deepEqual(requestLoadingTargetIds("/api/health?clock=1"),[]);
assert.deepEqual(requestLoadingTargetIds("/api/scan"),[],"scan batch owns its W, no duplicate network W");
assert.deepEqual(requestLoadingTargetIds("/api/sync",{},true),[],"roster update owns its W, no duplicate global sync mark");

const source=fs.readFileSync("app.js","utf8");
function extract(name){const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  return source.slice(start,source.indexOf("\n}",start)+2)}
const context={analysisIndicator:indicator,activeLoadingOperations:0,idleLifecycle:{setBusy(){},noteActivity(){}},
  state:{},lang:"fr",authHeaders:x=>x,t:translator("fr"),currentVsWeek:()=>1,currentVsDay:()=>1};
vm.createContext(context);
vm.runInContext(extract("beginActiveLoadingOperation")+"\n"+extract("requestAdvice")+"\n"+extract("fetchWarBoostScan"),context);
for(const scope of ["player","alliance","vs","season"]){
  context.state={vs:{}};let settle;
  context.fetchJsonBounded=()=>new Promise(resolve=>{settle=resolve});
  const request=context.requestAdvice(scope);assert.equal(indicator.pending,1);
  settle({response:{ok:true},json:{ok:true}});await request;assert.equal(indicator.pending,0);
}
context.fetchJsonBounded=async()=>{throw Object.assign(Error("private"),{code:"request_timeout"})};
assert.equal(await context.requestAdvice("player"),null);
await assert.rejects(context.fetchWarBoostScan({}),e=>e.code==="SCAN_REQUEST_TIMEOUT"&&!e.message.includes("private"));
assert.equal(indicator.pending,0);assert.equal(context.activeLoadingOperations,0);

// Actual request wrapper: W stays through response-body parsing and always clears.
let settleHeaders,settleBody;
context.firstLoadingTarget=()=>sync;context.requestLoadingTargetIds=requestLoadingTargetIds;
context.fetchSessionCritical=()=>new Promise(resolve=>{settleHeaders=resolve});
vm.runInContext(extract("fetchJsonBounded"),context);
context.$=()=>null;
const pending=context.fetchJsonBounded("/api/state",{});
assert.equal(sync.attrs["data-wb-analysis-active"],"true");
settleHeaders({ok:true,json:()=>new Promise(resolve=>{settleBody=resolve})});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(sync.attrs["data-wb-analysis-active"],"true");settleBody({});
await pending;assert.equal(sync.attrs["data-wb-analysis-active"],undefined);
context.fetchSessionCritical=async()=>{throw Error("network")};
await assert.rejects(context.fetchJsonBounded("/api/state",{}));
assert.equal(sync.attrs["data-wb-analysis-active"],undefined);

let checks=0;
for(const [code] of LANGUAGES.filter(([code])=>code!=="auto")){
  assert.equal(resolveLanguage(code),code);assert.equal(dirFor(code),code==="ar"?"rtl":"ltr");
  const pack=ANALYSIS_SCAN_TRANSLATIONS[code];assert.ok(pack,code);
  assert.equal(analysisFailureMessage({message:"private"},translator(code)),translator(code)("scan_error"));
  for(const key of ANALYSIS_COPY_KEYS){
    assert.ok(pack[key]);assert.notEqual(translator(code)(key,{squad:2,limit:6}),key);checks++;
  }
  for(const key of ["alliance_update_busy","alliance_update_done"]){
    assert.ok(LOADING_TRANSLATIONS[code]?.[key],`${code}/${key}`);
    assert.equal(translator(code)(key),LOADING_TRANSLATIONS[code][key]);checks++;
  }
}
const css=fs.readFileSync("analysis-indicator.css","utf8");
assert.match(css,/prefers-reduced-motion/);assert.match(css,/pointer-events:\s*none/);
assert.match(css,/\[data-wb-analysis-active="true"\]::before/);
assert.match(css,/content:\s*"W"\s*\/\s*""/);
assert.match(css,/margin-inline-end/);assert.doesNotMatch(css,/position:\s*(fixed|absolute)/);
assert.match(css,/rotate\(360deg\)/);
assert.doesNotMatch(fs.readFileSync("lib/analysis-indicator.js","utf8"),/doc\.body\.append|createElement/);
const rosterHtml=fs.readFileSync("index.html","utf8");
assert.match(rosterHtml,/id="rosterScanAnalyzeBtn"[^>]*>[^<]*<\/button><div id="rosterScanStatus"/);
assert.match(css,/#rosterScanStatus\[data-wb-analysis-active="true"\]/);
assert.match(source,/kind==="scan:roster"&&\$\("#allianceDrawer"\)\?\.classList\.contains\("open"\)/);
context.$=selector=>selector==="#allianceDrawer"?{classList:{contains:()=>true}}:null;
context.firstLoadingTarget=ids=>ids.includes("rosterScanStatus")?roster:null;
context.loadingTargetIds=loadingTargetIds;
vm.runInContext(extract("analysisInlineTarget"),context);
assert.equal(context.analysisInlineTarget("scan:roster"),roster);
console.log(`PASS inline W: concurrency, stale completion, batches, button outcomes, body parsing, silent instant actions, ${checks} localized messages; synthetic DOM/transports, no cloud writes`);
