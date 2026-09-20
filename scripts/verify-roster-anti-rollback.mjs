import assert from "node:assert/strict";
import {mergeNewest} from "../lib/normalize.js";
import {mergeRosterLifecycleMetadata} from "../lib/alliance-roster-lifecycle.js";

const older="2026-09-20T10:00:00.000Z";
const confirmed="2026-09-20T10:00:30.000Z";
const newer="2026-09-20T10:01:00.000Z";

function member(name,overrides={}){
  return {
    name,server_id:"123",alliance_tag:"WB",role:"R3",player_id:"wb-"+name,
    warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance",
    identity_linked_at:older,updated_at:older,
    activity_events:[{id:"2026-09-20:vs",event_type:"vs",event_date:"2026-09-20",participation_status:"participated",updated_at:older}],
    membership_history:[{type:"joined",at:older,source:"test"}],
    ...overrides
  };
}
function state(members){return {player_id:"manager",player:{name:"Manager",server_id:"123"},alliance:{server_id:"123",tag:"WB",members}}}

const localConfirmed=member("alice",{
  role:"R4",rank_confirmed_at:confirmed,rank_confirmed_source:"r5_r4_manual_rank_management",
  updated_at:confirmed
});
const staleCloud=member("alice",{role:"R3",player_id:null,warboost_linked:false,identity_basis:null});

const delayedProfile=mergeNewest(state([localConfirmed]),state([staleCloud]));
assert.equal(delayedProfile.alliance.members[0].role,"R4","a stale profile must not undo a confirmed R4");
assert.equal(delayedProfile.alliance.members[0].player_id,"wb-alice","WarBoost identity must survive the stale merge");
assert.equal(delayedProfile.alliance.members[0].warboost_linked,true,"WarBoost linkage must survive the stale merge");
assert.equal(delayedProfile.alliance.members[0].activity_events.length,1,"participation history must survive the stale merge");
assert.ok(delayedProfile.alliance.members[0].membership_history.length>=1,"membership history must survive the stale merge");

const lifecycleDelayed=mergeRosterLifecycleMetadata([localConfirmed],[staleCloud]);
assert.equal(lifecycleDelayed.find(x=>x.name==="alice").role,"R4","lifecycle hydration must keep the confirmed rank");

const local100=Array.from({length:100},(_,i)=>member(`member-${i}`,{player_id:`wb-${i}`}));
const cloud95=local100.slice(0,95).map(row=>({...row,updated_at:newer}));
const additiveMerge=mergeNewest(state(local100),state(cloud95));
assert.equal(additiveMerge.alliance.members.length,100,"a stale 95-row response must not drop five local members");

const newerCanonical=member("alice",{
  role:"R3",rank_confirmed_at:newer,rank_confirmed_source:"r5_r4_manual_rank_management",updated_at:newer
});
assert.equal(mergeNewest(state([localConfirmed]),state([newerCanonical])).alliance.members[0].role,"R3","a genuinely newer canonical confirmation must win");
assert.equal(mergeRosterLifecycleMetadata([localConfirmed],[newerCanonical])[0].role,"R3","lifecycle hydration must accept a newer canonical confirmation");

console.log("PASS: confirmed rank wins delayed stale profiles, identity/history survive, additive 100-row rosters stay intact, and newer canonical changes still win");