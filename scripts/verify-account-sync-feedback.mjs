import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {accountSyncErrorKind,accountSyncView,verifiedAccountStateReply,verifiedAccountWriteReply,createCloudOperations,transientCloudFailure,deviceCloudSaveMetadata,confirmedWriteReceipt,mergeDeviceCloudSaveMetadata,staleProfileRestore} from "../lib/account-sync-feedback.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";
import {translator} from "../i18n.js";
import {createAnalysisIndicator,beginLoadingButton} from "../lib/analysis-indicator.js";
import {createSaveDiagnostic,safeSaveDiagnostic,newSaveCorrelation,publicSaveError} from "../lib/cloud-save-diagnostic.js";
import stateHandler from "../api/state.js";

let checks=0,translations=0;
const check=(label,run)=>{run();checks++;console.log("PASS "+label)};
const stamp="2026-10-14T10:00:00.000Z",key="synthetic-session";
check("plain pending does not claim a server outage",()=>{
  assert.equal(accountSyncView({sessionKey:key,sync:{pending_cloud_save:true}}).kind,"pending");
  assert.equal(accountSyncView({sessionKey:key,sync:{pending_cloud_save:true,last_error:"offline"}}).kind,"pending","historical device error is not current network evidence");
});
check("a cached date, login or role is not synchronization proof",()=>{
  assert.equal(accountSyncView({sync:{status:"ok",last_sync:stamp},sessionKey:key}).kind,"unknown");
});
check("current verification, local changes, wrong session and stale revision stay distinct",()=>{
  const receipt={sessionKey:key,kind:"verified",revision:stamp,at:stamp};
  assert.equal(accountSyncView({receipt,sessionKey:key,revision:stamp}).kind,"verified");
  assert.equal(accountSyncView({receipt,sessionKey:key,revision:stamp,dirty:true}).kind,"pending");
  assert.equal(accountSyncView({receipt,sessionKey:"other",revision:stamp}).kind,"unknown");
  assert.equal(accountSyncView({receipt,sessionKey:key,revision:"newer"}).kind,"unknown");
  assert.equal(accountSyncView({receipt,sessionKey:key,revision:stamp,online:false}).kind,"network");
});
check("auth, refusal, version, timeout, server and ambiguous responses are categorized safely",()=>{
  for(const [status,code,kind] of [[401,"AUTH_INVALID","auth"],[403,"r4_r5_required","forbidden"],
    [428,"BETA_CONSENT_REQUIRED","forbidden"],[409,"profile_write_conflict","conflict"],
    [503,"AUTH_UPSTREAM_TIMEOUT","timeout"],[503,"state_error","server"],[null,"TypeError","network"],
    [null,"request_timeout","timeout"],[200,"unconfirmed","unconfirmed"]]){
    assert.equal(accountSyncErrorKind({status,code}),kind);
    assert.equal(accountSyncView({sessionKey:key,receipt:{sessionKey:key,kind},sync:{pending_cloud_save:true}}).kind,kind);
  }
  assert.equal(accountSyncErrorKind({code:"private@example.test token-value SQL"}),"unconfirmed");
});
check("200 alone, wrong owner, missing profile or invalid date are not save acknowledgements",()=>{
  assert.equal(verifiedAccountStateReply({ok:true},"owner"),false);
  assert.equal(verifiedAccountStateReply({ok:true,state:{player_id:"other"},updated_at:stamp},"owner"),false);
  assert.equal(verifiedAccountStateReply({ok:true,state:{player_id:"owner"},updated_at:"invalid"},"owner"),false);
  assert.equal(verifiedAccountStateReply({ok:true,state:{player_id:"owner"},updated_at:stamp},"owner"),true);
});
check("last known timestamp remains history, never evidence for this session",()=>{
  const view=accountSyncView({sessionKey:key,sync:{last_sync:stamp}});
  assert.equal(view.lastKnown,stamp);assert.equal(view.kind,"unknown");
  assert.equal(accountSyncView({sync:{last_sync:"private text"}}).lastKnown,null);
});
check("all 23 locales return actual localized copy for 22 languages",()=>{
  assert.equal(Object.keys(ACCOUNT_SYNC_COPY).length,23);
  for(const [locale,copy] of Object.entries(ACCOUNT_SYNC_COPY))for(const [k,value] of Object.entries(copy)){
    assert.ok(value.trim());assert.equal(translator(locale)(k),value);
    if(k==="account_sync_last")assert.ok(translator(locale)(k,{date:"DATE"}).includes("DATE"));
    translations++;
  }
});

const source=fs.readFileSync("app.js","utf8");
function fn(name){
  const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf("\n}",start)+2);
}
const button={disabled:false,textContent:"check",isConnected:true,attrs:{},
  setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]??null},
  removeAttribute(k){delete this.attrs[k]},hasAttribute(k){return k in this.attrs}};
const indicator=createAnalysisIndicator();
const ctx=vm.createContext({accountSyncReceipt:null,accountSyncCheckBusy:false,
  createSaveDiagnostic,safeSaveDiagnostic,newSaveCorrelation,publicSaveError,confirmedWriteReceipt,mergeDeviceCloudSaveMetadata,readAccountState:()=>null,
  accountSyncOperations:createCloudOperations(),accountSaveBusy:false,cloudRetryFailures:0,Date,
  clearTimeout:()=>{},cloudRetryTimer:null,pushTimer:null,
  cloudSession:{access_token:"synthetic",user:{id:"owner"}},cloudRevision:stamp,cloudProfileVerified:true,
  cloudDirty:false,state:{player_id:"owner",sync:{pending_cloud_save:true},squads:[{id:1,heroes:[{name:"Murphy"}]}]},
  navigator:{onLine:true},sessionApplyKey:session=>session?.user?.id==="owner"?key:"other",
  betaConsentAccepted:()=>true,betaAccessAllowed:()=>true,beginLoadingButton,analysisIndicator:indicator,
  $:()=>button,t:translator("fr"),renderBeta:()=>{},accountSyncErrorKind,accountSyncView,
  fetchJsonBounded:null});
vm.runInContext(fn("recordAccountSyncResult")+"\n"+fn("checkAccountCloudStatus"),ctx);
let requests=0,settle;
const before=JSON.stringify(ctx.state);
ctx.fetchJsonBounded=(url,init)=>{
  assert.equal(url,"/api/state?action=sync_status");assert.equal(init.method,undefined);
  requests++;return new Promise(resolve=>{settle=resolve});
};
ctx.authHeaders=()=>({authorization:"synthetic", "x-warboost-beta-consent":"synthetic"});
const pending=ctx.checkAccountCloudStatus();
check("actual retry is immediately disabled, inline W active, and double click suppressed",()=>{
  assert.equal(button.disabled,true);assert.equal(button.attrs["data-wb-analysis-active"],"true");
});
await ctx.checkAccountCloudStatus();assert.equal(requests,1);
settle({response:{ok:true},json:{ok:true,owner_verified:true,profile_present:true,updated_at:stamp}});
await pending;
check("actual retry verifies without saving or clearing local pending changes",()=>{
  assert.equal(JSON.stringify(ctx.state),before);assert.equal(ctx.accountSyncOperations.snapshot(key).check.kind,"verified");
  assert.equal(accountSyncView({check:ctx.accountSyncOperations.snapshot(key).check,sessionKey:key,revision:stamp,sync:ctx.state.sync}).kind,"pending");
  assert.equal(button.disabled,false);assert.equal(indicator.pending,0);
});
for(const [label,status,error,kind] of [["auth",401,"AUTH_INVALID","auth"],["refusal",403,"access_denied","forbidden"],
  ["version",409,"profile_write_conflict","conflict"],["server",503,"state_error","server"]]){
  ctx.fetchJsonBounded=async()=>({response:{ok:false,status},json:{error,message:"private token email@example.test"}});
  await ctx.checkAccountCloudStatus();
  check("actual retry "+label+" leaves local data and W intact",()=>{
    assert.equal(ctx.accountSyncOperations.snapshot(key).check.kind,kind);assert.equal(JSON.stringify(ctx.state),before);
    assert.equal(button.disabled,false);assert.equal(indicator.pending,0);
    assert.doesNotMatch(JSON.stringify(ctx.accountSyncOperations.snapshot(key)),/email@|private token|message/);
  });
}
for(const [name,code,kind] of [["TypeError",undefined,"network"],["TimeoutError","request_timeout","timeout"]]){
  ctx.fetchJsonBounded=async()=>{throw Object.assign(Error("private payload"),{name,code})};
  await ctx.checkAccountCloudStatus();
  check("actual retry "+kind+" always cleans up",()=>{
    assert.equal(ctx.accountSyncOperations.snapshot(key).check.kind,kind);assert.equal(button.disabled,false);assert.equal(indicator.pending,0);
  });
}
ctx.fetchJsonBounded=async()=>({response:{ok:true},json:{}});
await ctx.checkAccountCloudStatus();
check("actual retry rejects a bare HTTP 200",()=>assert.equal(ctx.accountSyncOperations.snapshot(key).check.kind,"unconfirmed"));
ctx.fetchJsonBounded=async()=>({response:{ok:true},json:{ok:true,owner_verified:true,profile_present:true,updated_at:"2026-10-15T10:00:00Z"}});
await ctx.checkAccountCloudStatus();
check("new cloud version requires review instead of local overwrite",()=>{
  assert.equal(ctx.accountSyncOperations.snapshot(key).check.kind,"conflict");assert.equal(JSON.stringify(ctx.state),before);
});
ctx.fetchJsonBounded=async()=>{
  ctx.cloudSession={access_token:"other",user:{id:"another-account"}};
  return {response:{ok:true},json:{ok:true,owner_verified:true,profile_present:true,updated_at:stamp}};
};
const receiptBefore=JSON.stringify(ctx.accountSyncOperations.snapshot(key));
await ctx.checkAccountCloudStatus();
check("response from a previous account cannot update another account UI",()=>assert.equal(JSON.stringify(ctx.accountSyncOperations.snapshot(key)),receiptBefore));
ctx.cloudSession={access_token:"synthetic",user:{id:"owner"}};
ctx.accountSyncOperations=createCloudOperations();ctx.locale="fr-FR";
vm.runInContext(fn("currentAccountSyncView")+"\n"+fn("accountSyncMessage"),ctx);
check("actual French account message is pending, not unavailable or synchronized",()=>{
  assert.match(ctx.accountSyncMessage(),/attente de synchronisation/);
  assert.doesNotMatch(ctx.accountSyncMessage(),/indisponible|vérifiée pour cette session/);
});
ctx.state.sync={pending_cloud_save:false,last_sync:stamp};
check("actual French message distinguishes historical date from current verification",()=>{
  assert.match(ctx.accountSyncMessage(),/Aucun accusé vérifié disponible/);
  assert.match(ctx.accountSyncMessage(),/Aucun contrôle cloud actuel/);
  assert.match(ctx.accountSyncMessage(),/Historique de synchronisation/);
});
ctx.state.player_id="owner";ctx.suppressPush=false;ctx.localStateRevision=1;
ctx.hasMeaningfulCore=()=>true;ctx.safeClone=value=>JSON.parse(JSON.stringify(value));
ctx.transientCloudFailure=transientCloudFailure;ctx.scheduleCloudRetry=()=>{};
ctx.markCloudPending=code=>{ctx.cloudDirty=true;ctx.state.sync={...ctx.state.sync,last_error:code,pending_cloud_save:true}};
const heroesBefore=JSON.stringify(ctx.state.squads);
vm.runInContext(fn("pushServerState"),ctx);
ctx.verifiedAccountStateReply=verifiedAccountStateReply;
ctx.verifiedAccountWriteReply=verifiedAccountWriteReply;
ctx.fetchJsonBounded=async()=>({response:{ok:true},json:{ok:true}});
const unverified=await ctx.pushServerState();
check("actual save handler refuses bare 200 without merging or clearing data",()=>{
  assert.equal(unverified.ok,false);assert.equal(ctx.accountSyncOperations.snapshot(key).save.kind,"unconfirmed");
  assert.equal(ctx.state.sync.pending_cloud_save,true);assert.equal(JSON.stringify(ctx.state.squads),heroesBefore);
  assert.equal(indicator.pending,0);
});
ctx.fetchJsonBounded=async()=>{throw Object.assign(Error("private payload"),{name:"TimeoutError",code:"request_timeout"})};
ctx.accountSyncOperations=createCloudOperations();delete ctx.state.sync.last_save_attempt;
await ctx.pushServerState();
check("actual save timeout keeps squads, local pending and safe error code",()=>{
  assert.equal(ctx.accountSyncOperations.snapshot(key).save.kind,"timeout");assert.equal(ctx.state.sync.last_error,"request_timeout");
  assert.equal(JSON.stringify(ctx.state.squads),heroesBefore);assert.equal(indicator.pending,0);
});

check("GET success preserves POST failure and history, never acknowledges a write",()=>{
  const ledger=createCloudOperations();
  const write=ledger.begin(key,"save");
  ledger.complete(write,{kind:"server"},key);
  const read=ledger.begin(key,"check");
  ledger.complete(read,{kind:"verified",revision:stamp},key);
  const view=accountSyncView({...ledger.snapshot(key),sync:{pending_cloud_save:true,last_sync:stamp},revision:stamp});
  assert.equal(view.kind,"server");assert.equal(view.checkKind,"verified");
  assert.equal(view.lastKnown,stamp);assert.equal(view.confirmedAt,null);
});
check("inverted replies stay in their own lanes and superseded replies are ignored",()=>{
  const ledger=createCloudOperations(),old=ledger.begin(key,"check"),write=ledger.begin(key,"save"),newer=ledger.begin(key,"check");
  assert.equal(ledger.complete(newer,{kind:"verified"},key),true);
  assert.equal(ledger.complete(write,{kind:"server"},key),true);
  assert.equal(ledger.complete(old,{kind:"auth"},key),false);
  assert.equal(ledger.snapshot(key).check.kind,"verified");
  assert.equal(ledger.snapshot(key).save.kind,"server");
});
check("session renewal invalidates previous operations even for the same account",()=>{
  const ledger=createCloudOperations(),old=ledger.begin(key,"save"),fresh=ledger.begin("renewed","check");
  assert.equal(ledger.complete(old,{kind:"verified"}, "renewed"),false);
  assert.equal(ledger.complete(fresh,{kind:"verified"}, "renewed"),true);
  assert.equal(ledger.snapshot("renewed").save,undefined);
});
check("refresh retains safe failure metadata but never promotes historical dates to confirmed writes",()=>{
  const sync=JSON.parse(JSON.stringify({last_save_attempt:{kind:"server",at:stamp},last_sync:stamp,last_confirmed_write_at:stamp,pending_cloud_save:true}));
  const view=accountSyncView({sync,sessionKey:"renewed"});
  assert.equal(view.kind,"server");assert.equal(view.lastKnown,stamp);assert.equal(view.confirmedAt,null);
  assert.doesNotMatch(JSON.stringify(sync),/token|sessionKey|owner|email/);
});
check("write proof only applies to the current version without pending local changes",()=>{
  const save={kind:"verified",revision:stamp,at:stamp};
  assert.equal(accountSyncView({save,confirmed:save,revision:stamp}).confirmedAt,stamp);
  assert.equal(accountSyncView({save,confirmed:save,revision:"newer"}).confirmedAt,null);
  assert.equal(accountSyncView({save,confirmed:save,revision:stamp,dirty:true}).confirmedAt,null);
  assert.equal(accountSyncView({save,confirmed:save,revision:stamp,check:{kind:"conflict"}}).confirmedAt,null);
});
check("server write acknowledgement is required in addition to own profile and version",()=>{
  const reply={ok:true,state:{player_id:"owner"},updated_at:stamp};
  assert.equal(verifiedAccountWriteReply(reply,"owner"),false);
  assert.equal(verifiedAccountWriteReply({...reply,write_confirmed:true},"owner"),true);
  assert.equal(verifiedAccountWriteReply({...reply,write_confirmed:true},"other"),false);
});
check("device metadata survives own restore, is whitelisted and cannot cross accounts",()=>{
  const profile={player_id:"owner",sync:{last_save_attempt:{kind:"server",at:stamp,token:"PRIVATE"},last_confirmed_write_at:stamp}};
  const metadata=deviceCloudSaveMetadata(profile,"owner");
  assert.deepEqual(metadata,{last_save_attempt:{kind:"server",at:stamp},last_confirmed_write_at:stamp});
  assert.deepEqual(deviceCloudSaveMetadata(profile,"other"),{});
  assert.equal(accountSyncView({sync:metadata}).kind,"server");
});
check("only transient errors qualify for retries",()=>{
  for(const kind of ["auth","forbidden","conflict","unconfirmed","unknown"])assert.equal(transientCloudFailure(kind),false);
  for(const kind of ["network","timeout","server"])assert.equal(transientCloudFailure(kind),true);
});
ctx.state.sync={pending_cloud_save:true,last_sync:stamp};
ctx.accountSyncOperations=createCloudOperations();
ctx.fetchJsonBounded=async()=>({response:{ok:false,status:503},json:{error:"state_error"}});
await ctx.pushServerState();
ctx.fetchJsonBounded=async()=>({response:{ok:true},json:{ok:true,owner_verified:true,profile_present:true,updated_at:stamp}});
await ctx.checkAccountCloudStatus();
check("actual controllers retain save failure after successful read and show both in French",()=>{
  assert.equal(ctx.currentAccountSyncView().kind,"server");
  assert.match(ctx.accountSyncMessage(),/Vérification réussie — aucune sauvegarde effectuée/);
  assert.match(ctx.accountSyncMessage(),/Cloud indisponible/);
  assert.match(ctx.accountSyncMessage(),/Historique de synchronisation/);
  assert.equal(JSON.stringify(ctx.state.squads),heroesBefore);
});
// Exercise the actual save function with all four squad records; transport remains synthetic.
ctx.state.squads=[1,2,3,4].map(id=>({id,power:40+id,heroes:[{name:"hero-"+id,confirmed:true}]}));
const fourSquads=JSON.stringify(ctx.state.squads);
for(const [status,kind] of [[401,"auth"],[403,"forbidden"],[428,"forbidden"],[409,"conflict"]]){
  ctx.state.sync={pending_cloud_save:true};ctx.accountSyncOperations=createCloudOperations();
  ctx.fetchJsonBounded=async()=>({response:{ok:false,status},json:{error:status===409?"profile_write_conflict":"generic"}});
  await ctx.pushServerState();
  check("actual POST "+status+" retains four squads and blocks automatic repeat",()=>{
    assert.equal(ctx.currentAccountSyncView().saveKind,kind);
    assert.equal(JSON.stringify(ctx.state.squads),fourSquads);
  });
  const blocked=await ctx.pushServerState();
  assert.equal(blocked.reason,"cloud_action_required");
}
ctx.state.sync={pending_cloud_save:true};ctx.accountSyncOperations=createCloudOperations();
let releaseWrite,writeRequests=0;
ctx.fetchJsonBounded=()=>{writeRequests++;return new Promise(resolve=>{releaseWrite=resolve})};
const writing=ctx.pushServerState();
const duplicate=await ctx.pushServerState();
check("actual saves are serialized across concurrent triggers",()=>{
  assert.equal(writeRequests,1);assert.equal(duplicate.reason,"save_in_progress");assert.equal(ctx.accountSaveBusy,true);
});
releaseWrite({response:{ok:false,status:503},json:{error:"state_error"}});
await writing;
check("write lock and W are released after failure without touching four squads",()=>{
  assert.equal(ctx.accountSaveBusy,false);assert.equal(indicator.pending,0);
  assert.equal(JSON.stringify(ctx.state.squads),fourSquads);
});
ctx.state.sync={pending_cloud_save:true};ctx.accountSyncOperations=createCloudOperations();
ctx.sessionApplyKey=session=>session?.access_token||"";
ctx.fetchJsonBounded=async()=>{
  ctx.cloudSession={access_token:"renewed",user:{id:"owner"}};
  return {response:{ok:false,status:503},json:{error:"state_error"}};
};
const staleWrite=await ctx.pushServerState();
check("actual POST reply after token renewal cannot merge or overwrite diagnostics",()=>{
  assert.equal(staleWrite.reason,"session_changed");
  assert.equal(ctx.accountSyncOperations.snapshot("renewed").save,undefined);
  assert.equal(JSON.stringify(ctx.state.squads),fourSquads);assert.equal(ctx.accountSaveBusy,false);
});
ctx.cloudSession={access_token:"synthetic",user:{id:"owner"}};
ctx.sessionApplyKey=session=>session?.user?.id==="owner"?key:"other";
let timerDelay=0;
ctx.setTimeout=(_fn,delay)=>{timerDelay=delay;return 1};
ctx.cloudRetryTimer=null;ctx.cloudDirty=true;
vm.runInContext(fn("scheduleCloudRetry"),ctx);
check("actual retry scheduler backs off and refuses permanent failures",()=>{
  for(const kind of ["auth","forbidden","conflict","unconfirmed"]){
    ctx.accountSyncOperations=createCloudOperations();
    const op=ctx.accountSyncOperations.begin(key,"save");
    ctx.accountSyncOperations.complete(op,{kind},key);
    ctx.cloudRetryTimer=null;timerDelay=0;ctx.scheduleCloudRetry();
    assert.equal(timerDelay,0);
  }
  ctx.accountSyncOperations=createCloudOperations();
  const op=ctx.accountSyncOperations.begin(key,"save");ctx.accountSyncOperations.complete(op,{kind:"server"},key);
  ctx.cloudRetryFailures=3;ctx.cloudRetryTimer=null;ctx.scheduleCloudRetry();
  assert.equal(timerDelay,64000);
  ctx.cloudRetryFailures=4;ctx.cloudRetryTimer=null;ctx.scheduleCloudRetry();
  assert.equal(timerDelay,120000);
  ctx.cloudRetryFailures=5;ctx.cloudRetryTimer=null;timerDelay=0;ctx.scheduleCloudRetry();
  assert.equal(timerDelay,0,"repeated transient failures stop instead of retrying forever");
});

ctx.cloudDirty=false;ctx.cloudRetryTimer=null;ctx.cloudRevision=stamp;
ctx.state.sync={pending_cloud_save:true,last_sync:stamp,last_save_attempt:{kind:"auth",at:stamp}};
ctx.accountSyncOperations=createCloudOperations();
ctx.hydrateCloudState=value=>JSON.parse(JSON.stringify(value));
ctx.initialState=()=>({});
ctx.playerHqNeedsCloudSync=()=>false;
ctx.mergeStateProtected=value=>JSON.parse(JSON.stringify(value));
ctx.reconcileCloudSquads=(_local,_remote,merged)=>({state:merged,conflicts:[],localNewer:[]});
ctx.repairLegacySquadIdentity=value=>({state:value});
ctx.backfillConfirmedHeroPowers=value=>({state:value});
ctx.adoptCanonicalPendingAccounts=value=>value;
ctx.rememberLastGoodState=()=>{};ctx.safeLocalSet=()=>true;ctx.STORE_KEY="synthetic";
ctx.rememberAccountState=()=>{};ctx.render=()=>{};ctx.renderProvider=()=>{};
let outboundBody;
ctx.fetchJsonBounded=async(_url,init)=>{
  outboundBody=JSON.parse(init.body);
  return {response:{ok:true,status:200},json:{ok:true,write_confirmed:true,state:{player_id:"owner",squads:ctx.state.squads},updated_at:stamp}};
};
const written=await ctx.pushServerState({userRequested:true});
check("explicit existing save action remains authorized and requires confirmed write acknowledgement",()=>{
  assert.equal(written.ok,true);
  assert.equal(ctx.currentAccountSyncView().confirmedAt,stamp);
  assert.equal(ctx.state.sync.last_confirmed_write_at,stamp);
  assert.equal(JSON.stringify(ctx.state.squads),fourSquads);
  assert.equal(outboundBody.state.sync.last_save_attempt,undefined);
  assert.equal(outboundBody.state.sync.last_confirmed_write_at,undefined);
});
const confirmedBefore=ctx.state.sync.last_confirmed_write_at;
ctx.fetchJsonBounded=async()=>({response:{ok:true},json:{ok:true,owner_verified:true,profile_present:true,updated_at:stamp}});
await ctx.checkAccountCloudStatus();
check("successful read cannot create or update the confirmed write date",()=>{
  assert.equal(ctx.state.sync.last_confirmed_write_at,confirmedBefore);
  assert.equal(ctx.currentAccountSyncView().confirmedAt,stamp);
});
ctx.betaConsentAccepted=()=>false;
const consentRefused=await ctx.pushServerState({userRequested:true});
check("explicit retry cannot bypass consent or access checks",()=>{
  assert.equal(consentRefused.reason,"cloud_access_unavailable");
  assert.equal(JSON.stringify(ctx.state.squads),fourSquads);
});
ctx.betaConsentAccepted=()=>true;
ctx.accountSyncOperations=createCloudOperations();ctx.state.sync={pending_cloud_save:true};
ctx.canUseKeepaliveBody=()=>true;
ctx.fetchJsonBounded=async(_url,init,timeout)=>{
  assert.equal(init.keepalive,true);assert.equal(timeout,25000);
  throw Object.assign(Error("synthetic"),{name:"TimeoutError"});
};
await ctx.pushServerState({keepalive:true});
check("mobile keepalive is bounded, releases the lock on timeout and preserves squads",()=>{
  assert.equal(ctx.accountSaveBusy,false);assert.equal(ctx.currentAccountSyncView().kind,"timeout");
  assert.equal(JSON.stringify(ctx.state.squads),fourSquads);
});

// Actual API entrypoint, with no real credentials or database: auth and all storage calls intercepted.
Object.assign(process.env,{SUPABASE_URL:"https://sync-fixture.invalid",SUPABASE_ANON_KEY:"fixture-public",
  SUPABASE_SERVICE_ROLE_KEY:"fixture-service"});
const fetchOriginal=globalThis.fetch,upstreams=[];
let authStatus=200;
globalThis.fetch=async(input,init={})=>{
  const url=String(input);assert.ok(url.startsWith("https://sync-fixture.invalid/"));
  upstreams.push({path:new URL(url).pathname,method:init.method||"GET"});
  if(url.includes("/auth/v1/user"))return new Response(JSON.stringify(authStatus===200?{id:"owner"}:{error:"invalid"}),{status:authStatus});
  assert.ok(url.includes("/rest/v1/"));
  return new Response(JSON.stringify([{player_id:"owner",state:{player_id:"owner",squads:[{id:1,power:44.43}]},updated_at:stamp}]));
};
async function api(headers){
  let status=200,json;
  await stateHandler({method:"GET",query:{action:"sync_status"},headers},
    {setHeader(){},status(n){status=n;return this},json(value){json=value;return this}});
  return {status,json};
}
try{
  const absent=await api({});
  check("actual status endpoint requires auth",()=>assert.equal(absent.status,401));
  const denied=await api({authorization:"Bearer synthetic"});
  check("actual status endpoint requires consent",()=>assert.equal(denied.status,428));
  const {BETA_CONSENT_VERSION}=await import("../lib/beta-access.js");
  const result=await api({authorization:"Bearer synthetic","x-warboost-beta-consent":BETA_CONSENT_VERSION});
  check("actual status endpoint returns version only, no profile or identity data",()=>{
    assert.equal(result.status,200);assert.deepEqual(Object.keys(result.json).sort(),["ok","owner_verified","profile_present","updated_at"]);
    assert.equal(result.json.updated_at,stamp);assert.equal(result.json.profile_present,true);
    assert.ok(upstreams.every(r=>r.method==="GET"));
    assert.ok(upstreams.every(r=>!r.path.includes("rpc")&&!r.path.includes("invitation")&&!r.path.includes("invite")));
  });
  authStatus=401;
  const rejected=await api({authorization:"Bearer synthetic","x-warboost-beta-consent":BETA_CONSENT_VERSION});
  check("actual status endpoint refuses an invalid session",()=>assert.equal(rejected.status,401));
}finally{globalThis.fetch=fetchOriginal;}
check("banner no longer uses generic offline text for pending",()=>{
  const start=source.indexOf("function betaAccessMessage("),end=source.indexOf("\nlet accountSyncCheckBusy",start);
  assert.doesNotMatch(source.slice(start,end),/offline_keep|safe_sync_done/);
});
console.log(`PASS account synchronization: ${checks} groups, ${translations} localized messages; actual controller/API with simulated transports, no real account writes`);
