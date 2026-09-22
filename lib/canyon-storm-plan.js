import {planAvailabilityRoster,normalizeAvailabilityRecord,normalizeAvailabilityRecords,mergeAvailabilityRecords,recommendBestSlot} from './alliance-availability-planner.js';
import {rosterLifecycleKey} from './alliance-roster-lifecycle.js';

export const CANYON_STORM_RULESET=Object.freeze({
  observed_at:'2026-09-22',
  event_type:'canyon_storm',max_starters:20,max_substitutes:10,
  structures:Object.freeze({
    data_center_i:{alliance_pps:20,phase:1},sample_warehouse_i:{alliance_pps:15,phase:1},
    power_tower:{alliance_pps:50,phase:1,effect:'instigators_central_safe_zone_shield'},
    virus_lab:{alliance_pps:120,phase:3},defense_system_i:{alliance_pps:20,phase:2,effect:'automatic_attack_and_garrison_damage'},
    serum_factory_i:{alliance_pps:20,phase:2,effect:'periodic_commander_buff_to_confirm'},
    power_plant:{alliance_pps:null,phase:2,effect:'collect_with_inactive_queues'},
    point_supply_box:{alliance_pps:null,phase:2,effect:'recover_excess_points'}
  }),
  skills:Object.freeze({
    seismic_tower:{faction:'instigators',duration:30,cost:500000,cooldown:300,arrival_durability:1000,
      then_every_seconds:3,durability:300,severely_wounded:+60},
    field_hospital:{faction:'universal',duration:30,cost:500000,cooldown:300,every_seconds:3,restore_durability:300,heal_wounded:150},
    artillery_turret:{faction:'scouts',duration:30,cost:750000,cooldown:300,every_seconds:2,durability:300,severely_wounded:+60},
    doomsday:{faction:'adjudicator',duration:120,cost:1000000,cooldown:300,teleport_effects:5000,
      cooldown_reduction_on_destroy_seconds:30,destroyed_enemy_base_teleport_cooldown:+60}
  }),
  energy_categories:{battle:null,assistance:null,strategy_garrison:null},
  rules:Object.freeze({
    victory:'highest_battlefield_points_at_end',
    instigators:{task_forces:1,numerical_advantage:false,passive_bonuses:true,adjudicator_possible:true},
    scouts:{task_forces:2,numerical_advantage:true},
    entry:['participant_or_substitute','registered_alliance_member','base_outside_contaminated_lands_near_capitol'],
    start:'protected_starting_zone'
  })
});

const SOURCES=new Set(['confirmed_rule','player_data','alliance_data']);
const clean=v=>String(v??'').trim();
function factionOf(v){const s=clean(v).toLowerCase().replace(/[\s-]+/g,'_');return ['instigators','scouts'].includes(s)?s:null}
function sourceList(v){return [...new Set((Array.isArray(v)?v:[v]).filter(x=>SOURCES.has(x)))];}
function why(text,sources){return {why:text,sources:sourceList(sources)}}
export function buildCanyonPlan(members=[],availability=[],{
  faction=null,status='preparation',date=null,time=null,event_type='canyon_storm',max_starters=20,max_substitutes=10,adjudicator_key=null
}={}){
  const faction_to_confirm=!factionOf(faction), factionKey=factionOf(faction);
  const suggestedSlot=recommendBestSlot(availability,{event_type}),selectedSlot=clean(time)||(suggestedSlot.slot&&suggestedSlot.slot!=='to_confirm'?suggestedSlot.slot:null);
  const roster=planAvailabilityRoster(members,availability,{event_type,max_starters,max_substitutes,slot:selectedSlot});
  const participants=roster.starters.map((member,index)=>{
    const roles=['capture','defense_garrison','mobile_reaction','collection_energy'];
    const role=roles[index%roles.length];
     return {...member,role,...why(
      role==='capture'?'Confirmed canyon structure objectives require active capture coverage.':
      role==='defense_garrison'?'Confirmed defensive structures require a garrison assignment.':
      role==='mobile_reaction'?'Confirmed mobile coverage keeps reactions available between objectives.':
      'Confirmed energy objectives require collection coverage.',
      ['confirmed_rule','player_data'])};
  });
  if(factionKey==='instigators'){
    const adjudicator=roster.starters.find(x=>[x.canonical_member_key,x.lifecycle_key,x.name].includes(adjudicator_key))||roster.starters[0];
    if(adjudicator){
      const hit=participants.find(x=>x.name===adjudicator.name);if(hit){hit.role='adjudicator';Object.assign(hit,why('The confirmed Instigators rule permits one Adjudicator; the R4/R5 selection identifies this player.', ['confirmed_rule','alliance_data','player_data']));}
    }
  }
  const phases=['phase_1','phase_2','phase_3'];
  const phase_roles=[
    ['capture','collection_energy'],
    ['mobile_reaction','defense_garrison'],
    ['defense_garrison','collection_energy']
  ];
  const objectives=[
    ['data_center_i','sample_warehouse_i','power_tower'],
    ['defense_system_i','power_tower','serum_factory_i','power_plant','point_supply_box'],
    ['virus_lab']
  ];
  const phasePlan=phases.map((phase,i)=>({phase,priority:i===2?'virus_lab_maximum':'confirmed_production_and_control',objectives:objectives[i],roles:phase_roles[i],assignments:participants.filter(x=>phase_roles[i].includes(x.role)|| (x.role==='adjudicator'&&factionKey==='instigators')).map(x=>({member_key:x.canonical_member_key||x.lifecycle_key||x.name,name:x.name,role:x.role,why:x.why,sources:x.sources}))}));
  return {event_type:'canyon_storm',status,date,time,faction:factionKey||null,faction_to_confirm,
    ruleset:CANYON_STORM_RULESET,participants:participants.slice(0,max_starters),
    substitutes:roster.substitutes,confirmation:roster.confirmation.map(x=>({...x,display_status:'to_confirm'})),
    excluded:roster.excluded,starters_count:Math.min(participants.length,max_starters),substitutes_count:roster.substitutes.length,
     phases:phasePlan,best_slot:suggestedSlot,selected_slot:selectedSlot};
}

export const buildCanyonStormPlan=buildCanyonPlan;

export function normalizeCanyonState(raw={}){
  const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const status=['preparation','battle','completed'].includes(clean(value.status))?clean(value.status):'preparation';
  const faction=factionOf(value.faction)||'unknown';
  return {
    status,
    scheduled_at:clean(value.scheduled_at)||null,
    faction,
    adjudicator_key:clean(value.adjudicator_key)||null,
    availability:normalizeAvailabilityRecords(value.availability,{event_type:'canyon_storm'}).slice(0,200),
    plan:value.plan&&typeof value.plan==='object'&&!Array.isArray(value.plan)?value.plan:null,
    validated_at:clean(value.validated_at)||null,
    validated_by:clean(value.validated_by)||null,
    availability_reset_at:clean(value.availability_reset_at)||null,
    updated_at:clean(value.updated_at)||null
  };
}

export function clearCanyonPreparationSelection(raw={},members=[],updatedAt=new Date().toISOString()){
  const canyon=normalizeCanyonState(raw),rows=new Map(),keyOf=value=>String(
    value?.canonical_member_key||value?.lifecycle_key||value?.member_key||rosterLifecycleKey(value)||value?.name||""
  ).trim();
  const neutralize=value=>normalizeAvailabilityRecord({
    ...value,
    status:'unknown',
    time_slot:null,
    source:null,
    reliability:null,
    updated_at:updatedAt,
    event_type:'canyon_storm'
  });
  for(const rawRow of canyon.availability){
    const row=neutralize(rawRow),key=keyOf(row);
    if(key)rows.set(key,row);
  }
  for(const member of Array.isArray(members)?members:[]){
    const keys=[member?.canonical_member_key,member?.lifecycle_key,rosterLifecycleKey(member),member?.name]
      .map(x=>String(x||"").trim()).filter(Boolean);
    if(!keys.some(key=>rows.has(key))){
      const row=neutralize({...member,event_type:'canyon_storm'});
      const key=keyOf(row)||keys[0];
      if(key)rows.set(key,row);
    }
  }
  return normalizeCanyonState({
    ...canyon,
    availability:[...rows.values()].slice(0,200),
    plan:null,
    adjudicator_key:null,
    validated_at:null,
    validated_by:null,
    availability_reset_at:updatedAt,
    updated_at:updatedAt
  });
}

export function mergeCanyonState(base={},incoming={}){
  const local=normalizeCanyonState(base),cloud=normalizeCanyonState(incoming);
  const stamp=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0},cloudIsNewer=stamp(cloud.updated_at)>=stamp(local.updated_at),newer=cloudIsNewer?cloud:local,older=cloudIsNewer?local:cloud;
  return normalizeCanyonState({
    ...older,...newer,
    availability:mergeAvailabilityRecords(older.availability,newer.availability),
    plan:newer.plan||older.plan,
    validated_at:newer.validated_at||older.validated_at,
    validated_by:newer.validated_by||older.validated_by
  });
}