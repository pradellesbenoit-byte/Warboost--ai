import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {buildDesertStormPlan,DESERT_STORM_RULESET} from "../lib/desert-storm-plan.js";
import {renderDesertStormPlanInto} from "../lib/desert-storm-plan-ui.js";
import {desertStormMemberKeys,normalizeDesertStormSelections,normalizeDesertStormSubstituteSelections} from "../lib/desert-storm-selection.js";
import {desertStormMissionLabel} from "../lib/desert-storm-labels.js";
import {mergeDesertStormState,desertStormSelectionSignature} from "../lib/cloud-state-recovery.js";
import {mergeNewest} from "../lib/normalize.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const app=read("app.js");

function extractFunction(name){
  const start=app.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`missing ${name}`);
  const paramsOpen=app.indexOf("(",start);
  let paramsDepth=0,quote="",paramsClose=-1;
  for(let i=paramsOpen;i<app.length;i++){
    const ch=app[i];
    if(quote){if(ch==="\\"){i++;continue}if(ch===quote)quote="";continue}
    if(ch==="'"||ch==='"'||ch==="`"){quote=ch;continue}
    if(ch==="(")paramsDepth++;
    if(ch===")"&&--paramsDepth===0){paramsClose=i;break}
  }
  assert.notEqual(paramsClose,-1,`unterminated parameters for ${name}`);
  const open=app.indexOf("{",paramsClose+1);
  let depth=0;quote="";let lineComment=false,blockComment=false;
  for(let i=open;i<app.length;i++){
    const ch=app[i],next=app[i+1];
    if(lineComment){if(ch==="\n")lineComment=false;continue}
    if(blockComment){if(ch==="*"&&next==="/"){blockComment=false;i++}continue}
    if(quote){if(ch==="\\"){i++;continue}if(ch===quote)quote="";continue}
    if(ch==="/"&&next==="/"){lineComment=true;i++;continue}
    if(ch==="/"&&next==="*"){blockComment=true;i++;continue}
    if(ch==="'"||ch==='"'||ch==="`"){quote=ch;continue}
    if(ch==="{")depth++;
    if(ch==="}"&&--depth===0)return app.slice(start,i+1);
  }
  throw new Error(`unterminated function ${name}`);
}

function element(classes=[]){
  const values=new Set(classes);
  return {
    hidden:values.has("hidden"),innerHTML:"",textContent:"",textContentBefore:"",dataset:{},
    className:"",textContentAfter:"",onclick:null,scrollCalls:0,lastScroll:null,
    classList:{
      add(name){values.add(name)},
      remove(name){values.delete(name)},
      contains(name){return values.has(name)},
      toggle(name,force){if(force===undefined){if(values.has(name))values.delete(name);else values.add(name)}else if(force)values.add(name);else values.delete(name)}
    },
    scrollIntoView(options){this.scrollCalls++;this.lastScroll=options}
  };
}

const labels={
  ds_plan_ready:"Plan tactique prêt",ds_starters:"Participants",ds_substitutes:"Remplaçants",
  ds_confidence:"Fiabilité",ds_team:"Équipe",ds_captain:"Responsable",ds_opening:"Début",
  ds_center:"Centre",ds_late:"Fin",ds_short_orders:"Consignes courtes à partager",
  ds_ruleset_note:"Référence tactique du {date}",ds_copy_title:"Plan Tempête du Désert",
  ds_order_objectives:"Tenez les objectifs.",ds_order_center:"Priorité au silo.",
  ds_order_help:"Appelez la réserve par bâtiment.",ds_no_registered:"Sélectionnez au moins un joueur.",
  ds_selection_requires_verified_access:"Accès R4/R5 non confirmé."
};
function translate(key,vars={}){
  return String(labels[key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(vars?.[name]??""));
}
function escapeHtml(value){
  return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

const members=Array.from({length:16},(_,index)=>({
  name:index<12?`Participant ${index+1}`:`Remplaçant ${index-11}`,
  role:index===0?"R5":index<5?"R4":"R3",
  canonical_member_key:`canonical:storm-${index+1}|884|ALL4`,
  lifecycle_key:`canonical:storm-${index+1}|884|ALL4`,
  server_id:"884",alliance_tag:"ALL4",warboost_linked:true,
  power_m:220-index,squad_power_m:140-index,hq_level:30
}));
const allKeys=members.map(member=>member.canonical_member_key);
const substituteKeys=allKeys.slice(12);

function runHandler({throwDuringBuild=false}={}){
  const status=element(["hidden"]),planBox=element(["hidden"]),copyButton=element(["hidden"]);
  const ds={team:"B",battle_time:"",registered_keys:allKeys,substitute_keys:substituteKeys,selection_initialized:true,plan:null,updated_at:null};
  const state={player_id:"leader",alliance:{members,roster_review:[],former_members:[],desert_storm:ds,updated_at:null}};
  const els={"#desertStormStatus":status,"#desertStormPlan":planBox,"#desertStormCopyBtn":copyButton,
    "#desertStormPlanner":element(),"#desertStormRosterPicker":element(),"#desertStormCount":element(),
    "#desertStormTeam":element(),"#desertStormTime":element(),"#desertStormClearBtn":element(),"#desertStormGenerateBtn":element()};
  let savedSnapshot=null;
  const sandbox={
    $:selector=>els[selector]||null,
    state,lang:"fr",t:translate,esc:escapeHtml,
    ensureDesertStormState:()=>state.alliance.desert_storm,
    activeAllianceRosterMembers:()=>members,
    normalizeDesertStormSelections,normalizeDesertStormSubstituteSelections,desertStormMemberKeys,
    desertStormAvailabilityCapacity:()=>{throw new Error("unexpected availability fallback")},
    desertStormMissionLabel,
    buildDesertStormPlan:throwDuringBuild?()=>{throw new Error("moteur de plan indisponible")}:buildDesertStormPlan,
    renderDesertStormPlanInto,DESERT_STORM_RULESET,
    hasDeclaredAllianceCommandRole:()=>true,managerOnlyMessage:()=>"Accès réservé R4/R5.",
    desertStormFeatureAccess:()=>true,serverNow:new Date("2026-09-24T12:00:00.000Z"),
    desertStormSelectionSignature,desertStormSearchTerm:"",
    runtimeAccessState:()=>({privateVisible:true}),desertStormSelectionAccess:()=>({allowed:true,syncing:false,canResync:false}),
    searchSelection:()=>null,preserveSearchInput(){},restoreSearchSelection(){},renderDesertStormPicker(){},
    activeAllianceRosterMembers:()=>members,
    betaPrivateDataVisible:()=>true,document:{querySelector:selector=>selector==="#allianceDrawer.open"?{}:null},
    safeRenderStep:(stage,fn)=>fn(),renderAdvice(){},renderProvider(){},renderPlayerActivity(){},renderSeasonAccess(){},renderCanyonPlanner(){},
    tryDesertStormRoleResync(){},
    saveState:options=>{assert.equal(options?.renderUi,false);savedSnapshot=JSON.parse(JSON.stringify(state));return true},
    navigator:{clipboard:{writeText:async()=>{}}}
  };
  const names=[
    "dsLabel","dsMissionLabel","desertStormWarningText","desertStormCopyText",
    "desertStormPlanSelection","desertStormCurrentSelectionSignature","clearDesertStormPlanReadyStatus",
    "renderDesertStormPlan","renderDesertStormPlanner","criticalUiRepaintPass",
    "desertStormPlanGenerationError","generateDesertStormPlan"
  ];
  vm.runInNewContext(`let recentlyGeneratedDesertStormPlan=null;let desertStormSearchTerm="";${names.map(extractFunction).join("\n")}\nglobalThis.run=generateDesertStormPlan;globalThis.repaint=()=>criticalUiRepaintPass("TEST");`,sandbox,{timeout:1000});
  sandbox.run();
  return {status,planBox,copyButton,state,sandbox,getSavedSnapshot:()=>savedSnapshot};
}

const {status,planBox,copyButton,state,sandbox,getSavedSnapshot}=runHandler();
const plan=state.alliance.desert_storm.plan;
assert.ok(plan,"the click handler stores the generated plan");
assert.ok(getSavedSnapshot()?.alliance?.desert_storm?.plan,"the generated plan is included in the local save snapshot");
state.alliance.desert_storm=getSavedSnapshot().alliance.desert_storm;
assert.equal(plan.battle_time,"","battle time is optional for plan generation");
assert.equal(plan.registered_count,16);
assert.equal(plan.starters.length,12,"all selected Participants stay in the starter roster");
assert.equal(plan.substitutes.length,4,"all selected Remplaçants stay substitutes");
assert.equal(plan.groups.length,3,"the Participants are split into three usable groups");
assert.equal(plan.groups.reduce((count,group)=>count+group.members.length,0),12);
assert.deepEqual(new Set(plan.starters.map(row=>row.name)),new Set(members.slice(0,12).map(row=>row.name)));
assert.deepEqual(new Set(plan.substitutes.map(row=>row.name)),new Set(members.slice(12).map(row=>row.name)));
assert.equal(planBox.hidden,false);
assert.equal(planBox.classList.contains("hidden"),false);
assert.equal(copyButton.classList.contains("hidden"),false);
assert.equal(planBox.scrollCalls,1,"a generated plan is scrolled into view immediately");
assert.equal(planBox.lastScroll?.block,"nearest");
assert.match(planBox.innerHTML,/dsPlanGroups/);
assert.match(planBox.innerHTML,/Participants/);
assert.match(planBox.innerHTML,/Remplaçants/);
assert.match(planBox.innerHTML,/Consignes courtes à partager/);
assert.match(planBox.innerHTML,/refinery|silo|hospital/i,"the rendered plan includes mission details");
assert.ok(planBox.innerHTML.includes(labels.ds_order_objectives)&&planBox.innerHTML.includes(labels.ds_order_center)&&planBox.innerHTML.includes(labels.ds_order_help),"all shareable orders are visible");
for(const member of members)assert.ok(planBox.innerHTML.includes(escapeHtml(member.name)),`${member.name} is visible in the plan`);
assert.equal(status.textContent,"Plan tactique prêt","success is announced only after visible rendering succeeds");
assert.equal(status.classList.contains("hidden"),false);
assert.equal(status.dataset.desertStormPlanSuccess,"true");

const signature=desertStormSelectionSignature(state.alliance.desert_storm);
const delayedCloudState={...state.alliance.desert_storm,plan:null,updated_at:"2026-09-24T12:10:00.000Z"};
state.alliance.desert_storm=mergeDesertStormState(state.alliance.desert_storm,delayedCloudState);
assert.ok(state.alliance.desert_storm.plan,"a later cloud snapshot without a plan cannot erase a matching saved plan");
assert.equal(state.alliance.desert_storm.plan.selection_signature,signature);
sandbox.repaint();
assert.equal(planBox.hidden,false,"the plan stays visible after a critical repaint following cloud merge");
assert.match(planBox.innerHTML,/dsPlanGroups/);
assert.equal(status.textContent,"Plan tactique prêt","success stays aligned with the visible plan after repaint");
state.alliance.desert_storm.plan=null;
sandbox.repaint();
assert.ok(state.alliance.desert_storm.plan,"the last matching generated plan is restored if a repaint sees a transiently empty state");
assert.equal(planBox.hidden,false,"a transient plan-less repaint does not hide the generated plan");

const serverBase={player_id:"leader",alliance:{members,roster_review:[],former_members:[],desert_storm:state.alliance.desert_storm}};
const serverIncoming=JSON.parse(JSON.stringify(serverBase));
serverIncoming.alliance.desert_storm={...serverIncoming.alliance.desert_storm,plan:null,updated_at:"2026-09-24T12:20:00.000Z"};
const serverMerged=mergeNewest(serverBase,serverIncoming);
assert.ok(serverMerged.alliance.desert_storm.plan,"server mergeNewest also retains the plan for the same selection");
state.alliance.desert_storm=serverMerged.alliance.desert_storm;
sandbox.repaint();
assert.equal(planBox.hidden,false,"the plan remains visible after the server-side merge path and critical repaint");
const changedSelection=mergeDesertStormState(serverMerged.alliance.desert_storm,{...serverMerged.alliance.desert_storm,team:"A",updated_at:"2026-09-24T12:30:00.000Z"});
assert.equal(changedSelection.plan,null,"changing the team invalidates the plan");
const changedTime=mergeDesertStormState(serverMerged.alliance.desert_storm,{...serverMerged.alliance.desert_storm,battle_time:"20:00",updated_at:"2026-09-24T12:31:00.000Z"});
assert.equal(changedTime.plan,null,"changing the battle time invalidates the plan");
const explicitlyCleared=mergeDesertStormState(serverMerged.alliance.desert_storm,{...serverMerged.alliance.desert_storm,registered_keys:[],substitute_keys:[],updated_at:"2026-09-24T12:32:00.000Z"});
assert.equal(explicitlyCleared.plan,null,"clearing the selection invalidates the plan");
state.alliance.desert_storm.team="A";
sandbox.repaint();
assert.equal(planBox.classList.contains("hidden"),true,"a changed team never recovers the previous plan");
assert.equal(status.classList.contains("hidden"),true,"the ready message is cleared when the selection no longer matches");

const broken=runHandler({throwDuringBuild:true});
assert.match(broken.status.textContent,/moteur de plan indisponible/,"the real generation error is shown");
assert.doesNotMatch(broken.status.textContent,/Plan tactique prêt/);
assert.equal(broken.planBox.classList.contains("hidden"),true);

const html=read("index.html");
assert.ok(html.indexOf('id="desertStormGenerateBtn"')<html.indexOf('id="desertStormPlan"'),"the result container is below the create button");
assert.match(app,/addEventListener\("click",generateDesertStormPlan\)/,"the create button invokes the tested handler");

console.log("Desert Storm plan click, participant/substitute assignment, visible rendering, optional battle time, and error reporting verified.");