import "./verify-event-research.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {buildEventStrategy,eventStrategyFromState} from "../lib/event-strategy.js";
import {eventKnowledge,EVENT_RULES,EVENT_SOURCES,eventDefinition} from "../lib/event-knowledge.js";
import {renderEventStrategy,eventStrategyOrders} from "../lib/event-strategy-ui.js";
import {buildDesertStormPlan} from "../lib/desert-storm-plan.js";
import {desertStormMemberKeys} from "../lib/desert-storm-selection.js";
import {buildCanyonPlan} from "../lib/canyon-storm-plan.js";
import {buildVsAdvice,buildSeasonAdvice} from "../api/advice.js";
import {mergeEventAvailabilities,normalizeEventAvailability,upsertEventAvailability,mergeAvailabilityHistory} from "../lib/event-availability.js";
import "./verify-event-war-organization.mjs";
const nowMs=Date.parse("2026-10-02T12:00:00Z"),updated_at=new Date(nowMs).toISOString();
const people=Array.from({length:100},(_,i)=>({name:`Player ${i}`,canonical_member_key:`p${i}`,squad_power_m:100-i/2,squad_power_updated_at:updated_at,squad_type:i%2?"tank":"aircraft",role:"R2",warboost_linked:true}));
const rows=(type,count=100)=>people.slice(0,count).map(m=>({canonical_member_key:m.canonical_member_key,event_type:type,status:"present",source:"player_self_report",updated_at}));
for(const type of ["desert_storm","canyon_storm","vs","season","other"]){
  const plan=buildEventStrategy({event_type:type,members:people,availability:rows(type),nowMs});
  const storm=type.endsWith("_storm");
  assert.equal(plan.participants.length,storm?20:100);
  assert.equal(plan.capacity.participants,storm?20:100);
  assert.equal(plan.substitutes.length,0,"overflow does not invent substitute availability");
  assert.equal(plan.overflow.length,storm?80:0);
  assert.equal(plan.assignments.length,plan.participants.length);
  assert.equal(plan.knowledge.live,false);
  assert.equal(plan.opponent.strength,"unknown");
  assert.ok(plan.phases.length>=2);
  assert.ok(plan.plan_b.trigger&&plan.plan_c.trigger);
  assert.ok(plan.assignments.every(a=>a.name&&a.reason&&a.evidence.availability_source));
  const unknown=buildEventStrategy({event_type:type,members:people,nowMs});
  assert.equal(unknown.confirmation.length,100);assert.equal(unknown.data_confidence,0);
  assert.equal(unknown.excluded.length,0);assert.equal(unknown.participants.length,0);
}
const explicit=rows("canyon_storm",30).map((r,i)=>({...r,status:i<20?"present":"substitute"}));
const full=buildEventStrategy({event_type:"canyon_storm",members:people,availability:explicit,nowMs,faction:"instigators"});
assert.equal(full.substitutes.length,10);assert.equal(full.confirmation.length,70);
const expired=rows("vs",1).map(r=>({...r,updated_at:"2026-08-01"}));
assert.equal(buildEventStrategy({event_type:"vs",members:people.slice(0,1),availability:expired,nowMs}).confirmation.length,1);
for(const invalid of [{source:"legacy"},{source:null},{updated_at:null},{event_instance:"old-event"},{updated_at:"2026-10-04"}]){
  assert.equal(buildEventStrategy({event_type:"vs",members:people.slice(0,1),availability:rows("vs",1).map(r=>({...r,...invalid})),nowMs}).participants.length,0);
}
const missing=buildEventStrategy({event_type:"vs",members:[{name:"Unknown",canonical_member_key:"u"}],availability:[{canonical_member_key:"u",event_type:"vs",status:"present",source:"alliance_manager_manual",updated_at}],nowMs});
assert.equal(missing.participants[0].evidence.power_kind,"unknown");
assert.equal(missing.assignments[0].reason,"power_or_freshness_missing");
assert.equal(buildEventStrategy({event_type:"vs",members:[{...people[0],removed_at:updated_at}],availability:rows("vs",1),nowMs}).participants.length,0);
const twins=[{name:"Same",canonical_member_key:"a"},{name:"Same",canonical_member_key:"b"}];
assert.equal(buildEventStrategy({event_type:"vs",members:twins,availability:[{name:"Same",event_type:"vs",status:"present",source:"import",updated_at}],nowMs}).participants.length,0);
for(const placeholder of [{source:"legacy",status:"unknown",updated_at},{source:"alliance_manager_manual",status:"absent",updated_at:"2026-10-04"}]){
  assert.equal(buildEventStrategy({event_type:"vs",members:[people[0]],availability:[...rows("vs",1),{...rows("vs",1)[0],...placeholder}],nowMs}).participants.length,1);
}
assert.equal(buildEventStrategy({event_type:"vs",members:[people[0]],availability:[...rows("vs",1),{...rows("vs",1)[0],status:"unknown",updated_at:"2026-10-02T12:01:00Z"}],nowMs}).confirmation.length,1);
assert.equal(buildEventStrategy({event_type:"vs",members:[people[0]],availability:[{canonical_member_key:"wrong",member_name:people[0].name,event_type:"vs",status:"present",source:"import",updated_at}],nowMs}).participants.length,0);
assert.equal(buildEventStrategy({event_type:"vs",members:[{name:"Same"},{name:"Same"}],availability:[{member_name:"Same",event_type:"vs",status:"present",source:"import",updated_at}],nowMs}).confirmation.length,2);
for(const powerPatch of [{squad_power_updated_at:null,updated_at},{squad_power_updated_at:"2026-10-04"}]){
  assert.equal(buildEventStrategy({event_type:"vs",members:[{...people[0],...powerPatch}],availability:rows("vs",1),nowMs}).participants[0].evidence.stale,true);
}
const reliable={...people[0],activity_events:[{event_type:"vs",event_date:"2026-10-01",participation_status:"participated",updated_at},{event_type:"vs",event_date:"2026-09-30",participation_status:"absent_confirmed",updated_at},{event_type:"vs",event_date:"2026-09-29",participation_status:"not_selected",updated_at}]};
const reliability=buildEventStrategy({event_type:"vs",members:[reliable],availability:rows("vs",1),nowMs}).participants[0].evidence;
assert.equal(reliability.reliability,.5);assert.equal(reliability.confirmed_participations,1);
const opponent={confirmed:true,source:"manager_observation",updated_at,strength:"stronger"};
assert.equal(buildEventStrategy({opponent,nowMs}).opponent.strength,"stronger");
assert.equal(buildEventStrategy({opponent:{...opponent,confirmed:false},nowMs}).opponent.strength,"unknown");
assert.equal(buildEventStrategy({opponent:{...opponent,updated_at:"2026-09-01"},nowMs}).opponent.strength,"unknown");
for(const rule of EVENT_RULES){
  assert.ok(rule.verified_at&&"game_version" in rule&&"superseded_by" in rule&&rule.confidence);
  assert.ok(rule.sources.every(id=>EVENT_SOURCES[id]));
}
assert.ok(eventKnowledge("desert_storm",{nowMs}).rules.find(r=>r.topic==="exact_timers").planning_allowed===false);
assert.ok(eventKnowledge("vs",{nowMs}).rules.find(r=>r.topic==="victory_weights").planning_allowed===false);
assert.ok(eventKnowledge("canyon_storm",{nowMs:Date.parse("2027-01-01")}).rules.every(r=>r.stale&&!r.planning_allowed));
assert.equal(eventDefinition("new_unverified_event").id,"other");
const desert=buildDesertStormPlan(people,people.slice(0,20).map(m=>m.canonical_member_key),{nowMs});
assert.equal(desert.strategy.context.attendance_basis,"registration_only");
assert.ok(buildCanyonPlan(people,explicit,{faction:"instigators"}).strategy);
const state={alliance:{members:people,event_availability:rows("vs")},vs:{day:1,updated_at},season:{}};
assert.equal(eventStrategyFromState(state,"vs",{nowMs}).participants.length,100);
assert.ok(buildVsAdvice(state,"fr",{now:new Date(nowMs)}).event_strategy);
assert.ok(buildSeasonAdvice(state,"fr").event_strategy);
const oldVs=buildVsAdvice({...state,vs:{day:1,updated_at:"2026-09-01"}},"fr",{now:new Date(nowMs)}).event_strategy;
assert.equal(oldVs.context.refresh_required,true);assert.ok(!oldVs.phases.some(p=>p.id==="active"));
assert.match(eventStrategyOrders(oldVs,"fr"),/conserver les ressources/);
const prepVs=buildVsAdvice({...state,vs:{day:0}},"fr",{now:new Date(nowMs)}).event_strategy;
assert.match(eventStrategyOrders(prepVs,"fr"),/Jour de préparation/);
const closedVs=buildVsAdvice({...state,vs:{day:1,updated_at,time_remaining_seconds:0}},"fr",{now:new Date(nowMs)}).event_strategy;
assert.ok(!closedVs.phases.some(p=>p.id==="active"));assert.match(eventStrategyOrders(closedVs,"fr"),/terminée/);
const offSeason=buildSeasonAdvice({...state,season:{lifecycle:"interseason",updated_at}},"fr").event_strategy;
assert.ok(!offSeason.phases.some(p=>p.id==="active"));
const dangerous={...full,assignments:[{...full.assignments[0],name:'<img src=x onerror="boom">'}]};
const html=renderEventStrategy(dangerous,{locale:"fr"});
assert.ok(html.includes("&lt;img"));assert.ok(!html.includes("<img"));
assert.doesNotMatch(html,/data-event-strategy-copy|Stratégie proposée|Ordres à copier|Règles et sources|Rôle à confirmer|<details|<pre/);
assert.match(html,/Titulaires/);assert.match(html,/Remplaçants/);
assert.match(eventStrategyOrders(full,"fr"),/B ·/);
// Exercise the real workspace-to-engine boundary, not only the library independently.
const appSource=fs.readFileSync("app.js","utf8");
const summarySource=appSource.slice(appSource.indexOf("function allianceEventCurrentStrategy("),appSource.indexOf("function generateAllianceEventPlan("));
const sandbox={state:{alliance:{event_plans:{desert_storm:{}},canyon:{}}},serverNow:new Date(nowMs),
  activeAllianceRosterMembers:()=>people.slice(0,32),
  allianceEventDefinition:()=>({label:"Desert",limit:20,openRoster:false}),
  buildEventStrategy,renderEventStrategy,lang:"fr",esc:String,t:key=>key,
  allianceEventMemberKey:m=>m.canonical_member_key,hasDeclaredAllianceCommandRole:()=>false};
vm.runInNewContext(`${summarySource};globalThis.renderSummary=allianceEventPlanSummary`,sandbox);
const workspacePlan=sandbox.renderSummary("desert_storm",{rows:rows("desert_storm",32).map((r,i)=>({...r,status:i<20?"present":i<30?"substitute":"unknown"})),totalMembers:32});
assert.equal((workspacePlan.match(/class="eventStrategyMember"/g)||[]).length,30);
assert.doesNotMatch(workspacePlan,/eventStrategyConfirmCount/);assert.match(workspacePlan,/Player 29/);
const rowsSource=appSource.slice(appSource.indexOf("function allianceEventRows("),appSource.indexOf("function allianceEventAvailability("));
sandbox.mergeEventAvailabilities=mergeEventAvailabilities;
sandbox.state.alliance.event_availability=[...rows("desert_storm",1),
  {...rows("desert_storm",1)[0],status:"unknown",source:"legacy",updated_at:"2026-10-02T12:02:00Z"},
  {...rows("desert_storm",1)[0],event_instance:"older-instance",status:"absent"}];
vm.runInNewContext(`${rowsSource};globalThis.readRows=allianceEventRows`,sandbox);
assert.equal(sandbox.readRows("desert_storm").length,1);
assert.equal(sandbox.readRows("desert_storm")[0].status,"present");
// Storm reserves get useful roles even without power; withdrawals produce a
// suggestion, not an implicit promotion or a manufactured reserve.
for(const event_type of ["desert_storm","canyon_storm"]){
  const declared=rows(event_type,30).map((r,i)=>({...r,status:i<20?"present":"substitute"}));
  const before=buildEventStrategy({event_type,members:people.slice(0,30),availability:declared,nowMs});
  assert.equal(before.assignments.length,20);assert.equal(before.substitute_assignments.length,10);
  assert.ok(before.substitute_assignments.every((r,i)=>r.role&&r.priority===i+1&&r.attendance_status==="substitute"));
  const weak=[...people.slice(0,29),{...people[29],squad_power_m:null,power_m:null,squad_power_updated_at:null,squad_type:null}];
  const cautious=buildEventStrategy({event_type,members:weak,availability:declared,nowMs});
  const generic=cautious.substitute_assignments.find(r=>r.member_key==="p29");
  assert.equal(generic.role,"mobile_reserve");assert.equal(generic.reason,"limited_data");
  const cautiousHtml=renderEventStrategy(cautious,{locale:"fr"});
  assert.match(cautiousHtml,/Remplace Player/);
  assert.doesNotMatch(cautiousHtml,/Renfort polyvalent|Réserve mobile|Présent confirmé/);
  assert.doesNotMatch(cautiousHtml,/Rôle à confirmer|Stratégie proposée|Ordres à copier|Règles et sources|alliance_manager_manual|player_self_report|<details/);
  const withdrawn=declared.map(r=>r.canonical_member_key==="p0"?{...r,status:"absent"}:r);
  const after=buildEventStrategy({event_type,members:people.slice(0,30),availability:withdrawn,nowMs,context:{previous_participants:before.assignments}});
  assert.equal(after.assignments.length,19);assert.equal(after.substitute_assignments.length,10);
  assert.equal(after.replacement_proposals.length,1);
  assert.equal(after.replacement_proposals[0].substitute_member_key,"p20","best fresh same-type reserve covers the departed anchor");
  assert.equal(after.replacement_proposals[0].departed_member_key,"p0");
  assert.equal(after.substitute_assignments[0].priority,1);
  assert.ok(!after.substitute_assignments.some(r=>r.member_key==="p0"));
  const rendered=renderEventStrategy(after,{locale:"fr"});
  assert.match(rendered,/Remplace Player 0/);
  const recalculated=buildEventStrategy({event_type,members:people.slice(0,30),availability:withdrawn,nowMs,
    context:{previous_participants:[...after.assignments,...after.withdrawn_assignments]}});
  assert.equal(recalculated.replacement_proposals[0].substitute_member_key,"p20","recalculate retains the vacancy");
  const accepted=withdrawn.map(r=>r.canonical_member_key==="p20"?{...r,status:"present"}:r);
  const filled=buildEventStrategy({event_type,members:people.slice(0,30),availability:accepted,nowMs,
    context:{previous_participants:[...after.assignments,...after.withdrawn_assignments]}});
  assert.equal(filled.assignments.length,20);assert.equal(filled.replacement_proposals.length,0);
  const reserveAbsent=withdrawn.map(r=>r.canonical_member_key==="p20"?{...r,status:"absent"}:r);
  const next=buildEventStrategy({event_type,members:people.slice(0,30),availability:reserveAbsent,nowMs,context:{previous_participants:before.assignments}});
  assert.equal(next.replacement_proposals[0].substitute_member_key,"p22");
  assert.ok(!next.substitute_assignments.some(r=>r.member_key==="p20"));
  const staleBench=people.slice(0,30).map(m=>m.canonical_member_key==="p20"?{...m,squad_power_updated_at:"2026-08-01",squad_power_m:9999}:m);
  assert.equal(buildEventStrategy({event_type,members:staleBench,availability:withdrawn,nowMs,context:{previous_participants:before.assignments}}).replacement_proposals[0].substitute_member_key,"p22");
  const formations=people.slice(0,30).map(m=>({...m,squad_heroes:["p0","p22"].includes(m.canonical_member_key)?["Kim","Murphy"]:[]}));
  assert.equal(buildEventStrategy({event_type,members:formations,availability:withdrawn,nowMs,context:{previous_participants:before.assignments}}).replacement_proposals[0].substitute_member_key,"p22");
  const tied=people.slice(0,30).map(m=>({...m,
    squad_power_m:["p20","p22"].includes(m.canonical_member_key)?100:m.squad_power_m,
    activity_events:m.canonical_member_key==="p22"?[{event_type,event_date:"2026-10-01",participation_status:"participated",updated_at}]:[]}));
  assert.equal(buildEventStrategy({event_type,members:tied,availability:withdrawn,nowMs,context:{previous_participants:before.assignments}}).replacement_proposals[0].substitute_member_key,"p22");
}
// Exercise the actual manager status writer and recalculation against local state.
const editable=people.slice(0,32).map(m=>({...m,warboost_linked:false}));
sandbox.activeAllianceRosterMembers=()=>editable;
sandbox.hasDeclaredAllianceCommandRole=()=>true;
sandbox.allianceEventDefinition=()=>({label:"Desert",limit:20,subLimit:10,openRoster:false});
sandbox.state.alliance.event_plans={};
sandbox.state.alliance.event_availability=rows("desert_storm",32).map((r,i)=>({...r,status:i<20?"present":i<30?"substitute":"unknown"}));
Object.assign(sandbox,{normalizeEventAvailability,upsertEventAvailability,mergeAvailabilityHistory,desertStormMemberKeys,buildDesertStormPlan,
  rosterLifecycleKey:m=>m.canonical_member_key,ensureDesertStormState:()=>sandbox.state.alliance.desert||=( {}),
  saveState:()=>{},renderAllianceEventWorkspace:()=>{},$:()=>null,
  Date:class extends Date{constructor(...args){super(...(args.length?args:[nowMs]))}}});
const captureSource=appSource.slice(appSource.indexOf("function captureAllianceEventBaseline("),appSource.indexOf("function allianceEventCurrentStrategy("));
const groupingSource=appSource.slice(appSource.indexOf("function allianceEventAvailability("),appSource.indexOf("function allianceEventStatus("));
const writerSource=appSource.slice(appSource.indexOf("function saveAllianceEventStatus("),appSource.indexOf("function allianceEventPlayerProfile("));
const generatorSource=appSource.slice(appSource.indexOf("function generateAllianceEventPlan("),appSource.indexOf("function renderAllianceEventWorkspace("));
vm.runInNewContext(`${groupingSource}\n${captureSource}\n${writerSource}\n${generatorSource};globalThis.writeStatus=saveAllianceEventStatus;globalThis.recalculate=generateAllianceEventPlan;globalThis.currentPlan=allianceEventCurrentStrategy`,sandbox);
sandbox.writeStatus(editable[0],"desert_storm","absent");
assert.equal(sandbox.state.alliance.event_plans.desert_storm.assignments.length,20,"first edit captures an unsaved baseline");
assert.equal(sandbox.currentPlan("desert_storm",{rows:sandbox.readRows("desert_storm")}).replacement_proposals[0].substitute_member_key,"p20");
sandbox.recalculate("desert_storm");
assert.equal(sandbox.currentPlan("desert_storm",{rows:sandbox.readRows("desert_storm")}).replacement_proposals[0].substitute_member_key,"p20","real recalculation keeps the proposed replacement");
sandbox.writeStatus(editable[20],"desert_storm","present");
assert.equal(sandbox.currentPlan("desert_storm",{rows:sandbox.readRows("desert_storm")}).assignments.length,20);
assert.equal(sandbox.currentPlan("desert_storm",{rows:sandbox.readRows("desert_storm")}).replacement_proposals.length,0);
// A resolved vacancy must not return when the new starter later withdraws.
sandbox.writeStatus(editable[20],"desert_storm","absent");
const repeated=sandbox.currentPlan("desert_storm",{rows:sandbox.readRows("desert_storm")});
assert.equal(repeated.replacement_proposals.length,1);
assert.equal(repeated.replacement_proposals[0].departed_member_key,"p20");
assert.ok(!repeated.withdrawn_assignments.some(p=>p.member_key==="p0"));
sandbox.recalculate("desert_storm");
assert.equal(sandbox.currentPlan("desert_storm",{rows:sandbox.readRows("desert_storm")}).replacement_proposals[0].departed_member_key,"p20");
// An old empty saved plan cannot suppress a current, unsaved starter baseline.
sandbox.state.alliance.event_plans={desert_storm:{assignments:[],withdrawn_assignments:[]}};
sandbox.state.alliance.event_availability=rows("desert_storm",32).map((r,i)=>({...r,status:i<20?"present":i<30?"substitute":"unknown"}));
editable.forEach(m=>{m.event_availability=[];m.availability_history=[]});
sandbox.writeStatus(editable[0],"desert_storm","absent");
assert.equal(sandbox.currentPlan("desert_storm",{rows:sandbox.readRows("desert_storm")}).replacement_proposals[0].departed_member_key,"p0");
console.log("Event strategy knowledge, capacities, uncertainty, evidence, API and safe UI: PASS");