import {linkCurrentPlayerIdentityIntoRoster,normalizeServerId,normalizeAllianceTag} from "./alliance-identity.js";
import {normalizeAllianceRank} from "./alliance-rank-management.js";

export function resolveCanonicalIdentity(rows,{playerId,name,serverId,allianceTag,role:accountRole,rank,rank_confirmed_source,rank_confirmed_at,activityEvents,updatedAt}={}){
  const server=normalizeServerId(serverId),tag=normalizeAllianceTag(allianceTag);
  const linked=linkCurrentPlayerIdentityIntoRoster(rows,{playerId,name,serverId:server,allianceTag:tag,role:accountRole,rank,rank_confirmed_source,rank_confirmed_at,activityEvents,updatedAt});
  const member=linked.matched_index>=0?linked.members[linked.matched_index]||null:null;
  const role=member?normalizeAllianceRank(member.role):null;
  return {
    ...linked,
    member,
    canonical_role:role,
    canonical_manager:Boolean(role&&["R4","R5"].includes(role)),
    persist_link:["linked_exact","linked_tolerant"].includes(linked.status)
  };
}

export function canonicalMembershipNeedsRepair(membership,allianceId,playerId,canonicalRole){
  return Boolean(canonicalRole&&playerId&&allianceId&&(
    !membership||
    String(membership.alliance_id||"")!==String(allianceId)||
    String(membership.player_id||"")!==String(playerId)||
    normalizeAllianceRank(membership.role)!==canonicalRole
  ));
}