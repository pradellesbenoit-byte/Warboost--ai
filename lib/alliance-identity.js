import {rosterNameKey} from './roster-import.js';
import {mergeActivityEvents} from './activity-events.js';
import {explicitLastWarManagerRank,LAST_WAR_SCAN_RANK_SOURCE,confirmedRankTimestamp} from './rank-provenance.js';

function clean(v,max=120){return String(v??'').trim().slice(0,max)}
export function normalizeLastWarNickname(v,allianceTag=""){
  let nickname=clean(v,80);const tag=normalizeAllianceTag(allianceTag);
  // Last War screenshots / profile labels may prefix the alliance as [TAG]Nickname.
  // Treat that UI decoration as non-identity ONLY when it exactly matches the known alliance.
  // Internal text such as "xXx Kaufik ALL4 xXx" remains part of the real nickname.
  if(tag){const m=nickname.match(/^\[\s*([^\]]{1,24})\s*\]\s*/);if(m&&normalizeAllianceTag(m[1])===tag)nickname=nickname.slice(m[0].length).trim()}
  return rosterNameKey(nickname)
}
export function normalizeServerId(v){
  const raw=clean(v,32).toLowerCase().replace(/^server\s*/,'').replace(/^serveur\s*/,'').replace(/^s\s*/,'').trim();
  const digits=raw.match(/\d+/)?.[0]||raw;
  return clean(digits,20);
}
export function normalizeAllianceTag(v){return clean(v,16).toUpperCase().replace(/\s+/g,'').replace(/^\[|\]$/g,'')}

export function lastWarIdentity({name,nickname,server_id,serverId,alliance_tag,allianceTag}={}){
  const resolvedAlliance=normalizeAllianceTag(alliance_tag??allianceTag),rawNickname=clean(nickname??name,80);
  let displayNickname=rawNickname;
  if(resolvedAlliance){const m=rawNickname.match(/^\[\s*([^\]]{1,24})\s*\]\s*/);if(m&&normalizeAllianceTag(m[1])===resolvedAlliance)displayNickname=rawNickname.slice(m[0].length).trim()}
  return {
    nickname:displayNickname,
    nickname_key:normalizeLastWarNickname(rawNickname,resolvedAlliance),
    server_id:normalizeServerId(server_id??serverId),
    alliance_tag:resolvedAlliance
  };
}

function contextCompatible(member,identity){
  const mServer=normalizeServerId(member?.server_id),mAlliance=normalizeAllianceTag(member?.alliance_tag);
  if(mServer&&identity.server_id&&mServer!==identity.server_id)return false;
  if(mAlliance&&identity.alliance_tag&&mAlliance!==identity.alliance_tag)return false;
  return true;
}
function establishedLink(member){
  const basis=String(member?.identity_basis||'');
  return member?.warboost_linked===true&&['lastwar_nickname_server_alliance','legacy_private_link_preserved'].includes(basis);
}
function confirmedScanManagerRank({role,rank,rank_confirmed_source,rank_confirmed_at}={}){
  const confirmed=explicitLastWarManagerRank(role??rank);
  return confirmed&&rank_confirmed_source===LAST_WAR_SCAN_RANK_SOURCE&&confirmedRankTimestamp({rank_confirmed_at})>0?confirmed:null;
}
function oneCharacterApart(left,right){
  const a=String(left||""),b=String(right||"");
  if(!a||!b||a===b||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,diffs=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue}
    if(++diffs>1)return false;
    if(a.length===b.length){i++;j++}
    else if(a.length>b.length)i++;
    else j++;
  }
  return diffs+(a.length-i)+(b.length-j)===1;
}
function tolerantManagerCandidates(rows,identity,confirmedRank){
  if(!confirmedRank||identity.nickname_key.length<6)return [];
  return (Array.isArray(rows)?rows:[]).map((m,index)=>({m,index})).filter(({m})=>{
    const owner=String(m?.player_id||"").trim();
    const candidateRank=explicitLastWarManagerRank(m?.role);
    return normalizeServerId(m?.server_id)===identity.server_id&&
      normalizeAllianceTag(m?.alliance_tag)===identity.alliance_tag&&
      candidateRank===confirmedRank&&
      !owner&&m?.warboost_linked!==true&&
      normalizeLastWarNickname(m?.name,identity.alliance_tag).length>=6&&
      oneCharacterApart(normalizeLastWarNickname(m?.name,identity.alliance_tag),identity.nickname_key);
  });
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
  return (Array.isArray(rows)?rows:[]).map((m,index)=>({m,index})).filter(({m})=>normalizeLastWarNickname(m?.name,identity.alliance_tag)===identity.nickname_key&&contextCompatible(m,identity));
}

export function linkCurrentPlayerIdentityIntoRoster(rows,{playerId,name,nickname,serverId,server_id,allianceTag,alliance_tag,role,rank,rank_confirmed_source,rank_confirmed_at,activityEvents,updatedAt}={}){
  const identity=lastWarIdentity({name,nickname,server_id:server_id??serverId,alliance_tag:alliance_tag??allianceTag});
  const out=backfillRosterIdentityContext(rows,{serverId:identity.server_id,allianceTag:identity.alliance_tag});
  const id=clean(playerId,120),now=updatedAt||new Date().toISOString();
  if(!identity.nickname_key)return {members:out,status:'missing_nickname',matched_index:-1};

  // A private player_id is accepted as a nickname-change continuity key ONLY after a
  // previous exact Last War identity association has been established. Older rows may
  // already contain player_id from a legacy cloud merge; those rows must still re-prove
  // nickname + server + alliance before being trusted.
  let linkedIdx=id?out.findIndex(m=>String(m?.player_id||'').trim()===id):-1;
  if(linkedIdx>=0){
    const linked=out[linkedIdx];
    if(establishedLink(linked)){
      const sameContext=contextCompatible(linked,identity);
      if(!sameContext)return {members:out,status:'context_conflict',matched_index:linkedIdx};
      const otherExact=identityCandidates(out,identity).filter(x=>x.index!==linkedIdx);
      const linkedNameKey=normalizeLastWarNickname(linked?.name,identity.alliance_tag);
      if(linkedNameKey!==identity.nickname_key&&otherExact.length>0)return {members:out,status:'ambiguous_rename',matched_index:linkedIdx};
      out[linkedIdx]={...linked,name:identity.nickname||linked.name,server_id:identity.server_id||normalizeServerId(linked.server_id),alliance_tag:identity.alliance_tag||normalizeAllianceTag(linked.alliance_tag),player_id:id||linked.player_id,warboost_linked:true,identity_basis:identity.server_id&&identity.alliance_tag?'lastwar_nickname_server_alliance':(linked.identity_basis||'legacy_private_link_preserved'),identity_linked_at:linked.identity_linked_at||now,activity_events:mergeActivityEvents(linked.activity_events,activityEvents),updated_at:now};
      return {members:out,status:'linked_existing',matched_index:linkedIdx};
    }
  }

  if(!identity.server_id)return {members:out,status:'missing_server',matched_index:-1};
  if(!identity.alliance_tag)return {members:out,status:'missing_alliance',matched_index:-1};
  const candidates=identityCandidates(out,identity);
  if(candidates.length>1)return {members:out,status:'ambiguous',matched_index:-1};
  if(candidates.length===0){
    const confirmedRank=confirmedScanManagerRank({role,rank,rank_confirmed_source,rank_confirmed_at});
    const tolerant=tolerantManagerCandidates(out,identity,confirmedRank);
    if(tolerant.length!==1)return {members:out,status:tolerant.length>1?'ambiguous':'no_match',matched_index:-1};
    linkedIdx=tolerant[0].index;
    const old=out[linkedIdx];
    out[linkedIdx]={...old,server_id:identity.server_id,alliance_tag:identity.alliance_tag,player_id:id||old.player_id||null,warboost_linked:true,identity_basis:'lastwar_nickname_server_alliance',identity_linked_at:old.identity_linked_at||now,activity_events:mergeActivityEvents(old.activity_events,activityEvents),updated_at:now};
    return {members:out,status:'linked_tolerant',matched_index:linkedIdx};
  }
  linkedIdx=candidates[0].index;const old=out[linkedIdx];

  // HF8.6.28 reliability patch: strict one-to-one identity protection.
  // Never steal a roster member already linked to another WarBoost account.
  const existingOwner=clean(old?.player_id,120);
  if(id&&existingOwner&&existingOwner!==id&&establishedLink(old)){
    return {members:out,status:'roster_member_already_linked',matched_index:linkedIdx};
  }
  // A WarBoost account may not be attached to two roster members either.
  if(id){
    const otherOwnerIdx=out.findIndex((m,i)=>i!==linkedIdx&&String(m?.player_id||'').trim()===id&&establishedLink(m));
    if(otherOwnerIdx>=0)return {members:out,status:'account_already_linked',matched_index:otherOwnerIdx};
  }

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
