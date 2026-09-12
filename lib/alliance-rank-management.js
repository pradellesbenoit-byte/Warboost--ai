import {rosterLifecycleKey,normalizeMembershipHistory} from './alliance-roster-lifecycle.js';

const MANAGED_RANKS=['R1','R2','R3','R4'];
const ALL_RANKS=['R1','R2','R3','R4','R5'];
function clean(v,max=120){return String(v??'').trim().slice(0,max)}
export function normalizeAllianceRank(v){const r=clean(v,8).toUpperCase();return ALL_RANKS.includes(r)?r:'R1'}
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
    if(from==='R5'){errors.push({code:'r5_protected',key:change.key,name:member.name||''});continue}
    if(!MANAGED_RANKS.includes(to)){errors.push({code:'r5_separate',key:change.key,name:member.name||''});continue}
    if(from===to)continue;
    after[from]=Math.max(0,(after[from]||0)-1);after[to]=(after[to]||0)+1;
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
