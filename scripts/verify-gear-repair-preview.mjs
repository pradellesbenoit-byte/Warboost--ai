import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {createGearRepairPreview,equipmentRepairCandidates} from "../lib/gear-repair-preview.js";
import {gearRepairPreviewHtml} from "../lib/gear-repair-preview-view.js";
import {gearRepairPreviewCopy} from "../lib/gear-repair-preview-copy.js";
import {projectSquads} from "../lib/squad-comparison.js";
import {createSquadCompareHandler} from "../lib/squad-compare-handler.js";
import {confirmedSquad,fixtureProfile,clone,at} from "./fixtures/squad-comparison.mjs";
let groups=0,labels=0;
async function test(name,fn){await fn();groups++;console.log("PASS "+name);}
const full=Array.from({length:4},(_,slot)=>`slot=${slot};count=1;level=${slot===0?0:40};rarity=orange`).join("|");
function profiles(){
  const local=fixtureProfile();local.squads=[1,2,3,4].map(confirmedSquad);
  local.squads.forEach(q=>q.heroes.forEach(h=>h.gear=full));
  const cloud=clone(local);
  cloud.squads.forEach(q=>q.heroes.forEach(h=>h.gear=full.slice(0,120)));
  return {local,cloud};
}
function harness(){
  const {local,cloud}=profiles();
  const ctx={allowed:true,owner:local.player_id,session:"synthetic-session",revision:at,local};
  let calls=0,reply={response:{ok:true,status:200},json:{ok:true,read_only:true,profile_present:true,
    revision:at,checked_at:at,squads:projectSquads(cloud.squads)}};
  const controller=createGearRepairPreview({context:()=>ctx,request:async()=>{calls++;return reply;}});
  return {ctx,controller,cloud,get calls(){return calls;},set reply(value){reply=value;}};
}
const candidates=(local,cloud)=>equipmentRepairCandidates(projectSquads(local.squads),projectSquads(cloud.squads));
const copy=gearRepairPreviewCopy("fr");
const t=(key,vars={})=>Object.entries(vars).reduce((s,[name,value])=>s.replaceAll(`{${name}}`,value),copy[key]||key);
await test("four squads and twenty separate slots, no implicit selection or attestation",()=>{
  const {local,cloud}=profiles(),before=JSON.stringify([local,cloud]),rows=candidates(local,cloud);
  assert.equal(rows.length,20);assert.equal(new Set(rows.map(r=>r.id)).size,20);
  assert.ok(rows.every(r=>r.eligible&&!r.selected&&!r.verified));
  assert.equal(rows[0].localPieces[0].level,0);assert.equal(rows[0].cloudPieces.length,3);
  assert.equal(JSON.stringify([local,cloud]),before);
});
await test("only incomplete cloud equipment is offered, never arbitrary other gear",()=>{
  const {local,cloud}=profiles();cloud.squads.forEach(q=>q.heroes.forEach(h=>h.gear=full));
  assert.equal(candidates(local,cloud).length,0);
});
await test("legacy identity without explicit proof cannot be repaired",()=>{
  const {local,cloud}=profiles();local.squads[0].composition_source="legacy_backfill";
  assert.ok(candidates(local,cloud).filter(r=>r.squad===1).every(r=>!r.eligible&&r.reason==="identity_unverified"));
});
await test("different canonical hero at same slot is blocked; no positional guess",()=>{
  const {local,cloud}=profiles();
  cloud.squads[0].heroes[0].name="DVA";cloud.squads[0].confirmed_composition[0]="DVA";
  const row=candidates(local,cloud)[0];assert.equal(row.eligible,false);assert.equal(row.reason,"identity_unverified");
});
await test("ambiguous duplicate hero identities remain blocked",()=>{
  const {local,cloud}=profiles();local.squads[0].heroes[1].name=local.squads[0].heroes[0].name;
  assert.ok(candidates(local,cloud).filter(r=>r.squad===1).every(r=>!r.eligible));
});
await test("absent unreadable zero scalar and grouped legacy gear are not complete candidates",()=>{
  for(const input of [null,"","Non détecté",0,"0","level=0","count=4;level=40;rarity=orange",{},[]]){
    const {local,cloud}=profiles();local.squads[0].heroes[0].gear=input;
    const row=candidates(local,cloud)[0];assert.equal(row.eligible,false);assert.equal(row.reason,"local_incomplete");
  }
});
await test("explicit zero on a known piece is retained, not made absent",()=>{
  const {local,cloud}=profiles();const row=candidates(local,cloud)[0];
  assert.equal(row.localPieces[0].level,0);assert.equal(row.cloudPieces[0].level,0);assert.equal(row.eligible,true);
});
await test("missing attribute or damaged fourth local piece blocks eligibility",()=>{
  for(const value of [full.replace(";level=40;rarity=orange",";rarity=orange"),full.slice(0,120)]){
    const {local,cloud}=profiles();local.squads[0].heroes[0].gear=value;
    assert.equal(candidates(local,cloud)[0].eligible,false);
  }
});
await test("a certain readable difference must not be replaced by a proposed repair",()=>{
  const {local,cloud}=profiles();cloud.squads[0].heroes[0].gear=full.slice(0,120).replace("level=0","level=1");
  const row=candidates(local,cloud)[0];assert.equal(row.eligible,false);assert.equal(row.reason,"readable_difference");
});
await test("field confirmation proof remains separate from readable format",()=>{
  const {local,cloud}=profiles();delete local.squads[0].heroes[0].field_source.gear;
  const row=candidates(local,cloud)[0];assert.equal(row.eligible,true);assert.equal(row.localConfirmed,false);
  assert.equal(row.verified,false);
});
await test("historical freshness markers are retained and not promoted to proof",()=>{
  const {local,cloud}=profiles();local.squads[0].composition_conflict={reason:"squad_freshness_ambiguous",status:"needs_verification"};
  const before=JSON.stringify(local);assert.equal(candidates(local,cloud).length,20);assert.equal(JSON.stringify(local),before);
});
await test("no network until explicit opening; reading only cannot select or confirm",async()=>{
  const h=harness();assert.equal(h.calls,0);assert.equal(h.controller.view().kind,"idle");
  await h.controller.prepare();assert.equal(h.calls,1);assert.equal(h.controller.view().stage,"selection");
  assert.equal(h.controller.review(),false);assert.ok(h.controller.view().candidates.every(r=>!r.selected&&!r.verified));
});
await test("selection and separate Last War attestation are both required",async()=>{
  const h=harness();await h.controller.prepare();
  assert.equal(h.controller.verify("1:1",true),false);h.controller.select("1:1",true);
  assert.equal(h.controller.review(),false);h.controller.verify("1:1",true);
  assert.equal(h.controller.review(),true);assert.equal(h.controller.view().stage,"preview");assert.equal(h.calls,1);
  assert.equal(h.controller.save,undefined);
});
await test("all selected items require attestation; deselection resets consent",async()=>{
  const h=harness();await h.controller.prepare();
  h.controller.select("1:1",true);h.controller.verify("1:1",true);h.controller.select("2:3",true);
  assert.equal(h.controller.review(),false);h.controller.select("2:3",false);
  h.controller.select("1:1",false);h.controller.select("1:1",true);
  assert.equal(h.controller.review(),false);
});
await test("forged numeric IDs and ineligible rows cannot be selected",async()=>{
  const h=harness();h.ctx.local.squads[0].heroes[0].gear=null;await h.controller.prepare();
  for(const id of ["1:1","5:1","1:6","../other","<script>"])assert.equal(h.controller.select(id,true),false);
});
await test("review cancel restart loses all ephemeral selections and never changes gameplay",async()=>{
  const h=harness(),before=JSON.stringify([h.ctx.local,h.cloud]);
  await h.controller.prepare();h.controller.select("4:5",true);h.controller.verify("4:5",true);h.controller.review();
  h.controller.close();assert.equal(h.controller.view().kind,"idle");await h.controller.prepare();
  assert.ok(h.controller.view().candidates.every(r=>!r.selected&&!r.verified));assert.equal(JSON.stringify([h.ctx.local,h.cloud]),before);
});
await test("local edits revision changes and session changes invalidate the whole preview",async()=>{
  for(const change of [
    h=>h.ctx.local.squads[3].heroes[0].stars=0,
    h=>h.ctx.revision="2026-10-16T00:00:00Z",
    h=>h.ctx.session="new-session",h=>h.ctx.owner="other",h=>h.ctx.allowed=false
  ]){
    const h=harness();await h.controller.prepare();h.controller.select("1:1",true);h.controller.verify("1:1",true);
    change(h);assert.equal(h.controller.view().kind,"stale");assert.equal(h.controller.review(),false);
    assert.equal(h.controller.view().candidates,undefined);
  }
});
await test("returned candidate copies cannot mutate private state",async()=>{
  const h=harness();await h.controller.prepare();h.controller.view().candidates[0].verified=true;
  assert.equal(h.controller.view().candidates[0].verified,false);
});
await test("unauthorized context never makes a request",async()=>{
  for(const edit of [h=>h.ctx.allowed=false,h=>h.ctx.session="",h=>h.ctx.local.player_id="other"]){
    const h=harness();edit(h);await h.controller.prepare();assert.equal(h.calls,0);assert.equal(h.controller.view().kind,"error");
  }
});
await test("HTTP refusals do not expose backend body or preserve selectable data",async()=>{
  for(const [status,reason] of [[401,"auth"],[403,"forbidden"],[428,"consent"],[409,"conflict"],[500,"server"],[503,"server"],[504,"timeout"]]){
    const h=harness();h.reply={response:{ok:false,status},json:{error:"PRIVATE_SQL_OR_TOKEN"}};
    await h.controller.prepare();assert.deepEqual(h.controller.view(),{kind:"error",reason});
    assert.doesNotMatch(JSON.stringify(h.controller.view()),/PRIVATE_SQL_OR_TOKEN/);
  }
});
await test("unverified read receipt or missing profile blocks preview",async()=>{
  for(const delta of [{ok:false},{read_only:false},{profile_present:false},{revision:null},{checked_at:"invalid"},{squads:{schema:0}}]){
    const h=harness();h.reply={response:{ok:true,status:200},json:{ok:true,read_only:true,profile_present:true,
      checked_at:at,revision:at,squads:projectSquads(h.cloud.squads),...delta}};
    await h.controller.prepare();assert.equal(h.controller.view().reason,"unconfirmed");
  }
});
await test("double click shares the in-flight read; cancel ignores late responses",async()=>{
  const h=harness();let release,calls=0;
  const ctrl=createGearRepairPreview({context:()=>h.ctx,request:()=>{calls++;return new Promise(r=>release=r);}});
  const p=ctrl.prepare();await ctrl.prepare();assert.equal(calls,1);ctrl.close();
  release({response:{ok:true},json:{ok:true,read_only:true,profile_present:true,revision:at,checked_at:at,squads:projectSquads(h.cloud.squads)}});
  await p;assert.equal(ctrl.view().kind,"idle");
});
await test("reordered response across sessions cannot overwrite a newer preview",async()=>{
  const h=harness(),pending=[];
  const ctrl=createGearRepairPreview({context:()=>h.ctx,request:()=>new Promise(r=>pending.push(r))});
  const old=ctrl.prepare();h.ctx.session="renewed";ctrl.view();const current=ctrl.prepare();
  const reply={response:{ok:true},json:{ok:true,read_only:true,profile_present:true,revision:at,checked_at:at,squads:projectSquads(h.cloud.squads)}};
  pending[1](reply);await current;pending[0]({response:{ok:false,status:401},json:{}});await old;
  assert.equal(ctrl.view().kind,"result");
});
await test("network and timeout are safe errors, not a saved result",async()=>{
  for(const code of ["NETWORK","REQUEST_TIMEOUT","AbortError"]){
    const h=harness();const ctrl=createGearRepairPreview({context:()=>h.ctx,request:async()=>{throw {code};}});
    await ctrl.prepare();assert.equal(ctrl.view().reason,code==="NETWORK"?"network":"timeout");
  }
});
await test("renderer keeps explicit zero and unknown fourth cloud piece separate",async()=>{
  const h=harness();await h.controller.prepare();const html=gearRepairPreviewHtml(h.controller.view(),t);
  assert.match(html,/Niveau: 0/);assert.match(html,/Pièce 4<\/b> — Inconnu/);
  assert.match(html,/transaction serveur atomique/);assert.doesNotMatch(html,/data-gear-repair-save/);
  assert.doesNotMatch(html,/<input[^>]+checked/);
});
await test("final preview only includes chosen candidates; save always disabled with no handler",async()=>{
  const h=harness();await h.controller.prepare();h.controller.select("2:3",true);h.controller.verify("2:3",true);h.controller.review();
  const html=gearRepairPreviewHtml(h.controller.view(),t);
  assert.match(html,/Escouade 2 · Emplacement du héros 3/);assert.doesNotMatch(html,/Escouade 1 · Emplacement/);
  assert.match(html,/<button type="button" class="btn" disabled>Enregistrer<\/button>/);
});
await test("local saved proof does not create current preview consent",async()=>{
  const h=harness();await h.controller.prepare();
  const html=gearRepairPreviewHtml(h.controller.view(),t);
  assert.ok(h.controller.view().candidates.every(r=>r.localConfirmed&&!r.verified));
  assert.match(html,/Pas encore vérifié dans Last War/);assert.match(html,/data-gear-repair-verify="1:1" disabled/);
});
await test("renderer escapes values and never interpolates raw error details",()=>{
  const row={...equipmentRepairCandidates(projectSquads(profiles().local.squads),projectSquads(profiles().cloud.squads))[0]};
  row.localPieces[0].level='<img src=x onerror=alert(1)>';
  const html=gearRepairPreviewHtml({kind:"result",stage:"selection",candidates:[row]},t);
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
  assert.doesNotMatch(gearRepairPreviewHtml({kind:"error",reason:"SECRET_TOKEN"},t),/SECRET_TOKEN/);
});
await test("22 languages / 23 locales cover every new UI key including all errors",()=>{
  const codes=["fr","en","de","es","it","pt","ru","uk","pl","tr","ar","ja","ko","zh","id","vi","th","hi","ro","cs","nl","sv","en"];
  const keys=Object.keys(copy);assert.equal(keys.length,63);
  for(const code of codes){
    const translated=gearRepairPreviewCopy(code);assert.deepEqual(Object.keys(translated),keys);
    for(const key of keys){assert.equal(typeof translated[key],"string");assert.ok(translated[key].trim());labels++;}
  }
});
await test("real GET dispatch is owner authenticated consent protected RLS scoped with no write calls",async()=>{
  let reads=0;
  const handler=createSquadCompareHandler({requireUser:async()=>({id:"synthetic-owner"}),consentVersion:"synthetic-consent",
    readForUser:async(owner,token,options)=>{
      reads++;assert.equal(owner,"synthetic-owner");assert.equal(token,"synthetic-test-bearer");assert.equal(options.timeoutMs,6000);
      return {squads:profiles().cloud.squads,updated_at:at};
    }});
  function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(x){this.body=x;return this;}};}
  const req={method:"GET",query:{},headers:{authorization:"Bearer synthetic-test-bearer","x-warboost-beta-consent":"synthetic-consent"}};
  const good=response();await handler(req,good);assert.equal(good.statusCode,200);assert.equal(good.body.read_only,true);
  assert.equal(good.headers["Cache-Control"],"no-store");
  const post=response();await handler({...req,method:"POST"},post);assert.equal(post.statusCode,405);assert.equal(reads,1);
  const consent=response();await handler({...req,headers:{authorization:req.headers.authorization}},consent);assert.equal(consent.statusCode,428);
  const forged=response();await handler({...req,query:{player_id:"another-owner"}},forged);assert.equal(forged.statusCode,400);assert.equal(reads,1);
});
await test("integration only uses dedicated GET and existing inline W; no persistence exports",async()=>{
  const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
  const path=app.slice(app.indexOf("const squadReadContext"),app.indexOf("function renderAccountSquadReviewDiagnostic"));
  assert.match(path,/method:"GET",cache:"no-store",redirect:"error"/);
  assert.match(path,/kind:"sync:gear-preview"/);assert.match(path,/gearRepairLoading\.finish/);
  assert.match(app,/analysisIndicator\.has\("sync:gear-preview"\)\|\|analysisIndicator\.has\("sync:compare"\)\?\[\]/);
  assert.doesNotMatch(path,/\bsaveState\(|\bpushServerState\(|method:"POST"|cloudRevision\s*=/);
  const source=await readFile(new URL("../lib/gear-repair-preview.js",import.meta.url),"utf8");
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\.|\.saveState\(|method:\s*["']POST/);
});
await test("actual app renderer wires selection attestation preview and cancellation without saving",async()=>{
  const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
  const start=app.indexOf("function renderGearRepairControls(");
  const source=app.slice(start,app.indexOf("function renderSquadComparisonControls(",start));
  const h=harness(),before=JSON.stringify(h.ctx.local),nodes=new Map();
  let finishCount=0,startCount=0,requests=0,release,context;
  const element=()=>({listeners:{},append(...children){for(const child of children)nodes.set(child.id,child);},
    addEventListener(name,fn){this.listeners[name]=fn;},contains(){return false;}});
  nodes.set("squadCompareControls",element());
  const controller=createGearRepairPreview({context:()=>h.ctx,
    request:()=>{requests++;return new Promise(resolve=>release=resolve);},
    onChange:()=>context.renderGearRepairControls()});
  context=vm.createContext({gearRepairLoading:null,gearRepairPreview:controller,
    squadComparison:{view:()=>({kind:"result"})},gearRepairPreviewHtml,gearRepairText:t,
    locale:"fr",Intl,Date,$:selector=>nodes.get(selector.slice(1)),document:{createElement:element},
    analysisIndicator:{},beginLoadingButton:(_indicator,button,options)=>{
      startCount++;assert.equal(options.kind,"sync:gear-preview");
      button.textContent=options.label();return ()=>{finishCount++;};
    }});
  vm.runInContext(source,context);context.renderGearRepairControls();
  assert.equal(requests,0);const button=nodes.get("squadGearRepairBtn"),result=nodes.get("squadGearRepairResult");
  const reading=button.listeners.click();assert.equal(button.disabled,true);assert.equal(startCount,1);
  assert.match(result.innerHTML,/data-gear-repair-close/);
  release({response:{ok:true,status:200},json:{ok:true,read_only:true,profile_present:true,
    checked_at:at,revision:at,squads:projectSquads(h.cloud.squads)}});
  await reading;assert.equal(button.disabled,false);assert.equal(finishCount,1);
  function change(key){
    result.listeners.change({target:{checked:true,dataset:{[key]:"3:2"},
      matches:selector=>selector===`[data-${key.replace(/[A-Z]/g,c=>"-"+c.toLowerCase())}]`}});
  }
  change("gearRepairSelect");assert.equal(controller.review(),false);change("gearRepairVerify");
  result.listeners.click({target:{closest:selector=>selector==="[data-gear-repair-review]"}});
  assert.equal(controller.view().stage,"preview");assert.match(result.innerHTML,/<button type="button" class="btn" disabled>Enregistrer/);
  result.listeners.click({target:{closest:selector=>selector==="[data-gear-repair-close]"}});
  assert.equal(controller.view().kind,"idle");assert.equal(requests,1);assert.equal(JSON.stringify(h.ctx.local),before);
});
await test("mobile presentation has wrapping buttons 44px controls and no forced fixed panel width",async()=>{
  const css=await readFile(new URL("../squad-review-status.css",import.meta.url),"utf8");
  assert.match(css,/#squadGearRepairBtn,\.gearRepairPreview \.btn\{[^}]*width:100%[^}]*white-space:normal/);
  assert.match(css,/\.gearRepairPreview label\{[^}]*min-height:44px/);
  assert.match(css,/\.gearRepairPreview\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/);
});
console.log(`PASS gear repair preview: ${groups} groups; ${labels} localized labels; synthetic data only; no real writes.`);
