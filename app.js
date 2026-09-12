import {LANGUAGES,resolveLanguage,localeFor,dirFor,translator} from "./i18n.js";
import {HERO_CATALOG,canonicalHeroName,isGenericHeroName,heroPresentation} from "./lib/heroes.js";
import {classifyAllianceMember,summarizeAllianceActivity,normalizeAllianceRole} from "./lib/alliance-activity.js";
import {canonicalShopStore} from "./lib/shop-catalog.js";
import {reconcileConfirmedSquad,repairLegacySquadIdentity,swapSquads,selectPrimarySquad,squadHasData} from "./lib/squad-identity.js";
import {recoverHeroData} from "./lib/hero-history.js";
import {parseRosterImport,rosterNameKey} from "./lib/roster-import.js";
import {applyRosterImportLifecycle,confirmRosterDeparture,restoreRosterReviewMember,removeActiveRosterMember,reinstateFormerRosterMember,rosterLifecycleKey,currentActiveRosterMembers} from "./lib/alliance-roster-lifecycle.js";
import {repairSeasonState,seasonLifecycle,seasonIsActive,activeSeasonProgress} from "./lib/season-lifecycle.js";
import {createWarBoostSupabaseAuthClient} from "./lib/browser-auth.js";
import {formatGearSummary} from "./lib/gear.js";
import {ACTIVITY_EVENT_TYPES,PLAYER_ACTIVITY_EVENT_TYPES,activityEventId,mergeActivityEvents,confirmedActivityEvents,eventCountsByType,participationEventRecords,participationSummaryByType,parseParticipationImport} from "./lib/activity-events.js";
import {backfillRosterIdentityContext,linkCurrentPlayerIdentityIntoRoster,rosterLinkSummary} from "./lib/alliance-identity.js";
import {playerParticipationInsight,allianceParticipationOverview,allianceParticipationByEvent} from "./lib/alliance-participation-insights.js";
import {mergeVsState,scoreKnown,vsSituation,vsTrend,personalVsPosition,vsDecisionEngine,vsSnapshotFreshness} from "./lib/vs-live.js";
import {buildDesertStormPlan,DESERT_STORM_RULESET} from "./lib/desert-storm-plan.js";
import {appendProgressionSnapshot,mergeProgressionSnapshots,progressionComparison,strongestSquadFromState} from "./lib/progression-history.js";
import {appendRosterScanFiles,removeRosterScanFile,DEFAULT_ROSTER_SCAN_FILE_LIMIT} from "./lib/roster-scan-queue.js";
import {cleanRosterOcrName,rosterIdentityKey,resolveRosterScanRows,confirmRosterScanPossibleMatch,rosterScanHasUnresolvedIdentity} from "./lib/roster-identity-resolution.js";
import {previewAllianceRankChanges,applyAllianceRankChanges,permissionTransitions,rankManagementKey} from "./lib/alliance-rank-management.js";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const APP_VERSION="2.5.28";
const RELEASE_LABEL="HF8.6.3";
const STORE_KEY="warboost_v1_core_state", CLIENT_KEY="warboost_v1_client_id", LANG_KEY="warboost_v12_language";
const BACKUP_KEY="warboost_last_good_state", ACCOUNT_STATE_PREFIX="warboost_account_state:", VOICE_ENABLED_KEY="warboost_voice_enabled", VOICE_ID_KEY="warboost_voice_id";
const BETA_CONSENT_KEY="warboost_beta_consent_2026_09_05_safe_launch_v2", BETA_CONSENT_VERSION="2026-09-05-safe-launch-v2";
const LEGACY_LANGUAGE_KEYS=["wb17_language","wb171_language","warboost_language"];
const LEGACY_DATA_KEYS=["wb12_account","wb11_account","wb10_profile","wb10_alliance","wb10_simple","wb10_roster","wb19_imported_players"];

function uid(){return crypto.randomUUID?.()||`wb-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function clientId(){let id=localStorage.getItem(CLIENT_KEY);if(!id){id=uid();localStorage.setItem(CLIENT_KEY,id)}return id}
function emptyHero(i){return {name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null}}
function emptySquad(i){return {id:i,name:`Squad ${i}`,power:null,updated_at:null,needs_rescan:false,composition_changed_at:null,heroes:[1,2,3,4,5].map(emptyHero)}}
function initialState(){return {version:APP_VERSION,player_id:clientId(),updated_at:null,player:{name:"",server_id:"",hq_level:null,power_m:null,coordinates:null,role:"R1",updated_at:null},player_context:{objective:"auto",account_age_days:null,server_profile:"auto",updated_at:null},activity_events:[],exclusive_weapons:[],hero_progression:[],hero_profiles:[],progression_snapshots:[],drone:{level:null,power_m:null,updated_at:null},shop:{store_type:"",currency:"",currency_balance:null,vip_level:null,vip_days_remaining:null,offers:[],snapshots:[],updated_at:null},squads:[1,2,3,4].map(emptySquad),alliance:{id:null,server_id:"",tag:"",name:"",role:"R1",management_verified:false,invite_code:"",members:[],roster_review:[],former_members:[],roster_snapshot_complete_at:null,unlinked_accounts:[],identity_link_status:"unknown",desert_storm:{team:"A",battle_time:"",registered_keys:[],plan:null,updated_at:null},updated_at:null},vs:{week:null,day:null,theme:"",our_alliance:"",our_tag:"",our_server_id:"",opponent:"",opponent_tag:"",opponent_server_id:"",our_score:null,their_score:null,our_percent:null,their_percent:null,time_remaining_text:"",time_remaining_seconds:null,personal_name:"",personal_rank:null,personal_score:null,leaderboard:[],score_confirmed:false,snapshots:[],updated_at:null},season:{name:"",number:null,day:null,total_days:null,profession:"",progress_pct:null,resistance:null,focus:null,lifecycle:"unknown",lifecycle_source:null,ended_at:null,measured_hybrid_synergy:false,awakening_swap:null,updated_at:null},technology:{type_mastery_pct:null,hero_tech_pct:null,siege_to_seize_pct:null,defensive_fortification_pct:null,tactical_weapon_pct:null,updated_at:null},sync:{provider:"warboost-local",provider_kind:"local",access_status:"pending",capabilities:[],status:"local",last_sync:null,last_error:null,auto_ready:true,last_scan:null,official_last_sync:null,public_last_sync:null,sources:{official:false,public:false,scan:false,alliance:false}}}}
function canonicalStoredHeroName(v){return canonicalHeroName(v)}
function mergeExclusiveWeapons(baseList,incomingList){
  const out=Array.isArray(baseList)?baseList.map(x=>({...x,hero_name:canonicalStoredHeroName(x?.hero_name)})):[];
  if(!Array.isArray(incomingList))return out;
  const keyOf=x=>String(canonicalStoredHeroName(x?.hero_name)||x?.weapon_name||"").trim().toLowerCase();
  for(const item of incomingList){
    if(!item||typeof item!=="object")continue;
    const key=keyOf(item);
    if(!key)continue;
    const idx=out.findIndex(x=>keyOf(x)===key);
    const normalized={...item,hero_name:canonicalStoredHeroName(item?.hero_name)};
    if(idx>=0)out[idx]={...out[idx],...normalized};
    else out.push(normalized);
  }
  return out.slice(0,24);
}
function mergeHeroProgression(baseList,incomingList){
  const out=Array.isArray(baseList)?baseList.map(x=>({...x,hero_name:canonicalStoredHeroName(x?.hero_name||x?.name),awakening:x?.awakening?{...x.awakening}:null})):[];
  if(!Array.isArray(incomingList))return out;
  const keyOf=x=>String(canonicalStoredHeroName(x?.hero_name||x?.name)||"").trim().toLowerCase();
  for(const item of incomingList){
    if(!item||typeof item!=="object")continue;const key=keyOf(item);if(!key)continue;const idx=out.findIndex(x=>keyOf(x)===key);
    const normalized={...item,hero_name:canonicalStoredHeroName(item?.hero_name||item?.name),awakening:item?.awakening?{...(idx>=0?out[idx]?.awakening||{}:{}),...item.awakening}:idx>=0?out[idx]?.awakening||null:null};
    if(idx>=0)out[idx]={...out[idx],...normalized};else out.push(normalized);
  }
  return out.slice(0,40);
}
function heroProfileFieldStamp(x,f){const n=Date.parse(x?.field_updated_at?.[f]||x?.updated_at||"");return Number.isFinite(n)?n:0}
function mergeHeroProfiles(baseList,incomingList){
  const fields=["level","stars","power","exclusive","gear","awakening"],out=new Map();
  const normalize=x=>{const hero_name=canonicalStoredHeroName(x?.hero_name||x?.name);if(!hero_name)return null;return {...x,hero_name,field_updated_at:{...(x?.field_updated_at||{})},field_source:{...(x?.field_source||{})}}};
  for(const raw of Array.isArray(baseList)?baseList:[]){const x=normalize(raw);if(x)out.set(x.hero_name.toLowerCase(),x)}
  for(const raw of Array.isArray(incomingList)?incomingList:[]){const n=normalize(raw);if(!n)continue;const key=n.hero_name.toLowerCase(),cur=out.get(key)||normalize({hero_name:n.hero_name});for(const f of fields){const nv=n?.[f];if(!hasValue(nv))continue;if(!hasValue(cur?.[f])||heroProfileFieldStamp(n,f)>=heroProfileFieldStamp(cur,f)){cur[f]=typeof structuredClone==="function"?structuredClone(nv):JSON.parse(JSON.stringify(nv));cur.field_updated_at[f]=n?.field_updated_at?.[f]||n.updated_at||cur.field_updated_at?.[f]||cur.updated_at||null;if(n?.field_source?.[f])cur.field_source[f]=n.field_source[f]}}if((Date.parse(n.updated_at||"")||0)>=(Date.parse(cur.updated_at||"")||0))cur.updated_at=n.updated_at||cur.updated_at||null;out.set(key,cur)}
  return [...out.values()].sort((a,b)=>a.hero_name.localeCompare(b.hero_name)).slice(0,40);
}

function cleanShopSnapshot(x){
  if(!x||typeof x!=="object")return null;
  const offers=Array.isArray(x.offers)?x.offers.filter(o=>o&&o.item_name).slice(0,24):[];
  const store_type=canonicalShopStore(x.store_type||x.store||"")||String(x.store_type||x.store||"").trim();
  if(!offers.length&&!store_type)return null;
  return {store_type,currency:x.currency||"",currency_balance:x.currency_balance??null,vip_level:x.vip_level??null,vip_days_remaining:x.vip_days_remaining??null,offers,updated_at:x.updated_at||null};
}
function mergeShopState(baseShop={},incomingShop){
  if(!incomingShop||typeof incomingShop!=="object")return {...baseShop,snapshots:Array.isArray(baseShop.snapshots)?baseShop.snapshots:[]};
  const current={...baseShop,...incomingShop,store_type:canonicalShopStore(incomingShop.store_type||baseShop.store_type||"")||String(incomingShop.store_type||baseShop.store_type||"").trim(),offers:Array.isArray(incomingShop.offers)?incomingShop.offers:(baseShop.offers||[])};
  const pool=[...(Array.isArray(baseShop.snapshots)?baseShop.snapshots:[]),...(Array.isArray(incomingShop.snapshots)?incomingShop.snapshots:[])];
  const fresh=cleanShopSnapshot(incomingShop);
  if(fresh&&fresh.offers.length)pool.push(fresh);
  const seen=new Set(),snapshots=[];
  for(const raw of pool){
    const snap=cleanShopSnapshot(raw);if(!snap)continue;
    const key=`${snap.store_type.toLowerCase()}|${snap.updated_at||""}|${snap.offers.map(o=>`${String(o.item_name).toLowerCase()}@${o.price??""}${o.currency??""}`).sort().join(";")}`;
    if(seen.has(key))continue;seen.add(key);snapshots.push(snap);
  }
  snapshots.sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
  current.snapshots=snapshots.slice(0,36);
  return current;
}
function mergeHeroSlotIdentitySafe(baseHero={},incomingHero){
  const b={...emptyHero(),...(baseHero||{}),name:canonicalStoredHeroName(baseHero?.name)};
  if(!incomingHero||typeof incomingHero!=="object")return b;
  const incomingName=canonicalStoredHeroName(incomingHero?.name),baseName=canonicalStoredHeroName(b.name);
  // V2.4.5: attributes never jump from the previous slot occupant to a new hero.
  if(incomingName&&baseName&&incomingName.toLowerCase()!==baseName.toLowerCase())return {...emptyHero(),...incomingHero,name:incomingName};
  if(!incomingName)return b;
  return {...b,...incomingHero,name:incomingName};
}
function mergeState(base,incoming){if(!incoming||typeof incoming!=="object")return base;const out={...base,...incoming};out.player={...base.player,...incoming.player};out.player_context={...(base.player_context||{}),...(incoming.player_context||{})};out.activity_events=mergeActivityEvents(base.activity_events,incoming.activity_events);out.drone={...base.drone,...incoming.drone};out.shop=mergeShopState(base.shop,incoming.shop);out.alliance={...base.alliance,...incoming.alliance};out.vs=mergeVsState(base.vs,incoming.vs);out.season=repairSeasonState({...base.season,...incoming.season});out.technology={...(base.technology||{}),...(incoming.technology||{})};out.exclusive_weapons=mergeExclusiveWeapons(base.exclusive_weapons,incoming.exclusive_weapons);out.hero_progression=mergeHeroProgression(base.hero_progression,incoming.hero_progression);out.hero_profiles=mergeHeroProfiles(base.hero_profiles,incoming.hero_profiles);out.progression_snapshots=mergeProgressionSnapshots(base.progression_snapshots,incoming.progression_snapshots);out.sync={...base.sync,...incoming.sync,sources:{...base.sync.sources,...incoming.sync?.sources}};out.squads=Array.from({length:4},(_,i)=>{const b=base.squads?.[i]||emptySquad(i+1),src=incoming.squads?.[i];if(!src)return b;return {...b,...src,id:i+1,name:`Squad ${i+1}`,needs_rescan:src.needs_rescan===true,composition_changed_at:src.composition_changed_at||b.composition_changed_at||null,heroes:Array.from({length:5},(_,j)=>mergeHeroSlotIdentitySafe(b.heroes?.[j],src.heroes?.[j]))}});out.version=APP_VERSION;return out}
function hasValue(v){return !(v===null||v===undefined||v===""||(Array.isArray(v)&&v.length===0))}
function safeFields(base={},incoming={},preferBase=false){const out={...base};for(const [k,v] of Object.entries(incoming||{})){if(!hasValue(v))continue;if(preferBase&&hasValue(out[k]))continue;out[k]=v}return out}
function allianceMemberKey(m){const id=String(m?.player_id||"").trim();if(id)return `id:${id}`;const name=String(m?.name||"").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");return name?`name:${name}`:""}
function mergeAllianceMembersProtected(baseList,incomingList,preferBase=false){const out=[],index=new Map(),add=(raw,preferExisting)=>{if(!raw||typeof raw!=="object")return;const key=allianceMemberKey(raw);if(!key)return;const normalized={...raw,activity_events:mergeActivityEvents(raw.activity_events)};const i=index.get(key);if(i===undefined){index.set(key,out.length);out.push(normalized);return}const old=out[i],winner=preferExisting?safeFields(old,normalized,true):safeFields(old,normalized,false);winner.player_id=old.player_id||normalized.player_id||null;winner.name=normalized.name||old.name||"";winner.activity_events=mergeActivityEvents(old.activity_events,normalized.activity_events);winner.role=normalized.role||old.role||"R1";winner.management_role=normalized.management_role||old.management_role||"R1";out[i]=winner};for(const m of Array.isArray(baseList)?baseList:[])add(m,false);for(const m of Array.isArray(incomingList)?incomingList:[])add(m,preferBase);return out.slice(0,300)}
function mergeStateProtected(base,incoming,{preferBase=false}={}){
  if(!incoming||typeof incoming!=="object")return mergeState(initialState(),base);
  const out=mergeState(base,incoming);
  out.player=safeFields(base.player,incoming.player,preferBase);
  out.player_context=safeFields(base.player_context||{},incoming.player_context||{},preferBase);
  out.activity_events=mergeActivityEvents(base.activity_events,incoming.activity_events);
  out.drone=safeFields(base.drone,incoming.drone,preferBase);
  out.shop=mergeShopState(base.shop,incoming.shop);if(preferBase){out.shop={...out.shop,...base.shop,offers:base.shop?.offers||[],snapshots:out.shop.snapshots||base.shop?.snapshots||[]};}
  out.alliance=safeFields(base.alliance,incoming.alliance,preferBase);out.alliance.members=mergeAllianceMembersProtected(base.alliance?.members,incoming.alliance?.members,preferBase);
  out.vs=mergeVsState(base.vs,incoming.vs);if(preferBase)out.vs={...out.vs,...safeFields(incoming.vs,base.vs,false),snapshots:out.vs.snapshots||base.vs?.snapshots||[]};out.season=safeFields(base.season,incoming.season,preferBase);out.technology=safeFields(base.technology||{},incoming.technology||{},preferBase);out.hero_progression=mergeHeroProgression(base.hero_progression,incoming.hero_progression);out.hero_profiles=mergeHeroProfiles(base.hero_profiles,incoming.hero_profiles);out.progression_snapshots=mergeProgressionSnapshots(base.progression_snapshots,incoming.progression_snapshots);
  out.sync={...base.sync,...safeFields(base.sync,incoming.sync,preferBase),sources:{...base.sync?.sources,...incoming.sync?.sources}};
  out.squads=Array.from({length:4},(_,i)=>{const b=base.squads?.[i]||emptySquad(i+1),n=incoming.squads?.[i];if(!n)return b;const sq=safeFields(b,n,preferBase);sq.id=i+1;sq.name=`Squad ${i+1}`;sq.needs_rescan=preferBase?b.needs_rescan===true:n.needs_rescan===true;sq.composition_changed_at=(preferBase?b.composition_changed_at:null)||n.composition_changed_at||b.composition_changed_at||null;sq.heroes=Array.from({length:5},(_,j)=>{const bh=b.heroes?.[j]||emptyHero(j+1),nh=n.heroes?.[j];if(!nh)return bh;const nn=canonicalStoredHeroName(nh?.name),bn=canonicalStoredHeroName(bh?.name);if(nn&&bn&&nn.toLowerCase()!==bn.toLowerCase())return preferBase?bh:{...emptyHero(j+1),...nh,name:nn};if(!nn)return bh;const h=safeFields(bh,nh,preferBase);h.name=nn;return h});return sq});
  out.exclusive_weapons=mergeExclusiveWeapons(base.exclusive_weapons,incoming.exclusive_weapons);out.version=APP_VERSION;return out
}
function safeClone(value){try{return typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value))}catch{return value}}
function rememberLastGoodState(value,reason="local"){if(!hasMeaningfulCore(value))return;try{localStorage.setItem(BACKUP_KEY,JSON.stringify({saved_at:new Date().toISOString(),reason,state:safeClone(value)}))}catch{}}
function readLastGoodState(){try{return JSON.parse(localStorage.getItem(BACKUP_KEY)||"null")?.state||null}catch{return null}}
function accountStateKey(userId){const id=String(userId||"").trim();return id?`${ACCOUNT_STATE_PREFIX}${id}`:null}
function rememberAccountState(userId,value){const key=accountStateKey(userId);if(!key||!hasMeaningfulCore(value))return;try{localStorage.setItem(key,JSON.stringify({...safeClone(value),player_id:String(userId)}))}catch{}}
function readAccountState(userId){const key=accountStateKey(userId);if(!key)return null;try{const parsed=JSON.parse(localStorage.getItem(key)||"null");return parsed&&String(parsed.player_id||"")===String(userId)?parsed:null}catch{return null}}
function stateTimestamp(value){const n=Date.parse(value?.updated_at||"");return Number.isFinite(n)?n:0}
function safestLoginSeed(userId,currentState){
  const id=String(userId||"").trim(),owner=String(currentState?.player_id||"").trim(),localOwner=clientId(),cached=readAccountState(id);
  const currentAllowed=Boolean(id&&(owner===id||!owner||owner===localOwner));
  const current=currentAllowed?safeClone(currentState):null;
  if(cached&&current)return stateTimestamp(current)>=stateTimestamp(cached)?current:safeClone(cached);
  return cached?safeClone(cached):current;
}
function readLegacyJson(key){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null}catch{return null}}
function hasMeaningfulCore(x){return Boolean(x?.player?.name||x?.player?.server_id||Number(x?.player?.hq_level)>0||Number(x?.player?.power_m)>0||(x?.squads||[]).some(sq=>Number(sq?.power)>0||(sq?.heroes||[]).some(h=>h?.name||h?.level||h?.stars||h?.exclusive||h?.gear))||Number(x?.drone?.level)>0||Number(x?.drone?.power_m)>0||x?.alliance?.tag||(x?.alliance?.members||[]).length||(x?.activity_events||[]).length)}
function reconcileCurrentPlayerAllianceIdentity({touch=false}={}){
  const result=linkCurrentPlayerIdentityIntoRoster(state.alliance?.members,{playerId:state.player_id,name:state.player?.name,serverId:state.player?.server_id,allianceTag:state.alliance?.tag,activityEvents:state.activity_events,updatedAt:touch?new Date().toISOString():(state.updated_at||new Date().toISOString())});
  state.alliance={...state.alliance,server_id:state.player?.server_id||state.alliance?.server_id||"",members:result.members,identity_link_status:result.status};
  return result;
}
function legacyRole(v){const r=String(v||'').trim().toUpperCase();if(r==='R5'||r==='R4'||r==='R3'||r==='R2'||r==='R1')return r;if(r==='PLAYER'||r==='JOUEUR')return 'R1';return null}
function migrateLegacyLocalState(seed){
  const out=mergeState(initialState(),seed||{});let changed=false;
  const profile=readLegacyJson('wb10_profile')||{}, alliance=readLegacyJson('wb10_alliance')||{}, simple=readLegacyJson('wb10_simple')||{}, roster=readLegacyJson('wb10_roster'), account=readLegacyJson('wb12_account')||readLegacyJson('wb11_account')||{};
  const setIfEmpty=(obj,key,value)=>{if(value===null||value===undefined||value==='')return;if(obj[key]===null||obj[key]===undefined||obj[key]===''){obj[key]=value;changed=true}};
  setIfEmpty(out.player,'name',account.name&&account.name!=='Invité'?String(account.name):null);
  setIfEmpty(out.player,'server_id',alliance.server||profile.server);
  setIfEmpty(out.player,'hq_level',profile.qg?Number(profile.qg)||profile.qg:null);
  setIfEmpty(out.player,'power_m',profile.power?Number(String(profile.power).replace(',','.'))||profile.power:null);
  const r=legacyRole(account.role);if(r&&(!out.player.role||out.player.role==='R1')){out.player.role=r;changed=true}
  setIfEmpty(out.alliance,'tag',alliance.alliance);
  const sq=out.squads?.[0];if(sq){
    setIfEmpty(sq,'power',profile.squadPower?Number(String(profile.squadPower).replace(',','.'))||profile.squadPower:null);
    for(let i=0;i<5;i++){
      const h=sq.heroes[i],legacyName=canonicalStoredHeroName(profile[`heroName${i+1}`]),currentName=canonicalStoredHeroName(h?.name);
      // V2.5.0: legacy slot fields may only be imported during an empty first-time migration.
      // Once a hero identity already exists in core state, never enrich it directly from wb10_profile.
      const emptyIdentity=Boolean(legacyName&&!currentName);
      if(emptyIdentity)setIfEmpty(h,'name',legacyName);
      // Existing named heroes are never enriched directly from the slot-based legacy profile.
      // They are handled later by the identity-aware recovery engine, which can require corroboration.
      if(!emptyIdentity)continue;
      setIfEmpty(h,'level',profile[`heroLevel${i+1}`]?Number(profile[`heroLevel${i+1}`])||profile[`heroLevel${i+1}`]:null);
      setIfEmpty(h,'stars',profile[`heroStars${i+1}`]?Number(profile[`heroStars${i+1}`])||profile[`heroStars${i+1}`]:null);
      setIfEmpty(h,'exclusive',profile[`heroWeapon${i+1}`]?Number(profile[`heroWeapon${i+1}`])||profile[`heroWeapon${i+1}`]:null);
      setIfEmpty(h,'gear',profile[`heroGear${i+1}`]||null);
    }
  }
  setIfEmpty(out.drone,'level',profile.droneLevel?Number(profile.droneLevel)||profile.droneLevel:null);setIfEmpty(out.drone,'power_m',profile.drone?Number(String(profile.drone).replace(',','.'))||profile.drone:null);
  setIfEmpty(out.vs,'day',simple.vsDay?Number(simple.vsDay)||simple.vsDay:null);setIfEmpty(out.season,'name',simple.season);setIfEmpty(out.season,'profession',simple.profession);
  if(Array.isArray(roster)&&roster.length&&!(out.alliance.members||[]).length){out.alliance.members=roster.slice(0,100).map(m=>({name:String(m?.name||'').trim(),role:legacyRole(m?.rank)||'R1',power_m:Number(m?.power)||0,updated_at:null})).filter(m=>m.name);changed=Boolean(out.alliance.members.length)||changed}
  if(changed){out.updated_at=out.updated_at||new Date().toISOString();out.migration={...(out.migration||{}),legacy_local_imported_at:new Date().toISOString(),legacy_keys:LEGACY_DATA_KEYS.filter(k=>localStorage.getItem(k)!==null)}}
  out.version=APP_VERSION;return {state:out,changed};
}
function recoverLocalHeroHistory(input){const legacyProfile=readLegacyJson("wb10_profile")||null,legacyImportedPlayers=readLegacyJson("wb19_imported_players")||[];return recoverHeroData(input,{legacyProfile,legacyImportedPlayers,currentPlayerName:input?.player?.name||""});}
function loadState(){try{const raw=localStorage.getItem(STORE_KEY);const parsed=raw?JSON.parse(raw):null;if(parsed&&hasMeaningfulCore(parsed))rememberLastGoodState(parsed,"pre-v2.5.28-load");const base=parsed?mergeState(initialState(),parsed):initialState();const migrated=migrateLegacyLocalState(base),repaired=repairLegacySquadIdentity(migrated.state),recovered=recoverLocalHeroHistory(repaired.state),finalRepair=repairLegacySquadIdentity(recovered.state);let next=finalRepair.state;const backup=readLastGoodState();if(!hasMeaningfulCore(next)&&hasMeaningfulCore(backup))next=mergeStateProtected(next,backup,{preferBase:false});next.version=APP_VERSION;if(migrated.changed||repaired.changed||recovered.changed||finalRepair.changed||!raw)localStorage.setItem(STORE_KEY,JSON.stringify(next));rememberLastGoodState(next,"post-v2.5.28-load");return next}catch{const backup=readLastGoodState();return hasMeaningfulCore(backup)?mergeState(initialState(),backup):initialState()}}

let state=loadState(),serverNow=new Date(),pushTimer=null,suppressPush=false,cloud=null,cloudSession=null,cloudRecoveryRedirect="",cloudInit={status:"starting",configured:false,transport:"direct-supabase-auth-api",error:null},proState={active:false,status:"free",configured:false,plan:null,beta:false,payments_enabled:false,commercial_preview:false,subscription:null},betaState={release:true,enforced:false,configured:false,allowed:false,access_status:"sign-in-required",consent_version:BETA_CONSENT_VERSION,payments_enabled:false,pro_included:true},scanImageData=null,supportTicketsState=[],supportBusy=false;
if(!(state.progression_snapshots||[]).length&&hasMeaningfulCore(state))state.progression_snapshots=appendProgressionSnapshot([],state,{source:"baseline",at:state.updated_at||new Date().toISOString()});
let desertStormSearchTerm="";
let rosterScanFiles=[],rosterScanDraft=[];
let rankManagerSearchTerm="",rankChangeDraft=new Map();
const ROSTER_SCAN_FILE_LIMIT=DEFAULT_ROSTER_SCAN_FILE_LIMIT;
reconcileCurrentPlayerAllianceIdentity();
let voiceGreetedSections=new Set(),availableVoices=[];
const openRosterRoles=new Set();
let pendingHeroSquadId=null,pendingHeroSuggestions=[],pendingHeroScanSlots=[];
function clearScanImage(){scanImageData=null;const f=$("#scanFile"),p=$("#scanPreview");if(f)f.value="";if(p)p.classList.add("hidden")}
function heroConfirmOptions(selected){return [`<option value="">${esc(t("hero_choose"))}</option>`].concat(HERO_CATALOG.map(n=>`<option value="${esc(n)}"${n===selected?" selected":""}>${esc(n)}</option>`)).join("")}
function openHeroConfirmation(squadId,suggestions=[]){pendingHeroSquadId=Number(squadId)||null;pendingHeroSuggestions=Array.from({length:5},(_,i)=>String(suggestions?.[i]||"").trim());const panel=$("#heroConfirmPanel"),rows=$("#heroConfirmRows");if(!panel||!rows||!pendingHeroSquadId)return false;const sq=state.squads[pendingHeroSquadId-1];if(!sq)return false;rows.innerHTML=(sq.heroes||[]).slice(0,5).map((h,i)=>{const saved=isGenericHeroName(h?.name)?"":h.name;const suggested=pendingHeroSuggestions[i]&&!isGenericHeroName(pendingHeroSuggestions[i])?pendingHeroSuggestions[i]:"";const current=suggested||saved;return `<div class="heroConfirmRow"><span>${i+1}</span><select data-hero-slot="${i}">${heroConfirmOptions(current)}</select></div>`}).join("");$("#heroConfirmTitle").textContent=t("hero_confirm_title",{squad:pendingHeroSquadId});panel.classList.remove("hidden");return true;}
function startHeroConfirmation(squadId,suggestions=[],scanSlots=[]){const id=Number(squadId);pendingHeroScanSlots=Array.from({length:5},(_,i)=>({...((scanSlots?.[i]&&typeof scanSlots[i]==="object")?scanSlots[i]:{})}));if(!Number.isInteger(id)||id<1||id>4)return;openDrawer("scan");renderScanTypeOptions();const type=$("#scanType");if(type)type.value=`squad${id}`;const st=$("#scanStatus");if(st){st.className="notice warn";st.textContent=t("hero_confirm_needed")}const opened=openHeroConfirmation(id,suggestions);if(!opened)return;const drawer=$("#scanDrawer"),panel=$("#heroConfirmPanel");if(drawer)drawer.scrollTop=0;requestAnimationFrame(()=>requestAnimationFrame(()=>{try{panel?.scrollIntoView({behavior:"smooth",block:"center"})}catch{if(drawer)drawer.scrollTop=Math.max(0,(panel?.offsetTop||0)-24)}}));}
function closeHeroConfirmation(clearImage=true){pendingHeroSquadId=null;pendingHeroSuggestions=[];pendingHeroScanSlots=[];$("#heroConfirmPanel")?.classList.add("hidden");if(clearImage)clearScanImage()}
async function saveHeroConfirmation(){
  if(!pendingHeroSquadId)return;
  const selects=[...document.querySelectorAll("#heroConfirmRows select[data-hero-slot]")],values=selects.map(x=>String(x.value||"").trim()),st=$("#scanStatus"),btn=$("#saveHeroNamesBtn");
  if(values.length!==5||values.some(v=>!v)){st.className="notice warn";st.textContent=t("hero_all_required");return}
  if(new Set(values.map(v=>canonicalStoredHeroName(v).toLowerCase())).size!==values.length){st.className="notice warn";st.textContent=t("hero_duplicate");return}
  const id=pendingHeroSquadId,now=new Date().toISOString();let next;
  try{next=reconcileConfirmedSquad(state,{squadId:id,names:values,incomingHeroes:pendingHeroScanSlots,updatedAt:now}).state}catch{st.className="notice warn";st.textContent=t("hero_save_failed");return}
  // V2.4.7: confirmation remains local-first. A slow/unavailable cloud must never block the button.
  next.updated_at=now;next.version=APP_VERSION;
  if(btn){btn.disabled=true;btn.textContent=t("syncing")}
  st.className="notice";st.textContent=t("hero_saving");
  state=next;
  saveState(); // saves immediately, then schedules the cloud push in background.
  st.className="notice";st.textContent=t("hero_confirm_saved");
  closeHeroConfirmation(true);
}
async function skipHeroConfirmation(){
  if(!pendingHeroSquadId){closeHeroConfirmation(true);return}
  const id=pendingHeroSquadId,next=JSON.parse(JSON.stringify(state)),sq=next.squads?.[id-1],st=$("#scanStatus"),btn=$("#skipHeroNamesBtn");
  if(sq){sq.needs_rescan=true;sq.composition_changed_at=new Date().toISOString();if(sq?.heroes)for(const h of sq.heroes){if(isGenericHeroName(h?.name))h.name=""}}
  next.version=APP_VERSION;
  if(btn){btn.disabled=true;btn.textContent=t("syncing")}
  state=next;
  saveState(); // local-first; cloud remains best-effort in the background.
  st.className="notice";st.textContent=t("hero_confirm_skipped");
  closeHeroConfirmation(true);
}

function inlineHeroConfirmationHtml(sq,squadId){const rows=Array.from({length:5},(_,i)=>{const h=sq.heroes?.[i]||emptyHero(i+1),saved=isGenericHeroName(h?.name)?"":canonicalStoredHeroName(h.name);return `<div class="inlineHeroConfirmRow"><span class="inlineHeroSlot">${i+1}</span><select class="fieldSelect inlineHeroSelect" data-inline-hero-slot="${i}">${heroConfirmOptions(saved)}</select></div>`}).join("");return `<div class="inlineHeroConfirm" data-inline-confirm="${squadId}"><div class="inlineHeroConfirmHead"><div><b>${esc(t("hero_confirm_title",{squad:squadId}))}</b><small>${esc(t("hero_confirm_help"))}</small></div><span class="pill">${esc(t("hero_confirm_badge"))}</span></div><div class="inlineHeroConfirmRows">${rows}</div><div class="notice warn hidden" data-inline-hero-status></div><button class="primaryAction inlineHeroSaveBtn" type="button" data-inline-hero-save="${squadId}">${esc(t("hero_save"))}</button></div>`}
async function saveInlineHeroNames(squadId,container,button=null){
  const id=Number(squadId);
  if(!Number.isInteger(id)||id<1||id>4||!container)return;
  const selects=[...container.querySelectorAll("select[data-inline-hero-slot]")];
  const values=selects.map(x=>String(x.value||"").trim());
  const status=container.querySelector("[data-inline-hero-status]");
  const show=(key,warn=true)=>{if(status){status.className=`notice${warn?" warn":""}`;status.textContent=t(key)}};
  if(values.length!==5||values.some(v=>!v))return show("hero_all_required");
  if(new Set(values).size!==values.length)return show("hero_duplicate");
  const now=new Date().toISOString();
  let next;try{next=reconcileConfirmedSquad(state,{squadId:id,names:values,incomingHeroes:[],updatedAt:now}).state}catch{return show("hero_save_failed")}
  next.updated_at=now;next.version=APP_VERSION;
  if(button){button.disabled=true;button.textContent=t("syncing")}
  show("hero_saving",false);
  // V2.4.7: save immediately in the browser. Cloud persistence runs asynchronously.
  state=next;
  saveState();
  requestAnimationFrame(()=>{const squads=[...document.querySelectorAll("#squadList .squad")];squads[id-1]?.classList.add("open")});
}

if(!localStorage.getItem(LANG_KEY)){for(const key of LEGACY_LANGUAGE_KEYS){const v=localStorage.getItem(key);if(v){localStorage.setItem(LANG_KEY,v);break}}}
let languageChoice=localStorage.getItem(LANG_KEY)||"auto",lang=resolveLanguage(languageChoice),locale=localeFor(lang),t=translator(lang);
function betaConsentStorageKey(){const id=String(cloudSession?.user?.id||"").trim();return id?`${BETA_CONSENT_KEY}:${id}`:null}
function betaConsentAccepted(){const key=betaConsentStorageKey();return Boolean(key&&localStorage.getItem(key)==="1")}
function authHeaders(extra={}){return {...extra,...(cloudSession?.access_token?{authorization:`Bearer ${cloudSession.access_token}`}:{}) ,...(betaConsentAccepted()?{"x-warboost-beta-consent":BETA_CONSENT_VERSION}:{})}}
function betaAccessAllowed(){return Boolean(cloudSession?.user)&&(!betaState.enforced||betaState.allowed)}
function betaPrivateDataVisible(){return Boolean(cloudSession?.user)&&betaAccessAllowed()&&betaConsentAccepted()}
function betaAccessMessage(){if(!cloudSession?.user)return t("beta_signin_required");if(betaState.enforced&&!betaState.allowed)return t("beta_invite_required");if(!betaState.enforced)return t("beta_allowlist_setup");return t("beta_invited")}
function requireBetaAccess(){if(betaAccessAllowed())return true;openDrawer("account");setTimeout(()=>$("#betaAccessSection")?.scrollIntoView({behavior:"smooth",block:"center"}),120);return false}
function requireBetaConsent(){if(betaConsentAccepted())return true;openDrawer("account");setTimeout(()=>$("#betaAccessSection")?.scrollIntoView({behavior:"smooth",block:"center"}),120);const el=$("#betaAccessStatus");if(el){el.className="notice warn";el.textContent=t("beta_consent_required")}return false}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function tpl(key,vars={}){return t(key,vars)}
function fmtPower(v){if(v===null||v===undefined||v==="")return "—";const n=Number(v);if(!Number.isFinite(n))return String(v);return `${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n)} M`}
function formatProPrice(plan){const amount=Number(plan?.amount);if(!Number.isFinite(amount))return plan?.price_label||"4,99 € / mois";const currency=String(plan?.currency||"eur").toUpperCase(),value=amount/100;try{return `${new Intl.NumberFormat(locale,{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(value)} ${t("per_month")}`}catch{return plan?.price_label||`${value.toFixed(2)} € ${t("per_month")}`}}
function fmtAgo(iso){if(!iso)return t("never");const d=Math.max(0,Date.now()-new Date(iso).getTime());if(d<60e3)return t("just_now");if(d<3600e3)return `${Math.floor(d/60e3)} ${t("minutes")}`;if(d<86400e3)return `${Math.floor(d/3600e3)} ${t("hours")}`;return `${Math.floor(d/86400e3)} ${t("days")}`}
function updatedLabel(iso){if(!iso)return t("not_synced");const d=Math.max(0,Date.now()-new Date(iso).getTime());return d<60e3?t("updated_now"):t("updated_ago",{ago:fmtAgo(iso)})}
function isoWeek(d){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return Math.ceil((((x-y)/86400000)+1)/7)}
function lastWarServerClock(d){return new Date(d.getTime()-2*60*60*1000)}
function currentVsWeek(){return isoWeek(lastWarServerClock(serverNow||new Date()))}
function currentVsDay(){return vsDayFromServer(serverNow||new Date())}
function normalizedRole(v){const r=String(v||"R1").toUpperCase();return /^R[1-5]$/.test(r)?r:"R1"}
function hasDeclaredAllianceCommandRole(){return ["R4","R5"].includes(normalizedRole(state?.player?.role))}
function isAllianceManager(){return state?.alliance?.management_verified===true&&["R4","R5"].includes(normalizedRole(state?.alliance?.role))}
function managerOnlyMessage(){return t("manager_only")}

function voiceEnabled(){return localStorage.getItem(VOICE_ENABLED_KEY)!=="0"}
function preferredVoiceId(){return localStorage.getItem(VOICE_ID_KEY)||""}
function refreshVoices(){if(!("speechSynthesis" in window))return;availableVoices=window.speechSynthesis.getVoices()||[];const sel=$("#voiceSelect");if(!sel)return;const chosen=preferredVoiceId(),langLocale=String(locale||"").toLowerCase();const sorted=[...availableVoices].sort((a,b)=>{const am=String(a.lang||"").toLowerCase().startsWith(langLocale.split("-")[0])?0:1,bm=String(b.lang||"").toLowerCase().startsWith(langLocale.split("-")[0])?0:1;return am-bm||String(a.name).localeCompare(String(b.name))});sel.innerHTML=`<option value="">${esc(t("automatic"))}</option>`+sorted.map(v=>`<option value="${esc(v.voiceURI)}"${v.voiceURI===chosen?" selected":""}>${esc(v.name)} · ${esc(v.lang||"")}</option>`).join("")}
function voiceGreetingText(){const name=state?.player?.name||"WarBoost",role=normalizedRole(state?.player?.role),k=String(lang||"en").toLowerCase();if(k.startsWith("fr")){const title={R5:"Général",R4:"Mon colonel",R3:"Commandant",R2:"Capitaine",R1:"Soldat"}[role]||role;return `Bonjour ${title} ${name}. WarBoost est prêt.`}return `${t("hello",{name})}. ${t("role")} ${role}. WarBoost.`}
function speakGreeting(section="player",force=false){if(!voiceEnabled()||!("speechSynthesis" in window))return;if(!force&&voiceGreetedSections.has(section))return;const text=voiceGreetingText();if(!text)return;try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text),chosen=preferredVoiceId(),voice=availableVoices.find(v=>v.voiceURI===chosen)||availableVoices.find(v=>String(v.lang||"").toLowerCase().startsWith(String(locale||"").toLowerCase().split("-")[0]));if(voice)u.voice=voice;u.lang=voice?.lang||locale;u.rate=.96;window.speechSynthesis.speak(u);if(!force)voiceGreetedSections.add(section)}catch{}}
function renderVoiceSettings(){const enabled=$("#voiceEnabled"),pill=$("#voiceStatusPill");if(enabled)enabled.checked=voiceEnabled();if(pill)pill.textContent=voiceEnabled()?t("voice_on"):t("voice_off");refreshVoices()}
function safeSelfRole(requested){return normalizedRole(requested)}

function vsDayFromServer(d){const day=lastWarServerClock(d).getUTCDay();return day===0?0:day}
function renderScanTypeOptions(){const sel=$("#scanType");if(!sel)return;const current=sel.value||"profile";const opts=[["profile",t("scan_profile")],["squad1",`${t("squad")} 1`],["squad2",`${t("squad")} 2`],["squad3",`${t("squad")} 3`],["squad4",`${t("squad")} 4`],["drone",t("scan_drone")],["exclusive",t("scan_exclusive")],["awakening",t("scan_awakening")],["shop",t("scan_shop")],["vs",t("scan_vs")],["season",t("scan_season")]];sel.innerHTML=opts.map(([v,label])=>`<option value="${v}">${label}</option>`).join("");sel.value=opts.some(([v])=>v===current)?current:"profile"}
function applyLanguage(){lang=resolveLanguage(languageChoice);locale=localeFor(lang);t=translator(lang);document.documentElement.lang=lang;document.documentElement.dir=dirFor(lang);$$('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});$$('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));$$('[data-i18n-placeholder]').forEach(el=>el.setAttribute('placeholder',t(el.dataset.i18nPlaceholder)));const sel=$("#languageSelect");if(sel){sel.innerHTML=LANGUAGES.map(([v,label])=>`<option value="${v}">${label}</option>`).join("");sel.value=languageChoice}renderScanTypeOptions();renderClock();render();renderAuth();renderBeta();renderPro();renderVoiceSettings();renderSupportAccess();renderSupportTickets();$("#proPriorityPanel")?.classList.add("hidden");$("#playerSyncInfo")?.classList.remove("hidden")}
function saveState(){state=repairLegacySquadIdentity(state).state;state.updated_at=new Date().toISOString();state.version=APP_VERSION;localStorage.setItem(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"save");if(cloudSession?.user?.id&&String(state.player_id||"")===String(cloudSession.user.id))rememberAccountState(cloudSession.user.id,state);render();if(!suppressPush)scheduleServerSave()}
function scheduleServerSave(){clearTimeout(pushTimer);pushTimer=setTimeout(pushServerState,700)}

async function initCloudAuth(){
  cloud=null;cloudSession=null;cloudRecoveryRedirect="";cloudInit={status:"loading-config",configured:false,transport:"direct-supabase-auth-api",error:null};renderAuth();
  let cfg;
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    const r=await fetch("/api/cloud-config",{cache:"no-store",signal:controller.signal});clearTimeout(timer);
    cfg=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error("cloud-config request failed"),{code:"cloud_config_unreachable"});
  }catch(error){cloudInit={status:"config-unreachable",configured:false,transport:"direct-supabase-auth-api",error:error?.code||error?.name||"network"};renderAuth();renderBeta();return}
  if(!cfg?.configured||!cfg?.url||!cfg?.key){cloudInit={status:"config-missing",configured:false,transport:"direct-supabase-auth-api",error:"missing_config"};renderAuth();renderBeta();return}
  cloudRecoveryRedirect=/^https:\/\//i.test(String(cfg?.recovery_redirect_url||""))?String(cfg.recovery_redirect_url):"";
  cloudInit={status:"client-starting",configured:true,transport:"direct-supabase-auth-api",error:null};
  try{
    cloud=createWarBoostSupabaseAuthClient({url:cfg.url,key:cfg.key});
  }catch(error){cloud=null;cloudInit={status:"client-error",configured:true,transport:"direct-supabase-auth-api",error:error?.code||"client_error"};renderAuth();renderBeta();return}
  try{
    const {data,error}=await cloud.auth.getSession();
    if(error)throw error;
    cloudInit={status:"ready",configured:true,transport:cloud.diagnostics?.transport||"direct-supabase-auth-api",error:null};
    await applySession(data?.session||null);
    cloud.auth.onAuthStateChange((_event,session)=>applySession(session||null));
  }catch(error){cloudInit={status:"auth-unreachable",configured:true,transport:"direct-supabase-auth-api",error:error?.code||"auth_unreachable"};renderAuth();renderBeta()}
}
async function refreshBeta(){if(!cloudSession?.access_token){betaState={release:true,enforced:false,configured:false,allowed:false,access_status:"sign-in-required",consent_version:BETA_CONSENT_VERSION,payments_enabled:false,pro_included:true};renderBeta();return betaState}try{const r=await fetch("/api/pro",{cache:"no-store",headers:authHeaders()}),j=await r.json().catch(()=>({}));if(r.ok&&j.beta){betaState={...betaState,release:j.release!==false,enforced:Boolean(j.enforced??j.beta_enforced),configured:Boolean(j.beta_configured??j.enforced??j.beta_enforced),allowed:Boolean(j.allowed??j.active),access_status:j.access_status||j.beta_access||(j.active?"invited":"invite-required"),consent_version:j.consent_version||BETA_CONSENT_VERSION,payments_enabled:false,pro_included:Boolean(j.pro_included)}}else betaState={...betaState,allowed:false,access_status:j.access_status||j.beta_access||j.error||"beta-status-error"}}catch{betaState={...betaState,allowed:false,access_status:"beta-status-error"}}renderBeta();return betaState}
async function applySession(session){
  cloudSession=session||null;
  if(cloudSession?.user?.id){
    // Fail closed while the server re-checks this account against the private-beta allowlist.
    betaState={...betaState,allowed:false,access_status:"checking"};
    const userId=String(cloudSession.user.id),oldOwner=String(state?.player_id||""),localOwner=clientId();
    // Preserve the previous authenticated account before switching, but never offer its state to another user.
    if(oldOwner&&oldOwner!==localOwner&&oldOwner!==userId&&hasMeaningfulCore(state))rememberAccountState(oldOwner,state);
    const loginSeed=safestLoginSeed(userId,state);
    if(hasMeaningfulCore(loginSeed))rememberLastGoodState(loginSeed,"before-login-own-state");
    state=loginSeed?mergeState(initialState(),loginSeed):initialState();
    state.player_id=userId;
    localStorage.setItem(STORE_KEY,JSON.stringify(state));
    if(hasMeaningfulCore(loginSeed))rememberAccountState(userId,state);
    await refreshBeta();
    if(betaAccessAllowed()&&betaConsentAccepted()){
      const pulled=await pullServerState(loginSeed);
      if(pulled?.cloud_empty&&hasMeaningfulCore(loginSeed)){
        state=mergeStateProtected(state,{...loginSeed,player_id:userId},{preferBase:false});
        state.player_id=userId;saveState();await pushServerState();
      }
    }
    await refreshPro();
  }else{
    proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null};
    betaState={release:true,enforced:false,configured:false,allowed:false,access_status:"sign-in-required",consent_version:BETA_CONSENT_VERSION,payments_enabled:false,pro_included:true};
  }
  render();renderAuth();renderBeta();renderPro();renderSupportAccess();
}
function cloudAuthFailureMessage(){
  if(cloudInit.status==="config-missing")return t("auth_cloud_missing");
  if(cloudInit.status==="config-unreachable")return t("auth_cloud_config_unreachable");
  if(cloudInit.status==="client-error")return t("auth_client_unavailable");
  if(cloudInit.status==="auth-unreachable")return t("auth_cloud_unreachable");
  return t("auth_cloud_unreachable");
}
function renderAuth(){
  const logged=Boolean(cloudSession?.user);
  $("#authLoggedOut")?.classList.toggle("hidden",logged);
  $("#authLoggedIn")?.classList.toggle("hidden",!logged);
  if($("#authPill"))$("#authPill").textContent=logged?t("connected"):(cloudInit.status==="ready"?t("ready"):t("local"));
  if(logged&&$("#authIdentity"))$("#authIdentity").textContent=`WarBoost · ${cloudSession.user.email||""}`;
  if(!logged&&pendingAuthEmail())revealEmailConfirmation(pendingAuthEmail());
  const msg=$("#authMessage");
  if(!logged&&msg&&["config-missing","config-unreachable","client-error","auth-unreachable"].includes(cloudInit.status)){msg.className="notice warn";msg.textContent=cloudAuthFailureMessage()}
  renderBeta();renderPro();
}
function renderBeta(){const pill=$("#betaAccessPill"),status=$("#betaAccessStatus"),row=$("#betaConsentRow"),checkbox=$("#betaConsent");if(pill){const invited=Boolean(cloudSession?.user&&betaAccessAllowed());pill.textContent=!cloudSession?.user?t("beta_signin_short"):betaState.enforced&&!betaState.allowed?t("beta_invite_short"):betaState.enforced?t("beta_invited_short"):t("beta_setup_short");pill.className=`pill ${invited?"active":"warn"}`}if(status){status.className=`notice${cloudSession?.user&&betaAccessAllowed()?"":" warn"}`;status.textContent=betaAccessMessage()}if(row)row.classList.toggle("hidden",!cloudSession?.user||!betaAccessAllowed());if(checkbox)checkbox.checked=betaConsentAccepted();$$('.moduleCard').forEach(x=>{const locked=Boolean(!cloudSession?.user||(betaState.enforced&&!betaState.allowed));x.classList.toggle("betaLocked",locked);x.setAttribute("aria-disabled",locked?"true":"false")});const fab=$("#betaFeedbackBtn");if(fab)fab.classList.toggle("hidden",Boolean(!cloudSession?.user||(betaState.enforced&&!betaState.allowed)))}
function authMessage(text,ok=false){const el=$("#authMessage");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text}

const PENDING_AUTH_EMAIL_KEY="warboost_v1_pending_email";
function pendingAuthEmail(){return String(localStorage.getItem(PENDING_AUTH_EMAIL_KEY)||"").trim().toLowerCase()}
function rememberPendingAuthEmail(email){const value=String(email||"").trim().toLowerCase();if(value)localStorage.setItem(PENDING_AUTH_EMAIL_KEY,value);return value}
function clearPendingAuthEmail(){localStorage.removeItem(PENDING_AUTH_EMAIL_KEY)}
function revealEmailConfirmation(email){
  const value=rememberPendingAuthEmail(email||pendingAuthEmail());
  if(value&&$("#authEmail")&&!$("#authEmail").value)$("#authEmail").value=value;
  $("#otpBox")?.classList.remove("hidden");
  return value;
}
function authNeedsEmailConfirmation(error){
  const code=String(error?.code||"").toLowerCase(),message=String(error?.message||"").toLowerCase();
  return code==="email_not_confirmed"||code==="email_not_verified"||message.includes("email not confirmed")||message.includes("email not verified");
}
function authFriendlyError(error){
  const code=String(error?.code||"").toLowerCase(),message=String(error?.message||"");
  if(authNeedsEmailConfirmation(error))return t("auth_email_not_confirmed");
  if(code==="invalid_credentials"||/invalid login credentials/i.test(message))return t("auth_invalid_credentials");
  if(code==="user_already_exists"||code==="email_exists"||/already registered|already exists/i.test(message))return t("auth_account_exists");
  if(Number(error?.status)===429||code.includes("rate_limit")||/rate limit|too many requests/i.test(message))return t("auth_rate_limited");
  if(code==="auth_network_unavailable")return t("auth_cloud_unreachable");
  return message||t("auth_cloud_unreachable");
}
function setAuthBusy(busy){
  for(const id of ["loginBtn","signupBtn","verifyOtpBtn","resendOtpBtn","forgotPasswordBtn"]){const el=$("#"+id);if(el)el.disabled=Boolean(busy)}
}
function inviteMessage(text,ok=false){const el=$("#inviteStatus");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text;el.classList.remove("hidden")}
async function pushServerState(){if(!cloudSession?.access_token||!betaAccessAllowed()||!betaConsentAccepted())return;try{const r=await fetch("/api/state",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({state})});if(!r.ok)return;const j=await r.json().catch(()=>({}));if(j?.updated_at){state.sync.last_sync=state.sync.last_sync||j.updated_at;localStorage.setItem(STORE_KEY,JSON.stringify(state));rememberAccountState(cloudSession.user.id,state)}}catch{}}
async function pullServerState(loginSeed=null){if(!cloudSession?.access_token)return {skipped:true};try{const r=await fetch("/api/state",{cache:"no-store",headers:authHeaders()}),j=await r.json().catch(()=>({}));if(!r.ok){if(j?.error==="database_schema_missing"){state.sync.last_error=t("cloud_schema_missing");state.sync.status="offline";renderProvider()}return {ok:false,error:j?.error||"state_error"}}if(!j?.state)return {ok:true,cloud_empty:true};const localBefore=hasMeaningfulCore(loginSeed)?loginSeed:safeClone(state),localTs=Date.parse(state?.updated_at||"")||0,cloudTs=Date.parse(j.updated_at||j.state?.updated_at||"")||0,preferLocal=Boolean(localTs&&cloudTs&&localTs>cloudTs);suppressPush=true;let merged=mergeStateProtected(state,j.state,{preferBase:preferLocal});if(hasMeaningfulCore(localBefore)&&!hasMeaningfulCore(merged))merged=mergeStateProtected(merged,localBefore,{preferBase:false});const localRecovered=recoverLocalHeroHistory(merged);state=repairLegacySquadIdentity(localRecovered.state).state;state.player_id=cloudSession.user.id;state.updated_at=preferLocal?(state.updated_at||new Date().toISOString()):(j.state?.updated_at||j.updated_at||state.updated_at);localStorage.setItem(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"cloud-pull");rememberAccountState(cloudSession.user.id,state);render();suppressPush=false;return {ok:true,cloud_empty:false}}catch{return {ok:false,error:"offline"}}}

async function refreshServerTime(){try{const r=await fetch("/api/health",{cache:"no-store"});if(!r.ok)throw new Error();const j=await r.json();serverNow=new Date(j.now);state.vs.week=j.iso_week;state.vs.day=j.vs_day;$("#syncPill").className="syncState good";$("#syncPill").textContent=t("server_ok")}catch{serverNow=new Date();state.vs.week=isoWeek(serverNow);state.vs.day=vsDayFromServer(serverNow);$("#syncPill").className="syncState";$("#syncPill").textContent=t("local_time")}renderClock();render()}
function renderClock(){const d=serverNow;const clock=$("#serverClock"),day=$("#serverDay");if(clock)clock.textContent=d.toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit",second:"2-digit"});if(day)day.textContent=`${d.toLocaleDateString(locale,{weekday:"long",day:"2-digit",month:"short"})} · ${t("week")} ${currentVsWeek()}`}
setInterval(()=>{serverNow=new Date(serverNow.getTime()+1000);renderClock()},1000);setInterval(refreshServerTime,5*60*1000);


function playerNeedsOnboarding(){
  if(!state?.player?.name)return false;
  const mainReady=squadHasSavedData(state.squads?.[0]);
  const droneReady=Number(state?.drone?.level)>0||Number(state?.drone?.power_m)>0;
  const powerReady=Number(state?.player?.power_m)>0;
  return !mainReady||!droneReady||!powerReady;
}
function renderPlayerOnboarding(){
  const box=$("#playerOnboarding");if(!box)return;
  box.classList.toggle("hidden",!betaPrivateDataVisible()||!playerNeedsOnboarding());
}
function recordProgressionSnapshot(source="update",at=new Date().toISOString()){
  state.progression_snapshots=appendProgressionSnapshot(state.progression_snapshots,state,{source,at});
}
function progressionMetricText(metric){if(!metric||metric.current===null)return "—";const change=metric.change_m===null?"":`${metric.change_m>=0?"+":""}${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(metric.change_m)} M${metric.pct!==null?` (${metric.pct>=0?"+":""}${metric.pct}%)`:""}`;return `${fmtPower(metric.current)}${change?` · ${change}`:""}`}
function renderPlayerProgression(){
  const box=$("#progressionSummary"),pill=$("#progressionFreshness");if(!box)return;const rows=state.progression_snapshots||[],latest=rows[rows.length-1],cmp=progressionComparison(rows,30),strongest=strongestSquadFromState(state);
  const freshness=strongest.updated_at||state?.drone?.updated_at||state?.updated_at||null;if(pill)pill.textContent=freshness?updatedLabel(freshness):t("sync_needed");
  if(!cmp){box.innerHTML=`<div class="notice" style="grid-column:1/-1">${esc(t("progression_need_two"))}</div>`;return}
  const cls=x=>x?.change_m>0?"deltaUp":"deltaFlat";box.innerHTML=`<div class="progressionMetric"><small>${esc(t("progression_account"))} · ${esc(cmp.account.elapsed_days??"—")}j</small><b>${esc(fmtPower(cmp.account.current))}</b><span class="${cls(cmp.account)}">${cmp.account.change_m===null?"—":esc(`${cmp.account.change_m>=0?"+":""}${cmp.account.change_m} M · ${cmp.account.pct??"—"}%`)}</span></div><div class="progressionMetric"><small>${esc(t("progression_squad"))} · ${esc(cmp.main_squad.elapsed_days??"—")}j</small><b>${esc(fmtPower(cmp.main_squad.current))}</b><span class="${cls(cmp.main_squad)}">${cmp.main_squad.change_m===null?"—":esc(`${cmp.main_squad.change_m>=0?"+":""}${cmp.main_squad.change_m} M · ${cmp.main_squad.pct??"—"}%`)}</span></div>`;
}
function openQuickScan(type){if(!requireBetaAccess())return;openDrawer("scan");renderScanTypeOptions();if($("#scanType"))$("#scanType").value=type}
function render(){
  const p=state.player,a=state.alliance,v=state.vs,s=state.season,d=state.drone||{},reveal=betaPrivateDataVisible();
  if(!$("#playerMeta"))return;

  // V2.5.20 privacy boundary: saved local/cloud data is preserved in state but is never rendered
  // until an invited WarBoost session is active and beta consent is accepted.
  if(!reveal){
    $("#playerMeta").textContent=t("to_connect");
    $("#allianceMeta").textContent="—";
    $("#vsMeta").textContent="—";
    $("#seasonMeta").textContent="—";
    $("#pName").textContent="—";$("#pHq").textContent="—";$("#pPower").textContent="—";$("#pDrone").textContent="—";
    const squadList=$("#squadList");if(squadList)squadList.innerHTML="";
    $("#playerOnboarding")?.classList.add("hidden");
    const exclusive=$("#exclusiveWeaponList");if(exclusive)exclusive.innerHTML="";
    if($("#exclusiveWeaponCount"))$("#exclusiveWeaponCount").textContent="0";
    $("#aTag").textContent="—";$("#aCount").textContent="0";$("#aRole").textContent="—";$("#inviteCode").textContent="—";
    if($("#shareInviteBtn"))$("#shareInviteBtn").disabled=true;
    $("#rosterFresh").textContent=t("sync_needed");
    const members=$("#memberList");if(members)members.innerHTML=`<div class="notice">${esc(t("beta_signin_required"))}</div>`;
    const activity=$("#activitySummary");if(activity)activity.innerHTML=`<div><b>🟢 0</b><small>${esc(t("activity_active_confirmed"))}</small></div><div><b>🟠 0</b><small>${esc(t("activity_refresh"))}</small></div><div><b>⚪ —</b><small>${esc(t("activity_inactivity_not_evaluated"))}</small></div>`;
    if($("#activityNote"))$("#activityNote").textContent=t("beta_signin_required");
    if($("#activityEventGrid"))$("#activityEventGrid").innerHTML="";if($("#playerActivityStatus"))$("#playerActivityStatus").textContent=t("beta_signin_required");if($("#playerActivityPill"))$("#playerActivityPill").textContent="—";if($("#allianceEventSummary"))$("#allianceEventSummary").innerHTML="";if($("#allianceIdentitySummary"))$("#allianceIdentitySummary").textContent=t("beta_signin_required");if($("#allianceParticipationTable"))$("#allianceParticipationTable").innerHTML="";if($("#unlinkedWarBoostAccounts"))$("#unlinkedWarBoostAccounts").innerHTML="";$("#unlinkedWarBoostDetails")?.classList.add("hidden");
    $("#vsWeekTitle").textContent=t("vs_week",{week:currentVsWeek()});
    $("#vsDayPill").textContent=currentVsDay()===0?t("vs_prep_day"):t("day_n",{day:currentVsDay()});
    $("#vsUs").textContent="—";$("#vsThem").textContent=t("unknown_opponent");$("#vsUsScore").textContent="—";$("#vsThemScore").textContent="—";
    renderVsTimeline();
    $("#sName").textContent="—";$("#sDay").textContent="—";$("#sProfession").textContent="—";
    if($("#seasonProfessionLabel"))$("#seasonProfessionLabel").textContent=t("profession");
    if($("#seasonSectionTitle"))$("#seasonSectionTitle").textContent=t("season_state");
    const bar=$("#seasonProgressBar"),progressWrap=bar?.closest(".progress");if(progressWrap)progressWrap.classList.add("hidden");if(bar)bar.style.width="0%";
    if($("#seasonProgressLabel"))$("#seasonProgressLabel").textContent="—";
    if($("#seasonLifecycleSelect"))$("#seasonLifecycleSelect").value="unknown";
    if($("#seasonStatus"))$("#seasonStatus").textContent=t("beta_signin_required");
    $("#proPriorityPanel")?.classList.add("hidden");
    if($("#allianceImmediate")){ $("#allianceImmediate").classList.add("hidden"); $("#allianceImmediate").innerHTML=""; }
    if($("#alliancePlanB")){ $("#alliancePlanB").classList.add("hidden"); $("#alliancePlanB").innerHTML=""; }
    if($("#warPlanText"))$("#warPlanText").textContent=t("war_plan_empty");
    if($("#desertStormRosterPicker"))$("#desertStormRosterPicker").innerHTML=`<div class="notice">${esc(t("beta_signin_required"))}</div>`;
    if($("#desertStormPlan")){ $("#desertStormPlan").classList.add("hidden"); $("#desertStormPlan").innerHTML=""; }
    renderAdvice();renderAccountFields();renderProvider();
    return;
  }

  $("#playerMeta").textContent=p.name?(p.hq_level?`${t("hq")} ${p.hq_level}`:t("connected")):t("to_connect");
  $("#allianceMeta").textContent=a.tag||"—";
  const homeVsSituation=vsSituation(v),homeVsFreshness=vsSnapshotFreshness(v,{now:serverNow});$("#vsMeta").textContent=scoreKnown(v)&&homeVsFreshness.current&&homeVsSituation.our_share!==null?`${Math.round(homeVsSituation.our_share)}%${Number(v.personal_rank)>0?` · #${Number(v.personal_rank)}`:""}`:scoreKnown(v)&&!homeVsFreshness.current?t("vs_status_stale"):`${t("week")} ${currentVsWeek()}`;
  $("#pName").textContent=p.name||"—";$("#pHq").textContent=p.hq_level?`${t("hq")} ${p.hq_level}`:t("to_fill");$("#pPower").textContent=Number(p.power_m)>0?fmtPower(p.power_m):t("to_fill");$("#pDrone").textContent=d.level?`${t("level")}${d.level}${d.power_m?` · ${fmtPower(d.power_m)}`:""}`:Number(d.power_m)>0?fmtPower(d.power_m):t("to_fill");
  renderPlayerOnboarding();renderSquads();renderPlayerProgression();renderExclusiveWeapons();renderPlayerActivity();
  $("#aTag").textContent=a.tag||"—";$("#aCount").textContent=String(a.members?.length||0);$("#aRole").textContent=p.role||"R1";
  const declaredManager=["R4","R5"].includes(normalizedRole(p.role)),verifiedManager=a.management_verified===true&&["R4","R5"].includes(normalizedRole(a.role)),cloudAlliance=Boolean(a.id||a.invite_code),canShareAllianceInvite=declaredManager&&(!cloudAlliance||verifiedManager);
  $("#inviteCode").textContent=canShareAllianceInvite?(state.alliance.invite_code||"—"):"—";const inviteNote=$("#inviteNote");if(inviteNote)inviteNote.textContent=t("invite_note_scoped",{server:p.server_id||"—",alliance:a.tag||"—"});
  const shareInvite=$("#shareInviteBtn");if(shareInvite)shareInvite.disabled=!canShareAllianceInvite;
  $("#rosterFresh").textContent=a.updated_at?updatedLabel(a.updated_at):t("sync_needed");renderMembers();renderDesertStormPlanner();
  renderVsLive();renderVsTimeline();

  const seasonLife=seasonLifecycle(s),seasonActive=seasonIsActive(s),pct=activeSeasonProgress(s),baseSeasonName=s.name||(s.number?`S${s.number}`:"—"),seasonHistorical=(seasonLife==="ended"||seasonLife==="interseason");
  $("#seasonMeta").textContent=seasonLife==="interseason"?t("season_interseason"):seasonLife==="ended"?t("season_ended_short"):baseSeasonName;
  const seasonDesc=$("#seasonDesc");if(seasonDesc)seasonDesc.textContent=seasonLife==="interseason"?`${t("season_ended_short")} · ${t("season_interseason")}`:seasonLife==="ended"?t("season_ended_short"):t("season_desc");
  $("#sName").textContent=seasonHistorical?`${baseSeasonName} · ${t("season_ended_short")}`:baseSeasonName;$("#sDay").textContent=seasonActive?(s.day||"—"):"—";$("#sProfession").textContent=s.profession||"—";
  const professionLabel=$("#seasonProfessionLabel"),seasonSectionTitle=$("#seasonSectionTitle");if(professionLabel)professionLabel.textContent=seasonHistorical?t("season_last_profession_short"):t("profession");if(seasonSectionTitle)seasonSectionTitle.textContent=seasonHistorical?t("season_state"):t("season_progress");
  const bar=$("#seasonProgressBar"),label=$("#seasonProgressLabel"),progressWrap=bar?.closest(".progress");if(progressWrap)progressWrap.classList.toggle("hidden",!seasonActive||pct===null);if(bar)bar.style.width=`${pct??0}%`;if(label)label.textContent=seasonLife==="interseason"?t("season_interseason"):seasonLife==="ended"?t("season_ended_short"):pct===null?t("season_unknown"):`${pct}%`;
  const lifeSelect=$("#seasonLifecycleSelect");if(lifeSelect)lifeSelect.value=seasonLife;
  const lifeStatus=seasonLife==="interseason"?t("season_interseason_note",{name:baseSeasonName,profession:s.profession||"—"}):seasonLife==="ended"?t("season_ended_note",{name:baseSeasonName,profession:s.profession||"—"}):seasonLife==="unknown"?t("season_unknown_note"):s.updated_at?`${t("last_update",{ago:fmtAgo(s.updated_at)})} · ${s.resistance??"—"}`:t("season_wait");$("#seasonStatus").textContent=lifeStatus;
  renderAdvice();renderAccountFields();renderProvider();
}
function squadHasSavedData(sq){return Boolean(sq?.updated_at||Number(sq?.power)>0||(sq?.heroes||[]).some(h=>h?.name||h?.level||h?.stars||h?.power||h?.exclusive||h?.gear))}
function formatGear(raw){return formatGearSummary(raw,{gearItems:t("gear_items"),level:t("level"),rarity:t("rarity"),rarityLabel:x=>{const k=`rarity_${x}`;return t(k)===k?x:t(k)}})}
function weaponStatsLine(w){if(!w)return "";const bits=[w.hero_hp_bonus!=null?`${t("exclusive_hp")} +${new Intl.NumberFormat(locale).format(Number(w.hero_hp_bonus))}`:null,w.hero_atk_bonus!=null?`${t("exclusive_atk")} +${new Intl.NumberFormat(locale).format(Number(w.hero_atk_bonus))}`:null,w.hero_def_bonus!=null?`${t("exclusive_def")} +${new Intl.NumberFormat(locale).format(Number(w.hero_def_bonus))}`:null,w.all_damage_resistance_pct!=null?`${t("exclusive_resistance")} ${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Number(w.all_damage_resistance_pct))}%`:null,w.max_skill_level!=null?`${t("exclusive_skill_cap")} ${new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(Number(w.max_skill_level))}`:null].filter(Boolean);return bits.join(" · ")}
function heroDetailLine(h,heroName){const bits=[h.level?`${t("level")}${h.level}`:`${t("level")}—`,h.stars?`${h.stars}★`:"★—"];const w=weaponForHero(heroName);if(w){const weaponTitle=w.weapon_name||t("exclusive_weapon");bits.push(`${weaponTitle}${w.level?` ${t("level")}${w.level}`:""}`);if(w.power)bits.push(`${t("exclusive_power")} ${fmtWeaponPower(w.power)}`)}else if(h.exclusive){bits.push(`${t("exclusive_short")} ${h.exclusive}`)}if(h.gear)bits.push(formatGear(h.gear));return {main:bits.join(" · "),stats:weaponStatsLine(w)}}
function performSquadSwap(fromId,toId){
  const from=Number(fromId),to=Number(toId),note=$("#playerSyncInfo");
  try{
    state=swapSquads(state,{fromSquadId:from,toSquadId:to,updatedAt:new Date().toISOString()}).state;
    saveState();
    if(note){note.className="notice";note.classList.remove("hidden");note.textContent=t("squad_swap_done",{from,to})}
    requestAnimationFrame(()=>{document.querySelector(`#squadList .squad[data-squad-id="${from}"]`)?.classList.add("open");document.querySelector(`#squadList .squad[data-squad-id="${to}"]`)?.classList.add("open")});
  }catch{if(note){note.className="notice warn";note.classList.remove("hidden");note.textContent=t("squad_swap_failed")}}
}
function renderSquads(){
  const box=$("#squadList");if(!box)return;box.innerHTML="";
  state.squads.forEach((sq,i)=>{
    const id=i+1,el=document.createElement("div");el.className="squad";el.dataset.squadId=String(id);
    const name=`${t("squad")} ${id}`,optional4=i===3&&!squadHasSavedData(sq),freshness=optional4?t("optional_squad4"):(sq.needs_rescan?t("sync_needed"):(sq.updated_at?updatedLabel(sq.updated_at):t("sync_needed")));
    const needsHeroConfirm=!optional4&&(sq.heroes||[]).some(h=>isGenericHeroName(h?.name))&&squadHasSavedData(sq);
    const swapTargets=squadHasSavedData(sq)?state.squads.map((target,ti)=>({id:ti+1,target})).filter(x=>x.id!==id&&squadHasSavedData(x.target)):[];
    const swapButton=swapTargets.length?`<button class="squadSwapBtn" type="button" data-squad-swap-toggle="${id}" aria-label="${esc(t("squad_swap_aria",{squad:id}))}" title="${esc(t("squad_swap"))}">⇄</button>`:"";
    const swapMenu=swapTargets.length?`<div class="squadSwapMenu hidden" data-squad-swap-menu="${id}"><span>${esc(t("squad_swap_with"))}</span>${swapTargets.map(x=>`<button type="button" class="squadSwapTarget" data-squad-swap-target="${x.id}">${esc(t("squad"))} ${x.id}</button>`).join("")}</div>`:"";
    el.innerHTML=`<div class="squadHeaderRow"><button class="squadHead"><span class="squadNo">${id}</span><span class="squadName"><b>${esc(name)}</b><small>${esc(freshness)}</small></span><span class="squadPower">${fmtPower(sq.power)}</span><span class="chev">⌄</span></button>${swapButton}</div>${swapMenu}<div class="squadBody">${(sq.heroes||[]).map((h,j)=>{const hn=isGenericHeroName(h.name)?`${t("hero")} ${j+1} · ${t("hero_unconfirmed")}`:h.name;const detail=heroDetailLine(h,hn);return `<div class="heroRow"${!isGenericHeroName(h.name)?` data-hero="${esc(canonicalStoredHeroName(h.name))}"`:""}><div class="heroAvatar">${j+1}</div><div class="heroInfo"><b>${esc(hn)}</b><small>${esc(detail.main)}</small>${detail.stats?`<span class="heroWeaponStats">${esc(detail.stats)}</span>`:""}</div><div class="heroPwr">${fmtPower(h.power)}</div></div>`}).join("")}${needsHeroConfirm?inlineHeroConfirmationHtml(sq,id):""}</div>`;
    el.querySelector(".squadHead")?.addEventListener("click",()=>el.classList.toggle("open"));
    el.querySelector(".squadSwapBtn")?.addEventListener("click",e=>{e.stopPropagation();const menu=el.querySelector(".squadSwapMenu"),willOpen=menu?.classList.contains("hidden");document.querySelectorAll("#squadList .squadSwapMenu").forEach(x=>x.classList.add("hidden"));if(willOpen)menu?.classList.remove("hidden")});
    el.querySelectorAll(".squadSwapTarget").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();performSquadSwap(id,Number(btn.dataset.squadSwapTarget))}));
    box.appendChild(el);
  });
}

function fmtWeaponPower(v){
  const n=Number(v);if(!Number.isFinite(n))return "—";
  if(n>=1_000_000)return new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n/1_000_000)+" M";
  return new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(n);
}
function normalizedName(v){return canonicalStoredHeroName(v).trim().toLowerCase().replace(/\s+/g," ")}
function weaponForHero(name){
  const n=normalizedName(name);if(!n)return null;
  return (state.exclusive_weapons||[]).find(w=>normalizedName(w.hero_name)===n)||null;
}
function renderExclusiveWeapons(){
  const box=$("#exclusiveWeaponList"),count=$("#exclusiveWeaponCount");if(!box)return;
  const list=(state.exclusive_weapons||[]).filter(w=>w&&(w.hero_name||w.weapon_name||w.level||w.power));
  if(count)count.textContent=String(list.length);
  if(!list.length){
    box.innerHTML=`<div class="exclusiveEmpty">${esc(t("exclusive_empty"))}</div>`;
    return;
  }
  box.innerHTML=list.map(w=>{
    const title=w.weapon_name||t("exclusive_weapon");
    const hero=canonicalStoredHeroName(w.hero_name)||t("hero");
    const level=w.level?`${t("level")}${esc(w.level)}`:t("level")+"—";
    const power=w.power?fmtWeaponPower(w.power):"—";
    const stats=[
      w.hero_hp_bonus!=null?`${t("exclusive_hp")} +${new Intl.NumberFormat(locale).format(Number(w.hero_hp_bonus))}`:null,
      w.hero_atk_bonus!=null?`${t("exclusive_atk")} +${new Intl.NumberFormat(locale).format(Number(w.hero_atk_bonus))}`:null,
      w.hero_def_bonus!=null?`${t("exclusive_def")} +${new Intl.NumberFormat(locale).format(Number(w.hero_def_bonus))}`:null,
      w.all_damage_resistance_pct!=null?`${t("exclusive_resistance")} ${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Number(w.all_damage_resistance_pct))}%`:null,
      w.max_skill_level!=null?`${t("exclusive_skill_cap")} ${new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(Number(w.max_skill_level))}`:null
    ].filter(Boolean);
    return `<div class="exclusiveCard"><div class="exclusiveIcon">⚔️</div><div class="exclusiveMain"><b>${esc(hero)} · ${esc(title)}</b><small>${esc(level)} · ${esc(t("exclusive_power"))} ${esc(power)}</small>${stats.length?`<span>${esc(stats.join(" · "))}</span>`:""}</div></div>`;
  }).join("");
}

function aiUiText(){const k=String(lang||"en").toLowerCase();if(k.startsWith("fr"))return {impact:"Impact",roi:"Efficacité ressources",sources:"Sources IA",meta:"Méta",why:"Pourquoi",details:"Voir les détails",evaluated:"options comparées",avoid:"À ne pas améliorer / acheter maintenant",heroes:"héros détectés",freshness:"Fraîcheur"};if(k.startsWith("es"))return {impact:"Impacto",roi:"Eficiencia de recursos",sources:"Fuentes IA",meta:"Meta",why:"Por qué",details:"Ver detalles",evaluated:"opciones comparadas",avoid:"No mejorar / comprar ahora",heroes:"héroes detectados"};if(k.startsWith("de"))return {impact:"Wirkung",roi:"Ressourceneffizienz",sources:"KI-Quellen",meta:"Meta",why:"Warum",details:"Details anzeigen",evaluated:"Optionen verglichen",avoid:"Jetzt nicht verbessern / kaufen",heroes:"erkannte Helden"};if(k.startsWith("ja"))return {impact:"効果",roi:"資源効率",sources:"AIソース",meta:"メタ",why:"理由",details:"詳細を見る",evaluated:"件を比較",avoid:"今は強化・購入しない",heroes:"検出英雄"};if(k.startsWith("zh"))return {impact:"影响",roi:"资源效率",sources:"AI来源",meta:"Meta",why:"原因",details:"查看详情",evaluated:"个方案已比较",avoid:"暂时不要升级/购买",heroes:"已识别英雄"};if(k.startsWith("ar"))return {impact:"الأثر",roi:"كفاءة الموارد",sources:"مصادر الذكاء",meta:"الميتا",why:"السبب",details:"عرض التفاصيل",evaluated:"خياراً تمت مقارنتها",avoid:"لا تطور / تشترِ الآن",heroes:"أبطال تم اكتشافهم"};return {impact:"Impact",roi:"Resource efficiency",sources:"AI sources",meta:"Meta",why:"Why",details:"View details",evaluated:"options compared",avoid:"Do not upgrade / buy now",heroes:"heroes detected",freshness:"Freshness"}}
function proHeroAttr(x){return canonicalStoredHeroName(x?.hero||x?.presentation?.hero||"")}
function proHeroVisual(hero,top=false){const hit=heroPresentation(hero);if(!hit)return "";return `<span class="priorityHeroSlot"><img class="wbHeroAvatar${top?" wbTopHero":""}" src="${esc(hit.src)}" alt="${esc(hit.name)} — WarBoost demo visual" loading="lazy"></span>`}
function proProgressLabel(x){return String(x?.progress_label||x?.presentation?.progress_label||((x?.current_label&&x?.next_target)?`${x.current_label} → ${x.next_target}`:"")||"").trim()}
function adaptiveCertaintyLabel(v){return t(v==="certain"?"certainty_certain":v==="probable"?"certainty_probable":"certainty_speculative")}
function adaptiveConditionLabel(v){return t(v==="now"?"condition_now":v==="hold_vs"?"condition_hold_vs":v==="payback"?"condition_payback":v==="refresh"?"condition_refresh":"condition_neutral")}
function adaptiveObjectiveLabel(v){return t(v==="pvp"?"objective_pvp":v==="pve"?"objective_pve":v==="vs"?"objective_vs":v==="season"?"objective_season":v==="balanced"?"objective_balanced":"objective_auto")}
function adaptiveServerLabel(v){return t(v==="new"?"server_profile_new":v==="mature"?"server_profile_mature":v==="competitive"?"server_profile_competitive":v==="mixed"?"server_profile_mixed":"server_profile_insufficient")}
function adaptiveSeasonPhaseLabel(v){const phase=String(v||"unknown");if(phase==="interseason")return t("season_interseason");if(phase==="ended")return t("season_ended_short");const key=`season_phase_${phase}`,label=t(key);return label===key?"—":label}
function adaptiveDateLabel(v){const d=new Date(v||"");if(Number.isNaN(d.getTime()))return "—";try{return new Intl.DateTimeFormat(localeFor(lang),{dateStyle:"short",timeStyle:"short"}).format(d)}catch{return d.toLocaleString()}}
function adaptiveContextSummary(ctx){if(!ctx)return "";const parts=[`${t("objective_label")}: ${adaptiveObjectiveLabel(ctx.objective)}`,`${t("server_profile_label")}: ${adaptiveServerLabel(ctx.server_profile)}`];if(ctx.account_age_days!=null)parts.push(`${t("account_age_days")}: ${ctx.account_age_days}`);if(ctx.season?.number)parts.push(`${t("season")} S${ctx.season.number}${ctx.season.phase&&ctx.season.phase!=="unknown"?` · ${adaptiveSeasonPhaseLabel(ctx.season.phase)}`:""}`);if(ctx.composition?.main_type){const typeKey=`unit_type_${String(ctx.composition.main_type).toLowerCase()}`,typeLabel=t(typeKey);parts.push(`${t("squad")}: ${typeLabel===typeKey?"—":typeLabel}`)}parts.push(`${t("data_completeness")}: ${ctx.confidence}%`);return `${t("pro_context_title")} · ${parts.join(" · ")}`}
const AI_NATIVE_LANGS=new Set(["fr","en-GB","en-US","es","de","ja","zh","ar"]);
function aiUsesNativeCopy(){return AI_NATIVE_LANGS.has(lang)}
function aiKindLabel(kind){const key=`ai_kind_${String(kind||"focus").toLowerCase()}`,v=t(key);return v===key?String(kind||t("plan7_focus")):v}
function aiTargetLabel(x){const hero=proHeroAttr(x);if(hero)return hero;const kind=String(x?.kind||"").toLowerCase();if(kind==="drone")return t("drone");if(kind==="technology")return aiKindLabel("technology");return ""}
function structuredPriorityTitle(x){const target=aiTargetLabel(x),kind=aiKindLabel(x?.kind);return target?`${kind} · ${target}`:kind}
function structuredPriorityAction(x){const target=aiTargetLabel(x)||aiKindLabel(x?.kind);return x?.kind==="scan"?t("plan7_scan"):`${t("plan7_focus")}: ${target}`}
function structuredShopItemLabel(x){if(["scan","official"].includes(String(x?.source||""))&&x?.item)return String(x.item);const f=String(x?.diagnostic_alignment?.resource_family||"");if(f==="hero_xp")return aiKindLabel("level");if(f==="hero_shards")return aiKindLabel("stars");if(f==="exclusive_weapon_shards")return aiKindLabel("exclusive");if(f==="awakening_shards")return aiKindLabel("awakening");if(f==="gear_materials")return aiKindLabel("gear");if(f==="drone_components")return aiKindLabel("drone");if(f==="technology_materials")return aiKindLabel("technology");return aiKindLabel("focus")}
function shopVerdictLabel(x){const k=String(x?.verdict_key||"");if(["buy","priority","strong_buy"].includes(k))return t("shop_buy");if(["skip","avoid","low"].includes(k))return t("shop_skip");return t("shop_consider")}
function planModeLabel(row){const mode=String(row?.mode||"focus"),action=String(row?.action_key||"");if(action==="secondary_priority")return t("plan7_secondary");if(mode==="checkpoint")return t("plan7_checkpoint");if(mode==="scan")return t("plan7_scan");if(mode==="hold")return t("plan7_hold");if(mode==="shop")return t("plan7_shop_resources");if(mode==="timing")return t("plan7_timing");if(mode==="review")return t("plan7_review");return t("plan7_focus")}
function planTargetLabel(row){if(["scan","hold","review"].includes(String(row?.mode||"")))return "";if(aiUsesNativeCopy())return String(row?.target||"").trim();const kind=String(row?.kind||"").toLowerCase(),raw=String(row?.target||"").trim();if(raw&&HERO_CATALOG.some(n=>n.toLowerCase()===canonicalStoredHeroName(raw).toLowerCase()))return canonicalStoredHeroName(raw);if(kind==="drone")return t("drone");if(kind==="technology")return aiKindLabel("technology");return aiKindLabel(kind||"focus")}
function renderPlayer7DayPlan(analysis){const box=$("#player7DayPlan");if(!box)return;const rows=analysis?.seven_day_plan?.days||[];if(!rows.length){box.innerHTML=`<div class="notice">${esc(t("player_sync_note"))}</div>`;return}const cards=rows.map(row=>{const target=planTargetLabel(row);return `<div class="plan7Row${Number(row.day)===1?" today":""}"><span class="plan7Day">${esc(`#${row.day}`)}</span><div class="plan7Main"><b>${esc(planModeLabel(row))}${target?` · ${esc(target)}`:""}</b></div></div>`}).join("");box.innerHTML=`${cards}<div class="plan7Policy">${esc(t("plan7_policy"))}</div>`}

function shopGroupLabel(type){
  if(type==="game_currency")return t("shop_group_game");
  if(type==="diamonds")return t("shop_group_diamonds");
  if(type==="real_money")return t("shop_group_paid");
  if(type==="historical_paid")return t("shop_group_paid_history");
  return t("shop_group_unknown");
}
function shopGroupRows(shop){
  const raw=Array.isArray(shop?.recommendations)?shop.recommendations:[],provided=shop?.recommendation_groups&&typeof shop.recommendation_groups==="object"?shop.recommendation_groups:null;
  const groups=provided||{game_currency:raw.filter(x=>x?.purchase_type==="game_currency"),diamonds:raw.filter(x=>x?.purchase_type==="diamonds"),real_money:raw.filter(x=>x?.purchase_type==="real_money"&&!x?.historical_reference_paid),historical_paid:raw.filter(x=>x?.purchase_type==="real_money"&&x?.historical_reference_paid),unknown:raw.filter(x=>!["game_currency","diamonds","real_money"].includes(String(x?.purchase_type||"")))};
  const limits={game_currency:3,diamonds:2,real_money:2,historical_paid:3,unknown:1};
  return ["game_currency","diamonds","real_money","historical_paid","unknown"].map(type=>({type,rows:(Array.isArray(groups[type])?groups[type]:[]).slice(0,limits[type])})).filter(g=>g.rows.length);
}
function renderShopRecommendationCard(x,groupRank,native,ui){
  const paymentType=String(x?.purchase_type||"unknown"),historicalPaid=Boolean(x?.historical_reference_paid),paymentLabel=native&&x?.purchase_type_label?String(x.purchase_type_label):shopGroupLabel(paymentType),paidGuard=x?.paid_guard?.real_money?String(x?.paid_guard?.label||t("shop_paid_guard")):"",displayRank=historicalPaid?"—":(groupRank||"•");
  return `<article class="shopCard ${esc(x.verdict_key||"")} ${paymentType==="real_money"?"shopPaidCard":""}${historicalPaid?" shopHistoricalPaidCard":""}"><div class="shopHead"><span class="shopRank">${esc(displayRank)}</span><div><div class="shopItemLine"><b>${esc(native?(x.item||""):structuredShopItemLabel(x))}</b><span class="shopPaymentBadge">${esc(paymentLabel)}</span></div><small>${native?`${esc(x.store||"")}${x.price_label?` · ${esc(x.price_label)}`:""}`:(["scan","official","reference"].includes(String(x.source||""))&&x.price_label?esc(x.price_label):"")}</small>${x.relevance_score!=null||x.score!=null?`<div class="shopMetrics"><span class="shopScore">${esc(t("shop_relevance"))} ${esc(String(Math.round(Number(x.relevance_score??x.score))))}/100</span>${x.evidence_confidence!=null?`<span class="shopEvidence">${esc(t("shop_data_confidence"))} ${esc(String(Math.round(Number(x.evidence_confidence))))}%</span>`:""}</div>`:""}</div><span class="shopVerdict">${esc(native?(x.verdict||""):shopVerdictLabel(x))}</span></div>${historicalPaid?`<div class="shopPaidGuard shopHistoryGuard">🕘 ${esc(t("shop_history_guard"))}</div>`:""}${paidGuard?`<div class="shopPaidGuard">🛡️ ${esc(paidGuard)}</div>`:""}<details class="decisionDetails"><summary><span class="detailsClosed">${esc(t("shop_details"))}</span><span class="detailsOpen">${esc(t("shop_hide_details"))}</span></summary><p>${esc(native?(x.reason||""):t("condition_neutral"))}</p><span class="shopAvailability">${esc(t("shop_availability"))}: ${esc(x.availability_status==="official_current"?t("shop_availability_official"):x.availability_status==="observed_scan"?t("shop_availability_observed"):t("shop_availability_unverified"))}</span>${native&&x.target?`<strong>${esc(x.target)}</strong>`:""}${paidGuard?`<small class="shopPaidGuardDetail">${esc(t("shop_paid_guard"))}</small>`:""}</details></article>`;
}

function renderProPriority(analysis){
  const native=aiUsesNativeCopy(),ui=aiUiText(),panel=$("#proPriorityPanel"),summary=$("#proPrioritySummary"),contextBox=$("#proAdaptiveContext"),list=$("#proPriorityList"),compare=$("#proSquadCompare"),exCompare=$("#proExclusiveCompare"),metaSources=$("#proMetaSources"),confidence=$("#proConfidence"),note=$("#playerSyncInfo"),shopList=$("#proShopList"),shopSummary=$("#proShopSummary"),shopConfidence=$("#shopConfidence"),shopCatalogPill=$("#shopCatalogPill"),avoid=$("#proAvoidList");
  if(!panel||!analysis)return;
  if(note)note.classList.add("hidden");panel.classList.remove("hidden");
  const top=Array.isArray(analysis.priorities)?analysis.priorities[0]:null;
  if(summary){
    if(native){const mi=analysis.meta_intelligence,composition=analysis.composition?.label?` · ${analysis.composition.label}`:"";summary.textContent=`${analysis.summary||""}${composition}${analysis.candidates_evaluated?` · ${t("options_compared_count",{count:analysis.candidates_evaluated})}`:""}${mi?.source_count?` · ${ui.sources} ${mi.source_count} · ${ui.meta} ${mi.confidence}% · ${t("meta_updated")} ${mi.knowledge_date||"—"}`:""}`}
    else{const target=top?structuredPriorityTitle(top):t("plan7_scan");summary.textContent=`${`${t("plan7_focus")}: ${target}`}${analysis.candidates_evaluated?` · ${t("options_compared_count",{count:analysis.candidates_evaluated})}`:""}`}
  }
  if(contextBox){const text=adaptiveContextSummary(analysis.adaptive_context);contextBox.textContent=text;contextBox.classList.toggle("hidden",!text)}
  if(confidence)confidence.textContent=`${t("diagnostic_confidence")} · ${analysis.confidence||0}%`;
  if(list){
    const items=(Array.isArray(analysis.priorities)?analysis.priorities:[]).slice(0,3);
    list.innerHTML=items.length?items.map((x,i)=>{const hero=proHeroAttr(x),heroVisual=proHeroVisual(hero,i===0),progress=native?proProgressLabel(x):"",marginal=Number(x.marginal_value_score),certainty=adaptiveCertaintyLabel(x.certainty),condition=adaptiveConditionLabel(x.condition_key),calculated=adaptiveDateLabel(x.calculated_at||analysis.generated_at),title=native?`${x.title||""}${x.target?` · ${x.target}`:""}`:structuredPriorityTitle(x),action=native?(x.action||""):structuredPriorityAction(x),reason=native?(x.reason||""):t("condition_neutral"),impact=native?(x.impact_label||"—"):(Number.isFinite(Number(x.impact_score))?`${Math.round(Number(x.impact_score))}/100`:"—"),roi=native?(x.resource_efficiency_label||x.roi_label||"—"):(Number.isFinite(Number(x.roi_score))?`${Math.round(Number(x.roi_score))}/100`:"—");return `<article class="priorityCard compactDecision${heroVisual?"":" noHeroDecision"}"${hero?` data-hero="${esc(hero)}"`:""}><span class="priorityRank">${esc(x.rank||"•")}</span>${heroVisual}<div class="priorityMain"><div class="decisionHead"><div class="decisionTitle"><b>${esc(title)}</b>${progress?`<span class="priorityProgress">${esc(progress)}</span>`:""}</div><span class="decisionMetric">${esc(native?ui.impact:"⚡")} : ${esc(impact)} · ${esc(t("resource_efficiency"))} : ${esc(roi)}</span></div>${Number.isFinite(marginal)?`<small>📈 ${esc(t("marginal_return"))} ${marginal}/100 · ${esc(t("certainty_label"))}: ${esc(certainty)}</small>`:""}<strong>${esc(action)}</strong><details class="decisionDetails"><summary>${esc(native?ui.why:"ℹ️")}</summary><p>${esc(reason)}</p>${native&&x.comparison_note?`<small>⚖️ ${esc(x.comparison_note)}</small>`:""}${progress?`<small>🎯 ${esc(progress)}</small>`:""}${x.progress_needed_levels>0?`<small>📈 ${esc(String(x.progress_needed_levels))} ${esc(t("levels_to_breakpoint"))}</small>`:""}${x.condition_key?`<small>🔀 ${esc(t("conditional_recommendation"))}: ${esc(condition)}</small>`:""}${native&&x.data_freshness?.label?`<small>🕒 ${esc(x.data_freshness.label)}</small>`:""}<small>📅 ${esc(t("recommendation_date"))}: ${esc(calculated)}</small>${native?`<small>🆓 ${esc(x.buy_free||"")}</small><small>💎 ${esc(x.buy_paid||"")}</small>`:`<small>🛡️ ${esc(t("condition_refresh"))}</small>`}</details></div></article>`}).join(""):`<div class="notice">${esc(native?(analysis.summary||t("player_sync_note")):t("player_sync_note"))}</div>`;
  }
  if(avoid){const rows=Array.isArray(analysis.avoid_now)?analysis.avoid_now:[];avoid.innerHTML=native&&rows.length?`<div class="avoidTitle">⛔ ${esc(ui.avoid)}</div>${rows.map(x=>`<div class="avoidRow">${esc(x)}</div>`).join("")}`:`<div class="avoidTitle">⛔ ${esc(t("plan7_hold"))}</div>`}
  if(exCompare){const ex=analysis.exclusive_comparison||{},rows=Array.isArray(ex.heroes)?ex.heroes:[];exCompare.innerHTML=rows.length?`${rows.map(x=>{const rank=x.exclusive_rank?`#${x.exclusive_rank}`:"—",progress=x.current_label?`${x.current_label}${x.next_target?` → ${x.next_target}`:""}`:t("ex_missing"),levels=x.progress_needed_levels>0?` · ${x.progress_needed_levels} ${t("levels_to_breakpoint")}`:"",score=x.marginal_value_score!=null?`${Math.round(Number(x.marginal_value_score))}/100`:"—",meta=Number(x.meta_adjustment||0);return `<div class="exCompareRow"><span class="compareNo">${esc(rank)}</span><div><b>${esc(x.hero||t("hero"))}</b><small>${esc(progress)}${esc(levels)} · ${esc(x.status_label||t("ex_not_ranked"))}${meta?` · ${esc(t("meta_adjustment"))} ${meta>0?"+":""}${meta}`:""}</small>${x.tie_with_previous?`<small>⚖️ ${esc(t("ex_tie_previous",{hero:x.tie_with_hero||"#"}))}</small>`:""}</div><strong>${esc(score)}</strong></div>`}).join("")}<div class="comparisonPolicy">${esc(t("ex_exact_cost_unknown"))}</div>`:`<div class="notice">${esc(t("ex_compare_unavailable"))}</div>`}
  if(metaSources){const mi=analysis.meta_intelligence||{},rows=Array.isArray(mi.evidence)?mi.evidence:[];const kindLabel=x=>t(x?.kind==="official"&&x?.verified===true?"meta_source_official":x?.kind==="guide"?"meta_source_guide":"meta_source_community");metaSources.innerHTML=`<div class="metaHeader"><b>${esc(t("meta_updated"))}: ${esc(mi.knowledge_date||"—")}</b><small>${esc(t("meta_source_count"))}: ${esc(mi.source_count??rows.length)} · ${esc(t("context_confidence"))}: ${esc(mi.confidence??0)}%</small><small>${esc(t("meta_secondary_policy"))}</small></div>${rows.map(x=>{const label=kindLabel(x),title=esc(x.title||x.topic||t("meta_source_community")),meta=`${esc(x.date||"—")} · ${esc(x.publisher||x.topic||"")}${x.observed_at?` · ✓ ${esc(x.observed_at)}`:""}`,body=`<span>${esc(label)}</span><div><b>${title}${x.url?" ↗":""}</b><small>${meta}</small></div>`;return x.url?`<a class="metaSourceRow" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${body}</a>`:`<div class="metaSourceRow">${body}</div>`}).join("")}` }
  if(compare){const rows=Array.isArray(analysis.squads)?analysis.squads:[];compare.innerHTML=rows.map(x=>`<div class="compareRow"><span class="compareNo">${esc(x.id)}</span><div><b>${esc(native?(x.name||`${t("squad")} ${x.id}`):`${t("squad")} ${x.id}`)}</b><small>${native&&x.status?`${esc(x.status)} · `:""}${native?`${esc(t("pro_data_quality"))} `:"📊 "}${esc(x.data_quality??0)}% · ${esc(x.heroes_detected??0)}/5</small></div><strong>${esc(x.power_label||"—")}</strong></div>`).join("")}
  const shop=analysis.shop||{};
  if(shopSummary)shopSummary.textContent=native?(shop.summary||t("shop_summary_default")):t("shop_summary_default");
  if(shopConfidence)shopConfidence.textContent=`${t("shop_data_confidence")} ${Math.round(Number(shop.data_confidence??shop.confidence??0))}%`;
  if(shopCatalogPill){shopCatalogPill.textContent=native?(shop.catalog_label||"—"):t("adaptive");shopCatalogPill.className=`pill ${shop.catalog_status==="official"?"catalogOfficialPill":"catalogPartialPill"}`}
  if(shopList){const groups=shopGroupRows(shop);shopList.innerHTML=groups.length?groups.map(g=>`<section class="shopGroup" data-shop-group="${esc(g.type)}"><div class="shopGroupTitle"><span>${esc(shopGroupLabel(g.type))}</span><small>${esc(String(g.rows.length))}</small></div>${g.rows.map((x,i)=>renderShopRecommendationCard(x,i+1,native,ui)).join("")}</section>`).join(""):`<div class="notice">${esc(t("shop_no_recommendations"))}</div>`}
  renderPlayer7DayPlan(analysis);
}

function activityLabel(a){
  return a.key==="active"?t("activity_active_confirmed"):a.key==="inactive"?t("activity_inactive_probable"):a.key==="unknown"?t("activity_indeterminate"):t("activity_refresh");
}
function activityIcon(a){return a.key==="active"?"🟢":a.key==="inactive"?"🔴":a.key==="unknown"?"⚪":"🟠"}
function activityReason(a){
  if(a.reason==="recent_event_confirmation")return t("activity_reason_event");
  if(a.reason==="recent_activity")return t("activity_reason_recent");
  if(a.reason==="recent_progress")return t("activity_reason_progress");
  if(a.reason==="stale_snapshot")return t("activity_reason_stale");
  if(a.reason==="fresh_negative_evidence")return t("activity_reason_negative");
  return t("activity_reason_insufficient");
}
function lastWarDateKey(){const d=serverNow instanceof Date&&!Number.isNaN(serverNow.getTime())?serverNow:new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function activityEventLabel(type){const key=`event_${type}`;const label=t(key);return label===key?String(type||""):label}
function participationStatusLabel(status){const key=`participation_${status}`;const label=t(key);return label===key?String(status||""):label}
function participationSourceLabel(source){const key=`participation_source_${source}`;const label=t(key);return label===key?String(source||""):label}
function participationStatusIcon(status){return status==="participated"?"✅":status==="absent_confirmed"?"❌":status==="not_selected"?"🔵":status==="excused"?"🟠":"❓"}
function renderPlayerActivity(){
  const grid=$("#activityEventGrid"),status=$("#playerActivityStatus"),pill=$("#playerActivityPill");if(!grid)return;
  if(!betaPrivateDataVisible()){grid.innerHTML="";if(status)status.textContent=t("beta_signin_required");if(pill)pill.textContent="—";return}
  const today=lastWarDateKey(),events=mergeActivityEvents(state.activity_events),confirmedToday=new Set(events.filter(x=>x.event_date===today&&x.confirmed===true).map(x=>x.event_type));
  grid.innerHTML=PLAYER_ACTIVITY_EVENT_TYPES.map(type=>{const active=confirmedToday.has(type);return `<button type="button" class="activityEventBtn${active?" confirmed":""}" data-activity-event="${esc(type)}"><span>${active?"✅":"○"}</span><b>${esc(activityEventLabel(type))}</b><small>${esc(t(active?"activity_remove":"activity_confirm"))}</small></button>`}).join("");
  grid.querySelectorAll("[data-activity-event]").forEach(btn=>btn.addEventListener("click",()=>togglePlayerActivityEvent(btn.dataset.activityEvent)));
  const recent=confirmedActivityEvents(events,{nowMs:serverNow.getTime(),days:7});if(pill)pill.textContent=recent.length?`${recent.length} · 7j`:"—";if(status)status.textContent=recent.length?t("activity_recent_summary",{count:recent.length}):t("activity_no_confirmations");
}
function togglePlayerActivityEvent(type){
  if(!betaPrivateDataVisible()||!PLAYER_ACTIVITY_EVENT_TYPES.includes(type))return;const date=lastWarDateKey(),id=activityEventId(type,date),events=mergeActivityEvents(state.activity_events),current=events.find(x=>x.id===id),now=new Date().toISOString(),confirmed=current?.confirmed===true,event={event_type:type,event_date:date,participation_status:!confirmed?"participated":"removed",confirmed:!confirmed,confirmed_at:!confirmed?now:null,updated_at:now,source:"player_self_report"};
  state.activity_events=mergeActivityEvents(events,[event]);
  reconcileCurrentPlayerAllianceIdentity({touch:true});saveState();render();
}
function participationDateLabel(v){
  if(!v)return "—";const d=new Date(`${v}T12:00:00`);if(Number.isNaN(d.getTime()))return String(v);
  try{return new Intl.DateTimeFormat(locale,{year:"numeric",month:"2-digit",day:"2-digit"}).format(d)}catch{return String(v)}
}
function participationEvidenceLabel(key){
  const map={multiple_confirmed:"participation_evidence_multiple",confirmed:"participation_evidence_confirmed",known_no_conclusion:"participation_evidence_no_conclusion",insufficient:"participation_evidence_insufficient"};
  return t(map[key]||"participation_evidence_insufficient");
}
function participationCountsLine(counts={}){
  return `✅ ${Number(counts.participated||0)} · ❌ ${Number(counts.absent_confirmed||0)} · 🔵 ${Number(counts.not_selected||0)} · 🟠 ${Number(counts.excused||0)}`;
}
function membershipHistoryLabel(row={}){
  const key={joined:"roster_history_joined",returned:"roster_history_returned",role_changed:"roster_history_role_changed",review_required:"roster_history_review_required",verified_present:"roster_history_verified_present",left_confirmed:"roster_history_left"}[row.type];
  if(!key)return "";const base=t(key,{from:row.from_role||"",to:row.to_role||""}),date=participationDateLabel(row.at);return `${date} · ${base}`;
}
function membershipHistoryLine(member={},limit=3){
  const rows=(Array.isArray(member?.membership_history)?member.membership_history:[]).slice(-limit).reverse().map(membershipHistoryLabel).filter(Boolean);return rows.join(" · ");
}
function renderAllianceParticipationTable(members){
  const box=$("#allianceParticipationTable");if(!box)return;
  const rows=(Array.isArray(members)?members:[]).map(member=>playerParticipationInsight(member,{nowMs:serverNow.getTime(),days:30})).filter(x=>x.records.length>0);
  if(!rows.length){box.innerHTML=`<div class="notice">${esc(t("participation_no_known"))}</div>`;return}
  rows.sort((a,b)=>(Date.parse(`${b.latest_known_date||"1970-01-01"}T12:00:00Z`)||0)-(Date.parse(`${a.latest_known_date||"1970-01-01"}T12:00:00Z`)||0)||String(a.member?.name||"").localeCompare(String(b.member?.name||"")));
  box.innerHTML=rows.slice(0,100).map(insight=>{
    const member=insight.member||{},linked=member.warboost_linked===true,summary=insight.total||{};
    const eventRows=insight.by_type.map(x=>`<div class="participationEventDetail"><div><b>${esc(activityEventLabel(x.event_type))}</b><small>${esc(t("participation_last_known"))}: ${esc(participationDateLabel(x.last_date))} · ${esc(participationSourceLabel(x.last_source))}</small></div><span>${esc(participationCountsLine(x.counts))}</span></div>`).join("");
    const history=insight.records.slice(0,12).map(e=>`<div class="participationHistoryRow"><time>${esc(participationDateLabel(e.event_date))}</time><b>${esc(activityEventLabel(e.event_type))}</b><span>${participationStatusIcon(e.participation_status)} ${esc(participationStatusLabel(e.participation_status))}</span><small>${esc(participationSourceLabel(e.source))}</small></div>`).join("");
    const lastParticipation=insight.latest_participation_date?`${t("participation_last_participation")}: ${participationDateLabel(insight.latest_participation_date)}`:t("participation_no_confirmed_participation");
    return `<details class="participationPlayerCard"><summary><div><b>${esc(member.name||t("player"))}</b><small>${esc(participationCountsLine(summary))}</small></div><span class="participationEvidenceBadge">${esc(participationEvidenceLabel(insight.evidence_key))}</span></summary><div class="participationPlayerMeta"><span>${linked?"🟢":"⚪"} ${esc(t(linked?"identity_linked_short":"identity_unlinked_short"))}</span><span>${esc(lastParticipation)}</span><span>${esc(t("participation_known_records",{count:insight.records.length}))}</span></div><div class="participationEventDetails">${eventRows}</div><div class="participationHistoryTitle">${esc(t("participation_recent_history"))}</div><div class="participationHistory">${history}</div><p class="activityNote">${esc(t("participation_evidence_guard"))}</p></details>`;
  }).join("");
}
function renderAllianceIdentityLinks(members){
  const box=$("#allianceIdentitySummary"),pendingBox=$("#unlinkedWarBoostAccounts"),pendingDetails=$("#unlinkedWarBoostDetails");
  const summary=rosterLinkSummary(members),reviewNames=new Set((state.alliance?.roster_review||[]).map(x=>rosterNameKey(x?.name))),formerNames=new Set((state.alliance?.former_members||[]).map(x=>rosterNameKey(x?.name)));
  const rawPending=Array.isArray(state.alliance?.unlinked_accounts)?state.alliance.unlinked_accounts:[],pending=rawPending.filter(x=>!reviewNames.has(rosterNameKey(x?.name))&&!formerNames.has(rosterNameKey(x?.name)));
  const pendingStatuses=new Set(['no_match','ambiguous','missing_nickname','missing_server','missing_alliance','context_conflict','ambiguous_rename']);
  const currentStatus=String(state.alliance?.identity_link_status||"unknown"),currentLinked=(members||[]).some(m=>m?.warboost_linked===true&&String(m?.player_id||"")===String(state.player_id||""));
  if(!currentLinked&&pendingStatuses.has(currentStatus)&&state.player?.name){const currentKey=rosterNameKey(state.player.name);if(currentKey&&!pending.some(x=>rosterNameKey(x?.name)===currentKey))pending.push({name:state.player.name,server_id:state.player?.server_id||state.alliance?.server_id||"",alliance_tag:state.alliance?.tag||"",reason:currentStatus,updated_at:state.updated_at||null,current_account:true})}
  if(box){
    const currentText=currentLinked?t("identity_current_linked"):(pendingStatuses.has(currentStatus)?t("identity_current_pending"):"");
    box.textContent=[t("identity_roster_summary",{linked:summary.linked,unlinked:summary.unlinked}),pending.length?t("identity_pending_cloud",{count:pending.length}):null,currentText].filter(Boolean).join(" · ");
  }
  if(pendingDetails){pendingDetails.classList.toggle("hidden",!pending.length);pendingDetails.open=pending.length>0}
  if(pendingBox){
    pendingBox.innerHTML=pending.length?pending.map((x,i)=>`<div class="unlinkedAccountRow"><div><b>⚪ ${esc(x.name||t("player"))}</b><small>${esc(t("server"))} ${esc(x.server_id||"—")} · ${esc(t("alliance"))} ${esc(x.alliance_tag||state.alliance?.tag||"—")}</small><small>${esc(t("identity_exact_match_guard"))}</small></div><button class="smallBtn" type="button" data-identity-retry="${i}">${esc(t("identity_retry_match"))}</button></div>`).join(""):"";
    pendingBox.querySelectorAll("[data-identity-retry]").forEach(btn=>btn.addEventListener("click",async()=>{btn.disabled=true;const old=btn.textContent;btn.textContent=t("identity_retrying");try{await syncAll()}finally{btn.disabled=false;btn.textContent=old}}));
  }
}

function renderAllianceActivity(){
  const members=state.alliance.members||[],box=$("#activitySummary"),summary=summarizeAllianceActivity(members),c=summary.counts;
  const inactivityPending=(Number(c.inactive)||0)===0&&(Number(c.refresh)||0)>0;
  const inactiveValue=inactivityPending?"—":String(c.inactive??0),inactiveLabel=inactivityPending?t("activity_inactivity_not_evaluated"):t("activity_inactive_probable"),inactiveIcon=inactivityPending?"⚪":"🔴";
  if(box)box.innerHTML=`<div><b>🟢 ${c.active}</b><small>${esc(t("activity_active_confirmed"))}</small></div><div><b>🟠 ${c.refresh}</b><small>${esc(t("activity_refresh"))}</small></div><div><b>${inactiveIcon} ${esc(inactiveValue)}</b><small>${esc(inactiveLabel)}</small></div>`;
  const note=$("#activityNote");if(note)note.textContent=members.length?t("activity_reliability_note"):t("activity_no_data");
  renderAllianceIdentityLinks(members);
  const overview=allianceParticipationOverview(members,{nowMs:serverNow.getTime(),days:30});
  const managementBox=$("#allianceParticipationManagementSummary");if(managementBox){
    const linkedText=t("participation_management_linked",{linked:overview.linked,total:overview.total_members});
    const evidenceText=t("participation_management_evidence",{known:overview.known_members,total:overview.total_members});
    const missingText=!overview.linked?t("participation_management_no_linked"):overview.linked_without_evidence?t("participation_management_missing",{count:overview.linked_without_evidence}):t("participation_management_all_linked_known");
    const absenceText=t("participation_management_absences",{count:overview.confirmed_absences});
    managementBox.innerHTML=`<div class="managementSummaryHead"><b>🧠 ${esc(t("participation_management_title"))}</b><span class="pill">30 j</span></div><div class="managementSummaryGrid"><span>${esc(linkedText)}</span><span>${esc(evidenceText)}</span><span>${esc(absenceText)}</span><span>${esc(missingText)}</span></div><p>${esc(t("participation_management_guard"))}</p>`;
  }
  const eventBox=$("#allianceEventSummary");if(eventBox){
    const eventRollup=allianceParticipationByEvent(members,{nowMs:serverNow.getTime(),days:30});
    eventBox.innerHTML=PLAYER_ACTIVITY_EVENT_TYPES.map(type=>{const x=eventRollup.by_event[type];return `<span class="eventCountChip eventStatusChip"><b>${esc(activityEventLabel(type))}</b><small>✅ ${x.participated} · ❌ ${x.absent_confirmed} · 🔵 ${x.not_selected} · 🟠 ${x.excused} · ❓ ${x.unknown_members}</small></span>`}).join("")+`<p class="activityNote">${esc(t("participation_unknown_members_guard"))}</p>`
  }
  renderAllianceParticipationTable(members);
  return summary;
}
function rankManagerCountsLine(counts={}){return ["R1","R2","R3","R4"].map(r=>`${r} ${Number(counts?.[r]||0)}`).join(" · ")}
function rankManagerMemberByKey(key){return (state.alliance?.members||[]).find(m=>rankManagementKey(m)===key)||null}
function rankManagerStatus(messageKey="",vars={},warn=false){const box=$("#rankManagerStatus");if(!box)return;box.className=`notice${warn?" warn":""}`;box.classList.toggle("hidden",!messageKey);box.textContent=messageKey?t(messageKey,vars):""}
function renderAllianceRankManager(){
  const section=$("#rankManagerSection"),list=$("#rankManagerList"),previewBox=$("#rankManagerPreview"),applyBtn=$("#rankManagerApplyBtn"),clearBtn=$("#rankManagerClearBtn"),search=$("#rankManagerSearch");if(!section||!list)return;
  const manager=hasDeclaredAllianceCommandRole(),members=(state.alliance?.members||[]).filter(m=>normalizeAllianceRole(m.role)!=="R5"),q=rosterNameKey(rankManagerSearchTerm);
  section.classList.toggle("managerLocked",!manager);if(search&&search.value!==rankManagerSearchTerm)search.value=rankManagerSearchTerm;
  const rows=members.filter(m=>!q||rosterNameKey(m.name).includes(q)).sort((a,b)=>({R4:4,R3:3,R2:2,R1:1}[normalizeAllianceRole(b.role)]||0)-({R4:4,R3:3,R2:2,R1:1}[normalizeAllianceRole(a.role)]||0)||(Number(b.power_m)||0)-(Number(a.power_m)||0)||String(a.name||"").localeCompare(String(b.name||"")));
  list.innerHTML=rows.length?rows.map(m=>{const key=rankManagementKey(m),from=normalizeAllianceRole(m.role),to=rankChangeDraft.get(key)||from,changed=to!==from,isSelf=Boolean(m.player_id)&&String(m.player_id)===String(state.player_id||"");return `<div class="rankManagerRow${changed?" changed":""}${isSelf?" self":""}"><div><b>${esc(m.name||t("player"))}</b><small>${from} · ${t("hq")} ${esc(m.hq_level??"—")} · ${esc(fmtPower(m.power_m))}${m.warboost_linked===true?` · 🟢 WarBoost`:""}${isSelf?` · ${esc(t("rank_manager_self_guard"))}`:""}</small></div><div class="rankMove"><span>${from}</span><span aria-hidden="true">→</span><select data-rank-change-key="${esc(key)}" data-rank-current="${from}"${manager&&!isSelf?"":" disabled"}>${["R1","R2","R3","R4"].map(r=>`<option value="${r}"${to===r?" selected":""}>${r}</option>`).join("")}</select></div></div>`}).join(""):`<div class="notice">${esc(t("rank_manager_no_match"))}</div>`;
  list.querySelectorAll("select[data-rank-change-key]").forEach(sel=>sel.addEventListener("change",()=>{const key=sel.dataset.rankChangeKey,from=sel.dataset.rankCurrent,to=sel.value;if(to===from)rankChangeDraft.delete(key);else rankChangeDraft.set(key,to);renderAllianceRankManager()}));
  const changes=[...rankChangeDraft.entries()].map(([key,to_role])=>({key,to_role})),preview=previewAllianceRankChanges(state.alliance?.members||[],changes,{maxR4:10});
  if(previewBox){const changed=preview.changes||[],err=preview.errors?.[0];previewBox.innerHTML=changed.length?`<div class="rankPreviewCounts"><span>${esc(t("rank_manager_before"))}: ${esc(rankManagerCountsLine(preview.before))}</span><span>${esc(t("rank_manager_after"))}: ${esc(rankManagerCountsLine(preview.after))}</span></div><div class="rankPreviewChanges">${changed.map(x=>`<span><b>${esc(x.name)}</b> ${x.from_role} → ${x.to_role}</span>`).join("")}</div>${err?`<div class="notice warn">${esc(err.code==="r4_limit"?t("rank_manager_r4_limit",{limit:err.limit}):t("rank_manager_invalid"))}</div>`:""}`:`<div class="privacyText">${esc(t("rank_manager_empty"))}</div>`}
  if(applyBtn){applyBtn.disabled=!manager||!preview.changes.length||!preview.ok;applyBtn.textContent=t("rank_manager_apply")}
  if(clearBtn)clearBtn.disabled=!rankChangeDraft.size;
}
async function updateRankPermissionTransition(change,targetManagementRole){const r=await fetch("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({player_id:change.player_id,role:targetManagementRole})}),j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.error||"role_update_failed"),{code:j.error||"role_update_failed"});return j}
async function applyRankManagerChanges(){
  if(!hasDeclaredAllianceCommandRole())return rankManagerStatus("rank_manager_manager_only",{},true);
  const changes=[...rankChangeDraft.entries()].map(([key,to_role])=>({key,to_role})),preview=previewAllianceRankChanges(state.alliance?.members||[],changes,{maxR4:10});
  if(!preview.changes.length)return rankManagerStatus("rank_manager_empty",{},true);if(!preview.ok){const e=preview.errors?.[0];return rankManagerStatus(e?.code==="r4_limit"?"rank_manager_r4_limit":"rank_manager_invalid",{limit:e?.limit||10},true)}
  if(!window.confirm(t("rank_manager_confirm",{count:preview.changes.length})))return;
  const permission=permissionTransitions(preview),completed=[];rankManagerStatus("rank_manager_saving",{},false);const applyBtn=$("#rankManagerApplyBtn");if(applyBtn)applyBtn.disabled=true;
  try{
    for(const transition of permission){const targetRole=transition.to_role==="R4"?"R4":"R1";await updateRankPermissionTransition(transition,targetRole);completed.push(transition)}
  }catch(error){
    // Best-effort rollback keeps WarBoost command permissions aligned if one update fails mid-batch.
    for(const transition of completed.reverse()){try{await updateRankPermissionTransition(transition,transition.management_role==="R4"?"R4":"R1")}catch{}}
    rankManagerStatus("rank_manager_permission_failed",{},true);if(applyBtn)applyBtn.disabled=false;return;
  }
  const now=new Date().toISOString(),result=applyAllianceRankChanges(state.alliance?.members||[],changes,{now,maxR4:10});if(!result.changed){rankManagerStatus("rank_manager_invalid",{},true);if(applyBtn)applyBtn.disabled=false;return}
  const permissionMap=new Map(permission.map(x=>[x.key,x.to_role==="R4"?"R4":"R1"]));
  state.alliance.members=result.members.map(m=>{const key=rankManagementKey(m),management=permissionMap.get(key);return management?{...m,management_role:management,updated_at:now}:m});
  for(const change of result.preview.changes){const member=rankManagerMemberByKey(change.key);if(String(member?.player_id||"")===String(state.player_id||"")){state.player.role=change.to_role;state.player.updated_at=now;const mgmt=permissionMap.get(change.key);if(mgmt){state.alliance.role=mgmt;state.alliance.management_verified=mgmt==="R4"}}}
  state.alliance.updated_at=now;rankChangeDraft.clear();saveState();if(cloudSession?.access_token)syncAll().catch(()=>{});requestAnimationFrame(()=>rankManagerStatus("rank_manager_saved",{count:result.preview.changes.length},false));
}
function renderMemberRow(m){
  const a=classifyAllianceMember(m),icon=activityIcon(a),label=activityLabel(a),reason=activityReason(a),delta=Number(m?.delta_m),canManage=isAllianceManager()&&normalizedRole(state?.alliance?.role)==="R5"&&Boolean(m?.player_id),role=normalizeAllianceRole(m.role),managementRole=normalizeAllianceRole(m.management_role||"R1");
  const deltaText=Number.isFinite(delta)&&delta!==0?`${delta>0?"+":""}${delta} M`:"";let roleControl="";
  if(managementRole==="R5")roleControl=`<span class="managementOwnerBadge">${esc(t("management_owner"))}</span>`;
  else if(canManage)roleControl=`<label class="managementRoleControl"><small>${esc(t("management_permission"))}</small><select data-member-management-id="${esc(m.player_id)}"><option value="R1"${managementRole==="R1"?" selected":""}>${esc(t("management_member"))}</option><option value="R4"${managementRole==="R4"?" selected":""}>R4</option></select></label>`;
  const ps=participationSummaryByType(m.activity_events,{nowMs:serverNow.getTime(),days:30}).total,participationLine=ps.total_known?`30j · ✅ ${ps.participated} · ❌ ${ps.absent_confirmed} · 🔵 ${ps.not_selected} · 🟠 ${ps.excused}`:`30j · ${t("participation_no_known_short")}`;
  const linked=m?.warboost_linked===true,linkLine=`${linked?"🟢":"⚪"} ${t(linked?"identity_linked_short":"identity_unlinked_short")}`,historyLine=membershipHistoryLine(m,2),lifecycleKey=rosterLifecycleKey(m);
  const removeControl=hasDeclaredAllianceCommandRole()&&lifecycleKey?`<button class="smallBtn dangerBtn rosterQuickAction" type="button" data-roster-active-remove="${esc(lifecycleKey)}" data-roster-name="${esc(m.name||t("player"))}">${esc(t("roster_remove"))}</button>`:"";
  return `<div class="member compactMember"><div><b>${icon} ${esc(m.name||t("player"))}</b><small>${t("hq")} ${m.hq_level??"—"} · ${fmtPower(m.power_m)} · ${role}</small><span class="identityLinkBadge">${esc(linkLine)}</span><span class="activityLine">${esc(label)} · ${esc(reason)}</span><span class="activityLine participationLine">${esc(participationLine)}</span>${historyLine?`<span class="membershipHistoryLine">${esc(historyLine)}</span>`:""}</div><div class="memberRight">${deltaText?`<div class="delta">${esc(deltaText)}</div>`:""}${roleControl}${removeControl}</div></div>`;
}
function renderMembers(){
  renderAllianceRankManager();
  const box=$("#memberList"),members=state.alliance.members||[],review=state.alliance.roster_review||[],former=state.alliance.former_members||[];if(!box)return;
  const summary=renderAllianceActivity(),roles=["R5","R4","R3","R2","R1"];
  if(!members.length&&!review.length&&!former.length){box.innerHTML=`<div class="notice">${t("no_members")}</div>`;return}
  const chips=roles.map(role=>`<span class="roleCountChip"><b>${role}</b><small>${summary.roleCounts[role]||0}</small></span>`).join("");
  const groups=roles.map(role=>{
    const rows=members.filter(m=>normalizeAllianceRole(m.role)===role).sort((a,b)=>(Number(b.power_m)||0)-(Number(a.power_m)||0));
    const open=openRosterRoles.has(role)?" open":"";
    const body=rows.length?rows.map(renderMemberRow).join(""):`<div class="emptyRole">${esc(t("role_empty"))}</div>`;
    return `<details class="roleRosterGroup" data-roster-role="${role}"${open}><summary><span class="roleRosterTitle"><b>${role}</b><small>${rows.length} ${esc(t("members_short"))}</small></span><span class="roleRosterChevron" aria-hidden="true">⌄</span></summary><div class="roleRosterBody">${body}</div></details>`;
  }).join("");
  const reviewHtml=review.length?`<details class="roleRosterGroup rosterReviewGroup" open><summary><span class="roleRosterTitle"><b>⚠️ ${esc(t("roster_review_title"))}</b><small>${review.length}</small></span><span class="roleRosterChevron" aria-hidden="true">⌄</span></summary><div class="roleRosterBody">${review.map(m=>{const key=rosterLifecycleKey(m),history=membershipHistoryLine(m,2);return `<div class="member compactMember rosterLifecycleRow"><div><b>${esc(m.name||t("player"))}</b><small>${esc(t("roster_review_reason"))} · ${esc(normalizeAllianceRole(m.role))}</small>${history?`<span class="membershipHistoryLine">${esc(history)}</span>`:""}</div><div class="rosterLifecycleActions"><button class="smallBtn" type="button" data-roster-review-action="keep" data-roster-key="${esc(key)}">${esc(t("roster_review_keep"))}</button><button class="smallBtn dangerBtn" type="button" data-roster-review-action="leave" data-roster-key="${esc(key)}">${esc(t("roster_review_departed"))}</button></div></div>`}).join("")}</div></details>`:"";
  const formerHtml=former.length?`<details class="roleRosterGroup formerRosterGroup"><summary><span class="roleRosterTitle"><b>🗂️ ${esc(t("former_members_title"))}</b><small>${former.length}</small></span><span class="roleRosterChevron" aria-hidden="true">⌄</span></summary><div class="roleRosterBody">${former.slice().sort((a,b)=>String(b.left_at||"").localeCompare(String(a.left_at||""))).map(m=>{const history=membershipHistoryLine(m,4),key=rosterLifecycleKey(m);return `<div class="member compactMember rosterLifecycleRow"><div><b>${esc(m.name||t("player"))}</b><small>${esc(t("roster_status_former"))}${m.left_at?` · ${esc(participationDateLabel(m.left_at))}`:""} · ${esc(normalizeAllianceRole(m.role))}</small>${history?`<span class="membershipHistoryLine">${esc(history)}</span>`:""}</div>${hasDeclaredAllianceCommandRole()?`<div class="rosterLifecycleActions"><button class="smallBtn" type="button" data-roster-former-reinstate="${esc(key)}" data-roster-name="${esc(m.name||t("player"))}">${esc(t("roster_reintegrate"))}</button></div>`:""}</div>`}).join("")}</div></details>`:"";
  box.innerHTML=`<div class="rosterOverview"><div><b>${esc(t("roster_by_role"))}</b><small>${esc(t("roster_hint"))}</small></div><div class="roleCountRow">${chips}</div></div>${review.length?`<div class="notice warn rosterReviewNotice">${esc(t("roster_review_guard",{count:review.length}))}</div>`:""}<div class="roleRosterList">${groups}${reviewHtml}${formerHtml}</div>`;
  box.querySelectorAll("details[data-roster-role]").forEach(d=>d.addEventListener("toggle",()=>{const role=d.dataset.rosterRole;if(d.open)openRosterRoles.add(role);else openRosterRoles.delete(role)}));
  box.querySelectorAll("select[data-member-management-id]").forEach(sel=>sel.addEventListener("change",async()=>{const playerId=sel.dataset.memberManagementId,nextRole=sel.value,row=(state.alliance.members||[]).find(m=>String(m.player_id)===String(playerId)),previous=row?.management_role||"R1";sel.disabled=true;try{const r=await fetch("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({player_id:playerId,role:nextRole})}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"role_update_failed");if(row){row.management_role=nextRole;row.updated_at=new Date().toISOString()}saveState()}catch{sel.value=previous;const status=$("#rosterImportStatus");if(status){status.className="notice warn";status.textContent=`⚠️ ${t("management_permission")}`}}finally{sel.disabled=false}}));
  box.querySelectorAll("[data-roster-review-action]").forEach(btn=>btn.addEventListener("click",()=>{if(!hasDeclaredAllianceCommandRole())return;const key=btn.dataset.rosterKey,action=btn.dataset.rosterReviewAction,now=new Date().toISOString();if(action==="leave"){const r=confirmRosterDeparture({review:state.alliance.roster_review,former:state.alliance.former_members},key,{now});if(r.changed){state.alliance.roster_review=r.review;state.alliance.former_members=r.former;state.alliance.updated_at=now;saveState()}}else{const r=restoreRosterReviewMember({members:state.alliance.members,review:state.alliance.roster_review},key,{now});if(r.changed){state.alliance.members=r.members;state.alliance.roster_review=r.review;state.alliance.updated_at=now;saveState()}}}));
  box.querySelectorAll("[data-roster-active-remove]").forEach(btn=>btn.addEventListener("click",()=>{if(!hasDeclaredAllianceCommandRole())return;const key=btn.dataset.rosterActiveRemove,name=btn.dataset.rosterName||t("player");if(!window.confirm(t("roster_remove_confirm",{name})))return;const now=new Date().toISOString(),r=removeActiveRosterMember({members:state.alliance.members,review:state.alliance.roster_review,former:state.alliance.former_members},key,{now});if(r.changed){state.alliance.members=r.members;state.alliance.roster_review=r.review;state.alliance.former_members=r.former;const ds=ensureDesertStormState();ds.registered_keys=ds.registered_keys.filter(x=>x!==key);state.alliance.updated_at=now;saveState()}}));
  box.querySelectorAll("[data-roster-former-reinstate]").forEach(btn=>btn.addEventListener("click",()=>{if(!hasDeclaredAllianceCommandRole())return;const key=btn.dataset.rosterFormerReinstate,name=btn.dataset.rosterName||t("player");if(!window.confirm(t("roster_reintegrate_confirm",{name})))return;const now=new Date().toISOString(),r=reinstateFormerRosterMember({members:state.alliance.members,review:state.alliance.roster_review,former:state.alliance.former_members},key,{now});if(r.changed){state.alliance.members=r.members;state.alliance.roster_review=r.review;state.alliance.former_members=r.former;state.alliance.updated_at=now;saveState()}}));
}


function ensureDesertStormState(){
  const a=state.alliance||(state.alliance={});const current=a.desert_storm&&typeof a.desert_storm==="object"?a.desert_storm:{};
  a.desert_storm={team:String(current.team||"A").toUpperCase()==="B"?"B":"A",battle_time:String(current.battle_time||""),registered_keys:Array.isArray(current.registered_keys)?[...new Set(current.registered_keys.map(String).filter(Boolean))]:[],plan:current.plan&&typeof current.plan==="object"?current.plan:null,updated_at:current.updated_at||null};
  return a.desert_storm;
}
function desertStormFeatureAccess(){if(proState.beta!==false)return requireBetaAccess()&&requireBetaConsent();return requirePro()}
function dsLabel(key){return t(`ds_${key}`)}
function dsMissionLabel(code){
  const labels={
    refinery_science:`${dsLabel("refinery")} + ${dsLabel("science")}`,
    refinery_info:`${dsLabel("refinery")} + ${dsLabel("info")}`,
    hospital_pair:`${dsLabel("hospital")}`,
    mobile_capture:`${dsLabel("mobile")} · ${dsLabel("free_capture")}`,
    compact_opening:`${dsLabel("refinery")} + ${dsLabel("science")} / ${dsLabel("info")}`,
    refinery_info_hospital:`${dsLabel("refinery")} + ${dsLabel("info")} + ${dsLabel("hospital")}`,
    hospitals_mobile:`${dsLabel("hospital")} + ${dsLabel("mobile")}`,
    silo_anchor:`${dsLabel("silo")} · ${dsLabel("anchor")}`,
    silo_support:`${dsLabel("silo")} · ${dsLabel("support")}`,
    arsenal:dsLabel("arsenal"),mercenary_factory:dsLabel("mercenary"),
    silo_mobile:`${dsLabel("silo")} / ${dsLabel("mobile")}`,
    buff_or_silo_support:`${dsLabel("central_buff")} / ${dsLabel("silo")}`,
    buffs_then_silo:`${dsLabel("central_buffs")} → ${dsLabel("silo")}`,
    hold_silo:`${dsLabel("hold")} ${dsLabel("silo")}`,
    hold_refinery:`${dsLabel("hold")} ${dsLabel("refinery")}`,
    support_silo:`${dsLabel("support")} ${dsLabel("silo")}`,
    support_weak_side:`${dsLabel("support")} · ${dsLabel("weak_side")}`,
    oil_wells_if_stable:`${dsLabel("wells")} · ${dsLabel("if_stable")}`,
    hold_best_objectives:`${dsLabel("hold")} · ${dsLabel("best_objectives")}`,
    mobile_support:`${dsLabel("mobile")} · ${dsLabel("support")}`
  };return labels[code]||String(code||"—").replaceAll("_"," ");
}
function desertStormWarningText(w){if(!w)return "";const k=`ds_warning_${w.code}`;return t(k,{count:w.count??0})}
function desertStormCopyText(plan){
  if(!plan)return "";const head=[t("ds_copy_title"),`${t("ds_team")} ${plan.team}${plan.battle_time?` · ${plan.battle_time}`:""}`];
  const groups=(plan.groups||[]).map(g=>{const names=(g.members||[]).map(x=>x.name).filter(Boolean).join(" / ");return `G${g.id} ${names}\n${t("ds_opening")}: ${dsMissionLabel(g.mission?.opening)} → ${t("ds_center")}: ${dsMissionLabel(g.mission?.center)} → ${t("ds_late")}: ${dsMissionLabel(g.mission?.late)}`});
  const subs=(plan.substitutes||[]).map(x=>x.name).filter(Boolean);const rules=[t("ds_order_objectives"),t("ds_order_center"),t("ds_order_help")];
  return [...head,...groups,subs.length?`${t("ds_substitutes")}: ${subs.join(" / ")}`:null,...rules].filter(Boolean).join("\n");
}
function renderDesertStormPicker(){
  const box=$("#desertStormRosterPicker"),counter=$("#desertStormCount");if(!box)return;const ds=ensureDesertStormState(),members=currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members).map(m=>({...m,_key:rosterLifecycleKey(m)})).filter(m=>m._key),activeKeys=new Set(members.map(m=>m._key));
  // A former/review member must never stay silently selected after a roster lifecycle change.
  ds.registered_keys=ds.registered_keys.filter(k=>activeKeys.has(k));
  const selected=new Set(ds.registered_keys),q=rosterNameKey(desertStormSearchTerm);
  const rows=members.filter(m=>!q||rosterNameKey(m.name).includes(q)).sort((a,b)=>(selected.has(b._key)?1:0)-(selected.has(a._key)?1:0)||(Number(b.squad_power_m)||0)-(Number(a.squad_power_m)||0)||(Number(b.power_m)||0)-(Number(a.power_m)||0)||String(a.name||"").localeCompare(String(b.name||"")));
  if(counter)counter.textContent=t("ds_registered_count",{count:selected.size});
  box.innerHTML=rows.length?rows.map(m=>`<label class="dsPlayerPick${selected.has(m._key)?" selected":""}"><input type="checkbox" data-ds-player-key="${esc(m._key)}"${selected.has(m._key)?" checked":""}/><span><b>${esc(m.name||t("player"))}</b><small>${esc(normalizeAllianceRole(m.role))} · ${t("hq")} ${esc(m.hq_level??"—")} · ${m.squad_power_m?`${esc(t("combat_squad_short"))} ${esc(fmtPower(m.squad_power_m))} · `:""}${esc(t("combat_account_short"))} ${esc(fmtPower(m.power_m))}</small></span></label>`).join(""):`<div class="notice">${esc(t("ds_no_match"))}</div>`;
  box.querySelectorAll("[data-ds-player-key]").forEach(ch=>ch.addEventListener("change",()=>{if(!hasDeclaredAllianceCommandRole()){ch.checked=!ch.checked;return}const current=ensureDesertStormState(),set=new Set(current.registered_keys),key=ch.dataset.dsPlayerKey;ch.checked?set.add(key):set.delete(key);current.registered_keys=[...set];current.plan=null;current.updated_at=new Date().toISOString();saveState()}));
}
function renderDesertStormPlan(){
  const box=$("#desertStormPlan"),copyBtn=$("#desertStormCopyBtn");if(!box)return;const ds=ensureDesertStormState(),plan=ds.plan;if(!plan){box.classList.add("hidden");box.innerHTML="";if(copyBtn)copyBtn.classList.add("hidden");return}
  const warnings=(plan.warnings||[]).map(w=>desertStormWarningText(w)).filter(Boolean),subs=(plan.substitutes||[]).map(x=>x.name).filter(Boolean);
  const groupHtml=(plan.groups||[]).map(g=>`<div class="dsPlanGroup"><div class="dsGroupHead"><b>G${g.id} · ${esc(g.captain||t("ds_captain"))}</b><span>${esc(String(g.members?.length||0))}</span></div><small class="dsGroupNames">${esc((g.members||[]).map(x=>x.name).filter(Boolean).join(" · ")||"—")}</small><div class="dsMission"><span><b>${esc(t("ds_opening"))}</b>${esc(dsMissionLabel(g.mission?.opening))}</span><span><b>${esc(t("ds_center"))}</b>${esc(dsMissionLabel(g.mission?.center))}</span><span><b>${esc(t("ds_late"))}</b>${esc(dsMissionLabel(g.mission?.late))}</span></div></div>`).join("");
  box.classList.remove("hidden");box.innerHTML=`<div class="dsPlanTop"><div><b>${esc(t("ds_plan_ready"))}</b><small>${esc(t("ds_starters"))} ${plan.starters?.length||0}/20 · ${esc(t("ds_substitutes"))} ${subs.length}/10 · ${esc(t("ds_confidence"))} ${plan.confidence}%</small></div><span class="pill">${esc(t("ds_team"))} ${esc(plan.team)}</span></div>${warnings.length?`<div class="notice warn dsWarnings">${warnings.map(x=>`<div>⚠️ ${esc(x)}</div>`).join("")}</div>`:""}<div class="dsPlanGroups">${groupHtml}</div>${subs.length?`<div class="dsSubs"><b>${esc(t("ds_substitutes"))}</b><small>${esc(subs.join(" · "))}</small></div>`:""}<div class="dsShortOrders"><b>📣 ${esc(t("ds_short_orders"))}</b><pre>${esc(desertStormCopyText(plan))}</pre></div><p class="activityNote">${esc(t("ds_ruleset_note",{date:DESERT_STORM_RULESET.observed_at}))}</p>`;
  if(copyBtn){copyBtn.classList.remove("hidden");copyBtn.onclick=async()=>{try{await navigator.clipboard.writeText(desertStormCopyText(plan));const old=copyBtn.textContent;copyBtn.textContent=t("copy");setTimeout(()=>copyBtn.textContent=old,1200)}catch{}}}
}
function renderDesertStormPlanner(){
  const section=$("#desertStormPlanner");if(!section)return;const ds=ensureDesertStormState(),manager=hasDeclaredAllianceCommandRole();section.classList.toggle("managerLocked",!manager);
  const search=$("#desertStormSearch"),team=$("#desertStormTeam"),time=$("#desertStormTime");if(search&&search.value!==desertStormSearchTerm)search.value=desertStormSearchTerm;if(team)team.value=ds.team;if(time)time.value=ds.battle_time||"";
  renderDesertStormPicker();renderDesertStormPlan();
}

function memberNames(items,limit=6){const rows=(Array.isArray(items)?items:[]).filter(Boolean),shown=rows.slice(0,limit),more=Math.max(0,rows.length-shown.length);return shown.length?`${shown.join(" / ")}${more?` · +${more}`:""}`:"—"}
function renderAllianceStructured(j){
  const immediate=$("#allianceImmediate"),planB=$("#alliancePlanB");
  const actions=Array.isArray(j?.immediate_actions)?j.immediate_actions:[],fallback=Array.isArray(j?.plan_b)?j.plan_b:[];
  if(immediate){immediate.classList.toggle("hidden",!actions.length);immediate.innerHTML=actions.length?`<b>⚡ ${esc(t("immediate_actions"))}</b>${actions.map(x=>`<div class="warPlanAction"><strong>${esc(t(`alliance_group_${x.kind}`))} · ${esc(String(x.count??0))}</strong><small>${esc(memberNames(x.members))}</small></div>`).join("")}`:""}
  if(planB){planB.classList.toggle("hidden",!fallback.length);planB.innerHTML=fallback.length?`<b>🛡️ ${esc(t("plan_b"))}</b>${fallback.map(x=>{const icon=x.kind==="refresh"?"🟠":x.kind==="defensive"?"🛡️":"✅",label=x.kind==="refresh"?t("refresh"):x.kind==="defensive"?t("alliance_group_defense"):t("ready");return `<div class="warPlanAction"><strong>${icon} ${esc(label)} · ${esc(String(x.count??0))}</strong></div>`}).join("")}`:""}
}
function structuredAdviceText(scope,j){
  if(!j)return scope==="alliance"?t("war_plan_empty"):scope==="vs"?t("vs_empty"):t("season_empty");
  if(scope==="season"){
    if(j.lifecycle==="interseason"||j.lifecycle==="ended")return [j.lifecycle==="interseason"?t("season_interseason"):t("season_ended_short"),j.last_known_profession?`${t("season_last_profession")}: ${j.last_known_profession}`:null,t("season_wait_next"),t("season_no_old_advice")].filter(Boolean).join("\n");
    if(j.lifecycle==="unknown")return [t("season_unknown"),t("season_confirm_state")].join("\n");
    if(aiUsesNativeCopy()&&j.advice)return j.advice;
    const parts=[t("season_structured_priority")];if(j.progress_pct!=null)parts.push(`${t("season_progress")}: ${j.progress_pct}%`);else parts.push(`${t("season_progress")}: ${t("season_unknown")}`);if(j.profession)parts.push(`${t("profession")}: ${j.profession}`);if(j.resistance!=null)parts.push(`🛡️ ${j.resistance}`,t("season_resistance_priority"));if(j.day&&j.total_days&&Number(j.day)/Number(j.total_days)>=.8)parts.push(t("season_late_priority"));return parts.join("\n");
  }
  if(scope==="alliance"){
    const refreshCount=Number(j?.activity?.refresh??0),hasActions=Array.isArray(j?.immediate_actions)&&j.immediate_actions.length>0;
    const status=j?.reliability==="refresh_required"&&refreshCount>0?t(hasActions?"alliance_plan_partial_refresh":"alliance_plan_refresh_required",{count:refreshCount}):"";
    const body=aiUsesNativeCopy()&&j.advice?j.advice:`${t("alliance")} · 🟢 ${j.activity?.active??0} · 🟠 ${refreshCount}`;
    return [status,body].filter(Boolean).join("\n");
  }
  if(aiUsesNativeCopy()&&j.advice)return j.advice;
  if(scope==="vs"){
    const d=Number(j.day),prep=d===0,key=Number.isInteger(d)&&d>=1&&d<=6?`vs_focus_${d}`:null,gap=Number(j.score_gap),focus=prep?t("vs_prep_focus"):key?t(key):t("plan7_hold"),head=prep?t("vs_prep_day"):(Number.isInteger(d)?`${t("vs")} · #${d}`:t("vs")),hold=prep?t("vs_prep_hold_rule"):t("vs_hold_rule");
    return `${head}\n${t("plan7_focus")}: ${focus}${!prep&&Number.isFinite(gap)?`\nΔ ${Math.round(gap*100)/100}`:""}\n${hold}`;
  }
  return j.advice||"";
}


function fmtVsNumber(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(n):"—"}
function fmtVsCompact(v){const n=Number(v);if(!Number.isFinite(n))return "—";return new Intl.NumberFormat(locale,{notation:"compact",maximumFractionDigits:1}).format(n)}
function fmtVsDuration(seconds,text){const n=Number(seconds);if(Number.isFinite(n)&&n>=0){const h=Math.floor(n/3600),m=Math.floor((n%3600)/60);return `${h}h ${String(m).padStart(2,"0")}`;}return text||"—"}
function vsSideLabel(v,side){const ours=side==="ours",name=ours?(v.our_alliance||state.alliance?.name||state.alliance?.tag):(v.opponent||t("unknown_opponent")),tag=ours?(v.our_tag||state.alliance?.tag):v.opponent_tag,server=ours?(v.our_server_id||state.player?.server_id):v.opponent_server_id;const parts=[name];if(tag&&String(name||"").toUpperCase()!==String(tag).toUpperCase())parts.push(`[${tag}]`);if(server)parts.push(`· #${server}`);return parts.filter(Boolean).join(" ")}
function vsDecisionLabel(key){return t({scan:"vs_decision_scan",save:"vs_decision_save",monitor:"vs_decision_monitor",protect:"vs_decision_protect",push:"vs_decision_push",push_hard:"vs_decision_push_hard",ended:"vs_decision_ended"}[key]||"vs_decision_scan")}
function vsUrgencyLabel(key){return t({unknown:"vs_urgency_unknown",low:"vs_urgency_low",medium:"vs_urgency_medium",high:"vs_urgency_high",critical:"vs_urgency_critical"}[key]||"vs_urgency_unknown")}
function vsDecisionReason(engine){
  if(engine.stale)return t("vs_reason_stale");
  if(engine.ended)return t("vs_reason_ended");
  if(!engine.known)return t("vs_reason_scan");
  if(engine.risk==="opponent_catchup_before_end")return t("vs_reason_protect");
  if(engine.risk==="our_catchup_after_end")return t("vs_reason_push_hard");
  return t({save:"vs_reason_save",monitor:"vs_reason_monitor",protect:"vs_reason_protect",push:"vs_reason_push",push_hard:"vs_reason_push_hard",scan:"vs_reason_scan"}[engine.decision]||"vs_reason_scan");
}
function vsRiskText(engine){
  if(engine.stale)return t("vs_risk_stale");
  if(engine.ended)return t("vs_risk_ended");
  if(!engine.known)return t("vs_risk_unknown");
  if(!engine.trend)return t("vs_risk_second_scan");
  if(engine.eta_kind==="opponent_catchup"&&Number.isFinite(Number(engine.eta_seconds))){const eta=fmtVsDuration(engine.eta_seconds);return engine.risk==="opponent_catchup_before_end"?t("vs_risk_opponent_eta",{eta}):t("vs_risk_after_end",{eta})}
  if(engine.eta_kind==="our_catchup"&&Number.isFinite(Number(engine.eta_seconds))){const eta=fmtVsDuration(engine.eta_seconds);return engine.risk==="our_catchup_possible"?t("vs_risk_our_eta",{eta}):t("vs_risk_our_too_late",{eta})}
  if(engine.risk==="lead_growing")return t("vs_risk_lead_growing");
  if(engine.risk==="opponent_extending")return t("vs_risk_opponent_extending");
  return t("vs_risk_stable");
}
function vsUseNowText(v){const d=Number(v.day)||Number(currentVsDay());const key=Number.isInteger(d)&&d>=1&&d<=6?`vs_focus_${d}`:null;return key?t(key):t("vs_use_only_scoring")}
function renderVsDecision(v,engine){
  const action=$("#vsDecisionAction"),reason=$("#vsDecisionReason"),urgency=$("#vsUrgency"),urgencyPill=$("#vsUrgencyPill");
  if(action)action.textContent=vsDecisionLabel(engine.decision);if(reason)reason.textContent=vsDecisionReason(engine);if(urgency)urgency.textContent=vsUrgencyLabel(engine.urgency);
  if(urgencyPill){urgencyPill.textContent=vsUrgencyLabel(engine.urgency);urgencyPill.className=`pill vsUrgency ${engine.urgency}`}
  const use=$("#vsDecisionUse"),keep=$("#vsDecisionKeep"),rescan=$("#vsDecisionRescan"),risk=$("#vsDecisionRisk");
  if(use)use.textContent=engine.stale?t("vs_use_stale"):(engine.ended?t("vs_use_ended"):vsUseNowText(v));if(keep)keep.textContent=engine.stale?t("vs_keep_stale"):(engine.ended?t("vs_keep_after_end"):t("vs_hold_rule"));if(rescan)rescan.textContent=engine.stale?t("vs_rescan_stale"):(engine.ended?t("vs_no_rescan_ended"):(engine.rescan_minutes>0?t("vs_rescan_minutes",{minutes:engine.rescan_minutes}):t("vs_scan_now")));if(risk)risk.textContent=vsRiskText(engine);
}
function renderVsLive(){
  const v=state.vs||{},freshness=vsSnapshotFreshness(v,{now:serverNow}),sit=vsSituation(v),trend=vsTrend(v),personal=personalVsPosition(v),engine=vsDecisionEngine(v,{now:serverNow}),known=scoreKnown(v),liveKnown=known&&freshness.current,stale=known&&!freshness.current,unknown=$("#vsScoreUnknown");
  $("#vsWeekTitle").textContent=t("vs_week",{week:currentVsWeek()});$("#vsDayPill").textContent=currentVsDay()===0?t("vs_prep_day"):t("day_n",{day:currentVsDay()});
  $("#vsUs").textContent=vsSideLabel(v,"ours");$("#vsThem").textContent=vsSideLabel(v,"theirs");
  $("#vsUsScore").textContent=known?fmtVsNumber(v.our_score):"—";$("#vsThemScore").textContent=known?fmtVsNumber(v.their_score):"—";
  if(unknown){unknown.classList.toggle("hidden",known&&!stale);unknown.textContent=stale?t("vs_stale_notice"):t("vs_score_unknown")}
  const key=stale?"vs_status_stale":({strong_lead:"vs_status_strong_lead",lead:"vs_status_lead",narrow_lead:"vs_status_narrow_lead",even:"vs_status_even",narrow_trail:"vs_status_narrow_trail",trail:"vs_status_trail",strong_trail:"vs_status_strong_trail",unknown:"vs_status_unknown"}[sit.status]||"vs_status_unknown");
  const pill=$("#vsSituationPill");if(pill){pill.textContent=t(key);pill.className=`pill vsSituation ${stale?"unknown":sit.status}`}
  const liveTitle=$("#vsLiveSituationTitle");if(liveTitle)liveTitle.textContent=t(stale?"vs_stale_title":"vs_live_situation");
  $("#vsTheme").textContent=v.theme||"—";$("#vsRemaining").textContent=stale?"—":fmtVsDuration(v.time_remaining_seconds,v.time_remaining_text);
  $("#vsGap").textContent=liveKnown?`${sit.gap>=0?"+":"−"}${fmtVsCompact(Math.abs(sit.gap))}`:"—";
  $("#vsPersonal").textContent=personal.rank!==null?`#${personal.rank}${personal.score!==null?` · ${fmtVsCompact(personal.score)}`:""}`:t("vs_no_personal_rank");
  renderVsDecision(v,engine);
  const share=$("#vsShareLine");if(share){if(liveKnown&&sit.our_share!==null){const a=Math.round(sit.our_share),b=Math.round(sit.their_share);share.textContent=t("vs_share_line",{ours:a,theirs:b,gap:fmtVsNumber(Math.abs(sit.gap))});share.className="notice"}else share.className="notice hidden"}
  const trendEl=$("#vsTrendLine");if(trendEl){if(stale){trendEl.textContent=t("vs_stale_notice");trendEl.className="notice warn"}else if(trend&&!engine.ended){const mins=Math.max(1,Math.round(trend.elapsed_seconds/60));trendEl.textContent=t("vs_trend_line",{minutes:mins,ours:fmtVsCompact(trend.our_gain),theirs:fmtVsCompact(trend.their_gain)});trendEl.className="notice"}else if(engine.ended){trendEl.textContent=t("vs_risk_ended");trendEl.className="notice"}else{trendEl.textContent=t("vs_trend_need_second_scan");trendEl.className=liveKnown?"notice":"notice hidden"}}
  const fresh=$("#vsFreshness");if(fresh)fresh.textContent=v.updated_at?(stale?t("vs_last_scan_stale",{ago:fmtAgo(v.updated_at)}):t("vs_last_scan",{ago:fmtAgo(v.updated_at)})):t("vs_never_scanned");
  const sec=$("#vsVisibleRankingSection"),list=$("#vsVisibleRanking"),rows=Array.isArray(v.leaderboard)?v.leaderboard.slice(0,8):[];if(sec&&list){sec.classList.toggle("hidden",rows.length===0);list.innerHTML=rows.map(r=>`<div class="member"><div><b>#${esc(r.rank??"—")} · ${esc(r.player_name||"—")}</b><small>${r.alliance_tag?`[${esc(r.alliance_tag)}] · `:""}${esc(fmtVsNumber(r.score))}</small></div>${String(r.player_name||"").toLowerCase()===String(state.player?.name||"").toLowerCase()?`<span class="delta">${esc(t("you"))}</span>`:""}</div>`).join("")}
}
function renderVsTimeline(){const current=Number(currentVsDay()),prep=current===0,fmt=new Intl.DateTimeFormat(locale,{weekday:"short"}),monday=new Date(Date.UTC(2026,0,5));$("#vsTimeline").innerHTML=Array.from({length:6},(_,i)=>{const d=new Date(monday);d.setUTCDate(monday.getUTCDate()+i);if(prep&&i===0)return `<div class="day next"><span class="vsNextMarker">${esc(t("vs_next_day1"))}</span></div>`;return `<div class="day ${current===i+1?"active":""}">${fmt.format(d)}<br>${t("day_label")}${i+1}</div>`}).join("")}
function renderAdvice(){if(!betaPrivateDataVisible()){$("#adviceTitle").textContent=t("configure_profile");$("#adviceText").textContent=t("beta_signin_required");$("#adviceAction").textContent=t("login");return}const p=state.player;if(!p.name){$("#adviceTitle").textContent=t("configure_profile");$("#adviceText").textContent=t("configure_text");$("#adviceAction").textContent=t("configure");return}if(playerNeedsOnboarding()){$("#adviceTitle").textContent=t("hello",{name:p.name});$("#adviceText").textContent=t("sync_four");$("#adviceAction").textContent=t("scan_account");return}const primary=selectPrimarySquad(state);if(!primary){$("#adviceTitle").textContent=t("hello",{name:p.name});$("#adviceText").textContent=t("sync_four");$("#adviceAction").textContent=t("open_player");return}const primaryName=`${t("squad")} ${primary.i+1}`;let text=t("priority_text",{power:fmtPower(primary.s.power)});const primaryPower=Number(primary.s.power),strongestOther=state.squads.map((s,i)=>({s,i,p:Number(s?.power)})).filter(x=>x.i!==primary.i&&squadHasData(x.s)&&Number.isFinite(x.p)&&x.p>0).sort((a,b)=>b.p-a.p)[0];if(primary.i===0&&Number.isFinite(primaryPower)&&strongestOther&&strongestOther.p>primaryPower){text+=` ${t("stronger_squad_note",{name:`${t("squad")} ${strongestOther.i+1}`,power:fmtPower(strongestOther.p)})}`}$("#adviceTitle").textContent=t("priority",{name:primaryName});$("#adviceText").textContent=text;$("#adviceAction").textContent=t("view_squads")}
function renderAccountFields(){const p=state.player,ctx=state.player_context||{},reveal=betaPrivateDataVisible();if(!$("#fName"))return;const ids=["fName","fServer","fHq","fAlliance","fRole","fObjective","fAccountAge","fServerProfile"];if(!reveal){$("#fName").value="";$("#fServer").value="";$("#fHq").value="";$("#fAlliance").value="";$("#fRole").value="";if($("#fObjective"))$("#fObjective").value="auto";if($("#fAccountAge"))$("#fAccountAge").value="";if($("#fServerProfile"))$("#fServerProfile").value="auto"}else{$("#fName").value=p.name||"";$("#fServer").value=p.server_id||"";$("#fHq").value=p.hq_level||"";$("#fAlliance").value=state.alliance.tag||"";$("#fRole").value=p.role||"R1";if($("#fObjective"))$("#fObjective").value=ctx.objective||"auto";if($("#fAccountAge"))$("#fAccountAge").value=ctx.account_age_days??"";if($("#fServerProfile"))$("#fServerProfile").value=ctx.server_profile||"auto"}ids.forEach(id=>{const el=$("#"+id);if(el)el.disabled=!reveal});if($("#saveProfileBtn"))$("#saveProfileBtn").disabled=!reveal;renderVoiceSettings()}
function renderProvider(){
  const s=state.sync||{},sources=s.sources||{},pill=$("#providerPill"),box=$("#providerStatus"),reveal=betaPrivateDataVisible();
  if(!pill||!box)return;
  pill.textContent=t("safe_external_disabled");pill.className="pill";
  $("#publicSourceState").textContent=t("safe_external_disabled");
  $("#scanSourceState").textContent=(sources.scan||s.last_scan)?t("available"):t("ready");
  $("#allianceCloudState").textContent=(sources.alliance||cloudSession)?t("available"):t("not_connected");
  if($("#openScanBtn"))$("#openScanBtn").disabled=!reveal;
  if($("#syncAllBtn"))$("#syncAllBtn").disabled=!reveal;
  box.className=`notice${reveal?"":" warn"}`;
  box.textContent=reveal?t("safe_sync_note"):t("beta_signin_required");
}
function openDrawer(name){closeDrawers();$("#backdrop").classList.add("open");const d=$("#"+name+"Drawer");if(d){d.classList.add("open");d.setAttribute("aria-hidden","false");if(name==="player"||name==="alliance")setTimeout(()=>speakGreeting(name),80)}}
function closeDrawers(){$("#backdrop").classList.remove("open");$$('.drawer').forEach(d=>{d.classList.remove("open");d.setAttribute("aria-hidden","true")})}

$$('[data-open]').forEach(b=>b.addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer(b.dataset.open)}));$("#homeProBtn")?.addEventListener("click",()=>{openDrawer("account");setTimeout(()=>$("#proSection")?.scrollIntoView({behavior:"smooth",block:"start"}),140)});$$('[data-close]').forEach(b=>b.addEventListener("click",closeDrawers));$("#backdrop").addEventListener("click",closeDrawers);$("#accountBtn").addEventListener("click",()=>openDrawer("account"));$("#adviceAction").addEventListener("click",()=>{if(state.player.name&&!requireBetaAccess())return;if(state.player.name&&playerNeedsOnboarding())return openDrawer("scan");openDrawer(state.player.name?"player":"account")});$("#languageSelect").addEventListener("change",e=>{languageChoice=e.target.value;localStorage.setItem(LANG_KEY,languageChoice);applyLanguage()});
$("#saveProfileBtn").addEventListener("click",async()=>{state.player.name=$("#fName").value.trim();state.player.server_id=$("#fServer").value.trim();state.player.hq_level=Number($("#fHq").value)||null;const ctxAgeRaw=String($("#fAccountAge")?.value??"").trim(),ctxAge=ctxAgeRaw===""?null:Number(ctxAgeRaw);state.player_context={...(state.player_context||{}),objective:$("#fObjective")?.value||"auto",account_age_days:ctxAge!==null&&Number.isFinite(ctxAge)&&ctxAge>=0?Math.round(ctxAge):null,server_profile:$("#fServerProfile")?.value||"auto",updated_at:new Date().toISOString()};const requestedRole=$("#fRole").value.trim().toUpperCase()||"R1",safeRole=safeSelfRole(requestedRole);state.player.role=safeRole;state.player.updated_at=new Date().toISOString();state.alliance.server_id=state.player.server_id;state.alliance.tag=$("#fAlliance").value.trim().toUpperCase();state.vs.our_alliance=state.alliance.tag;reconcileCurrentPlayerAllianceIdentity({touch:true});recordProgressionSnapshot("manual_profile");saveState();await syncAll();const joined=await joinPendingAlliance();if(joined)await syncAll();closeDrawers()});

async function syncAll(){if(!requireBetaAccess()||!requireBetaConsent())return;const btns=[$("#syncAllBtn"),$("#syncPlayerBtn")].filter(Boolean);btns.forEach(b=>{b.disabled=true;b.textContent=t("syncing")});try{const r=await fetch("/api/sync",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({state,locale:lang})});const j=await r.json().catch(()=>({}));if(r.ok&&j.state){state=repairLegacySquadIdentity(mergeState(state,j.state)).state;state.sync={...state.sync,status:"ok",provider:j.provider||state.sync.provider||"warboost-local",provider_kind:j.provider_kind||state.sync.provider_kind||"local",capabilities:j.capabilities||state.sync.capabilities||[],last_sync:j.synced_at||new Date().toISOString(),last_error:null,sources:{...state.sync.sources,...j.sources}};saveState();$("#playerSyncInfo").textContent=t("safe_sync_done")}else{state.sync.last_error=j.message||j.error||t("hybrid_no_public");state.sync.status="waiting";saveState()}}catch{state.sync.last_error=t("offline_keep");state.sync.status="offline";saveState()}finally{btns.forEach((b,i)=>{b.disabled=false;b.textContent=i===0?t("public_refresh"):t("public_button")})}}
$("#syncAllBtn").addEventListener("click",syncAll);$("#syncPlayerBtn").addEventListener("click",syncAll);
$("#openScanBtn").addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer("scan")});$("#scanPlayerBtn").addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer("scan")});$("#playerOnboardingScanBtn")?.addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer("scan")});$("#quickProfileScanBtn")?.addEventListener("click",()=>openQuickScan("profile"));$("#quickSquadScanBtn")?.addEventListener("click",()=>{const strongest=strongestSquadFromState(state);openQuickScan(`squad${strongest.id||1}`)});$("#quickDroneScanBtn")?.addEventListener("click",()=>openQuickScan("drone"));$("#scanShopBtn")?.addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer("scan");renderScanTypeOptions();if($("#scanType"))$("#scanType").value="shop"});$("#scanVsBtn")?.addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer("scan");renderScanTypeOptions();if($("#scanType"))$("#scanType").value="vs"});

async function imageToDataUrl(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=2048,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);let data=c.toDataURL("image/jpeg",.9);if(data.length>3900000)data=c.toDataURL("image/jpeg",.78);URL.revokeObjectURL(url);resolve(data)}catch(e){reject(e)}};img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url})}
$("#scanFile").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{scanImageData=await imageToDataUrl(file);$("#scanPreview").src=scanImageData;$("#scanPreview").classList.remove("hidden");$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_ready")}catch{$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_error")}});
$("#analyzeScanBtn").addEventListener("click",async()=>{if(!scanImageData){$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_wait");return}if(!requireBetaAccess()||!requireBetaConsent())return;if(!cloudSession?.access_token){openDrawer("account");authMessage(t("connect_pro"));return}const btn=$("#analyzeScanBtn");btn.disabled=true;btn.textContent=t("scan_processing");$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_processing");try{const r=await fetch("/api/scan",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({scan_type:$("#scanType").value,locale:lang,image_data_url:scanImageData,current_state:state})});const j=await r.json().catch(()=>({}));if(r.ok&&j.state){const scanType=$("#scanType").value;const sm=String(scanType||"").match(/^squad([1-4])$/i);let suggestedNames=[],scanSlots=[];if(sm){const idx=Number(sm[1])-1,incomingSq=j.state.squads?.[idx];if(incomingSq?.heroes){scanSlots=Array.from({length:5},(_,i)=>({...((incomingSq.heroes?.[i]&&typeof incomingSq.heroes[i]==="object")?incomingSq.heroes[i]:{})}));suggestedNames=scanSlots.map(h=>String(h?.name||"").trim());delete incomingSq.heroes}}state=repairLegacySquadIdentity(mergeState(state,j.state)).state;if(sm){const staged=state.squads?.[Number(sm[1])-1];if(staged){staged.needs_rescan=true;staged.composition_changed_at=j.scanned_at||new Date().toISOString()}}state.sync.last_scan=j.scanned_at||new Date().toISOString();state.sync.sources={...state.sync.sources,scan:true};if(["profile","drone","exclusive","awakening"].includes(scanType)||sm)recordProgressionSnapshot(`scan_${scanType}`,j.scanned_at||new Date().toISOString());saveState();$("#proPriorityPanel")?.classList.add("hidden");$("#playerSyncInfo")?.classList.remove("hidden");if(sm){const count=suggestedNames.filter(Boolean).length;$("#scanStatus").className="notice warn";$("#scanStatus").textContent=count>0?t("hero_auto_recognized",{count}):t("hero_confirm_needed");startHeroConfirmation(Number(sm[1]),suggestedNames,scanSlots)}else{$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_saved");closeHeroConfirmation(true);if(scanType==="vs"){render();openDrawer("vs");if(proState.active){const live=await requestAdvice("vs");$("#vsPlanText").textContent=structuredAdviceText("vs",live)}}}}else{$("#scanStatus").className="notice warn";$("#scanStatus").textContent=j.code==="SCAN_NOT_CONFIGURED"?t("scan_unconfigured"):(j.message||t("scan_error"))}}catch{$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_error")}finally{btn.disabled=false;btn.textContent=t("analyze")}});

async function requestAdvice(scope){if(scope==="vs"){state.vs.week=currentVsWeek();state.vs.day=currentVsDay()}try{const r=await fetch("/api/advice",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({scope,state,locale:lang})});const j=await r.json().catch(()=>({}));if(r.ok)return j}catch{}return null}
async function runPlayerAdvice(scrollShop=false){if(!requirePro())return;const buttons=[$("#playerAdviceBtn"),$("#shopAdviceBtn")].filter(Boolean),note=$("#playerSyncInfo"),panel=$("#proPriorityPanel"),labels=buttons.map(b=>b.textContent);buttons.forEach(b=>{b.disabled=true;b.textContent=t("pro_analyzing")});if(note){note.classList.remove("hidden");note.textContent=t("pro_analyzing")}if(panel)panel.classList.add("hidden");const j=await requestAdvice("player");if(j?.analysis){renderProPriority(j.analysis);if(scrollShop)setTimeout(()=>$("#proShopList")?.scrollIntoView({behavior:"smooth",block:"start"}),120)}else if(note)note.textContent=j?.advice||t("player_sync_note");buttons.forEach((b,i)=>{b.disabled=false;b.textContent=labels[i]})}
$("#playerAdviceBtn").addEventListener("click",()=>runPlayerAdvice(false));$("#shopAdviceBtn")?.addEventListener("click",()=>runPlayerAdvice(true));
$("#warPlanBtn").addEventListener("click",async()=>{if(!requirePro())return;if(!hasDeclaredAllianceCommandRole()){$("#warPlanText").textContent=managerOnlyMessage();return}const j=await requestAdvice("alliance");$("#warPlanText").textContent=structuredAdviceText("alliance",j);renderAllianceStructured(j)});
$("#rankManagerSearch")?.addEventListener("input",e=>{rankManagerSearchTerm=String(e.target.value||"");renderAllianceRankManager()});
$("#rankManagerClearBtn")?.addEventListener("click",()=>{rankChangeDraft.clear();renderAllianceRankManager();rankManagerStatus("",{},false)});
$("#rankManagerApplyBtn")?.addEventListener("click",applyRankManagerChanges);
$("#desertStormSearch")?.addEventListener("input",e=>{desertStormSearchTerm=String(e.target.value||"");renderDesertStormPicker()});
$("#desertStormTeam")?.addEventListener("change",e=>{if(!hasDeclaredAllianceCommandRole())return;const ds=ensureDesertStormState();ds.team=String(e.target.value||"A").toUpperCase()==="B"?"B":"A";ds.plan=null;ds.updated_at=new Date().toISOString();saveState()});
$("#desertStormTime")?.addEventListener("change",e=>{if(!hasDeclaredAllianceCommandRole())return;const ds=ensureDesertStormState();ds.battle_time=String(e.target.value||"");ds.plan=null;ds.updated_at=new Date().toISOString();saveState()});
$("#desertStormClearBtn")?.addEventListener("click",()=>{if(!hasDeclaredAllianceCommandRole())return;const ds=ensureDesertStormState();ds.registered_keys=[];ds.plan=null;ds.updated_at=new Date().toISOString();saveState();const st=$("#desertStormStatus");if(st){st.className="notice";st.textContent=t("ds_cleared");st.classList.remove("hidden")}});
$("#desertStormGenerateBtn")?.addEventListener("click",()=>{const st=$("#desertStormStatus");if(!hasDeclaredAllianceCommandRole()){if(st){st.className="notice warn";st.textContent=managerOnlyMessage();st.classList.remove("hidden")}return}if(!desertStormFeatureAccess())return;const ds=ensureDesertStormState(),members=currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members).map(m=>({...m,lifecycle_key:rosterLifecycleKey(m)})),activeKeys=new Set(members.map(m=>m.lifecycle_key).filter(Boolean));ds.registered_keys=ds.registered_keys.filter(k=>activeKeys.has(k));if(!ds.registered_keys.length){if(st){st.className="notice warn";st.textContent=t("ds_no_registered");st.classList.remove("hidden")}return}ds.plan=buildDesertStormPlan(members,ds.registered_keys,{nowMs:serverNow.getTime(),team:ds.team,battleTime:ds.battle_time});ds.updated_at=new Date().toISOString();state.alliance.updated_at=ds.updated_at;saveState();if(st){st.className="notice";st.textContent=t("ds_plan_ready");st.classList.remove("hidden")}});
$("#vsPlanBtn").addEventListener("click",async()=>{if(!requirePro())return;const j=await requestAdvice("vs");$("#vsPlanText").textContent=structuredAdviceText("vs",j)});$("#seasonLifecycleSelect")?.addEventListener("change",()=>{const value=$("#seasonLifecycleSelect").value||"unknown",now=new Date().toISOString();state.season=repairSeasonState({...state.season,lifecycle:value,lifecycle_source:"manual",ended_at:(value==="ended"||value==="interseason")?(state.season.ended_at||now):null,updated_at:now});saveState();$("#seasonAdviceText").textContent=t("season_empty")});
$("#seasonAdviceBtn").addEventListener("click",async()=>{if(!requirePro())return;const j=await requestAdvice("season");$("#seasonAdviceText").textContent=structuredAdviceText("season",j)});
async function getAdvice(scope){const j=await requestAdvice(scope);return structuredAdviceText(scope,j)}

function currentRosterIdentityContext(){return {server_id:state.player?.server_id||state.alliance?.server_id||"",alliance_tag:state.alliance?.tag||""}}
function currentRosterIdentityCollections(){return {members:state.alliance?.members||[],review:state.alliance?.roster_review||[],former:state.alliance?.former_members||[]}}
function rosterDraftKey(row){return rosterIdentityKey(row?.name||"",currentRosterIdentityContext().alliance_tag)}
function mergeRosterScanRows(base=[],incoming=[]){
  const tag=currentRosterIdentityContext().alliance_tag,map=new Map();for(const raw of [...(Array.isArray(base)?base:[]),...(Array.isArray(incoming)?incoming:[])]){const name=cleanRosterOcrName(raw?.name||"",tag),key=rosterIdentityKey(name,tag);if(!name||!key)continue;const role=normalizedRole(raw?.role),hq=Number(raw?.hq_level),power=Number(raw?.power_m),confidence=Number(raw?.confidence);const row={name,role,hq_level:Number.isFinite(hq)&&hq>0?Math.round(hq):null,power_m:Number.isFinite(power)&&power>0?Math.round(power*100)/100:null,confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):null,updated_at:raw?.updated_at||null};const old=map.get(key);if(!old){map.set(key,row);continue}const oldScore=(old.confidence??0)+(old.hq_level?0.15:0)+(old.power_m?0.15:0),newScore=(row.confidence??0)+(row.hq_level?0.15:0)+(row.power_m?0.15:0);map.set(key,newScore>=oldScore?{...old,...row}:{...row,...old})}return [...map.values()].sort((a,b)=>({R5:5,R4:4,R3:3,R2:2,R1:1}[b.role]-({R5:5,R4:4,R3:3,R2:2,R1:1}[a.role])||(b.power_m||0)-(a.power_m||0)||a.name.localeCompare(b.name)));
}
function resolveCurrentRosterScanDraft(rows=rosterScanDraft){return resolveRosterScanRows(rows,currentRosterIdentityCollections(),currentRosterIdentityContext())}
function rosterIdentityStatusText(r){
  const pOld=Number(r?.previous_power_m),pNow=Number(r?.power_m),powerDelta=Number.isFinite(pOld)&&Number.isFinite(pNow)?` · ${fmtPower(pOld)} → ${fmtPower(pNow)}`:"";
  if(r?.identity_status==="existing")return `${t("roster_identity_existing")}${powerDelta}`;
  if(r?.identity_status==="review")return `${t("roster_identity_review")}${powerDelta}`;
  if(r?.identity_status==="former")return `${t("roster_identity_former")}${powerDelta}`;
  if(r?.identity_status==="possible")return t("roster_identity_possible",{name:r?.possible_match?.name||"—"});
  if(r?.identity_status==="ambiguous")return t("roster_identity_ambiguous");
  if(r?.identity_status==="invalid")return t("roster_identity_invalid");
  return t("roster_identity_new");
}
function renderRosterScanDraft(){
  const box=$("#rosterScanDraft"),btn=$("#rosterScanImportBtn");if(!box)return;if(btn)btn.classList.toggle("hidden",!rosterScanDraft.length);
  if(btn)btn.disabled=rosterScanHasUnresolvedIdentity(rosterScanDraft);
  box.innerHTML=rosterScanDraft.length?rosterScanDraft.map((r,i)=>`<div class="rosterScanRow" data-roster-draft-index="${i}"><input data-rsf="name" value="${esc(r.name)}" aria-label="${esc(t("nickname"))}"/><select data-rsf="role">${["R5","R4","R3","R2","R1"].map(x=>`<option value="${x}"${r.role===x?" selected":""}>${x}</option>`).join("")}</select><input data-rsf="hq" inputmode="numeric" value="${esc(r.hq_level??"")}" placeholder="QG"/><input data-rsf="power" inputmode="decimal" value="${esc(r.power_m??"")}" placeholder="M"/><button type="button" data-roster-draft-remove="${i}">×</button><div class="rosterScanConfidence">${esc(t("roster_scan_confidence"))}: ${r.confidence===null?"—":Math.round(r.confidence*100)+"%"}</div><div class="rosterIdentityStatus ${esc(r.identity_status||"new")}">${esc(rosterIdentityStatusText(r))}${r.identity_status==="possible"?` <button type="button" class="smallBtn" data-roster-confirm-match="${i}">${esc(t("roster_identity_use_match"))}</button>`:""}</div></div>`).join(""):`<div class="privacyText">${esc(t("roster_scan_empty"))}</div>`;
  box.querySelectorAll("[data-roster-draft-remove]").forEach(b=>b.addEventListener("click",()=>{rosterScanDraft.splice(Number(b.dataset.rosterDraftRemove),1);renderRosterScanDraft()}));
  box.querySelectorAll("[data-roster-confirm-match]").forEach(b=>b.addEventListener("click",()=>{const i=Number(b.dataset.rosterConfirmMatch),row=rosterScanDraft[i];if(!row)return;rosterScanDraft[i]=confirmRosterScanPossibleMatch(row,currentRosterIdentityCollections(),currentRosterIdentityContext());renderRosterScanDraft()}));
  box.querySelectorAll("[data-roster-draft-index]").forEach(row=>row.addEventListener("change",()=>{const i=Number(row.dataset.rosterDraftIndex),cur=rosterScanDraft[i];if(!cur)return;cur.name=row.querySelector('[data-rsf="name"]')?.value.trim()||"";cur.role=normalizedRole(row.querySelector('[data-rsf="role"]')?.value);const h=Number(row.querySelector('[data-rsf="hq"]')?.value),p=Number(String(row.querySelector('[data-rsf="power"]')?.value||"").replace(',','.'));cur.hq_level=Number.isFinite(h)&&h>0?Math.round(h):null;cur.power_m=Number.isFinite(p)&&p>0?Math.round(p*100)/100:null;rosterScanDraft[i]=resolveRosterScanRows([cur],currentRosterIdentityCollections(),currentRosterIdentityContext())[0];renderRosterScanDraft()}));
}
function collectRosterScanDraftFromDom(){
  const box=$("#rosterScanDraft");if(!box)return rosterScanDraft;
  box.querySelectorAll("[data-roster-draft-index]").forEach(row=>{const i=Number(row.dataset.rosterDraftIndex),cur=rosterScanDraft[i];if(!cur)return;cur.name=row.querySelector('[data-rsf="name"]')?.value.trim()||"";cur.role=normalizedRole(row.querySelector('[data-rsf="role"]')?.value);const h=Number(row.querySelector('[data-rsf="hq"]')?.value),p=Number(String(row.querySelector('[data-rsf="power"]')?.value||"").replace(',','.'));cur.hq_level=Number.isFinite(h)&&h>0?Math.round(h):null;cur.power_m=Number.isFinite(p)&&p>0?Math.round(p*100)/100:null});
  rosterScanDraft=resolveCurrentRosterScanDraft(rosterScanDraft);
  return rosterScanDraft;
}
function applyRosterRows(imported,{complete=false,status=null,source="manual_import"}={}){
  const now=new Date().toISOString(),rows=(Array.isArray(imported)?imported:[]).filter(x=>x?.name).map(row=>({...row,server_id:state.player?.server_id||row.server_id||"",alliance_tag:state.alliance?.tag||row.alliance_tag||"",source,updated_at:row.updated_at||now}));
  if(!rows.length){if(status){status.className="notice warn";status.textContent=t("import_error");status.classList.remove("hidden")}return null}
  const result=applyRosterImportLifecycle({members:state.alliance.members,review:state.alliance.roster_review,former:state.alliance.former_members},rows,{complete,now});state.alliance.members=result.members;state.alliance.roster_review=result.review;state.alliance.former_members=result.former;if(complete)state.alliance.roster_snapshot_complete_at=now;reconcileCurrentPlayerAllianceIdentity({touch:true});state.alliance.updated_at=now;state.sync.sources={...state.sync.sources,alliance:true};saveState();if(status){status.className="notice";status.textContent=complete?t("roster_import_complete_result",{active:result.summary.active_count,review:result.summary.review_count,added:result.summary.added,returned:result.summary.returned}):t("roster_import_partial_result",{count:result.summary.imported,added:result.summary.added,returned:result.summary.returned});status.classList.remove("hidden")}return result;
}
function renderRosterScanFiles(){
  const info=$("#rosterScanFileInfo"),list=$("#rosterScanFileList");
  if(info)info.textContent=rosterScanFiles.length?t("roster_scan_files",{count:rosterScanFiles.length}):"";
  if(!list)return;
  list.innerHTML=rosterScanFiles.map((file,i)=>`<div class="rosterScanFileItem"><div><b>${i+1}</b><span>${esc(file?.name||`capture-${i+1}`)}</span><small>${Number(file?.size)>0?`${Math.max(1,Math.round(Number(file.size)/1024))} Ko`:""}</small></div><button type="button" data-roster-file-remove="${i}" aria-label="${esc(t("roster_scan_remove_row"))}" title="${esc(t("roster_scan_remove_row"))}">×</button></div>`).join("");
  list.querySelectorAll("[data-roster-file-remove]").forEach(btn=>btn.addEventListener("click",()=>{rosterScanFiles=removeRosterScanFile(rosterScanFiles,Number(btn.dataset.rosterFileRemove));rosterScanDraft=[];renderRosterScanFiles();renderRosterScanDraft()}));
}
$("#rosterScanFiles")?.addEventListener("change",e=>{
  const result=appendRosterScanFiles(rosterScanFiles,e.target.files,{limit:ROSTER_SCAN_FILE_LIMIT});
  rosterScanFiles=result.files;
  // Any queue change invalidates the previous OCR draft. Re-analysis always uses
  // the complete current queue, preventing stale first-capture results.
  if(result.added>0){rosterScanDraft=[];renderRosterScanDraft();const st=$("#rosterScanStatus");if(st){st.className="notice";st.textContent=t("roster_scan_reanalyze");st.classList.remove("hidden")}}
  // Android can return one screenshot per picker opening. Reset only the native
  // input so the next tap appends another image to our persistent queue.
  e.target.value="";
  renderRosterScanFiles();
});
$("#rosterScanAnalyzeBtn")?.addEventListener("click",async()=>{const status=$("#rosterScanStatus"),btn=$("#rosterScanAnalyzeBtn");if(!hasDeclaredAllianceCommandRole()){if(status){status.className="notice warn";status.textContent=managerOnlyMessage();status.classList.remove("hidden")}return}if(!rosterScanFiles.length){if(status){status.className="notice warn";status.textContent=t("roster_scan_choose_first");status.classList.remove("hidden")}return}if(!requireBetaAccess()||!requireBetaConsent())return;if(!cloudSession?.access_token){openDrawer("account");return}btn.disabled=true;const old=btn.textContent;btn.textContent=t("scan_processing");if(status){status.className="notice";status.textContent=t("roster_scan_processing",{count:rosterScanFiles.length});status.classList.remove("hidden")}try{let rows=[];for(let i=0;i<rosterScanFiles.length;i++){const image=await imageToDataUrl(rosterScanFiles[i]),r=await fetch("/api/scan",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({scan_type:"alliance_roster",locale:lang,image_data_url:image,current_state:state})}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||"scan_failed");rows=mergeRosterScanRows(rows,j.roster_rows||[]);if(status)status.textContent=t("roster_scan_progress",{done:i+1,total:rosterScanFiles.length,rows:rows.length})}rosterScanDraft=resolveCurrentRosterScanDraft(mergeRosterScanRows([],rows));renderRosterScanDraft();if(status){status.className="notice";status.textContent=t("roster_scan_ready",{count:rosterScanDraft.length})}}catch(e){if(status){status.className="notice warn";status.textContent=e?.message||t("scan_error")}}finally{btn.disabled=false;btn.textContent=old}});
$("#rosterScanImportBtn")?.addEventListener("click",()=>{const status=$("#rosterScanStatus");collectRosterScanDraftFromDom();if(rosterScanHasUnresolvedIdentity(rosterScanDraft)){if(status){status.className="notice warn";status.textContent=t("roster_identity_unresolved_block");status.classList.remove("hidden")}renderRosterScanDraft();return}const rows=mergeRosterScanRows([],rosterScanDraft).filter(x=>x.name);const complete=$("#rosterScanFullSnapshot")?.checked===true;const result=applyRosterRows(rows,{complete,status,source:"roster_scan"});if(result){rosterScanDraft=[];rosterScanFiles=[];if($("#rosterScanFiles"))$("#rosterScanFiles").value="";renderRosterScanFiles();if($("#rosterScanFullSnapshot"))$("#rosterScanFullSnapshot").checked=false;renderRosterScanDraft()}});

$("#rosterImportBtn")?.addEventListener("click",()=>{
  const status=$("#rosterImportStatus");if(!hasDeclaredAllianceCommandRole()){if(status){status.className="notice warn";status.textContent=managerOnlyMessage()}return}
  const now=new Date().toISOString(),complete=$("#rosterFullSnapshot")?.checked===true;
  const imported=parseRosterImport($("#rosterImportText")?.value||"",{now}).map(row=>({...row,server_id:state.player?.server_id||row.server_id||"",alliance_tag:state.alliance?.tag||row.alliance_tag||""}));
  if(!imported.length){if(status){status.className="notice warn";status.textContent=t("import_error")}return}
  const result=applyRosterRows(imported,{complete,status,source:"manual_import"});if(!result)return;
  if($("#rosterImportText"))$("#rosterImportText").value="";if($("#rosterFullSnapshot"))$("#rosterFullSnapshot").checked=false;
});
$("#eventImportBtn")?.addEventListener("click",()=>{const status=$("#eventImportStatus");if(!hasDeclaredAllianceCommandRole()){if(status){status.className="notice warn";status.textContent=managerOnlyMessage()}return}const parsed=parseParticipationImport($("#eventImportText")?.value||""),members=state.alliance.members||[];let applied=0,unmatched=0,ambiguous=0;for(const row of parsed.rows){const key=rosterNameKey(row.name||""),matches=members.filter(m=>rosterNameKey(m?.name||"")===key);if(matches.length!==1){if(matches.length>1)ambiguous++;else unmatched++;continue}const member=matches[0];member.activity_events=mergeActivityEvents(member.activity_events,[row]);member.updated_at=new Date().toISOString();applied++}if(!applied){if(status){status.className="notice warn";status.textContent=t("participation_import_none",{errors:parsed.errors.length,unmatched:unmatched+ambiguous})}return}state.alliance.updated_at=new Date().toISOString();state.sync.sources={...state.sync.sources,alliance:true};saveState();if(status){status.className="notice";status.textContent=t("participation_import_done",{count:applied,unmatched:unmatched+ambiguous,errors:parsed.errors.length})};if($("#eventImportText"))$("#eventImportText").value=""});

$("#shareInviteBtn").addEventListener("click",async()=>{const btn=$("#shareInviteBtn");if(!requireBetaAccess()||!requireBetaConsent())return;if(!["R4","R5"].includes(normalizedRole(state.player?.role))){inviteMessage(t("alliance_invite_manager_only"));return}if(!cloudSession?.access_token){inviteMessage(t("alliance_invite_connect"));openDrawer("account");return}const original=btn?.textContent;if(btn){btn.disabled=true;btn.textContent="…"}try{await syncAll();const rr=await fetch("/api/invite",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({name:state.alliance.name||state.alliance.tag||"WarBoost"})}),jj=await rr.json().catch(()=>({}));if(!rr.ok||!jj.invite_code)throw Object.assign(new Error(jj.message||jj.error||"invite_failed"),{code:jj.error||"invite_failed"});const code=jj.invite_code;state.alliance.id=jj.alliance?.id||state.alliance.id;state.alliance.server_id=jj.alliance?.server_id||state.player?.server_id||state.alliance.server_id;state.alliance.tag=jj.alliance?.tag||state.alliance.tag;state.alliance.name=jj.alliance?.name||state.alliance.name;state.alliance.invite_code=code;state.alliance.role=jj.role||state.alliance.role;state.alliance.management_verified=jj.scope_verified===true&&["R4","R5"].includes(normalizedRole(jj.role));state.vs.our_alliance=state.alliance.tag;state.sync.sources={...state.sync.sources,alliance:true};saveState();inviteMessage(t("alliance_invite_ready_scoped",{server:state.alliance.server_id||state.player?.server_id||"—",alliance:state.alliance.tag||"—"}),true);const url=`${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`,text=`WarBoost · ${t("server")} ${state.alliance.server_id||state.player?.server_id||"—"} · ${state.alliance.tag||"—"} · ${code}`;try{if(navigator.share)await navigator.share({title:`WarBoost · ${t("alliance")}`,text,url});else{await navigator.clipboard.writeText(`${text}\n${url}`);if(btn){btn.textContent=t("copy");setTimeout(()=>{btn.textContent=t("share")},1400)}}}catch{}}catch(e){const key={manager_role_required:"alliance_invite_manager_only",manager_roster_match_required:"alliance_manager_roster_match_required",manager_roster_role_required:"alliance_invite_manager_only",alliance_roster_identity_ambiguous:"alliance_roster_identity_ambiguous",lastwar_nickname_required:"lastwar_nickname_required",lastwar_server_required:"lastwar_server_required",lastwar_alliance_required:"lastwar_alliance_required",alliance_space_exists_invitation_required:"alliance_space_exists_invitation_required",alliance_owner_scope_conflict:"alliance_owner_scope_conflict",alliance_scope_ambiguous_admin_required:"alliance_scope_ambiguous_admin_required"}[e.code]||"alliance_invite_failed";inviteMessage(t(key))}finally{if(btn){btn.disabled=false;if(btn.textContent==="…")btn.textContent=original||t("share")}}});
async function joinPendingAlliance(){const code=String(state.alliance.invite_code||"").trim();if(!code||!state.player.name||!cloudSession?.access_token||!betaAccessAllowed()||!betaConsentAccepted())return false;try{const r=await fetch("/api/join",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({invite_code:code})}),j=await r.json().catch(()=>({}));if(!r.ok){const key={alliance_owner_switch_blocked:"alliance_owner_switch_blocked",invite_not_found:"alliance_invite_not_found",lastwar_identity_required:"lastwar_identity_required",lastwar_nickname_required:"lastwar_nickname_required",lastwar_server_required:"lastwar_server_required",lastwar_alliance_required:"lastwar_alliance_required",alliance_scope_not_ready:"alliance_scope_not_ready",alliance_server_mismatch:"alliance_server_mismatch",alliance_tag_mismatch:"alliance_tag_mismatch",alliance_roster_not_ready:"alliance_roster_not_ready",player_not_in_alliance_roster:"player_not_in_alliance_roster",alliance_roster_identity_ambiguous:"alliance_roster_identity_ambiguous",alliance_scope_ambiguous_admin_required:"alliance_scope_ambiguous_admin_required"}[j?.error]||"alliance_join_failed";inviteMessage(t(key));return false}if(j.alliance){state.alliance.id=j.alliance.id||state.alliance.id;state.alliance.server_id=j.alliance.server_id||state.player?.server_id||state.alliance.server_id;state.alliance.tag=j.alliance.tag||state.alliance.tag;state.alliance.name=j.alliance.name||state.alliance.name;state.alliance.role=j.membership?.role||"R1";state.alliance.management_verified=j.scope_verified===true&&["R4","R5"].includes(normalizedRole(state.alliance.role));state.vs.our_alliance=state.alliance.tag;state.sync.sources={...state.sync.sources,alliance:true};saveState();inviteMessage(t(j.already_member?"alliance_already_joined":"alliance_joined_scoped",{server:state.alliance.server_id||"—",alliance:state.alliance.tag||"—"}),true);return true}}catch{inviteMessage(t("alliance_join_failed"))}return false}
function handleJoinLink(){const code=new URLSearchParams(location.search).get("join");if(!code)return;state.alliance.invite_code=code.toUpperCase();localStorage.setItem(STORE_KEY,JSON.stringify(state));setTimeout(()=>openDrawer("account"),500)}


function supportStatusLabel(status){return t(`support_status_${String(status||"received")}`)}
function renderSupportAccess(){
  const logged=Boolean(cloudSession?.user),notice=$("#supportAuthNotice"),create=$("#supportCreateSection");
  if(notice)notice.classList.toggle("hidden",logged);
  if(create)create.classList.toggle("hidden",!logged);
  if(!logged&&$("#supportTickets"))$("#supportTickets").innerHTML=`<div class="privacyText">${esc(t("support_login_required"))}</div>`;
}
function supportTicketDate(iso){try{return new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"short"}).format(new Date(iso))}catch{return String(iso||"")}}
function renderSupportTickets(){
  const box=$("#supportTickets");if(!box)return;renderSupportAccess();if(!cloudSession?.user)return;
  if(!supportTicketsState.length){box.innerHTML=`<div class="privacyText">${esc(t("support_history_empty"))}</div>`;return}
  box.innerHTML=supportTicketsState.map(ticket=>{
    const msgs=(ticket.messages||[]).slice(-6).map(m=>`<div class="supportMessage ${m.author_kind==="support"?"support":""}"><b>${esc(m.author_kind==="support"?t("support_team"):t("support_you"))} · ${esc(supportTicketDate(m.created_at))}</b>${esc(m.body)}</div>`).join("");
    const attachment=ticket.attachment_path?`<button class="smallBtn supportAttachmentBtn" type="button" data-support-attachment="${esc(ticket.id)}">📎 ${esc(ticket.attachment_name||t("support_attachment_view"))}</button>`:"";
    return `<article class="supportTicket"><div class="supportTicketHead"><div><div class="supportTicketNo">${esc(ticket.ticket_no)}</div><div class="supportTicketSubject">${esc(ticket.subject)}</div><div class="supportTicketMeta">${esc(t(`support_cat_${ticket.category}`))} · ${esc(supportTicketDate(ticket.created_at))}</div></div><span class="supportStatus ${esc(ticket.status)}">${esc(supportStatusLabel(ticket.status))}</span></div>${attachment}<div class="supportMessages">${msgs}</div><div class="supportReplyRow"><input data-support-reply-input="${esc(ticket.id)}" maxlength="5000" placeholder="${esc(t("support_reply_placeholder"))}"/><button class="smallBtn" type="button" data-support-reply="${esc(ticket.id)}">${esc(t("support_reply"))}</button></div></article>`;
  }).join("");
  box.querySelectorAll("[data-support-reply]").forEach(btn=>btn.addEventListener("click",()=>replySupportTicket(btn.dataset.supportReply)));
  box.querySelectorAll("[data-support-attachment]").forEach(btn=>btn.addEventListener("click",()=>openSupportAttachment(btn.dataset.supportAttachment)));
}
function supportMessage(text,ok=false){const el=$("#supportStatus");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text;el.classList.remove("hidden")}
async function refreshSupportTickets(){
  if(!cloudSession?.access_token){supportTicketsState=[];renderSupportTickets();return}
  const btn=$("#supportRefreshBtn");if(btn)btn.disabled=true;
  try{const r=await fetch("/api/support",{cache:"no-store",headers:authHeaders()}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||"support_error");supportTicketsState=Array.isArray(j.tickets)?j.tickets:[];renderSupportTickets()}catch(e){supportMessage(e.message||t("support_error"))}finally{if(btn)btn.disabled=false}
}
async function supportImageData(file){
  if(!file)return null;if(!/^image\/(jpeg|png|webp)$/i.test(file.type||""))throw new Error(t("support_attachment_type"));
  const url=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=reject;x.src=url}),max=1280,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)),canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);const data=canvas.toDataURL("image/jpeg",.72);if(data.length>2.7*1024*1024)throw new Error(t("support_attachment_too_large"));return {data_url:data,name:String(file.name||"capture.jpg").replace(/\.[^.]+$/,".jpg").slice(0,160)}}finally{URL.revokeObjectURL(url)}
}
async function submitSupportTicket(){
  if(supportBusy)return;if(!cloudSession?.access_token){openDrawer("account");return}
  const subject=String($("#supportSubject")?.value||"").trim(),description=String($("#supportDescription")?.value||"").trim(),consent=$("#supportConsent")?.checked===true;
  if(subject.length<3||description.length<8)return supportMessage(t("support_fields_required"));if(!consent)return supportMessage(t("support_consent_required"));
  supportBusy=true;const btn=$("#supportSubmitBtn");if(btn){btn.disabled=true;btn.textContent=t("support_sending")}
  try{const file=$("#supportAttachment")?.files?.[0]||null,attachment=await supportImageData(file),drawer=document.querySelector(".drawer.open")?.id||"supportDrawer",diagnostics=$("#supportDiagnostics")?.checked!==false?{app_version:APP_VERSION,locale:lang,screen:drawer.replace(/Drawer$/,""),platform:navigator.platform||"",online:navigator.onLine}:{};const r=await fetch("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"create",category:$("#supportCategory")?.value||"other",subject,description,nickname:state?.player?.name||"",app_version:APP_VERSION,locale:lang,screen:drawer.replace(/Drawer$/,""),diagnostics,attachment_data_url:attachment?.data_url||null,attachment_name:attachment?.name||null})}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||t("support_error"));supportMessage(t("support_sent",{ticket:j.ticket?.ticket_no||""}),true);if($("#supportSubject"))$("#supportSubject").value="";if($("#supportDescription"))$("#supportDescription").value="";if($("#supportAttachment"))$("#supportAttachment").value="";await refreshSupportTickets()}catch(e){supportMessage(e.message||t("support_error"))}finally{supportBusy=false;if(btn){btn.disabled=false;btn.textContent=t("support_send")}}
}
async function replySupportTicket(ticketId){
  const input=[...document.querySelectorAll("[data-support-reply-input]")].find(x=>x.dataset.supportReplyInput===String(ticketId)),body=String(input?.value||"").trim();if(body.length<2)return;
  try{const r=await fetch("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"reply",ticket_id:ticketId,body,as_support:false})}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||t("support_error"));if(input)input.value="";await refreshSupportTickets()}catch(e){supportMessage(e.message||t("support_error"))}
}
async function openSupportAttachment(ticketId){try{const r=await fetch("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"attachment",ticket_id:ticketId})}),j=await r.json().catch(()=>({}));if(!r.ok||!j.url)throw new Error(j.message||j.error||t("support_error"));window.open(j.url,"_blank","noopener,noreferrer")}catch(e){supportMessage(e.message||t("support_error"))}}
$("#supportBtn")?.addEventListener("click",()=>{openDrawer("support");renderSupportAccess();refreshSupportTickets()});
$("#supportSubmitBtn")?.addEventListener("click",submitSupportTicket);
$("#supportRefreshBtn")?.addEventListener("click",refreshSupportTickets);

function proMessage(text,ok=false){const el=$("#proMessage");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text}
function renderCommercialPreview(){const box=$("#proCommercialPreview"),price=$("#commercialPreviewPrice"),note=$("#commercialPreviewNote");if(!box)return;box.classList.toggle("hidden",proState.beta===false);if(price)price.textContent=formatProPrice(proState.plan||{amount:499,currency:"eur"});if(note)note.textContent=t("commercial_preview_note")}
function renderPro(){const pill=$("#proPill"),btn=$("#proActionBtn"),title=$("#proTitle"),price=$("#proPrice"),section=$("#proSection");if(!pill||!btn)return;const logged=Boolean(cloudSession?.user),beta=proState.beta!==false;section?.classList.toggle("betaIncluded",beta);renderCommercialPreview();if(beta){pill.textContent=proState.active?t("beta_pro_short"):t("beta_badge");pill.classList.toggle("active",proState.active);title.textContent=proState.active?t("beta_pro_included"):t("beta_pro_title");if(!logged){price.textContent=t("beta_pro_signin");btn.textContent=t("login");btn.disabled=false;return}if(betaState.enforced&&!betaState.allowed){price.textContent=t("beta_invite_required");btn.textContent=t("beta_invite_short");btn.disabled=true;return}price.textContent=t("beta_pro_free");btn.textContent=t("beta_pro_included");btn.disabled=true;return}pill.textContent=proState.active?"PRO":t("free");pill.classList.toggle("active",proState.active);title.textContent=proState.active?t("pro_active"):t("upgrade");if(!logged){price.textContent=t("connect_for_pro");btn.textContent=t("login");btn.disabled=false;return}if(!proState.configured){price.textContent=t("pro_config");btn.textContent=t("pro_soon");btn.disabled=true;return}const formatted=formatProPrice(proState.plan);price.textContent=proState.active?t("subscription_active",{price:formatted}):formatted;btn.textContent=proState.active?t("manage_subscription"):t("go_pro");btn.disabled=!proState.payments_enabled}
async function refreshPro(){if(!cloudSession?.access_token){proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null};renderPro();return}try{const r=await fetch("/api/pro",{cache:"no-store",headers:authHeaders()}),j=await r.json().catch(()=>({}));if(r.ok)proState={active:Boolean(j.active),status:j.status||"free",configured:Boolean(j.configured),plan:j.plan||null,beta:j.beta!==false,payments_enabled:Boolean(j.payments_enabled),commercial_preview:Boolean(j.commercial_preview),subscription:j.subscription||null};else proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null}}catch{proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null}}renderPro()}
function requirePro(){if(proState.beta!==false){if(!requireBetaAccess()||!requireBetaConsent())return false;if(proState.active)return true;openDrawer("account");setTimeout(()=>$("#proSection")?.scrollIntoView({behavior:"smooth",block:"center"}),160);proMessage(cloudSession?.user?t("beta_invite_required"):t("connect_pro"));return false}if(proState.active)return true;openDrawer("account");setTimeout(()=>$("#proSection")?.scrollIntoView({behavior:"smooth",block:"center"}),160);proMessage(cloudSession?.user?t("pro_required"):t("connect_pro"));return false}
async function openProAction(){if(proState.beta!==false){proMessage(t("beta_payment_disabled"),true);return}if(!cloudSession?.user){openDrawer("account");return}if(!proState.payments_enabled){proMessage(t("commercial_payment_not_ready"));return}const btn=$("#proActionBtn"),original=btn?.textContent;if(btn){btn.disabled=true;btn.textContent="…"}try{const action=proState.active?"portal":"checkout",r=await fetch("/api/pro",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action})}),j=await r.json().catch(()=>({}));if(!r.ok||!/^https:\/\//i.test(String(j.url||"")))throw new Error(j.message||j.error||t("commercial_payment_not_ready"));location.href=j.url}catch(e){proMessage(e.message||t("commercial_payment_not_ready"))}finally{if(btn){btn.disabled=false;btn.textContent=original||t(proState.active?"manage_subscription":"go_pro")}}}
$("#betaConsent")?.addEventListener("change",async e=>{const key=betaConsentStorageKey();if(!key){e.target.checked=false;return}if(e.target.checked){localStorage.setItem(key,"1");if(cloudSession?.access_token&&betaAccessAllowed()){await pullServerState(safeClone(state));await pushServerState();await refreshPro()}}else localStorage.removeItem(key);render();renderBeta();renderPro()});
$("#betaFeedbackBtn")?.addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer("feedback")});
function betaFeedbackReport(){const kind=$("#betaFeedbackKind")?.value||"bug",message=String($("#betaFeedbackText")?.value||"").trim(),diagnostics=$("#betaFeedbackDiagnostics")?.checked!==false,drawer=document.querySelector(".drawer.open")?.id||"feedbackDrawer";const lines=[`WarBoost V${APP_VERSION} · ${t("beta_badge")}`,`${t("beta_feedback_kind")}: ${kind}`,message||t("beta_feedback_empty")];if(diagnostics)lines.push(`Diagnostics: version=${APP_VERSION}; locale=${lang}; screen=${drawer.replace(/Drawer$/,'')}; betaAccess=${betaState.access_status}; consent=${betaConsentAccepted()?"yes":"no"}`);return lines.join("\n")}
$("#betaFeedbackShareBtn")?.addEventListener("click",async()=>{const text=betaFeedbackReport(),status=$("#betaFeedbackStatus");try{if(navigator.share)await navigator.share({title:`WarBoost V${APP_VERSION} · ${t("beta_feedback_title")}`,text});else await navigator.clipboard.writeText(text);if(status){status.className="notice";status.textContent=navigator.share?t("beta_feedback_shared"):t("beta_feedback_copied")}}catch(e){if(e?.name!=="AbortError"&&status){status.className="notice warn";status.textContent=t("beta_feedback_failed")}}});

$("#voiceEnabled")?.addEventListener("change",e=>{localStorage.setItem(VOICE_ENABLED_KEY,e.target.checked?"1":"0");renderVoiceSettings()});
$("#voiceSelect")?.addEventListener("change",e=>{localStorage.setItem(VOICE_ID_KEY,e.target.value||"");refreshVoices()});
$("#voiceTestBtn")?.addEventListener("click",()=>speakGreeting("test",true));
if("speechSynthesis" in window){window.speechSynthesis.addEventListener?.("voiceschanged",refreshVoices);setTimeout(refreshVoices,100)}
$("#proActionBtn")?.addEventListener("click",openProAction);

$("#loginBtn")?.addEventListener("click",async()=>{
  if(!cloud)return authMessage(cloudAuthFailureMessage());
  const email=$("#authEmail").value.trim().toLowerCase(),password=$("#authPassword").value;
  if(!email||!password)return authMessage(t("auth_invalid"));
  setAuthBusy(true);
  try{
    const {error}=await cloud.auth.signInWithPassword({email,password});
    if(error){
      if(authNeedsEmailConfirmation(error)){revealEmailConfirmation(email);authMessage(t("auth_email_not_confirmed"));return}
      authMessage(authFriendlyError(error));return;
    }
    clearPendingAuthEmail();$("#otpBox")?.classList.add("hidden");authMessage(t("auth_success"),true);
  }catch{authMessage(t("auth_cloud_unreachable"))}
  finally{setAuthBusy(false)}
});
$("#forgotPasswordBtn")?.addEventListener("click",async()=>{
  if(!cloud)return authMessage(cloudAuthFailureMessage());
  const email=$("#authEmail").value.trim().toLowerCase();
  if(!email)return authMessage(t("password_reset_enter_email"));
  setAuthBusy(true);
  try{
    const redirectTo=cloudRecoveryRedirect||new URL("/reset-password.html",location.origin).toString();
    const {error}=await cloud.auth.resetPasswordForEmail(email,{redirectTo});
    if(error){authMessage(authFriendlyError(error));return}
    authMessage(t("password_reset_sent"),true);
  }catch{authMessage(t("auth_cloud_unreachable"))}
  finally{setAuthBusy(false)}
});
$("#signupBtn")?.addEventListener("click",async()=>{
  if(!cloud)return authMessage(cloudAuthFailureMessage());
  const email=$("#authEmail").value.trim().toLowerCase(),password=$("#authPassword").value;
  if(!email||password.length<6)return authMessage(t("auth_invalid"));
  setAuthBusy(true);
  try{
    const {data,error}=await cloud.auth.signUp({email,password});
    if(error){
      if(authNeedsEmailConfirmation(error)){revealEmailConfirmation(email);authMessage(t("auth_email_not_confirmed"));return}
      authMessage(authFriendlyError(error));return;
    }
    if(data?.session){clearPendingAuthEmail();$("#otpBox")?.classList.add("hidden");authMessage(t("auth_success"),true);return}
    revealEmailConfirmation(email);authMessage(t("signup_sent"),true);
  }catch{authMessage(t("auth_cloud_unreachable"))}
  finally{setAuthBusy(false)}
});
$("#verifyOtpBtn")?.addEventListener("click",async()=>{
  if(!cloud)return authMessage(cloudAuthFailureMessage());
  const email=pendingAuthEmail()||$("#authEmail").value.trim().toLowerCase(),token=$("#authOtp").value.replace(/\D/g,"");
  if(!email)return authMessage(t("auth_invalid"));
  if(token.length<6||token.length>8)return authMessage(t("otp_full"));
  setAuthBusy(true);
  try{
    const {error}=await cloud.auth.verifyOtp({email,token,type:"email"});
    if(error){authMessage(authFriendlyError(error));return}
    clearPendingAuthEmail();$("#otpBox")?.classList.add("hidden");if($("#authOtp"))$("#authOtp").value="";authMessage(t("email_confirmed"),true);
  }catch{authMessage(t("auth_cloud_unreachable"))}
  finally{setAuthBusy(false)}
});
$("#resendOtpBtn")?.addEventListener("click",async()=>{
  if(!cloud)return authMessage(cloudAuthFailureMessage());
  const email=$("#authEmail").value.trim().toLowerCase()||pendingAuthEmail();
  if(!email)return authMessage(t("auth_invalid"));
  setAuthBusy(true);
  try{
    const {error}=await cloud.auth.resend({email,type:"signup"});
    if(error){authMessage(authFriendlyError(error));return}
    revealEmailConfirmation(email);authMessage(t("auth_confirmation_resent"),true);
  }catch{authMessage(t("auth_cloud_unreachable"))}
  finally{setAuthBusy(false)}
});
$("#logoutBtn")?.addEventListener("click",async()=>{const signedOutUserId=String(cloudSession?.user?.id||"");if(signedOutUserId&&String(state?.player_id||"")===signedOutUserId)rememberAccountState(signedOutUserId,state);if(cloud)await cloud.auth.signOut();cloudSession=null;proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null};betaState={...betaState,allowed:false,access_status:"sign-in-required"};render();renderAuth();renderBeta()});

document.addEventListener("click",e=>{const btn=e.target.closest?.("[data-inline-hero-save]");if(!btn)return;e.preventDefault();e.stopPropagation();const container=btn.closest?.("[data-inline-confirm]");saveInlineHeroNames(btn.dataset.inlineHeroSave,container,btn)});
document.addEventListener("click",e=>{const btn=e.target.closest?.(".heroConfirmAction[data-hero-confirm]");if(!btn)return;e.preventDefault();e.stopPropagation();startHeroConfirmation(btn.dataset.heroConfirm)});
$("#saveHeroNamesBtn")?.addEventListener("click",saveHeroConfirmation);$("#skipHeroNamesBtn")?.addEventListener("click",skipHeroConfirmation);
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
handleJoinLink();applyLanguage();refreshServerTime();initCloudAuth();render();renderAuth();renderBeta();
