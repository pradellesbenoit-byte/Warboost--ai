import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createAnalysisIndicator,analysisFailureMessage} from "../lib/analysis-indicator.js";
import {ANALYSIS_COPY_KEYS,ANALYSIS_SCAN_TRANSLATIONS} from "../lib/analysis-copy.js";
import {LANGUAGES,translator,resolveLanguage,dirFor} from "../i18n.js";

function node(){
  return {children:[],attrs:{},hidden:false,textContent:"",
    append(...children){this.children.push(...children)},
    setAttribute(key,value){this.attrs[key]=value},
    removeAttribute(key){delete this.attrs[key]}};
}
const document={body:node(),createElement:node};
let language="fr";
const indicator=createAnalysisIndicator({document,message:()=>translator(language)("analysis_busy")});
assert.equal(document.body.children.length,0,"instant actions don't create any loading UI");
const first=indicator.begin("scan"),element=document.body.children[0];
assert.equal(element.hidden,false);
assert.equal(element.attrs.role,"status");
assert.equal(element.children[0].textContent,"W");
assert.equal(element.children[0].attrs["aria-hidden"],"true");
assert.equal(element.children[1].textContent,"WarBoost analyse…");
const second=indicator.begin("advice:player");
first();first();assert.equal(indicator.pending,1);assert.equal(element.hidden,false);
language="ja";indicator.refresh();assert.equal(element.children[1].textContent,translator("ja")("analysis_busy"));
indicator.cancel("scan");assert.equal(indicator.pending,1,"cancelling a scan must not hide unrelated AI work");
second();assert.equal(element.hidden,true);
const stale=indicator.begin("scan");indicator.cancel("scan");
const current=indicator.begin("scan");stale();
assert.equal(element.hidden,false,"an old completion cannot hide a newer analysis");
current();assert.equal(element.hidden,true);

// Scan text is owned by existing handlers; the decorative W survives text updates.
const inlineDocument={body:node(),createElement:node},status=node();
status.textContent="Analyse en cours…";
const inline=createAnalysisIndicator({document:inlineDocument,inlineTarget:()=>status});
const finishScan=inline.begin("scan"),floating=inlineDocument.body.children[0];
assert.equal(status.attrs["data-wb-analysis-active"],"true");
assert.equal(status.textContent,"Analyse en cours…","do not rewrite localized scan status");
assert.equal(floating.hidden,true,"no duplicate floating badge during inline scan");
const finishNestedScan=inline.begin("scan"),finishAdvice=inline.begin("advice:player");
status.textContent="Analyse en cours… 2/3";inline.refresh();
assert.equal(status.attrs["data-wb-analysis-active"],"true");
finishNestedScan();assert.equal(floating.hidden,true);
finishScan();assert.equal(status.attrs["data-wb-analysis-active"],undefined);
assert.equal(floating.hidden,false,"unrelated advice keeps its original feedback");
finishAdvice();assert.equal(floating.hidden,true);
const oldInline=inline.begin("scan");inline.cancel("scan");
assert.equal(status.attrs["data-wb-analysis-active"],undefined);
const newInline=inline.begin("scan");oldInline();
assert.equal(status.attrs["data-wb-analysis-active"],"true");
newInline();assert.equal(status.attrs["data-wb-analysis-active"],undefined);
for(const outcome of ["success","failure","timeout"]){
  const finish=inline.begin("scan");
  try{if(outcome!=="success")throw new Error(outcome)}catch{}finally{finish()}
  assert.equal(status.attrs["data-wb-analysis-active"],undefined,`${outcome} stops inline animation`);
  assert.equal(floating.hidden,true);
}

const source=fs.readFileSync("app.js","utf8");
assert.match(source,/inlineTarget:\(\)=>\$\("#scanDrawer"\)\?\.classList\.contains\("open"\)\?\$\("#scanStatus"\):null/,
  "only an open WarBoost Scan drawer replaces floating feedback");
function extract(name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  return source.slice(start,source.indexOf("\n}",start)+2);
}
const busyStates=[];
const context={analysisIndicator:indicator,activeLoadingOperations:0,idleLifecycle:{setBusy(value){busyStates.push(value)},noteActivity(){}},
  state:{},lang:"fr",authHeaders:x=>x,t:translator("fr")};
vm.createContext(context);
vm.runInContext(extract("beginActiveLoadingOperation")+"\n"+extract("requestAdvice")+"\n"+extract("fetchWarBoostScan"),context);
for(const scope of ["player","alliance","vs","season"]){
  context.state={vs:{}};context.currentVsWeek=()=>1;context.currentVsDay=()=>1;
  let settle;
  context.fetchJsonBounded=()=>new Promise(resolve=>{settle=resolve});
  const request=context.requestAdvice(scope);
  assert.equal(indicator.pending,1);
  assert.equal(busyStates.at(-1),true,"actual analysis protects the idle/session lifecycle");
  settle({response:{ok:true},json:{ok:true}});
  await request;assert.equal(indicator.pending,0);
  assert.equal(busyStates.at(-1),false);
}
context.fetchJsonBounded=async()=>{throw Object.assign(new Error("sensitive provider detail"),{code:"request_timeout"})};
assert.equal(await context.requestAdvice("player"),null);
assert.equal(indicator.pending,0);
await assert.rejects(context.fetchWarBoostScan({}),error=>error.code==="SCAN_REQUEST_TIMEOUT"&&!error.message.includes("sensitive"));
assert.equal(indicator.pending,0);
assert.equal(context.activeLoadingOperations,0);
context.fetchJsonBounded=async()=>({response:{ok:true},json:{state:{}}});
await context.fetchWarBoostScan({});assert.equal(indicator.pending,0);

let checks=0;
for(const [code] of LANGUAGES.filter(([code])=>code!=="auto")){
  assert.equal(resolveLanguage(code),code);
  assert.equal(dirFor(code),code==="ar"?"rtl":"ltr");
  const pack=ANALYSIS_SCAN_TRANSLATIONS[code];assert.ok(pack,code);
  assert.equal(analysisFailureMessage({message:"private provider detail"},translator(code)),translator(code)("scan_error"));
  assert.equal(analysisFailureMessage({code:"SCAN_REQUEST_TIMEOUT",message:"private"},translator(code)),translator(code)("scan_timeout"));
  for(const key of ANALYSIS_COPY_KEYS){
    assert.ok(pack[key],`${code}/${key}`);
    const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
    assert.deepEqual(placeholders(pack[key]),placeholders(ANALYSIS_SCAN_TRANSLATIONS["en-GB"][key]));
    const rendered=translator(code)(key,{squad:"2",limit:6});
    assert.notEqual(rendered,key);assert.doesNotMatch(rendered,/\{\w+\}/);
    checks++;
  }
}
const css=fs.readFileSync("analysis-indicator.css","utf8");
assert.match(css,/prefers-reduced-motion/);assert.match(css,/pointer-events:\s*none/);
assert.match(css,/hidden/);assert.match(css,/rotate\(360deg\)/);
assert.match(css,/#scanStatus\[data-wb-analysis-active="true"\]::before/);
assert.match(css,/content:\s*"W"\s*\/\s*""/);
assert.match(css,/float:\s*left/);
console.log(`PASS indicator concurrency, cancellation, stale completion, actual request lifecycles and ${checks} localized messages; DOM isolated, no live provider`);
