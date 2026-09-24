import assert from "node:assert/strict";
import {normalizeUnlinkedAccounts,rebuildCanonicalPendingAccounts} from "../lib/alliance-identity.js";
import {invalidatePendingAccountCacheState} from "../lib/pending-account-cache.js";
import {normalizeState} from "../lib/normalize.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";
import {mergeCloudRosterWithIdentity} from "../lib/alliance-roster-merge.js";

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

const canonicalIdentity=normalizeUnlinkedAccounts([
  {name:"Jojolecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}
],[{...canonical,player_id:null}],{serverId:"884",allianceTag:"ALL4"});
assert.equal(canonicalIdentity.length,0,"an exact canonical identity is not pending when its roster row is linked");

const rememberedAlias=normalizeUnlinkedAccounts([
  {name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}
],[canonical],{serverId:"884",allianceTag:"ALL4",currentPlayerId:playerId,currentPlayerName:"Jojolecaid",currentPlayerAliases:["jojoJecaid"]});
assert.equal(rememberedAlias.length,0,"a verified previous local name is cleared only after the current account is linked");

const otherAccountAlias=normalizeUnlinkedAccounts([
  {player_id:"another-warboost-account",name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}
],[canonical],{serverId:"884",allianceTag:"ALL4",currentPlayerId:playerId,currentPlayerName:"Jojolecaid",currentPlayerAliases:["jojoJecaid"]});
assert.equal(otherAccountAlias.length,1,"a different pending account must not be hidden by a self-name alias");

const serverMerge=mergeCloudRosterWithIdentity([{...canonical,power_m:287}],[
  {player_id:playerId,name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",role:"R4",power_m:271}
],{serverId:"884",allianceTag:"ALL4"});
assert.equal(serverMerge.unlinked_accounts.length,0,"server reconciliation must not regenerate a pending row from a stale nickname for an already linked ID");
assert.equal(serverMerge.roster[0].warboost_linked,true,"the existing canonical link remains active");
assert.equal(serverMerge.roster[0].name,"Jojolecaid","the stale cloud nickname must not replace the canonical roster name");
assert.equal(serverMerge.roster[0].power_m,287,"the canonical roster's real player data is preserved");

const serverMergeWithoutId=mergeCloudRosterWithIdentity([{...canonical}],[
  {name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",role:"R4"}
],{serverId:"884",allianceTag:"ALL4"});
assert.equal(serverMergeWithoutId.unlinked_accounts.length,1,"an old nickname without a linked player ID remains pending unless an exact alias is available");

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

const hydratedFromAliasCache=hydrateCloudState({
  player_id:playerId,
  player:{name:"Jojolecaid",server_id:"884"},
  alliance:{server_id:"884",tag:"ALL4",members:[canonical],unlinked_accounts:[{name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}]}
},{player_id:playerId,player:{name:"jojoJecaid",server_id:"884"},alliance:{server_id:"884",tag:"ALL4",members:[],unlinked_accounts:[]}},playerId);
assert.equal(hydratedFromAliasCache.alliance.unlinked_accounts.length,0,"a verified local alias clears an obsolete cloud pending row");

const cloudWithoutQueue=hydrateCloudState({
  player_id:playerId,
  player:{name:"Jojolecaid",server_id:"884"},
  alliance:{server_id:"884",tag:"ALL4",members:[canonical]}
},{player_id:playerId,player:{name:"Jojolecaid",server_id:"884"},alliance:{server_id:"884",tag:"ALL4",unlinked_accounts:[{name:"OldCachedPending",server_id:"884",alliance_tag:"ALL4"}]}},playerId);
assert.equal(cloudWithoutQueue.alliance.unlinked_accounts.length,0,"an omitted cloud queue must not fall back to an older browser cache");

const canonicalQueue=rebuildCanonicalPendingAccounts({
  player_id:playerId,
  player:{name:"Jojolecaid",server_id:"884"},
  alliance:{
    server_id:"884",tag:"ALL4",members:[canonical],
    unlinked_accounts:[
      {player_id:playerId,name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4",reason:"no_match"},
      {player_id:"another-player",name:"OtherPending",server_id:"884",alliance_tag:"ALL4",reason:"no_match"}
    ]
  }
},{currentPlayerAliases:["jojoJecaid"]});
assert.deepEqual(canonicalQueue.map(account=>account.name),["OtherPending"],"canonical reconstruction drops linked stale rows but keeps genuinely unlinked accounts");

const preservedData={
  player:{name:"Jojolecaid",server_id:"884"},
  scans:[{id:"scan-1"}],
  squads:[{id:1,heroes:["Kimberly"]}],
  activity_events:[{id:"event-1"}],
  settings:{voice_enabled:true},
  alliance:{members:[canonical],unlinked_accounts:[{name:"jojoJecaid",server_id:"884",alliance_tag:"ALL4"}],desert_storm:{team:"A"}}
};
const invalidatedCache=invalidatePendingAccountCacheState(preservedData);
assert.equal(invalidatedCache.changed,true,"a stale pending cache is invalidated");
assert.deepEqual(invalidatedCache.value.alliance.unlinked_accounts,[]);
for(const key of ["player","scans","squads","activity_events","settings"])assert.deepEqual(invalidatedCache.value[key],preservedData[key],`${key} data survives pending-cache invalidation`);
assert.deepEqual(invalidatePendingAccountCacheState(invalidatedCache.value).changed,false,"cache invalidation is idempotent");
const invalidatedBackup=invalidatePendingAccountCacheState({saved_at:"now",state:preservedData},{nestedState:true});
assert.deepEqual(invalidatedBackup.value.state.alliance.unlinked_accounts,[],"nested last-good state cache is invalidated");
assert.deepEqual(invalidatedBackup.value.saved_at,"now","backup metadata is preserved");

console.log("Linked WarBoost account pending-state verification: PASS");