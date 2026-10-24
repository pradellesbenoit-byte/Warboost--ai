import {normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag} from "./alliance-identity.js";
import {normalizeAllianceRank} from "./alliance-rank-management.js";

function clean(v,max=120){return String(v??"").trim().slice(0,max)}
function role(v){return normalizeAllianceRank(v)}
function isManagerRole(value){return ["R4","R5"].includes(role(value))}
function establishedLink(row={}){
  return row?.warboost_linked===true&&["lastwar_nickname_server_alliance","legacy_private_link_preserved"].includes(clean(row?.identity_basis,80));
}
function profileIdentity(identity={}){
  return {name:clean(identity.name,80),server_id:normalizeServerId(identity.server_id),alliance_tag:normalizeAllianceTag(identity.alliance_tag)};
}
function exactIdentityMatches(rows=[],identity={}){
  const current=profileIdentity(identity),nickname=normalizeLastWarNickname(current.name,current.alliance_tag);
  if(!nickname||!current.server_id||!current.alliance_tag)return [];
  return (Array.isArray(rows)?rows:[]).filter(row=>
    normalizeLastWarNickname(row?.name,current.alliance_tag)===nickname&&
    normalizeServerId(row?.server_id)===current.server_id&&
    normalizeAllianceTag(row?.alliance_tag)===current.alliance_tag
  );
}

// One server-side authorization decision shared by roster sync, rank management,
// diagnostics and profile hydration. Client state may explain identity, but never
// grants the role: owner_player_id or a uniquely linked canonical roster row with
// the canonical R4/R5 role are the only manager authorities.
export function canonicalAllianceAuthorization({playerId,membership,alliance,roster=[],identity={}}={}){
  const userId=clean(playerId,120),membershipAlliance=clean(membership?.alliance_id,120),allianceId=clean(alliance?.id,120);
  const owner=Boolean(userId&&clean(alliance?.owner_player_id,120)===userId);
  const membershipRole=role(membership?.role),membershipInAlliance=Boolean(userId&&membershipAlliance&&allianceId&&membershipAlliance===allianceId);
  const rows=Array.isArray(roster)?roster:[];
  const linkedRows=rows.filter(row=>String(row?.player_id||"").trim()===userId);
  const linkedSelf=linkedRows.length===1&&establishedLink(linkedRows[0])?linkedRows[0]:null;
  const exactRows=exactIdentityMatches(rows,identity);
  const exactSelf=exactRows.length===1?exactRows[0]:null;
  const canonicalSelf=linkedSelf||exactSelf;
  const linkedCanonicalRole=role(linkedSelf?.role);
  const linkedCanonicalManager=Boolean(membershipInAlliance&&linkedSelf&&isManagerRole(linkedCanonicalRole));
  const allowed=Boolean(owner||linkedCanonicalManager);
  let reason="not_authorized";
  if(owner)reason="owner_confirmed";
  else if(!membershipInAlliance)reason=membership?"membership_alliance_mismatch":"membership_missing";
  else if(linkedCanonicalManager)reason="linked_canonical_role_confirmed";
  else if(linkedRows.length>1)reason="linked_identity_ambiguous";
  else if(exactRows.length>1)reason="canonical_identity_ambiguous";
  else if(exactRows.length===0)reason="canonical_identity_not_found";
  else if(exactSelf&&String(exactSelf.player_id||"").trim()!==userId)reason="canonical_identity_not_linked";
  else if(exactSelf&&!establishedLink(exactSelf))reason="canonical_identity_not_linked";
  else reason="membership_role_not_manager";
  return {
    allowed,reason,owner,membership_in_alliance:membershipInAlliance,
     membership_role:membershipRole,linked_canonical_role:linkedSelf?linkedCanonicalRole:null,
     effective_role:owner?"R5":(linkedCanonicalManager?linkedCanonicalRole:membershipRole),
    identity:profileIdentity(identity),identity_linked:Boolean(linkedSelf),
    identity_match:Boolean(canonicalSelf),linked_rows:linkedRows.length,exact_rows:exactRows.length,
    canonical_member:canonicalSelf?{name:canonicalSelf.name,server_id:canonicalSelf.server_id,alliance_tag:canonicalSelf.alliance_tag,role:role(canonicalSelf.role),player_id:canonicalSelf.player_id||null}:null
  };
}

export function authorizationMessage(auth={},fallback="Accès R4/R5 ou owner confirmé requis."){
  const messages={
    membership_missing:"Aucune adhésion canonique à cette alliance n’est liée à l’utilisateur authentifié.",
    membership_alliance_mismatch:"L’adhésion canonique ne correspond pas à l’alliance ciblée.",
    membership_role_not_manager:"L’adhésion canonique de l’utilisateur authentifié n’est pas R4/R5.",
    canonical_identity_not_found:"Aucune ligne canonique ne correspond exactement au pseudo, serveur et alliance.",
    canonical_identity_not_linked:"La ligne Last War correspondante n’est pas liée à l’utilisateur authentifié.",
    canonical_identity_ambiguous:"Plusieurs lignes Last War correspondent à l’identité authentifiée.",
    linked_identity_ambiguous:"Plusieurs lignes canoniques sont liées à l’utilisateur authentifié."
  };
  return messages[auth?.reason]||fallback;
}