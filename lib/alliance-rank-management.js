import {rosterLifecycleKey,normalizeMembershipHistory} from './alliance-roster-lifecycle.js';
import {normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag} from './alliance-identity.js';

const MANAGED_RANKS=['R1','R2','R3','R4'];
const ALL_RANKS=['R1','R2','R3','R4','R5'];
function clean(v,max=120){return String(v??'').trim().slice(0,max)}
export function normalizeAllianceRank(v){const r=clean(v,8).toUpperCase();return ALL_RANKS.includes(r)?r:'R1'}
export function cloudRankManagerAccess({userId,membershipRole,ownerPlayerId}={}){
  const uid=clean(userId,120),owner=Boolean(uid&&clean(ownerPlayerId,120)===uid),cloudRole=normalizeAllianceRank(membershipRole);
  return {cloud_role_available:Boolean(clean(membershipRole,8)),cloud_role:cloudRole,owner,allowed:owner||cloudRole==='R4'||cloudRole==='R5'};
}
export function confirmedCanonicalSelfRole(rows=[],userId){
  const id=clean(userId,120),matches=(Array.isArray(rows)?rows:[]).filter(row=>{
    if(!id||clean(row?.player_id,120)!==id)return false;
    return row?.warboost_linked===true||['lastwar_nickname_server_alliance','legacy_private_link_preserved'].includes(clean(row?.identity_basis,80));
  });
  if(matches.length!==1)return {ok:false,code:matches.length?'member_identity_ambiguous':'member_identity_unconfirmed',matches};
  return {ok:true,member:matches[0],role:normalizeAllianceRank(matches[0]?.role)};
}
export function previewSelfIdentityLink(rows=[],{userId,name,serverId,allianceTag}={}){
  const id=clean(userId,120),nickname=normalizeLastWarNickname(name,allianceTag),server_id=normalizeServerId(serverId),alliance_tag=normalizeAllianceTag(allianceTag);
  const matches=(Array.isArray(rows)?rows:[]).map((member,index)=>({member,index})).filter(({member})=>{
    return Boolean(nickname&&server_id&&alliance_tag)&&normalizeLastWarNickname(member?.name,member?.alliance_tag)===nickname&&normalizeServerId(member?.server_id)===server_id&&normalizeAllianceTag(member?.alliance_tag)===alliance_tag;
  });
  const base={identity:{name:String(name||"").trim(),nickname_key:nickname,server_id,alliance_tag},matches:matches.map(x=>x.member)};
  if(!id||!nickname||!server_id||!alliance_tag)return {...base,ok:false,code:"self_identity_incomplete"};
  if(matches.length!==1)return {...base,ok:false,code:matches.length?"member_identity_ambiguous":"self_identity_no_match"};
  const {member,index}=matches[0],existingOwner=clean(member?.player_id,120);
  if(existingOwner&&existingOwner!==id)return {...base,ok:false,code:"roster_member_already_linked",index,member};
  const other=matches.length===1?Array.from(Array.isArray(rows)?rows:[]).findIndex((row,i)=>i!==index&&clean(row?.player_id,120)===id):-1;
  if(other>=0)return {...base,ok:false,code:"account_already_linked",index,other_index:other,member};
  return {...base,ok:true,index,member};
}
export function rankManagementKey(member={}){return rosterLifecycleKey(member)}
export function rankCounts(members=[]){const out={R1:0,R2:0,R3:0,R4:0,R5:0};for(const m of Array.isArray(members)?members:[]){const r=normalizeAllianceRank(m?.role);out[r]=(out[r]||0)+1}return out}
function normalizeChanges(changes=[]){
  const out=[],seen=new Set();
  for(const raw of Array.isArray(changes)?changes:[]){const key=clean(raw?.key,260),to=normalizeAllianceRank(raw?.to_role);if(!key||seen.has(key))continue;seen.add(key);out.push({key,to_role:to})}
  return out;
}
export function previewAllianceRankChanges(members=[],changes=[],{maxR4=10}={}){
  const rows=Array.isArray(members)?members:[],byKey=new Map(rows.map(m=>[rankManagementKey(m),m]).filter(([k])=>k));
  const before=rankCounts(rows),after={...before},normalized=normalizeChanges(changes),resolved=[],errors=[];
  for(const change of normalized){
    const member=byKey.get(change.key);if(!member){errors.push({code:'member_not_found',key:change.key});continue}
    const from=normalizeAllianceRank(member.role),to=change.to_role;
    if(!MANAGED_RANKS.includes(to)){errors.push({code:'r5_separate',key:change.key,name:member.name||''});continue}
    if(from==='R5'){
      if((after.R5||0)<=1){errors.push({code:'r5_protected',key:change.key,name:member.name||''});continue}
      after.R5=Math.max(1,(after.R5||0)-1);
    }
    if(from===to)continue;
    if(from!=='R5')after[from]=Math.max(0,(after[from]||0)-1);
    after[to]=(after[to]||0)+1;
    resolved.push({key:change.key,name:member.name||'',player_id:member.player_id||null,from_role:from,to_role:to,warboost_linked:member.warboost_linked===true,management_role:normalizeAllianceRank(member.management_role||'R1')});
  }
  const limit=Math.max(1,Number(maxR4)||10),r4Over=Math.max(0,(after.R4||0)-limit);
  if(r4Over>0)errors.push({code:'r4_limit',limit,count:after.R4,over:r4Over});
  return {ok:errors.length===0,changes:resolved,errors,before,after,max_r4:limit,has_r4_transition:resolved.some(x=>x.from_role==='R4'||x.to_role==='R4')};
}
export function applyAllianceRankChanges(members=[],changes=[],{now=new Date().toISOString(),maxR4=10,source='r5_r4_manual_rank_management'}={}){
  const preview=previewAllianceRankChanges(members,changes,{maxR4});if(!preview.ok)return {members:Array.isArray(members)?members:[],changed:false,preview};
  const byKey=new Map(preview.changes.map(x=>[x.key,x]));let changed=false;
  const next=(Array.isArray(members)?members:[]).map(raw=>{
    const key=rankManagementKey(raw),change=byKey.get(key);if(!change)return raw;
    changed=true;const history=normalizeMembershipHistory([...(raw?.membership_history||[]),{type:'role_changed',at:now,from_role:change.from_role,to_role:change.to_role,source}]);
    return {...raw,role:change.to_role,membership_history:history,rank_confirmed_at:now,rank_confirmed_source:source,updated_at:now};
  });
  return {members:next,changed,preview};
}
export function permissionRoleForRosterRank(rank){return normalizeAllianceRank(rank)==='R4'?'R4':'R1'}
export function permissionTransitions(preview={}){
  return (Array.isArray(preview?.changes)?preview.changes:[]).filter(x=>x.player_id&&(x.from_role==='R4'||x.to_role==='R4')).map(x=>({...x,management_role:permissionRoleForRosterRank(x.to_role)}));
}
