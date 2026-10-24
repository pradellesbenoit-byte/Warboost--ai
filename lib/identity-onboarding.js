import {normalizeServerId,normalizeAllianceTag,normalizeLastWarNickname} from "./alliance-identity.js";

export function profileIdentity(state={}){
  return {
    name:String(state.player?.name||"").trim(),
    server_id:normalizeServerId(state.player?.server_id||state.alliance?.server_id||""),
    alliance_tag:normalizeAllianceTag(state.alliance?.tag||"")
  };
}

export function validPlayerIdentity(input={}){
  const name=String(input.name||"").trim(),server=String(input.server_id||"").trim();
  const tag=normalizeAllianceTag(input.alliance_tag);
  return Boolean(name&&name.length<=80&&normalizeLastWarNickname(name,tag)&&!/[\u0000-\u001f\u007f]/u.test(name)&&
    /^\d{1,20}$/.test(server)&&!/^0+$/.test(server)&&
    tag&&tag.length<=16&&!/[\s\[\]\u0000-\u001f\u007f]/u.test(tag)&&!/^[-—?]+$/.test(tag));
}

export function samePlayerIdentity(a,b){
  return normalizeServerId(a?.server_id)===normalizeServerId(b?.server_id)&&
    normalizeAllianceTag(a?.alliance_tag)===normalizeAllianceTag(b?.alliance_tag)&&
    normalizeLastWarNickname(a?.name,a?.alliance_tag)===normalizeLastWarNickname(b?.name,b?.alliance_tag);
}

export function identityOnboardingRequired(context={}){
  return Boolean(context.userId&&context.userId===context.ownerId&&context.betaAllowed&&
    context.consentAccepted&&!validPlayerIdentity(context.identity));
}

/** Identity completion is not a gameplay merge or a rank confirmation. */
export function applyIdentityProfile(current,result,{saved=false,preserveRank=false}={}){
  const incoming=result.state||{},identity=saved?result.identity:profileIdentity(incoming);
  const next={...current,player:{...current.player},alliance:{...current.alliance}};
  if(saved||!String(next.player.name||"").trim())next.player.name=identity.name||"";
  if(saved||!next.player.server_id)next.player.server_id=identity.server_id||"";
  if(saved||!next.alliance.tag)next.alliance.tag=identity.alliance_tag||"";
  if(saved||!next.alliance.server_id)next.alliance.server_id=identity.server_id||"";
  // An unconfirmed R1 placeholder is not evidence against a saved declared grade.
  // Never alter rank provenance or cloud management/authorization flags here.
  const hasRankEvidence=preserveRank||next.player.rank_confirmed_at||next.player.rank_confirmed_source||
    next.player.field_updated_at?.role||next.player.field_source?.role||
    next.player.role_confirmation_status==="confirmed";
  if(!hasRankEvidence&&(!next.player.role||next.player.role==="R1")&&/^R[1-5]$/.test(incoming.player?.role||""))
    next.player.role=incoming.player.role;
  if(!next.alliance.management_verified&&!next.alliance.cloud_role_verified&&
    (!next.alliance.role||next.alliance.role==="R1")&&/^R[1-5]$/.test(incoming.alliance?.role||""))
    next.alliance.role=incoming.alliance.role;
  return next;
}