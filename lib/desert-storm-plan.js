/* WarBoost V2.5.28 HF8.5 FINAL — Desert Storm tactical planner
   Grounded in the current in-game rules supplied by the player on 2026-09-11.
   The engine intentionally avoids exact phase timers so a Last War timing change
   cannot make the plan unsafe; it reacts to "opening / center open / late" phases.
*/

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
function freshnessWeight(updatedAt,nowMs){const ts=Date.parse(updatedAt||'');if(!Number.isFinite(ts))return .7;const days=Math.max(0,(nowMs-ts)/86400000);if(days<=2)return 1;if(days<=7)return .92;if(days<=30)return .78;return .62}
function memberScore(member,nowMs){
  const power=num(member?.power_m),hq=num(member?.hq_level),fresh=freshnessWeight(member?.updated_at,nowMs);
  // Power is useful only when present; role/HQ keep unknown-power players from being discarded.
  const powerPart=power===null?0:Math.log10(Math.max(1,power))*26;
  const hqPart=hq===null?0:Math.min(40,hq)*1.15;
  return Math.round((powerPart+hqPart+roleWeight(member?.role)*4)*fresh*100)/100;
}
function evidence(member,nowMs){
  const power=num(member?.power_m),hq=num(member?.hq_level),fresh=freshnessWeight(member?.updated_at,nowMs);
  return {power_known:power!==null&&power>0,hq_known:hq!==null&&hq>0,freshness:fresh,score:memberScore(member,nowMs)};
}
function allocateBalanced(players,count){
  const groups=Array.from({length:Math.max(1,count)},(_,i)=>({id:i+1,members:[],score:0}));
  for(const player of players){
    groups.sort((a,b)=>a.score-b.score||a.members.length-b.members.length||a.id-b.id);
    const g=groups[0];g.members.push(player);g.score+=player._score||0;
  }
  return groups.sort((a,b)=>b.score-a.score||a.id-b.id).map((g,i)=>({...g,id:i+1,captain:g.members[0]?.name||''}));
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
  const byKey=new Map(active.map(m=>[clean(m?.lifecycle_key||m?.key||m?.roster_key),m]).filter(([k])=>k));
  const selected=[];const seen=new Set();
  for(const rawKey of Array.isArray(registeredKeys)?registeredKeys:[]){const key=clean(rawKey);if(!key||seen.has(key))continue;seen.add(key);const m=byKey.get(key);if(m)selected.push({...m,_key:key});}
  // Fallback: if caller supplies member objects with _registered flag.
  if(!selected.length){for(const m of active){if(m?._registered===true){const k=clean(m?._key||m?.lifecycle_key||m?.key||m?.name);if(k&&!seen.has(k)){seen.add(k);selected.push({...m,_key:k})}}}}
  const scored=selected.map(m=>({...m,_evidence:evidence(m,nowMs),_score:memberScore(m,nowMs)})).sort((a,b)=>b._score-a._score||String(a.name||'').localeCompare(String(b.name||'')));
  const capped=scored.slice(0,30),starters=capped.slice(0,DESERT_STORM_RULESET.max_starters),substitutes=capped.slice(DESERT_STORM_RULESET.max_starters,30);
  const gCount=groupCount(starters.length),groups=allocateBalanced(starters,gCount).map((g,i)=>({...g,mission:missionFor(i,gCount)}));
  const knownPower=starters.filter(x=>x._evidence.power_known).length,knownHq=starters.filter(x=>x._evidence.hq_known).length;
  const evidenceRatio=starters.length?((knownPower+knownHq)/(starters.length*2)):0;
  const confidence=Math.round(Math.max(20,Math.min(96,45+evidenceRatio*45+(starters.length>=18?6:starters.length>=10?2:-8))));
  const warnings=[];
  if(selected.length>30)warnings.push({code:'too_many_registered',count:selected.length-30});
  if(starters.length<20)warnings.push({code:'starter_shortage',count:20-starters.length});
  const unknown=starters.filter(x=>!x._evidence.power_known||!x._evidence.hq_known).length;if(unknown)warnings.push({code:'partial_player_data',count:unknown});
  if(starters.length<6&&starters.length)warnings.push({code:'very_small_team',count:starters.length});
  return {
    ruleset:DESERT_STORM_RULESET.observed_at,
    team:String(team||'A').toUpperCase()==='B'?'B':'A',battle_time:clean(battleTime),
    registered_count:selected.length,starters:starters.map(stripInternal),substitutes:substitutes.map(stripInternal),
    groups:groups.map(g=>({id:g.id,captain:g.captain,score:Math.round(g.score),mission:g.mission,members:g.members.map(stripInternal)})),
    confidence,warnings,
    principles:{opening:['oil_refineries','science_hub','info_center','field_hospitals'],center:['nuclear_silo','arsenal','mercenary_factory'],late:['hold_objectives','oil_wells_if_stable'],avoid:['chasing_kills_far_from_objectives','treating_registration_as_attendance','assuming_missing_data_means_inactive']}
  };
}
function stripInternal(m){const {_score,_evidence,_key,...rest}=m;return {...rest,plan_score:_score||0,plan_evidence:_evidence||{}}}
