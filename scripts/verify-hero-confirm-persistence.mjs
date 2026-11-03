import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  mergeSquadIdentityHistory,
  otherSquadsWithCompositionHeroes,
  reconcileConfirmedSquad,
  repairLegacySquadIdentity
} from "../lib/squad-identity.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";
import {canonicalHeroName} from "../lib/heroes.js";
import {technologyAdvisorCopy} from "../lib/technology-advisor-copy.js";

const owner="synthetic-owner";
const names=["Carlie","Lucius","Morrison","DVA","Skyler"];
const t1="2026-11-03T07:00:00.000Z";
const t2="2026-11-03T08:00:00.000Z";
const t3="2026-11-03T09:00:00.000Z";
const oldHistory={event:"old-cloud-identity",squad_id:1};
const localHistory={event:"local-identity",squad_id:1};
let assertions=0;

function check(actual,expected,message){
  assert.deepEqual(actual,expected,message);
  assertions++;
}
function truthy(value,message){
  assert.ok(value,message);
  assertions++;
}
function clone(value){return JSON.parse(JSON.stringify(value))}

function blankSquad(id){
  return {
    id,name:`Squad ${id}`,power:null,updated_at:null,needs_rescan:false,
    composition_source:null,composition_confirmed_at:null,confirmed_composition:["","","","",""],
    heroes:Array.from({length:5},()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null})),
    composition_conflict:null
  };
}
function stateWithSquadOne({
  updatedAt=t1,markerAt=t1,composition=names,confirmedAt=t1,power=45.6
}={}){
  const heroes=composition.map(name=>({
    name,level:155,stars:5,gear:{level:40,source:`fixture-${name}`},
    exclusive:name==="DVA"?{level:29,weapon:"Lame de Frappe"}:null
  }));
  return {
    player_id:owner,
    player:{power_m:null},
    technology:{branches:{"Spécialisation Avion":0}},
    squads:[
      {
        ...blankSquad(1),power,updated_at:updatedAt,needs_rescan:true,
        composition_source:confirmedAt?"explicit_confirmation":null,
        composition_confirmed_at:confirmedAt,
        confirmed_composition:confirmedAt?[...composition]:["","","","",""],
        heroes,
        composition_conflict:{
          status:"needs_verification",reason:"squad_freshness_ambiguous",
          detected_at:markerAt,identity_history:[clone(oldHistory)]
        }
      },
      ...[2,3,4].map(blankSquad)
    ]
  };
}

// Old local/Cloud state, then the same explicit five-name confirmation the UI
// delegates to this real domain function. This intentionally is not a DOM test.
const before=stateWithSquadOne();
const confirmed=reconcileConfirmedSquad(before,{
  squadId:1,names,updatedAt:t2
}).state;
check(confirmed.squads[0].composition_source,"explicit_confirmation","confirmation uses the production proof marker");
check(confirmed.squads[0].composition_conflict?.reason,undefined,"confirmation clears the active old marker");
check(confirmed.squads[0].needs_rescan,false,"confirmation clears the old rescan flag");
check(confirmed.squads[0].composition_confirmed_at,t2,"confirmation timestamp is recorded");

// Model local persistence and drawer close/reopen with the actual JSON boundary.
const reopened=JSON.parse(JSON.stringify(confirmed));
check(reopened.player_id,owner,"the saved state remains scoped to the same synthetic owner");
const repaired=repairLegacySquadIdentity(reopened,{now:t2}).state;
check(repaired.squads[0].composition_conflict?.reason,undefined,"legacy repair does not restore the old marker");

// Pull/reconciliation with the old same-owner Cloud copy, using production code.
const oldCloud=clone(before);
oldCloud.squads[0].composition_conflict.identity_history.push(clone({event:"cloud-history",squad_id:1}));
const reconciled=reconcileCloudSquads(repaired,oldCloud,clone(repaired));
const savedSquad=reconciled.state.squads[0];
check(savedSquad.composition_conflict?.reason,undefined,"old Cloud freshness marker stays inactive after reopen");
check(savedSquad.needs_rescan,false,"old Cloud rescan flag does not undo the confirmation");
check(reconciled.conflicts,[],"old Cloud state does not create a new active conflict");
check(savedSquad.confirmed_composition,names,"all five confirmed hero names survive");
check(savedSquad.power,45.6,"squad power remains 45.6M");
check(savedSquad.heroes[3].exclusive,{level:29,weapon:"Lame de Frappe"},"DVA exclusive weapon data remains intact");
check(savedSquad.technology?.branches,undefined,"squad reconciliation does not manufacture technology fields");
check(reconciled.state.technology.branches["Spécialisation Avion"],0,"the confirmed technology zero is preserved");
truthy(savedSquad.composition_conflict.identity_history.some(x=>x.event==="old-cloud-identity"),
  "pre-existing identity history remains available");
truthy(savedSquad.composition_conflict.identity_history.some(x=>x.event==="cloud-history"),
  "identity history from the older Cloud copy is retained");

// The merge helper is also order-independent for this stale marker.
const staleForward=mergeSquadIdentityHistory(repaired.squads[0],oldCloud.squads[0]);
const staleReverse=mergeSquadIdentityHistory(oldCloud.squads[0],repaired.squads[0]);
check(staleForward.reason,undefined,"old marker is filtered when the confirmed squad is first");
check(staleReverse.reason,undefined,"old marker is filtered when the Cloud squad is first");

// A marker with later evidence must remain active; it is not safe to auto-clear.
const newerCloud=clone(oldCloud);
newerCloud.squads[0].updated_at=t3;
newerCloud.squads[0].composition_conflict.detected_at=t3;
const newerConflict=mergeSquadIdentityHistory(repaired.squads[0],newerCloud.squads[0]);
check(newerConflict.reason,"squad_freshness_ambiguous","a genuinely newer Cloud marker is preserved");
const newerReconciliation=reconcileCloudSquads(repaired,newerCloud,clone(repaired));
check(newerReconciliation.state.squads[0].composition_conflict.reason,"squad_freshness_ambiguous",
  "Cloud reconciliation does not erase a newer marker");

// A later, explicitly different Cloud composition also remains unresolved.
const different=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
const divergentCloud=stateWithSquadOne({updatedAt:t3,markerAt:t3,composition:different,confirmedAt:t3});
const divergent=reconcileCloudSquads(repaired,divergentCloud,clone(repaired));
check(divergent.state.squads[0].confirmed_composition,different,
  "a newer different Cloud composition is not silently overwritten");
check(divergent.state.squads[0].composition_conflict.reason,"squad_freshness_ambiguous",
  "a newer divergent Cloud conflict remains visible");
truthy(divergent.state.squads[0].needs_rescan,"a newer divergent composition remains pending review");

console.log(`PASS: hero confirmation persistence and Cloud reconciliation (${assertions} assertions; synthetic only)`);

const appSource=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
function extractFunction(name){
  const start=appSource.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0,`missing real app.js handler ${name}`);
  const end=appSource.indexOf("\n}",start);
  assert.ok(end>start,`missing end of real app.js handler ${name}`);
  return appSource.slice(start,end+2);
}
const realSaveHandler=extractFunction("saveInlineHeroNames");
assert.match(realSaveHandler,/reconcileConfirmedSquad\(state,/,"the extracted app handler must call the real squad confirmer");
const realSyncFeedback=[extractFunction("renderPlayerSyncFeedback"),extractFunction("showPlayerSyncFeedback")];

const fixedTime=t2;
class FixedDate extends Date {
  constructor(...args){super(...(args.length?args:[fixedTime]))}
  static now(){return Date.parse(fixedTime)}
}
function statusNode(){return {className:"notice warn",textContent:""}}
function makeUiHarness({initial=before,sessionOwner=owner,saveResult=true,oldFeedback=null}={}){
  const selects=names.map(value=>({value}));
  const status=statusNode();
  const playerNote={className:"notice warn",textContent:"old sync feedback",attributes:{},
    classList:{remove(name){if(name==="hidden")playerNote.className=playerNote.className.replace(/\s*hidden\b/,"")}},
    setAttribute(name,value){this.attributes[name]=value}};
  const container={dataset:{},querySelectorAll:()=>selects,querySelector:()=>status};
  const button={disabled:false,textContent:"Enregistrer"};
  const savedByOwner=new Map(),accountSnapshots=new Map();
  let saveCalls=0,renderCalls=0,ctx;
  const session=sessionOwner?{user:{id:sessionOwner},access_token:"synthetic-token"}:null;
  const saveState=options=>{
    saveCalls++;
    assert.equal(options?.renderUi,false,"the real handler must request local save without a full rerender");
    const signedIn=String(ctx.cloudSession?.user?.id||"");
    const stateOwner=String(ctx.state?.player_id||"");
    if(signedIn&&stateOwner&&stateOwner!==signedIn){
      accountSnapshots.set(stateOwner,clone(ctx.state));
      ctx.state={player_id:signedIn,squads:[blankSquad(1),blankSquad(2),blankSquad(3),blankSquad(4)],
        sync:{status:"waiting",last_error:"account_owner_mismatch",pending_cloud_save:false}};
      return false;
    }
    if(!saveResult){
      ctx.state={...ctx.state,sync:{...(ctx.state.sync||{}),status:"waiting",pending_cloud_save:true}};
      return false;
    }
    const repaired=repairLegacySquadIdentity(ctx.state,{now:fixedTime}).state;
    const saved=JSON.parse(JSON.stringify({...repaired,updated_at:fixedTime,version:"synthetic-test"}));
    savedByOwner.set(stateOwner,saved);
    ctx.state=saved;
    return true;
  };
  ctx=vm.createContext({
    Date:FixedDate,state:clone(initial),cloudSession:session,
    betaAccessAllowed:()=>true,betaConsentAccepted:()=>true,
    otherSquadsWithCompositionHeroes,reconcileConfirmedSquad,
    canonicalStoredHeroName:canonicalHeroName,technologyAdvisorCopy,lang:"fr",
    t:key=>key,
    $:selector=>selector==="#playerSyncInfo"?playerNote:null,
    technologyAdvisorUI:{render(){renderCalls++}},APP_VERSION:"synthetic-test",
    playerSyncActionFeedback:oldFeedback,
    saveState
  });
  vm.runInContext([...realSyncFeedback,realSaveHandler].join("\n"),ctx);
  return {ctx,container,button,status,playerNote,savedByOwner,accountSnapshots,
    get saveCalls(){return saveCalls},get renderCalls(){return renderCalls},
    confirm(){return ctx.saveInlineHeroNames(1,container,button)}};
}

let uiPass=0,uiFail=0;
async function uiCase(name,run){
  try{
    await run();
    uiPass++;
    console.log(`PASS UI handler: ${name}`);
  }catch(error){
    uiFail++;
    console.error(`FAIL UI handler: ${name}\n${error?.stack||error}`);
  }
}

await uiCase("real app.js handler confirms and locally persists the five heroes",async()=>{
  const h=makeUiHarness();
  await h.confirm();
  const saved=h.savedByOwner.get(owner);
  assert.ok(saved,"local saveState simulation should persist a JSON copy");
  assert.equal(saved.squads[0].composition_source,"explicit_confirmation");
  assert.equal(saved.squads[0].composition_confirmed_at,fixedTime);
  assert.equal(saved.squads[0].composition_conflict?.reason,undefined);
  assert.equal(saved.squads[0].needs_rescan,false);
  assert.deepEqual(saved.squads[0].confirmed_composition,names);
  assert.deepEqual(saved.squads[0].heroes.map(hero=>hero.name),names);
  assert.equal(saved.squads[0].power,45.6);
  assert.deepEqual(saved.squads[0].heroes[3].exclusive,{level:29,weapon:"Lame de Frappe"});
  assert.equal(saved.technology.branches["Spécialisation Avion"],0);
  assert.equal(saved.sync.pending_cloud_save,true);
  assert.match(h.status.textContent,/hero_confirm_saved.*sync_needed/);
  assert.doesNotMatch(h.status.textContent,/cloud.*confirm|écriture.*confirm/i,
    "local confirmation must not claim a Cloud receipt");
  assert.deepEqual(Array.from(h.ctx.playerSyncActionFeedback.keys),["hero_confirm_saved","account_sync_pending"]);
  assert.equal(h.ctx.playerSyncActionFeedback.warn,true,"pending Cloud state is shown as pending, not success");
  assert.match(h.playerNote.textContent,/hero_confirm_saved account_sync_pending/);
  assert.doesNotMatch(h.playerNote.textContent,/action_conflict|écriture.*confirmée/i);
  assert.equal(h.saveCalls,1);
  assert.equal(h.renderCalls,1);

  // Reopening reads the serialized local copy, then reconciles an older Cloud
  // copy using the real production freshness/identity modules.
  const reopened=JSON.parse(JSON.stringify(saved));
  const restored=reconcileCloudSquads(reopened,clone(before),clone(reopened));
  assert.equal(restored.state.squads[0].composition_conflict?.reason,undefined);
  assert.equal(restored.state.squads[0].needs_rescan,false);
  assert.deepEqual(restored.state.squads[0].confirmed_composition,names);
  assert.equal(restored.state.squads[0].power,45.6);

  const localOnly=makeUiHarness({sessionOwner:null});
  await localOnly.confirm();
  assert.deepEqual(Array.from(localOnly.ctx.playerSyncActionFeedback.keys),["hero_confirm_saved","local"]);
  assert.equal(localOnly.ctx.playerSyncActionFeedback.warn,false);
  assert.doesNotMatch(localOnly.playerNote.textContent,/cloud.*confirm|écriture.*confirmée/i);
});

await uiCase("local save failure never announces that hero names were saved",async()=>{
  const h=makeUiHarness({saveResult:false});
  await h.confirm();
  assert.equal(h.savedByOwner.size,0,"failed local persistence must not create a saved record");
  assert.match(h.status.textContent,/hero_save_failed/);
  assert.doesNotMatch(h.status.textContent,/hero_confirm_saved|sync_needed/);
  assert.equal(h.saveCalls,1);
});

await uiCase("a different signed-in owner cannot persist or receive the other account's squad",async()=>{
  const h=makeUiHarness({sessionOwner:"account-B"});
  await h.confirm();
  assert.equal(h.savedByOwner.size,0,"owner mismatch must not write the source squad under either owner");
  assert.equal(h.accountSnapshots.get(owner)?.player_id,owner,
    "the existing local account-A snapshot remains partitioned under account A");
  assert.deepEqual(h.accountSnapshots.get(owner)?.squads[0].confirmed_composition,names,
    "the explicit local confirmation remains in account A's own local snapshot");
  assert.equal(h.ctx.state.player_id,"account-B");
  assert.equal(h.ctx.state.squads[0].heroes.some(hero=>hero.name==="Carlie"),false,
    "account B must not receive account A's hero data");
  assert.match(h.status.textContent,/hero_save_failed/);
  assert.doesNotMatch(h.status.textContent,/hero_confirm_saved|cloud.*confirm/i);
});

await uiCase("a genuinely newer Cloud marker remains unresolved after local confirmation",async()=>{
  const h=makeUiHarness();
  await h.confirm();
  const saved=h.savedByOwner.get(owner);
  const newer=clone(before);
  newer.squads[0].updated_at=t3;
  newer.squads[0].composition_conflict.detected_at=t3;
  const mergedConflict=mergeSquadIdentityHistory(saved.squads[0],newer.squads[0]);
  assert.equal(mergedConflict.reason,"squad_freshness_ambiguous");
  const reconciled=reconcileCloudSquads(saved,newer,clone(saved));
  assert.equal(reconciled.state.squads[0].composition_conflict.reason,"squad_freshness_ambiguous");
});

await uiCase("old sync feedback is replaced by the new local-pending status",async()=>{
  const h=makeUiHarness({oldFeedback:{keys:["action_conflict"],warn:true,owner}});
  await h.confirm();
  assert.deepEqual(Array.from(h.ctx.playerSyncActionFeedback.keys),["hero_confirm_saved","account_sync_pending"]);
  assert.equal(h.ctx.playerSyncActionFeedback.owner,owner);
  assert.equal(h.ctx.playerSyncActionFeedback.warn,true);
  assert.match(h.playerNote.textContent,/hero_confirm_saved account_sync_pending/);
  assert.doesNotMatch(h.playerNote.textContent,/action_conflict|profile_pending|écriture.*confirmée/i);
});

console.log(`UI handler scenarios: ${uiPass} PASS / ${uiFail} FAIL; real saveInlineHeroNames extracted from app.js`);
if(uiFail)process.exitCode=1;
