import assert from "node:assert/strict";
import {buildEventStrategy,eventStrategyFromState} from "../lib/event-strategy.js";
import {matchWarSlots} from "../lib/event-war-organization.js";
import {renderEventStrategy} from "../lib/event-strategy-ui.js";
const nowMs=Date.parse("2026-10-02T12:00:00Z"),updated_at=new Date(nowMs).toISOString();
const members=Array.from({length:50},(_,i)=>({canonical_member_key:`w${i}`,name:`War member ${i}`,
  squad_type:["tank","missile","aircraft"][i%3],squad_power_m:100,squad_power_updated_at:updated_at,
  squad_profile_updated_at:updated_at,squad_heroes:[`formation-${i%3}`]}));
const rows=type=>members.map((m,i)=>({canonical_member_key:m.canonical_member_key,
  event_type:type,status:i<20?"present":"substitute",source:"alliance_manager_manual",updated_at}));
const opponent={strength:"stronger",confirmed:true,source:"manager_observation",updated_at};
// A greedy selection would take a for attack, leaving b unable to defend.
const match=matchWarSlots(["a","b"],["attack","defense"],(p,r)=>({a:{attack:9,defense:8},b:{attack:8,defense:0}})[p][r]);
assert.deepEqual(match.map(x=>x.candidate),["b","a"]);
for(const type of ["desert_storm","canyon_storm"]){
  const input={event_type:type,members,availability:rows(type),nowMs};
  const plan=buildEventStrategy(input);
  assert.equal(plan.assignments.length,20);assert.equal(plan.substitute_assignments.length,10);
  assert.equal(buildEventStrategy({...input,members:members.map((m,i)=>i===0?{...m,squad_power_m:Number.MAX_VALUE}:m)}).assignments.length,20,"finite large values cannot overflow the matching score");
  for(const role of ["main_attack","objective_defense","objective_capture","rapid_intervention","objective_retake","group_support"])
    assert.ok(plan.assignments.some(a=>a.role===role),`${type} covers ${role}`);
  assert.equal(plan.assignments.find(a=>a.role==="main_attack").evidence.squad_type,"missile");
  assert.equal(plan.assignments.find(a=>a.role==="objective_defense").evidence.squad_type,"tank");
  assert.equal(plan.assignments.find(a=>a.role==="rapid_intervention").evidence.squad_type,"aircraft");
  for(const [i,reserve] of plan.substitute_assignments.entries()){
    assert.equal(reserve.priority,i+1);assert.ok(reserve.covers_role&&reserve.entry_trigger);
    assert.equal(reserve.entry_requires_slot,true);assert.ok(reserve.replacement_for?.member_key);
    assert.ok(plan.assignments.some(a=>a.member_key===reserve.replacement_for.member_key));
    assert.equal(reserve.attendance_status,"substitute");
  }
  assert.equal(new Set(plan.substitute_assignments.map(r=>r.replacement_for.member_key)).size,10,"backup targets diversified");
  assert.ok(plan.substitute_assignments.some(r=>r.evidence.squad_type==="tank"&&r.role==="reinforce_defense"));
  assert.ok(plan.substitute_assignments.some(r=>r.evidence.squad_type==="missile"&&r.role==="reinforce_offense"));
  assert.ok(plan.substitute_assignments.some(r=>r.evidence.squad_type==="aircraft"&&r.role==="mobile_reserve"));
  const ignored=buildEventStrategy({...input,opponent:{...opponent,confirmed:false,strength:"weaker"}});
  assert.deepEqual(ignored.role_coverage.targets,plan.role_coverage.targets);
  assert.deepEqual(ignored.opponent,{strength:"unknown",source:null,updated_at:null,conditional:true,roster_inferred:false});
  for(const patch of [{source:""},{updated_at:"2026-09-01"},{updated_at:"2026-10-03"},{event_instance:"previous"}])
    assert.equal(buildEventStrategy({...input,opponent:{...opponent,...patch}}).opponent.strength,"unknown");
  const defensive=buildEventStrategy({...input,opponent}),offensive=buildEventStrategy({...input,opponent:{...opponent,strength:"weaker"}});
  assert.ok(defensive.role_coverage.targets.objective_defense>offensive.role_coverage.targets.objective_defense);
  assert.ok(offensive.role_coverage.targets.main_attack>defensive.role_coverage.targets.main_attack);
  assert.equal(defensive.plan_b.mobile_action,"defend_fewer_objectives");
  assert.equal(offensive.plan_b.mobile_action,"retake_when_open");
  assert.equal(plan.plan_b.mobile_action,"hold_and_reassess");
  const fromState=eventStrategyFromState({alliance:{members,event_availability:rows(type),event_opponents:{[type]:opponent}}},type,{nowMs});
  assert.equal(fromState.opponent.strength,"stronger");
  const departed=plan.assignments.slice(0,2);
  const changed=rows(type).map(r=>departed.some(p=>p.member_key===r.canonical_member_key)?{...r,status:"absent"}:r);
  const after=buildEventStrategy({...input,availability:changed,context:{previous_participants:plan.assignments}});
  assert.equal(after.replacement_proposals.length,2);
  assert.equal(new Set(after.replacement_proposals.map(p=>p.substitute_member_key)).size,2);
  assert.ok(after.substitute_assignments.slice(0,2).every(r=>r.entry_trigger==="starter_absent"));
  assert.ok(!after.substitute_assignments.some(r=>departed.some(d=>d.member_key===r.member_key)));
  assert.deepEqual(buildEventStrategy({...input,availability:changed,context:{previous_participants:[...after.assignments,...after.withdrawn_assignments]}}).replacement_proposals,after.replacement_proposals);
  const allAbsent=rows(type).map(r=>r.status==="present"?{...r,status:"absent"}:r);
  const empty=buildEventStrategy({...input,availability:allAbsent,context:{previous_participants:plan.assignments}});
  assert.equal(empty.replacement_proposals.length,10);assert.equal(empty.substitutes.length,10);
  assert.equal(empty.withdrawn_assignments.length,20,"keep remaining vacancies without exceeding reserve capacity");
  const noData=members.map(m=>({...m,squad_power_m:null,squad_power_updated_at:null,squad_profile_updated_at:null,squad_type:null,squad_heroes:[]}));
  const prudent=buildEventStrategy({...input,members:noData});
  assert.ok(prudent.substitute_assignments.every(r=>r.role==="mobile_reserve"&&r.covers_role&&r.entry_trigger&&r.reason==="limited_data"));
  assert.ok(prudent.participants.every(p=>p.evidence.reliability===null&&p.evidence.power_m===null));
  const oldProfile=members.map(m=>({...m,squad_profile_updated_at:"2026-08-01"}));
  const stale=buildEventStrategy({...input,members:oldProfile});
  const staleChanged=buildEventStrategy({...input,members:oldProfile.map(m=>({...m,squad_type:"missile",squad_heroes:["invented"]}))});
  assert.deepEqual(stale.assignments.map(p=>[p.member_key,p.role]),staleChanged.assignments.map(p=>[p.member_key,p.role]),"stale types/formations cannot change role decisions");
  const html=renderEventStrategy({...plan,substitute_assignments:[{...plan.substitute_assignments[0],replacement_for:{name:'<script>alert(1)</script>',role:"main_attack"}}]},{locale:"fr"});
  assert.match(html,/Priorité 1/);assert.match(html,/place libre/);assert.match(html,/Plan B/);
  assert.ok(html.includes("&lt;script&gt;"));assert.ok(!html.includes("<script>"));
  assert.doesNotMatch(html,/Rôle à confirmer|Stratégie proposée|Ordres à copier|Règles et sources|<details/);
}
console.log("War roles, complementary reserves, optimal matching, opponent guards and compact Plan B: PASS");