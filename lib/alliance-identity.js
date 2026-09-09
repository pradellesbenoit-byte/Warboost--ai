import {rosterNameKey} from './roster-import.js';
import {mergeActivityEvents} from './activity-events.js';

function clean(v,max=120){return String(v??'').trim().slice(0,max)}
export function normalizeLastWarNickname(v){return rosterNameKey(clean(v,80))}
export function normalizeServerId(v){
  const raw=clean(v,32).toLowerCase().replace(/^server\s*/,'').replace(/^serveur\s*/,'').replace(/^s\s*/,'').trim();
  const digits=raw.match(/\d+/)?.[0]||raw;
  return clean(digits,20);
}
export function normalizeAllianceTag(v){return clean(v,16).toUpperCase().replace(/\s+/g,'')}

export function lastWarIdentity({name,nickname,server_id,serverId,alliance_tag,allianceTag}={}){
  return {
    nickname:clean(nickname??name,80),
    nickname_key:normalizeLastWarNickname(nickname??name),
    server_id:normalizeServerId(server_id??serverId),
    alliance_tag:normalizeAllianceTag(alliance_tag??allianceTag)
  };
}

function contextCompatible(member,identity){
  const mServer=normalizeServerId(member?.server_id),mAlliance=normalizeAllianceTag(member?.alliance_tag);
  if(mServer&&identity.server_id&&mServer!==identity.server_id)return false;
  if(mAlliance&&identity.alliance_tag&&mAlliance!==identity.alliance_tag)return false;
  return true;
}

export function backfillRosterIdentityContext(rows,{serverId,allianceTag}={}){
  const server_id=normalizeServerId(serverId),alliance_tag=normalizeAllianceTag(allianceTag);
  return (Array.isArray(rows)?rows:[]).map(raw=>{
    const m={...raw};
    if(!normalizeServerId(m.server_id)&&server_id)m.server_id=server_id;
    else if(m.server_id)m.server_id=normalizeServerId(m.server_id);
    if(!normalizeAllianceTag(m.alliance_tag)&&alliance_tag)m.alliance_tag=alliance_tag;
    else if(m.alliance_tag)m.alliance_tag=normalizeAllianceTag(m.alliance_tag);
    return m;
  });
}

export function identityCandidates(rows,identityInput={}){
  const identity=lastWarIdentity(identityInput);if(!identity.nickname_key)return [];
  return (Array.isArray(rows)?rows:[]).map((m,index)=>({m,index})).filter(({m})=>normalizeLastWarNickname(m?.name)===identity.nickname_key&&contextCompatible(m,identity));
}

export function linkCurrentPlayerIdentityIntoRoster(rows,{playerId,name,nickname,serverId,server_id,allianceTag,alliance_tag,activityEvents,updatedAt}={}){
  const identity=lastWarIdentity({name,nickname,server_id:server_id??serverId,alliance_tag:alliance_tag??allianceTag});
  const out=backfillRosterIdentityContext(rows,{serverId:identity.server_id,allianceTag:identity.alliance_tag});
  const id=clean(playerId,120),now=updatedAt||new Date().toISOString();
  if(!identity.nickname_key)return {members:out,status:'missing_nickname',matched_index:-1};

  // A private player_id is accepted as a nickname-change continuity key ONLY after a
  // previous exact Last War identity association has been established. Older HF4 rows may
  // already contain player_id from the legacy cloud merge; those rows must still re-prove
  // nickname + server + alliance before HF5 trusts them.
  let linkedIdx=id?out.findIndex(m=>String(m?.player_id||'').trim()===id):-1;
  if(linkedIdx>=0){
    const linked=out[linkedIdx],basis=String(linked?.identity_basis||'');
    const established=linked?.warboost_linked===true&&(basis==='lastwar_nickname_server_alliance'||basis==='legacy_private_link_preserved');
    if(established){
      const sameContext=contextCompatible(linked,identity);
      if(!sameContext)return {members:out,status:'context_conflict',matched_index:linkedIdx};
      const otherExact=identityCandidates(out,identity).filter(x=>x.index!==linkedIdx);
      const linkedNameKey=normalizeLastWarNickname(linked?.name);
      if(linkedNameKey!==identity.nickname_key&&otherExact.length>0)return {members:out,status:'ambiguous_rename',matched_index:linkedIdx};
      out[linkedIdx]={...linked,name:identity.nickname||linked.name,server_id:identity.server_id||normalizeServerId(linked.server_id),alliance_tag:identity.alliance_tag||normalizeAllianceTag(linked.alliance_tag),player_id:id||linked.player_id,warboost_linked:true,identity_basis:identity.server_id&&identity.alliance_tag?'lastwar_nickname_server_alliance':(linked.identity_basis||'legacy_private_link_preserved'),identity_linked_at:linked.identity_linked_at||now,activity_events:mergeActivityEvents(linked.activity_events,activityEvents),updated_at:now};
      return {members:out,status:'linked_existing',matched_index:linkedIdx};
    }
  }

  if(!identity.server_id)return {members:out,status:'missing_server',matched_index:-1};
  if(!identity.alliance_tag)return {members:out,status:'missing_alliance',matched_index:-1};
  const candidates=identityCandidates(out,identity);
  if(candidates.length!==1)return {members:out,status:candidates.length>1?'ambiguous':'no_match',matched_index:-1};
  linkedIdx=candidates[0].index;const old=out[linkedIdx];
  out[linkedIdx]={...old,server_id:identity.server_id,alliance_tag:identity.alliance_tag,player_id:id||old.player_id||null,warboost_linked:true,identity_basis:'lastwar_nickname_server_alliance',identity_linked_at:old.identity_linked_at||now,activity_events:mergeActivityEvents(old.activity_events,activityEvents),updated_at:now};
  return {members:out,status:'linked_exact',matched_index:linkedIdx};
}

export function rosterLinkSummary(rows=[]){
  const members=Array.isArray(rows)?rows:[];
  const linked=members.filter(m=>m?.warboost_linked===true).length;
  return {linked,unlinked:Math.max(0,members.length-linked),total:members.length};
}

export function sanitizeUnlinkedAccount(raw={}){
  const identity=lastWarIdentity({name:raw?.name,server_id:raw?.server_id,alliance_tag:raw?.alliance_tag});
  return {name:identity.nickname||'',server_id:identity.server_id||'',alliance_tag:identity.alliance_tag||'',reason:clean(raw?.reason||'no_roster_match',40),updated_at:raw?.updated_at||null};
}
