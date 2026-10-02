import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {buildEventStrategy,eventStrategyFromState} from "../lib/event-strategy.js";
import {eventKnowledge,EVENT_RULES,EVENT_SOURCES,eventDefinition} from "../lib/event-knowledge.js";
import {renderEventStrategy,eventStrategyOrders} from "../lib/event-strategy-ui.js";
import {buildDesertStormPlan} from "../lib/desert-storm-plan.js";
import {buildCanyonPlan} from "../lib/canyon-storm-plan.js";
import {buildVsAdvice,buildSeasonAdvice} from "../api/advice.js";
import {mergeEventAvailabilities} from "../lib/event-availability.js";
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
assert.match(html,/data-event-strategy-copy/);assert.match(html,/Mise à jour curatée/);
assert.match(eventStrategyOrders(full,"fr"),/B ·/);
// Exercise the real workspace-to-engine boundary, not only the library independently.
const appSource=fs.readFileSync("app.js","utf8");
const summarySource=appSource.slice(appSource.indexOf("function allianceEventPlanSummary("),appSource.indexOf("function generateAllianceEventPlan("));
const sandbox={state:{alliance:{event_plans:{desert_storm:{}},canyon:{}}},serverNow:new Date(nowMs),
  activeAllianceRosterMembers:()=>people.slice(0,32),
  allianceEventDefinition:()=>({label:"Desert",limit:20,openRoster:false}),
  buildEventStrategy,renderEventStrategy,lang:"fr",esc:String,t:key=>key};
vm.runInNewContext(`${summarySource};globalThis.renderSummary=allianceEventPlanSummary`,sandbox);
const workspacePlan=sandbox.renderSummary("desert_storm",{rows:rows("desert_storm",32).map((r,i)=>({...r,status:i<20?"present":i<30?"substitute":"unknown"})),totalMembers:32});
assert.match(workspacePlan,/20\/20/);assert.match(workspacePlan,/Couverture des données 20\/20/);
assert.match(workspacePlan,/À confirmer: 2/);assert.match(workspacePlan,/Player 29/);
const rowsSource=appSource.slice(appSource.indexOf("function allianceEventRows("),appSource.indexOf("function allianceEventAvailability("));
sandbox.mergeEventAvailabilities=mergeEventAvailabilities;
sandbox.state.alliance.event_availability=[...rows("desert_storm",1),
  {...rows("desert_storm",1)[0],status:"unknown",source:"legacy",updated_at:"2026-10-02T12:02:00Z"},
  {...rows("desert_storm",1)[0],event_instance:"older-instance",status:"absent"}];
vm.runInNewContext(`${rowsSource};globalThis.readRows=allianceEventRows`,sandbox);
assert.equal(sandbox.readRows("desert_storm").length,1);
assert.equal(sandbox.readRows("desert_storm")[0].status,"present");
console.log("Event strategy knowledge, capacities, uncertainty, evidence, API and safe UI: PASS");