import assert from "node:assert/strict";
import {normalizeUnlinkedAccounts} from "../lib/alliance-identity.js";
import {normalizeState} from "../lib/normalize.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";

const playerId="58e94da0-3b13-49b5-b526-0e89ed9b30eb";
const canonical={player_id:playerId,name:"Jojolecaid",role:"R4",server_id:"884",alliance_tag:"ALL4",warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"};

const linkedById=normalizeUnlinkedAccounts([
  {player_id:playerId,name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}
],[canonical],{serverId:"884",allianceTag:"ALL4"});
assert.equal(linkedById.length,0,"a linked player_id must never remain pending");

const legacySelf=normalizeUnlinkedAccounts([
  {name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}
],[canonical],{serverId:"884",allianceTag:"ALL4",currentPlayerId:playerId,currentPlayerName:"jojoJecaid",identityLinkStatus:"linked_existing"});
assert.equal(legacySelf.length,0,"legacy current-account pending rows must be purged after linked_existing");

const otherScope=normalizeUnlinkedAccounts([
  {player_id:playerId,name:"Jojolecaid",server_id:"999",alliance_tag:"ALL4",reason:"context_conflict"}
],[canonical],{serverId:"884",allianceTag:"ALL4"});
assert.equal(otherScope.length,0,"a linked player_id must be cleared even when the local scope is stale");

const normalized=normalizeState({
  player_id:playerId,
  player:{name:"jojoJecaid",server_id:"884"},
  alliance:{
    server_id:"884",
    tag:"ALL4",
    identity_link_status:"linked_existing",
    members:[canonical],
    unlinked_accounts:[{name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}]
  }
});
assert.equal(normalized.player.name,"jojoJecaid","normalization alone does not invent a canonical self name");
assert.equal(normalized.alliance.unlinked_accounts.length,0);
assert.equal(normalized.alliance.members[0].name,"Jojolecaid");

const hydrated=hydrateCloudState({
  player_id:playerId,
  player:{name:"jojoJecaid",server_id:"884"},
  alliance:{
    server_id:"884",
    tag:"ALL4",
    identity_link_status:"linked_existing",
    members:[canonical],
    unlinked_accounts:[{name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}]
  }
},{alliance:{members:[],unlinked_accounts:[]}},playerId);
assert.equal(hydrated.alliance.unlinked_accounts.length,0);
assert.equal(hydrated.alliance.members[0].name,"Jojolecaid");
assert.equal(hydrated.player.name,"Jojolecaid");

console.log("Linked WarBoost account pending-state verification: PASS");