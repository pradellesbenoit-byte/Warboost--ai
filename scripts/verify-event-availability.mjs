import assert from "node:assert/strict";
import {mergeEventAvailabilities,mergeAvailabilityHistory,mergePlayerAvailabilityIntoRoster,normalizeEventAvailability} from "../lib/event-availability.js";

const playerRow=normalizeEventAvailability({
  canonical_member_key:"canonical:alice|123|WB",
  player_id:"player-alice",
  member_name:"Alice",
  event_type:"desert_storm",
  event_date:"2099-09-22",
  status:"present",
  source:"player_self_report",
  updated_at:"2026-09-22T08:00:00.000Z"
});
const managerRow=normalizeEventAvailability({
  canonical_member_key:"canonical:alice|123|WB",
  member_name:"Alice",
  event_type:"desert_storm",
  event_date:"2099-09-22",
  status:"absent",
  source:"alliance_manager_manual",
  updated_at:"2026-09-23T08:00:00.000Z"
});
const future=mergeEventAvailabilities([managerRow],[playerRow]);
assert.equal(future.length,1);
assert.equal(future[0].status,"present","future player declaration must remain authoritative");
assert.equal(mergeAvailabilityHistory([managerRow],[playerRow]).length,2,"manager and player observations remain in history");

const roster=[
  {canonical_member_key:"canonical:alice|123|WB",name:"Alice",server_id:"123",alliance_tag:"WB",warboost_linked:true,event_availability:[]},
  {canonical_member_key:"canonical:bob|123|WB",name:"Bob",server_id:"123",alliance_tag:"WB",warboost_linked:false,event_availability:[]}
];
const propagated=mergePlayerAvailabilityIntoRoster(roster,[playerRow],{playerId:"player-alice",name:"Alice",serverId:"123",allianceTag:"WB"});
assert.equal(propagated.changed,true);
assert.equal(propagated.rows[0].event_availability[0].status,"present");
assert.equal(propagated.rows[1].event_availability.length,0,"unlinked members cannot receive a player's declaration");

const blocked=mergePlayerAvailabilityIntoRoster(roster,[playerRow],{playerId:"other-user",name:"Bob",serverId:"123",allianceTag:"WB"});
assert.equal(blocked.changed,false,"an unlinked exact-name match must not be writable");
console.log("event availability verification passed");