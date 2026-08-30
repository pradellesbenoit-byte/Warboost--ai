import {canonicalHeroName,isGenericHeroName} from "./heroes.js";
import {canonicalShopStore} from "./shop-catalog.js";
const HERO_PROFILE_FIELDS=["level","stars","power","exclusive","gear","awakening"];
export function cleanString(v,max=120){return String(v??"").trim().slice(0,max)}
export function numberOrNull(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}
export function clamp(v,min,max){if(v===null||v===undefined||v==="")return min;const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min}
function role(v){const r=cleanString(v).toUpperCase();return /^R[1-5]$/.test(r)?r:"R1"}
function objective(v){const x=cleanString(v,20).toLowerCase();return ["auto","balanced","pvp","pve","vs","season"].includes(x)?x:"auto"}
function serverProfile(v){const x=cleanString(v,20).toLowerCase();return ["auto","new","mature","competitive","mixed"].includes(x)?x:"auto"}
function accountAge(v){const n=numberOrNull(v);return n!==null&&n>=0?Math.min(5000,Math.round(n)):null}
export {isGenericHeroName};
export function cleanHeroName(v){return canonicalHeroName(cleanString(v,50))}
function normalizeShopOffer(o={}){
  return {item_name:cleanString(o?.item_name,120),quantity:numberOrNull(o?.quantity),price:numberOrNull(o?.price),currency:cleanString(o?.currency,60)||null,limit:cleanString(o?.limit,80)||null,discount_pct:numberOrNull(o?.discount_pct),category:cleanString(o?.category,60)||null,rarity:cleanString(o?.rarity,60)||null,sold:o?.sold===true,price_confidence:numberOrNull(o?.price_confidence),currency_confidence:numberOrNull(o?.currency_confidence)};
}
function normalizeAwakening(h={}){
  const a=h?.awakening&&typeof h.awakening==="object"?h.awakening:{};
  const out={unlocked:(a.unlocked??h?.awakening_unlocked)===true?true:(a.unlocked??h?.awakening_unlocked)===false?false:null,stars:numberOrNull(a.stars??h?.awakening_stars),skill_level:numberOrNull(a.skill_level??h?.awakening_skill_level),named_shards:numberOrNull(a.named_shards??a.specific_shards??h?.awakening_shards),universal_shards:numberOrNull(a.universal_shards??h?.universal_awakening_shards),trial_complete:(a.trial_complete??h?.awakening_trial_complete)===true?true:(a.trial_complete??h?.awakening_trial_complete)===false?false:null,in_base:(a.in_base??h?.in_base)===true?true:(a.in_base??h?.in_base)===false?false:null,power:numberOrNull(a.power??h?.awakening_power),reshape_stage:numberOrNull(a.reshape_stage??h?.reshape_stage),reshape_value:numberOrNull(a.reshape_value??h?.reshape_value)};
  return Object.values(out).some(v=>v!==null)?out:null;
}

function normalizeHeroProfile(h={}){
  const hero_name=cleanHeroName(h?.hero_name||h?.name);if(!hero_name)return null;
  const field_updated_at={};for(const f of HERO_PROFILE_FIELDS){const v=h?.field_updated_at?.[f];if(v)field_updated_at[f]=v;}
  const field_source={};for(const f of HERO_PROFILE_FIELDS){const v=cleanString(h?.field_source?.[f],40);if(v)field_source[f]=v;}
  return {hero_name,level:numberOrNull(h?.level),stars:numberOrNull(h?.stars),power:numberOrNull(h?.power),exclusive:numberOrNull(h?.exclusive),gear:cleanString(h?.gear,120)||null,awakening:normalizeAwakening(h),updated_at:h?.updated_at||null,field_updated_at,field_source};
}
function fieldStamp(x,f){const t=Date.parse(x?.field_updated_at?.[f]||x?.updated_at||"");return Number.isFinite(t)?t:0;}
function mergeHeroProfilesLists(baseList,incomingList){
  const map=new Map();
  for(const raw of Array.isArray(baseList)?baseList:[]){const x=normalizeHeroProfile(raw);if(x)map.set(x.hero_name.toLowerCase(),x);}
  for(const raw of Array.isArray(incomingList)?incomingList:[]){const n=normalizeHeroProfile(raw);if(!n)continue;const key=n.hero_name.toLowerCase(),cur=map.get(key)||normalizeHeroProfile({hero_name:n.hero_name})||n;
    for(const f of HERO_PROFILE_FIELDS){const nv=n[f];if(nv===null||nv===undefined||nv==="")continue;const cv=cur[f],take=cv===null||cv===undefined||cv===""||fieldStamp(n,f)>=fieldStamp(cur,f);if(take){cur[f]=nv;cur.field_updated_at={...(cur.field_updated_at||{}),[f]:n?.field_updated_at?.[f]||n.updated_at||cur?.field_updated_at?.[f]||cur.updated_at||null};if(n?.field_source?.[f])cur.field_source={...(cur.field_source||{}),[f]:n.field_source[f]};}}
    if((Date.parse(n.updated_at||"")||0)>=(Date.parse(cur.updated_at||"")||0))cur.updated_at=n.updated_at||cur.updated_at||null;map.set(key,cur);
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
export function normalizeState(input={}){
  const now=new Date().toISOString(),player=input.player||{},playerContext=input.player_context||{},drone=input.drone||{},shop=input.shop||{},alliance=input.alliance||{},vs=input.vs||{},season=input.season||{},sync=input.sync||{};
  const squads=Array.from({length:4},(_,i)=>{const q=input.squads?.[i]||{};return {id:i+1,name:cleanString(q.name||`Squad ${i+1}`,40),power:numberOrNull(q.power),updated_at:q.updated_at||null,needs_rescan:q.needs_rescan===true,composition_changed_at:q.composition_changed_at||null,heroes:Array.from({length:5},(_,j)=>{const h=q.heroes?.[j]||{};return {name:cleanHeroName(h.name),level:numberOrNull(h.level),stars:numberOrNull(h.stars),power:numberOrNull(h.power),exclusive:cleanString(h.exclusive,30)||null,gear:cleanString(h.gear,120)||null,awakening:normalizeAwakening(h)}})}});
  const exclusive_weapons=Array.isArray(input.exclusive_weapons)?input.exclusive_weapons.slice(0,24).map(w=>({hero_name:cleanHeroName(w?.hero_name)||null,weapon_name:cleanString(w?.weapon_name,80)||null,level:numberOrNull(w?.level),power:numberOrNull(w?.power),hero_hp_bonus:numberOrNull(w?.hero_hp_bonus),hero_atk_bonus:numberOrNull(w?.hero_atk_bonus),hero_def_bonus:numberOrNull(w?.hero_def_bonus),all_damage_resistance_pct:numberOrNull(w?.all_damage_resistance_pct),max_skill_level:numberOrNull(w?.max_skill_level),updated_at:w?.updated_at||null})).filter(w=>w.hero_name||w.weapon_name||w.level!==null||w.power!==null):[];
  const hero_progression=Array.isArray(input.hero_progression)?input.hero_progression.slice(0,40).map(h=>({hero_name:cleanHeroName(h?.hero_name||h?.name)||null,stars:numberOrNull(h?.stars),exclusive:numberOrNull(h?.exclusive),awakening:normalizeAwakening(h),updated_at:h?.updated_at||null})).filter(h=>h.hero_name):[];
  const hero_profiles=mergeHeroProfilesLists([],input.hero_profiles);
  const shopOffers=Array.isArray(shop.offers)?shop.offers.slice(0,24).map(normalizeShopOffer).filter(o=>o.item_name):[];const shopCurrent=normalizeShopSnapshot({...shop,offers:shopOffers}),shopSnapshots=mergeShopSnapshots(shop.snapshots,shopCurrent.offers.length?[shopCurrent]:[]);
  return {version:"2.5.8",player_id:cleanString(input.player_id,120),updated_at:input.updated_at||now,
    player:{name:cleanString(player.name,80),server_id:cleanString(player.server_id,20),hq_level:numberOrNull(player.hq_level),power_m:numberOrNull(player.power_m),coordinates:player.coordinates??null,role:role(player.role)},
    player_context:{objective:objective(playerContext.objective),account_age_days:accountAge(playerContext.account_age_days),server_profile:serverProfile(playerContext.server_profile),updated_at:playerContext.updated_at||null},
    exclusive_weapons,
    hero_progression,
    hero_profiles,
    drone:{level:numberOrNull(drone.level),power_m:numberOrNull(drone.power_m),updated_at:drone.updated_at||null},shop:{store_type:shopCurrent.store_type,currency:shopCurrent.currency,currency_balance:shopCurrent.currency_balance,vip_level:shopCurrent.vip_level,vip_days_remaining:shopCurrent.vip_days_remaining,offers:shopOffers,snapshots:shopSnapshots,updated_at:shop.updated_at||null},squads,
    alliance:{id:cleanString(alliance.id,120)||null,tag:cleanString(alliance.tag,16).toUpperCase(),name:cleanString(alliance.name,100),role:role(alliance.role),invite_code:cleanString(alliance.invite_code,32).toUpperCase(),members:Array.isArray(alliance.members)?alliance.members.slice(0,200).map(m=>({player_id:cleanString(m.player_id,120)||null,name:cleanString(m.name,80),hq_level:numberOrNull(m.hq_level),power_m:numberOrNull(m.power_m),role:role(m.role),delta_m:numberOrNull(m.delta_m),vs_points:numberOrNull(m.vs_points),season_points:numberOrNull(m.season_points),contribution:numberOrNull(m.contribution),last_active_at:m.last_active_at||null,updated_at:m.updated_at||null})):[],updated_at:alliance.updated_at||null},
    vs:{week:numberOrNull(vs.week),day:numberOrNull(vs.day),our_alliance:cleanString(vs.our_alliance,16).toUpperCase(),opponent:cleanString(vs.opponent,60).toUpperCase(),our_score:vs.our_score??null,their_score:vs.their_score??null,updated_at:vs.updated_at||null},
    season:{name:cleanString(season.name,80),number:numberOrNull(season.number),day:numberOrNull(season.day),total_days:numberOrNull(season.total_days),profession:cleanString(season.profession,60),progress_pct:clamp(season.progress_pct||0,0,100),resistance:numberOrNull(season.resistance),focus:cleanString(season.focus,60)||null,measured_hybrid_synergy:season.measured_hybrid_synergy===true,awakening_swap:season.awakening_swap&&typeof season.awakening_swap==="object"?{active:season.awakening_swap.active===true?true:season.awakening_swap.active===false?false:null,attempts_remaining:numberOrNull(season.awakening_swap.attempts_remaining),source_hero:cleanHeroName(season.awakening_swap.source_hero||season.awakening_swap.from_hero)||null,target_hero:cleanHeroName(season.awakening_swap.target_hero||season.awakening_swap.to_hero)||null}:null,updated_at:season.updated_at||null},
    technology:{type_mastery_pct:numberOrNull(input?.technology?.type_mastery_pct??input?.technology?.mastery_pct),hero_tech_pct:numberOrNull(input?.technology?.hero_tech_pct??input?.technology?.hero_pct),siege_to_seize_pct:numberOrNull(input?.technology?.siege_to_seize_pct??input?.technology?.siege_pct),defensive_fortification_pct:numberOrNull(input?.technology?.defensive_fortification_pct??input?.technology?.defense_fortification_pct??input?.technology?.defense_pct),tactical_weapon_pct:numberOrNull(input?.technology?.tactical_weapon_pct),updated_at:input?.technology?.updated_at||null},
    sync:{provider:cleanString(sync.provider||"warboost-local",80),provider_kind:cleanString(sync.provider_kind||"local",30),access_status:cleanString(sync.access_status||"pending",30),capabilities:Array.isArray(sync.capabilities)?sync.capabilities.slice(0,40).map(x=>cleanString(x,60)).filter(Boolean):[],status:cleanString(sync.status||"local",30),last_sync:sync.last_sync||null,last_error:cleanString(sync.last_error,300)||null,auto_ready:sync.auto_ready!==false,last_scan:sync.last_scan||null,official_last_sync:sync.official_last_sync||null,public_last_sync:sync.public_last_sync||null,sources:{official:Boolean(sync.sources?.official),public:Boolean(sync.sources?.public),scan:Boolean(sync.sources?.scan||sync.last_scan),alliance:Boolean(sync.sources?.alliance)}}
  }
}
export function mergeNewest(current={},incoming={}){
  const cur=normalizeState(current),raw={...cur,...incoming,player:{...cur.player,...incoming.player},player_context:{...cur.player_context,...incoming.player_context},alliance:{...cur.alliance,...incoming.alliance},vs:{...cur.vs,...incoming.vs},season:{...cur.season,...incoming.season},technology:{...cur.technology,...incoming.technology},sync:{...cur.sync,...incoming.sync,sources:{...cur.sync?.sources,...incoming.sync?.sources}}};
  const incomingDrone=incoming.drone;
  if(incomingDrone){const newer=!cur.drone.updated_at||!incomingDrone.updated_at||new Date(incomingDrone.updated_at)>=new Date(cur.drone.updated_at);raw.drone=newer?{...cur.drone,...incomingDrone}:cur.drone}else raw.drone=cur.drone;
  const incomingShop=incoming.shop;
  if(incomingShop){
    const newer=!cur.shop?.updated_at||!incomingShop.updated_at||new Date(incomingShop.updated_at)>=new Date(cur.shop.updated_at);
    const incomingCurrent=normalizeShopSnapshot(incomingShop),snapshots=mergeShopSnapshots(cur.shop?.snapshots,incomingShop?.snapshots,incomingCurrent.offers.length?[incomingCurrent]:[]);
    raw.shop=newer?{...cur.shop,...incomingShop,store_type:incomingCurrent.store_type||cur.shop?.store_type,offers:Array.isArray(incomingShop.offers)?incomingShop.offers:cur.shop?.offers,snapshots}:{...cur.shop,snapshots};
  }else raw.shop=cur.shop;
  if(Array.isArray(incoming.exclusive_weapons)&&incoming.exclusive_weapons.length){const key=x=>(cleanHeroName(x?.hero_name)||cleanString(x?.weapon_name,100)).toLowerCase(),map=new Map((cur.exclusive_weapons||[]).map(x=>[key(x),x]));for(const w of incoming.exclusive_weapons){const k=key(w);if(k)map.set(k,{...(map.get(k)||{}),...w})}raw.exclusive_weapons=[...map.values()]}else raw.exclusive_weapons=cur.exclusive_weapons;
  if(Array.isArray(incoming.hero_progression)&&incoming.hero_progression.length){const key=x=>cleanHeroName(x?.hero_name||x?.name).toLowerCase(),map=new Map((cur.hero_progression||[]).map(x=>[key(x),x]));for(const h of incoming.hero_progression){const k=key(h);if(k)map.set(k,{...(map.get(k)||{}),...h,awakening:{...(map.get(k)?.awakening||{}),...(h?.awakening||{})}})}raw.hero_progression=[...map.values()]}else raw.hero_progression=cur.hero_progression;
  raw.hero_profiles=mergeHeroProfilesLists(cur.hero_profiles,incoming.hero_profiles);
  raw.squads=cur.squads.map((c,i)=>{
    const n=incoming.squads?.[i];if(!n)return c;
    const newer=!c.updated_at||!n.updated_at||new Date(n.updated_at)>=new Date(c.updated_at);if(!newer)return c;
    const heroes=Array.from({length:5},(_,j)=>{
      const oldHero=c.heroes?.[j]||{},nextHero=n.heroes?.[j]||{},oldName=cleanHeroName(oldHero.name),nextName=cleanHeroName(nextHero.name);
      // V2.4.7: never attach hero attributes by slot when identity is missing or changed.
      if(!nextName)return oldHero;
      if(oldName&&oldName.toLowerCase()!==nextName.toLowerCase())return {name:nextName,level:numberOrNull(nextHero.level),stars:numberOrNull(nextHero.stars),power:numberOrNull(nextHero.power),exclusive:cleanString(nextHero.exclusive,30)||null,gear:cleanString(nextHero.gear,120)||null,awakening:normalizeAwakening(nextHero)};
      return {...oldHero,...nextHero,name:nextName};
    });
    return {...c,...n,id:i+1,name:`Squad ${i+1}`,needs_rescan:n.needs_rescan===true,composition_changed_at:n.composition_changed_at||c.composition_changed_at||null,heroes};
  });
  return normalizeState(raw);
}
