import {profileIdentity,validPlayerIdentity,samePlayerIdentity} from "./identity-onboarding.js";
import {normalizeAllianceTag,normalizeServerId,normalizeLastWarNickname} from "./alliance-identity.js";

function failure(code,status=409,extra={}){
  return Object.assign(new Error(code),{code,status,...extra});
}

// Only this account's verified membership/ownership can constrain its identity.
export function authoritativePlayerIdentity(context,userId){
  const alliance=context?.alliance;
  if(!alliance||!(context.membership||String(alliance.owner_player_id||"")===userId))return {};
  const linked=(alliance.roster||[]).filter(row=>String(row.player_id||"")===userId&&
    row.warboost_linked===true&&["lastwar_nickname_server_alliance","legacy_private_link_preserved"].includes(row.identity_basis));
  if(linked.length>1)throw failure("IDENTITY_AMBIGUOUS");
  return {
    ...(linked[0]?.name?{name:String(linked[0].name).trim()}:{}),
    ...(normalizeServerId(alliance.server_id)?{server_id:normalizeServerId(alliance.server_id)}:{}),
    ...(normalizeAllianceTag(alliance.tag)?{alliance_tag:normalizeAllianceTag(alliance.tag)}:{})
  };
}

export function createIdentityOnboardingService(deps){
  const claims=new Map();
  async function read(userId){
    const [profile,context]=await Promise.all([deps.getProfile(userId),deps.getAllianceRoster(userId)]);
    if(profile?.state?.player_id&&String(profile.state.player_id)!==userId)throw failure("IDENTITY_OWNER_MISMATCH",403);
    let ownContext=context;
    if(!ownContext){
      const owned=await deps.getOwnedAlliance(userId);
      if(owned)ownContext={alliance:owned,membership:null};
    }
    const authority=authoritativePlayerIdentity(ownContext,userId);
    return {state:profile?.state||null,updated_at:profile?.updated_at||null,
      identity:{...profileIdentity(profile?.state||{}),...authority},authority,context:ownContext};
  }

  async function saveIdentity(userId,input={},expectedUpdatedAt){
    if(!validPlayerIdentity(input))throw failure("IDENTITY_INVALID",400);
    const candidate={name:String(input.name).trim(),server_id:normalizeServerId(input.server_id),
      alliance_tag:normalizeAllianceTag(input.alliance_tag)};
    const current=await read(userId);
    if(expectedUpdatedAt!==undefined&&expectedUpdatedAt!==current.updated_at)throw failure("profile_write_conflict");
    for(const [key,value] of Object.entries(current.authority)){
      const equal=key==="name"?normalizeLastWarNickname(candidate.name,candidate.alliance_tag)===normalizeLastWarNickname(value,candidate.alliance_tag):candidate[key]===value;
      if(!equal)throw failure("IDENTITY_AUTHORITY_CONFLICT",409,{authority:current.authority});
    }
    const alliances=await deps.findAllianceByScope(candidate.server_id,candidate.alliance_tag);
    if(alliances.length>1)throw failure("IDENTITY_AMBIGUOUS");
    const roster=alliances[0]?.roster||[];
    const matching=roster.filter(row=>!row.__warboost_type&&samePlayerIdentity({
      name:row.name,server_id:row.server_id||candidate.server_id,
      alliance_tag:row.alliance_tag||candidate.alliance_tag
    },candidate));
    if(matching.length>1)throw failure("IDENTITY_AMBIGUOUS");
    if(matching.some(row=>row.player_id&&String(row.player_id)!==userId))throw failure("IDENTITY_DUPLICATE");
    const profiles=await deps.findProfilesByIdentityScope(candidate.server_id,candidate.alliance_tag);
    if(profiles.some(row=>String(row.player_id)!==userId&&samePlayerIdentity(profileIdentity(row.state),candidate)))
      throw failure("IDENTITY_DUPLICATE");
    const now=new Date().toISOString(),base=current.state||{};
    // Patch the existing authenticated row, never another account or the canonical roster.
    const next={...base,player_id:userId,updated_at:now,
      player:{...(base.player||{}),name:current.authority.name||candidate.name,server_id:candidate.server_id,updated_at:now},
      alliance:{...(base.alliance||{}),tag:candidate.alliance_tag,server_id:candidate.server_id}};
    const saved=await deps.saveProfileIfUnchanged(userId,next,current.updated_at);
    if(!saved?.state||!saved?.updated_at)throw failure("IDENTITY_CHECK_UNAVAILABLE",503);
    return {state:saved.state,updated_at:saved.updated_at,identity:profileIdentity(saved.state)};
  }
  async function complete(userId,input={},expectedUpdatedAt){
    if(!validPlayerIdentity(input))throw failure("IDENTITY_INVALID",400);
    const key=JSON.stringify([normalizeServerId(input.server_id),normalizeAllianceTag(input.alliance_tag),
      normalizeLastWarNickname(input.name,input.alliance_tag)]);
    // Serialize competing claims within this worker, then re-read cloud evidence.
    // This is not a substitute for a distributed database uniqueness constraint.
    const previous=claims.get(key)||Promise.resolve();
    let release;
    const pending=new Promise(resolve=>{release=resolve});
    const queued=previous.then(()=>pending);
    claims.set(key,queued);
    await previous;
    try{return await saveIdentity(userId,input,expectedUpdatedAt)}
    finally{release();if(claims.get(key)===queued)claims.delete(key)}
  }
  return {read,complete};
}