import {canonicalHeroName,canonicalExclusiveWeaponHeroName,heroType} from "./heroes.js";
import {confirmedCompositionForSquad} from "./squad-identity.js";

const TROOP_TYPES=["aircraft","tank","missile"];
const TECH_FIELDS=["type_mastery_pct","hero_tech_pct","siege_to_seize_pct","defensive_fortification_pct","tactical_weapon_pct"];
const TYPE_LABELS={aircraft:"qg35_type_aircraft",tank:"qg35_type_tank",missile:"qg35_type_missile"};

function isRecord(value){return Boolean(value)&&typeof value==="object"&&!Array.isArray(value)}
function hasValue(value){
  if(value===null||value===undefined||value==="")return false;
  if(Array.isArray(value))return value.length>0;
  if(isRecord(value))return Object.values(value).some(hasValue);
  return true;
}
function explicitGain(value){
  if(typeof value==="number")return Number.isFinite(value)&&value>0;
  return typeof value==="string"&&Boolean(value.trim());
}
function numeric(value,{positive=false}={}){
  if(value===null||value===undefined||value==="")return null;
  const parsed=typeof value==="number"?value:Number(String(value).trim().replace(",",".")); 
  return Number.isFinite(parsed)&&(positive?parsed>0:parsed>=0)?parsed:null;
}
function canonicalType(value){
  const type=String(value||"").trim().toLowerCase();
  if(TROOP_TYPES.includes(type))return type;
  if(type==="air"||type==="aviation"||type==="avion")return "aircraft";
  if(type==="missiles")return "missile";
  return null;
}
function nameKey(value){return String(canonicalHeroName(value)||"").trim().toLowerCase()}
function fieldStamp(record,field){
  const stamp=Date.parse(record?.field_updated_at?.[field]||record?.updated_at||"");
  return Number.isFinite(stamp)?stamp:0;
}
function newestKnown(slot,profile,field){
  const slotValue=slot?.[field],profileValue=profile?.[field];
  const slotKnown=hasValue(slotValue),profileKnown=hasValue(profileValue);
  if(!slotKnown)return profileKnown?profileValue:null;
  if(!profileKnown)return slotValue;
  return fieldStamp(profile,field)>fieldStamp(slot,field)?profileValue:slotValue;
}
function safeFacts(value){
  if(!hasValue(value))return [];
  const entries=Array.isArray(value)?value.map((item,index)=>[String(index+1),item]):isRecord(value)?Object.entries(value):[["value",value]];
  return entries.flatMap(([rawKey,rawValue])=>{
    if(rawValue===null||rawValue===undefined||rawValue==="")return [];
    if(typeof rawValue==="object"){
      if(Array.isArray(rawValue))return rawValue.length?[{label:String(rawKey).replaceAll("_"," "),value:rawValue.map(item=>String(item)).join(", ")}]:[];
      return Object.entries(rawValue).filter(([,v])=>v===0||typeof v==="boolean"||Boolean(v&&typeof v!=="object")).map(([key,v])=>({label:`${String(rawKey).replaceAll("_"," ")} · ${String(key).replaceAll("_"," ")}`,value:String(v)}));
    }
    return [{label:String(rawKey).replaceAll("_"," "),value:String(rawValue)}];
  }).slice(0,24);
}
function meanCoverage(values){
  return values.length?values.reduce((sum,value)=>sum+Math.min(1,Math.max(0,Number(value)||0)),0)/values.length:0;
}
function median(values){
  const sorted=values.slice().sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function optionalEndgame(state){
  // These optional facts are only read when already present in a saved state.
  // This module never writes them or derives inventory/progression values.
  return isRecord(state?.endgame)?state.endgame:{};
}
function exactTypeMastery(technology,endgame,type){
  if(!type)return null;
  const maps=[technology?.mastery_by_type,technology?.type_mastery_by_type,endgame?.mastery_by_type,endgame?.type_mastery_by_type];
  for(const map of maps){
    if(!isRecord(map))continue;
    const value=numeric(map[type]??map[`${type}_pct`]??map[`${type}_mastery_pct`]);
    if(value!==null)return value;
  }
  const explicitType=canonicalType(technology?.type_mastery_type||endgame?.type_mastery_type);
  return explicitType===type?numeric(technology?.type_mastery_pct):null;
}
function inferMainTroopType(rows){
  const counts={aircraft:0,tank:0,missile:0};
  for(const row of rows){const type=heroType(row.name);if(type)counts[type]++}
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]||TROOP_TYPES.indexOf(a[0])-TROOP_TYPES.indexOf(b[0]));
  const [type,count]=sorted[0]||[];
  return count>=3&&count>sorted[1]?.[1]?type:null;
}
function makeMissing(id,messageKey,scanType=null){return {id,message_key:messageKey,scan_type:scanType}}
function priority({systemKey,actionKey,whyKey,gainKey,params={},score,source}){
  return {system_key:systemKey,action_key:actionKey,why_key:whyKey,gain_key:gainKey,params,score,source:source||null}
}
function resourceRecords(endgame){
  const raw=endgame?.rare_resources;
  const rows=Array.isArray(raw)?raw:(isRecord(raw)?Object.entries(raw).map(([name,value])=>({name,...(isRecord(value)?value:{stock:value})})):[]);
  return rows.flatMap(item=>{
    if(!isRecord(item))return [];
    const stock=numeric(item.stock??item.amount);
    if(stock===null||!String(item.name||item.label||"").trim())return [];
    const next=item.next_use,usageKnown=item.usage_known===true&&hasValue(item.current_use);
    const cost=numeric(next?.cost,{positive:true}),gainKnown=explicitGain(next?.expected_gain)&&hasValue(next?.gain_source);
    const low=item.low_priority_use;
    const lowCost=numeric(low?.cost,{positive:true}),lowGain=numeric(low?.expected_gain,{positive:true});
    const nextGain=numeric(next?.expected_gain,{positive:true});
    const comparableLow=lowCost!==null&&lowGain!==null&&hasValue(low?.name)&&hasValue(low?.gain_unit)&&hasValue(low?.gain_source);
    let recommendation="CONSERVER",reasonKey="qg35_resource_keep_unknown_usage";
    if(usageKnown&&item.current_use===false){
      recommendation="PRIORITÉ FAIBLE";reasonKey="qg35_resource_low_priority";
    }else if(usageKnown&&item.current_use===true&&cost!==null&&gainKnown){
      if(stock>=cost){recommendation="UTILISER";reasonKey="qg35_resource_use_confirmed"}
      else{recommendation="CONSERVER";reasonKey="qg35_resource_keep_short"}
    }
    return [{
      name:String(item.name||item.label).trim(),stock,recommendation,
      reason_key:reasonKey,
      next_use:usageKnown&&item.current_use===true&&cost!==null&&gainKnown?{
        name:String(next.name||"").trim(),cost,expected_gain:next.expected_gain,gain_source:String(next.gain_source),
        gain_unit:String(next.gain_unit||"")
      }:null,
      low_priority_use:usageKnown&&item.current_use===true&&comparableLow?{
        name:String(low.name),cost:lowCost,expected_gain:lowGain,gain_source:String(low.gain_source),
        gain_unit:String(low.gain_unit)
      }:null,
      comparison:usageKnown&&item.current_use===true&&cost!==null&&nextGain!==null&&hasValue(next?.gain_unit)&&comparableLow&&
        String(next.gain_unit)===String(low.gain_unit)&&hasValue(next?.gain_source)
        ?{next_gain:nextGain,next_cost:cost,next_source:String(next.gain_source),next_name:String(next.name||"next upgrade"),
          next_unit:String(next.gain_unit),low_gain:lowGain,low_cost:lowCost,low_source:String(low.gain_source),
          low_name:String(low.name),low_unit:String(low.gain_unit)}:null
    }];
  }).slice(0,40);
}
function antiWasteComparisons(resources){
  return resources.flatMap(resource=>{
    const compare=resource.comparison;
    if(!compare)return [];
    const nextRate=compare.next_gain/compare.next_cost,lowRate=compare.low_gain/compare.low_cost;
    if(!(nextRate>lowRate)||resource.stock>=compare.next_cost)return [];
    return [{
      message_key:"qg35_anti_waste_compare",
      params:{
        resource:resource.name,preferred:compare.next_name,alternate:compare.low_name,
        preferred_gain:compare.next_gain,preferred_cost:compare.next_cost,preferred_rate:Number(nextRate.toFixed(4)),
        alternate_gain:compare.low_gain,alternate_cost:compare.low_cost,alternate_rate:Number(lowRate.toFixed(4)),
        unit:compare.next_unit
      },
      sources:[compare.next_source,compare.low_source]
    }];
  });
}
function compareRelativeGap(rows,field,{systemKey,fieldKey,scoreBase=72}={}){
  const values=rows.map(row=>({row,value:numeric(row[field],{positive:true})})).filter(item=>item.value!==null);
  if(values.length<3)return null;
  const middle=median(values.map(item=>item.value)),lowest=Math.min(...values.map(item=>item.value));
  if(middle===null||lowest>=middle)return null;
  const weakest=values.find(item=>item.value===lowest)?.row;
  if(!weakest)return null;
  const spread=Math.min(12,Math.round((middle-lowest)/Math.max(1,middle)*100));
  return priority({
    systemKey,actionKey:"qg35_action_review_hero_gap",whyKey:"qg35_why_relative_gap",
    gainKey:"qg35_gain_squad_balance",
    params:{hero:weakest.name,field_key:fieldKey,value:lowest,median:middle},
    score:scoreBase+spread,source:`squad1.${field}`
  });
}
function baseReport(status,hqLevel=null){
  return {
    eligibility:{eligible:false,status,hq_level:hqLevel,minimum_hq:35},
    missing_data:[],bottleneck:null,top_priorities:[],seven_day_plan:[],resources:[],
    squad1:{heroes:[],known_hero_count:0,duplicate_hero_names:[],identity_review_required:false,main_type:null,main_type_label_key:"qg35_type_unknown",frontline:"unknown",dps:"unknown",equipment:"unknown",exclusive_weapons:"unknown",technology:"unknown",drone:"unknown"},
    technology_route:{main_type:null,main_type_label_key:"qg35_type_unknown",mastery_pct:null,next_research:null,source:null},
    heroes_weapons:{heroes:[],next_tier:null,missing_information:true},
    drone:{level:null,power_m:null,components:null,chips:null,next_tier:null},
    decorations_overlord_season:{decorations:null,overlord:null,t11:null,season:[],awakening:[]},
    anti_waste:[],before_after:{available:false,source:null,metric:null,unit:null,before:null,after:null,message_key:"qg35_estimate_unavailable"},
    confidence:{score:0,band:"low",known_fields:0,expected_fields:0}
  };
}

export function hasEndgameCoachProAccess({betaMode=false,betaAllowed=false,betaConsentAccepted=false,proActive=false}={}){
  return betaMode?Boolean(betaAllowed&&betaConsentAccepted):Boolean(proActive);
}

export function createEndgameCoachReport(state={}){
  const hq=numeric(state?.player?.hq_level,{positive:true});
  if(hq===null)return baseReport("unknown");
  if(hq<35)return baseReport("below_threshold",hq);

  const report=baseReport("eligible",hq),endgame=optionalEndgame(state),squad=state?.squads?.[0]||{};
  report.eligibility.eligible=true;
  const rawSlots=Array.isArray(squad.heroes)?squad.heroes:[];
  const confirmed=confirmedCompositionForSquad(squad);
  const names=Array.from({length:5},(_,index)=>{
    const confirmedName=Array.isArray(confirmed)?confirmed[index]:"";
    return String(confirmedName||rawSlots[index]?.name||"").trim();
  });
  const profiles=Array.isArray(state?.hero_profiles)?state.hero_profiles:[];
  const rows=names.map((rawName,index)=>{
    const name=canonicalHeroName(rawName),slot=rawSlots[index]||{};
    const profile=profiles.find(item=>nameKey(item?.hero_name||item?.name)===nameKey(name))||{};
    const merged={name,type:heroType(name),level:newestKnown(slot,profile,"level"),stars:newestKnown(slot,profile,"stars"),gear:newestKnown(slot,profile,"gear"),skills:newestKnown(slot,profile,"skills")??newestKnown(slot,profile,"skill_levels")??newestKnown(slot,profile,"skill_level"),awakening:newestKnown(slot,profile,"awakening"),combat_role:slot.combat_role||profile.combat_role||null};
    return merged;
  }).filter(row=>row.name);
  const seenNames=new Set(),uniqueRows=rows.filter(row=>{const key=nameKey(row.name);if(!key||seenNames.has(key))return false;seenNames.add(key);return true});
  const duplicateNames=rows.filter((row,index)=>rows.findIndex(other=>nameKey(other.name)===nameKey(row.name))!==index).map(row=>row.name);
  const compositionReview=Boolean(duplicateNames.length||squad.needs_rescan||squad.composition_conflict);
  const mainType=compositionReview?null:inferMainTroopType(uniqueRows),technology=isRecord(state?.technology)?state.technology:{},drone=isRecord(state?.drone)?state.drone:{};
  const exclusiveRows=Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[];
  const weapons=rows.map(hero=>{
    const weapon=exclusiveRows.find(item=>nameKey(canonicalExclusiveWeaponHeroName(item?.hero_name,item?.weapon_name))===nameKey(hero.name))||null;
    return {...hero,weapon:weapon?{
      level:numeric(weapon.level,{positive:true}),max_skill_level:numeric(weapon.max_skill_level,{positive:true}),
      power:numeric(weapon.power,{positive:true}),updated_at:weapon.updated_at||null
    }:null};
  });
  const uniqueWeapons=weapons.filter((row,index)=>weapons.findIndex(other=>nameKey(other.name)===nameKey(row.name))===index);
  const missing=[];
  const missingIds=new Set();
  const addMissing=(id,messageKey,scanType=null)=>{
    if(missingIds.has(id))return;
    missingIds.add(id);missing.push(makeMissing(id,messageKey,scanType));
  };
  if(uniqueRows.length<5)addMissing("squad1","qg35_missing_squad_composition","squad1");
  if(compositionReview)addMissing("squad1_identity_review","qg35_missing_squad_identity_review","squad1");
  const progressionCoverage=uniqueRows.length?uniqueRows.filter(row=>numeric(row.level,{positive:true})!==null||numeric(row.stars)!==null).length/uniqueRows.length:0;
  if(progressionCoverage<1)addMissing("hero_progression","qg35_missing_hero_progression","squad1");
  if(uniqueRows.length&&uniqueRows.some(row=>!hasValue(row.skills)))addMissing("hero_skills","qg35_missing_hero_skills","squad1");
  if(uniqueRows.length&&uniqueRows.some(row=>!hasValue(row.gear)))addMissing("hero_gear","qg35_missing_gear","squad1");
  const weaponKnownCount=uniqueWeapons.filter(row=>row.weapon&&[row.weapon.level,row.weapon.max_skill_level,row.weapon.power].some(value=>value!==null)).length;
  if(uniqueRows.length&&weaponKnownCount<uniqueRows.length)addMissing("exclusive_weapons","qg35_missing_exclusive","exclusive");
  const knownTechFields=TECH_FIELDS.filter(field=>numeric(technology[field])!==null);
  if(!knownTechFields.length)addMissing("technology","qg35_missing_technology");
  const masteryPct=exactTypeMastery(technology,endgame,mainType);
  if(!mainType||masteryPct===null)addMissing("typed_mastery","qg35_missing_typed_mastery");
  const t11=endgame.armament_institute_t11??endgame.t11??null;
  if(!hasValue(t11))addMissing("t11","qg35_missing_t11");
  const droneLevel=numeric(drone.level,{positive:true}),dronePower=numeric(drone.power_m,{positive:true});
  if(droneLevel===null&&dronePower===null)addMissing("drone","qg35_missing_drone","drone");
  const droneComponents=hasValue(endgame.drone_components)?endgame.drone_components:(hasValue(drone.components)?drone.components:null);
  const droneChips=hasValue(endgame.drone_chips)?endgame.drone_chips:(hasValue(drone.chips)?drone.chips:null);
  if(droneComponents===null&&droneChips===null)addMissing("drone_modules","qg35_missing_drone_components","drone");
  const decorations=endgame.decorations??null,overlord=endgame.overlord??null;
  if(!hasValue(decorations))addMissing("decorations","qg35_missing_decorations");
  if(!hasValue(overlord))addMissing("overlord","qg35_missing_overlord");
  const season=state?.season||{};
  const seasonValues=["name","number","day","total_days","profession","progress_pct","resistance","focus","lifecycle"].filter(field=>hasValue(season[field]));
  if(!seasonValues.length)addMissing("season","qg35_missing_season","season");
  const awakening=rows.map(row=>({name:row.name,value:row.awakening})).filter(item=>hasValue(item.value));
  if(!awakening.length&&!hasValue(season.awakening_swap))addMissing("awakening","qg35_missing_awakening","squad1");
  const resources=resourceRecords(endgame);
  if(!resources.length)addMissing("rare_resources","qg35_missing_resources");
  if(rows.some(row=>!["frontline","dps"].includes(String(row.combat_role||"").toLowerCase())))addMissing("combat_roles","qg35_missing_combat_roles");

  const typedMasteryMap=isRecord(technology.mastery_by_type)?technology.mastery_by_type:(isRecord(endgame.mastery_by_type)?endgame.mastery_by_type:{});
  const explicitNext=endgame.technology_route;
  const nextResearch=isRecord(explicitNext)&&canonicalType(explicitNext.type)===mainType&&hasValue(explicitNext.next_research)&&hasValue(explicitNext.source)
    ?{name:String(explicitNext.next_research),source:String(explicitNext.source),type:mainType}:null;
  const typeMastery=masteryPct??numeric(technology.type_mastery_pct);
  report.technology_route={
    main_type:mainType,main_type_label_key:TYPE_LABELS[mainType]||"qg35_type_unknown",
    mastery_pct:typeMastery,mastery_type_confirmed:masteryPct!==null,
    known_fields:knownTechFields.map(field=>({key:field,value:numeric(technology[field])})),
    next_research:nextResearch,source:masteryPct!==null?"type-specific saved mastery":(typeMastery!==null?"untyped saved technology value":null),
    status_key:mainType?"qg35_route_type_confirmed":"qg35_route_type_unknown"
  };

  const candidates=[];
  if(uniqueRows.length<5)candidates.push(priority({
    systemKey:"qg35_system_squad1",actionKey:"qg35_action_scan_squad",whyKey:"qg35_why_scan_squad",
    gainKey:"qg35_gain_diagnostic",score:100-uniqueRows.length,source:"squads[0].heroes"
  }));
  if(compositionReview)candidates.push(priority({
    systemKey:"qg35_system_squad1",actionKey:"qg35_action_review_composition",whyKey:"qg35_why_review_composition",
    gainKey:"qg35_gain_diagnostic",score:99,source:"squads[0].confirmed_composition"
  }));
  const levelGap=compositionReview?null:compareRelativeGap(uniqueWeapons,"level",{systemKey:"qg35_system_hero_level",fieldKey:"qg35_field_level",scoreBase:83});
  const starsGap=compositionReview?null:compareRelativeGap(uniqueWeapons,"stars",{systemKey:"qg35_system_hero_stars",fieldKey:"qg35_field_stars",scoreBase:79});
  const weaponGap=compositionReview?null:compareRelativeGap(uniqueWeapons.map(row=>({...row,level:row.weapon?.level})),"level",{systemKey:"qg35_system_exclusive",fieldKey:"qg35_field_weapon_level",scoreBase:75});
  if(levelGap)candidates.push(levelGap);
  if(starsGap)candidates.push(starsGap);
  if(weaponGap)candidates.push(weaponGap);
  if(missingIds.has("technology")||missingIds.has("typed_mastery"))candidates.push(priority({
    systemKey:mainType?TYPE_LABELS[mainType]:"qg35_system_technology",
    actionKey:"qg35_action_scan_technology",whyKey:mainType?"qg35_why_scan_technology_type":"qg35_why_scan_technology",
    gainKey:"qg35_gain_diagnostic",params:{type_key:TYPE_LABELS[mainType]||"qg35_type_unknown"},
    score:92,source:"technology"
  }));
  if(missingIds.has("drone")||missingIds.has("drone_modules"))candidates.push(priority({
    systemKey:"qg35_system_drone",actionKey:"qg35_action_scan_drone",whyKey:"qg35_why_scan_drone",
    gainKey:"qg35_gain_diagnostic",score:82,source:"drone"
  }));
  if(missingIds.has("hero_gear"))candidates.push(priority({
    systemKey:"qg35_system_equipment",actionKey:"qg35_action_scan_gear",whyKey:"qg35_why_scan_gear",
    gainKey:"qg35_gain_diagnostic",score:78,source:"squads[0].heroes[].gear"
  }));
  if(missingIds.has("exclusive_weapons"))candidates.push(priority({
    systemKey:"qg35_system_exclusive",actionKey:"qg35_action_scan_exclusive",whyKey:"qg35_why_scan_exclusive",
    gainKey:"qg35_gain_diagnostic",score:75,source:"exclusive_weapons"
  }));
  if(missingIds.has("rare_resources"))candidates.push(priority({
    systemKey:"qg35_system_resources",actionKey:"qg35_action_no_spend_without_stock",whyKey:"qg35_why_no_spend_without_stock",
    gainKey:"qg35_gain_no_waste",score:70,source:"endgame.rare_resources"
  }));
  if(missingIds.has("hero_progression"))candidates.push(priority({
    systemKey:"qg35_system_hero_progression",actionKey:"qg35_action_scan_squad",whyKey:"qg35_why_progression_missing",
    gainKey:"qg35_gain_diagnostic",score:69,source:"hero_profiles / squads[0].heroes"
  }));
  if(!candidates.length)candidates.push(
    priority({systemKey:"qg35_system_confirmed_data",actionKey:"qg35_action_recheck_confirmed",whyKey:"qg35_why_no_calculated_upgrade",gainKey:"qg35_gain_no_waste",score:40,source:"known-state-only"}),
    priority({systemKey:"qg35_system_resources",actionKey:"qg35_action_hold_resources",whyKey:"qg35_why_no_spend_without_stock",gainKey:"qg35_gain_no_waste",score:39,source:"known-state-only"}),
    priority({systemKey:"qg35_system_confirmed_data",actionKey:"qg35_action_compare_next_scan",whyKey:"qg35_why_no_calculated_upgrade",gainKey:"qg35_gain_diagnostic",score:38,source:"known-state-only"})
  );
  const unique=new Set(),sorted=candidates.sort((a,b)=>b.score-a.score).filter(item=>{
    const key=`${item.system_key}|${item.action_key}|${item.params.hero||""}`;
    if(unique.has(key))return false;unique.add(key);return true;
  });
  const filler=[
    priority({systemKey:"qg35_system_confirmed_data",actionKey:"qg35_action_recheck_confirmed",whyKey:"qg35_why_no_calculated_upgrade",gainKey:"qg35_gain_no_waste",score:1,source:"known-state-only"}),
    priority({systemKey:"qg35_system_resources",actionKey:"qg35_action_hold_resources",whyKey:"qg35_why_no_spend_without_stock",gainKey:"qg35_gain_no_waste",score:0,source:"known-state-only"}),
    priority({systemKey:"qg35_system_confirmed_data",actionKey:"qg35_action_compare_next_scan",whyKey:"qg35_why_no_calculated_upgrade",gainKey:"qg35_gain_diagnostic",score:-1,source:"known-state-only"})
  ];
  while(sorted.length<3)sorted.push(filler[sorted.length]||filler[0]);
  report.top_priorities=Array.from({length:3},(_,index)=>({...sorted[index],rank:index+1}));
  const first=report.top_priorities[0];
  report.bottleneck={
    system_key:first.system_key,
    diagnosis_key:first.why_key,
    params:first.params,
    source:first.source,
    is_data_limited:first.gain_key==="qg35_gain_diagnostic"||first.gain_key==="qg35_gain_no_waste"
  };
  const knownRoleCounts={frontline:0,dps:0};
  for(const row of uniqueRows){const role=String(row.combat_role||"").toLowerCase();if(role==="frontline")knownRoleCounts.frontline++;if(role==="dps")knownRoleCounts.dps++}
  const knownGearCount=uniqueRows.filter(row=>hasValue(row.gear)).length;
  report.squad1={
    heroes:weapons.map(row=>({
      name:row.name,type:row.type,type_label_key:TYPE_LABELS[row.type]||"qg35_type_unknown",
      level:numeric(row.level,{positive:true}),stars:numeric(row.stars),
      skills_known:hasValue(row.skills),gear_known:hasValue(row.gear),
      combat_role:["frontline","dps"].includes(String(row.combat_role||"").toLowerCase())?String(row.combat_role).toLowerCase():null,
      weapon_level:row.weapon?.level??null
    })),
    known_hero_count:uniqueRows.length,duplicate_hero_names:[...new Set(duplicateNames)],identity_review_required:compositionReview,
    main_type:mainType,main_type_label_key:TYPE_LABELS[mainType]||"qg35_type_unknown",
    frontline:knownRoleCounts.frontline?"known":"unknown",dps:knownRoleCounts.dps?"known":"unknown",
    equipment:uniqueRows.length&&knownGearCount===uniqueRows.length?"known":knownGearCount?"partial":"unknown",
    exclusive_weapons:uniqueRows.length&&weaponKnownCount===uniqueRows.length?"known":weaponKnownCount?"partial":"unknown",
    technology:knownTechFields.length?"known":"unknown",
    drone:droneLevel!==null||dronePower!==null?"known":"unknown"
  };
  report.heroes_weapons={
    heroes:report.squad1.heroes.map(hero=>({name:hero.name,level:hero.level,stars:hero.stars,weapon_level:hero.weapon_level,skills_known:hero.skills_known})),
    next_tier:null,missing_information:missingIds.has("hero_progression")||missingIds.has("exclusive_weapons")||missingIds.has("hero_skills"),
    status_key:"qg35_next_hero_tier_unknown"
  };
  report.drone={
    level:droneLevel,power_m:dronePower,components:safeFacts(droneComponents),chips:safeFacts(droneChips),
    next_tier:null,status_key:"qg35_next_drone_tier_unknown"
  };
  report.decorations_overlord_season={
    decorations:safeFacts(decorations),overlord:safeFacts(overlord),t11:safeFacts(t11),
    season:seasonValues.map(field=>({label:field.replaceAll("_"," "),value:String(season[field])})),
    awakening:awakening.map(item=>({hero:item.name,facts:safeFacts(item.value)}))
  };
  report.resources=resources;
  report.anti_waste=antiWasteComparisons(resources);
  report.before_after={
    available:false,source:null,metric:null,unit:null,before:null,after:null,message_key:"qg35_estimate_unavailable"
  };
  const trackedBeforeAfter=endgame.before_after;
  if(isRecord(trackedBeforeAfter)&&hasValue(trackedBeforeAfter.source)&&hasValue(trackedBeforeAfter.metric)&&hasValue(trackedBeforeAfter.unit)&&numeric(trackedBeforeAfter.before)!==null&&numeric(trackedBeforeAfter.after)!==null){
    report.before_after={available:true,source:String(trackedBeforeAfter.source),metric:String(trackedBeforeAfter.metric),unit:String(trackedBeforeAfter.unit),before:numeric(trackedBeforeAfter.before),after:numeric(trackedBeforeAfter.after),message_key:null};
  }
  const priorityAction=(index)=>report.top_priorities[index];
  const planActions=[
    {day:1,action:priorityAction(0),action_key:null},
    {day:2,action:priorityAction(1),action_key:null},
    {day:3,action:priorityAction(2),action_key:null},
    {day:4,action:null,action_key:"qg35_plan_day4"},
    {day:5,action:null,action_key:"qg35_plan_day5"},
    {day:6,action:null,action_key:"qg35_plan_day6"},
    {day:7,action:null,action_key:"qg35_plan_day7"}
  ];
  report.seven_day_plan=planActions.map(item=>({
    day:item.day,action:item.action,action_key:item.action_key,
    use_now:item.day===4?resources.filter(resource=>resource.recommendation==="UTILISER").map(resource=>resource.name):[],
    conserve:item.day===4?resources.filter(resource=>resource.recommendation==="CONSERVER").map(resource=>resource.name):[],
    wait_for_event_key:"qg35_wait_for_confirmed_event"
  }));
  const coverage=[
    hq!==null?1:0,
    uniqueRows.length/5,
    uniqueRows.length?uniqueRows.filter(row=>numeric(row.level,{positive:true})!==null&&numeric(row.stars)!==null).length/uniqueRows.length:0,
    uniqueRows.length?uniqueRows.filter(row=>hasValue(row.skills)).length/uniqueRows.length:0,
    uniqueRows.length?knownGearCount/uniqueRows.length:0,
    uniqueRows.length?weaponKnownCount/uniqueRows.length:0,
    knownTechFields.length/TECH_FIELDS.length,
    masteryPct!==null?1:0,
    hasValue(t11)?1:0,
    [droneLevel,dronePower].filter(value=>value!==null).length/2,
    droneComponents!==null||droneChips!==null?1:0,
    hasValue(decorations)?1:0,
    hasValue(overlord)?1:0,
    seasonValues.length?1:0,
    awakening.length||hasValue(season.awakening_swap)?1:0,
    resources.length?1:0
  ];
  const score=Math.round(meanCoverage(coverage)*100);
  report.confidence={
    score,band:score>=75?"high":score>=45?"medium":"low",
    known_fields:coverage.reduce((sum,value)=>sum+(value>0?1:0),0),
    expected_fields:coverage.length,method:"data-completeness"
  };
  report.missing_data=missing;
  return report;
}