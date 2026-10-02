// Organizational heuristics, not official combat multipliers or win predictions.
const fresh=p=>p.evidence.power_kind==="squad"&&!p.evidence.stale;
const profile=p=>p.evidence.profile_stale!==true;
const kind=p=>profile(p)?p.evidence.squad_type:null;
const CORE=["main_attack","objective_defense","objective_capture","rapid_intervention"];
const ROLES=[...CORE,"objective_retake","group_support"];
const ALIASES={anchor:"main_attack",defense:"objective_defense",capture:"objective_capture",mobile:"rapid_intervention"};
export const normalizeWarRole=role=>ROLES.includes(role)||["flexible","contributor"].includes(role)?role:ALIASES[role]||"flexible";
const AFFINITY={
  tank:{main_attack:4,objective_defense:16,objective_capture:6,rapid_intervention:3,objective_retake:4,group_support:8},
  missile:{main_attack:16,objective_defense:5,objective_capture:7,rapid_intervention:5,objective_retake:15,group_support:6},
  aircraft:{main_attack:7,objective_defense:4,objective_capture:14,rapid_intervention:16,objective_retake:12,group_support:6}
};
const BACKUP={main_attack:"reinforce_offense",objective_defense:"reinforce_defense",
  objective_capture:"objective_capture",rapid_intervention:"mobile_reserve",
  objective_retake:"objective_retake",group_support:"group_support",flexible:"versatile_reserve"};
const TRIGGER={main_attack:"offensive_push",objective_defense:"defense_pressure",
  objective_capture:"objective_lost",rapid_intervention:"rapid_response",
  objective_retake:"objective_lost",group_support:"coordination_needed",flexible:"rapid_response"};
function policy(type,opponent,knowledge){
  const weights=type==="canyon_storm"?[2,4,3,2,2,1]:[3,3,3,2,2,1];
  if(opponent.strength==="stronger"){weights[0]=2;weights[1]=5;weights[3]=3;}
  if(opponent.strength==="weaker"){weights[0]=4;weights[1]=3;weights[2]=4;}
  const objective=knowledge.rules.find(r=>["objective_control","objective_priority"].includes(r.topic));
  const allowed=objective?.planning_allowed===true;
  return {weights,role_order:ROLES,
    mobile_action:!allowed?"confirm_objectives":opponent.strength==="stronger"?"defend_fewer_objectives":
      opponent.strength==="weaker"?"retake_when_open":"hold_and_reassess",
    rules_ready:allowed};
}
function quotas(n,weights){
  const result=Object.fromEntries(ROLES.map(r=>[r,0]));
  // Explicit essential coverage first; the rest balances the entire dispositif.
  for(const r of CORE.slice(0,n))result[r]++;
  for(let count=Math.min(n,CORE.length);count<n;count++){
    const next=ROLES.reduce((a,b)=>weights[ROLES.indexOf(a)]/(result[a]+1)>=weights[ROLES.indexOf(b)]/(result[b]+1)?a:b);
    result[next]++;
  }
  return result;
}
function strengthScale(pool){
  return Math.max(1,...pool.filter(fresh).map(p=>p.evidence.power_m||0));
}
function fitness(p,role,maxPower){
  const quality=fresh(p)?10000:p.evidence.power_kind==="squad"?1000:p.evidence.power_kind==="account_fallback"?500:100;
  return quality+(fresh(p)?(p.evidence.power_m/maxPower)*50:0)+
    (AFFINITY[kind(p)]?.[role]||0)+
    (p.evidence.reliability??.5)*4+Math.min(30,p.evidence.confirmed_participations)*.15;
}
function compatibility(p,target,role,maxPower){
  const same=kind(p)&&kind(p)===kind(target)?40:0;
  const heroes=profile(p)&&profile(target)?target.evidence.squad_heroes.filter(h=>p.evidence.squad_heroes.includes(h)).length*4:0;
  return fitness(p,role,maxPower)+same+heroes;
}
// Maximum-weight matching for a rectangular target/candidate matrix (Hungarian).
// This avoids greedy vacancy order stealing the only suitable reserve for a role.
export function matchWarSlots(candidates,targets,score){
  const n=Math.min(targets.length,candidates.length),m=candidates.length;
  if(!n)return [];
  const u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
  for(let i=1;i<=n;i++){
    p[0]=i;
    const min=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
    let j0=0;
    do{
      used[j0]=true;
      const i0=p[j0];let delta=Infinity,j1=0;
      for(let j=1;j<=m;j++)if(!used[j]){
        const cost=-score(candidates[j-1],targets[i0-1])-u[i0]-v[j];
        if(cost<min[j]){min[j]=cost;way[j]=j0;}
        if(min[j]<delta){delta=min[j];j1=j;}
      }
      for(let j=0;j<=m;j++){if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;}
      j0=j1;
    }while(p[j0]!==0);
    do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
  }
  const result=Array(n);
  for(let j=1;j<=m;j++)if(p[j])result[p[j]-1]={candidate:candidates[j-1],target:targets[p[j]-1]};
  return result;
}
function mainLineup(pool,count,targets,rank){
  const remaining=[...pool].sort(rank),left={...targets},assignments=[],maxPower=strengthScale(pool);
  while(assignments.length<count){
    // One slot per role in each strength tier spreads the strongest players.
    const roles=ROLES.filter(r=>left[r]>0).slice(0,count-assignments.length);
    const first=remaining.slice(0,roles.length*2);
    for(const type of ["tank","missile","aircraft"])first.push(...remaining.filter(p=>kind(p)===type).slice(0,2));
    const candidates=[...new Map(first.map(p=>[p.member_key,p])).values()].sort(rank);
    const round=matchWarSlots(candidates,roles,(p,r)=>fitness(p,r,maxPower));
    for(const {candidate:p,target:task} of round){
      const role=fresh(p)?task:"flexible";
      assignments.push({...p,role,covers_role:task,
        reason:fresh(p)?"balanced_role_coverage":"power_or_freshness_missing"});
      remaining.splice(remaining.findIndex(x=>x.member_key===p.member_key),1);left[task]--;
    }
  }
  return assignments;
}
export function organizeEventWar({pool,bench,excluded,prior,def,opponent,knowledge,rank}){
  const count=Math.min(def.capacity??pool.length,pool.length);
  if(def.mode!=="battlefield"){
    const participants=[...pool].sort(rank).slice(0,count);
    return {participants,substitutes:[],assignments:participants.map(p=>({...p,role:"contributor",
      reason:fresh(p)?"balanced_role_coverage":"power_or_freshness_missing"})),
      substitute_assignments:[],replacement_proposals:[],withdrawn_assignments:[],role_coverage:null,
      plan_b_mobile_action:null};
  }
  const setup=policy(def.id,opponent,knowledge),targets=quotas(count,setup.weights);
  const assignments=mainLineup(pool,count,targets,rank);
  const participants=assignments.map(({role,covers_role,reason,...p})=>p);
  const available=[...bench].sort(rank),maxPower=strengthScale([...pool,...bench]);
  const vacancies=(Array.isArray(prior)?prior:[]).filter(p=>p&&(typeof p==="object"||typeof p==="string")).map(p=>{
    const key=typeof p==="string"?p:String(p.member_key||p.canonical_member_key||p.lifecycle_key||p.player_id||"").trim();
    const departed=excluded.find(x=>x.member_key===key);
    return departed?{...departed,role:normalizeWarRole(p.role),covers_role:normalizeWarRole(p.covers_role||p.role)}:null;
  }).filter(Boolean).filter((p,i,list)=>list.findIndex(x=>x.member_key===p.member_key)===i)
    .slice(0,Math.max(0,def.capacity-count));
  // Reserve priority first serves real vacancies, then uncovered essentials,
  // then complements the principal lineup with diversified backup tasks.
  const pending=matchWarSlots(available,vacancies.slice(0,def.substitutes),(p,t)=>compatibility(p,t,t.covers_role,maxPower));
  const picks=pending.map(({candidate,target})=>({...candidate,target,trigger:"starter_absent"}));
  const used=new Set(picks.map(p=>p.member_key));
  const covered=Object.fromEntries(ROLES.map(r=>[r,assignments.filter(a=>a.role===r).length]));
  const needs=[...ROLES].sort((a,b)=>(targets[b]-covered[b])-(targets[a]-covered[a])||
    Number(CORE.includes(b))-Number(CORE.includes(a))||setup.weights[ROLES.indexOf(b)]-setup.weights[ROLES.indexOf(a)]);
  const limit=Math.min(def.substitutes,bench.length),tasks=[];
  for(let i=0;i<limit-picks.length;i++){
    const role=needs[i%needs.length];
    const starters=assignments.filter(a=>a.role===role||a.covers_role===role);
    // Prefer a starter of comparable profile; null still has a precise role target.
    tasks.push({role,starters});
  }
  const backup=matchWarSlots(available.filter(p=>!used.has(p.member_key)),tasks,(p,t)=>
    t.starters.length?Math.max(...t.starters.map(a=>compatibility(p,a,t.role,maxPower))):fitness(p,t.role,maxPower));
  const coveredStarters=new Set();
  for(const {candidate:p,target:t} of backup){
    const uncovered=t.starters.filter(a=>!coveredStarters.has(a.member_key));
    const target=[...(uncovered.length?uncovered:t.starters)].sort((a,b)=>compatibility(p,b,t.role,maxPower)-compatibility(p,a,t.role,maxPower)||a.name.localeCompare(b.name))[0]||null;
    if(target)coveredStarters.add(target.member_key);
    picks.push({...p,target:target?{...target,covers_role:t.role}:null,task:t.role,trigger:TRIGGER[t.role]});
  }
  const substitute_assignments=picks.map((p,i)=>{
    const role=p.target?.covers_role||p.task||"rapid_intervention";
    return {...p,target:undefined,task:undefined,trigger:undefined,
      priority:i+1,role:fresh(p)?BACKUP[role]||"versatile_reserve":"mobile_reserve",
      covers_role:role,entry_trigger:p.trigger||TRIGGER[role],entry_requires_slot:true,
      reason:fresh(p)?"cover_starter_role":"limited_data",
      replacement_for:p.target?{member_key:p.target.member_key,name:p.target.name,role}:null};
  });
  const substitutes=substitute_assignments.map(({priority,role,covers_role,entry_trigger,entry_requires_slot,reason,replacement_for,target,task,trigger,...p})=>p);
  const replacement_proposals=pending.map(({candidate:p,target:t})=>({
    departed_member_key:t.member_key,departed_name:t.name,substitute_member_key:p.member_key,substitute_name:p.name,role:t.covers_role}));
  return {participants,substitutes,assignments,substitute_assignments,replacement_proposals,
    withdrawn_assignments:vacancies,role_coverage:{targets,covered,reserve: Object.fromEntries(ROLES.map(r=>[r,substitute_assignments.filter(s=>s.covers_role===r).length]))},
    plan_b_mobile_action:setup.mobile_action};
}