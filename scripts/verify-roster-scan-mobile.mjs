import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {sanitizeRosterRows,promptFor} from "../api/scan.js";
import {cleanRosterOcrName,rosterIdentityKey} from "../lib/roster-identity-resolution.js";
import {parseRosterConfidence} from "../lib/roster-sync.js";
import {translator} from "../i18n.js";
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
function harness(replies=[],fileCount=replies.length){
  const nodes={},handlers={};
  for(const id of ["rosterScanStatus","rosterScanAnalyzeBtn","rosterScanAddMemberBtn","rosterScanFullSnapshot"])
    nodes[id]={id,disabled:false,checked:false,textContent:"Analyze",classList:{remove(){},add(){}},addEventListener(event,fn){handlers[id]=fn}};
  let calls=0,finishes=0;
  const ctx={
    $:selector=>nodes[selector.slice(1)]||null,
    hasDeclaredAllianceCommandRole:()=>true,showAllianceRoleGuard:()=>{},
    requireBetaAccess:()=>true,requireBetaConsent:()=>true,
    cloudSession:{access_token:"synthetic",user:{id:"synthetic-user"}},scanInputRevision:1,pendingScanOwner:()=>"synthetic-owner",
    rosterScanFiles:Array.from({length:fileCount},(_,i)=>({synthetic:i,name:`capture-${i+1}.png`,size:850000,lastModified:i})),rosterScanDraft:[],
    rosterScanCaptureStates:new Map(),rosterScanFileKey:file=>`synthetic-${file.synthetic}`,renderRosterScanFiles:()=>{},
    currentRosterIdentityContext:()=>({alliance_tag:"ALL4"}),parseRosterConfidence,cleanRosterOcrName,rosterIdentityKey,
    resolveCurrentRosterScanDraft:rows=>rows,renderRosterScanDraft:()=>{},
    collectRosterScanDraftFromDom:()=>ctx.rosterScanDraft,
    beginActiveLoadingOperation:()=>()=>{finishes++},
    imageToDataUrl:async file=>`data:image/jpeg;base64,synthetic-${file.synthetic}`,
    fetchWarBoostScan:async(options)=>{
      ctx.lastRequest=options;
      const reply=replies[calls++];if(reply instanceof Error)throw reply;return reply;
    },
    state:{},rosterImportInFlight:false,lang:"fr",t:(key,params={})=>key+JSON.stringify(params),
    analysisFailureMessage:()=>"safe-error"
  };
  vm.createContext(ctx);
  vm.runInContext([
    functionSource("scanRole"),functionSource("mergeRosterScanRows"),
    functionSource("rosterScanFileStatus"),functionSource("rosterScanErrorKind"),
    functionSource("rosterScanErrorMessage"),listener("rosterScanAnalyzeBtn")
  ].join("\n"),ctx);
  return {ctx,nodes,handlers,replies,get calls(){return calls},get finishes(){return finishes}};
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
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-0"),"success");
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-1"),"unreadable");
  assert.equal(h.finishes,1);assert.equal(h.nodes.rosterScanAnalyzeBtn.disabled,false);
});
test("one capture succeeds with a minimal owner/alliance context and no roster write",async()=>{
  const h=harness([ok("Synthetic A")]);
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.calls,1);
  assert.equal(h.ctx.lastRequest.current_state.player_id,"synthetic-user");
  assert.equal(h.ctx.lastRequest.current_state.alliance.tag,"");
  assert.equal(Object.hasOwn(h.ctx.lastRequest.current_state,"privateData"),false);
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-0"),"success");
  assert.doesNotMatch(listener("rosterScanAnalyzeBtn"),/applyRosterRows/);
});
test("twelve captures run sequentially with per-capture status",async()=>{
  const replies=Array.from({length:12},(_,i)=>ok(`Synthetic ${i+1}`)),h=harness(replies,12);
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.calls,12);
  assert.equal(h.ctx.rosterScanDraft.length,12);
  assert.equal(h.ctx.rosterScanCaptureStates.size,12);
  assert.ok([...h.ctx.rosterScanCaptureStates.values()].every(value=>value==="success"));
  assert.match(h.nodes.rosterScanStatus.textContent,/roster_scan_ready/);
});
test("oversize capture is isolated and later captures still succeed",async()=>{
  const h=harness([{response:{ok:false,status:413},json:{error:"image_too_large",message:"private detail"}},ok("Synthetic B")],2);
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.calls,2);
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-0"),"too_large");
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-1"),"success");
  assert.equal(h.ctx.rosterScanDraft.length,1);
  assert.match(h.nodes.rosterScanStatus.textContent,/roster_scan_files_failed/);
  assert.doesNotMatch(h.nodes.rosterScanStatus.textContent,/private detail/);
});
test("HTTP auth and permission failures stop the queue with safe status",async()=>{
  for(const [httpStatus,expected] of [[401,"auth"],[403,"forbidden"]]){
    const h=harness([{response:{ok:false,status:httpStatus},json:{error:"denied",message:"secret response"}}],4);
    await h.handlers.rosterScanAnalyzeBtn();
    assert.equal(h.calls,1);
    assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-0"),expected);
    assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-1"),undefined);
    assert.match(h.nodes.rosterScanStatus.textContent,new RegExp(`roster_scan_error_${expected}`));
    assert.doesNotMatch(h.nodes.rosterScanStatus.textContent,/secret response/);
  }
});
test("HTTP status and timeout/network errors map to safe categories",()=>{
  const h=harness([]);
  for(const [status,expected] of [[429,"rate_limited"],[413,"too_large"],[401,"auth"],[403,"forbidden"],[503,"server"]])
    assert.equal(h.ctx.rosterScanErrorKind({status},null),expected);
  assert.equal(h.ctx.rosterScanErrorKind(null,Object.assign(new Error("timeout"),{code:"SCAN_REQUEST_TIMEOUT"})),"timeout");
  assert.equal(h.ctx.rosterScanErrorKind(null,new TypeError("offline")),"network");
});
test("roster scan error and status copy is localized with English fallback",()=>{
  const keys=["roster_scan_retry_failed","roster_scan_files_failed","roster_capture_status_pending","roster_capture_status_processing","roster_capture_status_success","roster_capture_status_unreadable","roster_capture_status_too_large","roster_capture_status_rate_limited","roster_capture_status_auth","roster_capture_status_forbidden","roster_capture_status_server","roster_capture_status_network","roster_capture_status_timeout","roster_capture_status_invalid","roster_capture_status_failed","roster_scan_error_rate_limited","roster_scan_error_too_large","roster_scan_error_auth","roster_scan_error_forbidden","roster_scan_error_server","roster_scan_error_network","roster_scan_error_timeout","roster_scan_error_failed"];
  for(const locale of ["fr","en","es"]){
    const t=translator(locale);
    for(const key of keys){
      const copy=t(key,{count:2,seconds:60,done:3,total:12});
      assert.notEqual(copy,key,`${locale} missing ${key}`);
      assert.doesNotMatch(copy,/\{(?:count|seconds|done|total)\}/,`${locale} has unsubstituted variables in ${key}`);
    }
  }
});
test("429 pauses without retry storm; next click retries only failed and pending captures",async()=>{
  const replies=[ok("Synthetic A"),{response:{ok:false,status:429,headers:{get:()=> "60"}},json:{error:"rate_limited",message:"secret provider detail"}}];
  const h=harness(replies,12);
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.calls,2);
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-0"),"success");
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-1"),"rate_limited");
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-2"),undefined);
  assert.match(h.nodes.rosterScanStatus.textContent,/roster_scan_error_rate_limited/);
  assert.doesNotMatch(h.nodes.rosterScanStatus.textContent,/secret provider detail/);
  for(let i=0;i<11;i++)replies.push(ok(`Retry ${i+1}`));
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.calls,13);
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-0"),"success");
  assert.ok([...h.ctx.rosterScanCaptureStates.values()].every(value=>value==="success"));
});
test("timeout preserves the earlier draft and marks only the interrupted capture",async()=>{
  const timeout=Object.assign(new Error("synthetic timeout"),{code:"SCAN_REQUEST_TIMEOUT"});
  const h=harness([ok("Synthetic B"),timeout]);
  h.ctx.rosterScanDraft=[{name:"Synthetic A",role:"R3"}];
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.ctx.rosterScanDraft.length,2);
  assert.match(h.nodes.rosterScanStatus.textContent,/roster_scan_error_timeout/);
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-0"),"success");
  assert.equal(h.ctx.rosterScanCaptureStates.get("synthetic-1"),"timeout");
  assert.equal(h.finishes,1);
});
test("all unreadable images remain warnings, no invented member",async()=>{
  const h=harness([unread,unread]);await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.ctx.rosterScanDraft.length,0);assert.match(h.nodes.rosterScanStatus.textContent,/unreadable.*2/);
});
test("unreadable image count survives a subsequent fatal error",async()=>{
  const h=harness([ok("Synthetic A"),unread,{response:{ok:false,status:503},json:{error:"provider_failure",message:"secret provider detail"}}]);
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.ctx.rosterScanDraft.length,1);
  assert.match(h.nodes.rosterScanStatus.textContent,/roster_scan_error_server.*roster_scan_unreadable/);
  assert.doesNotMatch(h.nodes.rosterScanStatus.textContent,/secret provider detail/);
});
test("R4/R5 guard blocks scan requests before any capture is sent",async()=>{
  const h=harness([ok("Should not run")]);h.ctx.hasDeclaredAllianceCommandRole=()=>false;
  await h.handlers.rosterScanAnalyzeBtn();
  assert.equal(h.calls,0);
  assert.equal(h.ctx.rosterScanDraft.length,0);
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
