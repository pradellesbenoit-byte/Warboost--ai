import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import handler from "../api/state.js";
import {normalizeState} from "../lib/normalize.js";
import {BETA_CONSENT_VERSION} from "../lib/beta-access.js";
import {accountSyncErrorKind,accountSyncView,createCloudOperations,deviceCloudSaveMetadata,transientCloudFailure,confirmedWriteReceipt,mergeDeviceCloudSaveMetadata} from "../lib/account-sync-feedback.js";
import {safeSaveDiagnostic,createSaveDiagnostic,newSaveCorrelation,publicSaveError} from "../lib/cloud-save-diagnostic.js";
import {translator} from "../i18n.js";
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log("PASS "+name)};
const stamp="2026-10-14T18:20:00.000Z",privateText="PRIVATE_SQL token=PRIVATE email@example.test signed=https://private.invalid";
check("diagnostic whitelist removes raw SQL, identifiers, credentials, URL and payload",()=>{
  const result=safeSaveDiagnostic({...createSaveDiagnostic({code:"database_permissions_missing"}),
    token:privateText,email:privateText,player_id:privateText,profile:{privateText},message:privateText,
    endpoint:privateText,url:privateText,body:privateText});
  assert.deepEqual(Object.keys(result).sort(),["endpoint","method","stage","http_status","code","at","correlation_id","write_state","duration_ms"].sort());
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|@|signed|token|player_id|https:/);
  assert.equal(safeSaveDiagnostic({...result,correlation_id:privateText}),null);
  assert.equal(safeSaveDiagnostic({...result,stage:privateText}),null);
  assert.equal(safeSaveDiagnostic({...result,code:privateText}),null);
});
check("correlation IDs are independently random, not derived from accounts",()=>{
  assert.notEqual(newSaveCorrelation(),newSaveCorrelation());
});

// No actual Supabase calls: every request must target this synthetic host.
Object.assign(process.env,{SUPABASE_URL:"https://cloud-diagnostic-fixture.invalid",
  SUPABASE_ANON_KEY:"fixture-public",SUPABASE_SERVICE_ROLE_KEY:"fixture-service"});
const profile=normalizeState({player_id:"fixture-owner",player:{name:"fixture",server_id:"1",hq_level:35},
  squads:[1,2,3,4].map(id=>({id,power:40+id,heroes:[],updated_at:stamp})),updated_at:stamp});
const originalProfile=JSON.stringify(profile),originalFetch=globalThis.fetch;
let scenario={},calls=[];
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));assert.equal(url.origin,"https://cloud-diagnostic-fixture.invalid");
  const method=init.method||"GET";calls.push({path:url.pathname,method});
  if(url.pathname==="/auth/v1/user")
    return new Response(JSON.stringify(scenario.authStatus?{error:"invalid"}:{
      id:"fixture-owner",email:"fixture@example.invalid",
      ...(scenario.unconfirmed?{}:{email_confirmed_at:stamp})
    }),{status:scenario.authStatus||200});
  if(url.pathname==="/rest/v1/wb1_profiles"){
    if(scenario.throwError)throw scenario.throwError;
    if(method==="GET"&&scenario.readStatus)return new Response(JSON.stringify({code:scenario.sql,message:privateText}),{status:scenario.readStatus});
    if(method==="GET")return new Response(JSON.stringify([{state:profile,updated_at:stamp}]));
    assert.ok(["PATCH","POST"].includes(method));
    assert.equal(JSON.parse(init.body).state.player_id,"fixture-owner","server derives owner from auth");
    if(scenario.status)return new Response(JSON.stringify({code:scenario.sql||"synthetic",message:privateText,details:privateText}),{status:scenario.status});
    return new Response(JSON.stringify([{state:profile,updated_at:stamp}]));
  }
  assert.ok(url.pathname.startsWith("/rest/v1/"));
  return new Response("[]");
};
async function post(overrides={}){
  let status=200,json;
  const req={method:"POST",query:{},headers:{authorization:"Bearer fixture-session",
    "x-warboost-beta-consent":BETA_CONSENT_VERSION,"content-type":"application/json",...overrides.headers},
    body:{state:JSON.parse(originalProfile),base_updated_at:stamp,...overrides.body}};
  if(overrides.noAuth)delete req.headers.authorization;
  calls=[];
  await handler(req,{setHeader(){},status(value){status=value;return this},json(value){json=value;return this}});
  return {status,json};
}
try{
  scenario={unconfirmed:true};
  const unconfirmed=await post();
  check("actual POST refuses an unconfirmed email before any cloud read/write",()=>{
    assert.equal(unconfirmed.status,403);
    // State API intentionally exposes only its closed public diagnostic code.
    assert.equal(unconfirmed.json.error,"access_denied");
    assert.deepEqual(calls.map(call=>call.path),["/auth/v1/user"]);
  });
  for(const [name,status,sql,expectedStatus,code,kind] of [
    ["SQL permission",403,"42501",503,"database_permissions_missing","database_permissions"],
    ["missing table",404,"42P01",503,"database_schema_missing","database_schema"],
    ["missing column",400,"PGRST204",400,"database_schema_missing","database_schema"],
    ["SQL constraint",400,"23514",400,"database_validation_failed","database_sql"],
    ["database internal error",500,"XX000",500,"database_error","database_sql"],
    ["backend HTTP 500",500,"synthetic",500,"state_error","server"],
    ["upstream server failure",503,"synthetic",503,"state_error","server"]]){
    scenario={status,sql};
    const result=await post();
    check("actual POST "+name+" is diagnosed without public SQL details or modifying squads",()=>{
      assert.equal(result.status,expectedStatus);
      assert.equal(result.json.error,code);
      assert.equal(result.json.diagnostic.code,code);
      assert.equal(result.json.diagnostic.stage,"profile_write");
      assert.equal(result.json.diagnostic.write_state,"unknown","preceding work may have written");
      assert.equal(accountSyncErrorKind({status:result.status,code}),kind);
      assert.doesNotMatch(JSON.stringify(result.json),/PRIVATE|email@|signed=|message|details/);
      assert.equal(JSON.stringify(profile),originalProfile);
    });
  }
  scenario={readStatus:403,sql:"42501"};
  const readDenied=await post();
  check("user-scoped read permission failure identifies profile_read before writes",()=>{
    assert.equal(readDenied.json.diagnostic.stage,"profile_read");
    assert.equal(readDenied.json.diagnostic.code,"database_permissions_missing");
    assert.equal(readDenied.json.diagnostic.write_state,"not_attempted");
    assert.ok(calls.every(call=>call.method==="GET"));
  });
  scenario={throwError:Object.assign(Error(privateText),{status:504,code:"SUPABASE_USER_TIMEOUT"})};
  const timed=await post();
  check("actual backend upstream timeout is distinct and exposes no internal message",()=>{
    assert.equal(timed.status,504);assert.equal(timed.json.diagnostic.code,"upstream_timeout");
    assert.equal(accountSyncErrorKind({status:504,code:timed.json.error}),"timeout");
    assert.doesNotMatch(JSON.stringify(timed.json),/PRIVATE/);
  });
  scenario={throwError:new TypeError(privateText)};
  const bug=await post();
  check("unexpected backend TypeError stays backend unknown, not a false browser network diagnosis",()=>{
    assert.equal(bug.status,500);assert.equal(bug.json.error,"state_error");
    assert.doesNotMatch(JSON.stringify(bug.json),/PRIVATE/);
  });
  scenario={};
  for(const [name,overrides,status,code,stage] of [
    ["auth",{noAuth:true},401,"AUTH_REQUIRED","authentication"],
    ["consent",{headers:{"x-warboost-beta-consent":""}},428,"BETA_CONSENT_REQUIRED","consent"],
    ["invalid body",{body:{state:null}},400,"invalid_payload","validation"],
    ["unsupported content type",{headers:{"content-type":"text/plain"}},415,"unsupported_content_type","validation"],
    ["version conflict",{body:{base_updated_at:"2026-10-13T18:20:00Z"}},409,"profile_write_conflict","version_check"]]){
    const result=await post(overrides);
    check("actual POST "+name+" refuses before any upstream write",()=>{
      assert.equal(result.status,status);assert.equal(result.json.error,code);
      assert.equal(result.json.diagnostic.stage,stage);assert.equal(result.json.diagnostic.write_state,"not_attempted");
      assert.ok(calls.every(call=>call.method==="GET"));
    });
  }
  scenario={status:403,sql:"synthetic"};
  const denied=await post();
  check("HTTP 403 without SQL permissions code remains authorization, not server",()=>{
    assert.equal(denied.status,403);assert.equal(denied.json.error,"access_denied");
    assert.equal(accountSyncErrorKind({status:403,code:denied.json.error}),"forbidden");
  });
  scenario={};
  const successful=await post({body:{state:{...JSON.parse(originalProfile),player_id:"spoofed"}}});
  check("actual server acknowledgement has correlation and never trusts browser owner",()=>{
    assert.equal(successful.status,200);assert.equal(successful.json.write_confirmed,true);
    assert.equal(successful.json.diagnostic.code,"save_confirmed");
    assert.equal(successful.json.diagnostic.write_state,"confirmed");
    assert.equal(successful.json.state.player_id,"fixture-owner");
  });
}finally{globalThis.fetch=originalFetch;}

// Actual browser handlers, with transport and storage isolated in memory.
const source=fs.readFileSync("app.js","utf8");
function fn(name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n}",start)+2);
}
const ctx=vm.createContext({state:JSON.parse(originalProfile),cloudSession:{user:{id:"fixture-owner"},access_token:"fixture"},
  cloudRevision:stamp,cloudProfileVerified:true,cloudDirty:true,accountSaveBusy:false,accountSyncCheckBusy:false,
  accountSyncOperations:createCloudOperations(),cloudRetryFailures:0,localStateRevision:1,suppressPush:false,
  cloudRetryTimer:null,pushTimer:null,clearTimeout(){},navigator:{onLine:true},Date,
  sessionApplyKey:session=>session?.access_token||"",betaAccessAllowed:()=>true,betaConsentAccepted:()=>true,
  safeSaveDiagnostic,createSaveDiagnostic,newSaveCorrelation,publicSaveError,accountSyncErrorKind,accountSyncView,confirmedWriteReceipt,mergeDeviceCloudSaveMetadata,readAccountState:()=>null,
  transientCloudFailure,authHeaders:()=>({}),safeClone:value=>JSON.parse(JSON.stringify(value)),
  hasMeaningfulCore:()=>true,renderBeta(){},analysisIndicator:{begin:()=>()=>{}},$:()=>null,
  markCloudPending(code){ctx.cloudDirty=true;ctx.state.sync={...ctx.state.sync,last_error:code,pending_cloud_save:true}},
  scheduleCloudRetry(){},fetchJsonBounded:null,verifiedAccountWriteReply:()=>false});
vm.runInContext(fn("recordAccountSyncResult")+"\n"+fn("currentAccountSyncView")+"\n"+fn("pushServerState"),ctx);
const fourSquads=JSON.stringify(ctx.state.squads);
const diagnostic=createSaveDiagnostic({stage:"profile_write",status:503,code:"database_permissions_missing"});
ctx.fetchJsonBounded=async()=>({response:{ok:false,status:503},json:{error:"database_permissions_missing",diagnostic,
  message:privateText}});
await ctx.pushServerState();
check("actual browser stores only safe SQL diagnostic beside last save outcome",()=>{
  assert.equal(ctx.currentAccountSyncView().kind,"database_permissions");
  assert.deepEqual(ctx.currentAccountSyncView().saveDiagnostic,diagnostic);
  assert.doesNotMatch(JSON.stringify(ctx.state.sync),/PRIVATE|signed=|token=/);
  assert.equal(JSON.stringify(ctx.state.squads),fourSquads);
  assert.equal(transientCloudFailure("database_permissions"),false);
});
const checkOperation=ctx.accountSyncOperations.begin("fixture","check");
ctx.accountSyncOperations.complete(checkOperation,{kind:"verified",revision:stamp},"fixture");
check("successful GET and refresh retain exact last POST correlation, stage and failure",()=>{
  assert.equal(ctx.currentAccountSyncView().kind,"database_permissions");
  assert.equal(ctx.currentAccountSyncView().saveDiagnostic.correlation_id,diagnostic.correlation_id);
  const own=deviceCloudSaveMetadata(ctx.state,"fixture-owner");
  assert.equal(own.last_save_attempt.diagnostic.correlation_id,diagnostic.correlation_id);
  assert.deepEqual(deviceCloudSaveMetadata(ctx.state,"another"),{});
});
ctx.accountSyncOperations=createCloudOperations();ctx.state.sync={pending_cloud_save:true};
let settle,requests=0;
ctx.fetchJsonBounded=()=>{requests++;return new Promise(resolve=>{settle=resolve})};
const pending=ctx.pushServerState();
assert.equal((await ctx.pushServerState()).reason,"save_in_progress");
settle({response:{ok:false,status:500},json:{error:"state_error"}});
await pending;
check("parallel POSTs remain serialized and old API replies get safe local diagnostics",()=>{
  assert.equal(requests,1);assert.equal(ctx.currentAccountSyncView().saveDiagnostic.stage,"client_transport");
  assert.equal(ctx.accountSaveBusy,false);assert.equal(JSON.stringify(ctx.state.squads),fourSquads);
});
ctx.accountSyncOperations=createCloudOperations();ctx.state.sync={pending_cloud_save:true};
ctx.fetchJsonBounded=async()=>{throw Object.assign(Error(privateText),{name:"TimeoutError",code:"request_timeout"})};
await ctx.pushServerState();
check("timeout records unknown write state and never a guessed failure or SQL message",()=>{
  assert.equal(ctx.currentAccountSyncView().saveDiagnostic.code,"request_timeout");
  assert.equal(ctx.currentAccountSyncView().saveDiagnostic.http_status,null);
  assert.equal(ctx.currentAccountSyncView().saveDiagnostic.write_state,"unknown");
  assert.equal(ctx.accountSaveBusy,false);
});
const failedOperation=ctx.accountSyncOperations.begin("fixture","save");
const newer=ctx.accountSyncOperations.begin("fixture","save");
ctx.accountSyncOperations.complete(newer,{kind:"timeout",diagnostic},"fixture");
check("late reply after newer generation or session renewal cannot replace diagnostic",()=>{
  assert.equal(ctx.accountSyncOperations.complete(newer,{kind:"verified"},"fixture"),false,"completed timeout is terminal");
  assert.equal(ctx.accountSyncOperations.complete(failedOperation,{kind:"verified"},"fixture"),false);
  ctx.accountSyncOperations.begin("renewed","check");
  assert.equal(ctx.accountSyncOperations.complete(newer,{kind:"verified"},"renewed"),false);
});
check("all 22 languages / 23 locales provide SQL and diagnostic labels",()=>{
  for(const locale of ["fr","en-GB","en-US","de","es","it","pt","pl","tr","ru","uk","ar","ja","ko","zh","ro","el","cs","id","th","vi","nl","sv"]){
    for(const key of ["database_permissions","database_schema","database_sql","diagnostic"])
      assert.notEqual(translator(locale)("account_sync_"+key),"account_sync_"+key);
  }
});
// Minimal isolated DOM for the actual diagnostic renderer; no account or browser storage.
const nodes=new Map();
function element(tag){
  return {tag,id:"",style:{},children:[],attrs:{},textContent:"",hidden:false,
    classList:{toggle(name,value){if(name==="hidden")this.hidden=value}},
    setAttribute(name,value){this.attrs[name]=value},
    append(...children){this.children.push(...children)},
    querySelector(name){return this.children.find(child=>child.tag===name)},
    insertAdjacentElement(_position,node){nodes.set("#"+node.id,node)}};
}
nodes.set("#accountSyncCheckBtn",element("button"));
ctx.$=selector=>nodes.get(selector)||null;ctx.document={createElement:element};
ctx.runtimeAccessState=()=>({phase:"ready"});ctx.t=translator("fr");
ctx.accountSyncOperations=createCloudOperations();
const op=ctx.accountSyncOperations.begin("fixture","save");
ctx.accountSyncOperations.complete(op,{kind:"database_permissions",diagnostic},"fixture");
vm.runInContext(fn("renderAccountSaveDiagnostic"),ctx);
ctx.renderAccountSaveDiagnostic();
check("actual account panel displays only whitelisted metadata, with mobile-safe wrapping",()=>{
  const panel=nodes.get("#accountSaveDiagnostic");
  assert.equal(panel.querySelector("summary").textContent,"Diagnostic de sauvegarde — code de support");
  assert.deepEqual(JSON.parse(panel.querySelector("pre").textContent),diagnostic);
  assert.equal(panel.querySelector("pre").style.whiteSpace,"pre-wrap");
  assert.equal(panel.querySelector("pre").style.overflowWrap,"anywhere");
  assert.doesNotMatch(panel.querySelector("pre").textContent,/PRIVATE|player_id|signed=|token=/);
});
ctx.cloudSession=null;ctx.renderAccountSaveDiagnostic();
check("signed-out or inaccessible account panel cannot reveal previous diagnostic",()=>{
  assert.equal(nodes.get("#accountSaveDiagnostic").classList.hidden,true);
  assert.equal(nodes.get("#accountSaveDiagnostic").querySelector("pre").textContent,"");
});
console.log(`PASS cloud save diagnostic: ${checks} groups; actual backend/browser, synthetic transports only, zero real cloud writes`);
