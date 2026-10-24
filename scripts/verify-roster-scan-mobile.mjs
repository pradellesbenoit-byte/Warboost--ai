import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {sanitizeRosterRows,promptFor} from "../api/scan.js";
import {cleanRosterOcrName,rosterIdentityKey} from "../lib/roster-identity-resolution.js";
import {parseRosterConfidence} from "../lib/roster-sync.js";
const app=readFileSync("app.js","utf8"),html=readFileSync("index.html","utf8");
const functionSource=name=>{
  const start=app.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing ${name}`);
  return app.slice(start,app.indexOf("\n}",start)+2);
};
const listener=id=>{
  const start=app.indexOf(`$("#${id}")?.addEventListener("click",`);
  assert.ok(start>=0,`missing ${id}`);
  return app.slice(start,app.indexOf("\n});",start)+4);
};
function harness(replies=[]){
  const nodes={},handlers={};
  for(const id of ["rosterScanStatus","rosterScanAnalyzeBtn","rosterScanAddMemberBtn","rosterScanFullSnapshot"])
    nodes[id]={id,disabled:false,checked:false,textContent:"Analyze",classList:{remove(){},add(){}},addEventListener(event,fn){handlers[id]=fn}};
  let calls=0,finishes=0;
  const ctx={
    $:selector=>nodes[selector.slice(1)]||null,
    hasDeclaredAllianceCommandRole:()=>true,showAllianceRoleGuard:()=>{},
    requireBetaAccess:()=>true,requireBetaConsent:()=>true,
    cloudSession:{access_token:"synthetic"},scanInputRevision:1,pendingScanOwner:()=>"synthetic-owner",
    rosterScanFiles:replies.map((_,i)=>({synthetic:i})),rosterScanDraft:[],
    currentRosterIdentityContext:()=>({alliance_tag:"ALL4"}),parseRosterConfidence,cleanRosterOcrName,rosterIdentityKey,
    resolveCurrentRosterScanDraft:rows=>rows,renderRosterScanDraft:()=>{},
    collectRosterScanDraftFromDom:()=>ctx.rosterScanDraft,
    beginActiveLoadingOperation:()=>()=>{finishes++},
    imageToDataUrl:async()=>null,
    fetchWarBoostScan:async()=>{
      const reply=replies[calls++];if(reply instanceof Error)throw reply;return reply;
    },
    state:{},rosterImportInFlight:false,lang:"fr",t:(key,params={})=>key+JSON.stringify(params),
    analysisFailureMessage:()=>"safe-error"
  };
  vm.createContext(ctx);
  vm.runInContext(functionSource("scanRole")+"\n"+functionSource("mergeRosterScanRows")+"\n"+listener("rosterScanAnalyzeBtn"),ctx);
  return {ctx,nodes,handlers,get calls(){return calls},get finishes(){return finishes}};
}
const ok=name=>({response:{ok:true,status:200},json:{roster_rows:[{name,role:null,hq_level:35,power_m:304.3}]}});
const unread={response:{ok:false,status:422},json:{error:"scan_no_useful_data"}};
test("roster status immediately follows analyze button; manual button and unchecked complete list",()=>{
  assert.match(html, /id="rosterScanAnalyzeBtn"[^>]*>[^<]*<\/button><div id="rosterScanStatus"/);
  assert.match(html,/id="rosterScanAddMemberBtn"/);
  assert.doesNotMatch(html,/id="rosterScanFullSnapshot"[^>]*checked/);
});
test("profile prompt retains readable nickname when rank absent",()=>{
  assert.doesNotMatch(promptFor("alliance_roster","fr","ALL4"),/nickname or role cannot/);
  assert.match(promptFor("alliance_roster","fr","ALL4"),/human.*R1.*R5/i);
});
test("individual profile retains uppercase I, unknown rank and header HQ, not alliance name",()=>{
  const rows=sanitizeRosterRows({screen_type:"player_profile",player_profile:{
    name:"Seth I",header:"Niv.35 [ALL4]Seth I",role:null,hq_level:35,power_m:304.3,
    alliance_name:"[ALL4]ALL FOR 1",other_level:100,server_id:"884"
  }},"2026-01-01T00:00:00Z","ALL4");
  assert.equal(rows.length,1);assert.equal(rows[0].name,"Seth I");
  assert.equal(rows[0].role,null);assert.equal(rows[0].hq_level,35);assert.equal(rows[0].power_m,304.3);
  assert.equal(rows[0].rank_confirmation_status,"unconfirmed");
  assert.equal(sanitizeRosterRows({player_profile:{name:"ALL FOR 1",alliance_name:"ALL FOR 1"}},"now").length,0);
});
test("real batch handler keeps rows when one image is unreadable",async()=>{
  const h=harness([ok("Synthetic A"),unread,ok("Synthetic B")]);
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.calls,3);assert.equal(h.ctx.rosterScanDraft.length,2);
  assert.match(h.nodes.rosterScanStatus.textContent,/unreadable.*1/);
  assert.equal(h.finishes,1);assert.equal(h.nodes.rosterScanAnalyzeBtn.disabled,false);
});
test("real batch handler preserves previous draft and successful rows on timeout",async()=>{
  const h=harness([ok("Synthetic B"),Error("synthetic timeout")]);
  h.ctx.rosterScanDraft=[{name:"Synthetic A",role:"R3"}];
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.ctx.rosterScanDraft.length,2);
  assert.match(h.nodes.rosterScanStatus.textContent,/safe-error/);
  assert.equal(h.finishes,1);
});
test("all unreadable images remain warnings, no invented member",async()=>{
  const h=harness([unread,unread]);await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.ctx.rosterScanDraft.length,0);assert.match(h.nodes.rosterScanStatus.textContent,/unreadable.*2/);
});
test("unreadable image count survives a subsequent fatal error",async()=>{
  const h=harness([ok("Synthetic A"),unread,Error("synthetic failure")]);
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.ctx.rosterScanDraft.length,1);
  assert.match(h.nodes.rosterScanStatus.textContent,/safe-error.*unreadable.*1/);
});
test("manual real handler requires verified manager and starts with no rank",()=>{
  const h=harness();vm.runInContext(functionSource("addManualRosterScanMember")+"\n"+listener("rosterScanAddMemberBtn"),h.ctx);
  h.ctx.hasDeclaredAllianceCommandRole=()=>false;h.handlers.rosterScanAddMemberBtn();
  assert.equal(h.ctx.rosterScanDraft.length,0);
  h.ctx.hasDeclaredAllianceCommandRole=()=>true;h.handlers.rosterScanAddMemberBtn();
  assert.equal(h.ctx.rosterScanDraft.length,1);assert.equal(h.ctx.rosterScanDraft[0].role,null);
  assert.equal(h.ctx.rosterScanDraft[0].name,"");assert.equal(h.nodes.rosterScanFullSnapshot.checked,false);
});
test("duplicate observations merge, without changing distinct nicknames",()=>{
  const h=harness();
  assert.equal(h.ctx.mergeRosterScanRows([],[{name:"Seth I"},{name:"Seth I"},{name:"Seth II"}]).length,2);
});
test("late batch response cannot cross owner or revision boundary",async()=>{
  const h=harness([ok("Synthetic A")]);let resolve;
  h.ctx.fetchWarBoostScan=()=>new Promise(done=>{resolve=done});
  const request=h.handlers.rosterScanAnalyzeBtn();
  await new Promise(done=>setImmediate(done));
  h.ctx.scanInputRevision++;
  resolve(ok("Synthetic A"));await request;
  assert.equal(h.ctx.rosterScanDraft.length,0);assert.equal(h.finishes,1);
});
test("manual action is blocked during scan or import",()=>{
  const h=harness();vm.runInContext(functionSource("addManualRosterScanMember"),h.ctx);
  h.nodes.rosterScanAnalyzeBtn.disabled=true;h.ctx.addManualRosterScanMember();
  assert.equal(h.ctx.rosterScanDraft.length,0);
  h.nodes.rosterScanAnalyzeBtn.disabled=false;h.ctx.rosterImportInFlight=true;
  h.ctx.addManualRosterScanMember();assert.equal(h.ctx.rosterScanDraft.length,0);
});
function importHarness(){
  const h=harness(),start=app.indexOf('$("#rosterScanImportBtn")?.addEventListener("click",');
  h.nodes.rosterScanImportBtn={addEventListener(event,fn){h.handlers.import=fn}};
  Object.assign(h.ctx,{
    rosterScanHasUnresolvedIdentity:()=>false,
    applyRosterRows:async()=>({synced:false}),clearPendingRosterFiles:()=>{throw Error("must not clear failed import")},
    renderRosterScanFiles:()=>{}
  });
  vm.runInContext(app.slice(start,app.indexOf("\n",start)),h.ctx);
  return h;
}
test("real import handler refuses missing grade and unresolved identity",async()=>{
  const h=importHarness();let imports=0;
  h.ctx.applyRosterRows=async()=>{imports++;return {synced:false}};
  h.ctx.rosterScanDraft=[{name:"Synthetic A",role:null}];
  await h.handlers.import();assert.equal(imports,0);
  h.ctx.rosterScanDraft[0].role="R3";h.ctx.rosterScanHasUnresolvedIdentity=()=>true;
  await h.handlers.import();assert.equal(imports,0);
});
test("real import handler is additive by default and preserves draft on cloud failure",async()=>{
  const h=importHarness();h.ctx.rosterScanDraft=[{name:"Synthetic A",role:"R3",hq_level:35}];
  let options;
  h.ctx.applyRosterRows=async(rows,opts)=>{options=opts;return {synced:false}};
  await h.handlers.import();
  assert.equal(options.complete,false);assert.equal(h.ctx.rosterScanDraft.length,1);
});
