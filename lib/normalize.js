import {canonicalHeroName,canonicalExclusiveWeaponHeroName,isGenericHeroName} from "./heroes.js";
import {renameMetadata,preferredRenameEvidence,applyCanonicalRenames,alignRenamedRosterRows} from "./alliance-member-rename.js";
import {canonicalShopStore} from "./shop-catalog.js";
import {repairSeasonState} from "./season-lifecycle.js";
import {normalizeTechnologyBranches,mergeTechnologyBranches} from "./technology-scan.js";
import {mergeActivityEvents} from "./activity-events.js";
import {normalizeProgressionSnapshots,mergeProgressionSnapshots} from "./progression-history.js";
import {canonicalPowerMillions} from "./power-units.js";
import {parseHeroPower,confirmedHeroPower} from "./hero-power.js";
import {normalizeSquadSlots,backfillConfirmedHeroPowers} from "./squad-identity.js";
import {normalizeCanyonState,mergeCanyonState} from "./canyon-storm-plan.js";
import {mergeDesertStormState} from "./cloud-state-recovery.js";
import {normalizeEventAvailabilities,mergeEventAvailabilities,mergeAvailabilityHistory} from "./event-availability.js";
import {rankConfirmationStatus} from "./rank-provenance.js";
import {normalizeRosterRemovalTombstones} from "./alliance-roster-lifecycle.js";
import {normalizeUnlinkedAccounts,dedupeRosterAccountLinks} from "./alliance-identity.js";
import {normalizePlayerHqFields,mergePlayerHqFields} from "./player-hq.js";
import {mergeFreshRecord} from "./field-freshness.js";
import {normalizeKnownResources,normalizeDroneParts,mergeDroneFacts,mergeKnownResources} from "./player-known-facts.js";
const HERO_PROFILE_FIELDS=["level","stars","power","exclusive","gear","awakening"];
export function cleanString(v,max=120){return String(v??"").trim().slice(0,max)}
export function numberOrNull(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}
export function clamp(v,min,max){if(v===null||v===undefined||v==="")return min;const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min}
function role(v){const r=cleanString(v).toUpperCase();return /^R[1-5]$/.test(r)?r:"R1"}
function objective(v){const x=cleanString(v,20).toLowerCase();return ["auto","balanced","power","growth","pvp","pve","vs","season","t10","t11"].includes(x)?x:"auto"}
function serverProfile(v){const x=cleanString(v,20).toLowerCase();return ["auto","new","mature","competitive","mixed"].includes(x)?x:"auto"}
function accountAge(v){const n=numberOrNull(v);return n!==null&&n>=0?Math.min(5000,Math.round(n)):null}
function membershipStatus(v,fallback="active"){const x=cleanString(v,30).toLowerCase();return ["active","review","left_confirmed"].includes(x)?x:fallback}
function normalizeMembershipHistory(rows){return (Array.isArray(rows)?rows:[]).slice(-40).map(x=>({type:cleanString(x?.type,40),at:x?.at||null,from_role:cleanString(x?.from_role,8)||null,to_role:cleanString(x?.to_role,8)||null,source:cleanString(x?.source,40)||null})).filter(x=>x.type&&x.at)}
function normalizeAllianceSquadType(v){const x=cleanString(v,20).toLowerCase();return ["aircraft","tank","missile","mixed"].includes(x)?x:null}
function normalizeAllianceSquadHeroes(rows){return (Array.isArray(rows)?rows:[]).slice(0,5).map(x=>canonicalHeroName(cleanString(x,50))).filter(Boolean)}
function normalizeAllianceMember(m={},status="active"){return {canonical_member_key:cleanString(m.canonical_member_key,260)||null,canonical_presence_at:m.canonical_presence_at||null,player_id:cleanString(m.player_id,120)||null,name:cleanString(m.name,80),server_id:cleanString(m.server_id,20),alliance_tag:cleanString(m.alliance_tag,16).toUpperCase(),warboost_linked:m.warboost_linked===true,identity_basis:cleanString(m.identity_basis,60)||null,identity_linked_at:m.identity_linked_at||null,hq_level:numberOrNull(m.hq_level),power_m:canonicalPowerMillions(m.power_m),squad_id:numberOrNull(m.squad_id),squad_power_m:canonicalPowerMillions(m.squad_power_m??m.main_squad_power_m),squad_power_updated_at:m.squad_power_updated_at||null,squad_type:normalizeAllianceSquadType(m.squad_type),squad_heroes:normalizeAllianceSquadHeroes(m.squad_heroes),squad_profile_updated_at:m.squad_profile_updated_at||null,drone_level:numberOrNull(m.drone_level),drone_power_m:canonicalPowerMillions(m.drone_power_m),role:role(m.role),management_role:role(m.management_role||"R1"),rank_confirmed_at:m.rank_confirmed_at||null,rank_confirmed_source:cleanString(m.rank_confirmed_source,80)||null,rank_confirmation_status:cleanString(m.rank_confirmation_status,30)||rankConfirmationStatus(m),activity_events:mergeActivityEvents(m.activity_events),event_availability:mergeEventAvailabilities(m.event_availability),availability_history:mergeAvailabilityHistory(m.availability_history),delta_m:canonicalPowerMillions(m.delta_m),vs_points:numberOrNull(m.vs_points),season_points:numberOrNull(m.season_points),contribution:numberOrNull(m.contribution),last_active_at:m.last_active_at||null,membership_status:membershipStatus(m.membership_status,status),joined_at:m.joined_at||null,returned_at:m.returned_at||null,left_at:m.left_at||null,missing_from_snapshot_at:m.missing_from_snapshot_at||null,membership_history:normalizeMembershipHistory(m.membership_history),updated_at:m.updated_at||null}}
export {isGenericHeroName};
export function cleanHeroName(v){return canonicalHeroName(cleanString(v,50))}
function normalizeShopOffer(o={}){
  return {item_name:cleanString(o?.item_name,120),quantity:numberOrNull(o?.quantity),price:numberOrNull(o?.price),currency:cleanString(o?.currency,60)||null,limit:cleanString(o?.limit,80)||null,discount_pct:numberOrNull(o?.discount_pct),category:cleanString(o?.category,60)||null,rarity:cleanString(o?.rarity,60)||null,contents:cleanString(o?.contents,240)||null,offer_kind:cleanString(o?.offer_kind,60)||null,sold:o?.sold===true,content_verified:o?.content_verified===true||o?.contents_verified===true,cost_gain_verified:o?.cost_gain_verified===true,price_confidence:numberOrNull(o?.price_confidence),currency_confidence:numberOrNull(o?.currency_confidence)};
}
function mergeShopOffers(current=[],incoming=[]){
  const map=new Map();
  for(const raw of Array.isArray(current)?current:[]){const o=normalizeShopOffer(raw);if(o.item_name)map.set(o.item_name.toLowerCase(),o);}
  for(const raw of Array.isArray(incoming)?incoming:[]){
    const n=normalizeShopOffer(raw);if(!n.item_name)continue;
    const key=n.item_name.toLowerCase(),old=map.get(key);
    if(!old){map.set(key,n);continue}
    const merged={...old,...n};
    for(const field of ["quantity","price","currency","limit","discount_pct","category","rarity","contents","offer_kind","price_confidence","currency_confidence"]){
      if(n[field]===null||n[field]===undefined||n[field]==="")merged[field]=old[field];
    }
    merged.content_verified=old.content_verified||n.content_verified;
    merged.cost_gain_verified=old.cost_gain_verified||n.cost_gain_verified;
    merged.sold=n.sold;
    map.set(key,merged);
  }
  return [...map.values()].slice(0,24);
}
function normalizeAwakening(h={}){
  const a=h?.awakening&&typeof h.awakening==="object"?h.awakening:{};
  const out={unlocked:(a.unlocked??h?.awakening_unlocked)===true?true:(a.unlocked??h?.awakening_unlocked)===false?false:null,stars:numberOrNull(a.stars??h?.awakening_stars),skill_level:numberOrNull(a.skill_level??h?.awakening_skill_level),named_shards:numberOrNull(a.named_shards??a.specific_shards??h?.awakening_shards),universal_shards:numberOrNull(a.universal_shards??h?.universal_awakening_shards),trial_complete:(a.trial_complete??h?.awakening_trial_complete)===true?true:(a.trial_complete??h?.awakening_trial_complete)===false?false:null,in_base:(a.in_base??h?.in_base)===true?true:(a.in_base??h?.in_base)===false?false:null,power:numberOrNull(a.power??h?.awakening_power),reshape_stage:numberOrNull(a.reshape_stage??h?.reshape_stage),reshape_value:numberOrNull(a.reshape_value??h?.reshape_value)};
  return Object.values(out).some(v=>v!==null)?{...out,...freshnessFields(a)}:null;
}

function freshnessFields(x={}){
  const field_updated_at={},field_source={};
  for(const [key,value] of Object.entries(x?.field_updated_at||{}).slice(0,80))if(typeof value==="string"&&value.trim())field_updated_at[key.slice(0,100)]=value.slice(0,80);
  for(const [key,value] of Object.entries(x?.field_source||{}).slice(0,80))if(typeof value==="string"&&value.trim())field_source[key.slice(0,100)]=cleanString(value,40);
  return {field_updated_at,field_source,...(x?.source?{source:cleanString(x.source,40)}:{})};
}
function normalizeHeroProfile(h={}){
  const hero_name=cleanHeroName(h?.hero_name||h?.name);if(!hero_name)return null;
  return {hero_name,level:numberOrNull(h?.level),stars:numberOrNull(h?.stars),power:parseHeroPower(h?.power),exclusive:numberOrNull(h?.exclusive),gear:cleanString(h?.gear,120)||null,awakening:normalizeAwakening(h),updated_at:h?.updated_at||null,...freshnessFields(h)};
}
function normalizeExclusiveWeapon(w={}){
  const hero_name=canonicalExclusiveWeaponHeroName(w?.hero_name,w?.weapon_name);
  return {hero_name:hero_name||null,weapon_name:cleanString(w?.weapon_name,80)||null,level:numberOrNull(w?.level),power:parseHeroPower(w?.power),power_raw:cleanString(w?.power_raw||w?.visible_power||"",80)||null,power_parse_status:cleanString(w?.power_parse_status,40)||null,hero_hp_bonus:numberOrNull(w?.hero_hp_bonus),hero_atk_bonus:numberOrNull(w?.hero_atk_bonus),hero_def_bonus:numberOrNull(w?.hero_def_bonus),all_damage_resistance_pct:numberOrNull(w?.all_damage_resistance_pct),max_skill_level:numberOrNull(w?.max_skill_level),updated_at:w?.updated_at||null,...freshnessFields(w)};
}
function mergeNormalizedExclusiveWeaponRows(rows=[]){
  const map=new Map(),keyOf=x=>(canonicalExclusiveWeaponHeroName(x?.hero_name,x?.weapon_name)||cleanString(x?.weapon_name,80)).toLowerCase();
  for(const raw of Array.isArray(rows)?rows:[]){
    const row=normalizeExclusiveWeapon(raw),key=keyOf(row);if(!key)continue;
    const old=map.get(key);if(!old){map.set(key,row);continue}
    if(!confirmedHeroPower(row.power))delete row.power;
    const merged=mergeFreshRecord(old,row,["weapon_name","level","power","power_raw","power_parse_status","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"],{baseSource:"exclusive_weapon",incomingSource:"exclusive_weapon"});
    merged.hero_name=canonicalExclusiveWeaponHeroName(old.hero_name||row.hero_name,merged.weapon_name)||old.hero_name||row.hero_name||null;
    map.set(key,merged);
  }
  return [...map.values()].slice(0,24);
}
function mergeHeroProfilesLists(baseList,incomingList){
  const map=new Map();
  for(const raw of Array.isArray(baseList)?baseList:[]){const x=normalizeHeroProfile(raw);if(x)map.set(x.hero_name.toLowerCase(),x);}
  for(const raw of Array.isArray(incomingList)?incomingList:[]){const n=normalizeHeroProfile(raw);if(!n)continue;const key=n.hero_name.toLowerCase(),cur=map.get(key)||normalizeHeroProfile({hero_name:n.hero_name})||n;
    if(!confirmedHeroPower(n.power))delete n.power;
    map.set(key,mergeFreshRecord(cur,n,HERO_PROFILE_FIELDS,{baseSource:"hero_profile",incomingSource:"hero_profile"}));
  }
  return [...map.values()].sort((a,b)=>a.hero_name.localeCompare(b.hero_name)).slice(0,40);
}

function normalizeShopSnapshot(x={}){
  const offers=Array.isArray(x?.offers)?x.offers.slice(0,24).map(normalizeShopOffer).filter(o=>o.item_name):[];
  return {store_type:canonicalShopStore(cleanString(x?.store_type||x?.store,80)),currency:cleanString(x?.currency,60),currency_balance:numberOrNull(x?.currency_balance),vip_level:numberOrNull(x?.vip_level),vip_days_remaining:numberOrNull(x?.vip_days_remaining),offers,updated_at:x?.updated_at||null};
}
function mergeShopSnapshots(...lists){
  const seen=new Set(),out=[];
  for(const list of lists)for(const raw of Array.isArray(list)?list:[]){
    const x=normalizeShopSnapshot(raw);if(!x.store_type&&!x.offers.length)continue;
    const key=`${x.store_type.toLowerCase()}|${x.updated_at||""}|${x.offers.map(o=>`${o.item_name.toLowerCase()}@${o.price??""}${o.currency??""}`).sort().join(";")}`;
    if(seen.has(key))continue;seen.add(key);out.push(x);
  }
  out.sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
  return out.slice(0,36);
}
function normalizeSpecialEvents(value){
  const raw=value?.secret_mobile_squad;
  if(!raw||typeof raw!=="object")return null;
  const tasks=(Array.isArray(raw.tasks)?raw.tasks:[]).slice(0,30).map(task=>{
    const label=cleanString(task?.label,200);
    if(!label)return null;
    const evidence=task?.label_evidence==="visible_text"?"visible_text":null;
    const mappingStatus=["unmapped","matched"].includes(task?.mapping_status)?task.mapping_status:"unmapped";
    const reviewState=["needs_confirmation","owner_confirmed"].includes(task?.review_state)?task.review_state:"needs_confirmation";
    return {label,label_evidence:evidence,mapping_status:mappingStatus,review_state:reviewState,
      ...(task?.confirmed_at?{confirmed_at:task.confirmed_at}:{}),
      ...(task?.source?{source:cleanString(task.source,40)}:{})};
  }).filter(Boolean);
  if(!tasks.length)return null;
  return {secret_mobile_squad:{tasks,updated_at:raw.updated_at||null,source:cleanString(raw.source,40)||null}};
}
function mergeSpecialEvents(current,incoming){
  const oldState=normalizeSpecialEvents(current),newState=normalizeSpecialEvents(incoming);
  if(!oldState)return newState;
  if(!newState)return oldState;
  const oldTime=Date.parse(oldState.secret_mobile_squad.updated_at||"")||0;
  const newTime=Date.parse(newState.secret_mobile_squad.updated_at||"")||0;
  const winner=newTime>=oldTime?newState:oldState,tasks=new Map();
  for(const task of [...oldState.secret_mobile_squad.tasks,...newState.secret_mobile_squad.tasks]){
    const key=task.label.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g," ").trim();
    if(!key)continue;
    const old=tasks.get(key),confirmed=task.review_state==="owner_confirmed",oldConfirmed=old?.review_state==="owner_confirmed";
    const taskTime=Date.parse(task.confirmed_at||"")||0,oldTaskTime=Date.parse(old?.confirmed_at||"")||0;
    if(!old||confirmed&&!oldConfirmed||confirmed===oldConfirmed&&taskTime>=oldTaskTime)tasks.set(key,task);
  }
  const mergedTasks=[...tasks.values()].sort((a,b)=>(Date.parse(b.confirmed_at||"")||0)-(Date.parse(a.confirmed_at||"")||0)).slice(0,30);
  return {secret_mobile_squad:{...winner.secret_mobile_squad,tasks:mergedTasks}};
}
function normalizeSquadRecord(q={},i){
  const squadPower=canonicalPowerMillions(q.power_m??q.power);
  const squad={id:i+1,name:cleanString(q.name||`Squad ${i+1}`,40),power:squadPower,last_confirmed_power:canonicalPowerMillions(q.last_confirmed_power),power_sync_status:cleanString(q.power_sync_status,20)||(squadPower!==null?"confirmed":"unknown"),updated_at:q.updated_at||null,...freshnessFields(q),needs_rescan:q.needs_rescan===true,composition_changed_at:q.composition_changed_at||null,composition_confirmed_at:q.composition_confirmed_at||null,composition_source:cleanString(q.composition_source,40)||null,confirmed_composition:Array.isArray(q.confirmed_composition)?q.confirmed_composition:[],composition_conflict:q.composition_conflict&&typeof q.composition_conflict==="object"?q.composition_conflict:null,heroes:Array.from({length:5},(_,j)=>{const h=q.heroes?.[j]||{};return {name:cleanHeroName(h.name),level:numberOrNull(h.level),stars:numberOrNull(h.stars),power:parseHeroPower(h.power),exclusive:cleanString(h.exclusive,30)||null,gear:cleanString(h.gear,120)||null,awakening:normalizeAwakening(h),updated_at:h.updated_at||null,...freshnessFields(h)}})};
  const shaped=normalizeSquadSlots(squad,i+1,{inferLegacy:q.needs_rescan!==true});
  return {...squad,...shaped,heroes:Array.from({length:5},(_,j)=>{const h=shaped.heroes?.[j]||{};return {name:cleanHeroName(h.name),level:numberOrNull(h.level),stars:numberOrNull(h.stars),power:parseHeroPower(h.power),exclusive:cleanString(h.exclusive,30)||null,gear:cleanString(h.gear,120)||null,awakening:normalizeAwakening(h),updated_at:h.updated_at||null,...freshnessFields(h)}})};
}
export function normalizeState(input={}){
  const now=new Date().toISOString(),player=input.player||{},playerContext=input.player_context||{},drone=input.drone||{},shop=input.shop||{},alliance=input.alliance||{},vs=input.vs||{},season=input.season||{},sync=input.sync||{};
  const squads=Array.from({length:4},(_,i)=>normalizeSquadRecord(input.squads?.[i]||{},i));
  const normalizedAllianceMembers=dedupeRosterAccountLinks(Array.isArray(alliance.members)?alliance.members.slice(0,200).map(m=>({...normalizeAllianceMember(m,"active"),...renameMetadata(m)})).filter(x=>x.name):[]);
  const normalizedUnlinkedAccounts=normalizeUnlinkedAccounts(alliance.unlinked_accounts,normalizedAllianceMembers,{serverId:alliance.server_id||player.server_id,allianceTag:alliance.tag,currentPlayerId:input.player_id,currentPlayerName:player.name,identityLinkStatus:alliance.identity_link_status});
   const exclusive_weapons=mergeNormalizedExclusiveWeaponRows(input.exclusive_weapons);
   const hero_progression=Array.isArray(input.hero_progression)?input.hero_progression.slice(0,40).map(h=>{const directPower=parseHeroPower(h?.power),millionPower=canonicalPowerMillions(h?.power_m);return {hero_name:cleanHeroName(h?.hero_name||h?.name)||null,stars:numberOrNull(h?.stars),power:directPower!==null&&directPower>0?directPower:(millionPower===null?null:millionPower*1_000_000),exclusive:numberOrNull(h?.exclusive),awakening:normalizeAwakening(h),updated_at:h?.updated_at||h?.power_updated_at||null,...freshnessFields(h)}}).filter(h=>h.hero_name):[];
  const hero_profiles=mergeHeroProfilesLists([],input.hero_profiles);
  const shopOffers=Array.isArray(shop.offers)?shop.offers.slice(0,24).map(normalizeShopOffer).filter(o=>o.item_name):[];const shopCurrent=normalizeShopSnapshot({...shop,offers:shopOffers}),shopSnapshots=mergeShopSnapshots(shop.snapshots,shopCurrent.offers.length?[shopCurrent]:[]);
  const normalized={version:"2.5.28",player_id:cleanString(input.player_id,120),updated_at:input.updated_at||now,
     player:{name:cleanString(player.name,80),server_id:cleanString(player.server_id,20),...normalizePlayerHqFields(player),power_m:canonicalPowerMillions(player.power_m),coordinates:player.coordinates??null,role:role(player.role),rank_confirmed_at:player.rank_confirmed_at||null,rank_confirmed_source:cleanString(player.rank_confirmed_source,80)||null,role_confirmation_status:cleanString(player.role_confirmation_status,30)||"unconfirmed",updated_at:player.updated_at||null,...freshnessFields(player)},
    player_context:{objective:objective(playerContext.objective),account_age_days:accountAge(playerContext.account_age_days),server_profile:serverProfile(playerContext.server_profile),updated_at:playerContext.updated_at||null},
     activity_events:mergeActivityEvents(input.activity_events),
     player_availability:mergeEventAvailabilities(input.player_availability),
     availability_history:mergeAvailabilityHistory(input.availability_history),
    exclusive_weapons,
    hero_progression,
    hero_profiles,
    progression_snapshots:normalizeProgressionSnapshots(input.progression_snapshots),
     drone:{level:numberOrNull(drone.level),power_m:canonicalPowerMillions(drone.power_m),boostCombat:{level:numberOrNull(drone.boostCombat?.level),updated_at:drone.boostCombat?.updated_at||null,...freshnessFields(drone.boostCombat)},updated_at:drone.updated_at||null,...freshnessFields(drone)},shop:{store_type:shopCurrent.store_type,currency:shopCurrent.currency,currency_balance:shopCurrent.currency_balance,vip_level:shopCurrent.vip_level,vip_days_remaining:shopCurrent.vip_days_remaining,offers:shopOffers,snapshots:shopSnapshots,updated_at:shop.updated_at||null},squads,
     alliance:{id:cleanString(alliance.id,120)||null,owner_player_id:cleanString(alliance.owner_player_id,120)||null,server_id:cleanString(alliance.server_id||player.server_id,20),tag:cleanString(alliance.tag,16).toUpperCase(),name:cleanString(alliance.name,100),role:role(alliance.role),rank_confirmation_status:cleanString(alliance.rank_confirmation_status,30)||"unconfirmed",cloud_role_verified:alliance.cloud_role_verified===true,management_verified:alliance.management_verified===true,invite_code:cleanString(alliance.invite_code,40).toUpperCase(),identity_link_status:cleanString(alliance.identity_link_status,40)||"unknown",members:normalizedAllianceMembers,roster_review:Array.isArray(alliance.roster_review)?alliance.roster_review.slice(0,200).map(m=>normalizeAllianceMember(m,"review")).filter(x=>x.name):[],former_members:[],roster_removal_tombstones:normalizeRosterRemovalTombstones([...(Array.isArray(alliance.roster_removal_tombstones)?alliance.roster_removal_tombstones:[]),...(Array.isArray(alliance.former_members)?alliance.former_members:[])]),event_availability:mergeEventAvailabilities(alliance.event_availability),availability_history:mergeAvailabilityHistory(alliance.availability_history),roster_updated_at:alliance.roster_updated_at||null,roster_snapshot_complete_at:alliance.roster_snapshot_complete_at||null,roster_sync_status:cleanString(alliance.roster_sync_status,20)||"unknown",roster_sync_error:cleanString(alliance.roster_sync_error,300)||null,desert_storm:alliance.desert_storm&&typeof alliance.desert_storm==="object"?{team:cleanString(alliance.desert_storm.team,2).toUpperCase()==="B"?"B":"A",battle_time:cleanString(alliance.desert_storm.battle_time,20),registered_keys:Array.isArray(alliance.desert_storm.registered_keys)?alliance.desert_storm.registered_keys.map(x=>cleanString(x,220)).filter(Boolean):[],substitute_keys:Array.isArray(alliance.desert_storm.substitute_keys)?alliance.desert_storm.substitute_keys.map(x=>cleanString(x,220)).filter(Boolean):[],selection_initialized:alliance.desert_storm.selection_initialized===true,plan:alliance.desert_storm.plan&&typeof alliance.desert_storm.plan==="object"?alliance.desert_storm.plan:null,availability_reset_at:alliance.desert_storm.availability_reset_at||null,updated_at:alliance.desert_storm.updated_at||null}:{team:"A",battle_time:"",registered_keys:[],substitute_keys:[],selection_initialized:false,plan:null,availability_reset_at:null,updated_at:null},canyon:normalizeCanyonState(alliance.canyon),unlinked_accounts:normalizedUnlinkedAccounts,updated_at:alliance.updated_at||null},
    vs:{week:numberOrNull(vs.week),day:numberOrNull(vs.day),our_alliance:cleanString(vs.our_alliance,16).toUpperCase(),opponent:cleanString(vs.opponent,60).toUpperCase(),our_score:vs.our_score??null,their_score:vs.their_score??null,updated_at:vs.updated_at||null},
    season:repairSeasonState({name:cleanString(season.name,80),number:numberOrNull(season.number),day:numberOrNull(season.day),total_days:numberOrNull(season.total_days),profession:cleanString(season.profession,60),progress_pct:numberOrNull(season.progress_pct),resistance:numberOrNull(season.resistance),focus:cleanString(season.focus,60)||null,crystal_event_eligible:season.crystal_event_eligible===true?true:season.crystal_event_eligible===false?false:null,crystal_event_source:cleanString(season.crystal_event_source,40)||null,lifecycle:cleanString(season.lifecycle||season.status,30)||null,lifecycle_source:cleanString(season.lifecycle_source||season.status_source,40)||null,ended_at:season.ended_at||season.finished_at||null,measured_hybrid_synergy:season.measured_hybrid_synergy===true,awakening_swap:season.awakening_swap&&typeof season.awakening_swap==="object"?{active:season.awakening_swap.active===true?true:season.awakening_swap.active===false?false:null,attempts_remaining:numberOrNull(season.awakening_swap.attempts_remaining),source_hero:cleanHeroName(season.awakening_swap.source_hero||season.awakening_swap.from_hero)||null,target_hero:cleanHeroName(season.awakening_swap.target_hero||season.awakening_swap.to_hero)||null}:null,updated_at:season.updated_at||null}),
     technology:{type_mastery_pct:numberOrNull(input?.technology?.type_mastery_pct??input?.technology?.mastery_pct),hero_tech_pct:numberOrNull(input?.technology?.hero_tech_pct??input?.technology?.hero_pct),siege_to_seize_pct:numberOrNull(input?.technology?.siege_to_seize_pct??input?.technology?.siege_pct),defensive_fortification_pct:numberOrNull(input?.technology?.defensive_fortification_pct??input?.technology?.defense_fortification_pct??input?.technology?.defense_pct),tactical_weapon_pct:numberOrNull(input?.technology?.tactical_weapon_pct),branches:normalizeTechnologyBranches(input?.technology?.branches),updated_at:input?.technology?.updated_at||null,...freshnessFields(input?.technology)},
    sync:{provider:cleanString(sync.provider||"warboost-local",80),provider_kind:cleanString(sync.provider_kind||"local",30),access_status:cleanString(sync.access_status||"pending",30),capabilities:Array.isArray(sync.capabilities)?sync.capabilities.slice(0,40).map(x=>cleanString(x,60)).filter(Boolean):[],status:cleanString(sync.status||"local",30),last_sync:sync.last_sync||null,last_error:cleanString(sync.last_error,300)||null,auto_ready:sync.auto_ready!==false,last_scan:sync.last_scan||null,official_last_sync:sync.official_last_sync||null,public_last_sync:sync.public_last_sync||null,sources:{official:Boolean(sync.sources?.official),public:Boolean(sync.sources?.public),scan:Boolean(sync.sources?.scan||sync.last_scan),alliance:Boolean(sync.sources?.alliance)}}
   };
   normalized.season={...normalized.season,...freshnessFields(season)};
   normalized.alliance.roster_review=normalized.alliance.roster_review.map((row,index)=>({...row,...renameMetadata(alliance.roster_review?.[index])}));
   normalized.resources=normalizeKnownResources(input.resources);
   normalized.drone.components=normalizeDroneParts(drone.components);
   normalized.drone.skill_chips=normalizeDroneParts(drone.skill_chips);
   const specialEvents=normalizeSpecialEvents(input.special_events);
  if(specialEvents)normalized.special_events=specialEvents;
   return applyCanonicalRenames(backfillConfirmedHeroPowers(normalized,{now}).state,normalized.alliance.members,{clone:false});
}
function allianceMemberMergeKey(m){const explicit=cleanString(m?.canonical_member_key,260);if(explicit)return explicit;const name=cleanString(m?.name,80).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");const server=cleanString(m?.server_id,20),tag=cleanString(m?.alliance_tag,16).toUpperCase();return name?`${name}|${server}|${tag}`:""}
function confirmedRankAt(m){const n=Date.parse(m?.rank_confirmed_at||"");return Number.isFinite(n)?n:0}
function mergeExclusiveWeaponRows(current=[],incoming=[]){
  const key=x=>(cleanHeroName(x?.hero_name)||cleanString(x?.weapon_name,100)).toLowerCase(),map=new Map();
  for(const raw of Array.isArray(current)?current:[]){const k=key(raw);if(k)map.set(k,{...raw});}
  for(const raw of Array.isArray(incoming)?incoming:[]){
    const k=key(raw);if(!k)continue;
    const old=map.get(k)||{},next={...raw};
    if(!confirmedHeroPower(next.power))delete next.power;
    const merged=mergeFreshRecord(old,next,["weapon_name","level","power","power_raw","power_parse_status","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"],{baseSource:"exclusive_weapon",incomingSource:"exclusive_weapon"});
    map.set(k,merged);
  }
  return [...map.values()];
}
function mergeAllianceMembersNewest(current=[],incoming=[]){
  const evidence=[...current,...incoming].filter(row=>row.name_confirmed_at);
  current=alignRenamedRosterRows(current,evidence);incoming=alignRenamedRosterRows(incoming,evidence);
  const out=[],index=new Map();
  const add=(raw,preferCurrent=false)=>{
    if(!raw||typeof raw!=="object")return;
    const key=allianceMemberMergeKey(raw);if(!key)return;
    const i=index.get(key);
    if(i===undefined){index.set(key,out.length);out.push({...raw});return}
    const old=out[i],oldAt=confirmedRankAt(old),nextAt=confirmedRankAt(raw),winner=oldAt>nextAt?old:nextAt>oldAt?raw:(preferCurrent?old:raw);
    out[i]={...old,...raw,player_id:old.player_id||raw.player_id||null,warboost_linked:old.warboost_linked===true||raw.warboost_linked===true,identity_basis:old.identity_basis||raw.identity_basis||null,identity_linked_at:old.identity_linked_at||raw.identity_linked_at||null,activity_events:mergeActivityEvents(old.activity_events,raw.activity_events),role:winner.role||old.role||raw.role,rank_confirmed_at:winner.rank_confirmed_at||null,rank_confirmed_source:winner.rank_confirmed_source||null,membership_history:normalizeMembershipHistory([...(old.membership_history||[]),...(raw.membership_history||[])])};
  };
  for(const row of Array.isArray(current)?current:[])add(row,true);
  for(const row of Array.isArray(incoming)?incoming:[])add(row,false);
  for(const row of out){
    const key=allianceMemberMergeKey(row),candidates=[...(current||[]),...(incoming||[])].filter(x=>allianceMemberMergeKey(x)===key);
    Object.assign(row,candidates.reduce((winner,next)=>({...winner,...preferredRenameEvidence(winner,next)}),{}));
  }
  return out.slice(0,300);
}
export function mergeNewest(current={},incoming={}){
  const cur=normalizeState(current),raw={...cur,...incoming,player:{...cur.player,...incoming.player},player_context:{...cur.player_context,...incoming.player_context},activity_events:mergeActivityEvents(cur.activity_events,incoming.activity_events),progression_snapshots:mergeProgressionSnapshots(cur.progression_snapshots,incoming.progression_snapshots),alliance:{...cur.alliance,...incoming.alliance,members:mergeAllianceMembersNewest(cur.alliance?.members,incoming.alliance?.members),former_members:Array.isArray(incoming.alliance?.former_members)?incoming.alliance.former_members:[],roster_removal_tombstones:normalizeRosterRemovalTombstones([...(cur.alliance?.roster_removal_tombstones||[]),...(incoming.alliance?.roster_removal_tombstones||[])]),roster_updated_at:incoming.alliance?.roster_updated_at||cur.alliance?.roster_updated_at||null},vs:{...cur.vs,...incoming.vs},season:{...cur.season,...incoming.season,crystal_event_eligible:typeof incoming.season?.crystal_event_eligible==="boolean"?incoming.season.crystal_event_eligible:cur.season?.crystal_event_eligible??null,crystal_event_source:incoming.season?.crystal_event_source||cur.season?.crystal_event_source||null},technology:{...cur.technology,...incoming.technology},sync:{...cur.sync,...incoming.sync,sources:{...cur.sync?.sources,...incoming.sync?.sources}}};
  raw.resources=mergeKnownResources(cur.resources,incoming.resources);
  const playerFields=Object.keys({...cur.player,...incoming.player}).filter(key=>!["hq_level","hq_level_source","hq_level_confirmed_at","role","rank_confirmed_at","rank_confirmed_source","role_confirmation_status","field_updated_at","field_source","updated_at","source"].includes(key));
  raw.player={...mergeFreshRecord(cur.player,incoming.player,playerFields,{baseFallbackAt:cur.player?.updated_at,incomingFallbackAt:incoming.player?.updated_at||incoming.updated_at,baseSource:"player",incomingSource:"player"}),...mergePlayerHqFields(cur.player,incoming.player,{sameAccount:String(cur.player_id||"")===String(incoming.player_id||"")})};
  raw.season=mergeFreshRecord(cur.season,incoming.season,Object.keys({...cur.season,...incoming.season}).filter(key=>!["field_updated_at","field_source","updated_at","source"].includes(key)),{baseFallbackAt:cur.season?.updated_at,incomingFallbackAt:incoming.season?.updated_at||incoming.updated_at,baseSource:"season",incomingSource:"season"});
  raw.technology=mergeFreshRecord(cur.technology,incoming.technology,Object.keys({...cur.technology,...incoming.technology}).filter(key=>!["field_updated_at","field_source","updated_at","source","branches"].includes(key)),{baseFallbackAt:cur.technology?.updated_at,incomingFallbackAt:incoming.technology?.updated_at||incoming.updated_at,baseSource:"technology",incomingSource:"technology"});
  raw.technology.branches=mergeTechnologyBranches(cur.technology?.branches,incoming.technology?.branches);
  const specialEvents=mergeSpecialEvents(cur.special_events,incoming.special_events);
  if(specialEvents)raw.special_events=specialEvents;else delete raw.special_events;
  raw.alliance.canyon=mergeCanyonState(cur.alliance?.canyon,incoming.alliance?.canyon);
  raw.alliance.desert_storm=mergeDesertStormState(cur.alliance?.desert_storm,incoming.alliance?.desert_storm);
    const incomingDrone=incoming.drone;
    raw.drone=incomingDrone?mergeFreshRecord(cur.drone,incomingDrone,["level","power_m","boostCombat"],{baseFallbackAt:cur.drone?.updated_at,incomingFallbackAt:incomingDrone.updated_at||incoming.updated_at,baseSource:"drone",incomingSource:"drone"}):cur.drone;
  const incomingShop=incoming.shop;
  if(incomingShop){
    const newer=!cur.shop?.updated_at||!incomingShop.updated_at||new Date(incomingShop.updated_at)>=new Date(cur.shop.updated_at);
    const incomingCurrent=normalizeShopSnapshot(incomingShop),snapshots=mergeShopSnapshots(cur.shop?.snapshots,incomingShop?.snapshots,incomingCurrent.offers.length?[incomingCurrent]:[]);
    raw.shop=newer?{...cur.shop,...incomingShop,store_type:incomingCurrent.store_type||cur.shop?.store_type,offers:Array.isArray(incomingShop.offers)?mergeShopOffers(cur.shop?.offers,incomingShop.offers):cur.shop?.offers,snapshots}:{...cur.shop,snapshots};
  }else raw.shop=cur.shop;
   raw.drone=mergeDroneFacts(cur.drone,incoming.drone);
   raw.exclusive_weapons=mergeExclusiveWeaponRows(cur.exclusive_weapons,incoming.exclusive_weapons);
   if(Array.isArray(incoming.hero_progression)&&incoming.hero_progression.length){const key=x=>cleanHeroName(x?.hero_name||x?.name).toLowerCase(),map=new Map((cur.hero_progression||[]).map(x=>[key(x),x]));for(const h of incoming.hero_progression){const k=key(h);if(k)map.set(k,mergeFreshRecord(map.get(k)||{},h,["stars","power","exclusive","awakening"],{baseSource:"hero_progression",incomingSource:"hero_progression"}))}raw.hero_progression=[...map.values()]}else raw.hero_progression=cur.hero_progression;
  raw.hero_profiles=mergeHeroProfilesLists(cur.hero_profiles,incoming.hero_profiles);
  raw.squads=cur.squads.map((c,i)=>{
    const n=incoming.squads?.[i];if(!n)return c;
     const oldCompositionAt=Date.parse(c.composition_confirmed_at||"")||0,newCompositionAt=Date.parse(n.composition_confirmed_at||"")||0;
     const compositionNewer=newCompositionAt>oldCompositionAt||(!newCompositionAt&&!oldCompositionAt&&(!c.updated_at||!n.updated_at||new Date(n.updated_at)>=new Date(c.updated_at)));
    const heroes=Array.from({length:5},(_,j)=>{
      const oldHero=c.heroes?.[j]||{},nextHero=n.heroes?.[j]||{},oldName=cleanHeroName(oldHero.name),nextName=cleanHeroName(nextHero.name);
      // V2.4.7: never attach hero attributes by slot when identity is missing or changed.
      if(!nextName)return oldHero;
       if(oldName&&oldName.toLowerCase()!==nextName.toLowerCase()){
         if(!compositionNewer)return oldHero;
         return {name:nextName,level:numberOrNull(nextHero.level),stars:numberOrNull(nextHero.stars),power:numberOrNull(nextHero.power),exclusive:cleanString(nextHero.exclusive,30)||null,gear:cleanString(nextHero.gear,120)||null,awakening:normalizeAwakening(nextHero),updated_at:nextHero.updated_at||n.updated_at||null,...freshnessFields(nextHero)};
       }
       return {...mergeFreshRecord(oldHero,nextHero,["level","stars","power","exclusive","gear","awakening"],{baseFallbackAt:c.updated_at,incomingFallbackAt:n.updated_at,baseSource:"squad",incomingSource:"squad"}),name:nextName};
    });
     const fields=["power","last_confirmed_power","power_sync_status","needs_rescan"];
     const details=mergeFreshRecord(c,n,fields,{baseFallbackAt:c.updated_at,incomingFallbackAt:n.updated_at,baseSource:"squad",incomingSource:"squad"});
     return {...c,...details,...(compositionNewer?{updated_at:n.updated_at||c.updated_at,composition_changed_at:n.composition_changed_at||c.composition_changed_at||null,composition_confirmed_at:n.composition_confirmed_at||c.composition_confirmed_at||null,composition_source:n.composition_source||c.composition_source||null,confirmed_composition:n.confirmed_composition||c.confirmed_composition,needs_rescan:n.needs_rescan===true}:{}),id:i+1,name:`Squad ${i+1}`,heroes};
  });
  return normalizeState(raw);
}
