import {lastWarIdentity,normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag,backfillRosterIdentityContext} from './alliance-identity.js';
import {mergeActivityEvents} from './activity-events.js';

function clean(v,max=120){return String(v??'').trim().slice(0,max)}
function role(v){const r=clean(v,8).toUpperCase();return /^R[1-5]$/.test(r)?r:'R1'}
export function isManagerRole(v){return ['R4','R5'].includes(role(v))}

export function allianceScopeFromState(state={}){
  const identity=lastWarIdentity({nickname:state?.player?.name,server_id:state?.player?.server_id,alliance_tag:state?.alliance?.tag});
  return {nickname:identity.nickname,nickname_key:identity.nickname_key,server_id:identity.server_id,alliance_tag:identity.alliance_tag};
}

export function strictRosterIdentityCandidates(rows,identityInput={}){
  const identity=lastWarIdentity(identityInput);
  if(!identity.nickname_key||!identity.server_id||!identity.alliance_tag)return [];
  return (Array.isArray(rows)?rows:[]).map((member,index)=>({member,index})).filter(({member})=>
    normalizeLastWarNickname(member?.name)===identity.nickname_key &&
    normalizeServerId(member?.server_id)===identity.server_id &&
    normalizeAllianceTag(member?.alliance_tag)===identity.alliance_tag
  );
}

export function sanitizeCanonicalRoster(rows,{serverId,allianceTag}={}){
  const server_id=normalizeServerId(serverId),alliance_tag=normalizeAllianceTag(allianceTag);
  const contextual=backfillRosterIdentityContext(Array.isArray(rows)?rows:[],{serverId:server_id,allianceTag:alliance_tag});
  return contextual.slice(0,200).map(m=>({
    name:clean(m?.name,80),
    server_id:normalizeServerId(m?.server_id)||server_id,
    alliance_tag:normalizeAllianceTag(m?.alliance_tag)||alliance_tag,
    role:role(m?.role),
    hq_level:Number.isFinite(Number(m?.hq_level))?Number(m.hq_level):null,
    power_m:Number.isFinite(Number(m?.power_m))?Number(m.power_m):null,
    activity_events:mergeActivityEvents(m?.activity_events),
    updated_at:m?.updated_at||null
  })).filter(m=>m.name&&m.server_id===server_id&&m.alliance_tag===alliance_tag);
}

// Merge canonical roster refreshes without losing participation evidence recorded by another
// R5/R4 or by a linked WarBoost member. Exact identity remains nickname + server + alliance;
// private account ids/e-mails are intentionally never stored in this canonical admission list.
export function mergeCanonicalRoster(existingRows,incomingRows,{serverId,allianceTag}={}){
  const server_id=normalizeServerId(serverId),alliance_tag=normalizeAllianceTag(allianceTag);
  const existing=sanitizeCanonicalRoster(existingRows,{serverId:server_id,allianceTag:alliance_tag});
  const incoming=sanitizeCanonicalRoster(incomingRows,{serverId:server_id,allianceTag:alliance_tag});
  const out=existing.map(m=>({...m,activity_events:mergeActivityEvents(m.activity_events)}));
  const byKey=new Map();
  for(let i=0;i<out.length;i++){
    const key=`${normalizeLastWarNickname(out[i].name)}|${out[i].server_id}|${out[i].alliance_tag}`;
    if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(i);
  }
  for(const m of incoming){
    const key=`${normalizeLastWarNickname(m.name)}|${m.server_id}|${m.alliance_tag}`,idxs=byKey.get(key)||[];
    if(idxs.length!==1){
      if(idxs.length===0){out.push(m);byKey.set(key,[out.length-1])}
      else out.push(m); // preserve ambiguity so admission fails closed instead of guessing
      continue;
    }
    const idx=idxs[0],old=out[idx];
    out[idx]={...old,...m,activity_events:mergeActivityEvents(old.activity_events,m.activity_events),updated_at:m.updated_at||old.updated_at||null};
  }
  return out.slice(0,200);
}

export function managerProofFromState(state={}){
  const scope=allianceScopeFromState(state);
  if(!scope.nickname_key)return {ok:false,code:'lastwar_nickname_required',scope,candidates:[]};
  if(!scope.server_id)return {ok:false,code:'lastwar_server_required',scope,candidates:[]};
  if(!scope.alliance_tag)return {ok:false,code:'lastwar_alliance_required',scope,candidates:[]};
  const roster=sanitizeCanonicalRoster(state?.alliance?.members,{serverId:scope.server_id,allianceTag:scope.alliance_tag});
  const candidates=strictRosterIdentityCandidates(roster,{nickname:scope.nickname,server_id:scope.server_id,alliance_tag:scope.alliance_tag});
  if(candidates.length===0)return {ok:false,code:'manager_roster_match_required',scope,roster,candidates};
  if(candidates.length>1)return {ok:false,code:'alliance_roster_identity_ambiguous',scope,roster,candidates};
  const roster_role=role(candidates[0].member?.role);
  if(!isManagerRole(roster_role))return {ok:false,code:'manager_roster_role_required',scope,roster,candidates,roster_role};
  return {ok:true,scope,roster,candidates,roster_role,member:candidates[0].member};
}

export function joinProofForAlliance(state={},alliance={}){
  const scope=allianceScopeFromState(state),targetServer=normalizeServerId(alliance?.server_id),targetTag=normalizeAllianceTag(alliance?.tag);
  if(!scope.nickname_key)return {ok:false,code:'lastwar_nickname_required',scope};
  if(!scope.server_id)return {ok:false,code:'lastwar_server_required',scope};
  if(!scope.alliance_tag)return {ok:false,code:'lastwar_alliance_required',scope};
  if(!targetServer)return {ok:false,code:'alliance_scope_not_ready',scope};
  if(scope.server_id!==targetServer)return {ok:false,code:'alliance_server_mismatch',scope};
  if(scope.alliance_tag!==targetTag)return {ok:false,code:'alliance_tag_mismatch',scope};
  const roster=sanitizeCanonicalRoster(alliance?.roster,{serverId:targetServer,allianceTag:targetTag});
  if(!roster.length)return {ok:false,code:'alliance_roster_not_ready',scope,roster};
  const candidates=strictRosterIdentityCandidates(roster,{nickname:scope.nickname,server_id:scope.server_id,alliance_tag:scope.alliance_tag});
  if(candidates.length===0)return {ok:false,code:'player_not_in_alliance_roster',scope,roster,candidates};
  if(candidates.length>1)return {ok:false,code:'alliance_roster_identity_ambiguous',scope,roster,candidates};
  const roster_role=role(candidates[0].member?.role);
  return {ok:true,scope,roster,candidates,roster_role,member:candidates[0].member};
}

export function publicAllianceScope(alliance={}){
  return {id:alliance?.id||null,tag:normalizeAllianceTag(alliance?.tag),name:clean(alliance?.name,80),server_id:normalizeServerId(alliance?.server_id),invite_code:clean(alliance?.invite_code,40).toUpperCase(),owner_player_id:alliance?.owner_player_id||null,roster_updated_at:alliance?.roster_updated_at||null,updated_at:alliance?.updated_at||null};
}
