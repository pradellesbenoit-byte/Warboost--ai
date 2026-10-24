import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {accountSyncView,confirmedWriteReceipt,deviceCloudSaveMetadata,mergeDeviceCloudSaveMetadata,
  staleProfileRestore,createCloudOperations,transientCloudFailure} from "../lib/account-sync-feedback.js";
import {safeSaveDiagnostic} from "../lib/cloud-save-diagnostic.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";
import {translator} from "../i18n.js";
import {normalizeState} from "../lib/normalize.js";

let checks=0,translations=0;
const test=(label,run)=>{run();checks++;console.log("PASS "+label)};
const old="2026-10-14T18:50:00.000Z",now="2026-10-15T08:43:38.103Z",later="2026-10-15T09:00:00.000Z";
const owner="fixture-owner",session="fixture-token";
const diagnostic=(at=now)=>({endpoint:"/api/state",method:"POST",stage:"response",http_status:200,
  code:"save_confirmed",write_state:"confirmed",at,duration_ms:2451,correlation_id:"00000000-0000-4000-8000-000000000001"});
const proof=confirmedWriteReceipt({revision:now,at:now,diagnostic:diagnostic()});
const clone=value=>JSON.parse(JSON.stringify(value));
const squads=Array.from({length:4},(_,i)=>({id:i+1,power:40+i,
  heroes:[{name:["Murphy","DVA","Tesla","Mason"][i],level:150+i,gear:"slot=0;count=1;level=0"}],
  ...(i===1?{composition_conflict:{reason:"squad_freshness_ambiguous",status:"needs_verification"}}:{})}));
const saved={player_id:owner,squads:clone(squads),sync:{last_confirmed_write_at:now,last_confirmed_write_receipt:proof,
  last_save_attempt:{kind:"verified",at:now,diagnostic:diagnostic()}}};

test("verified server receipt is distinct from complete synchronization",()=>{
  const view=accountSyncView({sync:saved.sync});
  assert.equal(view.lastConfirmedAt,now);assert.equal(view.localKind,"clear");
  assert.equal(view.confirmedAt,null);assert.equal(view.kind,"unknown");
});
test("success then local squad conflict keeps the success and the conflict",()=>{
  const view=accountSyncView({sync:{...saved.sync,pending_cloud_save:true,last_error:"squad_freshness_ambiguous"}});
  assert.equal(view.lastConfirmedAt,now);assert.equal(view.localKind,"squad_conflict");
  assert.equal(view.saveDiagnostic.code,"save_confirmed");assert.equal(view.kind,"conflict");
});
test("success plus pending changes does not claim all data is synchronized",()=>{
  const view=accountSyncView({sync:saved.sync,dirty:true});
  assert.equal(view.lastConfirmedAt,now);assert.equal(view.localKind,"pending");assert.equal(view.confirmedAt,null);
});
test("actual squad conflict stays visible even when the generic pending flag is absent",()=>{
  assert.equal(accountSyncView({sync:saved.sync,hasSquadConflict:true}).localKind,"squad_conflict");
});
test("version conflict and read-only check cannot erase a server acknowledgement",()=>{
  const view=accountSyncView({sync:saved.sync,check:{kind:"conflict"}});
  assert.equal(view.lastConfirmedAt,now);assert.equal(view.localKind,"version_conflict");
  assert.equal(accountSyncView({sync:saved.sync,check:{kind:"verified"}}).lastConfirmedAt,now);
});
test("later failed attempt retains the earlier verified write separately",()=>{
  const view=accountSyncView({sync:{...saved.sync,last_save_attempt:{kind:"auth",at:later}}});
  assert.equal(view.saveKind,"auth");assert.equal(view.localKind,"auth");assert.equal(view.lastConfirmedAt,now);
});
test("bare historical date, GET and HTTP 200 without write proof cannot create a receipt",()=>{
  assert.equal(accountSyncView({sync:{last_confirmed_write_at:now,last_sync:now},check:{kind:"verified"}}).lastConfirmedAt,null);
  for(const patch of [{code:"sync_unconfirmed"},{write_state:"unknown"},{http_status:409},{http_status:null}]){
    assert.equal(confirmedWriteReceipt({...proof,diagnostic:{...proof.diagnostic,...patch}}),null);
  }
});
test("existing verified local acknowledgement upgrades without inventing a revision",()=>{
  const legacy=clone(saved);delete legacy.sync.last_confirmed_write_receipt;
  assert.deepEqual(deviceCloudSaveMetadata(legacy,owner).last_confirmed_write_receipt,proof);
  assert.equal(accountSyncView({sync:legacy.sync}).lastConfirmedAt,now);
  delete legacy.sync.last_confirmed_write_at;
  assert.equal(accountSyncView({sync:legacy.sync}).lastConfirmedAt,null);
});
test("refresh preserves the historical proof without certifying the current revision",()=>{
  const metadata=deviceCloudSaveMetadata(clone(saved),owner);
  assert.equal(accountSyncView({sync:metadata,revision:later}).lastConfirmedAt,now);
  assert.equal(accountSyncView({sync:metadata,revision:later}).confirmedAt,null);
});
test("inverse metadata order cannot restore an old error over a later success",()=>{
  const older={player_id:owner,sync:{last_save_attempt:{kind:"conflict",at:old}}};
  for(const sources of [[saved,older],[older,saved]]){
    const merged=mergeDeviceCloudSaveMetadata(sources,owner);
    assert.equal(merged.last_save_attempt.kind,"verified");assert.deepEqual(merged.last_confirmed_write_receipt,proof);
  }
});
test("receipt survives a subsequent error while that error remains the latest attempt",()=>{
  const failed={player_id:owner,sync:{last_save_attempt:{kind:"conflict",at:later}}};
  const result=mergeDeviceCloudSaveMetadata([saved,failed],owner);
  assert.equal(result.last_save_attempt.kind,"conflict");assert.equal(result.last_confirmed_write_at,now);
});
test("wrong-owner metadata is rejected and empty local metadata clears cloud echoes",()=>{
  const foreign={...saved,player_id:"different-fixture-owner"};
  const result=mergeDeviceCloudSaveMetadata([foreign],owner);
  assert.equal(result.last_confirmed_write_receipt,null);assert.equal(result.last_save_attempt,null);
  assert.deepEqual(deviceCloudSaveMetadata(foreign,owner),{});
});
test("only an older or empty restore is rejected; equal and newer versions remain readable",()=>{
  const metadata=deviceCloudSaveMetadata(saved,owner);
  assert.equal(staleProfileRestore(old,metadata),true);assert.equal(staleProfileRestore(null,metadata),true);
  assert.equal(staleProfileRestore(now,metadata),false);assert.equal(staleProfileRestore(later,metadata),false);
  assert.equal(staleProfileRestore(old,{}),false);
});
test("runtime newer acknowledgement wins an older persisted receipt",()=>{
  const view=accountSyncView({sync:saved.sync,save:{kind:"verified",revision:later,at:later,diagnostic:diagnostic(later)}});
  assert.equal(view.lastConfirmedAt,later);
});

const app=fs.readFileSync("app.js","utf8");
function fn(name){
  const start=app.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,name);
  const rest=app.slice(start),end=rest.slice(1).search(/\n(?:async )?function /);
  return end<0?rest:rest.slice(0,end+1);
}
// Extract exact function declarations only, not following event bindings.
function declaration(name){
  const source=fn(name),marker=source.indexOf("\n}\n");
  return marker<0?source:source.slice(0,marker+2);
}
test("actual own-account cache preserves receipt across gameplay normalization and reload",()=>{
  const memory=new Map([["fixture:"+owner,JSON.stringify(saved)]]);
  const storage=vm.createContext({localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},
    accountStateKey:id=>"fixture:"+id,hasMeaningfulCore:()=>true,safeClone:clone,mergeDeviceCloudSaveMetadata,cloudDirty:true});
  vm.runInContext(["readAccountState","rememberAccountState"].map(declaration).join("\n"),storage);
  const normalized=normalizeState(clone(saved));
  assert.equal(normalized.sync.last_confirmed_write_receipt,undefined,"gameplay normalization intentionally omits device receipts");
  storage.rememberAccountState(owner,normalized);
  const reloaded=storage.readAccountState(owner);
  assert.deepEqual(deviceCloudSaveMetadata(reloaded,owner).last_confirmed_write_receipt,proof);
  assert.equal(accountSyncView({sync:reloaded.sync}).lastConfirmedAt,now);
  assert.equal(reloaded.sync.pending_cloud_save,true);
  assert.equal(memory.has("fixture:different-fixture-owner"),false);
});
let resolveRead;
const ctx=vm.createContext({Date,Intl,clearTimeout(){},cloudRetryTimer:null,pushTimer:null,
  cloudSession:{access_token:session,user:{id:owner}},betaState:{allowed:true},state:clone(saved),
  accountSyncOperations:createCloudOperations(),cloudDirty:false,cloudRevision:now,locale:"fr",
  navigator:{onLine:true},sessionApplyKey:value=>value?.access_token||"",betaConsentAccepted:()=>true,
  hasMeaningfulCore:()=>true,safeClone:clone,collectPendingIdentityAliases:()=>[],readAccountState:()=>null,
  readOwnProfileDirect:()=>new Promise(resolve=>{resolveRead=resolve}),cloudDataConfig:{url:"https://fixture.invalid",key:"fixture"},
  safeSaveDiagnostic,confirmedWriteReceipt,mergeDeviceCloudSaveMetadata,staleProfileRestore,transientCloudFailure,
  accountSyncView,t:translator("fr")});
vm.runInContext(["recordAccountSyncResult","currentAccountSyncView","accountSyncMessage","pullDirectOwnProfile","pullServerState"].map(declaration).join("\n"),ctx);
const captureBefore=clone(saved);
const pending=ctx.pullDirectOwnProfile(captureBefore);
const operation=ctx.accountSyncOperations.begin(session,"save");
ctx.recordAccountSyncResult({kind:"verified",revision:later,at:later,diagnostic:diagnostic(later)},session,operation);
const afterWrite=JSON.stringify(ctx.state);
resolveRead({ok:true,state:captureBefore,updated_at:old});
const ignored=await pending;
test("actual delayed restore is discarded after a newer write, preserving all four squads and conflict",()=>{
  assert.equal(ignored.ignored_stale_restore,true);assert.equal(JSON.stringify(ctx.state),afterWrite);
  assert.equal(JSON.stringify(ctx.state.squads),JSON.stringify(squads));
  assert.equal(ctx.currentAccountSyncView().lastConfirmedAt,later);
});
test("actual French panel shows separate write, local squad conflict and read check",()=>{
  const read=ctx.accountSyncOperations.begin(session,"check");
  ctx.accountSyncOperations.complete(read,{kind:"verified"},session);
  const text=ctx.accountSyncMessage();
  assert.match(text,/Dernière sauvegarde cloud confirmée/);assert.match(text,/Éléments locaux à vérifier: Conflit local\/cloud enregistré — non revalidé/);
  assert.match(text,/Vérification réussie — aucune sauvegarde effectuée/);
  assert.doesNotMatch(text,/Dernière tentative de sauvegarde.*Conflit/);
});
test("current account mismatch cannot reveal a previous receipt",()=>{
  ctx.state.player_id="different-fixture-owner";
  assert.equal(ctx.currentAccountSyncView().lastConfirmedAt,null);
  assert.equal(ctx.currentAccountSyncView().saveDiagnostic,null);
  ctx.state.player_id=owner;
});
const pendingSession=ctx.pullDirectOwnProfile();
ctx.cloudSession={access_token:"renewed-fixture",user:{id:owner}};
const beforeSessionReply=JSON.stringify(ctx.state);
resolveRead({ok:true,state:captureBefore,updated_at:old});
const rejected=await pendingSession;
test("response from a previous session is rejected without changing local data",()=>{
  assert.equal(rejected.error,"account_changed");assert.equal(JSON.stringify(ctx.state),beforeSessionReply);
  assert.equal(ctx.currentAccountSyncView().confirmedAt,null);
  assert.equal(ctx.currentAccountSyncView().lastConfirmedAt,later,"same-account historical proof survives renewal");
});
let resolveServerRead;
Object.assign(ctx,{renderBeta(){},authHeaders:()=>({}),appendServerRestoreTrace(){},
  betaStateAfterVerifiedStateRead:value=>value,BETA_CONSENT_VERSION:"fixture-consent",
  fetchJsonBounded:()=>new Promise(resolve=>{resolveServerRead=resolve})});
const pendingServer=ctx.pullServerState();
const newest="2026-10-15T10:00:00.000Z",renewedSession=ctx.cloudSession.access_token;
const nextOperation=ctx.accountSyncOperations.begin(renewedSession,"save");
ctx.recordAccountSyncResult({kind:"verified",revision:newest,at:newest,diagnostic:diagnostic(newest)},renewedSession,nextOperation);
ctx.cloudRevision=newest;
const afterNewWrite=JSON.stringify(ctx.state);
resolveServerRead({response:{ok:true,status:200},json:{ok:true,state:captureBefore,updated_at:old}});
const ignoredServer=await pendingServer;
test("actual API restore arriving after success cannot roll back feedback, version or four squads",()=>{
  assert.equal(ignoredServer.ignored_stale_restore,true);assert.equal(JSON.stringify(ctx.state),afterNewWrite);
  assert.equal(ctx.cloudRevision,newest);assert.equal(JSON.stringify(ctx.state.squads),JSON.stringify(squads));
  assert.equal(ctx.currentAccountSyncView().lastConfirmedAt,newest);
});
test("no receipt metadata is sent back as cloud authority",()=>{
  assert.match(app,/delete outbound\.sync\.last_confirmed_write_receipt/);
  assert.equal(mergeDeviceCloudSaveMetadata([ctx.state],owner).last_confirmed_write_receipt.at,newest);
});
test("both restoration transports guard session and use the latest own metadata",()=>{
  for(const name of ["pullDirectOwnProfile","pullServerState"]){
    const source=declaration(name);
    assert.match(source,/sessionApplyKey\(cloudSession\)!==restoreSession/);
    assert.match(source,/mergeDeviceCloudSaveMetadata\(\[localFallback,state,readAccountState\(userId\)\],userId\)/);
    assert.match(source,/staleProfileRestore/);assert.match(source,/\.\.\.localSaveMetadata/);
  }
});
test("eight new labels resolve in all 22 languages / 23 locales",()=>{
  for(const [code,copy] of Object.entries(ACCOUNT_SYNC_COPY)){
    for(const key of ["confirmed_label","confirmed_none","local_label","local_clear","squad_conflict","version_conflict","attempt_label","check_none"]){
      const name="account_sync_"+key;
      assert.ok(copy[name]?.trim(),`${code}:${name}`);assert.equal(translator(code)(name),copy[name]);translations++;
    }
  }
});
console.log(`PASS account receipt separation: ${checks} groups, ${translations} localized labels; real presentation/restore functions, synthetic in-memory data, no network or real account writes.`);
