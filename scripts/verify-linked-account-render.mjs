import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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

const staleExactIdentityWithoutId=normalizeUnlinkedAccounts([{
  name:"Jojolecaid",
  server_id:"884",
  alliance_tag:"ALL4",
  reason:"no_match"
}],canonicalRoster,{serverId:"884",allianceTag:"ALL4"});
assert.deepEqual(staleExactIdentityWithoutId,[],"the rank-panel count excludes an exact linked nickname/scope even when the old row has no ID");

const stalePreviousName=normalizeUnlinkedAccounts([{
  name:"jojoJecaid",
  server_id:"884",
  alliance_tag:"ALL4",
  reason:"no_match"
}],canonicalRoster,{serverId:"884",allianceTag:"ALL4",currentPlayerId:jojoPlayerId,currentPlayerName:"Jojolecaid",currentPlayerAliases:["jojoJecaid"]});
assert.deepEqual(stalePreviousName,[],"the previous exact name is cleared within the linked player's scope");

const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
assert.match(app,/function normalizeAndPersistPendingAccounts\(members\)/,"both identity summaries share a persistent queue-normalization path");
assert.match(app,/saveState\(\{renderUi:false\}\)/,"queue cleanup is written to the main, backup, and account-local state");
assert.match(app,/const pending=normalizeAndPersistPendingAccounts\(rows\)/,"the R4/R5 association summary uses the normalized queue for its count");

console.log("Linked account render regression verification: PASS");