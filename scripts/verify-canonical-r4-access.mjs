import assert from "node:assert/strict";
import {normalizeLastWarNickname,lastWarIdentity,linkCurrentPlayerIdentityIntoRoster} from "../lib/alliance-identity.js";
import {canonicalAllianceAuthorization} from "../lib/alliance-authorization.js";
import {resolveCanonicalIdentity} from "../lib/canonical-alliance-access.js";

const alliance={id:"all4",server_id:"884",tag:"ALL4",owner_player_id:"owner"};
const identity=(name)=>lastWarIdentity({name,server_id:"#884",alliance_tag:"ALL4"});
const membership=(role)=>({alliance_id:"all4",player_id:"account",role});
const authorize=(roster,role="R4",name="Goodmeuh",membershipRole=role)=>canonicalAllianceAuthorization({
  playerId:"account",membership:membership(membershipRole),alliance,
  roster,identity:identity(name)
});

{
  const roster=[{name:"Goodmeuh",server_id:"884",alliance_tag:"ALL4",role:"R4"}];
  const resolved=resolveCanonicalIdentity(roster,{playerId:"account",name:"[ALL4]Goodmeuh",serverId:"#884",allianceTag:"ALL4"});
  assert.equal(resolved.status,"linked_exact");
  assert.equal(resolved.canonical_role,"R4");
  assert.equal(resolved.member.player_id,"account");
  assert.equal(resolved.member.warboost_linked,true);
  const result=authorize(resolved.members,"R4","[ALL4]Goodmeuh");
  assert.equal(result.allowed,true);
  assert.equal(result.reason,"linked_canonical_role_confirmed");
  console.log("PASS: Goodmeuh exact canonical R4 identity links and authorizes");
}

{
  const roster=[{name:"les gladiateurs81",server_id:"884",alliance_tag:"ALL4",role:"R4",player_id:"account",warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"}];
  const resolved=resolveCanonicalIdentity(roster,{playerId:"account",name:"les gladiateurs81",serverId:"884",allianceTag:"ALL4"});
  assert.equal(resolved.status,"linked_existing");
  assert.equal(authorize(resolved.members,"R4","les gladiateurs81").allowed,true);
  console.log("PASS: an already-linked R4 remains authorized");
}

{
  const roster=[{name:"ToyN",server_id:"884",alliance_tag:"ALL4",role:"R4",player_id:"account",warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"}];
  const resolved=resolveCanonicalIdentity(roster,{playerId:"account",name:"[ALL4]ToyN",serverId:"server 884",allianceTag:"ALL4"});
  assert.equal(resolved.status,"linked_existing");
  assert.equal(authorize(resolved.members,"R4","[ALL4]ToyN").allowed,true);
  console.log("PASS: ToyN prefix/server normalization repairs stale access flags");
}

{
  const roster=[{name:"another-player",server_id:"884",alliance_tag:"ALL4",role:"R4"}];
  const resolved=resolveCanonicalIdentity(roster,{playerId:"account",name:"[ALL4]jojoJecaid",serverId:"884",allianceTag:"ALL4"});
  assert.equal(resolved.status,"no_match");
  const result=authorize(resolved.members,"R4","[ALL4]jojoJecaid");
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"canonical_identity_not_found");
  console.log("PASS: absent canonical identity stays blocked despite declared R4");
}

{
  const roster=[{name:"R3Player",server_id:"884",alliance_tag:"ALL4",role:"R3"}];
  const resolved=resolveCanonicalIdentity(roster,{playerId:"account",name:"R3Player",serverId:"884",allianceTag:"ALL4"});
  assert.equal(resolved.status,"linked_exact");
  const result=authorize(resolved.members,"R4","R3Player","R3");
  assert.equal(result.allowed,false);
  assert.equal(result.linked_canonical_role,"R3");
  assert.equal(result.effective_role,"R3");
  console.log("PASS: canonical R3 cannot be promoted by a declared R4");
}

{
  const roster=[{name:"Duplicate",server_id:"884",alliance_tag:"ALL4",role:"R4"},{name:"[ALL4]Duplicate",server_id:"#884",alliance_tag:"ALL4",role:"R4"}];
  const resolved=resolveCanonicalIdentity(roster,{playerId:"account",name:"Duplicate",serverId:"884",allianceTag:"ALL4"});
  assert.equal(resolved.status,"ambiguous");
  assert.equal(authorize(resolved.members,"R4","Duplicate").allowed,false);
  console.log("PASS: ambiguous canonical identity stays blocked");
}

assert.equal(normalizeLastWarNickname("[ALL4]Goodmeuh","ALL4"),normalizeLastWarNickname("Goodmeuh","ALL4"));
console.log("Canonical R4/R5 access verification complete.");