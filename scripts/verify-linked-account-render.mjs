import assert from "node:assert/strict";
import {normalizeUnlinkedAccounts} from "../lib/alliance-identity.js";

const jojoPlayerId="58e94da0-3b13-49b5-b526-0e89ed9b30eb";
const canonicalRoster=[{
  name:"Jojolecaid",
  role:"R4",
  server_id:"884",
  alliance_tag:"ALL4",
  player_id:jojoPlayerId,
  warboost_linked:true,
  identity_basis:"lastwar_nickname_server_alliance"
}];

const staleJojolecaid=normalizeUnlinkedAccounts([{
  name:"jojoJecaid",
  server_id:"999",
  alliance_tag:"OLD",
  player_id:jojoPlayerId,
  reason:"no_match"
}],canonicalRoster,{
  serverId:"884",
  allianceTag:"ALL4",
  currentPlayerId:jojoPlayerId,
  currentPlayerName:"jojoJecaid",
  identityLinkStatus:"linked_existing"
});
assert.deepEqual(staleJojolecaid,[]);

const realPendingId="player-not-linked";
const realPending=normalizeUnlinkedAccounts([{
  name:"OtherWarBoost",
  server_id:"884",
  alliance_tag:"ALL4",
  player_id:realPendingId,
  reason:"no_match"
}],canonicalRoster,{
  serverId:"884",
  allianceTag:"ALL4",
  currentPlayerId:jojoPlayerId,
  currentPlayerName:"Jojolecaid",
  identityLinkStatus:"linked_existing"
});
assert.equal(realPending.length,1);
assert.equal(realPending[0].name,"OtherWarBoost");
assert.equal(realPending[0].player_id,realPendingId);

const staleWithoutId=normalizeUnlinkedAccounts([{
  name:"jojoJecaid",
  server_id:"884",
  alliance_tag:"ALL4",
  reason:"no_match"
}],canonicalRoster,{
  serverId:"884",
  allianceTag:"ALL4",
  currentPlayerId:jojoPlayerId,
  currentPlayerName:"jojoJecaid",
  identityLinkStatus:"linked_existing"
});
assert.deepEqual(staleWithoutId,[]);

console.log("Linked account render regression verification: PASS");