import {rosterNameKey} from './roster-import.js';
import {mergeActivityEvents} from './activity-events.js';

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
function activeLink(member){
  return establishedLink(member)&&Boolean(String(member?.player_id||'').trim());
}
function linkRecency(member){
  const at=Date.parse(member?.identity_linked_at||member?.updated_at||"");
  return Number.isFinite(at)?at:0;
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
      // A previously linked account is not allowed to make a fuzzy nickname
      // match authoritative. If the current exact identity exists elsewhere,
      // report the ambiguity and leave both canonical rows untouched.
      if(linkedNameKey!==identity.nickname_key){
        return {members:out,status:otherExact.length>0?'ambiguous_rename':'no_match',matched_index:linkedIdx};
      }
      out[linkedIdx]={...linked,name:identity.nickname||linked.name,server_id:identity.server_id||normalizeServerId(linked.server_id),alliance_tag:identity.alliance_tag||normalizeAllianceTag(linked.alliance_tag),player_id:id||linked.player_id,warboost_linked:true,identity_basis:identity.server_id&&identity.alliance_tag?'lastwar_nickname_server_alliance':(linked.identity_basis||'legacy_private_link_preserved'),identity_linked_at:linked.identity_linked_at||now,activity_events:mergeActivityEvents(linked.activity_events,activityEvents),updated_at:now};
      return {members:out,status:'linked_existing',matched_index:linkedIdx};
    }
  }

  if(!identity.server_id)return {members:out,status:'missing_server',matched_index:-1};
  if(!identity.alliance_tag)return {members:out,status:'missing_alliance',matched_index:-1};
  const candidates=identityCandidates(out,identity);
  if(candidates.length>1)return {members:out,status:'ambiguous',matched_index:-1};
  if(candidates.length===0){
    return {members:out,status:'no_match',matched_index:-1};
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

// Canonical roster rows are retained as historical records, but an account can
// have only one active association. Clearing the active flags on a duplicate
// does not remove its participation, lifecycle, rank, or profile data.
export function dedupeRosterAccountLinks(rows=[]){
  const out=(Array.isArray(rows)?rows:[]).map(row=>({...row}));
  const groups=new Map(),keysByIndex=new Map(),activeIndexes=[];
  for(let i=0;i<out.length;i++){
    const row=out[i],playerId=clean(row?.player_id,120);
    if(!activeLink(row)||!playerId)continue;
    const memberKey=clean(row?.canonical_member_key,260)||`${normalizeLastWarNickname(row?.name,row?.alliance_tag)}|${normalizeServerId(row?.server_id)}|${normalizeAllianceTag(row?.alliance_tag)}`;
    const keys=[`player:${playerId}`,`member:${memberKey}`];
    keysByIndex.set(i,keys);activeIndexes.push(i);
    for(const key of keys){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i)}
  }
  const visited=new Set();
  for(const start of activeIndexes){
    if(visited.has(start))continue;
    const component=[],queue=[start];visited.add(start);
    while(queue.length){
      const index=queue.shift();component.push(index);
      for(const key of keysByIndex.get(index)||[]){
        for(const next of groups.get(key)||[])if(!visited.has(next)){visited.add(next);queue.push(next)}
      }
    }
    const winner=component.slice().sort((a,b)=>linkRecency(out[b])-linkRecency(out[a])||a-b)[0];
    for(const loser of component)if(loser!==winner){
      const stale=out[loser];
      out[loser]={...stale,player_id:null,warboost_linked:false,identity_basis:null};
    }
  }
  return out;
}

export function rosterLinkSummary(rows=[]){
  const members=dedupeRosterAccountLinks(rows);
  const linked=members.filter(m=>activeLink(m)).length;
  return {linked,unlinked:Math.max(0,members.length-linked),total:members.length};
}

export function sanitizeUnlinkedAccount(raw={}){
  const identity=lastWarIdentity({name:raw?.name,server_id:raw?.server_id,alliance_tag:raw?.alliance_tag});
  return {player_id:clean(raw?.player_id,120)||null,name:identity.nickname||'',server_id:identity.server_id||'',alliance_tag:identity.alliance_tag||'',reason:clean(raw?.reason||'no_roster_match',40),updated_at:raw?.updated_at||null};
}

function identityScopeMatches(account,member,{serverId="",allianceTag=""}={}){
  const accountServer=normalizeServerId(account?.server_id||serverId),memberServer=normalizeServerId(member?.server_id||serverId);
  const accountTag=normalizeAllianceTag(account?.alliance_tag||allianceTag),memberTag=normalizeAllianceTag(member?.alliance_tag||allianceTag);
  return Boolean(accountServer&&memberServer&&accountTag&&memberTag&&accountServer===memberServer&&accountTag===memberTag);
}

function establishedRosterLink(member){
  return member?.warboost_linked===true&&Boolean(String(member?.player_id||"").trim());
}

// Pending identity rows are a derived view, never authoritative identity data.
// A linked canonical roster row wins over any older local/cloud pending entry.
// player_id is globally unique, so an established link must win even when an
// older local row carries stale server/alliance scope.
export function normalizeUnlinkedAccounts(accounts=[],members=[],{serverId="",allianceTag="",currentPlayerId="",currentPlayerName="",identityLinkStatus=""}={}){
  const roster=Array.isArray(members)?members:[],fallback={serverId,allianceTag},currentId=clean(currentPlayerId,120);
  const currentLinked=currentId?roster.find(member=>establishedRosterLink(member)&&String(member.player_id).trim()===currentId):null;
  const currentNameKey=currentLinked&&currentPlayerName?normalizeLastWarNickname(currentPlayerName,currentLinked.alliance_tag||allianceTag):"";
  return (Array.isArray(accounts)?accounts:[]).map(raw=>sanitizeUnlinkedAccount(raw)).filter(account=>{
    const accountId=String(account.player_id||"").trim();
    // Never let an old local scope or display name resurrect a row that is
    // already owned by a canonical linked roster member.
    const linkedById=accountId&&roster.some(member=>establishedRosterLink(member)&&String(member.player_id).trim()===accountId);
    if(linkedById)return false;
    // Old clients did not persist player_id in pending rows. When the cloud has
    // already confirmed the current account, remove that stale self entry only
    // within the same strict server/alliance scope.
    if(currentLinked&&currentNameKey&&normalizeLastWarNickname(account.name,account.alliance_tag||allianceTag)===currentNameKey&&identityScopeMatches(account,currentLinked,fallback))return false;
    const key=normalizeLastWarNickname(account.name,account.alliance_tag||allianceTag);
    if(!key)return true;
    const exactMatches=roster.filter(member=>establishedRosterLink(member)&&identityScopeMatches(account,member,fallback)&&normalizeLastWarNickname(member.name,member.alliance_tag||allianceTag)===key);
    return exactMatches.length!==1;
  });
}
