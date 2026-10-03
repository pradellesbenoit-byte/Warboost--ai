import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {validateSearchResponse,eventStrategyResearch} from "../lib/event-strategy-research.js";
import {reserveTactics,usableResearch} from "../lib/event-reserve-tactics.js";
import {buildEventStrategy} from "../lib/event-strategy.js";
import {renderEventStrategy} from "../lib/event-strategy-ui.js";
import {canonicalAllianceAuthorization} from "../lib/alliance-authorization.js";
const nowMs=Date.parse("2026-10-03T06:00:00Z");
const urls=["https://www.lastwartutorial.com/desert-storm/?utm_source=openai","https://www.ldshop.gg/blog/last-war-survival/desert-storm.html?utm_source=openai"];
const report={recommendations:[{role:"objective_retake",objective_id:"nuclear_silo",sources:urls.map(x=>x.split("?")[0])}]};
const response={status:"completed",output:[
  {type:"web_search_call",status:"completed",action:{sources:urls.map(url=>({url}))}},
  {type:"message",content:[{type:"output_text",text:JSON.stringify(report),annotations:[]}]}
]};
const accepted=validateSearchResponse(response,"desert_storm",nowMs);
assert.equal(accepted.recommendations.length,1);
assert.equal(accepted.live_game_data,false);assert.equal(accepted.official_rules_changed,false);
assert.equal(reserveTactics("desert_storm",{research:accepted,nowMs}).priority_roles[0],"objective_retake");
assert.equal(usableResearch({...accepted,checked_at:"2026-10-01"},"desert_storm",nowMs),null);
assert.equal(usableResearch(accepted,"canyon_storm",nowMs),null);
assert.ok(usableResearch({status:"verified",event_type:"canyon_storm",checked_at:new Date(nowMs).toISOString(),
  recommendations:[{role:"objective_retake",objective_id:"virus_lab",classification:"community_advice",
    sources:["https://lastwarhandbook.com/guides/canyon-storm-battlefield-guide","https://www.reddit.com/r/LastWarMobileGame/comments/1mimk49/canyon_storm_whats_your_strategy"]}]},
  "canyon_storm",nowMs),"event-specific Reddit permalinks can corroborate community advice");
assert.throws(()=>validateSearchResponse({...response,output:response.output.slice(1)},"desert_storm",nowMs));
for(const recommendations of [
  [{...report.recommendations[0],sources:[urls[0],urls[0]]}],
  [{...report.recommendations[0],sources:["https://evil.invalid/desert-storm",urls[0]]}],
  [{...report.recommendations[0],objective_id:"invented_enemy_base"}],
  [{...report.recommendations[0],role:"automatic_join"}]
])assert.throws(()=>validateSearchResponse({...response,output:[response.output[0],{type:"message",content:[{type:"output_text",text:JSON.stringify({recommendations})}]}]},"desert_storm",nowMs));
let calls=0;
const request=async(url,init)=>{
  calls++;const payload=JSON.parse(init.body);
  assert.equal(payload.tools[0].type,"web_search");assert.equal(payload.tool_choice,"required");
  assert.ok(!JSON.stringify(payload).includes("canonical_member_key"),"no player payload reaches web search");
  return {ok:true,json:async()=>response};
};
const [first,second]=await Promise.all([
  eventStrategyResearch("desert_storm",{request,providerKey:"test"}),
  eventStrategyResearch("desert_storm",{request,providerKey:"test"})
]);
assert.equal(first.status,"verified");assert.equal(second.status,"verified");assert.equal(calls,1);
assert.equal((await eventStrategyResearch("desert_storm",{request,providerKey:"test"})).cached,true);
const unavailable=await eventStrategyResearch("canyon_storm",{request:async()=>{throw new Error("offline")},providerKey:"test"});
assert.equal(unavailable.status,"unavailable");
assert.equal((await eventStrategyResearch("canyon_storm",{request,providerKey:"test"})).cached,true,"failed searches are backoff cached");

const updated_at=new Date(nowMs).toISOString();
const members=Array.from({length:30},(_,i)=>({canonical_member_key:`r${i}`,name:`Member ${i}`,
  squad_power_m:100-i,squad_power_updated_at:updated_at,squad_profile_updated_at:updated_at,
  squad_type:["tank","missile","aircraft"][i%3]}));
for(const event_type of ["desert_storm","canyon_storm"]){
  const availability=members.map((m,i)=>({canonical_member_key:m.canonical_member_key,event_type,
    status:i<20?"present":"substitute",source:"alliance_manager_manual",updated_at}));
  const plan=buildEventStrategy({event_type,members,availability,nowMs});
  assert.ok(plan.tactics?.checked_at);
  assert.ok(plan.substitute_assignments.every(r=>r.task.kind==="cover_starter"&&r.task.target_name&&r.task.objective));
  const html=renderEventStrategy(plan,{locale:"fr"});
  const starterHtml=html.slice(0,html.indexOf('data-event-roster-toggle="'+event_type+':reserves"'));
  assert.ok(!/Renfort polyvalent|Présent confirmé|Défense objectif|Attaque principale|eventStrategyReserveEntry/.test(starterHtml));
  assert.ok(html.includes("Titulaires")&&html.includes("Remplaçants")&&html.includes("Priorité 10"));
  assert.ok(!/Renfort polyvalent|Réserve mobile|Règles et sources|Stratégie proposée/.test(html));
  assert.ok(html.includes(event_type==="desert_storm"?"raffineries":"tour d’énergie"));
  if(event_type==="desert_storm"){
    const research={...accepted,recommendations:[{...accepted.recommendations[0],role:"objective_defense",objective_id:"field_hospitals"}]};
    const revised=buildEventStrategy({event_type,members,availability,nowMs,context:{research}});
    assert.equal(plan.assignments.find(a=>a.role==="objective_defense").objective_id,"oil_refineries");
    assert.equal(revised.assignments.find(a=>a.role==="objective_defense").objective_id,"field_hospitals","cross-checked web advice actually changes the calculated plan");
    assert.ok(revised.substitute_assignments.some(r=>r.task.objective?.en==="Field Hospitals"));
  }
  const noData=buildEventStrategy({event_type,members:members.map(m=>({...m,squad_power_m:null})),availability,nowMs});
  assert.ok(noData.substitute_assignments.every(r=>r.task.role===null&&r.task.target_name));
  assert.ok(new Set(noData.substitute_assignments.map(r=>r.task.target_name)).size>1);
  const prudentHtml=renderEventStrategy(noData,{locale:"fr"});
  assert.ok(!/Renfort polyvalent|Défense objectif|Attaque principale/.test(prudentHtml));
  assert.ok(prudentHtml.includes("Remplace Member"));
  const partial=buildEventStrategy({event_type,members:members.map((m,i)=>i===29?{...m,squad_power_m:null}:m),availability,nowMs});
  assert.equal(partial.substitute_assignments.find(r=>r.member_key==="r29").task.role,null,"unknown reserve ability cannot create a specialized task");
  const fallback=renderEventStrategy({...plan,substitute_assignments:[{name:"Unknown",member_key:"unknown",task:{kind:"needs_plan"},priority:1}]},{locale:"fr"});
  assert.ok(fallback.includes("Rôle à définir selon le plan"));
  assert.equal(plan.opponent.strength,"unknown");
}
const alliance={id:"a",owner_player_id:"owner",server_id:"1",tag:"ALL4"};
assert.equal(canonicalAllianceAuthorization({playerId:"owner",alliance}).allowed,true);
assert.equal(canonicalAllianceAuthorization({playerId:"outsider",alliance,membership:{alliance_id:"a",role:"R5"}}).allowed,false);
const api=fs.readFileSync("lib/event-research-api.js","utf8");
assert.ok(api.indexOf("if(!auth.allowed)")<api.indexOf("await eventStrategyResearch(type)"));
const adviceApi=fs.readFileSync("api/advice.js","utf8");
assert.ok(adviceApi.indexOf("await requireBetaUser(req")<adviceApi.indexOf("await researchForAllianceManager(betaUser"));
assert.ok(adviceApi.includes('req.query?.action==="event_research"'));
const app=fs.readFileSync("app.js","utf8");
const wrapper=app.slice(app.indexOf("const eventResearchPending="),app.indexOf("function renderAllianceEventWorkspace("));
let resolveRequest,generated=0;
const state={alliance:{id:"a"}},session={user:{id:"u"}};
const sandbox={state,cloudSession:session,lang:"fr",hasDeclaredAllianceCommandRole:()=>true,
  $:()=>null,authHeaders:x=>x,generateAllianceEventPlan:()=>generated++,
  fetchSessionCritical:()=>new Promise(resolve=>resolveRequest=resolve)};
vm.runInNewContext(`${wrapper};globalThis.recalculate=recalculateAllianceEventPlan`,sandbox);
const job=sandbox.recalculate("desert_storm");
assert.equal(generated,0,"wait for bounded research before recalculating");
await sandbox.recalculate("desert_storm");
session.user.id="other";
resolveRequest({ok:true,json:async()=>({research:first})});await job;
assert.equal(generated,0,"account switch discards delayed research");
session.user.id="u";const next=sandbox.recalculate("desert_storm");
resolveRequest({ok:true,json:async()=>({research:first,server_time:"2026-10-03T06:01:00Z"})});await next;
assert.equal(generated,1);assert.equal(state.alliance.event_research.desert_storm.status,"verified");
assert.equal(state.alliance.event_research.desert_storm.received_at,"2026-10-03T06:01:00Z");
const strategySource=app.slice(app.indexOf("function allianceEventCurrentStrategy("),app.indexOf("function allianceEventMemberControl("));
let evaluatedAt;
const clockSandbox={state,serverNow:new Date("2026-10-03T05:59:00Z"),activeAllianceRosterMembers:()=>[],
  buildEventStrategy:input=>{evaluatedAt=input.nowMs;return input}};
vm.runInNewContext(`${strategySource};allianceEventCurrentStrategy("desert_storm",{rows:[]});`,clockSandbox);
assert.equal(evaluatedAt,Date.parse("2026-10-03T06:01:00Z"),"an older health-clock snapshot must not discard fresh server research as future-dated");
console.log("Reserve-only UI, dated event-specific tactics, web evidence/cache/privacy/authorization and delayed account guards: PASS");