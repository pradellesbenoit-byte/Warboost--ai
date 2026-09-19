/* WarBoost V2.5.28 HF8.5 FINAL — Desert Storm tactical planner
   Grounded in the current in-game rules supplied by the player on 2026-09-11.
   The engine intentionally avoids exact phase timers so a Last War timing change
   cannot make the plan unsafe; it reacts to "opening / center open / late" phases.
 */
import {rosterLifecycleKey} from "./alliance-roster-lifecycle.js";

export const DESERT_STORM_RULESET={
  observed_at:'2026-09-11',
  max_starters:20,
  max_substitutes:10,
  structures:{
    nuclear_silo:{alliance_pps:80,individual_pps:30,phase:'center',priority:100},
    oil_refinery:{alliance_pps:50,individual_pps:30,phase:'opening',priority:92,quantity:2},
    field_hospital:{alliance_pps:30,individual_pps:30,phase:'opening',priority:82,quantity:4,bonus:'troop_recovery'},
    science_hub:{alliance_pps:10,individual_pps:30,phase:'opening',priority:88,bonus:'free_relocation_cooldown_reduced_50pct'},
    info_center:{alliance_pps:10,individual_pps:30,phase:'opening',priority:90,bonus:'captured_building_output_plus_10pct'},
    arsenal:{alliance_pps:10,individual_pps:30,phase:'center',priority:94,bonus:'allied_hero_atk_def_hp_plus_15pct'},
    mercenary_factory:{alliance_pps:10,individual_pps:30,phase:'center',priority:94,bonus:'enemy_hero_atk_def_hp_minus_15pct'},
    oil_well:{alliance_pps:null,individual_pps:null,phase:'late',priority:35}
  },
  guards:[
    'registration_is_not_participation',
    'missing_power_never_means_weak_or_inactive',
    'former_members_are_not_selectable',
    'do_not_assume_substitution_mechanics_beyond_current_visible_rules'
  ]
};

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function clean(v){return String(v??'').trim()}
function roleWeight(role){return ({R5:5,R4:4,R3:3,R2:2,R1:1})[String(role||'R1').toUpperCase()]||1}

function cleanSquadType(v){const x=String(v||'').trim().toLowerCase();return ['aircraft','tank','missile','mixed'].includes(x)?x:null}
function squadProfile(member={}){
  if(member?.warboost_linked!==true)return {known:false,id:null,type:null,heroes:[],updated_at:null};
  const heroes=(Array.isArray(member?.squad_heroes)?member.squad_heroes:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,5);
  const type=cleanSquadType(member?.squad_type),id=num(member?.squad_id);
  return {known:Boolean(type||heroes.length),id:id!==null?id:null,type,heroes,updated_at:member?.squad_profile_updated_at||member?.squad_power_updated_at||null};
}

function dataAgeDays(updatedAt,nowMs){const ts=Date.parse(updatedAt||'');return Number.isFinite(ts)?Math.max(0,(nowMs-ts)/86400000):null}
function freshnessWeight(updatedAt,nowMs){const days=dataAgeDays(updatedAt,nowMs);if(days===null)return .7;if(days<=2)return 1;if(days<=7)return .92;if(days<=14)return .86;if(days<=30)return .76;return .6}
function combatPower(member={}){
  const squad=num(member?.squad_power_m??member?.main_squad_power_m),account=num(member?.power_m);
  if(squad!==null&&squad>0)return {value:squad,source:"squad",updated_at:member?.squad_power_updated_at||member?.updated_at||null};
  if(account!==null&&account>0)return {value:account,source:"account",updated_at:member?.updated_at||null};
  return {value:null,source:"unknown",updated_at:member?.updated_at||null};
}
function memberScore(member,nowMs){
  const cp=combatPower(member),account=num(member?.power_m),hq=num(member?.hq_level),fresh=freshnessWeight(cp.updated_at,nowMs);
  // Combat plan priority: real squad power first. Account power is only a fallback when squad data is missing.
  // HQ and alliance rank are intentionally secondary and cannot outweigh a known squad-power advantage.
  const combatPart=cp.source==="squad"?cp.value*4.5:cp.source==="account"?cp.value*.55:0;
  const accountContext=cp.source==="squad"&&account!==null?Math.min(500,account)*.04:0;
  const hqPart=hq===null?0:Math.min(40,hq)*.65;
  const rolePart=roleWeight(member?.role)*.8;
  return Math.round((combatPart+accountContext+hqPart+rolePart)*fresh*100)/100;
}
function evidence(member,nowMs){
  const cp=combatPower(member),power=num(member?.power_m),hq=num(member?.hq_level),fresh=freshnessWeight(cp.updated_at,nowMs),profile=squadProfile(member);
  return {power_known:power!==null&&power>0,squad_power_known:cp.source==="squad",squad_profile_known:profile.known,squad_id:profile.id,squad_type:profile.type,squad_heroes:profile.heroes,squad_profile_updated_at:profile.updated_at,combat_power_source:cp.source,combat_power_m:cp.value,hq_known:hq!==null&&hq>0,freshness:fresh,data_age_days:dataAgeDays(cp.updated_at,nowMs),score:memberScore(member,nowMs)};
}
function allocateBalanced(players,count){
  const groups=Array.from({length:Math.max(1,count)},(_,i)=>({id:i+1,members:[],score:0,types:{aircraft:0,tank:0,missile:0,mixed:0}}));
  for(const player of players){
    const type=cleanSquadType(player?._evidence?.squad_type);
    groups.sort((a,b)=>{
      const scoreDiff=a.score-b.score;
      // Combat strength remains primary. Squad type only breaks near-equivalent placements
      // so WarBoost distributes known aircraft/tank/missile profiles instead of stacking them.
      if(Math.abs(scoreDiff)>10)return scoreDiff;
      if(type){const typeDiff=(a.types[type]||0)-(b.types[type]||0);if(typeDiff)return typeDiff}
      return scoreDiff||a.members.length-b.members.length||a.id-b.id;
    });
    const g=groups[0];g.members.push(player);g.score+=player._score||0;if(type)g.types[type]=(g.types[type]||0)+1;
  }
  return groups.sort((a,b)=>b.score-a.score||a.id-b.id).map((g,i)=>({...g,id:i+1,captain:g.members[0]?.name||'',squad_types:{...g.types}}));
}
function groupCount(n){if(n>=18)return 5;if(n>=14)return 4;if(n>=10)return 3;if(n>=6)return 2;return 1}
function missionFor(index,total){
  const table=[
    {opening:'refinery_science',center:'silo_anchor',late:'hold_silo'},
    {opening:'refinery_info',center:'silo_support',late:'hold_refinery'},
    {opening:'hospital_pair',center:'arsenal',late:'support_silo'},
    {opening:'hospital_pair',center:'mercenary_factory',late:'support_weak_side'},
    {opening:'mobile_capture',center:'silo_mobile',late:'oil_wells_if_stable'}
  ];
  if(total===1)return {opening:'compact_opening',center:'silo_anchor',late:'hold_best_objectives'};
  if(total===2)return index===0?{opening:'refinery_science',center:'silo_anchor',late:'hold_best_objectives'}:{opening:'refinery_info_hospital',center:'buff_or_silo_support',late:'mobile_support'};
  if(total===3)return [table[0],table[1],{opening:'hospitals_mobile',center:'buffs_then_silo',late:'mobile_support'}][index]||table[2];
  if(total===4)return table[index]||table[3];
  return table[index]||table[4];
}

export function buildDesertStormPlan(members=[],registeredKeys=[],{nowMs=Date.now(),team='A',battleTime=''}={}){
  const active=Array.isArray(members)?members:[];
  const byKey=new Map();
  for(const member of active){
    const keys=[member?.canonical_member_key,member?.lifecycle_key,rosterLifecycleKey(member),member?.key,member?.roster_key].map(clean).filter(Boolean),stable=keys[0];
    if(!stable)continue;
    for(const key of keys){
      if(!byKey.has(key))byKey.set(key,{member,stable});
      else if(byKey.get(key)?.stable!==stable)byKey.set(key,null);
    }
  }
  const selected=[];const seen=new Set();
  for(const rawKey of Array.isArray(registeredKeys)?registeredKeys:[]){const key=clean(rawKey);if(!key||seen.has(key))continue;const match=byKey.get(key);if(match?.member){if(seen.has(match.stable))continue;seen.add(key);seen.add(match.stable);selected.push({...match.member,_key:match.stable});}}
  // Fallback: if caller supplies member objects with _registered flag.
  if(!selected.length){for(const m of active){if(m?._registered===true){const k=clean(m?._key||m?.lifecycle_key||m?.key||m?.name);if(k&&!seen.has(k)){seen.add(k);selected.push({...m,_key:k})}}}}
  const scored=selected.map(m=>({...m,_evidence:evidence(m,nowMs),_score:memberScore(m,nowMs)})).sort((a,b)=>b._score-a._score||String(a.name||'').localeCompare(String(b.name||'')));
  // Registration is intentionally unbounded. The battle output still has its game-rule
  // capacity (20 starters + 10 substitutes), but registered_count always reports every
  // selected member and no selection is discarded from state.
  const starters=scored.slice(0,DESERT_STORM_RULESET.max_starters),substitutes=scored.slice(DESERT_STORM_RULESET.max_starters,DESERT_STORM_RULESET.max_starters+DESERT_STORM_RULESET.max_substitutes);
  const gCount=groupCount(starters.length),groups=allocateBalanced(starters,gCount).map((g,i)=>({...g,mission:missionFor(i,gCount)}));
  const knownSquad=starters.filter(x=>x._evidence.squad_power_known).length,knownProfile=starters.filter(x=>x._evidence.squad_profile_known).length,knownPower=starters.filter(x=>x._evidence.power_known).length,knownHq=starters.filter(x=>x._evidence.hq_known).length;
  const squadFreshness=starters.length?starters.reduce((sum,x)=>sum+(x._evidence.squad_power_known?x._evidence.freshness:0),0)/starters.length:0;
  const evidenceRatio=starters.length?((knownSquad+knownProfile*.35+knownPower*.45+knownHq*.25)/(starters.length*2.05)):0;
  const confidence=Math.round(Math.max(20,Math.min(96,34+evidenceRatio*38+squadFreshness*20+(starters.length>=18?4:starters.length>=10?1:-7))));
  const warnings=[];
  if(selected.length>30)warnings.push({code:'too_many_registered',count:selected.length-30});
  if(starters.length<20)warnings.push({code:'starter_shortage',count:20-starters.length});
  const unknown=starters.filter(x=>!x._evidence.squad_power_known).length;if(unknown)warnings.push({code:'partial_player_data',count:unknown});
  const profileUnknown=starters.filter(x=>x._evidence.squad_power_known&&!x._evidence.squad_profile_known).length;if(profileUnknown)warnings.push({code:'partial_squad_profile',count:profileUnknown});
  const stale=starters.filter(x=>x._evidence.squad_power_known&&x._evidence.data_age_days!==null&&x._evidence.data_age_days>14).length;if(stale)warnings.push({code:'stale_squad_data',count:stale});
  if(starters.length<6&&starters.length)warnings.push({code:'very_small_team',count:starters.length});
  return {
    ruleset:DESERT_STORM_RULESET.observed_at,
    team:String(team||'A').toUpperCase()==='B'?'B':'A',battle_time:clean(battleTime),
    registered_count:selected.length,starters:starters.map(stripInternal),substitutes:substitutes.map(stripInternal),
    groups:groups.map(g=>({id:g.id,captain:g.captain,score:Math.round(g.score),mission:g.mission,squad_types:g.squad_types,members:g.members.map(stripInternal)})),
    squad_profile_coverage:{known:knownProfile,total:starters.length,ratio:starters.length?Math.round((knownProfile/starters.length)*100):0},
    confidence,warnings,
    principles:{opening:['oil_refineries','science_hub','info_center','field_hospitals'],center:['nuclear_silo','arsenal','mercenary_factory'],late:['hold_objectives','oil_wells_if_stable'],avoid:['chasing_kills_far_from_objectives','treating_registration_as_attendance','assuming_missing_data_means_inactive']}
  };
}
function stripInternal(m){const {_score,_evidence,_key,...rest}=m;return {...rest,plan_score:_score||0,plan_evidence:_evidence||{}}}
