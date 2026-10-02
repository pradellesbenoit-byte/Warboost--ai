import {eventDefinition,eventKnowledge} from "./event-knowledge.js";
import {normalizeEventAvailabilities} from "./event-availability.js";
import {participationEventRecords} from "./activity-events.js";
import {rosterLifecycleKey,currentActiveRosterMembers} from "./alliance-roster-lifecycle.js";
import {vsSnapshotFreshness} from "./vs-live.js";

const clean=v=>String(v??"").trim();
const positive=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};
const stamp=v=>{const n=Date.parse(v||"");return Number.isFinite(n)?n:null};
const keys=m=>[m?.canonical_member_key,m?.lifecycle_key,m?.member_key,m?.player_id,rosterLifecycleKey(m),m?.name,m?.member_name].map(clean).filter(Boolean);
const identity=m=>keys(m)[0]||"";
const active=m=>!m?.removed_at&&!m?.departed_at&&!["removed","former","departed"].includes(m?.roster_status||m?.status);
function evidence(member,row,event,nowMs){
  const power=positive(member.squad_power_m??member.main_squad_power_m);
  const account=positive(member.power_m),at=power!==null?member.squad_power_updated_at:member.power_updated_at;
  const ts=stamp(at),age=ts===null?null:Math.max(0,(nowMs-ts)/864e5);
  const history=participationEventRecords(member.activity_events,{nowMs,days:30}).filter(r=>r.event_type===event||event==="season"&&r.event_type==="season_war");
  const attended=history.filter(r=>r.participation_status==="participated").length;
  const absent=history.filter(r=>r.participation_status==="absent_confirmed").length;
  // Only actual outcomes form reliability; unknown/not selected/excused are not failures.
  const reliability=attended+absent?attended/(attended+absent):null;
  return {power_m:power??account,power_kind:power!==null?"squad":account!==null?"account_fallback":"unknown",
    updated_at:at||null,age_days:age,stale:age===null||age>14||ts>nowMs+300000,
    squad_type:["tank","aircraft","missile","mixed"].includes(member.squad_type)?member.squad_type:null,
     squad_id:member.squad_id!==null&&member.squad_id!==undefined&&Number.isInteger(Number(member.squad_id))?Number(member.squad_id):null,
     squad_heroes:(Array.isArray(member.squad_heroes)?member.squad_heroes:[]).map(clean).filter(Boolean).slice(0,5),
    confirmed_participations:attended,confirmed_absences:absent,reliability,
    availability_source:row.source||null,availability_at:row.updated_at||null,
    registration_only:row.source==="explicit_registration"};
}
function opponentContext(raw,nowMs){
  const ts=stamp(raw?.updated_at),age=ts===null?null:(nowMs-ts)/864e5;
  const known=raw?.confirmed===true&&clean(raw?.source)&&age!==null&&age>=0&&age<=1&&["stronger","similar","weaker"].includes(raw?.strength);
  return {strength:known?raw.strength:"unknown",source:known?raw.source:null,updated_at:known?raw.updated_at:null,
    conditional:!known,roster_inferred:false};
}
export function buildEventStrategy({event_type="other",members=[],availability=[],event_instance="current",slot=null,nowMs=Date.now(),opponent=null,faction=null,context={}}={}){
  const def=eventDefinition(event_type),type=def.id,knowledge=eventKnowledge(type,{nowMs});
  const people=[...new Map((Array.isArray(members)?members:[]).filter(active).filter(m=>identity(m)).map((m,i)=>[
    clean(m.canonical_member_key||m.lifecycle_key||m.member_key||m.player_id)||`unresolved:${i}`,m])).values()];
  const rows=normalizeEventAvailabilities(availability).filter(r=>r.event_type===type&&(r.event_instance||"current")===event_instance&&(!slot||!r.time_slot||r.time_slot===slot));
  const selected=[],bench=[],confirmation=[],excluded=[];
  for(const member of people){
    const memberKeys=new Set(keys(member));
    // An alias is usable only when it identifies this one roster member.
    const matches=rows.filter(r=>{
      const observed=stamp(r.updated_at);
      // An unsourced cloud placeholder or impossible future date cannot erase a declaration.
      if(!r.source||r.source==="legacy"||observed===null||observed>nowMs+300000)return false;
      const canonical=clean(r.canonical_member_key||r.lifecycle_key||r.member_key);
      if(canonical)return memberKeys.has(canonical)&&people.filter(p=>keys(p).includes(canonical)).length===1;
      return keys(r).some(k=>memberKeys.has(k)&&people.filter(p=>keys(p).includes(k)).length===1);
    })
      .sort((a,b)=>(stamp(b.updated_at)||0)-(stamp(a.updated_at)||0));
    const row=matches[0]||{status:"unknown"},data=evidence(member,row,type,nowMs);
    data.registration_only=context.attendance_basis==="registration_only";
    const item={member_key:identity(member),name:clean(member.name),attendance_status:row.status||"unknown",evidence:data};
    const sourced=Boolean(row.source&&row.source!=="legacy"&&stamp(row.updated_at)!==null);
    const observed=stamp(row.updated_at),tooOld=observed!==null&&(nowMs-observed>14*864e5||observed>nowMs+300000);
    if(!sourced||tooOld||!["present","absent","substitute"].includes(row.status))confirmation.push(item);
    else if(row.status==="absent")excluded.push(item);
    else if(row.status==="substitute"&&def.substitutes)bench.push(item);
    else if(row.status==="present")selected.push(item);
    else confirmation.push(item);
  }
  const quality=p=>p.evidence.power_kind==="squad"?(p.evidence.stale?2:3):p.evidence.power_kind==="account_fallback"?1:0;
  const rank=(a,b)=>quality(b)-quality(a)||(b.evidence.power_m||0)-(a.evidence.power_m||0)||
    b.evidence.confirmed_participations-a.evidence.confirmed_participations||
    (b.evidence.reliability??.5)-(a.evidence.reliability??.5)||a.name.localeCompare(b.name);
  const ranked=selected.sort(rank);
  const participants=def.capacity===null?ranked:ranked.slice(0,def.capacity);
  // Explicit replacements only: no inference from an excess of present players.
  const substitutes=bench.sort(rank).slice(0,def.substitutes);
  const overflow=ranked.slice(participants.length).concat(bench.slice(substitutes.length));
  const assignments=participants.map((p,i)=>{
    const known=p.evidence.power_kind==="squad"&&!p.evidence.stale;
    const role=def.mode!=="battlefield"?"contributor":!known?"flexible":i===0?"anchor":i%3===1?"capture":i%3===2?"mobile":"defense";
    return {...p,role,reason:!known?"power_or_freshness_missing":role==="anchor"?"highest_fresh_squad_evidence":"balanced_objective_coverage"};
  });
  // A reserve stays a reserve until a manager confirms the swap. Recompute proposals
  // from current declarations; never turn absence or overflow into reserve status.
  const prior=Array.isArray(context.previous_participants)?context.previous_participants:[];
  const vacancies=prior.filter(p=>p&&(typeof p==="string"||typeof p==="object")).map(p=>{
    const key=typeof p==="string"?p:clean(p.member_key||p.canonical_member_key||p.lifecycle_key||p.player_id);
    const departed=excluded.find(x=>x.member_key===key);
    return departed?{...departed,role:["anchor","capture","mobile","defense","flexible","contributor"].includes(p.role)?p.role:"flexible"}:null;
  }).filter(Boolean).filter((p,i,list)=>list.findIndex(x=>x.member_key===p.member_key)===i)
    .slice(0,Math.max(0,(def.capacity??participants.length)-participants.length));
  const fresh=p=>p.evidence.power_kind==="squad"&&!p.evidence.stale;
  const targetScore=(p,target)=>[
    fresh(p)?1:0,
    target.evidence.squad_type&&p.evidence.squad_type===target.evidence.squad_type?1:0,
    target.evidence.squad_heroes.filter(h=>p.evidence.squad_heroes.includes(h)).length,
    fresh(p)?p.evidence.power_m||0:0,
    p.evidence.reliability??.5,p.evidence.confirmed_participations
  ];
  const compareTarget=(a,b,target)=>{
    const aa=targetScore(a,target),bb=targetScore(b,target);
    for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return bb[i]-aa[i];
    return a.name.localeCompare(b.name);
  };
  const remaining=[...substitutes],picked=[],replacement_proposals=[];
  for(const target of vacancies){
    const candidate=remaining.sort((a,b)=>compareTarget(a,b,target)).shift();
    if(!candidate)break;
    const replacement_for={member_key:target.member_key,name:target.name,role:target.role};
    picked.push({...candidate,replacement_for});
    replacement_proposals.push({departed_member_key:target.member_key,departed_name:target.name,
      substitute_member_key:candidate.member_key,substitute_name:candidate.name,role:target.role});
  }
  const covered=role=>assignments.filter(a=>a.role===role).length;
  const needs=["defense","capture","mobile"].sort((a,b)=>covered(a)-covered(b));
  const reserveRole={anchor:"reserve_power",capture:"objective_capture",mobile:"mobile_reserve",defense:"objective_defense",flexible:"versatile_reserve",contributor:"group_support"};
  const substitute_assignments=[...picked,...remaining.sort(rank)].map((p,i)=>{
    const target=p.replacement_for||assignments.filter(a=>a.role===(i===0?"anchor":needs[(i-1)%needs.length]))
      .sort((a,b)=>compareTarget(a,b,p))[0];
    const role=fresh(p)?reserveRole[target?.role]||"group_support":"mobile_reserve";
    return {...p,priority:i+1,role,reason:fresh(p)?"cover_starter_role":"limited_data",
      replacement_for:target?{member_key:target.member_key,name:target.name,role:target.role}:null};
  });
  const coverage=participants.filter(p=>p.evidence.power_kind==="squad"&&!p.evidence.stale).length;
  const confidence=participants.length?Math.round(35+50*coverage/participants.length):0;
  let phases=type==="desert_storm"
    ?[{id:"preparation",objectives:["attendance","current_rules","groups"]},{id:"opening",objectives:["oil_refineries","science_hub","info_center","field_hospitals"]},{id:"center_open",objectives:["nuclear_silo","arsenal","mercenary_factory"]},{id:"late",objectives:["hold_objectives","oil_wells_if_stable"]}]
    :type==="canyon_storm"
    ?[{id:"preparation",objectives:["attendance","faction","current_rules"]},{id:"opening",objectives:["data_centers","sample_warehouses","power_tower"]},{id:"center_open",objectives:["virus_lab","power_tower"]},{id:"late",objectives:["hold_objectives","relief"]}]
    :[{id:"preparation",objectives:["attendance","visible_tasks","resource_reserve"]},{id:"active",objectives:[type==="vs"?"today_scoring_tasks":type==="season"?"confirmed_active_season":"confirmed_event_objectives"]},{id:"review",objectives:["record_actual_outcomes"]}];
  const refreshRequired=context.stale===true||context.refresh_required===true||
    (type==="vs"&&(!Number.isInteger(Number(context.day))||context.day===null||context.day===undefined||Number(context.day)<0||Number(context.day)>6||
      (Number(context.day)>0&&!vsSnapshotFreshness(context,{now:new Date(nowMs)}).current)));
  const ended=context.time_remaining_seconds!==null&&context.time_remaining_seconds!==undefined&&Number(context.time_remaining_seconds)<=0;
  if((type==="season"&&context.lifecycle!=="active")||(type==="vs"&&
    (Number(context.day)===0||ended||refreshRequired))){
    phases=phases.filter(p=>p.id!=="active");
  }
  const warnings=[];
  if(!participants.length)warnings.push("no_confirmed_participants");
  if(confirmation.length)warnings.push("availability_to_confirm");
  if(overflow.length)warnings.push("capacity_overflow_not_substitutes");
  if(coverage<participants.length)warnings.push("incomplete_or_stale_squad_data");
  if(knowledge.rules.some(r=>!r.planning_allowed))warnings.push("rules_need_review");
  if(type==="canyon_storm"&&!["instigators","scouts"].includes(faction))warnings.push("faction_to_confirm");
  return {event_type:type,generated_at:new Date(nowMs).toISOString(),event_instance,
    capacity:{participants:def.capacity??people.length,substitutes:def.substitutes,open_roster:def.capacity===null},
    participants,substitutes,confirmation,excluded,overflow,assignments,substitute_assignments,replacement_proposals,withdrawn_assignments:vacancies,phases,
    opponent:opponentContext(opponent,nowMs),faction:faction||null,
    context:{day:context.day??null,theme:clean(context.theme)||null,lifecycle:context.lifecycle||null,
      refresh_required:refreshRequired,
      ended,attendance_basis:context.attendance_basis||"explicit_availability"},
    data_confidence:confidence,confidence_kind:"input_coverage_not_win_probability",coverage:{fresh_squad:coverage,total:participants.length},
    priorities:["confirm_attendance_and_rules","coordinate_objectives","preserve_reserve"],
    plan_b:{trigger:"opponent_stronger_or_objectives_lost",action:"concentrate_on_fewer_defendable_objectives"},
    plan_c:{trigger:"late_deficit_or_missing_players",action:"reassign_confirmed_players_and_reassess_visible_score"},
    knowledge,warnings};
}
export function eventStrategyFromState(state={},event_type="other",options={}){
  const members=currentActiveRosterMembers(state.alliance?.members||[],state.alliance?.roster_review||[],state.alliance?.former_members||[],state.alliance?.removal_tombstones||[]);
  return buildEventStrategy({event_type,members,
    availability:[...(state.alliance?.event_availability||[]),...members.flatMap(m=>m.event_availability||[])],
    context:event_type==="vs"?state.vs:event_type==="season"?state.season:{},
    faction:state.alliance?.canyon?.faction,...options});
}