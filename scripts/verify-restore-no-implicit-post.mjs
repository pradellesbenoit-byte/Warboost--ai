import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

import {mergeDeviceCloudSaveMetadata,staleProfileRestore} from "../lib/account-sync-feedback.js";
import {backfillConfirmedHeroPowers,repairLegacySquadIdentity,fixedHeroSlots,normalizeSquadSlots,squadForStableSlot} from "../lib/squad-identity.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";
import {playerHqNeedsCloudSync} from "../lib/player-hq.js";
import {mergePlayerHqFields} from "../lib/player-hq.js";
import {mergeFreshRecord} from "../lib/field-freshness.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";
import {canonicalPowerMillions} from "../lib/power-units.js";

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");

function extract(name){
  const start=app.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,`app.js must contain ${name}`);
  if(["scheduleServerSave","betaConsentStorageKey","betaConsentAccepted"].includes(name)){
    const end=app.indexOf("\n",start);
    return app.slice(start,end);
  }
  const end=app.indexOf("\n}\n",start);
  assert.ok(end>start,`could not locate end of app.js function ${name}`);
  return app.slice(start,end+2);
}

const actualPullServerState=extract("pullServerState")
  .replace('return {ok:false,error:e?.name||"offline"}','return {ok:false,error:e?.name||"offline",detail:String(e)}');
const actualScheduleServerSave=extract("scheduleServerSave");
const actualScheduleCloudRetry=extract("scheduleCloudRetry");
const actualRestoreAuthenticatedProfile=extract("restoreAuthenticatedProfile");
const actualMergeState=extract("mergeState");
const actualMergeStateProtected=extract("mergeStateProtected");
const actualBetaConsentStorageKey=extract("betaConsentStorageKey");
const actualBetaConsentAccepted=extract("betaConsentAccepted");
const consentBinding=app.split(/\r?\n/).find(line=>line.trim().startsWith('$("#betaConsent")?.addEventListener("change"'));
assert.ok(consentBinding,"app.js must bind the real beta consent change handler");

function clone(value){return JSON.parse(JSON.stringify(value))}
function emptySquad(id){
  return {id,name:`Squad ${id}`,power:null,updated_at:null,heroes:fixedHeroSlots([]),
    confirmed_composition:[],composition_conflict:{identity_history:[]},needs_rescan:false};
}
function syncShape(squads=[]){
  return {player_context:{},player_availability:[],availability_history:[],activity_events:[],
    drone:{level:null,power_m:null,boostCombat:{},components:[],skill_chips:[]},
    shop:{offers:[],snapshots:[]},alliance:{members:[],unlinked_accounts:[],former_members:[],roster_removal_tombstones:[]},
    vs:{snapshots:[],leaderboard:[]},season:{},technology:{branches:{}},
    exclusive_weapons:[],late_game_progression:{},hero_progression:[],hero_profiles:[],
    progression_snapshots:[],sync:{sources:{}},squads:Array.from({length:4},(_,i)=>squads[i]||emptySquad(i+1)),
    resources:{}};
}
function mergeHarnessDependencies(){
  const mergeArrays=(...values)=>values.flatMap(value=>Array.isArray(value)?value:[]);
  const mergeObjects=(base={},incoming={})=>({...base,...incoming});
  return {
    APP_VERSION:"synthetic-test",
    prepareLegacyV1State:value=>value,
    mergeFreshRecord,
    canonicalPowerMillions,
    mergeActivityEvents:mergeArrays,
    mergeEventAvailabilities:mergeArrays,
    mergeAvailabilityHistory:mergeArrays,
    mergeShopState:(base={},incoming={})=>({...base,...incoming,
      offers:mergeArrays(base.offers,incoming.offers),snapshots:mergeArrays(base.snapshots,incoming.snapshots)}),
    mergeAllianceMembersProtected:()=>[],
    reconcileCanonicalAlliance:(base={},incoming={},merged={})=>({...base,...incoming,...merged}),
    normalizeUnlinkedAccounts:()=>[],
    normalizeRosterRemovalTombstones:()=>[],
    mergeDesertStormState:mergeObjects,
    mergeCanyonState:mergeObjects,
    mergeVsState:mergeObjects,
    mergeTechnologyBranches:mergeObjects,
    mergeExclusiveWeapons:mergeArrays,
    mergeLateGameProgression:mergeObjects,
    mergeHeroProgression:mergeArrays,
    mergeHeroProfiles:mergeArrays,
    mergeProgressionSnapshots:mergeArrays,
    mergeSquadPayload:(base={},incoming={},id)=>({...base,...incoming,id,heroes:incoming?.heroes||base?.heroes||fixedHeroSlots([])}),
    squadForStableSlot,
    emptySquad,
    normalizeSquadSlots,
    fixedHeroSlots,
    mergePlayerHqFields,
    backfillConfirmedHeroPowers,
    safeFields:(base={},incoming={},preferBase=false)=>{
      const out={...base};
      for(const [key,value] of Object.entries(incoming||{})){
        if(value===null||value===undefined||value==="")continue;
        if(!preferBase||out[key]===null||out[key]===undefined||out[key]==="")out[key]=value;
      }
      return out;
    }
  };
}
function makeHarness({restoreRepairPending=false}={}){
  const owner="synthetic-owner-a";
  const stamp="2026-11-01T12:00:00.000Z";
  const cloudState={
    player_id:owner,
    updated_at:stamp,
    player:{name:"Synthetic player"},
    squads:[],
    alliance:{members:[],unlinked_accounts:[]},
    technology:{branches:{}},
    sync:{pending_cloud_save:false}
  };
  const timers=new Map();
  const requests=[];
  let nextTimer=1;
  const responseJson={
    ok:true,
    state:clone(cloudState),
    updated_at:stamp,
    restore_repair_pending:restoreRepairPending,
    alliance_roster_repair:{status:"unchanged",changed:false}
  };

  const context=vm.createContext({
    Date,JSON,URL,console,
    navigator:{onLine:true},
    cloudSession:{user:{id:owner},access_token:"synthetic-token"},
    state:clone(cloudState),
    cloudRevision:stamp,
    cloudProfileVerified:false,
    canonicalRosterReady:false,
    cloudHydrationPending:false,
    cloudDirty:false,
    cloudPullRetryTimer:null,
    cloudRetryTimer:null,
    pushTimer:null,
    localStateRevision:1,
    STORE_KEY:"warboost.synthetic.restore-test",
    suppressPush:false,
    betaState:{allowed:true,access_status:"allowed"},
    BETA_CONSENT_VERSION:"synthetic-consent-v1",
    sessionApplyKey:session=>session?.user?.id&&session?.access_token
      ?`${session.user.id}:${session.access_token}`:"",
    betaStateAfterVerifiedStateRead:(current)=>({...current,allowed:true,access_status:"allowed"}),
    hasMeaningfulCore:value=>Boolean(value?.player_id&&value?.player),
    safeClone:clone,
    readAccountState:()=>null,
    initialState:()=>({player:{},squads:[],alliance:{members:[]},technology:{branches:{}}}),
    hydrateCloudState:(value,_initial,userId)=>({...clone(value),player_id:userId}),
    mergeStateProtected:(_base,remote)=>clone(remote),
    reconcileCloudSquads:(_base,_remote,merged)=>reconcileCloudSquads(_base,_remote,merged),
    preservePendingRoster:(_local,merged)=>merged,
    adoptCanonicalPendingAccounts:merged=>merged,
    normalizeAlliancePendingState:input=>({state:input,changed:false}),
    pendingIdentityAliasesFor:()=>[],
    collectPendingIdentityAliases:()=>[],
    mergeDeviceCloudSaveMetadata,
    staleProfileRestore,
    repairLegacySquadIdentity,
    backfillConfirmedHeroPowers,
    recoverLocalHeroHistory:value=>value,
    playerHqNeedsCloudSync,
    safeLocalSet:()=>true,
    rememberLastGoodState:()=>{},
    rememberAccountState:()=>{},
    refreshPlayerAdviceIfChanged:()=>{},
    appendServerRestoreTrace:()=>{},
    bootstrapNow:()=>Date.now(),
    pushBootstrapStage:()=>{},
    render:()=>{},
    renderBeta:()=>{},
    scheduleCloudPullRetry:()=>{},
    authHeaders:()=>({authorization:"Bearer synthetic-token"}),
    fetchJsonBounded:async(url,options={})=>{
      requests.push({url,method:String(options?.method||"GET").toUpperCase()});
      return {response:{ok:true,status:200},json:clone(responseJson)};
    },
    // This is the transport sink for a scheduled upload. It is deliberately a counter,
    // not an app helper: the restoration and scheduling functions above are the real code.
    pushServerState:async()=>{
      requests.push({url:"/api/state",method:"POST"});
      return {ok:true};
    },
    clearTimeout:id=>timers.delete(id),
    setTimeout:(callback,delay)=>{
      const id=nextTimer++;
      timers.set(id,{callback,delay});
      return id;
    }
  });

  vm.runInContext(`${actualScheduleServerSave}\n${actualPullServerState}`,context);

  async function flushScheduledUploads(){
    while(timers.size){
      const pending=[...timers.entries()];
      timers.clear();
      for(const [,timer] of pending)await timer.callback();
    }
  }
  return {
    context,requests,responseJson,flushScheduledUploads,
    get postRequests(){return requests.filter(request=>request.method==="POST")},
    get getRequests(){return requests.filter(request=>request.method==="GET")}
  };
}

test("real app.js pullServerState restores an unchanged cloud profile without POST",async()=>{
  const harness=makeHarness();
  const result=await harness.context.pullServerState(null,{fastRestore:true});
  await harness.flushScheduledUploads();

  assert.equal(result.ok,true,`restore result: ${JSON.stringify(result)}`);
  assert.equal(harness.getRequests.length,1);
  assert.equal(harness.getRequests[0].url,"/api/state?restore=1");
  assert.equal(harness.postRequests.length,0,"a read of an unchanged profile must not schedule an upload");
});

test("restore_repair_pending from GET alone is not treated as write intent",async()=>{
  const harness=makeHarness({restoreRepairPending:true});
  const result=await harness.context.pullServerState(null,{fastRestore:true});
  await harness.flushScheduledUploads();

  assert.equal(result.ok,true,`restore result: ${JSON.stringify(result)}`);
  assert.equal(harness.responseJson.restore_repair_pending,true);
  assert.equal(harness.getRequests.length,1);
  assert.equal(harness.postRequests.length,0,"server-reported pending repair without local write intent must not POST");
});

function makeConsentHarness({cloudEmpty=false,restoreRepairPending=false,localState=null,user="synthetic-owner-a",checked=true}={}){
  const owner=user;
  const stamp="2026-11-01T12:00:00.000Z";
  const olderStamp="2026-10-31T12:00:00.000Z";
  const cloudState={
    player_id:owner,updated_at:stamp,player:{name:"Synthetic player"},
    ...syncShape()
  };
  cloudState.sync={...cloudState.sync,pending_cloud_save:false};
  const initialLocal=localState||clone(cloudState);
  const timers=new Map(),storage=new Map();
  const requests=[],retryRequests=[];
  const mergeInputs=[];
  let timerId=0;
  const consent={checked,addEventListener(type,handler){if(type==="change")this.handler=handler}};
  const responseJson={
    ok:true,state:cloudEmpty?null:clone(cloudState),
    updated_at:cloudEmpty?null:stamp,
    restore_repair_pending:restoreRepairPending,
    alliance_roster_repair:{status:"canonical_roster_applied",changed:false}
  };
  const context=vm.createContext({
    Date,JSON,URL,console,navigator:{onLine:true},
    BETA_CONSENT_KEY:"synthetic-beta-consent",
    BETA_CONSENT_VERSION:"synthetic-consent-v1",
    cloudSession:user?{user:{id:user},access_token:"synthetic-token"}:null,
    state:clone(initialLocal),cloudRevision:null,cloudProfileVerified:false,
    canonicalRosterReady:false,cloudHydrationPending:false,cloudDirty:false,
    cloudPullRetryTimer:null,cloudRetryTimer:null,pushTimer:null,
    localStateRevision:1,suppressPush:false,cloudRetryFailures:0,
    betaState:{allowed:true,access_status:"allowed"},STORE_KEY:"synthetic-state",
    localStorage:{
      getItem:key=>storage.has(key)?storage.get(key):null,
      setItem:(key,value)=>storage.set(key,String(value)),
      removeItem:key=>storage.delete(key)
    },
    $:selector=>selector==="#betaConsent"?consent:null,
    sessionApplyKey:session=>session?.user?.id&&session?.access_token
      ?`${session.user.id}:${session.access_token}`:"",
    betaAccessAllowed:()=>true,
    betaStateAfterVerifiedStateRead:current=>({...current,allowed:true,access_status:"allowed"}),
    hasMeaningfulCore:value=>Boolean(value?.player_id&&value?.player),
    safeClone:clone,readAccountState:()=>null,
    initialState:()=>({player:{},...syncShape()}),
    hydrateCloudState,
    reconcileCloudSquads:(_base,_remote,merged)=>reconcileCloudSquads(_base,_remote,merged),
    preservePendingRoster:(_local,merged)=>merged,
    adoptCanonicalPendingAccounts:merged=>merged,
    normalizeAlliancePendingState:input=>({state:input,changed:false}),
    pendingIdentityAliasesFor:()=>[],collectPendingIdentityAliases:()=>[],
    mergeDeviceCloudSaveMetadata,staleProfileRestore,
    repairLegacySquadIdentity,backfillConfirmedHeroPowers,
    recoverLocalHeroHistory:value=>({state:value}),playerHqNeedsCloudSync,
    applyCanonicalRosterKeys:value=>value,
    safeLocalSet:()=>true,rememberLastGoodState:()=>{},rememberAccountState:()=>{},
    refreshPlayerAdviceIfChanged:()=>{},appendServerRestoreTrace:()=>{},
    bootstrapNow:()=>Date.now(),pushBootstrapStage:()=>{},
    render:()=>{},renderAuth:()=>{},renderBeta:()=>{},renderPro:()=>{},
    resetBootstrapDiagnostics:()=>{},finishBootstrapDiagnostics:()=>{},
    restoreAttemptSucceeded:result=>Boolean(result?.ok),
    lastBootstrapFailure:()=>null,queueCriticalUiRepaint:()=>{},
    runBootstrapStage:async(_stage,callback)=>callback(),
    refreshBeta:async()=>({ok:true}),refreshPro:()=>{},
    authHeaders:()=>({authorization:"Bearer synthetic-token"}),
    fetchJsonBounded:async(url,options={})=>{
      requests.push({url,method:String(options?.method||"GET").toUpperCase()});
      return {response:{ok:true,status:200},json:clone(responseJson)};
    },
    // Count the consent handler's actual push request at the transport boundary.
    pushServerState:async()=>{
      requests.push({url:"/api/state",method:"POST"});
      return {ok:true};
    },
    clearTimeout:id=>timers.delete(id),
    setTimeout:(callback,delay)=>{
      const id=++timerId;timers.set(id,{callback,delay});return id;
    },
    currentAccountSyncView:()=>({saveKind:null}),
    transientCloudFailure:()=>false,
    scheduleCloudRetry:delay=>{retryRequests.push(delay)},
    cloudRetryTimer:null
  });
  Object.assign(context,mergeHarnessDependencies());
  vm.runInContext([
    actualMergeState,actualMergeStateProtected,
    actualBetaConsentStorageKey,actualBetaConsentAccepted,
    actualScheduleServerSave,actualScheduleCloudRetry,
    actualPullServerState,actualRestoreAuthenticatedProfile,consentBinding
  ].join("\n"),context);
  const hq=value=>value?.player?.hq_level;
  const wrapStateCall=(name,project)=>{
    const original=context[name];
    assert.equal(typeof original,"function",`VM must load real ${name}`);
    context[name]=(...args)=>{
      const entry={name,...project.before(args)};
      const result=original(...args);
      Object.assign(entry,project.after(args,result));
      mergeInputs.push(entry);
      return result;
    };
  };
  wrapStateCall("hydrateCloudState",{
    before:args=>({inputOwner:args[0]?.player_id,inputHq:args[0]?.player?.hq_level}),
    after:(_args,result)=>({outputOwner:result?.player_id,outputHq:hq(result)})
  });
  wrapStateCall("mergeState",{
    before:args=>({baseHq:hq(args[0]),remoteHq:hq(args[1])}),
    after:(_args,result)=>({outputHq:hq(result)})
  });
  wrapStateCall("mergeStateProtected",{
    before:args=>({preferLocal:args[2]?.preferBase===true,baseOwner:args[0]?.player_id,
      remoteOwner:args[1]?.player_id,baseHq:hq(args[0]),remoteHq:hq(args[1])}),
    after:(_args,result)=>({outputHq:hq(result)})
  });
  wrapStateCall("reconcileCloudSquads",{
    before:args=>({inputHq:hq(args[2])}),
    after:(_args,result)=>({outputHq:hq(result?.state)})
  });
  wrapStateCall("repairLegacySquadIdentity",{
    before:args=>({inputHq:hq(args[0])}),
    after:(_args,result)=>({outputHq:hq(result?.state)})
  });
  wrapStateCall("backfillConfirmedHeroPowers",{
    before:args=>({inputHq:hq(args[0])}),
    after:(_args,result)=>({outputHq:hq(result?.state)})
  });
  const realScheduleCloudRetry=context.scheduleCloudRetry;
  assert.equal(typeof realScheduleCloudRetry,"function","VM must load real scheduleCloudRetry");
  context.scheduleCloudRetry=delay=>{
    const before=timers.size;
    const result=realScheduleCloudRetry(delay);
    retryRequests.push({delay,cloudDirty:context.cloudDirty,owner:context.state?.player_id,
      timerAdded:timers.size>before,scheduledDelays:[...timers.values()].map(timer=>timer.delay)});
    return result;
  };
  const realPullServerState=context.pullServerState;
  context.pullServerState=async(...args)=>{
    const entry={loginSeedOwner:args[0]?.player_id,loginSeedHq:hq(args[0]),
      localOwner:context.state?.player_id,localHq:hq(context.state),
      localUpdatedAt:context.state?.updated_at,cloudUpdatedAt:responseJson.updated_at};
    const result=await realPullServerState(...args);
    entry.result=result;entry.finalHq=hq(context.state);mergeInputs.push({name:"pullServerState",...entry});
    return result;
  };

  return {
    context,consent,requests,retryRequests,responseJson,olderStamp,mergeInputs,timers,
    async change(value=checked){
      consent.checked=value;
      await consent.handler({target:consent});
      await Promise.resolve();
    },
    get getRequests(){return requests.filter(request=>request.method==="GET")},
    get postRequests(){return requests.filter(request=>request.method==="POST")},
    get meaningfulLocal(){return context.state?.player_id===owner&&Boolean(context.state?.player?.name)}
  };
}

test("consent grant with an existing unchanged cloud profile performs GET only",async()=>{
  const harness=makeConsentHarness();
  await harness.change(true);
  assert.equal(harness.getRequests.length,1);
  assert.equal(harness.postRequests.length,0,"consent is not itself a profile edit");
});

test("consent grant with restore_repair_pending and no local edit performs GET only",async()=>{
  const harness=makeConsentHarness({restoreRepairPending:true});
  await harness.change(true);
  assert.equal(harness.responseJson.restore_repair_pending,true);
  assert.equal(harness.getRequests.length,1);
  assert.equal(harness.postRequests.length,0,"pending server repair is not write intent");
});

test("consent grant still permits initial transfer when the authenticated cloud profile is empty",async()=>{
  const harness=makeConsentHarness({cloudEmpty:true});
  await harness.change(true);
  assert.equal(harness.getRequests.length,1);
  assert.equal(harness.postRequests.length,1);
  assert.equal(harness.postRequests[0].url,"/api/state");
});

test("a previously saved, newer local edit survives consent restoration",async()=>{
  const harness=makeConsentHarness({localState:{
    player_id:"synthetic-owner-a",
    updated_at:"2026-11-02T12:00:00.000Z",
    player:{name:"Synthetic player",hq_level:99},
    squads:[],alliance:{members:[],unlinked_accounts:[]},
    technology:{branches:{}},sync:{pending_cloud_save:true}
  }});
  await harness.change(true);
  assert.equal(harness.meaningfulLocal,true);
  assert.equal(harness.context.state.player.hq_level,99,JSON.stringify({
    state:harness.context.state,
    requests:harness.requests,
    retries:harness.retryRequests,
    merges:harness.mergeInputs
  }));
  assert.equal(harness.context.state.sync.pending_cloud_save,true);
  assert.equal(harness.mergeInputs.find(row=>row.name==="mergeStateProtected")?.preferLocal,true,
    JSON.stringify(harness.mergeInputs));
  assert.equal(harness.mergeInputs.find(row=>row.name==="mergeStateProtected")?.baseHq,99,
    JSON.stringify(harness.mergeInputs));
  assert.equal(harness.mergeInputs.find(row=>row.name==="mergeStateProtected")?.remoteHq,undefined,
    JSON.stringify(harness.mergeInputs));
  assert.ok(harness.retryRequests.some(row=>row.delay===750&&row.cloudDirty&&row.timerAdded),
    JSON.stringify({retries:harness.retryRequests,timers:[...harness.timers.values()]}));
  assert.equal(harness.postRequests.length,0,"retry is only queued; the fake timer is not run and no real network is used");
});

test("missing session or unchecked consent cannot issue a POST",async()=>{
  const signedOut=makeConsentHarness({user:null});
  await signedOut.change(true);
  assert.equal(signedOut.getRequests.length,0);
  assert.equal(signedOut.postRequests.length,0);

  const declined=makeConsentHarness({checked:false});
  await declined.change(false);
  assert.equal(declined.getRequests.length,0);
  assert.equal(declined.postRequests.length,0);
});
