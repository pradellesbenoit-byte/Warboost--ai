import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {accountSyncErrorKind,createCloudOperations,confirmedWriteReceipt,transientCloudFailure,verifiedAccountWriteReply} from "../lib/account-sync-feedback.js";
import {createSaveDiagnostic,newSaveCorrelation,publicSaveError,safeSaveDiagnostic} from "../lib/cloud-save-diagnostic.js";
import {rosterSyncCopy} from "../lib/roster-sync-copy.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";
import {translator} from "../i18n.js";

const app=fs.readFileSync("app.js","utf8");
let checks=0,requests=0;
const stamp="2026-10-30T12:30:00.000Z";
const tests=[];
const test=(name,run)=>tests.push([name,run]);
function fn(name){
  const start=app.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,`missing function ${name}`);
  const end=app.indexOf("\n}",start);
  assert.ok(end>start,`missing function end ${name}`);
  return app.slice(start,end+2);
}
const syncButtonBinding=app.split(/\r?\n/).find(line=>line.trim()==='$("#syncPlayerBtn").addEventListener("click",syncAll);');
assert.ok(syncButtonBinding,"the real player button must be bound to syncAll");

function makeButton(){
  return {disabled:false,textContent:"Synchroniser",listeners:{},addEventListener(type,handler){this.listeners[type]=handler},
    click(){return this.listeners.click?.({currentTarget:this})}};
}
function makeNote(){
  const classes=new Set(["notice","hidden"]);
  return {className:"notice hidden",textContent:"",attributes:{},
    classList:{remove(value){classes.delete(value)},add(value){classes.add(value)},contains(value){return classes.has(value)}},
    setAttribute(name,value){this.attributes[name]=value}};
}
function harness({user="owner",stateOwner=user,token="fixture-token",consent=true,online=true,roster="clean",fetchReply=null,fetchImpl=null,
  requireAccess=true,changeAccountDuringFetch=false,reconcileResult=null}={}){
  const note=makeNote(),playerButton=makeButton(),allButton=makeButton(),drawers=[];
  const nodes={"#playerSyncInfo":note,"#syncPlayerBtn":playerButton,"#syncAllBtn":allButton};
  const original={player_id:stateOwner,player:{name:"Private player"},squads:[{id:1,power:45.6,heroes:[{name:"Carlie",confirmed:true}]}],
    technology:{branches:{heroes:0}},alliance:{roster_sync_status:roster,members:[]},sync:{pending_cloud_save:true,sources:{}}};
  let currentState=JSON.parse(JSON.stringify(original)),saveCalls=0,rosterCalls=0,finishCalls=0,networkCalls=0,revision=1;
  const session=user?{user:{id:user},access_token:token}:null;
  const ctx=vm.createContext({
    Date,Intl,URL,console,clearTimeout,
    navigator:{onLine:online},
    cloudSession:session,state:currentState,cloudRevision:stamp,cloudProfileVerified:false,cloudDirty:false,
    localStateRevision:revision,syncActionBusy:false,playerSyncActionFeedback:null,rosterImportInFlight:false,
    cloudRetryTimer:null,pushTimer:null,
    accountSyncOperations:createCloudOperations(),accountSaveBusy:false,cloudRetryFailures:0,
    createSaveDiagnostic,newSaveCorrelation,publicSaveError,safeSaveDiagnostic,confirmedWriteReceipt,
    transientCloudFailure,accountSyncErrorKind,verifiedAccountWriteReply,
    sessionApplyKey:value=>value?.user?.id&&value?.access_token?`${value.user.id}:${value.access_token}`:"",
    betaAccessAllowed:()=>requireAccess,betaConsentAccepted:()=>consent,
    requireBetaAccess:()=>requireAccess,requireBetaConsent:()=>consent,
    hasMeaningfulCore:()=>true,
    analysisIndicator:{begin(){return ()=>{finishCalls++}}},
    authHeaders:()=>({authorization:"Bearer fixture-token"}),
    t:translator("fr"),lang:"fr",
    $:selector=>nodes[selector]||null,
    openDrawer:name=>drawers.push(name),
    fetchJsonBounded:async(...args)=>{
      networkCalls++;requests++;
      if(fetchImpl)return fetchImpl(...args,ctx);
      return fetchReply;
    },
    initialState:()=>({}),
    hydrateCloudState:value=>JSON.parse(JSON.stringify(value)),
    mergeStateProtected:(base,remote,{preferBase}={})=>JSON.parse(JSON.stringify(preferBase?base:remote)),
    reconcileCloudSquads:(_base,_remote,merged)=>reconcileResult?{state:merged,...reconcileResult}:{state:merged,localNewer:[],conflicts:[]},
    repairLegacySquadIdentity:value=>({state:value}),
    adoptCanonicalPendingAccounts:value=>value,
    reconcileAuthenticatedRuntime:async()=>({ok:true}),
    persistRosterCandidate:async candidate=>{
      rosterCalls++;assert.equal(candidate.player_id,stateOwner);
      return {operation:"alliance_roster",player_id:stateOwner,updated_at:stamp};
    },
    adoptRosterOnlyReply:(value)=>({...value,alliance:{...value.alliance,roster_sync_status:"synced"}}),
    rosterSyncCopy,
    saveState:options=>{
      assert.equal(options?.cloudSave,false,"sync feedback must not trigger an unrequested retry");
      saveCalls++;revision++;ctx.localStateRevision=revision;
      return true;
    },
    render(){},renderProvider(){},
    recordRosterDiagnostic:value=>value,
    safeRosterDiagnostic:value=>value,
    rosterFailureKind:()=> "role",
    renderRosterSyncDiagnostic(){},
    cloudRevision:stamp,cloudProfileVerified:false
  });
  if(changeAccountDuringFetch)ctx.fetchJsonBounded=async()=>{networkCalls++;requests++;ctx.cloudSession={user:{id:"other"},access_token:"other-token"};return fetchReply};
  vm.runInContext([fn("recordAccountSyncResult"),fn("renderPlayerSyncFeedback"),fn("showPlayerSyncFeedback"),fn("syncAll"),syncButtonBinding].join("\n"),ctx);
  return {ctx,note,playerButton,allButton,drawers,original,get state(){return ctx.state},get saveCalls(){return saveCalls},
    get rosterCalls(){return rosterCalls},get finishCalls(){return finishCalls},get networkCalls(){return networkCalls}};
}
const successfulReply=()=>({response:{ok:true,status:200},json:{ok:true,write_confirmed:true,provider:"warboost",provider_kind:"cloud",
  state:{player_id:"owner",player:{name:"Private player"},squads:[{id:1,power:45.6,heroes:[{name:"Carlie",confirmed:true}]}],
    alliance:{roster_sync_status:"clean",members:[]},sync:{pending_cloud_save:false,sources:{player:true}}},
  updated_at:stamp,synced_at:stamp,sources:{player:true}}});

test("mobile player button is wired to the actual handler and announces progress accessibly",async()=>{
  let settle;
  const h=harness({fetchImpl:()=>new Promise(resolve=>{settle=resolve})});
  const pending=h.playerButton.click();
  assert.match(h.note.textContent,/Vérification de la synchronisation/);
  assert.equal(h.note.attributes["aria-live"],"polite");assert.equal(h.note.attributes.role,"status");
  assert.equal(h.playerButton.disabled,true);
  settle(successfulReply());await pending;
  assert.equal(h.playerButton.disabled,false);assert.equal(h.allButton.disabled,false);
  assert.equal(h.finishCalls,1);assert.match(h.note.textContent,/Écriture cloud confirmée/);
});

test("signed-out and mismatched-owner clicks never send data",async()=>{
  const signedOut=harness({user:null});
  await signedOut.playerButton.click();
  assert.equal(signedOut.networkCalls,0);assert.ok(signedOut.drawers.includes("account"));
  assert.match(signedOut.note.textContent,/refusée ou a expiré/);
  const mismatch=harness({user:"owner",stateOwner:"another-account"});
  const before=JSON.stringify(mismatch.state);
  await mismatch.playerButton.click();
  assert.equal(mismatch.networkCalls,0);assert.equal(JSON.stringify(mismatch.state),before);
  assert.match(mismatch.note.textContent,/Le compte a changé/);
});

test("missing consent and offline state show a visible result without a request",async()=>{
  const consent=harness({consent:false});
  await consent.playerButton.click();
  assert.equal(consent.networkCalls,0);assert.match(consent.note.textContent,/Accès cloud refusé|consentement/i);
  const offline=harness({online:false});
  await offline.playerButton.click();
  assert.equal(offline.networkCalls,0);assert.match(offline.note.textContent,/Connexion interrompue/);
});

test("409 conflict keeps confirmed local squad data and does not auto-retry",async()=>{
  const h=harness({fetchReply:{response:{ok:false,status:409},json:{error:"profile_write_conflict",state:{player_id:"owner",squads:[{id:1,power:99}]}}}});
  const before=JSON.stringify(h.state.squads);
  await h.playerButton.click();
  assert.equal(h.networkCalls,1);assert.equal(JSON.stringify(h.state.squads),before);
  assert.equal(h.saveCalls,1);assert.equal(h.ctx.state.sync.pending_cloud_save,true);
  assert.match(h.note.textContent,/Conflit de versions/);
  assert.equal(h.ctx.accountSyncOperations.snapshot("owner:fixture-token").save.kind,"conflict");
  assert.equal(h.ctx.state.sync.last_error,"profile_write_conflict");
  assert.equal(h.ctx.state.sync.last_confirmed_write_receipt,undefined);
  assert.doesNotMatch(h.note.textContent,/confirmée pour cette session|Écriture cloud confirmée/i);
});

test("timeout and expired authentication are distinguished and controls are released",async()=>{
  const timed=harness({fetchImpl:async()=>{throw Object.assign(Error("private response"),{name:"TimeoutError",code:"request_timeout"})}});
  await timed.playerButton.click();
  assert.match(timed.note.textContent,/Délai dépassé/);assert.equal(timed.playerButton.disabled,false);
  const expired=harness({fetchReply:{response:{ok:false,status:401},json:{error:"AUTH_EXPIRED",message:"private"}}});
  await expired.playerButton.click();
  assert.match(expired.note.textContent,/refusée ou a expiré/);assert.ok(expired.drawers.includes("account"));
});

test("bare 200 leaves remote state unapplied and clearly awaits a real write receipt",async()=>{
  const h=harness({fetchReply:{response:{ok:true,status:200},json:{ok:true,write_confirmed:false,
    state:{player_id:"owner",squads:[{id:1,power:99}]},updated_at:stamp}}});
  const before=JSON.stringify(h.state.squads);
  await h.playerButton.click();
  assert.equal(JSON.stringify(h.state.squads),before);
  assert.equal(h.ctx.accountSyncOperations.snapshot("owner:fixture-token").save.kind,"unconfirmed");
  assert.match(h.note.textContent,/n’est pas confirmée|n'est pas confirmée/);
  assert.match(h.note.textContent,/Vérifier le cloud|Contrôle cloud|Vérifie l’état du cloud/);
  assert.doesNotMatch(h.note.textContent,/Écriture cloud confirmée/);
});

test("only matching server write receipt confirms the same account; session switch reply is ignored",async()=>{
  const h=harness({fetchReply:successfulReply()});
  const originalSquad=JSON.stringify(h.state.squads);
  await h.playerButton.click();
  assert.equal(h.ctx.accountSyncOperations.snapshot("owner:fixture-token").save.kind,"verified");
  assert.equal(h.ctx.state.sync.last_confirmed_write_at,stamp);
  assert.equal(JSON.stringify(h.state.squads),originalSquad);
  assert.match(h.note.textContent,/Écriture cloud confirmée/);
  const switched=harness({changeAccountDuringFetch:true,fetchReply:successfulReply()});
  const before=JSON.stringify(switched.state.squads);
  await switched.playerButton.click();
  assert.equal(JSON.stringify(switched.state.squads),before);
  assert.equal(switched.saveCalls,0);assert.match(switched.note.textContent,/Le compte a changé/);
});

test("verified write with a newer local edit reports partial sync without contradictory copy",async()=>{
  const h=harness({fetchImpl:async(_url,_options,_timeout,ctx)=>{
    ctx.state={...ctx.state,technology:{branches:{heroes:42}}};
    ctx.localStateRevision++;
    return successfulReply();
  }});
  await h.playerButton.click();
  assert.equal(h.ctx.accountSyncOperations.snapshot("owner:fixture-token").save.kind,"verified");
  assert.equal(h.ctx.state.sync.pending_cloud_save,true);
  assert.equal(h.state.technology.branches.heroes,42,"newer local technology value is preserved");
  assert.match(h.note.textContent,/Écriture cloud confirmée pour ce compte/);
  assert.match(h.note.textContent,/modifications sont en attente de synchronisation/);
  assert.doesNotMatch(h.note.textContent,/écriture cloud du profil n’est pas confirmée/i);
  assert.doesNotMatch(h.note.textContent,/Vérifier le cloud, sans enregistrer/);
  assert.doesNotMatch(h.note.textContent,/Synchronisation vérifiée pour cette session/);
});

test("verified write with a squad reconciliation conflict names the conflict and preserves the receipt",async()=>{
  const h=harness({fetchReply:successfulReply(),reconcileResult:{localNewer:[],conflicts:[1]}});
  await h.playerButton.click();
  assert.equal(h.ctx.accountSyncOperations.snapshot("owner:fixture-token").save.kind,"verified");
  assert.equal(h.ctx.state.sync.pending_cloud_save,true);
  assert.match(h.note.textContent,/Écriture cloud confirmée pour ce compte/);
  assert.match(h.note.textContent,/modifications sont en attente de synchronisation/);
  assert.match(h.note.textContent,/Conflit local\/cloud enregistré — non revalidé/);
  assert.doesNotMatch(h.note.textContent,/écriture cloud du profil n’est pas confirmée/i);
});

test("roster acknowledgement is never presented as a personal profile save",async()=>{
  const h=harness({roster:"pending"});
  const before=JSON.stringify(h.state.squads);
  await h.playerButton.click();
  assert.equal(h.rosterCalls,1);assert.equal(h.networkCalls,0);
  assert.equal(JSON.stringify(h.state.squads),before);
  assert.equal(h.ctx.accountSyncOperations.snapshot("owner:fixture-token").save,undefined);
  assert.match(h.note.textContent,/Roster confirmé/);
  assert.match(h.note.textContent,/n’a pas confirmé la sauvegarde du profil personnel/);
});

test("busy click is reported and concurrent requests remain serialized",async()=>{
  let settle;
  const h=harness({fetchImpl:()=>new Promise(resolve=>{settle=resolve})});
  const first=h.playerButton.click();
  await h.playerButton.click();
  assert.equal(h.networkCalls,1);assert.match(h.note.textContent,/déjà en cours/);
  settle(successfulReply());await first;
  assert.equal(h.playerButton.disabled,false);
});

test("all new sync-action messages are localized in every supported locale",()=>{
  const keys=["action_checking","action_busy","owner_mismatch","action_profile_pending",
    "action_roster_confirmed_profile_pending","action_roster_pending_profile_pending","action_write_confirmed",
    "retry","auth","forbidden","network","timeout","conflict","server","unconfirmed"];
  assert.equal(Object.keys(ACCOUNT_SYNC_COPY).length,23);
  for(const [locale,copy] of Object.entries(ACCOUNT_SYNC_COPY))for(const key of keys){
    const name=`account_sync_${key}`;
    assert.ok(copy[name]?.trim(),`${locale}:${name}`);
    assert.equal(translator(locale)(name),copy[name],`${locale}:${name}`);
  }
});

test("sync write diagnostic uses an explicit endpoint allowlist",()=>{
  const diagnostic=createSaveDiagnostic({endpoint:"/api/sync",stage:"response",status:200,code:"save_confirmed",writeState:"confirmed"});
  assert.equal(diagnostic.endpoint,"/api/sync");
  assert.equal(safeSaveDiagnostic({...diagnostic,endpoint:"/api/scan"}),null);
});

for(const [name,run] of tests){
  await run();
  checks++;
  console.log("PASS "+name);
}
console.log(`PASS account sync button: ${checks} scenarios, ${requests} synthetic requests; no remote service or account data`);
