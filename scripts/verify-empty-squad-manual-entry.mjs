import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import {HERO_CATALOG,canonicalHeroName,heroDisplayName,isGenericHeroName} from "../lib/heroes.js";
import {manualScanDestination} from "../lib/free-scan-copy.js";
import {scanSquadId} from "../lib/player-scan-types.js";
import {
  backfillConfirmedHeroPowers,
  confirmedCompositionForSquad,
  fixedHeroSlots,
  normalizeSquadSlots,
  otherSquadsWithCompositionHeroes,
  reconcileConfirmedSquad,
  repairLegacySquadIdentity,
  savedSquadCompositionCandidate
} from "../lib/squad-identity.js";
import {hasMeaningfulCoreState} from "../lib/cloud-state-recovery.js";
import {squadReviewHeader,squadReviewRowHtml,squadReviewStatus} from "../lib/squad-review-status.js";
import {technologyAdvisorCopy} from "../lib/technology-advisor-copy.js";

const root=new URL("../",import.meta.url);
const app=fs.readFileSync(new URL("app.js",root),"utf8");
const names=["Carlie","Lucius","Morrison","DVA","Skyler"];

function extractFunction(name){
  const starts=[app.indexOf(`function ${name}(`),app.indexOf(`async function ${name}(`)].filter(index=>index>=0);
  assert.equal(starts.length>0,true,`Missing real app.js function: ${name}`);
  const start=Math.min(...starts),lineEnd=app.indexOf("\n",start);
  const firstLine=app.slice(start,lineEnd);
  if(firstLine.trimEnd().endsWith("}"))return firstLine;
  const end=app.indexOf("\n}",start);
  assert.notEqual(end,-1,`Could not isolate real app.js function: ${name}`);
  return app.slice(start,end+2);
}

const source=[
  extractFunction("emptyHero"),
  extractFunction("heroConfirmOptions"),
  extractFunction("inlineHeroConfirmationHtml"),
  extractFunction("squadHasSavedData"),
  extractFunction("manualSquadCreationEligible"),
  extractFunction("openManualSquadEntry"),
  extractFunction("openFreeManualScanDestination"),
  extractFunction("renderSquads"),
  extractFunction("saveInlineHeroNames"),
  extractFunction("saveState"),
  extractFunction("scheduleServerSave")
].join("\n");

class FakeElement{
  constructor(){
    this.dataset={};this.listeners=new Map();this.children=[];this.className="";
    this.textContent="";this.disabled=false;this.value="";
    const classes=new Set();
    this.classList={
      add:(...values)=>values.forEach(value=>classes.add(value)),
      remove:(...values)=>values.forEach(value=>classes.delete(value)),
      contains:value=>classes.has(value)
    };
  }
  addEventListener(type,handler){this.listeners.set(type,handler)}
  dispatch(type,event={}){this.listeners.get(type)?.({preventDefault(){},stopPropagation(){},...event})}
  querySelector(){return null}
  querySelectorAll(){return []}
  insertAdjacentHTML(){}
  prepend(){}
  scrollIntoView(){}
  focus(){}
}

class FakeShell extends FakeElement{
  constructor(){
    super();this._html="";this.details=new FakeElement();this.body=new FakeElement();
    this.small=new FakeElement();this.editor=new FakeElement();this.editorSelect=new FakeElement();
    this.manualButton=new FakeElement();this.swapButton=new FakeElement();
    this.editor.querySelector=selector=>selector==="select[data-inline-hero-slot]"?this.editorSelect:null;
  }
  set innerHTML(value){this._html=String(value||"")}
  get innerHTML(){return this._html}
  insertAdjacentHTML(position,value){
    if(position==="afterbegin")this._html=String(value)+this._html;
    else this._html+=String(value);
  }
  querySelector(selector){
    if(selector==="details.squad")return this._html.includes("<details")?this.details:null;
    if(selector===".squadBody")return this._html.includes("class=\"squadBody\"")?this.body:null;
    if(selector===".squadName small")return this.small;
    if(selector===".squadSwapBtn")return this._html.includes("class=\"squadSwapBtn\"")?this.swapButton:null;
    if(selector==="[data-squad-cloud-check='1']")return this._html.includes("data-squad-cloud-check=\"1\"")?new FakeElement():null;
    const manual=selector.match(/\[data-squad-manual-create="(\d+)"\]/);
    if(manual&&this._html.includes(`data-squad-manual-create="${manual[1]}"`)){
      this.manualButton.dataset.squadManualCreate=manual[1];
      return this.manualButton;
    }
    const inline=selector.match(/\[data-inline-confirm="(\d+)"\]/);
    if(inline&&this._html.includes(`data-inline-confirm="${inline[1]}"`))return this.editor;
    return null;
  }
}

class FakeSquadList extends FakeElement{
  constructor(){super();this.shells=[]}
  set innerHTML(value){if(value==="")this.shells=[]}
  get innerHTML(){return ""}
  appendChild(shell){this.shells.push(shell);return shell}
  querySelector(selector){
    const match=selector.match(/data-squad-id=["']?(\d+)/);
    return match?this.shells.find(shell=>String(shell.dataset.squadId)===match[1])||null:null;
  }
}

function makeState(owner="owner-A"){
  const squads=Array.from({length:4},(_,index)=>normalizeSquadSlots({},index+1));
  return {
    player_id:owner,
    player:{name:"Synthetic Player",server_id:"77",hq_level:0,power_m:null},
    player_context:{},
    alliance:{tag:"",server_id:"",role:"R1",members:[]},
    squads,
    exclusive_weapons:[{hero_name:"DVA",weapon_name:"Lame de Frappe",level:29}],
    technology:{branches:{
      zero_percent:{value:0,status:"confirmed"},
      max_level:{value:"max",status:"confirmed"},
      locked_branch:{value:null,status:"locked"}
    }},
    sync:{status:"local",pending_cloud_save:false},
    updated_at:null,
    version:"test"
  };
}

function squadDataProjection(squads){
  return squads.map(squad=>({
    id:squad.id,power:squad.power,updated_at:squad.updated_at,
    confirmed_composition:squad.confirmed_composition,
    composition_source:squad.composition_source,
    composition_confirmed_at:squad.composition_confirmed_at,
    needs_rescan:squad.needs_rescan,
    heroes:(squad.heroes||[]).map(hero=>({
      name:hero.name,level:hero.level,stars:hero.stars,power:hero.power,
      exclusive:hero.exclusive,gear:hero.gear,awakening:hero.awakening
    }))
  }));
}

function makeHarness({owner="owner-A",user="owner-A",consent=true,allowed=true,state:initialState}={}){
  const box=new FakeSquadList(),persisted=new Map(),timers=[],feedback=[],fetches=[];
  const document={
    createElement:()=>new FakeShell(),
    querySelector(selector){
      if(selector==="#squadList")return box;
      const match=selector.match(/#squadList\s+\[data-squad-id=["']?(\d+)/);
      if(match)return box.shells.find(shell=>String(shell.dataset.squadId)===match[1])||null;
      return null;
    },
    querySelectorAll(){return []}
  };
  const config={consent,allowed,user};
  const ctx=vm.createContext({
    state:initialState||makeState(owner),
    cloudSession:user?{access_token:"synthetic-session",user:{id:user}}:null,
    manualSquadEntryDraft:null,
    APP_VERSION:"synthetic-test",
    STORE_KEY:"warboost-state",
    localStateRevision:0,
    pushTimer:null,
    cloudDirty:false,
    suppressPush:false,
    betaAccessAllowed:()=>config.allowed,
    betaConsentAccepted:()=>config.consent,
    betaPrivateDataVisible:()=>Boolean(config.allowed&&config.consent&&config.user&&
      ctx.state?.player_id===config.user&&ctx.cloudSession?.access_token),
    requireBetaAccess:()=>config.allowed,
    requireBetaConsent:()=>config.consent,
    openDrawer(name){ctx.openedDrawer=name;if(name==="player")ctx.renderSquads()},
    openedDrawer:"",
    authMessage(message){ctx.authMessageText=message},
    showPlayerSyncFeedback(message,options={}){feedback.push({message,options})},
    technologyAdvisorUI:{render(){}},
    technologyAdvisorCopy,
    HERO_CATALOG,
    heroDisplayName,
    canonicalHeroName,
    canonicalStoredHeroName:canonicalHeroName,
    isGenericHeroName,
    fixedHeroSlots,
    savedSquadCompositionCandidate,
    confirmedCompositionForSquad,
    otherSquadsWithCompositionHeroes,
    reconcileConfirmedSquad,
    repairLegacySquadIdentity,
    backfillConfirmedHeroPowers,
    squadReviewStatus,
    squadReviewHeader,
    squadReviewRowHtml,
    hasMeaningfulCore:hasMeaningfulCoreState,
    manualScanDestination,
    scanSquadId,
    renderSquadCloudCheckControls(){},
    openSavedHeroConfirmation(){return false},
    fmtConfirmedSquadPower:()=>"—",
    fmtHeroPowerForDisplay:()=>"—",
    heroDetailLine:()=>({main:"—",stats:""}),
    t(key,values={}){
      const text={
        squad:"Squad",hero:"Hero",hero_unconfirmed:"name to confirm",
        hero_choose:"Choose a hero…",hero_confirm_title:"Squad {squad} · Hero identity",
        hero_confirm_badge:"Confirm",hero_confirm_help:"Check all five hero names.",
        hero_all_required:"Confirm all five hero names before saving.",
        hero_save:"Save names",hero_saving:"Saving names…",
        hero_confirm_saved:"Hero names confirmed and saved.",
        squad_manual_create:"Enter five heroes for Squad {squad}",
        local:"Local only",sync_needed:"Cloud sync pending",
        syncing:"Syncing…",hero_save_failed:"Could not save hero names.",
        hero_duplicate:"A hero cannot be selected twice in one squad.",
        account_sync_auth:"Sign in to continue.",
        account_sync_owner_mismatch:"This account does not own this profile.",
        account_sync_conflict:"The squad changed; review it before saving.",
        connect_pro:"Connect your account."
      }[key]||key;
      return String(text).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??""));
    },
    esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))},
    $:selector=>document.querySelector(selector),
    document,
    lang:"en",
    locale:"en",
    safeLocalSet(key,value){persisted.set(key,JSON.parse(value));return true},
    rememberLastGoodState(){},
    rememberAccountState(){},
    readAccountState(){return null},
    initialState(){return makeState(config.user||owner)},
    scheduleServerSave:undefined,
    fetch:async(...args)=>{fetches.push(args);throw new Error("Network must not be used by this test")},
    setTimeout(fn,delay){const timer={fn,delay,id:timers.length+1};timers.push(timer);return timer.id},
    clearTimeout(){},
    requestAnimationFrame(callback){callback()},
    render(){},
    console
  });
  ctx.scheduleServerSave=undefined;
  ctx.scheduleServerSaveSource=undefined;
  ctx.document=document;
  ctx.fetchCalls=fetches;
  ctx.feedback=feedback;
  ctx.persisted=persisted;
  ctx.timers=timers;
  ctx.config=config;
  ctx.hasMeaningfulCore=hasMeaningfulCoreState;
  ctx.state=initialState||makeState(owner);
  vm.runInContext(source,ctx,{filename:"app.js:manual-squad-functions"});
  return {ctx,box,persisted,timers,feedback,fetches,config};
}

function makeForm(values){
  const status=new FakeElement();
  return {
    dataset:{manualEntry:"true"},
    status,
    querySelectorAll:()=>values.map(value=>({value})),
    querySelector:selector=>selector==="[data-inline-hero-status]"?status:null
  };
}

const cases=[];
async function scenario(name,run){
  try{await run();cases.push({name,ok:true});console.log(`PASS ${name}`)}
  catch(error){cases.push({name,ok:false,error});console.error(`FAIL ${name}: ${error?.stack||error}`)}
}

async function main(){
  const required=["Carlie","Lucius","Morrison","DVA","Skyler"];
  for(const name of required)assert.ok(HERO_CATALOG.includes(name),`${name} must be a current catalog hero`);

  await scenario("Player squad card exposes an empty-squad action; click opens five catalog slots without a write",()=>{
    const h=makeHarness();
    h.ctx.renderSquads();
    let shell=h.box.shells[0],button=shell.querySelector('[data-squad-manual-create="1"]');
    assert.ok(button,"empty Squad 1 has a create button");
    assert.match(shell.innerHTML,/Enter five heroes for Squad 1/);
    button.dispatch("click");
    shell=h.box.shells[0];
    assert.equal(shell.details.open,true);
    assert.match(shell.innerHTML,/data-inline-confirm="1" data-manual-entry="true"/);
    assert.equal((shell.innerHTML.match(/data-inline-hero-slot=/g)||[]).length,5);
    assert.equal(h.persisted.size,0);
    assert.equal(h.timers.length,0);
    assert.equal(h.fetches.length,0);
  });

  await scenario("Manual scan destination opens the matching empty squad editor, with no scan or write",()=>{
    const h=makeHarness();
    const destination=manualScanDestination("squad2");
    assert.equal(destination,"player");
    h.ctx.openFreeManualScanDestination(destination,"squad2");
    const shell=h.box.shells[1];
    assert.equal(h.ctx.openedDrawer,"player");
    assert.equal(shell.details.open,true);
    assert.match(shell.innerHTML,/data-inline-confirm="2" data-manual-entry="true"/);
    assert.equal((shell.innerHTML.match(/data-inline-hero-slot=/g)||[]).length,5);
    assert.equal(h.persisted.size,0);
    assert.equal(h.timers.length,0);
    assert.equal(h.fetches.length,0);
  });

  await scenario("Five distinct catalog heroes save through the real confirmation and saveState functions",async()=>{
    let startingState=makeState();
    const otherNames=HERO_CATALOG.filter(name=>!required.includes(name)).slice(0,5);
    startingState=reconcileConfirmedSquad(startingState,{
      squadId:2,names:otherNames,incomingHeroes:[],updatedAt:"2026-11-03T10:00:00.000Z"
    }).state;
    startingState.squads[1].power=45.6;
    startingState.squads[1].heroes[0].level=155;
    const h=makeHarness({state:startingState}),beforeTech=JSON.stringify(h.ctx.state.technology),
      beforeWeapons=JSON.stringify(h.ctx.state.exclusive_weapons),
      beforeOtherSquads=JSON.stringify(squadDataProjection(h.ctx.state.squads.slice(1)));
    h.ctx.openManualSquadEntry(1);
    const form=makeForm(required),button=new FakeElement();
    await h.ctx.saveInlineHeroNames(1,form,button);
    const saved=h.persisted.get("warboost-state");
    assert.ok(saved,"real saveState persisted to the in-memory local store");
    assert.deepEqual(saved.squads[0].confirmed_composition,required);
    assert.deepEqual(saved.squads[0].heroes.map(hero=>hero.name),required);
    assert.equal(saved.squads[0].composition_source,"explicit_confirmation");
    assert.ok(Date.parse(saved.squads[0].composition_confirmed_at)>0);
    assert.ok(saved.squads[0].power===null||saved.squads[0].power===undefined,
      "manual name entry must leave squad power unknown, not infer it from names");
    const detailFields=["level","stars","power","gear","awakening"];
    assert.ok(saved.squads[0].heroes.every(hero=>detailFields.every(field=>
      hero[field]===null||hero[field]===undefined||hero[field]==="")),
      `manual entry must not invent hero stats: ${JSON.stringify(saved.squads[0].heroes)}`);
    assert.equal(saved.squads[0].heroes[3].exclusive,29,"the existing DVA weapon level is retained for DVA");
    assert.ok(saved.squads[0].heroes.every((hero,index)=>index===3||hero.exclusive==null),
      "the existing DVA weapon is not assigned to other heroes");
    assert.equal(JSON.stringify(saved.technology),beforeTech);
    assert.equal(JSON.stringify(saved.exclusive_weapons),beforeWeapons);
    assert.equal(JSON.stringify(squadDataProjection(saved.squads.slice(1))),beforeOtherSquads);
    assert.equal(h.timers.length,1,"an explicit save queues the existing owner-scoped cloud-save path");
    assert.equal(h.fetches.length,0,"the queued timer was not run and no network request occurred");
    assert.equal(h.ctx.manualSquadEntryDraft,null);
    assert.equal(JSON.stringify(h.feedback.at(-1)?.message),JSON.stringify(["hero_confirm_saved","account_sync_pending"]));
  });

  await scenario("Four selected heroes are rejected without local or cloud writes",async()=>{
    const h=makeHarness();
    h.ctx.openManualSquadEntry(1);
    await h.ctx.saveInlineHeroNames(1,makeForm(required.slice(0,4)),new FakeElement());
    assert.equal(h.persisted.size,0);
    assert.equal(h.timers.length,0);
    assert.equal(h.fetches.length,0);
  });

  await scenario("Duplicate hero names are rejected without local or cloud writes",async()=>{
    const h=makeHarness();
    h.ctx.openManualSquadEntry(1);
    await h.ctx.saveInlineHeroNames(1,makeForm(["Carlie","Lucius","Morrison","DVA","DVA"]),new FakeElement());
    assert.equal(h.persisted.size,0);
    assert.equal(h.timers.length,0);
    assert.equal(h.fetches.length,0);
  });

  await scenario("An existing confirmed squad keeps its power, weapon, heroes and other fields and has no create action",()=>{
    let state=makeState();
    state=reconcileConfirmedSquad(state,{squadId:1,names:required,incomingHeroes:[],updatedAt:"2026-11-04T10:00:00.000Z"}).state;
    state.squads[0].power=45.6;
    state.squads[0].heroes[3].level=29;
    state.squads[0].heroes[3].exclusive="Lame de Frappe";
    const before=JSON.stringify(state),h=makeHarness({state});
    h.ctx.renderSquads();
    assert.equal(h.box.shells[0].querySelector('[data-squad-manual-create="1"]'),null);
    assert.equal(h.box.shells[0].querySelector('[data-inline-confirm="1"]'),null);
    assert.equal(h.ctx.openManualSquadEntry(1),false);
    assert.equal(JSON.stringify(h.ctx.state),before);
    assert.equal(h.persisted.size,0);
  });

  await scenario("An unresolved conflict or rescan marker never exposes the empty-squad create form",()=>{
    const state=makeState();
    state.squads[0].composition_conflict={reason:"squad_freshness_ambiguous"};
    state.squads[0].needs_rescan=true;
    const before=JSON.stringify(state),h=makeHarness({state});
    h.ctx.renderSquads();
    assert.equal(h.box.shells[0].querySelector('[data-squad-manual-create="1"]'),null);
    assert.equal(h.ctx.openManualSquadEntry(1),false);
    assert.equal(h.box.shells[0].querySelector('[data-inline-confirm="1"]'),null);
    assert.equal(JSON.stringify(h.ctx.state),before);
    assert.equal(h.persisted.size,0);
  });

  await scenario("A different signed-in owner cannot open or save another account's empty squad",async()=>{
    const h=makeHarness({owner:"owner-A",user:"owner-B"});
    assert.equal(h.ctx.openManualSquadEntry(1),false);
    assert.equal(h.ctx.manualSquadEntryDraft,null);
    const before=JSON.stringify(h.ctx.state);
    await h.ctx.saveInlineHeroNames(1,makeForm(required),new FakeElement());
    assert.equal(JSON.stringify(h.ctx.state),before);
    assert.equal(h.persisted.size,0);
    assert.equal(h.timers.length,0);
    assert.equal(h.fetches.length,0);
    const switched=makeHarness();
    switched.ctx.openManualSquadEntry(1);
    const ownBefore=JSON.stringify(switched.ctx.state);
    switched.ctx.cloudSession={access_token:"other-session",user:{id:"owner-B"}};
    await switched.ctx.saveInlineHeroNames(1,makeForm(required),new FakeElement());
    assert.equal(JSON.stringify(switched.ctx.state),ownBefore,"a late form cannot write after an account switch");
    assert.equal(switched.persisted.size,0);
  });

  await scenario("Missing session or consent blocks the manual create path",async()=>{
    const noSession=makeHarness({user:""});
    assert.equal(noSession.ctx.openManualSquadEntry(1),false);
    assert.equal(noSession.persisted.size,0);
    assert.equal(noSession.fetches.length,0);
    const noConsent=makeHarness({consent:false});
    assert.equal(noConsent.ctx.openManualSquadEntry(1),false);
    assert.equal(noConsent.ctx.manualSquadEntryDraft,null);
    assert.equal(noConsent.persisted.size,0);
    assert.equal(noConsent.fetches.length,0);
    const noAccess=makeHarness({allowed:false});
    assert.equal(noAccess.ctx.openManualSquadEntry(1),false);
    assert.equal(noAccess.ctx.manualSquadEntryDraft,null);
    assert.equal(noAccess.persisted.size,0);
    assert.equal(noAccess.fetches.length,0);
  });

  await scenario("Consent withdrawn after the form opens prevents saving",async()=>{
    const h=makeHarness();
    h.ctx.openManualSquadEntry(1);
    h.config.consent=false;
    await h.ctx.saveInlineHeroNames(1,makeForm(required),new FakeElement());
    assert.equal(h.persisted.size,0);
    assert.equal(h.timers.length,0);
    assert.equal(h.fetches.length,0);
  });

  const failed=cases.filter(test=>!test.ok);
  console.log(`\n${cases.length-failed.length} PASS / ${failed.length} FAIL`);
  if(failed.length)process.exitCode=1;
}

if(import.meta.url===pathToFileURL(process.argv[1]||"").href)await main();
