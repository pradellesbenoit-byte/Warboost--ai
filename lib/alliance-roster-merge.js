import {rosterNameKey} from './roster-import.js';
import {mergeActivityEvents} from './activity-events.js';
import {backfillRosterIdentityContext,identityCandidates,lastWarIdentity,linkCurrentPlayerIdentityIntoRoster,sanitizeUnlinkedAccount} from './alliance-identity.js';

function cloudIdentityReady(m){
  const id=lastWarIdentity({name:m?.name,server_id:m?.server_id,alliance_tag:m?.alliance_tag});
  return Boolean(id.nickname_key&&id.server_id&&id.alliance_tag&&String(m?.name||'').trim().toLowerCase()!=='player');
}
function mergeMember(old,m){
  const nextPower=Number(m?.power_m),oldPower=Number(old?.power_m),delta=Number.isFinite(nextPower)&&Number.isFinite(oldPower)?Number((nextPower-oldPower).toFixed(2)):null;
  // HF8.6.8: once a canonical Last War roster exists, association may enrich that
  // member with WarBoost account data but MUST NOT replace the roster identity/rank.
  // A stale self-declared profile rank (ex. ToyN profile=R5 while roster=R4) must
  // never move or hide the member after "Vérifier l’association".
  const canonicalName=old?.name||m?.name||'';
  const canonicalRole=old?.role||m?.role||'R1';
  const canonicalServer=old?.server_id||m?.server_id||'';
  const canonicalAlliance=old?.alliance_tag||m?.alliance_tag||'';
  return {...old,...m,name:canonicalName,role:canonicalRole,server_id:canonicalServer,alliance_tag:canonicalAlliance,activity_events:mergeActivityEvents(old?.activity_events,m?.activity_events),membership_status:old?.membership_status||m?.membership_status,joined_at:old?.joined_at||m?.joined_at||null,returned_at:old?.returned_at||m?.returned_at||null,left_at:old?.left_at||m?.left_at||null,missing_from_snapshot_at:old?.missing_from_snapshot_at||m?.missing_from_snapshot_at||null,membership_history:Array.isArray(old?.membership_history)?old.membership_history:(m?.membership_history||[]),source:old?.source==='manual_import'?'manual_import+warboost':'cloud',delta_m:delta,warboost_linked:true,identity_basis:'lastwar_nickname_server_alliance',identity_linked_at:old?.identity_linked_at||m?.identity_linked_at||new Date().toISOString()};
}

// The Last War roster remains the authority when R5/R4 imported one. WarBoost accounts
// are attached only by exact game nickname + server + alliance context. E-mail is never used.
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
    // Private-id continuity is valid only for a previously established HF5 game-identity link.
    // Legacy HF4 player_id fields must re-match by Last War nickname + server + alliance.
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

// Backward-compatible wrapper used by older verification code.
export function mergeCloudRosterPreservingManual(existingRows,cloudRows,context={}){
  return mergeCloudRosterWithIdentity(existingRows,cloudRows,context).roster;
}

// Read-after-write protection for the authenticated player's own activity.
// Initial association requires exact Last War nickname + server + alliance context.
// The private player_id is retained only after that explicit game-identity match so a later
// nickname change can keep history without exposing or matching on the WarBoost e-mail.
export function mergeCurrentPlayerActivityIntoRoster(rows,{playerId,name,serverId,allianceTag,activityEvents,updatedAt}={}){
  return linkCurrentPlayerIdentityIntoRoster(rows,{playerId,name,serverId,allianceTag,activityEvents,updatedAt}).members;
}
