import {mergeActivityEvents} from './activity-events.js';
import {backfillRosterIdentityContext,identityCandidates,lastWarIdentity,linkCurrentPlayerIdentityIntoRoster,sanitizeUnlinkedAccount} from './alliance-identity.js';

function cloudIdentityReady(m){
  const id=lastWarIdentity({name:m?.name,server_id:m?.server_id,alliance_tag:m?.alliance_tag});
  return Boolean(id.nickname_key&&id.server_id&&id.alliance_tag&&String(m?.name||'').trim().toLowerCase()!=='player');
}
function present(v){return !(v===null||v===undefined||v==='')}
function numberOrNull(v,{positive=false}={}){
  if(!present(v))return null;
  const n=Number(v);if(!Number.isFinite(n))return null;
  if(positive&&n<=0)return null;
  return n;
}
function preferKnown(incoming,old,{positive=false}={}){
  const n=numberOrNull(incoming,{positive});
  if(n!==null)return n;
  const o=numberOrNull(old,{positive});
  return o!==null?o:null;
}
function preferPresent(incoming,old){return present(incoming)?incoming:(present(old)?old:null)}

function mergeMember(old,m){
  const nextPower=numberOrNull(m?.power_m,{positive:true});
  const oldPower=numberOrNull(old?.power_m,{positive:true});
  const delta=nextPower!==null&&oldPower!==null?Number((nextPower-oldPower).toFixed(2)):null;

  // HF8.6.10 reliability guard:
  // - canonical Last War name/rank/scope stay authoritative;
  // - missing cloud metrics never erase known roster/account values;
  // - a missing power is UNKNOWN, never zero, so it can never create a false -X M delta.
  const canonicalName=old?.name||m?.name||'';
  const canonicalRole=old?.role||m?.role||'R1';
  const canonicalServer=old?.server_id||m?.server_id||'';
  const canonicalAlliance=old?.alliance_tag||m?.alliance_tag||'';
  const merged={...old,...m};
  merged.name=canonicalName;
  merged.role=canonicalRole;
  merged.server_id=canonicalServer;
  merged.alliance_tag=canonicalAlliance;
  merged.hq_level=preferKnown(m?.hq_level,old?.hq_level,{positive:true});
  merged.power_m=nextPower!==null?nextPower:(oldPower!==null?oldPower:null);
  merged.squad_power_m=preferKnown(m?.squad_power_m,old?.squad_power_m,{positive:true});
  merged.drone_level=preferKnown(m?.drone_level,old?.drone_level,{positive:true});
  merged.drone_power_m=preferKnown(m?.drone_power_m,old?.drone_power_m,{positive:true});
  merged.squad_power_updated_at=preferPresent(m?.squad_power_updated_at,old?.squad_power_updated_at);
  merged.vs_points=preferKnown(m?.vs_points,old?.vs_points);
  merged.season_points=preferKnown(m?.season_points,old?.season_points);
  merged.contribution=preferKnown(m?.contribution,old?.contribution);
  merged.last_active_at=preferPresent(m?.last_active_at,old?.last_active_at);
  merged.activity_events=mergeActivityEvents(old?.activity_events,m?.activity_events);
  merged.membership_status=old?.membership_status||m?.membership_status;
  merged.joined_at=old?.joined_at||m?.joined_at||null;
  merged.returned_at=old?.returned_at||m?.returned_at||null;
  merged.left_at=old?.left_at||m?.left_at||null;
  merged.missing_from_snapshot_at=old?.missing_from_snapshot_at||m?.missing_from_snapshot_at||null;
  merged.membership_history=Array.isArray(old?.membership_history)?old.membership_history:(m?.membership_history||[]);
  merged.source=old?.source==='manual_import'?'manual_import+warboost':'cloud';
  merged.delta_m=delta;
  merged.warboost_linked=true;
  merged.identity_basis='lastwar_nickname_server_alliance';
  merged.identity_linked_at=old?.identity_linked_at||m?.identity_linked_at||new Date().toISOString();
  return merged;
}

export function mergeCloudRosterWithIdentity(existingRows,cloudRows,{serverId,allianceTag}={}){
  const existing=backfillRosterIdentityContext(existingRows,{serverId,allianceTag});
  const cloud=backfillRosterIdentityContext(cloudRows,{serverId,allianceTag});
  if(!existing.length){
    return {roster:cloud.map(m=>({...m,activity_events:mergeActivityEvents(m?.activity_events),source:'cloud',warboost_linked:cloudIdentityReady(m),identity_basis:cloudIdentityReady(m)?'lastwar_nickname_server_alliance':null})),unlinked_accounts:[]};
  }
  const out=existing.map(m=>({...m,activity_events:mergeActivityEvents(m?.activity_events),warboost_linked:m?.warboost_linked===true}));
  const claimed=new Set(),unlinked=[];
  for(const m of cloud){
    const playerId=String(m?.player_id||'').trim();
    let idx=playerId?out.findIndex((x,i)=>!claimed.has(i)&&String(x?.player_id||'').trim()===playerId&&x?.warboost_linked===true&&['lastwar_nickname_server_alliance','legacy_private_link_preserved'].includes(String(x?.identity_basis||''))):-1;
    if(idx<0&&cloudIdentityReady(m)){
      const candidates=identityCandidates(out,{name:m.name,server_id:m.server_id,alliance_tag:m.alliance_tag}).filter(x=>!claimed.has(x.index));
      if(candidates.length===1)idx=candidates[0].index;
      else if(candidates.length>1){unlinked.push(sanitizeUnlinkedAccount({...m,reason:'ambiguous_roster_match'}));continue}
    }
    if(idx<0){unlinked.push(sanitizeUnlinkedAccount({...m,reason:cloudIdentityReady(m)?'no_roster_match':'identity_incomplete'}));continue}
    claimed.add(idx);out[idx]=mergeMember(out[idx],m);
  }
  return {roster:out,unlinked_accounts:unlinked};
}

export function mergeCloudRosterPreservingManual(existingRows,cloudRows,context={}){
  return mergeCloudRosterWithIdentity(existingRows,cloudRows,context).roster;
}

export function mergeCurrentPlayerActivityIntoRoster(rows,{playerId,name,serverId,allianceTag,activityEvents,updatedAt}={}){
  return linkCurrentPlayerIdentityIntoRoster(rows,{playerId,name,serverId,allianceTag,activityEvents,updatedAt}).members;
}
