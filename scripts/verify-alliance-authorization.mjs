import assert from "node:assert/strict";
import {canonicalAllianceAuthorization} from "../lib/alliance-authorization.js";

const alliance={id:"alliance-1",owner_player_id:"owner-1",server_id:"123",tag:"WB"};
const identity={name:"Captain Alpha",server_id:"123",alliance_tag:"WB"};
const linkedManager={name:"Captain Alpha",server_id:"123",alliance_tag:"WB",player_id:"manager-1",warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance",role:"R4"};

{
  const result=canonicalAllianceAuthorization({
    playerId:"manager-1",
    membership:{alliance_id:"alliance-1",role:"R4"},
    alliance,
    roster:[{name:"Other",server_id:"123",alliance_tag:"WB",role:"R1"}],
    identity
  });
  assert.equal(result.allowed,true,"a canonical R4 membership may sync a snapshot that omits the manager row");
  assert.equal(result.reason,"membership_role_confirmed");
}

{
  const result=canonicalAllianceAuthorization({
    playerId:"manager-1",
    membership:{alliance_id:"alliance-1",role:"R1"},
    alliance,
    roster:[linkedManager],
    identity
  });
  assert.equal(result.allowed,true,"a linked canonical R4 may repair a lagging membership role");
  assert.equal(result.reason,"linked_canonical_role_confirmed");
}

{
  const result=canonicalAllianceAuthorization({
    playerId:"attacker-1",
    membership:{alliance_id:"alliance-1",role:"R1"},
    alliance,
    roster:[{...linkedManager,player_id:null,warboost_linked:false,identity_basis:null}],
    identity
  });
  assert.equal(result.allowed,false,"an unlinked R4 row must not grant access to an R1 account");
  assert.equal(result.reason,"canonical_identity_not_linked");
}

{
  const result=canonicalAllianceAuthorization({
    playerId:"owner-1",
    membership:{alliance_id:"alliance-1",role:"R1"},
    alliance,
    roster:[],
    identity:{}
  });
  assert.equal(result.allowed,true,"the authenticated owner is authorized independently of a roster snapshot");
  assert.equal(result.reason,"owner_confirmed");
}

{
  const result=canonicalAllianceAuthorization({
    playerId:"manager-1",
    membership:{alliance_id:"other-alliance",role:"R5"},
    alliance,
    roster:[linkedManager],
    identity
  });
  assert.equal(result.allowed,false,"a manager role from another alliance must not authorize this scope");
  assert.equal(result.reason,"membership_alliance_mismatch");
}

console.log("PASS: canonical roster authorization accepts owner/R4/R5 authority, handles stale membership safely, and rejects unlinked self-promotion");