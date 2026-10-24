import assert from "node:assert/strict";
import fs from "node:fs";
import {canonicalAllianceAuthorization} from "../lib/alliance-authorization.js";
import {resolveRequestedRosterRemovalMembers,validateRosterRemovalRanks} from "../api/alliance-role.js";

const context={serverId:"884",allianceTag:"ALL4"};
const identity={name:"Manager",server_id:"884",alliance_tag:"ALL4"};
const row=(name,role,extra={})=>({name,role,server_id:"884",alliance_tag:"ALL4",...extra});
const current=[
  row("Manager","R5",{player_id:"manager",warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"}),
  row("Member R4","R4"),
  row("Member R3","R3"),
  row("Member R2","R2"),
  row("Member R1","R1"),
  row("Second R5","R5")
];
const request=member=>({member_key:`canonical:${member.name.toLowerCase()}|884|ALL4`,name:member.name,server_id:member.server_id,alliance_tag:member.alliance_tag,expected_role:member.role});

for(const actorRole of ["R5","R4"]){
  const roster=current.map(member=>member.name==="Manager"?{...member,role:actorRole}:member);
  const authorization=canonicalAllianceAuthorization({
    playerId:"manager",
    membership:{alliance_id:"alliance-1",role:actorRole},
    alliance:{id:"alliance-1",owner_player_id:"owner",server_id:"884",tag:"ALL4"},
    roster,
    identity
  });
  assert.equal(authorization.allowed,true,`${actorRole} must have canonical management authorization`);
  const exact=resolveRequestedRosterRemovalMembers(roster,[request(roster.find(member=>member.name==="Member R3"))],context);
  assert.equal(exact.ok,true,`${actorRole} can select an exact canonical non-R5 member for removal`);
  assert.deepEqual(exact.rows.map(member=>member.name),["Member R3"]);
}

for(const actorRole of ["R3","R2","R1"]){
  const roster=current.map(member=>member.name==="Manager"?{...member,role:actorRole}:member);
  const authorization=canonicalAllianceAuthorization({
    playerId:"manager",
    membership:{alliance_id:"alliance-1",role:actorRole},
    alliance:{id:"alliance-1",owner_player_id:"owner",server_id:"884",tag:"ALL4"},
    roster,
    identity
  });
  assert.equal(authorization.allowed,false,`${actorRole} must not authorize removals`);
}

{
  const copy=structuredClone(current);
  const absent=resolveRequestedRosterRemovalMembers(current,[request(row("Not in roster","R3"))],context);
  assert.deepEqual(absent,{ok:false,error:"member_not_found"});
  const foreign=resolveRequestedRosterRemovalMembers(current,[{...request(current[1]),alliance_tag:"OTHER"}],context);
  assert.deepEqual(foreign,{ok:false,error:"member_not_found"});
  assert.deepEqual(current,copy,"denied removal input must not mutate the canonical roster");
}

{
  const stale=resolveRequestedRosterRemovalMembers(current,[{...request(current[1]),expected_role:"R3"}],context);
  assert.deepEqual(stale,{ok:false,error:"member_role_changed"},"a stale expected role cannot select a current member");
  const ambiguous=resolveRequestedRosterRemovalMembers([...current,row("Member R3","R3",{server_id:"Server 884"})],[request(current[2])],context);
  assert.deepEqual(ambiguous,{ok:false,error:"member_identity_ambiguous"});
}

{
  const duplicate=resolveRequestedRosterRemovalMembers(current,[request(current[1]),request(current[1])],context);
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.rows.length,1,"duplicate request inputs are collapsed before removal/tombstone creation");
}

{
  const exactR5=resolveRequestedRosterRemovalMembers(current,[request(current[0])],context);
  assert.equal(exactR5.ok,true,"an exact R5 row may be selected when another R5 remains");
  assert.deepEqual(validateRosterRemovalRanks(current,exactR5.rows,"R5"),{ok:true},"R5 may remove one of multiple R5 rows");
  assert.deepEqual(validateRosterRemovalRanks(current,exactR5.rows,"R4"),{ok:false,status:403,error:"r5_protected"},"R4 may not remove an R5");
  assert.deepEqual(validateRosterRemovalRanks([current[0]],[current[0]],"R5"),{ok:false,status:400,error:"last_r5_protected"},"the final R5 remains protected");
  const exactR4=resolveRequestedRosterRemovalMembers(current,[request(current[1])],context);
  assert.equal(exactR4.ok,true,"an exact R4 row may be selected");
  assert.deepEqual(validateRosterRemovalRanks(current,exactR4.rows,"R4"),{ok:true});
}

const api=fs.readFileSync(new URL("../api/alliance-role.js",import.meta.url),"utf8");
assert.match(api,/if\(!access\.allowed\)return res\.status\(403\)\.json\(\{error:"management_role_required"\}\)/);
assert.match(api,/if\(actorRole==="R4"&&targets\.some\(member=>role\(member\?\.role\)==="R5"\)\)return \{ok:false,status:403,error:"r5_protected"\}/);
assert.match(api,/r5Count-targets\.filter\(member=>role\(member\?\.role\)==="R5"\)\.length<1/);
assert.match(api,/expected_updated_at:actorContext\.alliance\.updated_at/);
assert.ok(api.indexOf("if(!selection.ok)return res.status(409)")<api.indexOf("const now=new Date().toISOString(),removedKeys="),"rejected selections return before any roster write is prepared");

console.log("PASS: canonical alliance roster removals require exact current identity and role, authorize only R4/R5, deduplicate inputs, and preserve R5/CAS guards");