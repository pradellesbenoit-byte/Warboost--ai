import assert from "node:assert/strict";
import fs from "node:fs";
import {linkCurrentPlayerIdentityIntoRoster} from "../lib/alliance-identity.js";
import {resolveCanonicalIdentity,canonicalMembershipNeedsRepair} from "../lib/canonical-alliance-access.js";
import {resolveRosterScanIdentity} from "../lib/roster-identity-resolution.js";

const scan={role:"R4",rank_confirmed_source:"lastwar_scan",rank_confirmed_at:"2026-09-23T10:00:00.000Z"};
const row=(name,role="R4",extra={})=>({name,role,server_id:"884",alliance_tag:"ALL4",...extra});
const link=(name,roster,extra={})=>linkCurrentPlayerIdentityIntoRoster(roster,{playerId:`wb-${name}`,name,serverId:"#884",allianceTag:"[ALL4]",...extra});

{
  const result=link("jojoJecaid",[row("jojolecaid","R4")],scan);
  assert.equal(result.status,"no_match");
  assert.equal(result.members[0].name,"jojolecaid");
  assert.equal(result.members[0].player_id,undefined);
  const resolution=resolveCanonicalIdentity([row("jojolecaid","R4")],{playerId:"wb-jojoJecaid",name:"jojoJecaid",serverId:"884",allianceTag:"ALL4",...scan});
  assert.equal(resolution.persist_link,false);
  assert.equal(resolution.canonical_role,null);
  assert.equal(canonicalMembershipNeedsRepair(null,"alliance-884","wb-jojoJecaid","R4"),true);
}

{
  const result=resolveRosterScanIdentity({name:"jojoJecaid",role:"R4",hq_level:32},{members:[row("jojolecaid","R4",{hq_level:32})]},{server_id:"884",alliance_tag:"ALL4"});
  assert.equal(result.identity_status,"possible");
  assert.equal(result.identity_needs_confirmation,true);
  assert.equal(result.possible_match.name,"jojolecaid");
  assert.equal(result.detected_name,"jojoJecaid");
}

{
  const result=link("Goodmeuh",[row("Goodmeuh","R4")]);
  assert.equal(result.status,"linked_exact");
  assert.equal(result.members[0].player_id,"wb-Goodmeuh");
}

for(const name of ["[ALL4]ToyN","gladiateurs81"]){
  const result=link(name,[row(name==="[ALL4]ToyN"?"ToyN":name,"R4")]);
  assert.equal(result.status,"linked_exact");
  assert.equal(result.members[0].player_id,`wb-${name}`);
}

{
  const result=link("fauxR4x",[row("fauxR4","R4")],{role:"R4"});
  assert.equal(result.status,"no_match");
  assert.equal(result.members[0].player_id,undefined);
}

{
  const result=link("jojoJecaid",[row("jojolecaid","R4"),row("jojolecaid","R4")],scan);
  assert.equal(result.status,"no_match");
  assert.equal(result.members.every(member=>!member.player_id),true);
}

{
  const result=link("jojoJecaid",[row("jojolecaid","R4",{player_id:"other-account",warboost_linked:true})],scan);
  assert.equal(result.status,"no_match");
  assert.equal(result.members[0].player_id,"other-account");
}

const sync=fs.readFileSync("api/sync.js","utf8");
const state=fs.readFileSync("api/state.js","utf8");
const roleApi=fs.readFileSync("api/alliance-role.js","utf8");
const canonicalAccess=fs.readFileSync("lib/canonical-alliance-access.js","utf8");
assert.match(sync,/rank_confirmed_source:merged\.player\?\.rank_confirmed_source/);
assert.match(state,/rank_confirmed_source:state\.player\?\.rank_confirmed_source/);
assert.doesNotMatch(roleApi,/confirmedManagerScan/);
assert.match(roleApi,/if\(!requestedExact\|\|requested\.server_id!==identity\.server_id\|\|requested\.alliance_tag!==identity\.alliance_tag\)/);
assert.doesNotMatch(roleApi,/linked_tolerant/);
assert.doesNotMatch(canonicalAccess,/linked_tolerant/);

console.log("Strict exact R4/R5 identity linking verification: PASS");