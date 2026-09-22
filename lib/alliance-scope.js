import {lastWarIdentity,normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag,backfillRosterIdentityContext} from './alliance-identity.js';
import {mergeActivityEvents} from './activity-events.js';
import {normalizeEventAvailabilities,mergeEventAvailabilities,mergeAvailabilityHistory} from './event-availability.js';
import {preferredRankEvidence,rankConfirmationStatus} from './rank-provenance.js';

function clean(v,max=120){return String(v??'').trim().slice(0,max)}
function normalizedRoleValue(v){
  const raw=clean(v,32).toUpperCase(),compact=raw.replace(/[\s_-]+/g,"");
  if(/^R[1-5]$/.test(compact))return compact;
  const legacy=compact.match(/^(?:ROLE|RANK|RANG)R?([1-5])$/);
  if(legacy)return `R${legacy[1]}`;
  if(raw==="PLAYER"||raw==="JOUEUR")return "R1";
  return "R1";
}
function role(v){return normalizedRoleValue(v)}
function roleOrNull(v){
  const raw=clean(v,32).toUpperCase(),compact=raw.replace(/[\s_-]+/g,"");
  if(/^R[1-5]$/.test(compact))return compact;
  const legacy=compact.match(/^(?:ROLE|RANK|RANG)R?([1-5])$/);
  return legacy?`R${legacy[1]}`:null;
}
function positiveNumberOrNull(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>0?n:null}
export function isManagerRole(v){return ['R4','R5'].includes(role(v))}
function confirmedRankAt(v){const n=Date.parse(v?.rank_confirmed_at||"");return Number.isFinite(n)?n:0}

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
    ...safeCanonicalRosterFields(m),
    name:clean(m?.name,80),
    server_id:normalizeServerId(m?.server_id)||server_id,
    alliance_tag:normalizeAllianceTag(m?.alliance_tag)||alliance_tag,
    // Null means unknown. Do not silently turn a missing rank into an asserted R1 here;
    // callers that need an effective role already use role(), which safely falls back to R1.
    role:roleOrNull(m?.role),
    hq_level:positiveNumberOrNull(m?.hq_level),
    power_m:positiveNumberOrNull(m?.power_m),
    activity_events:mergeActivityEvents(m?.activity_events),
    event_availability:normalizeEventAvailabilities(m?.event_availability),
    availability_history:mergeAvailabilityHistory(m?.availability_history),
    updated_at:m?.updated_at||null
  })).map(m=>({...m,canonical_member_key:m.canonical_member_key||`canonical:${normalizeLastWarNickname(m.name)}|${m.server_id}|${m.alliance_tag}`})).filter(m=>m.name&&m.server_id===server_id&&m.alliance_tag===alliance_tag);
}

function mergeCanonicalMember(old,m){
  const rankWinner=preferredRankEvidence(old,m);
  return {
    ...old,
    ...m,
    ...(rankWinner||{}),
    player_id:old?.player_id||m?.player_id||null,
    warboost_linked:old?.warboost_linked===true||m?.warboost_linked===true,
    identity_basis:old?.identity_basis||m?.identity_basis||null,
    identity_linked_at:old?.identity_linked_at||m?.identity_linked_at||null,
    role:rankWinner?.role||m?.role||old?.role||null,
    rank_confirmation_status:rankConfirmationStatus(rankWinner),
    hq_level:m?.hq_level??old?.hq_level??null,
    power_m:m?.power_m??old?.power_m??null,
    activity_events:mergeActivityEvents(old?.activity_events,m?.activity_events),
    event_availability:mergeEventAvailabilities(old?.event_availability,m?.event_availability),
    availability_history:mergeAvailabilityHistory(old?.availability_history,m?.availability_history),
    updated_at:m?.updated_at||old?.updated_at||null
  };
}

const CANONICAL_ROSTER_FIELDS=["canonical_member_key","player_id","warboost_linked","identity_basis","identity_linked_at","management_role","membership_status","joined_at","returned_at","left_at","missing_from_snapshot_at","membership_history","rank_confirmed_at","rank_confirmed_source","rank_confirmation_status","source","delta_m","squad_power_m","squad_id","squad_type","squad_heroes","squad_profile_updated_at","drone_level","drone_power_m","squad_power_updated_at","vs_points","season_points","contribution","last_active_at","event_availability","availability_history"];
function safeCanonicalRosterFields(row={}){
  const safe={};
  for(const field of CANONICAL_ROSTER_FIELDS)if(row[field]!==undefined)safe[field]=row[field];
  return safe;
}

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
      else out.push(m);
      continue;
    }
    const idx=idxs[0],old=out[idx];
    out[idx]=mergeCanonicalMember(old,m);
  }
  return out.slice(0,200);
}

export function replaceCanonicalRosterFromCompleteSnapshot(existingRows,incomingRows,{serverId,allianceTag}={}){
  const server_id=normalizeServerId(serverId),alliance_tag=normalizeAllianceTag(allianceTag);
  const existing=sanitizeCanonicalRoster(existingRows,{serverId:server_id,allianceTag:alliance_tag});
  const incoming=sanitizeCanonicalRoster(incomingRows,{serverId:server_id,allianceTag:alliance_tag});
  const byKey=new Map();
  for(const old of existing){const key=`${normalizeLastWarNickname(old.name)}|${old.server_id}|${old.alliance_tag}`;if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(old)}
  const out=[];
  for(const row of incoming){
    const key=`${normalizeLastWarNickname(row.name)}|${row.server_id}|${row.alliance_tag}`,matches=byKey.get(key)||[];
    const old=matches.length===1?matches[0]:null;
    out.push(old?mergeCanonicalMember(old,row):row);
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
