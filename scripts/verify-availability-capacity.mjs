import assert from "node:assert/strict";
import {availabilityCapacityRoster} from "../lib/alliance-availability-planner.js";
import {buildDesertStormPlan} from "../lib/desert-storm-plan.js";

const members=Array.from({length:35},(_,index)=>({
  name:`Player ${index+1}`,
  canonical_member_key:`canonical:player-${index+1}|884|ALL4`,
  lifecycle_key:`active|player-${index+1}|884|ALL4`,
  role:index===0?"R5":"R1",
  power_m:100+index,
  warboost_linked:true
}));
const records=members.map((member,index)=>({
  event_type:"desert_storm",
  canonical_member_key:member.canonical_member_key,
  lifecycle_key:member.lifecycle_key,
  member_key:member.canonical_member_key,
  status:index<31?"present":index===31?"uncertain":index===32?"absent":"unknown",
  updated_at:"2026-09-22T10:00:00.000Z"
}));

const capacity=availabilityCapacityRoster(members,records,{
  event_type:"desert_storm",
  max_starters:20,
  max_substitutes:10
});
assert.equal(capacity.participants.length,20);
assert.equal(capacity.substitutes.length,10);
assert.equal(capacity.present_count,30);
assert.ok(capacity.participants.every(member=>member.availability.status==="present"));
assert.ok(capacity.substitutes.every(member=>member.availability.status==="present"));

const presentKeys=[...capacity.participants,...capacity.substitutes].map(member=>member.canonical_member_key);
const plan=buildDesertStormPlan(members,presentKeys,{nowMs:Date.parse("2026-09-22T12:00:00.000Z")});
assert.equal(plan.starters.length,20);
assert.equal(plan.substitutes.length,10);
assert.ok([...plan.starters,...plan.substitutes].every(member=>presentKeys.includes(member.canonical_member_key)));

console.log("Availability capacity verification: PASS");