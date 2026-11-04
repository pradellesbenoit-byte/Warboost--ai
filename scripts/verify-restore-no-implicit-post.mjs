import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import {
  accountSyncErrorKind,
  createCloudOperations,
  transientCloudFailure,
  verifiedAccountWriteReply
} from "../lib/account-sync-feedback.js";
import {
  createSaveDiagnostic,
  newSaveCorrelation,
  publicSaveError,
  safeSaveDiagnostic
} from "../lib/cloud-save-diagnostic.js";
import {reconcileConfirmedSquad} from "../lib/squad-identity.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";
import {repairLegacySquadIdentity} from "../lib/squad-identity.js";
import {backfillConfirmedHeroPowers} from "../lib/confirmed-hero-power.js";

const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const ownerA="fixture-device-account-a",ownerB="fixture-device-account-b";
const stamp="2026-11-03T12:00:00.000Z";
const heroes=["Carlie","Lucius","Morrison","DVA","Skyler"];

function appFunction(name){
  const match=new RegExp(`^(?:async\\s+)?function ${name}\\(`,"m").exec(source);
  assert.ok(match,`app.js must contain real ${name}()`);
  if(["saveState","scheduleServerSave","scheduleCloudRetry","markCloudPending"].includes(name)){
    return source.slice(match.index,source.indexOf("\n",match.index));
  }
  const end=source.indexOf("\n}",match.index);
  assert.ok(end>match.index,`could not extract the real ${name}()`);
  return source.slice(match.index,end+2);
}

function fixtureState(owner=ownerA,updatedAt=stamp){
  const state={
    player_id:owner,
    player:{name:"Fixture player",server_id:"884",hq_level:35,power_m:45.6,updated_at:updatedAt},
    alliance:{id:"fixture-alliance",tag:"ALL4",server_id:"884",role:"R3",management_verified:false,
      roster_sync_status:"clean",unlinked_accounts:[]},
    squads:[1,2,3,4].map(id=>({id,heroes:[]})),
    technology:{branches:{
      development:{name:"Development",state:"percent",percent:0,updated_at:updatedAt},
      team_1:{name:"Team 1",state:"max",updated_at:updatedAt},
      alliance_duel:{name:"Alliance Duel",state:"locked",updated_at:updatedAt}
    }},
    sync:{status:"ok",pending_cloud_save:false,sources:{}},
    updated_at:updatedAt
  };
  return reconcileConfirmedSquad(state,{
    squadId:1,names:heroes,updatedAt,
    incomingHeroes:heroes.map(name=>({name,level:155,
      ...(name==="DVA"?{exclusive:"Lame de Frappe DVA Nv.29"}:{})}))
  }).state;
}

function makeButton(){
  return {disabled:false,textContent:"",addEventListener(type,fn){this[`on_${type}`]=fn}};
}

function makeHarness({
  owner=ownerA,
  sessionOwner=owner,
  initialState=fixtureState(owner),
  cloudState=fixtureState(owner),
  cloudEmpty=false,
  restoreRepairPending=false,
  backfillChanged=false,
  cleanupChanged=false,
  consent=true,
  allowed=true,
  online=true,
  postReplies={},
  deferGet=false,
  directProfile=null
}={}){
  let consentValue=consent,onlineValue=online,sequence=0;
  const calls={get:[],post:[],saveState:0,pushServerState:0};
  const timers=new Map(),accountStates=new Map([[owner,clone(initialState)]]);
  let deferredGetResolve=null;
  let localStorageValue=clone(initialState);
  const buttons={
    "#syncPlayerBtn":makeButton(),
    "#syncAllBtn":makeButton(),
    "#syncPill":{className:"",textContent:""},
    "#playerSyncInfo":{textContent:"",className:"",classList:{remove(){},add(){}}},
    "#betaRestoreRetryBtn":makeButton()
  };
  const betaConsentNode={listeners:{},addEventListener(type,fn){this.listeners[type]=fn}};
  buttons["#betaConsent"]=betaConsentNode;
  const getReply=()=>{
    if(cloudEmpty)return {ok:true,cloud_empty:true,updated_at:null};
    return {
      ok:true,state:clone(cloudState),updated_at:cloudState?.updated_at||stamp,
      restore_repair_pending:restoreRepairPending,
      alliance_roster_repair:{changed:false,status:"canonical_roster_applied"}
    };
  };
  const operations=createCloudOperations();
  const sessionFor=id=>id?{user:{id},access_token:`token-${id}`}:null;
  const context=vm.createContext({
    console,Date,Intl,URL,Headers,
    navigator:{get onLine(){return onlineValue}},
    cloudSession:sessionFor(sessionOwner),
    state:clone(initialState),
    betaState:{allowed,access_status:allowed?"allowed":"invite-required",restore_error:null},
    proState:{active:false,status:"free"},
    cloudProfileVerified:false,canonicalRosterReady:false,cloudHydrationPending:false,
    cloudDirty:false,cloudRevision:null,cloudRetryTimer:null,cloudPullRetryTimer:null,pushTimer:null,
    localStateRevision:0,accountSaveBusy:false,cloudRetryFailures:0,suppressPush:false,
    syncActionBusy:false,rosterImportInFlight:false,accountSyncOperations:operations,
    playerSyncActionFeedback:null,pendingIdentityAliases:[],pendingIdentityAliasesOwner:"",
    pendingScanOwner:()=>"",clientId:()=>"fixture-device",
    safeClone:clone,STORE_KEY:"fixture-state",APP_VERSION:"fixture-version",lang:"en",
    navigatorLanguage:"en",
    BETA_CONSENT_VERSION:"fixture-consent-v1",
    betaAccessAllowed:()=>allowed,
    betaConsentAccepted:()=>consentValue,
    requireBetaAccess:()=>allowed,
    requireBetaConsent:()=>consentValue,
    sessionApplyKey:session=>session?.access_token?`${session.user?.id}|${session.access_token}`:"",
    hasMeaningfulCore:value=>Boolean(value?.player?.name||value?.squads?.some(squad=>squad.heroes?.length)),
    initialState:()=>fixtureState(""),
    hydrateCloudState:(value,_base,id)=>({...clone(value),player_id:id||value?.player_id}),
    mergeStateProtected:(base,remote,{preferBase=false}={})=>clone(preferBase?base:remote),
    reconcileCloudSquads:(base,remote,merged)=>reconcileCloudSquads(base,remote,merged),
    repairLegacySquadIdentity:value=>repairLegacySquadIdentity(value),
    backfillConfirmedHeroPowers:(value)=>backfillChanged
      ?{state:clone(value),changed:true}
      :backfillConfirmedHeroPowers(value),
    recoverLocalHeroHistory:value=>({state:clone(value),changed:false}),
    preservePendingRoster:(_base,value)=>value,
    adoptCanonicalPendingAccounts:value=>value,
    pendingIdentityAliasesFor:()=>[],
    normalizeAlliancePendingState:value=>{
      const next=clone(value);
      if(cleanupChanged)next.alliance.unlinked_accounts=[];
      return {state:next};
    },
    mergeDeviceCloudSaveMetadata:()=>({}),
    staleProfileRestore:()=>false,
    playerHqNeedsCloudSync:()=>false,
    betaStateAfterVerifiedStateRead:(current,{ok})=>({...current,allowed:ok&&allowed,access_status:ok?"allowed":"restore-failed"}),
    readAccountState:id=>clone(accountStates.get(id)||null),
    rememberAccountState:(id,value)=>accountStates.set(id,clone(value)),
    rememberLastGoodState:()=>{},
    safeLocalSet:(_key,value)=>{localStorageValue=typeof value==="string"?JSON.parse(value):clone(value);return true},
    safeLocalGet:()=>clone(localStorageValue),
    render(){},renderAuth(){},renderBeta(){},renderPro(){},renderProvider(){},renderSupportAccess(){},
    queueCriticalUiRepaint(){},refreshPlayerAdviceIfChanged(){},
    refreshBeta:async()=>({allowed}),refreshPro:async()=>{},
    runBootstrapStage:async(_stage,fn)=>fn(),
    bootstrapNow:()=>Date.now(),pushBootstrapStage:()=>{},
    resetBootstrapDiagnostics:()=>{},finishBootstrapDiagnostics:()=>{},lastBootstrapFailure:()=>null,
    restoreAttemptSucceeded:value=>Boolean(value?.ok||value?.cloud_empty),
    pendingJoinCode:()=>null,restorePendingScans:async()=>{},resetPendingScanUi:()=>{},
    movePendingScans:async()=>{},clearSignedOutAuthUi:()=>{},
    shouldPreserveVerifiedSessionAccess:()=>false,
    betaStateForSessionBootstrap:value=>value,
    safestLoginSeed:(id,current)=>String(current?.player_id||"")===id?clone(current):clone(accountStates.get(id)||null),
    mergeState:(base,incoming)=>({...clone(base),...clone(incoming)}),
    safeFields:(base,incoming)=>({...clone(base),...clone(incoming)}),
    mergeAllianceMembersProtected:(_base,incoming)=>clone(incoming),
    applyCanonicalRosterKeys:value=>value,
    authHeaders:()=>({authorization:`Bearer token-${context.cloudSession?.user?.id||owner}`,"x-warboost-beta-consent":"fixture-consent-v1"}),
    $:selector=>buttons[selector]||null,
    t:key=>String(key),
    openDrawer:()=>{},
    showPlayerSyncFeedback:(key)=>{buttons["#playerSyncInfo"].textContent=Array.isArray(key)?key.join("|"):key},
    renderPlayerSyncFeedback:()=>{},
    renderRosterSyncDiagnostic:()=>{},
    analysisIndicator:{begin:()=>()=>{}},
    createSaveDiagnostic,safeSaveDiagnostic,newSaveCorrelation,publicSaveError,
    accountSyncErrorKind,transientCloudFailure,verifiedAccountWriteReply,
    confirmedWriteReceipt:()=>null,
    currentAccountSyncView:()=>{
      const snapshot=operations.snapshot(context.sessionApplyKey(context.cloudSession));
      return {saveKind:snapshot?.save?.kind||null};
    },
    recordAccountSyncResult:(result,key,operation)=>{
      if(operation)operations.complete(operation,result,key);
    },
    persistRosterCandidate:async()=>({}),
    adoptRosterOnlyReply:value=>value,
    rosterSyncCopy:()=>({}),
    recordRosterDiagnostic:value=>value,
    safeRosterDiagnostic:value=>value,
    rosterFailureKind:()=>"role",
    setTimeout:(fn,delay=0)=>{const id=++sequence;timers.set(id,{fn,delay});return id},
    clearTimeout:id=>timers.delete(id),
    localStorage:{
      getItem:key=>key==="fixture-consent"?consentValue?"1":null:null,
      setItem:(key,value)=>{if(key==="fixture-consent")consentValue=value==="1"},
      removeItem:key=>{if(key==="fixture-consent")consentValue=false}
    },
    betaConsentStorageKey:()=>"fixture-consent",
    safeLocalStorage:{},
    document:{},
    fetchJsonBounded:null,
    readOwnProfileDirect:async()=>directProfile
      ?{ok:true,state:clone(directProfile.state),updated_at:directProfile.updated_at}
      :{ok:false,error:"no_direct_profile_fixture"},
    syncActionBusy:false,
    accountSyncMessage:()=>"fixture",
    refreshProAfterSync:async()=>{}
  });

  context.fetchJsonBounded=async(url,init={})=>{
    const method=String(init.method||"GET").toUpperCase();
    const route=String(url);
    if(method==="GET"){
      calls.get.push({route,owner:String(context.cloudSession?.user?.id||"")});
      if(deferGet)return new Promise(resolve=>{deferredGetResolve=()=>resolve({response:{ok:true,status:200},json:getReply()})});
      return {response:{ok:true,status:200},json:getReply()};
    }
    calls.post.push({route,method,owner:String(context.cloudSession?.user?.id||""),body:init.body||null});
    if(!onlineValue)throw Object.assign(new Error("fixture offline"),{name:"TypeError"});
    const configured=postReplies[route]||postReplies[method]||null;
    if(configured)return typeof configured==="function"?configured(url,init,context):configured;
    const body=JSON.parse(String(init.body||"{}"));
    const submitted=body.state||context.state;
    const revision="2026-11-03T12:01:00.000Z";
    return {response:{ok:true,status:200},json:{
      ok:true,write_confirmed:true,provider:"warboost",provider_kind:"cloud",
      state:{...clone(submitted),player_id:context.cloudSession?.user?.id},
      updated_at:revision,synced_at:revision,sources:{player:true}
    }};
  };

  const names=[
    "saveState","scheduleServerSave","scheduleCloudRetry","markCloudPending",
    "pushServerState","pullDirectOwnProfile","pullServerState",
    "restoreAuthenticatedProfile","reconcileAuthenticatedRuntime","applySessionCore","syncAll"
  ];
  vm.runInContext(names.map(appFunction).join("\n"),context);
  const consentBinding=source.split(/\r?\n/).find(line=>line.trim().startsWith('$("#betaConsent")?.addEventListener("change"'));
  assert.ok(consentBinding,"the actual consent change binding exists");
  vm.runInContext(consentBinding,context);
  vm.runInContext('$("#syncPlayerBtn").addEventListener("click",syncAll);',context);
  return {
    context,calls,timers,buttons,accountStates,
    get localStorageValue(){return clone(localStorageValue)},
    set online(value){onlineValue=value},
    async flushTimers(limit=20){
      let count=0;
      while(timers.size&&count++<limit){
        const batch=[...timers.entries()];timers.clear();
        for(const [,timer] of batch)await timer.fn();
      }
      assert.ok(count<limit,"timer queue did not settle");
    },
    releaseGet(){assert.ok(deferredGetResolve,"a GET is pending");deferredGetResolve()}
  };
}

test("1. identical authenticated restore GET causes no POST",async()=>{
  const h=makeHarness();
  await h.context.restoreAuthenticatedProfile(clone(h.context.state),{reason:"test"});
  await h.flushTimers();
  assert.equal(h.calls.get.length,1);
  assert.equal(h.calls.post.length,0);
});

test("2. restore_repair_pending returned by GET does not itself cause a POST",async()=>{
  const h=makeHarness({restoreRepairPending:true});
  await h.context.restoreAuthenticatedProfile(clone(h.context.state),{reason:"test"});
  await h.flushTimers();
  assert.equal(h.calls.get.length,1);
  assert.equal(h.calls.post.length,0);
});

test("3a. a read-only hero-power backfill is not uploaded automatically",async()=>{
  const h=makeHarness({backfillChanged:true});
  await h.context.restoreAuthenticatedProfile(clone(h.context.state),{reason:"test"});
  await h.flushTimers();
  assert.equal(h.calls.post.length,0);
});

test("3b. a read-only pending-roster cleanup is not uploaded automatically",async()=>{
  const initial=fixtureState(ownerA);
  initial.alliance.unlinked_accounts=["legacy-unlinked-entry"];
  const remote=fixtureState(ownerA);
  remote.alliance.unlinked_accounts=["legacy-unlinked-entry"];
  const h=makeHarness({initialState:initial,cloudState:remote,cleanupChanged:true});
  await h.context.restoreAuthenticatedProfile(clone(h.context.state),{reason:"test"});
  await h.flushTimers();
  assert.equal(h.calls.post.length,0);
});

test("4. granting consent for an already populated Cloud profile does not save it",async()=>{
  const h=makeHarness({consent:false});
  const listener=h.buttons["#betaConsent"].listeners.change;
  assert.equal(typeof listener,"function");
  await listener({target:{checked:true}});
  await h.flushTimers();
  assert.equal(h.calls.get.length,1);
  assert.equal(h.calls.post.length,0);
});

test("5. consent plus an empty Cloud permits one same-owner initial local transfer",async()=>{
  const h=makeHarness({cloudEmpty:true});
  await h.context.applySessionCore({user:{id:ownerA},access_token:`token-${ownerA}`});
  await h.flushTimers();
  assert.ok(h.calls.get.length>=1);
  assert.ok(h.calls.post.some(call=>call.route==="/api/state"&&call.owner===ownerA));
  assert.equal(h.calls.post.some(call=>call.owner!==ownerA),false);
});

test("6. a real local save survives offline and retries after reconnect",async()=>{
  const h=makeHarness({online:false});
  h.context.state.player.power_m=47.2;
  assert.equal(h.context.saveState(),true);
  await h.flushTimers();
  assert.equal(h.calls.post.length,1);
  assert.equal(h.context.state.sync.pending_cloud_save,true);
  h.online=true;
  await h.context.reconcileAuthenticatedRuntime("online",{force:true});
  await h.flushTimers();
  assert.ok(h.calls.post.length>=2);
  const saved=h.calls.post.at(-1);
  assert.equal(saved.owner,ownerA);
  assert.equal(JSON.parse(saved.body).state.player.power_m,47.2);
});

test("7. explicit player Synchronize click still POSTs and accepts a matching receipt",async()=>{
  const h=makeHarness();
  await h.buttons["#syncPlayerBtn"].on_click();
  assert.equal(h.calls.post.length,1);
  assert.equal(h.calls.post[0].route,"/api/sync");
  assert.equal(h.context.accountSyncOperations.snapshot(h.context.sessionApplyKey(h.context.cloudSession)).save.kind,"verified");
});

test("8. a voluntary 409 does not trigger an automatic forced rewrite",async()=>{
  const h=makeHarness({postReplies:{"/api/sync":{
    response:{ok:false,status:409},json:{error:"profile_write_conflict"}
  }}});
  const before=JSON.stringify(h.context.state.squads);
  await h.buttons["#syncPlayerBtn"].on_click();
  await h.flushTimers();
  assert.equal(h.calls.post.length,1);
  assert.equal(JSON.stringify(h.context.state.squads),before);
  assert.equal(h.context.state.sync.pending_cloud_save,true);
});

test("9. a late GET reply after account switch cannot POST or hydrate the new account",async()=>{
  const h=makeHarness({deferGet:true});
  const pending=h.context.pullServerState(clone(h.context.state),{fastRestore:true});
  h.context.cloudSession={user:{id:ownerB},access_token:`token-${ownerB}`};
  h.releaseGet();
  const result=await pending;
  assert.equal(result.error,"account_changed");
  assert.equal(h.calls.post.length,0);
  assert.equal(h.context.state.player_id,ownerA);
});

test("10. an R4/R5 refusal never promotes local role or management authority",async()=>{
  const state=fixtureState(ownerA);
  state.alliance.role="R3";state.alliance.management_verified=false;
  const h=makeHarness({initialState:state,cloudState:state,postReplies:{"/api/sync":{
    response:{ok:false,status:403},json:{error:"r4_r5_required"}
  }}});
  await h.buttons["#syncPlayerBtn"].on_click();
  assert.equal(h.calls.post.length,1);
  assert.equal(h.context.state.alliance.role,"R3");
  assert.equal(h.context.state.alliance.management_verified,false);
  assert.equal(h.context.state.sync.pending_cloud_save,true);
});
