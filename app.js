import {LANGUAGES,resolveLanguage,localeFor,dirFor,translator} from "./i18n.js";
import {HERO_CATALOG,canonicalHeroName,canonicalExclusiveWeaponHeroName,isGenericHeroName,heroPresentation} from "./lib/heroes.js";
import {createEndgameCoachReport,deriveEndgameCoachHomeState,hasEndgameCoachProAccess} from "./lib/endgame-coach.js?v=qg35-home-visibility-v2-5-32-hf8-6-32-r1";
import {classifyAllianceMember,summarizeAllianceActivity,normalizeAllianceRole} from "./lib/alliance-activity.js";
import {canonicalShopStore} from "./lib/shop-catalog.js";
import {reconcileConfirmedSquad,repairLegacySquadIdentity,mergeConfirmedExclusiveWeaponPowers,backfillConfirmedHeroPowers,swapSquads,selectPrimarySquad,squadHasData,fixedHeroSlots,normalizeSquadSlots,confirmedCompositionForSquad} from "./lib/squad-identity.js";
import {recoverHeroData} from "./lib/hero-history.js";
import {parseRosterImport,rosterNameKey} from "./lib/roster-import.js";
import {applyRosterImportLifecycle,confirmRosterDeparture,restoreRosterReviewMember,removeActiveRosterMember,rosterLifecycleKey,currentActiveRosterMembers,normalizeRosterRemovalTombstones} from "./lib/alliance-roster-lifecycle.js";
import {repairSeasonState,seasonLifecycle,seasonIsActive,activeSeasonProgress} from "./lib/season-lifecycle.js";
import {createWarBoostSupabaseAuthClient} from "./lib/browser-auth.js";
import {formatGearSummary} from "./lib/gear.js";
import {ACTIVITY_EVENT_TYPES,PLAYER_ACTIVITY_EVENT_TYPES,activityEventId,mergeActivityEvents,confirmedActivityEvents,eventCountsByType,participationEventRecords,participationSummaryByType,parseParticipationImport} from "./lib/activity-events.js";
import {AVAILABILITY_EVENT_TYPES,normalizeEventAvailability,mergeEventAvailabilities,mergeAvailabilityHistory,availabilityForMember,upsertEventAvailability} from "./lib/event-availability.js";
import {backfillRosterIdentityContext,linkCurrentPlayerIdentityIntoRoster,rosterLinkSummary,dedupeRosterAccountLinks,normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag,normalizeUnlinkedAccounts,rebuildCanonicalPendingAccounts} from "./lib/alliance-identity.js";
import {invalidatePendingAccountCacheState} from "./lib/pending-account-cache.js";
import {mergeSharedAllianceRoster} from "./lib/shared-alliance-roster.js";
import {playerParticipationInsight,allianceParticipationOverview,allianceParticipationByEvent} from "./lib/alliance-participation-insights.js";
import {mergeVsState,scoreKnown,vsSituation,vsTrend,personalVsPosition,vsDecisionEngine,vsSnapshotFreshness} from "./lib/vs-live.js";
import {buildDesertStormPlan,DESERT_STORM_RULESET} from "./lib/desert-storm-plan.js";
import {renderDesertStormPlanInto} from "./lib/desert-storm-plan-ui.js?v=hf8630-desert-storm-plan-r2";
import {desertStormMemberKeys,normalizeDesertStormSelections,normalizeDesertStormSubstituteSelections,toggleDesertStormSelection} from "./lib/desert-storm-selection.js";
import {createIdleLifecycle} from "./lib/idle-lifecycle.js?v=hf8630-idle-resume-r1";
import {runAuthenticatedIdleResume} from "./lib/session-resume.js?v=hf8630-idle-resume-r1";
import {unlockDesertStormSearchInput} from "./lib/desert-storm-search.js";
import {desertStormMissionLabel} from "./lib/desert-storm-labels.js";
import {CANYON_STORM_RULESET,buildCanyonPlan,normalizeCanyonState,mergeCanyonState,clearCanyonPreparationSelection} from "./lib/canyon-storm-plan.js";
import {normalizeAvailabilityRecord,mergeAvailabilityRecords,countAvailabilitySlots,recommendBestSlot,availabilityCapacityRoster} from "./lib/alliance-availability-planner.js";
import {appendProgressionSnapshot,mergeProgressionSnapshots,progressionComparison,strongestSquadFromState} from "./lib/progression-history.js";
import {appendRosterScanFiles,removeRosterScanFile,DEFAULT_ROSTER_SCAN_FILE_LIMIT} from "./lib/roster-scan-queue.js";
import {cleanRosterOcrName,rosterIdentityKey,resolveRosterScanRows,confirmRosterScanPossibleMatch,rosterScanHasUnresolvedIdentity} from "./lib/roster-identity-resolution.js";
import {canonicalRosterMemberKey,previewAllianceRankChanges,applyAllianceRankChanges,permissionTransitions,rankManagementKey,confirmedCanonicalSelfRole} from "./lib/alliance-rank-management.js";
import {preferredRankEvidence,rankConfirmationStatus} from "./lib/rank-provenance.js";
import {savePendingSingleScan,loadPendingSingleScan,clearPendingSingleScan,savePendingRosterFiles,loadPendingRosterFiles,clearPendingRosterFiles,movePendingScans} from "./lib/pending-scan-storage.js";
import {hasMeaningfulCoreState,hydrateCloudState,mergeDesertStormState,desertStormSelectionSignature,canUseKeepaliveBody,betaStateAfterVerifiedStateRead} from "./lib/cloud-state-recovery.js";
import {readOwnProfileDirect} from "./lib/cloud-profile-direct.js";
import {shouldPreserveVerifiedSessionAccess,betaStateForSessionBootstrap,preserveAllowedAfterTransient,restoreAttemptSucceeded,canRevealOwnedPrivateState,deriveRuntimeAccessState} from "./lib/session-bootstrap.js";
import {canonicalPowerMillions} from "./lib/power-units.js";
import {parseHeroPower,confirmedHeroPower,heroPowerIsConfirmed} from "./lib/hero-power.js";
import {PENDING_AUTH_EMAIL_KEY,clearSignedOutAuthUi} from "./lib/auth-ui.js";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const APP_VERSION="2.5.32";
const RELEASE_LABEL="HF8.6.32"; // QG35+ home visibility and status-gated entry.
// Legacy HF8.6.27 verification marker: const RELEASE_LABEL="HF8.6.27"
// Legacy HF8.6.26 verification marker: const RELEASE_LABEL="HF8.6.26"
// Legacy HF8.6.26 render-contract verification markers (non-executable):
// function renderAdvice(){const access=runtimeAccessState()
// function renderProvider(){ const s=state.sync||{},sources=s.sources||{},pill=$("#providerPill"),box=$("#providerStatus"),access=runtimeAccessState()
// box.textContent=reveal?(s.pending_cloud_save?t("offline_keep"):t("safe_sync_note")):betaAccessMessage()
// Legacy HF8.6.25 verification marker: const RELEASE_LABEL="HF8.6.25"
// Legacy HF8.6.24 verification marker: const RELEASE_LABEL="HF8.6.24"
// Legacy HF8.6.24 access-contract verification markers retained verbatim:
// canRevealOwnedPrivateState({userId,stateOwnerId,betaAllowed:betaAccessAllowed(),consentAccepted:betaConsentAccepted(),betaAccessStatus:betaState?.access_status})
// function betaPrivateDataVisible(){const userId=String(cloudSession?.user?.id||""),stateOwnerId=String(state?.player_id||"");return canRevealOwnedPrivateState({userId,stateOwnerId,betaAllowed:betaAccessAllowed(),consentAccepted:betaConsentAccepted(),betaAccessStatus:betaState?.access_status})}
// Legacy advice-path marker: logged&&invited&&consented
// Legacy HF8.6.25 hydration-gate marker: cloudHydrationPending&&betaConsentAccepted()&&!betaPrivateDataVisible()
// Legacy HF8.6.23 verification marker: const RELEASE_LABEL="HF8.6.23"
// Legacy HF8.6.20 verification marker: const RELEASE_LABEL="HF8.6.20"
// Legacy HF8.6.21 verification marker: const RELEASE_LABEL="HF8.6.21"
// Legacy HF8.6.22 verification marker: const RELEASE_LABEL="HF8.6.22"
// Legacy privacy verification marker (new/different accounts still fail closed): betaState={...betaState,enforced:true,configured:true,allowed:false,access_status:"checking"}
// Legacy HF8.6.13 transient-access verification marker: allowed:definitive?false:previouslyVerified
// Legacy HF8.6.19 verification marker: const RELEASE_LABEL="HF8.6.19"
// HF8.6.19 legacy verification markers retained after bounded-fetch hardening:
// function betaPrivateDataVisible(){return Boolean(cloudSession?.user)&&betaAccessAllowed()&&betaConsentAccepted()}
// saveState();await syncAll();const joined=await joinPendingAlliance();if(joined)await syncAll()
// fetch("/api/pro" · fetch("/api/support"
// await syncAll();const rr=await fetch("/api/invite"
// fetchSessionCritical("/api/state",{cache:"no-store",headers:authHeaders()},12000) · stateTimeout=fastRestore?6500:12000
// fetchSessionCritical("/api/state",requestInit,12000) · keepalive?await fetch("/api/state",requestInit):await fetchSessionCritical
// Legacy verification marker: const RELEASE_LABEL="HF8.6.18"
// Legacy verification marker: const RELEASE_LABEL="HF8.6.17"
// Legacy verification marker: const RELEASE_LABEL="HF8.6.15"
// Legacy bounded-auth verification marker: code==="auth_network_unavailable"||code==="auth_request_timeout"
// Legacy verification marker: const RELEASE_LABEL="HF8.6.14" · Session Apply Unblock
// Legacy verification marker: RELEASE_LABEL="HF8.6.13" · Verified Cloud Access Restore
// Legacy VS scan verification marker: scanType option value="vs"
// Legacy release label verification markers: RELEASE_LABEL="HF8.6.3" · RELEASE_LABEL="HF8.6.4" · RELEASE_LABEL="HF8.6.6" · RELEASE_LABEL="HF8.6.7"
const STORE_KEY="warboost_v1_core_state", CLIENT_KEY="warboost_v1_client_id", LANG_KEY="warboost_v12_language";
const BACKUP_KEY="warboost_last_good_state", ACCOUNT_STATE_PREFIX="warboost_account_state:", VOICE_ENABLED_KEY="warboost_voice_enabled", VOICE_ID_KEY="warboost_voice_id";
const BETA_CONSENT_KEY="warboost_beta_consent_2026_09_05_safe_launch_v2", BETA_CONSENT_VERSION="2026-09-05-safe-launch-v2", PENDING_JOIN_CODE_KEY="warboost_pending_join_code";
const LEGACY_LANGUAGE_KEYS=["wb17_language","wb171_language","warboost_language"];
const LEGACY_DATA_KEYS=["wb12_account","wb11_account","wb10_profile","wb10_alliance","wb10_simple","wb10_roster","wb19_imported_players"];

function uid(){return crypto.randomUUID?.()||`wb-${Date.now()}-${Math.random().toString(16).slice(2)}`}
let volatileClientId="";
function clientId(){if(volatileClientId)return volatileClientId;try{let id=localStorage.getItem(CLIENT_KEY);if(!id){id=uid();localStorage.setItem(CLIENT_KEY,id)}volatileClientId=id;return id}catch{volatileClientId=uid();return volatileClientId}}
function safeLocalSet(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
function emptyHero(i){return {name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null}}
function emptySquad(i){return {id:i,name:`Squad ${i}`,power:null,last_confirmed_power:null,power_sync_status:"confirmed",updated_at:null,needs_rescan:false,composition_changed_at:null,composition_confirmed_at:null,composition_source:null,confirmed_composition:Array.from({length:5},()=>""),composition_conflict:null,heroes:Array.from({length:5},emptyHero)}}
function initialState(){return {version:APP_VERSION,player_id:clientId(),updated_at:null,player:{name:"",server_id:"",hq_level:null,power_m:null,coordinates:null,role:"R1",updated_at:null},player_context:{objective:"auto",account_age_days:null,server_profile:"auto",updated_at:null},activity_events:[],player_availability:[],availability_history:[],exclusive_weapons:[],hero_progression:[],hero_profiles:[],progression_snapshots:[],drone:{level:null,power_m:null,updated_at:null},shop:{store_type:"",currency:"",currency_balance:null,vip_level:null,vip_days_remaining:null,offers:[],snapshots:[],updated_at:null},squads:[1,2,3,4].map(emptySquad),alliance:{id:null,owner_player_id:null,server_id:"",tag:"",name:"",role:"R1",cloud_role_verified:false,management_verified:false,invite_code:"",members:[],roster_review:[],former_members:[],roster_removal_tombstones:[],event_availability:[],availability_history:[],roster_updated_at:null,roster_snapshot_complete_at:null,unlinked_accounts:[],identity_link_status:"unknown",desert_storm:{team:"A",battle_time:"",registered_keys:[],plan:null,availability_reset_at:null,updated_at:null},canyon:normalizeCanyonState({}),updated_at:null},vs:{week:null,day:null,theme:"",our_alliance:"",our_tag:"",our_server_id:"",opponent:"",opponent_tag:"",opponent_server_id:"",our_score:null,their_score:null,our_percent:null,their_percent:null,time_remaining_text:"",time_remaining_seconds:null,personal_name:"",personal_rank:null,personal_score:null,leaderboard:[],score_confirmed:false,snapshots:[],updated_at:null},season:{name:"",number:null,day:null,total_days:null,profession:"",progress_pct:null,resistance:null,focus:null,lifecycle:"unknown",lifecycle_source:null,ended_at:null,measured_hybrid_synergy:false,awakening_swap:null,updated_at:null},technology:{type_mastery_pct:null,hero_tech_pct:null,siege_to_seize_pct:null,defensive_fortification_pct:null,tactical_weapon_pct:null,updated_at:null},sync:{provider:"warboost-local",provider_kind:"local",access_status:"pending",capabilities:[],status:"local",last_sync:null,last_error:null,auto_ready:true,last_scan:null,official_last_sync:null,public_last_sync:null,sources:{official:false,public:false,scan:false,alliance:false}}}}
function canonicalStoredHeroName(v){return canonicalHeroName(v)}
function canonicalStoredExclusiveHeroName(row={}){return canonicalExclusiveWeaponHeroName(row?.hero_name,row?.weapon_name)}
function mergeExclusiveWeapons(baseList,incomingList){
  const out=Array.isArray(baseList)?baseList.map(x=>({...x,hero_name:canonicalStoredExclusiveHeroName(x)})):[];
  if(!Array.isArray(incomingList))return out;
  const keyOf=x=>String(canonicalStoredExclusiveHeroName(x)||x?.weapon_name||"").trim().toLowerCase();
  for(const item of incomingList){
    if(!item||typeof item!=="object")continue;
    const key=keyOf(item);
    if(!key)continue;
    const idx=out.findIndex(x=>keyOf(x)===key);
    const normalized={...item,hero_name:canonicalStoredExclusiveHeroName(item)};
    if(idx>=0){
      const old=out[idx],oldAt=Date.parse(old?.updated_at||"")||0,newAt=Date.parse(normalized?.updated_at||"")||0;
      const merged=newAt>=oldAt?{...old,...normalized}:{...normalized,...old};
      for(const field of ["weapon_name","level","power","power_raw","power_parse_status","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level","updated_at"]){
        if(normalized[field]===null||normalized[field]===undefined||normalized[field]==="")merged[field]=old[field];
      }
      if(confirmedHeroPower(old?.power)&&(!confirmedHeroPower(normalized.power)||oldAt>newAt))merged.power=old.power;
      merged.hero_name=canonicalStoredExclusiveHeroName(merged);
      out[idx]=merged;
    }
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
  for(const raw of Array.isArray(incomingList)?incomingList:[]){const n=normalize(raw);if(!n)continue;const key=n.hero_name.toLowerCase(),cur=out.get(key)||normalize({hero_name:n.hero_name});for(const f of fields){const nv=n?.[f];if(!hasValue(nv)||(f==="power"&&!confirmedHeroPower(nv)))continue;if(!hasValue(cur?.[f])||heroProfileFieldStamp(n,f)>=heroProfileFieldStamp(cur,f)){cur[f]=typeof structuredClone==="function"?structuredClone(nv):JSON.parse(JSON.stringify(nv));cur.field_updated_at[f]=n?.field_updated_at?.[f]||n.updated_at||cur.field_updated_at?.[f]||cur.updated_at||null;if(n?.field_source?.[f])cur.field_source[f]=n.field_source[f]}}if((Date.parse(n.updated_at||"")||0)>=(Date.parse(cur.updated_at||"")||0))cur.updated_at=n.updated_at||cur.updated_at||null;out.set(key,cur)}
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
function mergeHeroSlotIdentitySafe(baseHero={},incomingHero,{preferBase=false}={}){
  const b={...emptyHero(),...(baseHero||{}),name:canonicalStoredHeroName(baseHero?.name)};
  if(!incomingHero||typeof incomingHero!=="object")return b;
  const incomingName=canonicalStoredHeroName(incomingHero?.name),baseName=canonicalStoredHeroName(b.name);
  // V2.4.5: attributes never jump from the previous slot occupant to a new hero.
  if(incomingName&&baseName&&incomingName.toLowerCase()!==baseName.toLowerCase())return {...emptyHero(),...incomingHero,name:incomingName,power:confirmedHeroPower(incomingHero.power)};
  if(!incomingName)return b;
  const merged=preferBase?{...b,...safeFields(b,incomingHero,true)}:{...b,...incomingHero};
  merged.name=incomingName;
  const basePower=confirmedHeroPower(b.power),incomingPower=confirmedHeroPower(incomingHero.power);
  merged.power=preferBase?(basePower??incomingPower):(incomingPower??basePower);
  return merged;
}
function mergeSquadComposition(baseSquad={},incomingSquad={},preferBase=false){
  const base=confirmedCompositionForSquad(baseSquad),incoming=confirmedCompositionForSquad(incomingSquad);
  return preferBase?(base||incoming):(incoming||base);
}
function mergeSquadPayload(baseSquad={},incomingSquad,id,{preferBase=false}={}){
  const b=baseSquad||emptySquad(id);
  if(!incomingSquad)return normalizeSquadSlots({...b,power:canonicalPowerMillions(b.power),heroes:fixedHeroSlots(b.heroes)},id,{inferLegacy:true});
  const incomingPower=incomingSquad.power_m??incomingSquad.power,basePending=b.power_sync_status==="pending";
  const composition=mergeSquadComposition(b,incomingSquad,preferBase);
  const merged={
    ...b,...incomingSquad,id:Number(id),name:`Squad ${id}`,
    power:preferBase||basePending?b.power:canonicalPowerMillions(incomingPower),
    last_confirmed_power:canonicalPowerMillions(incomingSquad.last_confirmed_power??b.last_confirmed_power),
    power_sync_status:basePending?"pending":(incomingSquad.power_sync_status==="pending"?"pending":(heroPowerIsConfirmed(incomingPower)?(incomingSquad.power_sync_status||"confirmed"):b.power_sync_status||"unknown")),
    needs_rescan:preferBase?b.needs_rescan===true:incomingSquad.needs_rescan===true,
    composition_changed_at:(preferBase?b.composition_changed_at:null)||incomingSquad.composition_changed_at||b.composition_changed_at||null,
    confirmed_composition:composition||Array.from({length:5},()=>""),
    heroes:Array.from({length:5},(_,j)=>mergeHeroSlotIdentitySafe(b.heroes?.[j],incomingSquad.heroes?.[j],{preferBase}))
  };
  return normalizeSquadSlots(merged,id,{inferLegacy:false});
}
let pendingIdentityAliasesOwner="",pendingIdentityAliases=[];
function pendingIdentityAliasesFor(userId){return String(userId||"")===pendingIdentityAliasesOwner?pendingIdentityAliases:[]}
function collectPendingIdentityAliases(userId,...candidates){
  const owner=String(userId||"");
  return [...new Set(candidates.filter(candidate=>candidate&&String(candidate.player_id||"")===owner).map(candidate=>String(candidate.player?.name||"").trim()).filter(Boolean))];
}
function normalizeAlliancePendingState(input,currentPlayerAliases=[]){
  const alliance=input?.alliance||{},aliases=[...new Set([...(Array.isArray(currentPlayerAliases)?currentPlayerAliases:[]),...pendingIdentityAliasesFor(input?.player_id)].map(name=>String(name||"").trim()).filter(Boolean))],next=normalizeUnlinkedAccounts(alliance.unlinked_accounts,alliance.members,{serverId:alliance.server_id||input?.player?.server_id,allianceTag:alliance.tag,currentPlayerId:input?.player_id,currentPlayerName:input?.player?.name,currentPlayerAliases:aliases,identityLinkStatus:alliance.identity_link_status});
  const currentId=String(input?.player_id||"").trim(),scopeServer=normalizeServerId(alliance.server_id||input?.player?.server_id),scopeTag=normalizeAllianceTag(alliance.tag),canonicalSelf=currentId&&scopeServer&&scopeTag?(alliance.members||[]).find(member=>member?.warboost_linked===true&&String(member?.player_id||"").trim()===currentId&&normalizeServerId(member?.server_id)===scopeServer&&normalizeAllianceTag(member?.alliance_tag)===scopeTag):null;
  const old=Array.isArray(alliance.unlinked_accounts)?alliance.unlinked_accounts:[],nextPlayer=canonicalSelf?.name&&input?.player?.name!==canonicalSelf.name?{...input.player,name:canonicalSelf.name}:input?.player,changed=JSON.stringify(old)!==JSON.stringify(next)||nextPlayer!==input?.player;
  return changed?{state:{...input,player:nextPlayer,alliance:{...alliance,unlinked_accounts:next}},changed:true}:{state:input,changed:false};
}
function adoptCanonicalPendingAccounts(target,source,{available=false}={}){
  const playerId=String(source?.player_id||target?.player_id||"").trim(),aliases=[...pendingIdentityAliasesFor(playerId),...(String(target?.player_id||"").trim()===playerId?[target?.player?.name]:[])];
  const unlinked_accounts=available?rebuildCanonicalPendingAccounts(source,{currentPlayerId:playerId,currentPlayerAliases:aliases}):[];
  return {...target,alliance:{...(target?.alliance||{}),unlinked_accounts}};
}
function mergeState(base,incoming){if(!incoming||typeof incoming!=="object")return base;const out={...base,...incoming};out.player={...base.player,...incoming.player};out.player.power_m=canonicalPowerMillions(out.player.power_m);out.player_context={...(base.player_context||{}),...(incoming.player_context||{})};out.activity_events=mergeActivityEvents(base.activity_events,incoming.activity_events);out.player_availability=mergeEventAvailabilities(base.player_availability,incoming.player_availability);out.availability_history=mergeAvailabilityHistory(base.availability_history,incoming.availability_history);out.drone={...base.drone,...incoming.drone};out.drone.power_m=canonicalPowerMillions(out.drone.power_m);out.shop=mergeShopState(base.shop,incoming.shop);out.alliance={...base.alliance,...incoming.alliance};out.alliance.members=mergeAllianceMembersProtected(base.alliance?.members,incoming.alliance?.members,false);out.alliance.unlinked_accounts=normalizeUnlinkedAccounts(out.alliance.unlinked_accounts,out.alliance.members,{serverId:out.alliance.server_id||out.player?.server_id,allianceTag:out.alliance.tag,currentPlayerId:out.player_id,currentPlayerName:out.player?.name,currentPlayerAliases:String(base.player_id||"")===String(out.player_id||"")?[base.player?.name]:[],identityLinkStatus:out.alliance.identity_link_status});out.alliance.former_members=[];out.alliance.roster_removal_tombstones=normalizeRosterRemovalTombstones([...(base.alliance?.roster_removal_tombstones||[]),...(incoming.alliance?.roster_removal_tombstones||[]),...(base.alliance?.former_members||[]),...(incoming.alliance?.former_members||[])]);out.alliance.event_availability=mergeEventAvailabilities(base.alliance?.event_availability,incoming.alliance?.event_availability,...out.alliance.members.map(x=>x.event_availability||[]));out.alliance.availability_history=mergeAvailabilityHistory(base.alliance?.availability_history,incoming.alliance?.availability_history,...out.alliance.members.map(x=>x.availability_history||[]));out.alliance.desert_storm=mergeDesertStormState(base.alliance?.desert_storm,incoming.alliance?.desert_storm);out.alliance.canyon=mergeCanyonState(base.alliance?.canyon,incoming.alliance?.canyon);out.vs=mergeVsState(base.vs,incoming.vs);out.season=repairSeasonState({...base.season,...incoming.season});out.technology={...(base.technology||{}),...(incoming.technology||{})};out.exclusive_weapons=mergeExclusiveWeapons(base.exclusive_weapons,incoming.exclusive_weapons);out.hero_progression=mergeHeroProgression(base.hero_progression,incoming.hero_progression);out.hero_profiles=mergeHeroProfiles(base.hero_profiles,incoming.hero_profiles);out.progression_snapshots=mergeProgressionSnapshots(base.progression_snapshots,incoming.progression_snapshots);out.sync={...base.sync,...incoming.sync,sources:{...base.sync.sources,...incoming.sync?.sources}};out.squads=Array.from({length:4},(_,i)=>mergeSquadPayload(base.squads?.[i]||emptySquad(i+1),incoming.squads?.[i],i+1));out.version=APP_VERSION;return out}
function hasValue(v){return !(v===null||v===undefined||v===""||(Array.isArray(v)&&v.length===0))}
function safeFields(base={},incoming={},preferBase=false){const out={...base};for(const [k,v] of Object.entries(incoming||{})){if(!hasValue(v))continue;if(preferBase&&hasValue(out[k]))continue;out[k]=v}return out}
function allianceMemberKey(m){const id=String(m?.player_id||"").trim();if(id)return `id:${id}`;const name=String(m?.name||"").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");return name?`name:${name}`:""}
function confirmedRankTimestamp(m){const stamp=Date.parse(String(m?.rank_confirmed_at||""));return Number.isFinite(stamp)?stamp:0}
function mergeAllianceMembersProtected(baseList,incomingList,preferBase=false){const out=[],index=new Map(),add=(raw,preferExisting)=>{if(!raw||typeof raw!=="object")return;const key=allianceMemberKey(raw);if(!key)return;const normalized={...raw,activity_events:mergeActivityEvents(raw.activity_events)};const i=index.get(key);if(i===undefined){index.set(key,out.length);out.push(normalized);return}const old=out[i],winner=preferExisting?safeFields(old,normalized,true):safeFields(old,normalized,false),rankWinner=preferredRankEvidence(old,normalized);winner.player_id=old.player_id||normalized.player_id||null;winner.name=normalized.name||old.name||"";winner.activity_events=mergeActivityEvents(old.activity_events,normalized.activity_events);winner.role=rankWinner.role||old.role||normalized.role||"R1";winner.management_role=rankWinner.management_role||old.management_role||normalized.management_role||"R1";winner.rank_confirmed_at=rankWinner.rank_confirmed_at||null;winner.rank_confirmed_source=rankWinner.rank_confirmed_source||null;winner.rank_confirmation_status=rankConfirmationStatus(rankWinner);if(confirmedRankTimestamp(rankWinner)>0)winner.updated_at=rankWinner.updated_at||winner.updated_at;out[i]=winner};for(const m of Array.isArray(baseList)?baseList:[])add(m,false);for(const m of Array.isArray(incomingList)?incomingList:[])add(m,preferBase);return out.slice(0,300)}
function mergeStateProtected(base,incoming,{preferBase=false}={}){
  if(!incoming||typeof incoming!=="object")return mergeState(initialState(),base);
  const out=mergeState(base,incoming);
  out.player=safeFields(base.player,incoming.player,preferBase);
  out.player_context=safeFields(base.player_context||{},incoming.player_context||{},preferBase);
  out.player_availability=mergeEventAvailabilities(base.player_availability,incoming.player_availability);
  out.availability_history=mergeAvailabilityHistory(base.availability_history,incoming.availability_history);
  out.activity_events=mergeActivityEvents(base.activity_events,incoming.activity_events);
  out.drone=safeFields(base.drone,incoming.drone,preferBase);
  out.shop=mergeShopState(base.shop,incoming.shop);if(preferBase){out.shop={...out.shop,...base.shop,offers:base.shop?.offers||[],snapshots:out.shop.snapshots||base.shop?.snapshots||[]};}
   out.alliance=safeFields(base.alliance,incoming.alliance,preferBase);out.alliance.event_availability=mergeEventAvailabilities(base.alliance?.event_availability,incoming.alliance?.event_availability,...(out.alliance.members||[]).map(x=>x.event_availability||[]));out.alliance.availability_history=mergeAvailabilityHistory(base.alliance?.availability_history,incoming.alliance?.availability_history,...(out.alliance.members||[]).map(x=>x.availability_history||[]));out.alliance.desert_storm=mergeDesertStormState(base.alliance?.desert_storm,incoming.alliance?.desert_storm);out.alliance.canyon=mergeCanyonState(base.alliance?.canyon,incoming.alliance?.canyon);out.alliance.members=mergeAllianceMembersProtected(base.alliance?.members,incoming.alliance?.members,preferBase);out.alliance.unlinked_accounts=normalizeUnlinkedAccounts(out.alliance.unlinked_accounts,out.alliance.members,{serverId:out.alliance.server_id||out.player?.server_id,allianceTag:out.alliance.tag,currentPlayerId:out.player_id,currentPlayerName:out.player?.name,currentPlayerAliases:String(base.player_id||"")===String(out.player_id||"")?[base.player?.name]:[],identityLinkStatus:out.alliance.identity_link_status});
  out.vs=mergeVsState(base.vs,incoming.vs);if(preferBase)out.vs={...out.vs,...safeFields(incoming.vs,base.vs,false),snapshots:out.vs.snapshots||base.vs?.snapshots||[]};out.season=safeFields(base.season,incoming.season,preferBase);out.technology=safeFields(base.technology||{},incoming.technology||{},preferBase);out.hero_progression=mergeHeroProgression(base.hero_progression,incoming.hero_progression);out.hero_profiles=mergeHeroProfiles(base.hero_profiles,incoming.hero_profiles);out.progression_snapshots=mergeProgressionSnapshots(base.progression_snapshots,incoming.progression_snapshots);
  out.sync={...base.sync,...safeFields(base.sync,incoming.sync,preferBase),sources:{...base.sync?.sources,...incoming.sync?.sources}};
  out.squads=Array.from({length:4},(_,i)=>{
    const b=base.squads?.[i]||emptySquad(i+1),n=incoming.squads?.[i];
    if(!n)return normalizeSquadSlots({...b,heroes:fixedHeroSlots(b.heroes)},i+1,{inferLegacy:true});
    const merged=mergeSquadPayload(b,n,i+1,{preferBase});
    return normalizeSquadSlots({...merged,...safeFields({},n,preferBase),id:i+1,name:`Squad ${i+1}`,confirmed_composition:mergeSquadComposition(b,n,preferBase)||merged.confirmed_composition,heroes:merged.heroes},i+1,{inferLegacy:false});
  });
   out.exclusive_weapons=mergeExclusiveWeapons(base.exclusive_weapons,incoming.exclusive_weapons);const restored=backfillConfirmedHeroPowers(out,{now:new Date().toISOString()});restored.state.version=APP_VERSION;return restored.state
}
function preservePendingRoster(local={},remote={}){
  if(local?.alliance?.roster_sync_status!=="pending")return remote;
  const localMembers=Array.isArray(local?.alliance?.members)?local.alliance.members:[],remoteMembers=Array.isArray(remote?.alliance?.members)?remote.alliance.members:[];
  if(localMembers.length<=remoteMembers.length)return remote;
  return {...remote,alliance:{...remote.alliance,members:localMembers,roster_review:Array.isArray(local.alliance.roster_review)?local.alliance.roster_review:remote.alliance?.roster_review||[],former_members:[],roster_removal_tombstones:normalizeRosterRemovalTombstones([...(local.alliance.roster_removal_tombstones||[]),...(remote.alliance?.roster_removal_tombstones||[]),...(local.alliance.former_members||[]),...(remote.alliance?.former_members||[])]),roster_snapshot_complete_at:local.alliance.roster_snapshot_complete_at||remote.alliance?.roster_snapshot_complete_at||null,roster_sync_status:"pending",roster_sync_error:local.alliance.roster_sync_error||null}};
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
function hasMeaningfulCore(x){return hasMeaningfulCoreState(x)}
function canonicalSelfRosterMember(members=state.alliance?.members){
  const userId=String(state?.player_id||cloudSession?.user?.id||"").trim();
  return userId?(Array.isArray(members)?members:[]).find(member=>member?.warboost_linked===true&&String(member?.player_id||"").trim()===userId)||null:null;
}
function canonicalPlayerDisplayName(){
  return String(canonicalSelfRosterMember()?.name||state?.player?.name||"").trim();
}
function reconcileCurrentPlayerAllianceIdentity({touch=false}={}){
  const canonical=canonicalSelfRosterMember(),name=canonical?.name||state.player?.name;
  const result=linkCurrentPlayerIdentityIntoRoster(state.alliance?.members,{playerId:state.player_id,name,serverId:state.player?.server_id,allianceTag:state.alliance?.tag,activityEvents:state.activity_events,updatedAt:touch?new Date().toISOString():(state.updated_at||new Date().toISOString())});
  if(canonical?.name&&state.player?.name!==canonical.name)state.player={...state.player,name:canonical.name};
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
  if(Array.isArray(roster)&&roster.length&&!(out.alliance.members||[]).length){out.alliance.members=roster.slice(0,100).map(m=>({name:String(m?.name||'').trim(),role:legacyRole(m?.rank)||'R1',power_m:Number(m?.power)||0,updated_at:null})).filter(m=>m.name);out.migration={...(out.migration||{}),legacy_local_roster_capped_at_100:roster.length>=100};changed=Boolean(out.alliance.members.length)||changed}
  if(changed){out.updated_at=out.updated_at||new Date().toISOString();out.migration={...(out.migration||{}),legacy_local_imported_at:new Date().toISOString(),legacy_keys:LEGACY_DATA_KEYS.filter(k=>localStorage.getItem(k)!==null)}}
  out.version=APP_VERSION;return {state:out,changed};
}
function recoverLocalHeroHistory(input){const legacyProfile=readLegacyJson("wb10_profile")||null,legacyImportedPlayers=readLegacyJson("wb19_imported_players")||[];return recoverHeroData(input,{legacyProfile,legacyImportedPlayers,currentPlayerName:input?.player?.name||""});}
function invalidateStoredPendingAccountCaches(){
  const keys=[];
  try{
    keys.push(STORE_KEY,BACKUP_KEY);
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(ACCOUNT_STATE_PREFIX))keys.push(key)}
  }catch{}
  for(const key of keys){
    try{
      const raw=localStorage.getItem(key);if(!raw)continue;
      const {value,changed}=invalidatePendingAccountCacheState(JSON.parse(raw),{nestedState:key===BACKUP_KEY});
      if(changed)localStorage.setItem(key,JSON.stringify(value));
    }catch{}
  }
}
invalidateStoredPendingAccountCaches();
function loadState(){try{const raw=localStorage.getItem(STORE_KEY);const parsed=raw?JSON.parse(raw):null;if(parsed&&hasMeaningfulCore(parsed))rememberLastGoodState(parsed,"pre-v2.5.28-load");const base=parsed?mergeState(initialState(),parsed):initialState();const migrated=migrateLegacyLocalState(base),repaired=repairLegacySquadIdentity(migrated.state),recovered=recoverLocalHeroHistory(repaired.state),finalRepair=repairLegacySquadIdentity(recovered.state),restored=backfillConfirmedHeroPowers(finalRepair.state),pendingRepair=normalizeAlliancePendingState(restored.state);let next=pendingRepair.state;const backup=readLastGoodState();if(!hasMeaningfulCore(next)&&hasMeaningfulCore(backup))next=mergeStateProtected(next,backup,{preferBase:false});next.version=APP_VERSION;if(migrated.changed||repaired.changed||recovered.changed||finalRepair.changed||restored.changed||pendingRepair.changed||!raw)localStorage.setItem(STORE_KEY,JSON.stringify(next));rememberLastGoodState(next,"post-v2.5.28-load");return next}catch{const backup=readLastGoodState();return hasMeaningfulCore(backup)?mergeState(initialState(),backup):initialState()}}

let state=loadState(),serverNow=new Date(),pushTimer=null,cloudRetryTimer=null,cloudPullRetryTimer=null,cloudDirty=false,cloudRevision=null,suppressPush=false,cloudHydrationPending=false,cloudProfileVerified=false,canonicalRosterReady=false,cloud=null,cloudSession=null,cloudRecoveryRedirect="",cloudDataConfig={url:"",key:""},sessionApplyInFlight=null,lastAppliedSessionKey="",runtimeReconcileInFlight=null,lastRuntimeReconcileAt=0,cloudInit={status:"starting",configured:false,transport:"direct-supabase-auth-api",error:null},proState={active:false,status:"free",configured:false,plan:null,beta:false,payments_enabled:false,commercial_preview:false,subscription:null},betaState={release:true,enforced:false,configured:false,allowed:false,access_status:"sign-in-required",consent_version:BETA_CONSENT_VERSION,payments_enabled:false,pro_included:true},scanImageData=null,scanImageName="capture.jpg",supportTicketsState=[],supportBusy=false;
let foregroundClockInterval=null,foregroundServerTimeInterval=null,foregroundPausedAt=null,idleResumeInFlight=null,idleResumeStatusTimer=null,idleLifecycle=null;
let runtimeReconcileInFlightForce=false;
let bootstrapDiagnostics={run_id:"",started_at:null,finished_at:null,status:"idle",stages:[]};
function bootstrapNow(){return typeof performance!=="undefined"&&performance.now?performance.now():Date.now()}
function resetBootstrapDiagnostics(reason="session"){bootstrapDiagnostics={run_id:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,started_at:new Date().toISOString(),finished_at:null,status:reason,stages:[]};return bootstrapDiagnostics}
function pushBootstrapStage(stage,ms,status="ok",error=null,source="browser"){const entry={stage:String(stage||"UNKNOWN").slice(0,48),ms:Math.max(0,Math.round(Number(ms)||0)),status:String(status||"ok").slice(0,16),error:error?String(error).slice(0,80):null,source};bootstrapDiagnostics.stages.push(entry);if(bootstrapDiagnostics.stages.length>32)bootstrapDiagnostics.stages=bootstrapDiagnostics.stages.slice(-32);return entry}
async function runBootstrapStage(stage,fn){const started=bootstrapNow();try{const value=await fn();const failed=value&&value.ok===false&&!value.cloud_empty;pushBootstrapStage(stage,bootstrapNow()-started,failed?"error":"ok",failed?(value.error||"failed"):null);return value}catch(error){pushBootstrapStage(stage,bootstrapNow()-started,"error",error?.code||error?.name||"error");throw error}}
function appendServerRestoreTrace(trace){for(const entry of Array.isArray(trace)?trace:[]){pushBootstrapStage(entry?.stage||"SERVER",entry?.ms||0,entry?.status||"ok",entry?.error||null,"server")}}
function finishBootstrapDiagnostics(status="done"){bootstrapDiagnostics.status=status;bootstrapDiagnostics.finished_at=new Date().toISOString()}
function compactBootstrapDiagnostics(){return {release:RELEASE_LABEL,run_id:bootstrapDiagnostics.run_id,status:bootstrapDiagnostics.status,started_at:bootstrapDiagnostics.started_at,finished_at:bootstrapDiagnostics.finished_at,stages:(bootstrapDiagnostics.stages||[]).slice(-16)}}
function lastBootstrapFailure(){return [...(bootstrapDiagnostics.stages||[])].reverse().find(x=>x.status==="error")||null}
function safeRenderStep(stage,fn){
  try{return fn()}
  catch(error){
    const code=String(error?.message||error?.name||"render_error").slice(0,80);
    pushBootstrapStage(`RENDER_${String(stage||"UNKNOWN").slice(0,32)}`,0,"error",code,"browser");
    try{console.error(`[WarBoost render] ${stage}`,error)}catch{}
    return null;
  }
}
let criticalUiRepaintGeneration=0;
function criticalUiRepaintPass(label="NOW"){
  // HF8.6.28: paint every access-sensitive surface from the SAME current runtime contract.
  // This pass is intentionally idempotent and safe to repeat while Android/WebView settles a session.
  safeRenderStep(`CRITICAL_ADVICE_${label}`,renderAdvice);
  safeRenderStep(`CRITICAL_PROVIDER_${label}`,renderProvider);
  safeRenderStep(`CRITICAL_PLAYER_ACTIVITY_${label}`,renderPlayerActivity);
  if(betaPrivateDataVisible()){
    safeRenderStep(`CRITICAL_SEASON_ACCESS_${label}`,renderSeasonAccess);
    if(document.querySelector("#seasonDrawer.open"))safeRenderStep(`CRITICAL_SEASON_SUMMARY_${label}`,()=>renderSeasonCoreSummary(state.season));
    if(document.querySelector("#playerDrawer.open")){
      safeRenderStep(`CRITICAL_PLAYER_CORE_${label}`,()=>renderPlayerCoreSummary(state.player,state.drone||{}));
      safeRenderStep(`CRITICAL_PLAYER_ACTIVITY_OPEN_${label}`,renderPlayerActivity);
    }
    if(document.querySelector("#allianceDrawer.open")){safeRenderStep(`CRITICAL_DESERT_STORM_${label}`,renderDesertStormPlanner);safeRenderStep(`CRITICAL_CANYON_${label}`,renderCanyonPlanner)}
  }
}
function queueCriticalUiRepaint(){
  // A single requestAnimationFrame proved insufficient on some Android devices: the browser could
  // paint the transient CHECKING state and never repaint the small independent surfaces afterward.
  // Run immediately, then repeat after the session/event loop has settled. Newer calls cancel old passes.
  const generation=++criticalUiRepaintGeneration;
  const run=label=>{if(generation!==criticalUiRepaintGeneration)return;criticalUiRepaintPass(label)};
  run("NOW");
  try{requestAnimationFrame(()=>run("RAF"))}catch{}
  setTimeout(()=>run("T120"),120);
  setTimeout(()=>run("T500"),500);
  setTimeout(()=>run("T1500"),1500);
}
function pendingJoinCode(){try{return String(localStorage.getItem(PENDING_JOIN_CODE_KEY)||"").trim().toUpperCase()}catch{return ""}}
function rememberPendingJoinCode(code){const clean=String(code||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,80);if(clean)safeLocalSet(PENDING_JOIN_CODE_KEY,clean);return clean}
function clearPendingJoinCode(){try{localStorage.removeItem(PENDING_JOIN_CODE_KEY)}catch{}}
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
if(!(state.progression_snapshots||[]).length&&hasMeaningfulCore(state))state.progression_snapshots=appendProgressionSnapshot([],state,{source:"baseline",at:state.updated_at||new Date().toISOString()});
let desertStormSearchTerm="",desertStormSearchRenderGeneration=0,canyonSearchTerm="",canyonSearchRenderGeneration=0,canyonActiveTab="preparation",allianceEventActive="desert_storm",allianceEventDetailOpen=false,allianceEventDetailHistory=false,allianceEventDetailScrollTop=0,allianceEventDetailLastFocus=null;
function resetAllianceAccordions(){
  const drawer=$("#allianceDrawer");if(!drawer)return;
  drawer.querySelectorAll("details[data-alliance-accordion]").forEach(detail=>{detail.open=false;detail.classList.remove("is-open")});
  drawer.querySelectorAll(".allianceAccordionChevron").forEach(chevron=>{chevron.textContent="▾"});
}
function handleAllianceAccordionToggle(detail){
  if(!detail?.matches?.("details[data-alliance-accordion]"))return;
  const drawer=$("#allianceDrawer"),top=drawer?.scrollTop||0;
  detail.classList.toggle("is-open",detail.open);
  const chevron=detail.querySelector(":scope > .allianceAccordionSummary .allianceAccordionChevron");
  if(chevron)chevron.textContent=detail.open?"▴":"▾";
  if(detail.open){
    drawer?.querySelectorAll("details[data-alliance-accordion]").forEach(other=>{if(other!==detail){other.open=false;other.classList.remove("is-open");const otherChevron=other.querySelector(":scope > .allianceAccordionSummary .allianceAccordionChevron");if(otherChevron)otherChevron.textContent="▾"}});
  }
  requestAnimationFrame(()=>{if(drawer)drawer.scrollTop=top});
}
function bindAllianceAccordions(){
  const drawer=$("#allianceDrawer");if(!drawer)return;
  drawer.querySelectorAll("details[data-alliance-accordion]").forEach(detail=>{
    if(detail.dataset.accordionBound==="true")return;
    detail.dataset.accordionBound="true";
    detail.addEventListener("toggle",()=>handleAllianceAccordionToggle(detail));
  });
}
let alliancePlayerModalScrollTop=0,alliancePlayerModalHistory=false,alliancePlayerModalLastFocus=null,alliancePlayerModalBodyStyles=null;
let rosterScanFiles=[],rosterScanDraft=[],desertStormRoleResyncPromise=null,desertStormRoleResyncAttempted=false,rankManagerRoleResyncPromise=null,rosterDiagnosticPromise=null,rosterDiagnostic={status:"idle",source:"unknown",canonical_count:null,cloud_member_count:null,link_status:"unknown",link_candidates:[],account_identity:null,at:0};
let recentlyGeneratedDesertStormPlan=null;
let rankManagerSearchTerm="",rankChangeDraft=new Map(),rankManagerSearchRenderGeneration=0,sharedRosterLinkPromise=null;
function searchInputIsContentEditable(input){return Boolean(input?.isContentEditable||input?.getAttribute?.("contenteditable")==="plaintext-only")}
function searchInputValue(input){return searchInputIsContentEditable(input)?String(input.textContent||""):String(input?.value||"")}
function preserveSearchInput(input,value){
  if(!input||input===document.activeElement)return;
  const next=String(value??"");
  if(searchInputIsContentEditable(input)){if(input.textContent!==next)input.textContent=next;return}
  if(input.value!==next)input.value=next;
}
function searchSelection(input){
  if(!input||input!==document.activeElement)return null;
  return {start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
}
function restoreSearchSelection(input,selection){
  if(!input||!selection||input!==document.activeElement||typeof input.setSelectionRange!=="function")return;
  try{input.setSelectionRange(selection.start,selection.end,selection.direction||"none")}catch{}
}
function scheduleAllianceRankSearchRender(){
  const generation=++rankManagerSearchRenderGeneration,run=()=>{if(generation===rankManagerSearchRenderGeneration)renderAllianceRankManager()};
  if(typeof requestAnimationFrame==="function")requestAnimationFrame(run);else setTimeout(run,0);
}
function scheduleDesertStormSearchRender(){
  const generation=++desertStormSearchRenderGeneration,run=()=>{if(generation===desertStormSearchRenderGeneration)renderDesertStormPicker()};
  if(typeof requestAnimationFrame==="function")requestAnimationFrame(run);else setTimeout(run,0);
}
function scheduleCanyonSearchRender(){
  const generation=++canyonSearchRenderGeneration,run=()=>{if(generation===canyonSearchRenderGeneration)renderCanyonAvailability()};
  if(typeof requestAnimationFrame==="function")requestAnimationFrame(run);else setTimeout(run,0);
}
const ROSTER_SCAN_FILE_LIMIT=DEFAULT_ROSTER_SCAN_FILE_LIMIT;
reconcileCurrentPlayerAllianceIdentity();
let voiceGreetedSections=new Set(),availableVoices=[];
const openRosterRoles=new Set();
let pendingHeroSquadId=null,pendingHeroSuggestions=[],pendingHeroScanSlots=[],pendingExclusiveScan=[];
function pendingScanOwner(session=cloudSession){const userId=String(session?.user?.id||"").trim();return userId?`user:${userId}`:`device:${clientId()}`}
function resetPendingScanUi(){scanImageData=null;scanImageName="capture.jpg";rosterScanFiles=[];rosterScanDraft=[];pendingExclusiveScan=[];const f=$("#scanFile"),p=$("#scanPreview"),clear=$("#clearScanCaptureBtn"),panel=$("#exclusiveConfirmPanel");if(f)f.value="";if(p){p.removeAttribute("src");p.classList.add("hidden")}if(clear)clear.classList.add("hidden");if(panel)panel.classList.add("hidden");const rf=$("#rosterScanFiles");if(rf)rf.value="";renderRosterScanFiles();renderRosterScanDraft()}
async function restorePendingScans(){const owner=pendingScanOwner();try{const pending=await loadPendingSingleScan(owner);if(pending?.image_data_url){scanImageData=pending.image_data_url;scanImageName=pending.name||"capture.jpg";renderScanTypeOptions();const type=$("#scanType");if(type&&[...type.options].some(o=>o.value===pending.scan_type))type.value=pending.scan_type;updateSquadCaptureHelp(type?.value||"profile");const preview=$("#scanPreview"),clear=$("#clearScanCaptureBtn"),status=$("#scanStatus");if(preview){preview.src=scanImageData;preview.classList.remove("hidden")}if(clear)clear.classList.remove("hidden");if(status){status.className="notice";status.textContent=t("scan_ready")}}const files=await loadPendingRosterFiles(owner);if(files.length){rosterScanFiles=appendRosterScanFiles([],files,{limit:ROSTER_SCAN_FILE_LIMIT}).files;rosterScanDraft=[];renderRosterScanFiles();renderRosterScanDraft()}}catch{}}
async function persistPendingRosterQueue(){return await savePendingRosterFiles(pendingScanOwner(),rosterScanFiles).catch(()=>false)}
function clearScanImage({forget=true}={}){const owner=pendingScanOwner();scanImageData=null;scanImageName="capture.jpg";pendingExclusiveScan=[];const f=$("#scanFile"),p=$("#scanPreview"),clear=$("#clearScanCaptureBtn"),panel=$("#exclusiveConfirmPanel");if(f)f.value="";if(p){p.removeAttribute("src");p.classList.add("hidden")}if(clear)clear.classList.add("hidden");if(panel)panel.classList.add("hidden");if(forget)void clearPendingSingleScan(owner)}
function exclusiveNumber(value){const text=String(value??"").trim().replace(",",".");if(!text)return null;const n=Number(text);return Number.isFinite(n)?n:null}
function exclusivePower(value){const parsed=parseHeroPower(value);return parsed===null?null:parsed}
function renderExclusiveConfirmation(rows=[]){
  pendingExclusiveScan=Array.isArray(rows)?rows.map(x=>({...x})).filter(x=>x&&typeof x==="object"):[];
  const panel=$("#exclusiveConfirmPanel"),box=$("#exclusiveConfirmRows");if(!panel||!box)return false;
  const usableFields=["hero_name","weapon_name","level","power","power_raw","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"];
  pendingExclusiveScan=pendingExclusiveScan.filter(w=>usableFields.some(field=>w[field]!==undefined&&w[field]!==null&&String(w[field]).trim()!==""));
  if(!pendingExclusiveScan.length){panel.classList.add("hidden");box.innerHTML="";return false}
  box.innerHTML=pendingExclusiveScan.map((w,i)=>`<div class="exclusiveConfirmCard" data-exclusive-index="${i}">
    <div class="exclusiveConfirmGrid">
      <label>${esc(t("hero"))}<input data-exclusive-field="hero_name" value="${esc(w.hero_name||"")}" maxlength="80"/></label>
      <label>${esc(t("exclusive_weapon"))}<input data-exclusive-field="weapon_name" value="${esc(w.weapon_name||"")}" maxlength="120"/></label>
      <label>${esc(t("level"))}<input data-exclusive-field="level" type="number" min="0" max="999" step="1" value="${w.level??""}"/></label>
        <label>${esc(t("power"))}<input data-exclusive-field="power" type="text" inputmode="decimal" autocomplete="off" value="${esc(w.power??w.power_raw??"")}"/><small class="exclusiveDetectedPower">${esc(w.power!==undefined&&w.power!==null?`Puissance détectée : ${w.power}`:w.power_raw?`Puissance détectée à vérifier : ${w.power_raw}`:"Puissance non visible : à rescanner")}</small></label>
      <label>${esc(t("scan_exclusive_hp_bonus"))}<input data-exclusive-field="hero_hp_bonus" type="number" step="any" value="${w.hero_hp_bonus??""}"/></label>
      <label>${esc(t("scan_exclusive_atk_bonus"))}<input data-exclusive-field="hero_atk_bonus" type="number" step="any" value="${w.hero_atk_bonus??""}"/></label>
      <label>${esc(t("scan_exclusive_def_bonus"))}<input data-exclusive-field="hero_def_bonus" type="number" step="any" value="${w.hero_def_bonus??""}"/></label>
      <label>${esc(t("scan_exclusive_resistance"))}<input data-exclusive-field="all_damage_resistance_pct" type="number" step="any" value="${w.all_damage_resistance_pct??""}"/></label>
      <label>${esc(t("scan_exclusive_skill_cap"))}<input data-exclusive-field="max_skill_level" type="number" min="0" max="999" step="1" value="${w.max_skill_level??""}"/></label>
    </div>
  </div>`).join("");
  panel.classList.remove("hidden");
  requestAnimationFrame(()=>{try{panel.scrollIntoView({behavior:"smooth",block:"nearest"})}catch{}});
  return pendingExclusiveScan.length>0;
}
function exclusiveResultFieldCount(rows=[]){
  const fields=["hero_name","weapon_name","level","power","power_raw","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"];
  return new Set(fields.filter(field=>(Array.isArray(rows)?rows:[]).some(w=>w?.[field]!==undefined&&w?.[field]!==null&&String(w[field]).trim()!==""))).size;
}
function collectExclusiveConfirmation(){
  const rows=[];$("#exclusiveConfirmRows")?.querySelectorAll("[data-exclusive-index]").forEach(card=>{
    const row={},read=field=>String(card.querySelector(`[data-exclusive-field="${field}"]`)?.value||"").trim();
    const hero=canonicalHeroName(read("hero_name")),weapon=read("weapon_name");if(hero)row.hero_name=hero;if(weapon)row.weapon_name=weapon;
    const powerText=read("power"),power=exclusivePower(powerText);if(power!==null)row.power=power;else if(powerText){row.power_raw=powerText;row.power_parse_status="needs_verification";}
    for(const field of ["level","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"]){const value=exclusiveNumber(read(field));if(value!==null)row[field]=value}
    if(Object.keys(row).length)rows.push(row);
  });
  return rows;
}
function exclusivePowerNeedsVerification(){
  let invalid=false;
  $("#exclusiveConfirmRows")?.querySelectorAll("[data-exclusive-index]").forEach(card=>{
    const index=Number(card.getAttribute("data-exclusive-index")),staged=pendingExclusiveScan[index]||{};
    const stagedPower=String(staged.power??staged.power_raw??"").trim(),hero=canonicalHeroName(String(card.querySelector('[data-exclusive-field="hero_name"]')?.value||"").trim()||staged.hero_name);
    if(!hero||!stagedPower)return;
    const visible=card.querySelector('[data-exclusive-field="power"]')?.value||"";
    if(confirmedHeroPower(exclusivePower(visible))===null)invalid=true;
  });
  return invalid;
}
function saveConfirmedExclusiveScan(){
  const confirmed=collectExclusiveConfirmation(),status=$("#scanStatus");
  if(exclusivePowerNeedsVerification()){if(status){status.className="notice warn";status.textContent=lang.startsWith("fr")?"Puissance détectée à vérifier. Corrige la valeur avant l’enregistrement.":t("scan_exclusive_power_verify")}return false}
  if(!confirmed.some(w=>w.hero_name||w.weapon_name||w.level!==undefined||w.power!==undefined)){if(status){status.className="notice warn";status.textContent=t("scan_exclusive_required")}return false}
  const now=new Date().toISOString();
  const staged=mergeStateProtected(state,{exclusive_weapons:confirmed},{preferBase:false});
  state=mergeConfirmedExclusiveWeaponPowers(staged,{weapons:confirmed,updatedAt:now}).state;
  state=repairLegacySquadIdentity(state,{now}).state;
  state.sync.last_scan=state.sync.last_scan||now;state.sync.sources={...state.sync.sources,scan:true};recordProgressionSnapshot("scan_exclusive",state.sync.last_scan);saveState();
  pendingExclusiveScan=[];$("#exclusiveConfirmPanel")?.classList.add("hidden");
  if(status){status.className="notice";status.textContent=t("scan_exclusive_confirmed")}
  return true;
}
function heroConfirmOptions(selected){return [`<option value="">${esc(t("hero_choose"))}</option>`].concat(HERO_CATALOG.map(n=>`<option value="${esc(n)}"${n===selected?" selected":""}>${esc(n)}</option>`)).join("")}
function openHeroConfirmation(squadId,suggestions=[]){pendingHeroSquadId=Number(squadId)||null;pendingHeroSuggestions=Array.from({length:5},(_,i)=>String(suggestions?.[i]||"").trim());const panel=$("#heroConfirmPanel"),rows=$("#heroConfirmRows");if(!panel||!rows||!pendingHeroSquadId)return false;const sq=state.squads[pendingHeroSquadId-1];if(!sq)return false;const heroes=fixedHeroSlots(sq.heroes);rows.innerHTML=Array.from({length:5},(_,i)=>{const h=heroes[i]||emptyHero(i+1),saved=isGenericHeroName(h?.name)?"":canonicalStoredHeroName(h.name),suggested=pendingHeroSuggestions[i]&&!isGenericHeroName(pendingHeroSuggestions[i])?canonicalStoredHeroName(pendingHeroSuggestions[i]):"",current=suggested||saved;return `<div class="heroConfirmRow"><span>${i+1}</span><select data-hero-slot="${i}">${heroConfirmOptions(current)}</select></div>`}).join("");$("#heroConfirmTitle").textContent=t("hero_confirm_title",{squad:pendingHeroSquadId});panel.classList.remove("hidden");return true;}
function startHeroConfirmation(squadId,suggestions=[],scanSlots=[]){const id=Number(squadId);pendingHeroScanSlots=Array.from({length:5},(_,i)=>({...((scanSlots?.[i]&&typeof scanSlots[i]==="object")?scanSlots[i]:{})}));if(!Number.isInteger(id)||id<1||id>4)return;openDrawer("scan");renderScanTypeOptions();const type=$("#scanType");if(type)type.value=`squad${id}`;updateSquadCaptureHelp(`squad${id}`);const st=$("#scanStatus");if(st){st.className="notice warn";st.textContent=t("hero_confirm_needed")}const opened=openHeroConfirmation(id,suggestions);if(!opened)return;const drawer=$("#scanDrawer"),panel=$("#heroConfirmPanel");if(drawer)drawer.scrollTop=0;requestAnimationFrame(()=>requestAnimationFrame(()=>{try{panel?.scrollIntoView({behavior:"smooth",block:"center"})}catch{if(drawer)drawer.scrollTop=Math.max(0,(panel?.offsetTop||0)-24)}}));}
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
  closeHeroConfirmation(false);
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
  closeHeroConfirmation(false);
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
}

if(!localStorage.getItem(LANG_KEY)){for(const key of LEGACY_LANGUAGE_KEYS){const v=localStorage.getItem(key);if(v){localStorage.setItem(LANG_KEY,v);break}}}
let languageChoice=localStorage.getItem(LANG_KEY)||"auto",lang=resolveLanguage(languageChoice),locale=localeFor(lang),t=translator(lang);
function betaConsentStorageKey(){const id=String(cloudSession?.user?.id||"").trim();return id?`${BETA_CONSENT_KEY}:${id}`:null}
function betaConsentAccepted(){const key=betaConsentStorageKey();return Boolean(key&&localStorage.getItem(key)==="1")}
function authHeaders(extra={}){return {...extra,...(cloudSession?.access_token?{authorization:`Bearer ${cloudSession.access_token}`}:{}) ,...(betaConsentAccepted()?{"x-warboost-beta-consent":BETA_CONSENT_VERSION}:{})}}
function betaAccessAllowed(){return Boolean(cloudSession?.user)&&(!betaState.enforced||betaState.allowed)}
function runtimeAccessState(){return deriveRuntimeAccessState({userId:String(cloudSession?.user?.id||""),stateOwnerId:String(state?.player_id||""),betaAllowed:betaAccessAllowed(),consentAccepted:betaConsentAccepted(),betaAccessStatus:betaState?.access_status})}
function betaPrivateDataVisible(){return runtimeAccessState().privateVisible}
function safeLaunchBetaMode(){return Boolean(proState?.beta!==false||(betaState?.allowed===true&&proState?.configured!==true&&proState?.payments_enabled!==true))}
function safeLaunchBetaProIncluded(){return Boolean(safeLaunchBetaMode()&&cloudSession?.user&&betaAccessAllowed()&&betaConsentAccepted())}
function proFeatureAllowed(){return safeLaunchBetaProIncluded()||Boolean(!safeLaunchBetaMode()&&proState?.active)}
function betaAccessMessage(){const access=runtimeAccessState();if(!access.logged)return t("beta_signin_required");if(!betaState.enforced)return t("beta_allowlist_setup");if(access.phase==="syncing")return t("syncing");if(betaState.restore_error&&access.consented&&!cloudProfileVerified&&!access.privateVisible)return `${t("beta_restore_failed")}${lastBootstrapFailure()?.stage?` · ${lastBootstrapFailure().stage}`:""}`;if(access.phase==="access-denied"){if(betaState.access_status==="revoked")return t("beta_access_revoked");if(betaState.access_status==="expired")return t("beta_access_expired");return t("beta_code_required")}if(access.phase==="consent-required")return t("beta_consent_required");if(access.phase==="ready")return state?.sync?.pending_cloud_save?t("offline_keep"):t("safe_sync_done");return t("syncing")}
function requireBetaAccess(){if(betaAccessAllowed())return true;openDrawer("account");setTimeout(()=>$("#betaAccessSection")?.scrollIntoView({behavior:"smooth",block:"center"}),120);return false}
function requireBetaConsent(){if(betaConsentAccepted())return true;openDrawer("account");setTimeout(()=>$("#betaAccessSection")?.scrollIntoView({behavior:"smooth",block:"center"}),120);const el=$("#betaAccessStatus");if(el){el.className="notice warn";el.textContent=t("beta_consent_required")}return false}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function tpl(key,vars={}){return t(key,vars)}
function fmtPower(v){if(v===null||v===undefined||v==="")return "—";const n=canonicalPowerMillions(v);if(n===null)return String(v);return `${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n)} M`}
function formatProPrice(plan){const amount=Number(plan?.amount);if(!Number.isFinite(amount))return plan?.price_label||"4,99 € / mois";const currency=String(plan?.currency||"eur").toUpperCase(),value=amount/100;try{return `${new Intl.NumberFormat(locale,{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(value)} ${t("per_month")}`}catch{return plan?.price_label||`${value.toFixed(2)} € ${t("per_month")}`}}
function fmtAgo(iso){if(!iso)return t("never");const d=Math.max(0,Date.now()-new Date(iso).getTime());if(d<60e3)return t("just_now");if(d<3600e3)return `${Math.floor(d/60e3)} ${t("minutes")}`;if(d<86400e3)return `${Math.floor(d/3600e3)} ${t("hours")}`;return `${Math.floor(d/86400e3)} ${t("days")}`}
function updatedLabel(iso){if(!iso)return t("not_synced");const d=Math.max(0,Date.now()-new Date(iso).getTime());return d<60e3?t("updated_now"):t("updated_ago",{ago:fmtAgo(iso)})}
function isoWeek(d){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return Math.ceil((((x-y)/86400000)+1)/7)}
function lastWarServerClock(d){return new Date(d.getTime()-2*60*60*1000)}
function currentVsWeek(){return isoWeek(lastWarServerClock(serverNow||new Date()))}
function currentVsDay(){return vsDayFromServer(serverNow||new Date())}
function normalizedRole(v){return normalizeAllianceRole(v)}
function applyCanonicalRosterKeys(alliance={}){
  const serverId=alliance?.server_id||state.player?.server_id||"",allianceTag=alliance?.tag||"";
  const members=Array.isArray(alliance?.members)?alliance.members.map(member=>{
    const row={...member,server_id:member?.server_id||serverId,alliance_tag:member?.alliance_tag||allianceTag};
    return {...row,canonical_member_key:canonicalRosterMemberKey(row,{serverId,allianceTag})};
  }):[];
  return {...alliance,members};
}
function hydrateSharedAllianceRoster(rows=[],meta={}){
  if(!Array.isArray(rows)||!rows.length)return false;
  const serverId=normalizeServerId(meta.server_id||state.alliance?.server_id||state.player?.server_id),allianceTag=normalizeAllianceTag(meta.tag||state.alliance?.tag);
  const members=mergeSharedAllianceRoster(rows,state.alliance?.members,{serverId,allianceTag});
  const before=JSON.stringify(state.alliance?.members||[]);
  state.alliance={...state.alliance,id:meta.id||state.alliance?.id||null,name:meta.name||state.alliance?.name||"",owner_player_id:meta.owner_player_id||state.alliance?.owner_player_id||null,server_id:serverId,tag:allianceTag,members:applyCanonicalRosterKeys({...state.alliance,members}).members,roster_updated_at:meta.roster_updated_at||state.alliance?.roster_updated_at||null};
   const canonicalSelf=canonicalSelfRosterMember(state.alliance.members),playerNameBefore=String(state.player?.name||"");
   if(canonicalSelf?.name&&playerNameBefore!==canonicalSelf.name)state.player={...state.player,name:canonicalSelf.name};
   const changed=before!==JSON.stringify(state.alliance.members)||playerNameBefore!==String(state.player?.name||"");
  canonicalRosterReady=true;
  if(changed){
    safeLocalSet(STORE_KEY,JSON.stringify(state));
    if(cloudSession?.user?.id)rememberAccountState(cloudSession.user.id,state);
  }
  return changed;
}
function allianceRoleEvidence(){
  const alliance=state?.alliance||{},userId=String(state?.player_id||cloudSession?.user?.id||"").trim();
  const linked=confirmedCanonicalSelfRole(alliance.members||[],userId);
  const linkedRole=linked.ok?normalizedRole(linked.role):null;
  const membershipKnown=alliance.cloud_role_verified===true;
  const membershipRole=membershipKnown?normalizedRole(alliance.role):null;
  const canonicalRoles=[linkedRole,membershipRole].filter(Boolean);
  const canonicalManager=canonicalRoles.find(role=>["R4","R5"].includes(role));
  if(canonicalManager)return {role:canonicalManager,source:linkedRole===canonicalManager?"linked_identity":"canonical_membership",verified:true,proof:linked};
  if(canonicalRoles.length)return {role:canonicalRoles[0],source:linkedRole?"linked_identity":"canonical_membership",verified:true,proof:linked};
  return {role:normalizedRole(state?.player?.role),source:"profile_declared",verified:false,proof:linked};
}
function allianceCommandAccess(){
  const alliance=state?.alliance||{},userId=String(state?.player_id||cloudSession?.user?.id||""),owner=Boolean(alliance.owner_player_id&&userId&&String(alliance.owner_player_id)===userId),evidence=allianceRoleEvidence(),manager=["R4","R5"].includes(evidence.role);
  const verifiedManager=owner||(evidence.verified&&manager);
  // The declared profile is only a UI fallback while cloud/canonical proof is unavailable.
  // Every cloud mutation remains protected by the server-side canonical authorization.
  return {cloudAvailable:alliance.cloud_role_verified===true,role:evidence.role,roleSource:evidence.source,roleVerified:evidence.verified||owner,owner,allowed:verifiedManager||(!evidence.verified&&manager),verifiedAllowed:verifiedManager,needsRoleRefresh:!verifiedManager&&(!evidence.verified||manager),reason:evidence.verified?"canonical_role_not_manager":"profile_role_unverified"};
}
function hasDeclaredAllianceCommandRole(){return allianceCommandAccess().allowed}
function isAllianceManager(){return allianceCommandAccess().allowed}
function managerOnlyMessage(){
  const access=allianceCommandAccess();
  if(access.roleSource==="profile_declared"&&["R4","R5"].includes(access.role))return t("manager_role_unverified",{role:access.role});
  if(access.roleSource!=="profile_declared"&& !["R4","R5"].includes(access.role))return t("manager_role_canonical_not_manager",{role:access.role});
  return t("manager_only");
}
function showAllianceRoleGuard(status){
  if(!status)return;
  const access=allianceCommandAccess(),message=managerOnlyMessage(),canRefresh=Boolean(cloudSession?.access_token);
  status.className="notice warn";
  status.innerHTML=`${esc(message)}${canRefresh?` <button type="button" class="smallBtn allianceRoleRefreshBtn">${esc(t("manager_role_refresh"))}</button>`:""}`;
  status.classList.remove("hidden");
  status.querySelector(".allianceRoleRefreshBtn")?.addEventListener("click",()=>refreshAllianceRoleAccess(status));
}
async function refreshAllianceRoleAccess(status){
  const button=status?.querySelector(".allianceRoleRefreshBtn");
  if(button){button.disabled=true;button.textContent=t("rank_manager_syncing")}
  try{
    await reconcileAuthenticatedRuntime("alliance-role-refresh",{force:true});
    rosterDiagnostic={...rosterDiagnostic,status:"idle",at:0};
    await refreshRosterDiagnostic();
    const proof=confirmedCanonicalSelfRole(state.alliance?.members||[],state.player_id||cloudSession?.user?.id);
    if(proof.ok&&["R4","R5"].includes(proof.role))await resyncOwnRankManagerRole();
    render();
    if(status&&allianceCommandAccess().allowed)status.className="notice";
    if(status&&allianceCommandAccess().allowed)status.textContent=t("rank_manager_sync_verified");
    else if(status)showAllianceRoleGuard(status);
  }catch{if(status)showAllianceRoleGuard(status)}
  finally{if(button&&button.isConnected)button.disabled=false}
}

function voiceEnabled(){return localStorage.getItem(VOICE_ENABLED_KEY)!=="0"}
function preferredVoiceId(){return localStorage.getItem(VOICE_ID_KEY)||""}
function refreshVoices(){if(!("speechSynthesis" in window))return;availableVoices=window.speechSynthesis.getVoices()||[];const sel=$("#voiceSelect");if(!sel)return;const chosen=preferredVoiceId(),langLocale=String(locale||"").toLowerCase();const sorted=[...availableVoices].sort((a,b)=>{const am=String(a.lang||"").toLowerCase().startsWith(langLocale.split("-")[0])?0:1,bm=String(b.lang||"").toLowerCase().startsWith(langLocale.split("-")[0])?0:1;return am-bm||String(a.name).localeCompare(String(b.name))});sel.innerHTML=`<option value="">${esc(t("automatic"))}</option>`+sorted.map(v=>`<option value="${esc(v.voiceURI)}"${v.voiceURI===chosen?" selected":""}>${esc(v.name)} · ${esc(v.lang||"")}</option>`).join("")}
function voiceGreetingText(){const name=state?.player?.name||"WarBoost",role=normalizedRole(state?.player?.role),k=String(lang||"en").toLowerCase();if(k.startsWith("fr")){const title={R5:"Général",R4:"Mon colonel",R3:"Commandant",R2:"Capitaine",R1:"Soldat"}[role]||role;return `Bonjour ${title} ${name}. WarBoost est prêt.`}return `${t("hello",{name})}. ${t("role")} ${role}. WarBoost.`}
function speakGreeting(section="player",force=false){if(!voiceEnabled()||!("speechSynthesis" in window))return;if(!force&&voiceGreetedSections.has(section))return;const text=voiceGreetingText();if(!text)return;try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text),chosen=preferredVoiceId(),voice=availableVoices.find(v=>v.voiceURI===chosen)||availableVoices.find(v=>String(v.lang||"").toLowerCase().startsWith(String(locale||"").toLowerCase().split("-")[0]));if(voice)u.voice=voice;u.lang=voice?.lang||locale;u.rate=.96;window.speechSynthesis.speak(u);if(!force)voiceGreetedSections.add(section)}catch{}}
function renderVoiceSettings(){const enabled=$("#voiceEnabled"),pill=$("#voiceStatusPill");if(enabled)enabled.checked=voiceEnabled();if(pill)pill.textContent=voiceEnabled()?t("voice_on"):t("voice_off");refreshVoices()}
function safeSelfRole(requested){return normalizedRole(requested)}

function vsDayFromServer(d){const day=lastWarServerClock(d).getUTCDay();return day===0?0:day}
function isSquadScanType(type){return /^squad[1-4]$/i.test(String(type||""))}
function updateSquadCaptureHelp(type){
  const wrapper=$("#squadCaptureHelp"),panel=$("#squadCaptureHelpPanel"),wrong=$("#squadCaptureWrongNotice");
  if(!wrapper)return;
  const visible=isSquadScanType(type);
  wrapper.classList.toggle("hidden",!visible);
  if(!visible){panel?.classList.add("hidden");wrong?.classList.add("hidden")}
}
function openSquadCaptureHelp(wrong=false){
  if(!isSquadScanType($("#scanType")?.value))return;
  const panel=$("#squadCaptureHelpPanel"),notice=$("#squadCaptureWrongNotice");
  if(!panel)return;
  panel.classList.remove("hidden");
  notice?.classList.toggle("hidden",!wrong);
  requestAnimationFrame(()=>{try{panel.scrollIntoView({behavior:"smooth",block:"nearest"})}catch{}});
}
function closeSquadCaptureHelp(){
  $("#squadCaptureHelpPanel")?.classList.add("hidden");
  $("#squadCaptureWrongNotice")?.classList.add("hidden");
}
function renderScanTypeOptions(){const sel=$("#scanType");if(!sel)return;const current=sel.value||"profile";const opts=[["profile",t("scan_profile")],["squad1",`${t("squad")} 1`],["squad2",`${t("squad")} 2`],["squad3",`${t("squad")} 3`],["squad4",`${t("squad")} 4`],["drone",t("scan_drone")],["exclusive",t("scan_exclusive")],["awakening",t("scan_awakening")],["shop",t("scan_shop")],["vs",t("scan_vs")],["season",t("scan_season")]];sel.innerHTML=opts.map(([v,label])=>`<option value="${v}">${label}</option>`).join("");sel.value=opts.some(([v])=>v===current)?current:"profile";updateSquadCaptureHelp(sel.value)}
function applyLanguage(){lang=resolveLanguage(languageChoice);locale=localeFor(lang);t=translator(lang);document.documentElement.lang=lang;document.documentElement.dir=dirFor(lang);$$('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});$$('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));$$('[data-i18n-placeholder]').forEach(el=>{const text=t(el.dataset.i18nPlaceholder);el.setAttribute('placeholder',text);if(el.isContentEditable)el.setAttribute('data-placeholder',text)});const sel=$("#languageSelect");if(sel){sel.innerHTML=LANGUAGES.map(([v,label])=>`<option value="${v}">${label}</option>`).join("");sel.value=languageChoice}renderScanTypeOptions();renderClock();render();renderAuth();renderBeta();renderPro();renderVoiceSettings();renderSupportAccess();renderSupportTickets();$("#proPriorityPanel")?.classList.add("hidden");$("#playerSyncInfo")?.classList.remove("hidden")}
function saveState(options={}){const renderUi=options?.renderUi!==false,signedInUserId=String(cloudSession?.user?.id||""),ownerId=String(state?.player_id||"");if(signedInUserId&&ownerId&&ownerId!==signedInUserId){if(hasMeaningfulCore(state))rememberAccountState(ownerId,state);const own=readAccountState(signedInUserId);state=hasMeaningfulCore(own)?hydrateCloudState(own,initialState(),signedInUserId):initialState();state.player_id=signedInUserId;state.sync={...state.sync,status:"waiting",last_error:"account_owner_mismatch",pending_cloud_save:false};if(renderUi)render();return false}if(signedInUserId&&!ownerId)state.player_id=signedInUserId;state=repairLegacySquadIdentity(state).state;state=backfillConfirmedHeroPowers(state).state;state.updated_at=new Date().toISOString();state.version=APP_VERSION;const localOk=safeLocalSet(STORE_KEY,JSON.stringify(state));if(!localOk)state.sync={...state.sync,status:"waiting",last_error:"local_storage_unavailable",pending_cloud_save:true};rememberLastGoodState(state,"save");if(signedInUserId&&String(state.player_id||"")===signedInUserId)rememberAccountState(signedInUserId,state);if(renderUi)render();if(!suppressPush&&hasMeaningfulCore(state))scheduleServerSave(localOk?350:0);return localOk}
function scheduleServerSave(delay=350){cloudDirty=true;clearTimeout(pushTimer);pushTimer=setTimeout(()=>pushServerState(),Math.max(0,Number(delay)||0))}
function scheduleCloudRetry(delay=8000){if(cloudRetryTimer||!cloudDirty||!navigator.onLine)return;cloudRetryTimer=setTimeout(()=>{cloudRetryTimer=null;if(cloudDirty)pushServerState()},Math.max(1500,Number(delay)||8000))}
function markCloudPending(error="cloud_save_failed"){cloudDirty=true;state.sync={...state.sync,status:navigator.onLine?"waiting":"offline",last_error:error,pending_cloud_save:true};safeLocalSet(STORE_KEY,JSON.stringify(state));renderProvider();scheduleCloudRetry()}
function scheduleCloudPullRetry(delay=2500){const needsRecovery=Boolean(!cloudProfileVerified||!canonicalRosterReady||betaState?.restore_error||betaState?.access_status==="checking");if(cloudPullRetryTimer||!navigator.onLine||!cloudSession?.access_token||!betaConsentAccepted()||!needsRecovery)return;const wait=Math.max(1500,Math.min(15000,Number(delay)||2500));cloudPullRetryTimer=setTimeout(async()=>{cloudPullRetryTimer=null;try{await restoreAuthenticatedProfile(readAccountState(cloudSession?.user?.id),{reason:"retry"})}catch{if(Boolean(!cloudProfileVerified||!canonicalRosterReady||betaState?.restore_error||betaState?.access_status==="checking"))scheduleCloudPullRetry(Math.min(15000,wait*2))}},wait)}
function markLargeKeepaliveDeferred(){cloudDirty=true;state.sync={...state.sync,status:"waiting",pending_cloud_save:true};safeLocalSet(STORE_KEY,JSON.stringify(state));renderProvider()}
async function fetchSessionCritical(input,init={},timeoutMs=10000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1500,Number(timeoutMs)||10000));
  try{return await fetch(input,{...init,signal:controller.signal})}
  catch(error){if(error?.name==="AbortError")throw Object.assign(new Error("WarBoost request timed out"),{name:"TimeoutError",code:"request_timeout",timeout_ms:Math.max(1500,Number(timeoutMs)||10000)});throw error}
  finally{clearTimeout(timer)}
}
async function fetchJsonBounded(input,init={},timeoutMs=12000){const response=await fetchSessionCritical(input,init,timeoutMs),json=await response.json().catch(()=>({}));return {response,json}}

async function initCloudAuth(){
  cloud=null;cloudSession=null;cloudRecoveryRedirect="";cloudDataConfig={url:"",key:""};cloudProfileVerified=false;canonicalRosterReady=false;cloudInit={status:"loading-config",configured:false,transport:"direct-supabase-auth-api",error:null};renderAuth();
  let cfg;
  try{
    const {response:r,json}=await fetchJsonBounded("/api/cloud-config",{cache:"no-store"},8000);cfg=json;
    if(!r.ok)throw Object.assign(new Error("cloud-config request failed"),{code:"cloud_config_unreachable"});
  }catch(error){cloudInit={status:"config-unreachable",configured:false,transport:"direct-supabase-auth-api",error:error?.code||error?.name||"network"};renderAuth();renderBeta();return}
  if(!cfg?.configured||!cfg?.url||!cfg?.key){cloudInit={status:"config-missing",configured:false,transport:"direct-supabase-auth-api",error:"missing_config"};renderAuth();renderBeta();return}
  cloudRecoveryRedirect=/^https:\/\//i.test(String(cfg?.recovery_redirect_url||""))?String(cfg.recovery_redirect_url):"";
  cloudDataConfig={url:String(cfg.url||""),key:String(cfg.key||"")};
  cloudInit={status:"client-starting",configured:true,transport:"direct-supabase-auth-api",error:null};
  try{
    cloud=createWarBoostSupabaseAuthClient({url:cfg.url,key:cfg.key,requestTimeoutMs:12000});
  }catch(error){cloud=null;cloudInit={status:"client-error",configured:true,transport:"direct-supabase-auth-api",error:error?.code||"client_error"};renderAuth();renderBeta();return}
  try{
    const {data,error}=await cloud.auth.getSession();
    if(error)throw error;
    cloudInit={status:"ready",configured:true,transport:cloud.diagnostics?.transport||"direct-supabase-auth-api",error:null};
    await applySession(data?.session||null);
    cloud.auth.onAuthStateChange((event,session)=>{
      const currentUserId=String(cloudSession?.user?.id||""),nextUserId=String(session?.user?.id||"");
      if(event==="TOKEN_REFRESHED"&&session&&currentUserId&&currentUserId===nextUserId){
        cloudSession=session;lastAppliedSessionKey=sessionApplyKey(session);renderAuth();return;
      }
      void applySession(session||null);
    });
  }catch(error){cloudInit={status:"auth-unreachable",configured:true,transport:"direct-supabase-auth-api",error:error?.code||"auth_unreachable"};renderAuth();renderBeta()}
}
async function refreshBeta(){if(!cloudSession?.access_token){betaState={release:true,enforced:false,configured:false,allowed:false,access_status:"sign-in-required",consent_version:BETA_CONSENT_VERSION,payments_enabled:false,pro_included:true};renderBeta();render();return betaState}const previouslyVerified=betaState?.allowed===true;try{const r=await fetchSessionCritical("/api/pro",{cache:"no-store",headers:authHeaders()},8000),j=await r.json().catch(()=>({}));if(r.ok&&j.beta){betaState={...betaState,release:j.release!==false,enforced:Boolean(j.enforced??j.beta_enforced),configured:Boolean(j.beta_configured??j.enforced??j.beta_enforced),allowed:Boolean(j.allowed??j.active),access_status:j.access_status||j.beta_access||(j.active?"invited":"invite-required"),consent_version:j.consent_version||BETA_CONSENT_VERSION,payments_enabled:false,pro_included:Boolean(j.pro_included)}}else{const code=String(j?.error||"").toUpperCase(),definitive=r.status===403||["BETA_INVITE_REQUIRED","BETA_INVITE_REVOKED","BETA_INVITE_EXPIRED"].includes(code);betaState={...betaState,allowed:definitive?false:preserveAllowedAfterTransient({previouslyVerified,currentAllowed:betaState?.allowed===true}),access_status:definitive?(code==="BETA_INVITE_REVOKED"?"revoked":code==="BETA_INVITE_EXPIRED"?"expired":"invite-required"):(preserveAllowedAfterTransient({previouslyVerified,currentAllowed:betaState?.allowed===true})?((betaState.access_status&&betaState.access_status!=="checking")?betaState.access_status:"accepted"):(j.access_status||j.beta_access||j.error||"beta-status-error"))}}}catch{const keep=preserveAllowedAfterTransient({previouslyVerified,currentAllowed:betaState?.allowed===true});betaState={...betaState,allowed:keep,access_status:keep?((betaState.access_status&&betaState.access_status!=="checking")?betaState.access_status:"accepted"):"beta-status-error"}}renderBeta();render();return betaState}
async function activateBetaCode(){const input=$("#betaAccessCode"),status=$("#betaCodeStatus"),btn=$("#betaCodeActivateBtn"),code=String(input?.value||"").trim();if(!cloudSession?.access_token){if(status){status.className="notice warn";status.textContent=t("beta_signin_required");status.classList.remove("hidden")}return}if(!code){if(status){status.className="notice warn";status.textContent=t("beta_code_enter");status.classList.remove("hidden")}return}if(btn){btn.disabled=true;btn.textContent=t("beta_code_activating")}try{const {response:r,json:j}=await fetchJsonBounded("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"beta_code_activate",code})},15000);if(!r.ok){const key=j.error==="BETA_CODE_INVALID"?"beta_code_invalid":j.error==="BETA_CODE_EXPIRED"?"beta_code_expired":j.error==="BETA_CODE_FULL"?"beta_code_full":j.error==="BETA_ACCESS_REVOKED"?"beta_access_revoked":"beta_code_error";throw Object.assign(new Error(t(key)),{code:j.error||"BETA_CODE_ERROR"})}await refreshBeta();if(input)input.value="";if(status){status.className="notice";status.textContent=t("beta_code_success");status.classList.remove("hidden")}setTimeout(()=>{if(betaAccessAllowed())status?.classList.add("hidden")},2200)}catch(e){if(status){status.className="notice warn";status.textContent=e.message||t("beta_code_error");status.classList.remove("hidden")}}finally{if(btn){btn.disabled=false;btn.textContent=t("beta_code_activate")}}}
function sessionApplyKey(session){return session?.access_token?`${String(session?.user?.id||"")}|${String(session.access_token).slice(-24)}`:"signed-out"}
async function applySession(session){
  const key=sessionApplyKey(session);
  if(sessionApplyInFlight?.key===key)return sessionApplyInFlight.promise;
  // Reuse a signed-in bootstrap only after the authenticated cloud profile has actually been
  // verified. A previous degraded/timeout attempt must be allowed to run again with the same token.
  if(lastAppliedSessionKey===key&&((session?.access_token&&cloudSession?.access_token===session.access_token&&cloudProfileVerified&&betaState?.allowed===true&&betaState?.access_status!=="checking"&&!betaState?.restore_error)||(!session&&!cloudSession)))return {ok:true,reused:true,cloud_profile_verified:cloudProfileVerified};
  const promise=applySessionCore(session).then(result=>{lastAppliedSessionKey=key;return result});
  sessionApplyInFlight={key,promise};
  try{return await promise}finally{if(sessionApplyInFlight?.promise===promise)sessionApplyInFlight=null}
}
/* Legacy HF8.6.13 verification-only source marker (non-executable):
if(betaConsentAccepted()){
  let pulled=await pullServerState(loginSeed,{fastRestore:true})
}
*/
async function applySessionCore(session){
  // Legacy HF8.6.17 fail-closed regression marker (new/different accounts only):
  // enforced:true,configured:true,allowed:false,access_status:"checking"
  const previousUserId=String(cloudSession?.user?.id||"");
  const previousPendingOwner=pendingScanOwner(cloudSession);
  const preSessionState=safeClone(state);
  cloudSession=session||null;
  const nextUserId=String(cloudSession?.user?.id||"");
  if(previousUserId!==nextUserId){cloudProfileVerified=false;canonicalRosterReady=false;cloudRevision=null}
  const nextPendingOwner=pendingScanOwner(cloudSession);

  // HF8.6.15 keeps HF8.6.14 immediate session rendering and additionally bounds every foreground auth/cloud write.
  // Pending screenshot storage is useful,
  // but it is never allowed to block or cancel a valid Supabase session on Android/WebView.
  renderAuth();renderBeta();

  try{
    if(cloudSession?.user?.id){
      resetBootstrapDiagnostics("session");
      // The public beta is server-invite gated. A same-user token refresh must never
      // re-lock an already verified UI while a background revalidation runs.
      const userId=String(cloudSession.user.id),oldOwner=String(state?.player_id||""),localOwner=clientId();
      const preserveVerifiedAccess=shouldPreserveVerifiedSessionAccess({previousUserId,nextUserId:userId,cloudProfileVerified,betaAllowed:betaState?.allowed===true,betaAccessStatus:betaState?.access_status});
      betaState=betaStateForSessionBootstrap(betaState,{preserveVerified:preserveVerifiedAccess});
      cloudHydrationPending=true;

      // Isolate accounts before any optional asynchronous work can stall.
      if(oldOwner&&oldOwner!==localOwner&&oldOwner!==userId&&hasMeaningfulCore(state))rememberAccountState(oldOwner,state);
      const loginSeed=safestLoginSeed(userId,state);
      state=loginSeed?mergeState(initialState(),loginSeed):initialState();
      state.player_id=userId;
      if(hasMeaningfulCore(loginSeed)){
        rememberLastGoodState(loginSeed,"before-login-own-state");
        state=hydrateCloudState(loginSeed,initialState(),userId);
        safeLocalSet(STORE_KEY,JSON.stringify(state));
        rememberAccountState(userId,state);
      }else{
        // Critical HF8.6.12 guard: never persist this empty in-memory placeholder before
        // the authenticated cloud read has succeeded.
      }

      // Render the correctly isolated account now, before cloud/profile requests.
      render();renderAuth();renderBeta();renderPro();renderSupportAccess();

      // Pending scans are best-effort device convenience only. Never await this migration in
      // the authentication critical path: IndexedDB can be slow or remain pending on Android.
      if(previousPendingOwner.startsWith("device:")&&previousPendingOwner!==nextPendingOwner){
        void movePendingScans(previousPendingOwner,nextPendingOwner)
          .then(()=>{if(pendingScanOwner()===nextPendingOwner)return restorePendingScans()})
          .catch(()=>{});
      }
      try{resetPendingScanUi()}catch{}

      // Legacy HF8.6.12 verification markers after HF8.6.19 centralised restore:
      /* scheduleCloudPullRetry(); */
      // const pulled=await pullServerState(loginSeed,{fastRestore:true})
      // scheduleCloudPullRetry()
      // HF8.6.17: restore the authenticated profile FIRST. /api/state already performs
      // invitation + consent validation, so profile hydration no longer waits on /api/pro.
      // If the state route has a transient failure, verify beta access separately and use the
      // user's own Supabase RLS row as a read-only recovery path.
      if(betaConsentAccepted()){
        const pulled=await restoreAuthenticatedProfile(loginSeed,{reason:"session"});
        if(pulled?.cloud_empty&&hasMeaningfulCore(loginSeed)){
          state=hydrateCloudState(loginSeed,initialState(),userId);state.player_id=userId;saveState();void pushServerState();
        }else if(!pulled?.ok&&!pulled?.cloud_empty&&!cloudProfileVerified){
          if(hasMeaningfulCore(loginSeed)){
            state=hydrateCloudState(loginSeed,initialState(),userId);safeLocalSet(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"cloud-pull-failed-local-fallback");rememberAccountState(userId,state);
          }else if(hasMeaningfulCore(preSessionState)&&String(preSessionState?.player_id||"")===userId){
            state=hydrateCloudState(preSessionState,initialState(),userId);safeLocalSet(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"cloud-pull-failed-session-fallback");rememberAccountState(userId,state);
          }
        }
      }else{
        await runBootstrapStage("BETA_CHECK",()=>refreshBeta());finishBootstrapDiagnostics(betaState.allowed?"consent-required":"access-check-complete");
      }
      const pendingCode=pendingJoinCode();if(pendingCode)state.alliance.invite_code=pendingCode;
      // PRO entitlement and temporary screenshots are not login-critical.
      void refreshPro();void restorePendingScans();
      }else{
       cloudProfileVerified=false;canonicalRosterReady=false;
      cloudHydrationPending=false;
      clearTimeout(cloudPullRetryTimer);cloudPullRetryTimer=null;
      proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null};
      betaState={release:true,enforced:false,configured:false,allowed:false,access_status:"sign-in-required",consent_version:BETA_CONSENT_VERSION,payments_enabled:false,pro_included:true};
      clearSignedOutAuthUi();
      try{resetPendingScanUi()}catch{}
      void restorePendingScans();
    }
  }catch(error){
    // Last-resort session guard: one optional subsystem must never leave the account drawer in
    // the pre-login state after Supabase has already authenticated the user.
    if(cloudSession?.user?.id){
      const userId=String(cloudSession.user.id);
      if(String(state?.player_id||"")!==userId){state=initialState();state.player_id=userId}
      state.sync={...state.sync,status:navigator.onLine?"waiting":"offline",last_error:error?.name||"session_apply_degraded"};
      // Even an unexpected local bootstrap exception must not cancel cloud recovery. The retry
      // path is independently bounded and will re-run /api/state with the authenticated token.
      if(betaConsentAccepted())scheduleCloudPullRetry(1500);
      else void refreshBeta().catch(()=>{});
    }
  }finally{
    cloudHydrationPending=false;
    render();renderAuth();renderBeta();renderPro();renderSupportAccess();
  }
  return {ok:Boolean(cloudSession?.user?.id)||!session,cloud_profile_verified:cloudProfileVerified,state_meaningful:hasMeaningfulCore(state)};
}
function cloudAuthFailureMessage(){
  if(cloudInit.status==="config-missing")return t("auth_cloud_missing");
  if(cloudInit.status==="config-unreachable")return t("auth_cloud_config_unreachable");
  if(cloudInit.status==="client-error")return t("auth_client_unavailable");
  if(cloudInit.status==="auth-unreachable")return t("auth_cloud_unreachable");
  return t("auth_cloud_unreachable");
}
function localizeMountedAuthControls(){
  const root=$("#authLoggedOut");if(!root)return;
  root.querySelectorAll("[data-i18n]").forEach(el=>{el.textContent=t(el.dataset.i18n)});
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{el.setAttribute("placeholder",t(el.dataset.i18nPlaceholder))});
}
function mountAuthControls(){
  const root=$("#authLoggedOut"),template=$("#authLoggedOutTemplate");
  if(!root||!template||root.querySelector("#authEmail"))return false;
  root.replaceChildren(template.content.cloneNode(true));
  localizeMountedAuthControls();
  bindAuthControls();
  return true;
}
function unmountAuthControls(){
  const root=$("#authLoggedOut");
  if(!root)return;
  root.replaceChildren();
  root.classList.add("hidden");
}
function renderAuth(){
  const logged=Boolean(cloudSession?.user);
  const accountOpen=Boolean($("#accountDrawer")?.classList.contains("open"));
  if(logged||!accountOpen)unmountAuthControls();
  else{mountAuthControls();localizeMountedAuthControls()}
  $("#authLoggedOut")?.classList.toggle("hidden",logged||!accountOpen);
  $("#authLoggedIn")?.classList.toggle("hidden",!logged);
  if($("#authPill"))$("#authPill").textContent=logged?t("connected"):(cloudInit.status==="ready"?t("ready"):t("local"));
  if(logged&&$("#authIdentity"))$("#authIdentity").textContent=`WarBoost · ${cloudSession.user.email||""}`;
  if(!logged&&pendingAuthEmail())revealEmailConfirmation(pendingAuthEmail());
  const msg=$("#authMessage");
  if(!logged&&msg&&["config-missing","config-unreachable","client-error","auth-unreachable"].includes(cloudInit.status)){msg.className="notice warn";msg.textContent=cloudAuthFailureMessage()}
  renderBeta();renderPro();
}
function renderBeta(){const pill=$("#betaAccessPill"),status=$("#betaAccessStatus"),row=$("#betaConsentRow"),checkbox=$("#betaConsent"),codeBox=$("#betaCodeBox"),retry=$("#betaRestoreRetryBtn"),checking=Boolean(cloudSession?.user&&betaState.access_status==="checking"),restoreFailed=Boolean(cloudSession?.user&&betaConsentAccepted()&&!cloudProfileVerified&&betaState.restore_error);if(pill){const invited=Boolean(cloudSession?.user&&betaAccessAllowed());pill.textContent=!cloudSession?.user?t("beta_signin_short"):checking?t("syncing"):restoreFailed?t("update"):betaState.enforced&&!betaState.allowed?t("beta_code_short"):betaState.enforced?t("beta_invited_short"):t("beta_setup_short");pill.className=`pill ${invited&&!restoreFailed?"active":"warn"}`}if(status){status.className=`notice${cloudSession?.user&&betaAccessAllowed()&&!restoreFailed?"":" warn"}`;status.textContent=betaAccessMessage()}if(retry){retry.classList.toggle("hidden",!restoreFailed);retry.disabled=cloudHydrationPending}const canUseCode=Boolean(cloudSession?.user&&betaState.enforced&&!betaState.allowed&&betaState.access_status==="invite-required");if(codeBox)codeBox.classList.toggle("hidden",!canUseCode);if(row)row.classList.toggle("hidden",!cloudSession?.user||!betaAccessAllowed());if(checkbox)checkbox.checked=betaConsentAccepted();$$('.moduleCard').forEach(x=>{const locked=Boolean(checking||!cloudSession?.user||(betaState.enforced&&!betaState.allowed)||(restoreFailed&&!betaPrivateDataVisible()));x.classList.toggle("betaLocked",locked);x.setAttribute("aria-disabled",locked?"true":"false")});const fab=$("#betaFeedbackBtn");if(fab)fab.classList.toggle("hidden",Boolean(!cloudSession?.user||(betaState.enforced&&!betaState.allowed)))}
function authMessage(text,ok=false){const el=$("#authMessage");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text}

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
  if(["auth_network_unavailable","auth_request_timeout","auth_cloud_unavailable","auth_session_missing","auth_session_apply_failed"].includes(code))return t("auth_cloud_unreachable");
  return message||t("auth_cloud_unreachable");
}
async function ensureAuthenticatedSessionApplied(data){
  if(!cloud)throw Object.assign(new Error("WarBoost cloud unavailable"),{code:"auth_cloud_unavailable"});
  let session=data?.session||null;
  if(!session?.access_token){
    const current=await cloud.auth.getSession();
    if(current?.error)throw current.error;
    session=current?.data?.session||null;
  }
  if(session?.access_token&&!session?.user?.id){
    const userResult=await cloud.auth.getUser(session.access_token);
    if(userResult?.error)throw userResult.error;
    if(userResult?.data?.user)session={...session,user:userResult.data.user};
  }
  if(!session?.access_token||!session?.user?.id)throw Object.assign(new Error("Authenticated WarBoost session missing"),{code:"auth_session_missing"});

  // The custom Supabase client emits SIGNED_IN synchronously, but some Android/WebView
  // executions have proven that the UI callback may not commit the session. Never rely on
  // the event alone: apply the exact session returned by the successful password/OTP call.
  // Always await the single-flight session bootstrap. If SIGNED_IN already started it,
  // applySession() joins the exact in-flight promise instead of returning early just because
  // cloudSession was assigned at the beginning of the bootstrap.
  await applySession(session);
  if(!cloudSession?.user?.id)throw Object.assign(new Error("WarBoost session was not applied"),{code:"auth_session_apply_failed"});
  // applySession() owns the single authenticated restore attempt. Avoid duplicating the same
  // network sequence after a timeout; recovery is explicit through retry/backoff.
  if(betaConsentAccepted()&&!cloudProfileVerified&&!betaState.restore_error)scheduleCloudPullRetry(3000);
  renderAuth();renderBeta();renderPro();
  return session;
}

function setAuthBusy(busy){
  for(const id of ["loginBtn","signupBtn","verifyOtpBtn","resendOtpBtn","forgotPasswordBtn"]){const el=$("#"+id);if(el)el.disabled=Boolean(busy)}
}
function inviteMessage(text,ok=false){const el=$("#inviteStatus");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text;el.classList.remove("hidden")}
async function pushServerState({keepalive=false}={}){
  if(!cloudSession?.access_token||!betaAccessAllowed()||!betaConsentAccepted())return {skipped:true,reason:"cloud_access_unavailable"};
  const userId=String(cloudSession?.user?.id||""),ownerId=String(state?.player_id||"");
  if(!userId||ownerId!==userId)return {skipped:true,reason:"account_owner_mismatch"};
  // Never let an empty browser placeholder overwrite a real cloud profile.
  if(!hasMeaningfulCore(state))return {skipped:true,reason:"empty_state_guard"};
  try{
    const outbound=safeClone(state);
    // Transient browser/network errors belong to this device, not to the durable player profile.
    outbound.sync={...(outbound.sync||{}),last_error:null,pending_cloud_save:false};
    const body=JSON.stringify({state:outbound,base_updated_at:cloudRevision});
    if(keepalive&&!canUseKeepaliveBody(body)){
      // Mobile fetch keepalive has a small request-body quota. The state remains safely in
      // localStorage and cloudDirty stays true; the normal foreground retry will save it.
      markLargeKeepaliveDeferred();
      return {skipped:true,reason:"keepalive_payload_too_large"};
    }
    const requestInit={method:"POST",headers:authHeaders({"content-type":"application/json"}),body,keepalive:Boolean(keepalive)};
    const r=keepalive?await fetch("/api/state",requestInit):await fetchSessionCritical("/api/state",requestInit,25000),j=await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status===409&&j?.error==="profile_write_conflict"){
        const remote=j?.state?hydrateCloudState(j.state,initialState(),cloudSession.user.id):null;
        if(remote){try{state=mergeStateProtected(remote,state,{preferBase:false})}catch{state=remote}state=adoptCanonicalPendingAccounts(state,remote,{available:false});state.player_id=cloudSession.user.id}
        cloudRevision=j?.updated_at||null;markCloudPending("profile_write_conflict");safeLocalSet(STORE_KEY,JSON.stringify(state));rememberAccountState(cloudSession.user.id,state);scheduleCloudRetry(250);render();return {ok:false,conflict:true,error:j.error}
      }
      markCloudPending(j?.error||`state_http_${r.status}`);return {ok:false,error:j?.error||r.status}
    }
    suppressPush=true;
    if(j?.state){
      // Legacy HF8.6.11 verification marker: mergeStateProtected(state,j.state,{preferBase:false})
      // HF8.6.12 structurally hydrates j.state before the protected merge.
      const remote=hydrateCloudState(j.state,initialState(),cloudSession.user.id);
      let merged;
      try{merged=mergeStateProtected(state,remote,{preferBase:false})}catch{merged=remote}
      try{state=repairLegacySquadIdentity(merged).state;const restored=backfillConfirmedHeroPowers(state,{now:new Date().toISOString()});state=restored.state}catch{state=remote}
      state=adoptCanonicalPendingAccounts(state,remote,{available:j?.alliance_roster_repair?.status==="canonical_roster_applied"});
      state.player_id=cloudSession.user.id;
      rememberLastGoodState(state,"cloud-post-authoritative");
    }
    cloudRevision=j?.updated_at||cloudRevision;cloudDirty=false;clearTimeout(cloudRetryTimer);cloudRetryTimer=null;
    state.sync={...state.sync,status:"ok",last_sync:j?.updated_at||new Date().toISOString(),last_error:null,pending_cloud_save:false};
    safeLocalSet(STORE_KEY,JSON.stringify(state));rememberAccountState(cloudSession.user.id,state);render();renderProvider();suppressPush=false;
    return {ok:true,state_applied:Boolean(j?.state)}
  }catch(e){suppressPush=false;markCloudPending(e?.name||"offline");return {ok:false,error:e?.name||"offline"}}
}
async function pullDirectOwnProfile(loginSeed=null){
  if(!cloudSession?.access_token||!cloudSession?.user?.id||betaState.allowed!==true||!betaConsentAccepted())return {ok:false,error:"direct_profile_not_authorized"};
  const userId=String(cloudSession.user.id),localFallback=hasMeaningfulCore(loginSeed)?safeClone(loginSeed):(hasMeaningfulCore(state)?safeClone(state):null);
  pendingIdentityAliasesOwner=userId;pendingIdentityAliases=collectPendingIdentityAliases(userId,localFallback,loginSeed,state,readAccountState(userId));
  let pendingCleanupChanged=false;
  const out=await readOwnProfileDirect({url:cloudDataConfig.url,key:cloudDataConfig.key,accessToken:cloudSession.access_token,userId,timeoutMs:10000});
  if(!out?.ok)return out||{ok:false,error:"direct_profile_failed"};
  cloudProfileVerified=true;canonicalRosterReady=false;cloudRevision=out.updated_at||null;betaState={...betaState,restore_error:null};clearTimeout(cloudPullRetryTimer);cloudPullRetryTimer=null;
  if(!out.state){renderBeta();return {ok:true,cloud_empty:true,direct:true};}
  const remote=hydrateCloudState(out.state,initialState(),userId);
  const localTs=Date.parse(state?.updated_at||loginSeed?.updated_at||"")||0,cloudTs=Date.parse(out.updated_at||out.state?.updated_at||"")||0,preferLocal=Boolean(hasMeaningfulCore(localFallback)&&localTs&&cloudTs&&localTs>cloudTs);
  suppressPush=true;
  let merged;
  if(!hasMeaningfulCore(state)&&hasMeaningfulCore(remote))merged=remote;
  else{try{merged=mergeStateProtected(state,remote,{preferBase:preferLocal})}catch{merged=remote}}
   merged=preservePendingRoster(localFallback||state,merged);
   const pendingBefore=JSON.stringify(merged.alliance?.unlinked_accounts||[]);
   merged=adoptCanonicalPendingAccounts(merged,remote,{available:false});
   const pendingRepair=normalizeAlliancePendingState(merged,pendingIdentityAliasesFor(userId));
  merged=pendingRepair.state;pendingCleanupChanged=pendingBefore!==JSON.stringify(merged.alliance?.unlinked_accounts||[]);
  if(hasMeaningfulCore(localFallback)&&!hasMeaningfulCore(merged))merged=hydrateCloudState(localFallback,initialState(),userId);
  let heroPowerBackfillChanged=false;
  try{const recovered=recoverLocalHeroHistory(merged);state=repairLegacySquadIdentity(recovered.state).state;const restored=backfillConfirmedHeroPowers(state,{now:new Date().toISOString()});state=restored.state;heroPowerBackfillChanged=restored.changed}catch{state=remote}
  if(!hasMeaningfulCore(state)&&hasMeaningfulCore(remote))state=remote;
  state.player_id=userId;state.updated_at=preferLocal?(state.updated_at||out.updated_at||new Date().toISOString()):(out.state?.updated_at||out.updated_at||state.updated_at);
  state.sync={...state.sync,status:"ok",last_sync:out.updated_at||new Date().toISOString(),last_error:null,pending_cloud_save:false};
  safeLocalSet(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"cloud-direct-rls-pull");rememberAccountState(userId,state);
  suppressPush=false;render();renderBeta();renderProvider();
  if(preferLocal&&hasMeaningfulCore(state)){cloudDirty=true;scheduleCloudRetry(750)}
  else if((heroPowerBackfillChanged||pendingCleanupChanged)&&hasMeaningfulCore(state))scheduleServerSave(350);
  return {ok:true,cloud_empty:false,direct:true};
}

async function pullServerState(loginSeed=null,{fastRestore=false}={}){
  if(!cloudSession?.access_token)return {skipped:true};
  const userId=String(cloudSession.user?.id||""),localFallback=hasMeaningfulCore(loginSeed)?safeClone(loginSeed):(hasMeaningfulCore(state)?safeClone(state):null);
  pendingIdentityAliasesOwner=userId;pendingIdentityAliases=collectPendingIdentityAliases(userId,localFallback,loginSeed,state,readAccountState(userId));
  let pendingCleanupChanged=false;
  cloudHydrationPending=true;renderBeta();
  try{
    const stateUrl=fastRestore?"/api/state?restore=1":"/api/state",stateTimeout=fastRestore?20000:25000;
    const {response:r,json:j}=await fetchJsonBounded(stateUrl,{cache:"no-store",headers:authHeaders()},stateTimeout);appendServerRestoreTrace(j?.restore_trace);
    if(!r.ok){
      if(j?.error==="database_schema_missing"){state.sync.last_error=t("cloud_schema_missing");state.sync.status="offline";renderProvider()}
      betaState=betaStateAfterVerifiedStateRead(betaState,{ok:false,status:r.status,error:j?.error||"",consentVersion:BETA_CONSENT_VERSION});
      cloudHydrationPending=false;renderBeta();scheduleCloudPullRetry();return {ok:false,error:j?.error||`state_http_${r.status}`,status:r.status}
    }
    // A successful /api/state response can only happen after server-side invitation + consent
    // validation. Treat it as authoritative proof of beta access and reveal the restored state.
    betaState=betaStateAfterVerifiedStateRead(betaState,{ok:true,status:r.status,consentVersion:BETA_CONSENT_VERSION});
    cloudProfileVerified=true;betaState={...betaState,restore_error:null};clearTimeout(cloudPullRetryTimer);cloudPullRetryTimer=null;
    cloudRevision=j?.updated_at||null;
    canonicalRosterReady=j?.alliance_roster_repair?.status==="canonical_roster_applied";
    if(!j?.state){canonicalRosterReady=false;cloudHydrationPending=false;renderBeta();return {ok:true,cloud_empty:true}}

    // HF8.6.12: when the browser has no trustworthy local state, hydrate directly from the
    // authenticated server payload first. This recovery path intentionally avoids all legacy
    // merge/recovery helpers so a client-side TypeError cannot hide a valid cloud profile.
    // Legacy HF8.6.12 verification marker: const remote=hydrateCloudState(j.state,initialState(),userId)
    const hydrateStarted=bootstrapNow(),remote=hydrateCloudState(j.state,initialState(),userId);
    const localTs=Date.parse(state?.updated_at||loginSeed?.updated_at||"")||0,cloudTs=Date.parse(j.updated_at||j.state?.updated_at||"")||0,preferLocal=Boolean(hasMeaningfulCore(localFallback)&&localTs&&cloudTs&&localTs>cloudTs);
    suppressPush=true;
    let merged;
    if(!hasMeaningfulCore(state)&&hasMeaningfulCore(remote))merged=remote;
    else{
      try{merged=mergeStateProtected(state,remote,{preferBase:preferLocal})}catch{merged=hasMeaningfulCore(remote)?remote:hydrateCloudState(localFallback,initialState(),userId)}
    }
    if(j?.alliance_roster_repair?.status==="canonical_roster_applied"&&remote?.alliance){
      try{
        merged.alliance=safeFields(merged.alliance||{},remote.alliance||{},false);
        merged.alliance.members=mergeAllianceMembersProtected(merged.alliance?.members,remote.alliance?.members,false);
      }catch{merged.alliance=remote.alliance}
    }
    merged=preservePendingRoster(localFallback||state,merged);
    const pendingBefore=JSON.stringify(merged.alliance?.unlinked_accounts||[]);
    merged=adoptCanonicalPendingAccounts(merged,remote,{available:canonicalRosterReady});
    const pendingRepair=normalizeAlliancePendingState(merged,pendingIdentityAliasesFor(userId));
    merged=pendingRepair.state;pendingCleanupChanged=pendingBefore!==JSON.stringify(merged.alliance?.unlinked_accounts||[]);
    if(hasMeaningfulCore(localFallback)&&!hasMeaningfulCore(merged))merged=hydrateCloudState(localFallback,initialState(),userId);
    let heroPowerBackfillChanged=false;
    try{
      const localRecovered=recoverLocalHeroHistory(merged);
      state=repairLegacySquadIdentity(localRecovered.state).state;
      const restored=backfillConfirmedHeroPowers(state,{now:new Date().toISOString()});state=restored.state;heroPowerBackfillChanged=restored.changed;
    }catch{state=hydrateCloudState(merged,initialState(),userId)}
    if(!hasMeaningfulCore(state)&&hasMeaningfulCore(remote))state=remote;
    if(canonicalRosterReady&&state?.alliance)state.alliance=applyCanonicalRosterKeys(state.alliance);
    state.player_id=userId;
    state.updated_at=preferLocal&&!j?.alliance_roster_repair?.changed?(state.updated_at||new Date().toISOString()):(j.state?.updated_at||j.updated_at||state.updated_at);
    safeLocalSet(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"cloud-pull");rememberAccountState(userId,state);
    cloudProfileVerified=true;betaState={...betaState,restore_error:null};clearTimeout(cloudPullRetryTimer);cloudPullRetryTimer=null;cloudHydrationPending=false;pushBootstrapStage("PROFILE_HYDRATE",bootstrapNow()-hydrateStarted,"ok");render();renderBeta();suppressPush=false;
    // If an unsent local state is newer (for example because an oversized keepalive write was
    // deferred), push it normally in the foreground after the authoritative pull/merge.
    if(preferLocal&&hasMeaningfulCore(state)){cloudDirty=true;scheduleCloudRetry(750)}
    else if((heroPowerBackfillChanged||pendingCleanupChanged)&&hasMeaningfulCore(state))scheduleServerSave(350);
    return {ok:true,cloud_empty:false,canonical_alliance:canonicalRosterReady}
  }catch(e){
    suppressPush=false;
    cloudHydrationPending=false;
    if(hasMeaningfulCore(localFallback)){
      state=hydrateCloudState(localFallback,initialState(),userId);
      safeLocalSet(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"cloud-pull-exception-fallback");rememberAccountState(userId,state);render();
    }
    renderBeta();scheduleCloudPullRetry();return {ok:false,error:e?.name||"offline"}
  }
}

async function refreshServerTime(){try{const {response:r,json:j}=await fetchJsonBounded("/api/health?clock=1",{cache:"no-store"},5000);if(!r.ok)throw new Error();serverNow=new Date(j.now);state.vs.week=j.iso_week;state.vs.day=j.vs_day;$("#syncPill").className="syncState good";$("#syncPill").textContent=t("server_ok")}catch{serverNow=new Date();state.vs.week=isoWeek(serverNow);state.vs.day=vsDayFromServer(serverNow);$("#syncPill").className="syncState";$("#syncPill").textContent=t("local_time")}renderClock();render()}
function renderClock(){const d=serverNow;const clock=$("#serverClock"),day=$("#serverDay");if(clock)clock.textContent=d.toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit",second:"2-digit"});if(day)day.textContent=`${d.toLocaleDateString(locale,{weekday:"long",day:"2-digit",month:"short"})} · ${t("week")} ${currentVsWeek()}`}
function startForegroundRefreshes({refreshTime=false}={}){
  if(foregroundPausedAt){serverNow=new Date(serverNow.getTime()+Math.max(0,Date.now()-foregroundPausedAt));foregroundPausedAt=null;renderClock()}
  if(foregroundClockInterval===null)foregroundClockInterval=setInterval(()=>{serverNow=new Date(serverNow.getTime()+1000);renderClock()},1000);
  if(foregroundServerTimeInterval===null)foregroundServerTimeInterval=setInterval(refreshServerTime,5*60*1000);
  if(refreshTime)void refreshServerTime();
}
function stopForegroundRefreshes(){
  if(foregroundClockInterval!==null){clearInterval(foregroundClockInterval);foregroundClockInterval=null}
  if(foregroundServerTimeInterval!==null){clearInterval(foregroundServerTimeInterval);foregroundServerTimeInterval=null}
  if(foregroundPausedAt===null)foregroundPausedAt=Date.now();
}

async function restoreAuthenticatedProfile(loginSeed=null,{reason="session"}={}){
  if(!cloudSession?.access_token||!betaConsentAccepted())return {ok:false,skipped:true,error:"restore_not_ready"};
  cloudHydrationPending=true;betaState={...betaState,restore_error:null};renderBeta();
  // Verify beta access in parallel with the profile read. This lets a returning player
  // keep using trusted same-account local data even if /api/state is slower on mobile.
  const betaCheckPromise=runBootstrapStage("BETA_CHECK_PARALLEL",()=>refreshBeta()).catch(()=>null);
  let pulled=await runBootstrapStage("STATE_API",()=>pullServerState(loginSeed,{fastRestore:true}));
  if(pulled?.ok&&!pulled?.cloud_empty&&!pulled.canonical_alliance){
    pulled=await runBootstrapStage("STATE_API_CANONICAL",()=>pullServerState(loginSeed,{fastRestore:false}));
  }
  await betaCheckPromise;
  if(!pulled?.ok&&!pulled?.cloud_empty){
    if(betaState.allowed===true&&!cloudProfileVerified)pulled=await runBootstrapStage("DIRECT_PROFILE",()=>pullDirectOwnProfile(loginSeed));
  }
  if(pulled?.ok&&!pulled?.cloud_empty&&!pulled.canonical_alliance){
    pulled=await runBootstrapStage("STATE_API_CANONICAL",()=>pullServerState(loginSeed,{fastRestore:false}));
  }
  // Never treat an old cloudProfileVerified=true from a previous token as proof that
  // this restore attempt succeeded. That stale flag caused the permanent "Synchronisation…" state.
  const success=restoreAttemptSucceeded(pulled);
  if(success){betaState={...betaState,restore_error:null};finishBootstrapDiagnostics("ready")}
  else if(betaState.allowed===false&&["invite-required","revoked","expired"].includes(String(betaState.access_status||""))){finishBootstrapDiagnostics("access-blocked")}
  else{const failure=lastBootstrapFailure();betaState={...betaState,restore_error:failure?.error||pulled?.error||"profile_restore_failed",access_status:betaState.allowed?betaState.access_status:"restore-failed"};finishBootstrapDiagnostics("restore-failed");scheduleCloudPullRetry(3000)}
  cloudHydrationPending=false;render();renderAuth();renderBeta();queueCriticalUiRepaint();
  return pulled||{ok:false,error:"profile_restore_failed",reason};
}
async function retryCloudProfileRestore(){if(!cloudSession?.access_token||!betaConsentAccepted())return;const btn=$("#betaRestoreRetryBtn");if(btn)btn.disabled=true;resetBootstrapDiagnostics("manual-retry");try{const seed=readAccountState(cloudSession.user?.id);await restoreAuthenticatedProfile(seed,{reason:"manual-retry"});const code=pendingJoinCode();if(code)state.alliance.invite_code=code;void refreshPro()}finally{if(btn)btn.disabled=false;renderBeta()}}

// HF8.6.25: one runtime reconciliation path for login, resume, reconnect and retry.
// It prevents different lifecycle events from running different partial cloud workflows.
async function reconcileAuthenticatedRuntime(reason="runtime",{force=false}={}){
  if(runtimeReconcileInFlight){
    const current=runtimeReconcileInFlight;
    if(force&&!runtimeReconcileInFlightForce){
      await current.catch(()=>{});
      if(runtimeReconcileInFlight===current)return current;
      return reconcileAuthenticatedRuntime(reason,{force:true});
    }
    return current;
  }
  const task=(async()=>{
    const userId=String(cloudSession?.user?.id||"");
    if(!userId||!cloudSession?.access_token){render();renderAuth();renderBeta();return {ok:false,skipped:true,reason:"signed-out"}}
    const ownerId=String(state?.player_id||"");
    if(ownerId&&ownerId!==userId){
      if(hasMeaningfulCore(state))rememberAccountState(ownerId,state);
      const own=readAccountState(userId);state=hasMeaningfulCore(own)?hydrateCloudState(own,initialState(),userId):initialState();state.player_id=userId;
    }
    render();renderAuth();renderBeta();renderPro();
    if(!betaConsentAccepted()){if(force||betaState?.access_status==="checking"||betaState?.allowed!==true)await refreshBeta();return {ok:true,consent_required:true}}
    const needsRestore=Boolean(force||!cloudProfileVerified||betaState?.restore_error||betaState?.access_status==="checking"||betaState?.allowed!==true);
    let result={ok:true,reused:true};
    if(needsRestore)result=await restoreAuthenticatedProfile(readAccountState(userId),{reason});
    else if(force||Date.now()-lastRuntimeReconcileAt>60000)await refreshBeta();
    if(cloudDirty&&betaAccessAllowed()&&betaConsentAccepted())void pushServerState();
    lastRuntimeReconcileAt=Date.now();render();renderAuth();renderBeta();renderPro();queueCriticalUiRepaint();
    return result;
  })();
  runtimeReconcileInFlight=task;
  runtimeReconcileInFlightForce=Boolean(force);
  try{return await task}finally{if(runtimeReconcileInFlight===task){runtimeReconcileInFlight=null;runtimeReconcileInFlightForce=false}}
}
function showIdleResumeStatus(kind){
  const node=$("#idleResumeStatus");if(!node)return;
  clearTimeout(idleResumeStatusTimer);
  const french=String(document.documentElement.lang||"fr").toLowerCase().startsWith("fr");
  const messages={
    working:french?"Mise à jour WarBoost…":"Updating WarBoost…",
    done:french?"À jour":"Up to date",
    reconnect:french?"Session expirée — reconnecte-toi pour continuer.":"Session expired — sign in again to continue.",
    failed:french?"Mise à jour impossible pour le moment. Tes données sont conservées.":"Update unavailable right now. Your data is preserved."
  };
  node.textContent=messages[kind]||messages.working;node.classList.remove("hidden");
  if(kind!=="working")idleResumeStatusTimer=setTimeout(()=>node.classList.add("hidden"),kind==="done"?1800:4500);
}
async function performIdleResume(reason="idle-return"){
  if(idleResumeInFlight)return idleResumeInFlight;
  const task=(async()=>{
    showIdleResumeStatus("working");
    try{
      const result=await runAuthenticatedIdleResume({
        auth:cloud?.auth,currentSession:cloudSession,
        setSession:session=>{cloudSession=session;renderAuth()},
        applySession,reconcile:reconcileAuthenticatedRuntime
      });
      if(result?.reauthRequired){
        startForegroundRefreshes();
        showIdleResumeStatus("reconnect");
        return result;
      }
      if(result?.skipped){startForegroundRefreshes();$("#idleResumeStatus")?.classList.add("hidden");return result}
      startForegroundRefreshes({refreshTime:true});
      showIdleResumeStatus(result?.ok===false?"failed":"done");
      return result;
    }catch(error){
      startForegroundRefreshes();
      showIdleResumeStatus("failed");
      return {ok:false,error:error?.name||"idle_resume_failed"};
    }
  })();
  idleResumeInFlight=task;
  try{return await task}finally{if(idleResumeInFlight===task)idleResumeInFlight=null}
}

/* Legacy HF8.6.17 verification-only source marker (non-executable):
if(betaConsentAccepted()&&!cloudProfileVerified){
  const seed=readAccountState(cloudSession?.user?.id); await pullServerState(seed,{fastRestore:true})
}
*/



function playerOnboardingStatus(){
  const profileReady=Boolean(String(state?.player?.name||"").trim()&&String(state?.player?.server_id||"").trim()&&Number(state?.player?.hq_level)>0);
  const mainReady=squadHasSavedData(state?.squads?.[0]);
  const droneReady=Number(state?.drone?.level)>0||Number(state?.drone?.power_m)>0;
  const next_type=!profileReady?"profile":!mainReady?"squad1":!droneReady?"drone":null;
  return {profileReady,mainReady,droneReady,next_type,complete:profileReady&&mainReady&&droneReady};
}
function playerNeedsOnboarding(){return !playerOnboardingStatus().complete}
function renderPlayerOnboarding(){
  const box=$("#playerOnboarding"),steps=$("#playerOnboardingSteps"),btn=$("#playerOnboardingScanBtn");if(!box)return;
  const status=playerOnboardingStatus(),visible=betaPrivateDataVisible()&&!status.complete;box.classList.toggle("hidden",!visible);if(!visible)return;
  const rows=[["profile",t("onboarding_profile"),status.profileReady],["squad1",t("onboarding_main_squad"),status.mainReady],["drone",t("onboarding_drone"),status.droneReady]];
  if(steps)steps.innerHTML=rows.map(([type,label,done])=>`<button type="button" class="onboardingStep${done?" done":""}" data-onboarding-scan="${type}"><span>${done?"✅":"○"}</span><b>${esc(label)}</b><small>${esc(t(done?"onboarding_done":"onboarding_to_do"))}</small></button>`).join("");
  if(btn){btn.dataset.nextScan=status.next_type||"profile";btn.textContent=t(status.next_type==="squad1"?"onboarding_scan_squad":status.next_type==="drone"?"onboarding_scan_drone":"onboarding_scan_profile")}
  steps?.querySelectorAll("[data-onboarding-scan]").forEach(x=>x.addEventListener("click",()=>openQuickScan(x.dataset.onboardingScan)));
}
function renderAllianceAccess(){
  const notice=$("#allianceAccessNotice"),access=allianceCommandAccess(),role=access.role,manager=access.allowed,hasProfile=Boolean(state?.player?.name);
  document.querySelectorAll("#allianceDrawer .allianceManagerOnly").forEach(el=>el.classList.toggle("hidden",!manager));
  if(notice){
    const needsVerificationNotice=Boolean(manager&&access.roleSource==="profile_declared");
    notice.classList.toggle("hidden",manager&&!needsVerificationNotice);
    notice.className=`notice allianceAccessNotice${manager&&!needsVerificationNotice?" hidden":" warn"}`;
    notice.textContent=!hasProfile?t("alliance_scan_profile_first"):managerOnlyMessage();
    if((!manager||needsVerificationNotice)&&access.roleSource==="profile_declared"&&cloudSession?.access_token){
      notice.innerHTML=`${esc(notice.textContent)} <button type="button" class="smallBtn allianceRoleRefreshBtn">${esc(t("manager_role_refresh"))}</button>`;
      notice.querySelector(".allianceRoleRefreshBtn")?.addEventListener("click",()=>refreshAllianceRoleAccess(notice));
    }
  }
}
function renderVsAccess(){
  const notice=$("#vsAccessNotice"),known=scoreKnown(state?.vs||{}),fresh=vsSnapshotFreshness(state?.vs||{},{now:serverNow});if(!notice)return;
  notice.classList.toggle("hidden",known&&fresh.current);notice.className=`notice${known&&!fresh.current?" warn":""}${known&&fresh.current?" hidden":""}`;
  notice.textContent=known&&!fresh.current?t("vs_status_stale"):t("vs_start_notice");
}
function renderSeasonAccess(){
  const notice=$("#seasonAccessNotice"),life=seasonLifecycle(state?.season||{});if(!notice)return;
  const confirmed=life==="active"||life==="ended"||life==="interseason";
  notice.className=`notice${confirmed?" hidden":" warn"}`;
  notice.textContent=confirmed?"":t("season_start_notice");
  // HF8.6.27: do not leave an empty amber notice visible when the season state is already confirmed.
  notice.hidden=confirmed;
  notice.style.display=confirmed?"none":"";
}
function openQuickScan(type){if(!requireBetaAccess()||!requireBetaConsent())return;openDrawer("scan");renderScanTypeOptions();if($("#scanType"))$("#scanType").value=type;updateSquadCaptureHelp(type)}

function qg35Text(key,params={}){
  const translated={...params};
  for(const [name,value] of Object.entries(translated))if(name.endsWith("_key")&&typeof value==="string")translated[name]=t(value);
  return esc(t(key,translated));
}
function qg35Value(value){
  if(value===null||value===undefined||value==="")return qg35Text("qg35_unknown_value");
  if(typeof value==="number")return esc(new Intl.NumberFormat(lang==="fr"?"fr-FR":"en-US",{maximumFractionDigits:2}).format(value));
  return esc(String(value));
}
function qg35Facts(facts){
  if(!Array.isArray(facts)||!facts.length)return `<p class="qg35NoData">${qg35Text("qg35_not_tracked")}</p>`;
  return `<ul class="qg35FactList">${facts.map(fact=>`<li><b>${esc(String(fact.label||""))}</b>${fact.label?": ":""}${qg35Value(fact.value)}</li>`).join("")}</ul>`;
}
function qg35DetailSection(titleKey,content){return `<details class="qg35DetailSection"><summary>${qg35Text(titleKey)}</summary><div class="qg35DetailBody">${content}</div></details>`}
function qg35AdvancedAccess(){
  return hasEndgameCoachProAccess({
    betaMode:safeLaunchBetaMode(),betaAllowed:betaAccessAllowed(),
    betaConsentAccepted:betaConsentAccepted(),proActive:Boolean(proState?.active)
  });
}
function hideEndgameCoach(){
  $("#qg35CoachCard")?.classList.add("hidden");
  $("#qg35UnknownPrompt")?.classList.add("hidden");
  const content=$("#qg35CoachContent");if(content)content.innerHTML="";
}
function renderEndgameCoachHome(){
  const card=$("#qg35CoachCard"),unknown=$("#qg35UnknownPrompt"),meta=$("#qg35HomeMeta");
  if(!card||!unknown)return;
  if(!betaPrivateDataVisible()){hideEndgameCoach();return}
  const report=createEndgameCoachReport(state);
  const homeState=deriveEndgameCoachHomeState(report,{privateVisible:true});
  card.classList.remove("hidden");
  card.disabled=!homeState.active;
  card.setAttribute("aria-disabled",String(!homeState.active));
  card.dataset.qg35State=homeState.state;
  card.classList.toggle("qg35HomeLocked",homeState.state==="locked");
  card.classList.toggle("qg35HomeUnknown",homeState.state==="unknown");
  const titleKey=homeState.active?"qg35_analyze_button":"qg35_title";
  const descriptionKey=homeState.active?"qg35_home_desc":homeState.state==="locked"?"qg35_locked_desc":"qg35_unknown_card_desc";
  const title=card.querySelector("h2"),description=$("#qg35HomeDesc");
  if(title){title.dataset.i18n=titleKey;title.textContent=t(titleKey)}
  if(description){description.dataset.i18n=descriptionKey;description.textContent=t(descriptionKey)}
  const statusKey=homeState.active?"qg35_hq_eligible":homeState.state==="locked"?"qg35_locked_status":"qg35_unknown_status";
  if(meta)meta.textContent=t(statusKey,homeState.active?{hq:report.eligibility.hq_level}:{});
  card.setAttribute("aria-label",t(homeState.active?"qg35_analyze_button":statusKey,homeState.active?{hq:report.eligibility.hq_level}:{}));
  unknown.classList.toggle("hidden",!homeState.showProfileScan);
}
function qg35ScanType(actionKey){
  return ({
    qg35_action_scan_squad:"squad1",
    qg35_action_review_composition:"squad1",
    qg35_action_scan_drone:"drone",
    qg35_action_scan_exclusive:"exclusive",
    qg35_action_scan_gear:"squad1"
  })[actionKey]||null;
}
function renderEndgameCoachDrawer(){
  const content=$("#qg35CoachContent");if(!content)return;
  if(!betaPrivateDataVisible()){content.innerHTML=`<div class="notice">${esc(betaAccessMessage())}</div>`;return}
  const report=createEndgameCoachReport(state);
  if(!report.eligibility.eligible){content.innerHTML=`<div class="notice">${qg35Text("qg35_not_eligible")}</div>`;return}
  const confidenceLabel=t(`qg35_confidence_${report.confidence.band}`);
  const priorities=report.top_priorities.map((item,index)=>{
    const scanType=qg35ScanType(item.action_key);
    return `<article class="qg35Priority">
      <div class="qg35PriorityHead"><span>${qg35Text(`qg35_priority_${index+1}`)}</span><span>${qg35Text(item.system_key,item.params)}</span></div>
      <h3>${qg35Text(item.action_key,item.params)}</h3>
      <p><b>${qg35Text("qg35_gain_label")}:</b> ${qg35Text(item.gain_key,item.params)}</p>
      <button class="smallBtn qg35WhyToggle" type="button" data-qg35-why="${index}" aria-expanded="false">${qg35Text("qg35_why")}</button>
      <p id="qg35Why${index}" class="qg35WhyText hidden">${qg35Text(item.why_key,item.params)}</p>
      ${scanType?`<button class="secondaryBtn qg35WhyToggle" type="button" data-qg35-scan-type="${esc(scanType)}">${qg35Text("qg35_scan_now")}</button>`:""}
    </article>`;
  }).join("");
  const missing=report.missing_data.length
    ?`<ul class="qg35MissingList">${report.missing_data.map(item=>`<li>${qg35Text(item.message_key)}</li>`).join("")}</ul>`
    :`<p>${qg35Text("qg35_no_missing_data")}</p>`;
  const summary=`<section class="qg35Intro"><strong>${qg35Text("qg35_summary_title")}</strong>
    <p>${qg35Text("qg35_summary_intro")}</p>
    <div class="qg35Confidence">${qg35Text("qg35_confidence_label")}: <b>${esc(confidenceLabel)}</b> · ${qg35Text("qg35_confidence_detail",{score:report.confidence.score})}</div>
  </section><div class="qg35Priorities">${priorities}</div>`;
  const bottleneck=qg35DetailSection("qg35_section_bottleneck",
    `<p><b>${qg35Text(report.bottleneck.system_key,report.bottleneck.params)}</b></p><p>${qg35Text(report.bottleneck.diagnosis_key,report.bottleneck.params)}</p>
    <p>${qg35Text(report.bottleneck.is_data_limited?"qg35_data_limited":"qg35_bottleneck_relative_note")}</p>`);
  const plan=report.seven_day_plan.map(item=>{
    const action=item.action
      ?`${qg35Text(item.action.system_key,item.action.params)} — ${qg35Text(item.action.action_key,item.action.params)}`
      :qg35Text(item.action_key);
    const use=item.use_now.length?item.use_now.map(name=>esc(name)).join(", "):qg35Text("qg35_no_spend_scheduled");
    const conserve=item.conserve.length?item.conserve.map(name=>esc(name)).join(", "):qg35Text("qg35_none_known");
    return `<li><b>${qg35Text("qg35_day_label",{day:item.day})}</b> ${action}<br><span>${qg35Text("qg35_use_now")}: ${use} · ${qg35Text("qg35_conserve")}: ${conserve}</span><br><span>${qg35Text(item.wait_for_event_key)}</span></li>`;
  }).join("");
  const resources=report.resources.length?report.resources.map(item=>{
    const statusKey=item.recommendation==="UTILISER"?"qg35_resource_use_label":item.recommendation==="PRIORITÉ FAIBLE"?"qg35_resource_low_label":"qg35_resource_keep_label";
    return `<div class="qg35Resource"><strong>${esc(item.name)}</strong><span class="qg35StatusPill">${qg35Text(statusKey)}</span>
      <p>${qg35Text("qg35_stock_label")}: ${qg35Value(item.stock)} · ${qg35Text(item.reason_key)}</p>
      ${item.next_use?`<p>${qg35Text("qg35_next_use_cost",{cost:item.next_use.cost})} · ${qg35Text("qg35_expected_gain_label")}: ${qg35Value(item.next_use.expected_gain)}</p>`:""}
    </div>`;
  }).join(""):`<p class="qg35NoData">${qg35Text("qg35_resources_unknown")}</p>`;
  const heroRows=report.squad1.heroes.length?report.squad1.heroes.map(hero=>`<div class="qg35HeroRow">
    <b>${esc(hero.name)}</b> · ${qg35Text(hero.type_label_key)}
    <p>${qg35Text("qg35_level_label")}: ${qg35Value(hero.level)} · ${qg35Text("qg35_stars_label")}: ${qg35Value(hero.stars)} · ${qg35Text("qg35_weapon_level_label")}: ${qg35Value(hero.weapon_level)}</p>
    <p>${qg35Text("qg35_skills_label")}: ${qg35Text(hero.skills_known?"qg35_known":"qg35_unknown_value")} · ${qg35Text("qg35_gear_label")}: ${qg35Text(hero.gear_known?"qg35_known":"qg35_unknown_value")}</p>
  </div>`).join(""):`<p class="qg35NoData">${qg35Text("qg35_missing_squad_composition")}</p>`;
  const roles=`<p>${qg35Text("qg35_frontline_label")}: ${qg35Text(report.squad1.frontline==="known"?"qg35_known":"qg35_unknown_value")} · ${qg35Text("qg35_dps_label")}: ${qg35Text(report.squad1.dps==="known"?"qg35_known":"qg35_unknown_value")}</p>`;
  const technology=`<p>${qg35Text("qg35_squad_main_type",{type_key:report.technology_route.main_type_label_key})}</p>
    <p>${report.technology_route.mastery_pct===null?qg35Text("qg35_mastery_unknown"):qg35Text(report.technology_route.mastery_type_confirmed?"qg35_mastery_known":"qg35_mastery_untyped",{value:report.technology_route.mastery_pct})}</p>
    ${report.technology_route.next_research
      ?`<p>${qg35Text("qg35_next_technology")}: <b>${esc(report.technology_route.next_research.name)}</b> · ${qg35Text("qg35_source_label")}: ${esc(report.technology_route.next_research.source)}</p>`
      :`<p>${qg35Text("qg35_next_tech_unknown")}</p>`}
    ${report.technology_route.known_fields.length?`<ul class="qg35FactList">${report.technology_route.known_fields.map(item=>`<li>${qg35Text(`qg35_tech_${item.key}`)}: ${qg35Value(item.value)}%</li>`).join("")}</ul>`:`<p class="qg35NoData">${qg35Text("qg35_missing_technology")}</p>`}`;
  const heroWeaponDetail=`${heroRows}<p>${qg35Text(report.heroes_weapons.status_key)}</p>`;
  const droneDetail=`<p>${qg35Text("qg35_drone_level_label")}: ${qg35Value(report.drone.level)} · ${qg35Text("qg35_drone_power_label")}: ${report.drone.power_m===null?qg35Text("qg35_unknown_value"):esc(fmtPower(report.drone.power_m))}</p>
    <div><b>${qg35Text("qg35_drone_components")}</b>${qg35Facts(report.drone.components)}</div>
    <div><b>${qg35Text("qg35_drone_chips")}</b>${qg35Facts(report.drone.chips)}</div><p>${qg35Text(report.drone.status_key)}</p>`;
  const bonusDetail=`<h4>${qg35Text("qg35_decorations_label")}</h4>${qg35Facts(report.decorations_overlord_season.decorations)}
    <h4>${qg35Text("qg35_overlord_label")}</h4>${qg35Facts(report.decorations_overlord_season.overlord)}
    <h4>${qg35Text("qg35_t11_label")}</h4>${qg35Facts(report.decorations_overlord_season.t11)}
    <h4>${qg35Text("qg35_season_label")}</h4>${qg35Facts(report.decorations_overlord_season.season)}
    <h4>${qg35Text("qg35_awakening_label")}</h4>${report.decorations_overlord_season.awakening.length?report.decorations_overlord_season.awakening.map(item=>`<p><b>${esc(item.hero)}</b>${qg35Facts(item.facts)}</p>`).join(""):qg35Facts([])}`;
  const antiWaste=report.anti_waste.length
    ?report.anti_waste.map(item=>`<p>${qg35Text(item.message_key,item.params||{})}</p><p>${qg35Text("qg35_source_label")}: ${(item.sources||[]).map(value=>esc(value)).join(" · ")}</p>`).join("")
    :`<p>${qg35Text("qg35_anti_waste_unavailable")}</p>`;
  const beforeAfter=report.before_after.available
    ?`<p>${qg35Text("qg35_metric_label")}: ${esc(report.before_after.metric)} (${esc(report.before_after.unit)})</p><p>${qg35Text("qg35_before_value")}: ${qg35Value(report.before_after.before)} · ${qg35Text("qg35_after_value")}: ${qg35Value(report.before_after.after)}</p><p>${qg35Text("qg35_source_label")}: ${esc(report.before_after.source)}</p>`
    :`<p>${qg35Text(report.before_after.message_key)}</p>`;
  const advanced=`<div class="qg35AdvancedSections">
    ${bottleneck}
    ${qg35DetailSection("qg35_section_seven_days",`<ol class="qg35PlanList">${plan}</ol>`)}
    ${qg35DetailSection("qg35_section_resources",resources)}
    ${qg35DetailSection("qg35_section_squad1",`${roles}${heroRows}`)}
    ${qg35DetailSection("qg35_section_technology",technology)}
    ${qg35DetailSection("qg35_section_heroes_weapons",heroWeaponDetail)}
    ${qg35DetailSection("qg35_section_drone",droneDetail)}
    ${qg35DetailSection("qg35_section_bonuses",bonusDetail)}
    ${qg35DetailSection("qg35_section_anti_waste",antiWaste)}
    ${qg35DetailSection("qg35_section_before_after",beforeAfter)}
    ${qg35DetailSection("qg35_missing_title",missing)}
  </div>`;
  const advancedPanel=qg35AdvancedAccess()?advanced:`<section class="qg35LockedPanel">
    <strong>${qg35Text("qg35_pro_locked_title")}</strong><p>${qg35Text("qg35_pro_locked_text")}</p>
    <button class="primaryAction qg35ProButton" type="button" data-qg35-pro>${qg35Text("qg35_pro_details_button")}</button>
  </section>`;
  content.innerHTML=summary+advancedPanel;
}

// HF8.6.22: each visible surface has its own render boundary. No optional module may
// leave another surface stale simply because one formatting/render step throws.
function renderHomePlayerMeta(p){const el=$("#playerMeta");if(el)el.textContent=p?.name?(p?.hq_level?`${t("hq")} ${p.hq_level}`:t("connected")):t("to_connect")}
function renderHomeAllianceMeta(p,a){const el=$("#allianceMeta");if(el)el.textContent=a?.tag?`${a.tag} · ${normalizedRole(p?.role)}`:"—"}
function renderHomeVsMeta(v){const el=$("#vsMeta");if(!el)return;const sit=vsSituation(v||{}),fresh=vsSnapshotFreshness(v||{},{now:serverNow});el.textContent=scoreKnown(v||{})&&fresh.current&&sit.our_share!==null?`${Math.round(sit.our_share)}%${Number(v?.personal_rank)>0?` · #${Number(v.personal_rank)}`:""}`:scoreKnown(v||{})&&!fresh.current?t("vs_status_stale"):`${t("week")} ${currentVsWeek()}`}
function renderPlayerCoreSummary(p,d){if($("#pName"))$("#pName").textContent=canonicalPlayerDisplayName()||p?.name||"—";if($("#pHq"))$("#pHq").textContent=p?.hq_level?`${t("hq")} ${p.hq_level}`:t("to_fill");if($("#pPower"))$("#pPower").textContent=Number(p.power_m)>0?fmtPower(p.power_m):t("to_fill");if($("#pDrone"))$("#pDrone").textContent=d?.level?`${t("level")}${d.level}${d.power_m?` · ${fmtPower(d.power_m)}`:""}`:Number(d?.power_m)>0?fmtPower(d.power_m):t("to_fill")}
function renderAllianceCoreSummary(p,a){if($("#aTag"))$("#aTag").textContent=a?.tag||"—";if($("#aCount"))$("#aCount").textContent=String(a?.members?.length||0);if($("#aRole"))$("#aRole").textContent=a?.role||"R1";const access=allianceCommandAccess(),cloudAlliance=Boolean(a.id||a.invite_code),canShareAllianceInvite=access.allowed&&(!cloudAlliance||access.cloudAvailable);if($("#inviteCode"))$("#inviteCode").textContent=canShareAllianceInvite?(a?.invite_code||"—"):"—";const inviteNote=$("#inviteNote");if(inviteNote)inviteNote.textContent=t("invite_note_scoped",{server:p?.server_id||"—",alliance:a?.tag||"—"});const shareInvite=$("#shareInviteBtn");if(shareInvite)shareInvite.disabled=!canShareAllianceInvite;if($("#rosterFresh"))$("#rosterFresh").textContent=a?.updated_at?updatedLabel(a.updated_at):t("sync_needed")}
function renderSeasonCoreSummary(s){const seasonLife=seasonLifecycle(s||{}),seasonActive=seasonIsActive(s||{}),pct=activeSeasonProgress(s||{}),baseSeasonName=s?.name||(s?.number?`S${s.number}`:"—"),seasonHistorical=(seasonLife==="ended"||seasonLife==="interseason");renderSeasonAccess();if($("#seasonMeta"))$("#seasonMeta").textContent=seasonLife==="interseason"?t("season_interseason"):seasonLife==="ended"?t("season_ended_short"):baseSeasonName;const seasonDesc=$("#seasonDesc");if(seasonDesc)seasonDesc.textContent=seasonLife==="interseason"?`${t("season_ended_short")} · ${t("season_interseason")}`:seasonLife==="ended"?t("season_ended_short"):t("season_desc");if($("#sName"))$("#sName").textContent=seasonHistorical?`${baseSeasonName} · ${t("season_ended_short")}`:baseSeasonName;if($("#sDay"))$("#sDay").textContent=seasonActive?(s?.day||"—"):"—";if($("#sProfession"))$("#sProfession").textContent=s?.profession||"—";const professionLabel=$("#seasonProfessionLabel"),seasonSectionTitle=$("#seasonSectionTitle");if(professionLabel)professionLabel.textContent=seasonHistorical?t("season_last_profession_short"):t("profession");if(seasonSectionTitle)seasonSectionTitle.textContent=seasonHistorical?t("season_state"):t("season_progress");const bar=$("#seasonProgressBar"),label=$("#seasonProgressLabel"),progressWrap=bar?.closest(".progress");if(progressWrap)progressWrap.classList.toggle("hidden",!seasonActive||pct===null);if(bar)bar.style.width=`${pct??0}%`;if(label)label.textContent=seasonLife==="interseason"?t("season_interseason"):seasonLife==="ended"?t("season_ended_short"):pct===null?t("season_unknown"):`${pct}%`;const lifeSelect=$("#seasonLifecycleSelect");if(lifeSelect)lifeSelect.value=seasonLife;const lifeStatus=seasonLife==="interseason"?t("season_interseason_note",{name:baseSeasonName,profession:s?.profession||"—"}):seasonLife==="ended"?t("season_ended_note",{name:baseSeasonName,profession:s?.profession||"—"}):seasonLife==="unknown"?t("season_unknown_note"):s?.updated_at?`${t("last_update",{ago:fmtAgo(s.updated_at)})} · ${s?.resistance??"—"}`:t("season_wait");if($("#seasonStatus"))$("#seasonStatus").textContent=lifeStatus}
function maskHomePrivateMeta(){if($("#playerMeta"))$("#playerMeta").textContent=t("to_connect");if($("#allianceMeta"))$("#allianceMeta").textContent="—";if($("#vsMeta"))$("#vsMeta").textContent="—";if($("#seasonMeta"))$("#seasonMeta").textContent="—"}
function maskPlayerPrivateSummary(){if($("#pName"))$("#pName").textContent="—";if($("#pHq"))$("#pHq").textContent="—";if($("#pPower"))$("#pPower").textContent="—";if($("#pDrone"))$("#pDrone").textContent="—";const squadList=$("#squadList");if(squadList)squadList.innerHTML="";$("#playerOnboarding")?.classList.add("hidden")}
function maskAlliancePrivateSummary(){if($("#aTag"))$("#aTag").textContent="—";if($("#aCount"))$("#aCount").textContent="0";if($("#aRole"))$("#aRole").textContent="—";if($("#inviteCode"))$("#inviteCode").textContent="—";if($("#shareInviteBtn"))$("#shareInviteBtn").disabled=true}
function render(){
  const p=state.player,a=state.alliance,v=state.vs,s=state.season,d=state.drone||{},reveal=betaPrivateDataVisible();
  if(!$("#playerMeta"))return;

  // V2.5.20 privacy boundary: saved local/cloud data is preserved in state but is never rendered
  // until an invited WarBoost session is active and beta consent is accepted.
  if(!reveal){
    // Legacy privacy verification markers retained after HF8.6.22 render isolation:
    // $("#playerMeta").textContent=t("to_connect"); $("#allianceMeta").textContent="—";
    // Account fields are a security boundary: clear them immediately, independently of every other module render.
    safeRenderStep("ACCOUNT_FIELDS",renderAccountFields);
    safeRenderStep("MASK_HOME",maskHomePrivateMeta);
    safeRenderStep("MASK_PLAYER",maskPlayerPrivateSummary);
    document.querySelectorAll("#allianceDrawer .allianceManagerOnly").forEach(el=>el.classList.add("hidden"));
    const exclusive=$("#exclusiveWeaponList");if(exclusive)exclusive.innerHTML="";
    if($("#exclusiveWeaponCount"))$("#exclusiveWeaponCount").textContent="0";
    safeRenderStep("MASK_ALLIANCE",maskAlliancePrivateSummary);
    $("#rosterFresh").textContent=t("sync_needed");
    const members=$("#memberList");if(members)members.innerHTML=`<div class="notice">${esc(betaAccessMessage())}</div>`;
    const activity=$("#activitySummary");if(activity)activity.innerHTML=`<div><b>🟢 0</b><small>${esc(t("activity_active_confirmed"))}</small></div><div><b>⚪ 0</b><small>${esc(t("activity_insufficient_data"))}</small></div><div><b>🔴 0</b><small>${esc(t("activity_inactive_confirmed"))}</small></div>`;
    if($("#activityNote"))$("#activityNote").textContent=betaAccessMessage();
     if($("#activityEventGrid"))$("#activityEventGrid").innerHTML="";if($("#playerActivityStatus"))$("#playerActivityStatus").textContent=betaAccessMessage();if($("#playerActivityPill"))$("#playerActivityPill").textContent="—";$("#playerAvailabilitySection")?.classList.add("hidden");$("#eventAvailabilityManagerSection")?.classList.add("hidden");if($("#allianceIdentitySummary"))$("#allianceIdentitySummary").textContent=betaAccessMessage();if($("#allianceParticipationTable"))$("#allianceParticipationTable").innerHTML="";if($("#unlinkedWarBoostAccounts"))$("#unlinkedWarBoostAccounts").innerHTML="";$("#unlinkedWarBoostDetails")?.classList.add("hidden");
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
    if($("#seasonStatus"))$("#seasonStatus").textContent=betaAccessMessage();
    safeRenderStep("MASK_QG35_COACH",hideEndgameCoach);
    $("#proPriorityPanel")?.classList.add("hidden");
    if($("#allianceImmediate")){ $("#allianceImmediate").classList.add("hidden"); $("#allianceImmediate").innerHTML=""; }
    if($("#alliancePlanB")){ $("#alliancePlanB").classList.add("hidden"); $("#alliancePlanB").innerHTML=""; }
    if($("#warPlanText"))$("#warPlanText").textContent=t("war_plan_empty");
    if($("#desertStormRosterPicker"))$("#desertStormRosterPicker").innerHTML=`<div class="notice">${esc(betaAccessMessage())}</div>`;
    if($("#desertStormPlan")){ $("#desertStormPlan").classList.add("hidden"); $("#desertStormPlan").innerHTML=""; }
    safeRenderStep("ADVICE",renderAdvice);safeRenderStep("PROVIDER",renderProvider);queueCriticalUiRepaint();
    return;
  }

  safeRenderStep("HOME_PLAYER",()=>renderHomePlayerMeta(p));
  safeRenderStep("HOME_ALLIANCE",()=>renderHomeAllianceMeta(p,a));
  safeRenderStep("HOME_VS",()=>renderHomeVsMeta(v));
  safeRenderStep("PLAYER_SUMMARY",()=>renderPlayerCoreSummary(p,d));
  safeRenderStep("QG35_COACH_HOME",renderEndgameCoachHome);
  // HF8.6.22 keeps Account independent and isolates every remaining surface.
  safeRenderStep("ACCOUNT_FIELDS",renderAccountFields);
  safeRenderStep("PLAYER_ONBOARDING",renderPlayerOnboarding);
  safeRenderStep("SQUADS",renderSquads);
  safeRenderStep("PLAYER_PROGRESSION",renderPlayerProgression);
  safeRenderStep("EXCLUSIVE_WEAPONS",renderExclusiveWeapons);
  safeRenderStep("PLAYER_ACTIVITY",renderPlayerActivity);
  safeRenderStep("PLAYER_AVAILABILITY",renderPlayerAvailability);
  safeRenderStep("ALLIANCE_ACCESS",renderAllianceAccess);
  safeRenderStep("VS_ACCESS",renderVsAccess);
  safeRenderStep("SEASON_ACCESS",renderSeasonAccess);
   safeRenderStep("ALLIANCE_SUMMARY",()=>renderAllianceCoreSummary(p,a));
   safeRenderStep("ALLIANCE_MEMBERS",renderMembers);safeRenderStep("ALLIANCE_AVAILABILITY",renderAllianceAvailability);safeRenderStep("ALLIANCE_EVENT_WORKSPACE",renderAllianceEventWorkspace);safeRenderStep("DESERT_STORM",renderDesertStormPlanner);safeRenderStep("CANYON",renderCanyonPlanner);
  safeRenderStep("VS_LIVE",renderVsLive);safeRenderStep("VS_TIMELINE",renderVsTimeline);

  safeRenderStep("SEASON_SUMMARY",()=>renderSeasonCoreSummary(s));
  safeRenderStep("ADVICE",renderAdvice);safeRenderStep("PROVIDER",renderProvider);queueCriticalUiRepaint();
}
function squadHasSavedData(sq){return Boolean(sq?.updated_at||Number(sq?.power)>0||(sq?.heroes||[]).some(h=>h?.name||h?.level||h?.stars||h?.power||h?.exclusive||h?.gear))}
function formatGear(raw){return formatGearSummary(raw,{gearItems:t("gear_items"),level:t("level"),rarity:t("rarity"),rarityLabel:x=>{const k=`rarity_${x}`;return t(k)===k?x:t(k)}})}
function weaponStatsLine(w){if(!w)return "";const bits=[w.hero_hp_bonus!=null?`${t("exclusive_hp")} +${new Intl.NumberFormat(locale).format(Number(w.hero_hp_bonus))}`:null,w.hero_atk_bonus!=null?`${t("exclusive_atk")} +${new Intl.NumberFormat(locale).format(Number(w.hero_atk_bonus))}`:null,w.hero_def_bonus!=null?`${t("exclusive_def")} +${new Intl.NumberFormat(locale).format(Number(w.hero_def_bonus))}`:null,w.all_damage_resistance_pct!=null?`${t("exclusive_resistance")} ${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Number(w.all_damage_resistance_pct))}%`:null,w.max_skill_level!=null?`${t("exclusive_skill_cap")} ${new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(Number(w.max_skill_level))}`:null].filter(Boolean);return bits.join(" · ")}
function heroDetailLine(h,heroName){const bits=[h.level?`${t("level")}${h.level}`:`${t("level")}—`,h.stars?`${h.stars}★`:"★—"];const w=weaponForHero(heroName);if(w){const weaponTitle=w.weapon_name||t("exclusive_weapon");bits.push(`${weaponTitle}${w.level?` ${t("level")}${w.level}`:""}`)}else if(h.exclusive){bits.push(`${t("exclusive_short")} ${h.exclusive}`)}if(h.gear)bits.push(formatGear(h.gear));return {main:bits.join(" · "),stats:weaponStatsLine(w)}}
function heroProfileRecord(name){
  const key=normalizedName(name);
  return key?(state.hero_profiles||[]).find(x=>normalizedName(x?.hero_name||x?.name)===key)||null:null;
}
function heroPowerForDisplay(squad,hero){
  const slotPower=confirmedHeroPower(hero?.power),profile=heroProfileRecord(hero?.name),profilePower=confirmedHeroPower(profile?.power),weaponPower=confirmedHeroPower(weaponForHero(hero?.name)?.power);
  const identityPower=profilePower??weaponPower;
  if(identityPower!==null)return identityPower;
  return slotPower;
}
function fmtConfirmedHeroPower(value){const power=confirmedHeroPower(value);return power===null?"—":fmtPower(power)}
function fmtHeroPowerForDisplay(squad,hero){
  const power=confirmedHeroPower(heroPowerForDisplay(squad,hero));
  return power===null&&!isGenericHeroName(hero?.name)?t("hero_power_rescan"):power===null?"—":fmtPower(power);
}
function fmtConfirmedSquadPower(squad){
  if(squad?.power_sync_status==="pending")return t("sync_needed");
  const power=confirmedHeroPower(squad?.power);
  return power===null?"—":fmtPower(power);
}
function performSquadSwap(fromId,toId){
  const from=Number(fromId),to=Number(toId),note=$("#playerSyncInfo");
  try{
    state=swapSquads(state,{fromSquadId:from,toSquadId:to,updatedAt:new Date().toISOString()}).state;
    saveState();
    if(note){note.className="notice";note.classList.remove("hidden");note.textContent=t("squad_swap_done",{from,to})}
  }catch{if(note){note.className="notice warn";note.classList.remove("hidden");note.textContent=t("squad_swap_failed")}}
}
function renderSquads(){
  const box=$("#squadList");if(!box)return;box.innerHTML="";
  state.squads.forEach((sq,i)=>{
    const id=i+1,shell=document.createElement("div");shell.className="squadShell";shell.dataset.squadId=String(id);
     const name=`${t("squad")} ${id}`,optional4=i===3&&!squadHasSavedData(sq),compositionConflict=sq.composition_conflict?.status==="needs_verification",freshness=optional4?t("optional_squad4"):(compositionConflict?t("hero_confirm_needed"):(sq.needs_rescan?t("sync_needed"):(sq.updated_at?updatedLabel(sq.updated_at):t("sync_needed"))));
     const heroes=fixedHeroSlots(sq.heroes),needsHeroConfirm=!optional4&&heroes.some(h=>isGenericHeroName(h?.name))&&squadHasSavedData(sq);
    const swapTargets=squadHasSavedData(sq)?state.squads.map((target,ti)=>({id:ti+1,target})).filter(x=>x.id!==id&&squadHasSavedData(x.target)):[];
    const swapButton=swapTargets.length?`<button class="squadSwapBtn" type="button" data-squad-swap-toggle="${id}" aria-label="${esc(t("squad_swap_aria",{squad:id}))}" title="${esc(t("squad_swap"))}">⇄</button>`:"";
    const swapMenu=swapTargets.length?`<div class="squadSwapMenu hidden" data-squad-swap-menu="${id}"><span>${esc(t("squad_swap_with"))}</span>${swapTargets.map(x=>`<button type="button" class="squadSwapTarget" data-squad-swap-target="${x.id}">${esc(t("squad"))} ${x.id}</button>`).join("")}</div>`:"";
      shell.innerHTML=`<details class="squad" data-squad-id="${id}"><summary class="squadHead"><span class="squadNo">${id}</span><span class="squadName"><b>${esc(name)}</b><small>${esc(freshness)}</small></span><span class="squadPower">${esc(fmtConfirmedSquadPower(sq))}</span><span class="chev" aria-hidden="true"></span></summary><div id="squadBody${id}" class="squadBody">${Array.from({length:5},(_,j)=>{const h=heroes[j]||emptyHero(j+1),hn=isGenericHeroName(h.name)?`${t("hero")} ${j+1} · ${t("hero_unconfirmed")}`:h.name;const detail=heroDetailLine(h,hn);return `<div class="heroRow"${!isGenericHeroName(h.name)?` data-hero="${esc(canonicalStoredHeroName(h.name))}`:""}><div class="heroAvatar">${j+1}</div><div class="heroInfo"><b>${esc(hn)}</b><small>${esc(detail.main)}</small>${detail.stats?`<span class="heroWeaponStats">${esc(detail.stats)}</span>`:""}</div><div class="heroPwr">${esc(fmtHeroPowerForDisplay(sq,h))}</div></div>`}).join("")}${needsHeroConfirm?inlineHeroConfirmationHtml(sq,id):""}</div></details>${swapButton}${swapMenu}`;
    box.appendChild(shell);
    const swapBtn=shell.querySelector(".squadSwapBtn");
    swapBtn?.addEventListener("pointerdown",e=>e.stopPropagation());
    swapBtn?.addEventListener("click",e=>{
      e.preventDefault();e.stopPropagation();
      const menu=shell.querySelector(".squadSwapMenu"),willOpen=menu?.classList.contains("hidden");
      document.querySelectorAll("#squadList .squadSwapMenu").forEach(x=>x.classList.add("hidden"));
      if(willOpen)menu?.classList.remove("hidden");
    });
    shell.querySelectorAll(".squadSwapTarget").forEach(btn=>{
      btn.addEventListener("pointerdown",e=>e.stopPropagation());
      btn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();shell.querySelector(".squadSwapMenu")?.classList.add("hidden");performSquadSwap(id,Number(btn.dataset.squadSwapTarget))});
    });
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
  const vsObjective=String(state?.player_context?.objective||"").toLowerCase()==="vs",vsFresh=vsSnapshotFreshness(state?.vs||{},{now:serverNow}),vsContextWarning=vsObjective&&!vsFresh.current?`⚠️ ${t("vs_stale_notice")} · `:"";
  if(summary){
    if(native){const mi=analysis.meta_intelligence,composition=analysis.composition?.label?` · ${analysis.composition.label}`:"";summary.textContent=`${vsContextWarning}${analysis.summary||""}${composition}${analysis.candidates_evaluated?` · ${t("options_compared_count",{count:analysis.candidates_evaluated})}`:""}${mi?.source_count?` · ${ui.sources} ${mi.source_count} · ${ui.meta} ${mi.confidence}% · ${t("meta_updated")} ${mi.knowledge_date||"—"}`:""}`}
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
  return a.key==="active"?t("activity_active_confirmed"):a.key==="inactive"?t("activity_inactive_probable"):t("activity_insufficient_data");
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
  if(!betaPrivateDataVisible()){grid.innerHTML="";if(status)status.textContent=betaAccessMessage();if(pill)pill.textContent="—";return}
  // Paint a READY baseline before any secondary activity calculation. If one optional calculation
  // fails, the player must never be left with the stale pre-authentication “Synchronisation…” text.
  if(status)status.textContent=t("activity_no_confirmations");if(pill)pill.textContent="—";
  const today=lastWarDateKey(),events=mergeActivityEvents(state.activity_events),confirmedToday=new Set(events.filter(x=>x.event_date===today&&x.confirmed===true).map(x=>x.event_type));
  grid.innerHTML=PLAYER_ACTIVITY_EVENT_TYPES.map(type=>{const active=confirmedToday.has(type);return `<button type="button" class="activityEventBtn${active?" confirmed":""}" data-activity-event="${esc(type)}"><span>${active?"✅":"○"}</span><b>${esc(activityEventLabel(type))}</b><small>${esc(t(active?"activity_remove":"activity_confirm"))}</small></button>`}).join("");
  grid.querySelectorAll("[data-activity-event]").forEach(btn=>btn.addEventListener("click",()=>togglePlayerActivityEvent(btn.dataset.activityEvent)));
  try{
    const nowMs=serverNow instanceof Date&&!Number.isNaN(serverNow.getTime())?serverNow.getTime():Date.now();
    const recent=confirmedActivityEvents(events,{nowMs,days:7});
    if(pill)pill.textContent=recent.length?`${recent.length} · 7j`:"—";
    if(status)status.textContent=recent.length?t("activity_recent_summary",{count:recent.length}):t("activity_no_confirmations");
  }catch(error){
    pushBootstrapStage("RENDER_PLAYER_ACTIVITY_RECENT",0,"error",error?.message||error?.name||"error","browser");
  }
}
const availabilityEventLabels={desert_storm:"Tempête du Désert",canyon_storm:"Tempête du Canyon",vs:"Guerre VS",season:"Saison",other:"Autre événement"};
function availabilityEventLabel(type){return availabilityEventLabels[type]||type||"Événement"}
function availabilityStatusLabel(status){return ({present:"Présent",absent:"Absent",substitute:"Remplaçant",uncertain:"À confirmer",unknown:"À confirmer"})[status]||"À confirmer"}
function stormAvailabilityEvent(eventType){return eventType==="desert_storm"||eventType==="canyon_storm"}
function availabilityStatusOptions(eventType,status){
  const normalized=status==="uncertain"?"unknown":status||"unknown";
  const options=[
    ["unknown","À confirmer"],
    ["present","Présent"],
    ["absent","Absent"],
    ...(stormAvailabilityEvent(eventType)?[["substitute","Remplaçant"]]:[])
  ];
  return options.map(([value,label])=>`<option value="${value}"${normalized===value?" selected":""}>${label}</option>`).join("");
}
function availabilitySourceLabel(source){return source==="player_self_report"?"Joueur":source==="alliance_manager_manual"?"R4/R5":source==="import"?"Import":"Historique"}
function playerAvailabilityFor(eventType,eventInstance){
  const rows=mergeEventAvailabilities(state.player_availability),key=eventInstance||"current";
  return rows.find(x=>x.event_type===eventType&&(x.event_instance||"current")===key)||normalizeEventAvailability({event_type:eventType,event_instance:key,status:"unknown",member_name:state.player?.name});
}
function renderPlayerAvailability(){
  const section=$("#playerAvailabilitySection"),pill=$("#playerAvailabilityPill"),eventInput=$("#playerAvailabilityEvent"),statusInput=$("#playerAvailabilityStatus"),dateInput=$("#playerAvailabilityDate"),slotInput=$("#playerAvailabilitySlot"),noteInput=$("#playerAvailabilityNote"),message=$("#playerAvailabilityStatusMessage");
  if(!section||!eventInput)return;
  if(!betaPrivateDataVisible()){section.classList.add("hidden");return}
  section.classList.remove("hidden");
  const eventType=eventInput.value||"desert_storm",instance=dateInput?.value||"current",row=playerAvailabilityFor(eventType,instance);
  if(statusInput){statusInput.innerHTML=availabilityStatusOptions(eventType,row.status);statusInput.value=row.status==="uncertain"?"unknown":row.status||"unknown"}
  if(dateInput&&document.activeElement!==dateInput)dateInput.value=row.event_date||"";
  if(slotInput&&document.activeElement!==slotInput)slotInput.value=row.time_slot||"";
  if(noteInput&&document.activeElement!==noteInput)noteInput.value=row.note||"";
  if(pill)pill.textContent=availabilityStatusLabel(row.status);
  if(message&&!message.textContent)message.classList.add("hidden");
}
function savePlayerAvailability(){
  if(!betaPrivateDataVisible())return;
  const eventType=$("#playerAvailabilityEvent")?.value||"desert_storm",eventDate=$("#playerAvailabilityDate")?.value||null,status=$("#playerAvailabilityStatus")?.value||"unknown",now=new Date().toISOString(),row=normalizeEventAvailability({event_type:eventType,event_date:eventDate,event_instance:eventDate||"current",status,time_slot:$("#playerAvailabilitySlot")?.value||null,note:$("#playerAvailabilityNote")?.value||null,source:"player_self_report",player_id:state.player_id,canonical_member_key:state.alliance?.members?.find(m=>String(m.player_id||"")===String(state.player_id||""))?.canonical_member_key,member_name:state.player?.name,updated_at:now});
  const merged=upsertEventAvailability(state.player_availability,state.availability_history,row);state.player_availability=merged.current;state.availability_history=merged.history;state.alliance.event_availability=mergeEventAvailabilities(state.alliance.event_availability,[row]);state.alliance.availability_history=mergeAvailabilityHistory(state.alliance.availability_history,[row]);if(state.alliance.event_plans)delete state.alliance.event_plans[eventType];if(eventType==="canyon_storm"){const canyon=ensureCanyonState();canyon.plan=null;canyon.validated_at=null;canyon.validated_by=null;canyon.updated_at=now}if(eventType==="desert_storm"){const desert=ensureDesertStormState();desert.plan=null;desert.updated_at=now}saveState({renderUi:false});renderPlayerAvailability();renderAllianceEventWorkspace();renderCanyonPlanner();renderDesertStormPlanner();
  const message=$("#playerAvailabilityStatusMessage");if(message){message.className="notice";message.classList.remove("hidden");message.textContent="Disponibilité enregistrée. Elle sera synchronisée avec les R4/R5.";setTimeout(()=>message.classList.add("hidden"),2600)}
}
function renderAllianceAvailability(){
  const box=$("#managerAvailabilityList"),section=$("#eventAvailabilityManagerSection"),eventSelect=$("#managerAvailabilityEvent"),search=$("#managerAvailabilitySearch");if(!box||!section||!eventSelect)return;
  const manager=hasDeclaredAllianceCommandRole(),access=runtimeAccessState();section.classList.toggle("hidden",!access.privateVisible||!manager);if(!access.privateVisible||!manager){box.innerHTML="";return}
  const eventType=eventSelect.value||"desert_storm",eventInstance=$("#managerAvailabilityDate")?.value||"current",q=rosterNameKey(search?.value||""),members=currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members).filter(m=>!q||rosterNameKey(m.name).includes(q)),allRows=mergeEventAvailabilities(state.alliance.event_availability,...(state.alliance.members||[]).map(m=>m.event_availability||[]));
  box.innerHTML=members.length?members.map(member=>{const row=availabilityForMember(allRows,member,eventType,eventInstance),key=member.canonical_member_key||rosterLifecycleKey(member),source=row.source?availabilitySourceLabel(row.source):"—",linked=member.warboost_linked===true;return `<div class="managerAvailabilityRow${linked?"":" availabilityUnlinked"}"><div><b>${esc(member.name||t("player"))}</b><small>${esc(normalizeAllianceRole(member.role))} · ${linked?"Lié":"Non lié"} · <span class="availabilitySource">${esc(source)}</span></small></div><select data-manager-availability-key="${esc(key)}" data-manager-availability-name="${esc(member.name||"")}" data-manager-availability-event="${esc(eventType)}" data-manager-availability-instance="${esc(eventInstance)}">${availabilityStatusOptions(eventType,row.status)}</select><input type="time" data-manager-availability-slot="${esc(key)}" value="${esc(row.time_slot||"")}" aria-label="Créneau de ${esc(member.name||"joueur")}"/></div>`}).join(""):`<div class="notice">Aucun membre correspondant.</div>`;
  const byKey=new Map(members.map(m=>[m.canonical_member_key||rosterLifecycleKey(m),m]));
  box.querySelectorAll("[data-manager-availability-key]").forEach(select=>select.addEventListener("change",()=>{const member=byKey.get(select.dataset.managerAvailabilityKey);if(!member)return;const slot=[...box.querySelectorAll("[data-manager-availability-slot]")].find(input=>input.dataset.managerAvailabilitySlot===select.dataset.managerAvailabilityKey)?.value||null,now=new Date().toISOString(),row=normalizeEventAvailability({event_type:eventType,event_instance:eventInstance,event_date:eventInstance==="current"?null:eventInstance,status:select.value,time_slot:slot,source:"alliance_manager_manual",canonical_member_key:member.canonical_member_key,lifecycle_key:rosterLifecycleKey(member),member_key:member.canonical_member_key||rosterLifecycleKey(member),member_name:member.name,player_id:member.player_id,updated_at:now});const merged=upsertEventAvailability(state.alliance.event_availability,state.alliance.availability_history,row);state.alliance.event_availability=merged.current;state.alliance.availability_history=merged.history;member.event_availability=mergeEventAvailabilities(member.event_availability,[row]);member.availability_history=mergeAvailabilityHistory(member.availability_history,[row]);state.alliance.updated_at=now;saveState();renderAllianceAvailability();renderCanyonPlanner();renderDesertStormPlanner()}));
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
const ALLIANCE_EVENT_DEFS=[
  {type:"desert_storm",icon:"🌪️",labelKey:"alliance_event_desert_storm",limit:20,subLimit:10},
  {type:"canyon_storm",icon:"⛰️",labelKey:"alliance_event_canyon_storm",limit:20,subLimit:10},
  {type:"vs",icon:"⚔️",labelKey:"event_vs",openRoster:true},
  {type:"season",icon:"🏆",labelKey:"event_season",openRoster:true},
  {type:"other",icon:"🛡️",labelKey:"event_alliance_event",openRoster:true}
];
function allianceEventDefinition(type){const def=ALLIANCE_EVENT_DEFS.find(x=>x.type===type)||ALLIANCE_EVENT_DEFS[0];return {...def,label:t(def.labelKey)}}
function allianceEventIsOpenRoster(eventType){return Boolean(allianceEventDefinition(eventType).openRoster)}
function allianceEventMemberKey(member={}){
  return String(member.canonical_member_key||member.lifecycle_key||member.member_key||member.player_id||member.name||"").trim();
}
function allianceEventRows(eventType){
  const members=activeAllianceRosterMembers(),sources=[
    ...(Array.isArray(state.alliance?.event_availability)?state.alliance.event_availability:[]),
    ...members.flatMap(member=>Array.isArray(member?.event_availability)?member.event_availability:[])
  ];
  return mergeEventAvailabilities(sources).filter(row=>row.event_type===eventType);
}
function allianceEventAvailability(eventType,member,rows=allianceEventRows(eventType)){
  const keys=new Set([member.canonical_member_key,member.lifecycle_key,member.member_key,member.player_id,member.name].filter(Boolean));
  const matches=rows.filter(row=>[row.canonical_member_key,row.lifecycle_key,row.member_key,row.player_id,row.member_name].some(key=>keys.has(key)));
  const known=matches.filter(row=>row.status!=="unknown");
  return (known.length?known:matches).sort((a,b)=>(Date.parse(b.updated_at||"")||0)-(Date.parse(a.updated_at||"")||0))[0]||normalizeEventAvailability({...member,event_type:eventType,status:"unknown"});
}
function allianceEventGroups(eventType){
  const def=allianceEventDefinition(eventType),rows=allianceEventRows(eventType),members=activeAllianceRosterMembers();
  const classified=members.map(member=>({member,row:allianceEventAvailability(eventType,member,rows)}));
  const present=classified.filter(x=>x.row.status==="present");
  const explicitSubstitutes=classified.filter(x=>x.row.status==="substitute");
  const saved=state.alliance?.event_plans?.[eventType];
  const byKey=new Map(members.map(member=>[allianceEventMemberKey(member),member]));
  const resolvePlanMembers=list=>(Array.isArray(list)?list:[]).map(item=>byKey.get(allianceEventMemberKey(item)||String(item||""))||members.find(member=>rosterNameKey(member.name)===rosterNameKey(typeof item==="string"?item:item?.name))).filter(Boolean);
  const plannedParticipants=resolvePlanMembers(saved?.participants),plannedSubstitutes=resolvePlanMembers(saved?.substitutes);
  if(!def.openRoster&&saved&&(plannedParticipants.length||plannedSubstitutes.length)){
    const plannedKeys=new Set([...plannedParticipants,...plannedSubstitutes].map(allianceEventMemberKey));
    return {
      participants:plannedParticipants,
      substitutes:plannedSubstitutes,
      confirming:classified.filter(x=>(x.row.status==="unknown"||x.row.status==="uncertain")&&!plannedKeys.has(allianceEventMemberKey(x.member))).map(x=>x.member),
      absent:classified.filter(x=>x.row.status==="absent").map(x=>x.member),
      totalMembers:members.length,
      rows
    };
  }
  if(def.openRoster){
    return {
      participants:present.map(x=>x.member),
      substitutes:[],
      confirming:classified.filter(x=>x.row.status==="unknown"||x.row.status==="uncertain").map(x=>x.member),
      absent:classified.filter(x=>x.row.status==="absent").map(x=>x.member),
      totalMembers:members.length,
      rows
    };
  }
  const substitutes=explicitSubstitutes.length
    ? explicitSubstitutes.slice(0,def.subLimit).map(x=>x.member)
    : present.slice(def.limit,def.limit+def.subLimit).map(x=>x.member);
  return {
    participants:present.slice(0,def.limit).map(x=>x.member),
    substitutes,
    confirming:classified.filter(x=>x.row.status==="unknown"||x.row.status==="uncertain").map(x=>x.member),
    absent:classified.filter(x=>x.row.status==="absent").map(x=>x.member),
    totalMembers:members.length,
    rows
  };
}
function allianceEventStatus(member,eventType){
  return allianceEventAvailability(eventType,member).status||"unknown";
}
function saveAllianceEventStatus(member,eventType,status){
  if(!member||member.warboost_linked===true||!hasDeclaredAllianceCommandRole())return;
  const now=new Date().toISOString(),row=normalizeEventAvailability({event_type:eventType,event_instance:"current",status,source:"alliance_manager_manual",canonical_member_key:member.canonical_member_key,lifecycle_key:rosterLifecycleKey(member),member_key:member.canonical_member_key||rosterLifecycleKey(member),member_name:member.name,player_id:member.player_id,updated_at:now});
  const merged=upsertEventAvailability(state.alliance.event_availability,state.alliance.availability_history,row);
  state.alliance.event_availability=merged.current;state.alliance.availability_history=merged.history;
  member.event_availability=mergeEventAvailabilities(member.event_availability,[row]);member.availability_history=mergeAvailabilityHistory(member.availability_history,[row]);
  if(state.alliance.event_plans)delete state.alliance.event_plans[eventType];
  if(eventType==="desert_storm"){const desert=ensureDesertStormState();desert.plan=null}
  if(eventType==="canyon_storm"){const canyon=ensureCanyonState();canyon.plan=null}
  state.alliance.updated_at=now;saveState({renderUi:false});
}
function allianceEventPlayerProfile(member,eventType){
  const row=allianceEventAvailability(eventType,member),insight=playerParticipationInsight(member,{nowMs:serverNow.getTime(),days:30}),recent=(insight.records||[]).slice(0,5);
  const squadPower=Number(member.squad_power_m)>0?fmtPower(member.squad_power_m):"—",accountPower=Number(member.power_m)>0?fmtPower(member.power_m):"—",dronePower=Number(member.drone_power_m)>0?fmtPower(member.drone_power_m):"—";
  return `<div class="alliancePlayerModalBackdrop" data-alliance-player-close aria-hidden="true"></div><div class="alliancePlayerModalCard" role="dialog" aria-modal="true" aria-labelledby="alliancePlayerModalTitle"><div class="sectionTitle alliancePlayerModalHeader"><h3 id="alliancePlayerModalTitle">${esc(member.name||t("player"))}</h3><button class="closeBtn alliancePlayerModalClose" type="button" data-alliance-player-close aria-label="${esc(t("alliance_event_close"))}">×</button></div><div class="alliancePlayerFacts"><span>${esc(t("alliance_event_grade"))}<b>${esc(normalizeAllianceRole(member.role))}</b></span><span>${esc(t("alliance_event_power"))}<b>${esc(accountPower)}</b></span><span>${esc(t("alliance_event_squad"))}<b>${esc(squadPower)}</b></span><span>${esc(t("alliance_event_drone"))}<b>${esc(dronePower)}</b></span><span>${member.warboost_linked===true?"🟢 "+esc(t("alliance_event_linked")):"⚪ "+esc(t("alliance_event_unlinked"))}</span><span>${esc(t("alliance_event_updated"))}<b>${esc(member.updated_at?fmtAgo(member.updated_at):"—")}</b></span></div><div class="alliancePlayerCurrentEvent"><b>${esc(allianceEventDefinition(eventType).label)}</b><span>${esc(availabilityStatusLabel(row.status))}${row.source?` · ${esc(availabilitySourceLabel(row.source))}`:""}</span></div><div class="alliancePlayerHistory"><b>${esc(t("alliance_event_recent_confirmed"))}</b>${recent.length?recent.map(item=>`<div><span>${esc(participationDateLabel(item.event_date))} · ${esc(activityEventLabel(item.event_type))}</span><strong>${esc(participationStatusLabel(item.participation_status))}</strong></div>`).join(""):`<small>${esc(t("alliance_event_no_recent"))}</small>`}</div><button class="secondaryBtn wideBtn alliancePlayerModalCloseButton" type="button" data-alliance-player-close>${esc(t("alliance_event_close"))}</button></div>`;
}
function alliancePlayerProfileIsOpen(){const modal=$("#alliancePlayerModal");return Boolean(modal&&!modal.classList.contains("hidden"))}
function lockAlliancePlayerProfileScroll(){
  if(alliancePlayerModalBodyStyles)return;
  alliancePlayerModalBodyStyles={overflow:document.body.style.overflow};
  document.body.style.overflow="hidden";
}
function restoreAlliancePlayerProfileScroll(){
  if(alliancePlayerModalBodyStyles){document.body.style.overflow=alliancePlayerModalBodyStyles.overflow;alliancePlayerModalBodyStyles=null}
  const drawer=$("#allianceDrawer"),top=alliancePlayerModalScrollTop;
  if(drawer){drawer.scrollTop=top;requestAnimationFrame(()=>{drawer.scrollTop=top})}
}
function closeAlliancePlayerProfile({fromHistory=false}={}){
  const modal=$("#alliancePlayerModal");if(!modal||modal.classList.contains("hidden"))return false;
  modal.classList.add("hidden");modal.setAttribute("aria-hidden","true");modal.innerHTML="";
  restoreAlliancePlayerProfileScroll();
  const focusTarget=alliancePlayerModalLastFocus;alliancePlayerModalLastFocus=null;
  if(focusTarget&&document.contains(focusTarget)){try{focusTarget.focus({preventScroll:true})}catch{focusTarget.focus()}}
  const shouldRestoreHistory=alliancePlayerModalHistory&&!fromHistory;
  alliancePlayerModalHistory=false;
  if(shouldRestoreHistory&&history.state?.warboostAlliancePlayerModal){
    const cleanState={...history.state};delete cleanState.warboostAlliancePlayerModal;
    try{history.replaceState(cleanState,"",location.href)}catch{}
  }
  return true;
}
function openAlliancePlayerProfile(memberKey,eventType){
  const member=activeAllianceRosterMembers().find(x=>allianceEventMemberKey(x)===String(memberKey));if(!member)return;
  const modal=$("#alliancePlayerModal");if(!modal)return;
  if(alliancePlayerProfileIsOpen())closeAlliancePlayerProfile();
  const drawer=$("#allianceDrawer");alliancePlayerModalScrollTop=drawer?.scrollTop||0;alliancePlayerModalLastFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  modal.innerHTML=allianceEventPlayerProfile(member,eventType);modal.classList.remove("hidden");modal.setAttribute("aria-hidden","false");lockAlliancePlayerProfileScroll();
  alliancePlayerModalHistory=true;
  try{history.pushState({...history.state,warboostAlliancePlayerModal:true},"",location.href)}catch{}
  modal.querySelector(".alliancePlayerModalClose")?.focus();
}
function allianceEventDetailIsOpen(){return allianceEventDetailOpen}
function lockAllianceEventDetailHistory(){
  allianceEventDetailHistory=true;
  try{history.pushState({...history.state,warboostAllianceEventDetail:true},"",location.href)}catch{}
}
function openAllianceEventDetail(eventType){
  const drawer=$("#allianceDrawer");allianceEventDetailScrollTop=drawer?.scrollTop||0;allianceEventDetailLastFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  allianceEventActive=eventType||"desert_storm";allianceEventDetailOpen=true;
  if(!allianceEventDetailHistory)lockAllianceEventDetailHistory();
  renderAllianceEventWorkspace();
  $("#allianceEventDetail")?.scrollIntoView?.({behavior:"smooth",block:"nearest"});
}
function closeAllianceEventDetail({fromHistory=false}={}){
  const detail=$("#allianceEventDetail");if(!detail||!allianceEventDetailOpen)return false;
  allianceEventDetailOpen=false;detail.classList.add("hidden");detail.setAttribute("aria-hidden","true");detail.innerHTML="";
  const drawer=$("#allianceDrawer"),top=allianceEventDetailScrollTop;
  if(drawer){drawer.scrollTop=top;requestAnimationFrame(()=>{drawer.scrollTop=top})}
  const focusTarget=[...document.querySelectorAll("[data-alliance-event]")].find(button=>button.dataset.allianceEvent===allianceEventActive)||allianceEventDetailLastFocus;
  allianceEventDetailLastFocus=null;
  if(focusTarget&&document.contains(focusTarget)){try{focusTarget.focus({preventScroll:true})}catch{focusTarget.focus()}}
  const shouldRestoreHistory=allianceEventDetailHistory&&!fromHistory;allianceEventDetailHistory=false;
  if(shouldRestoreHistory&&history.state?.warboostAllianceEventDetail){
    const cleanState={...history.state};delete cleanState.warboostAllianceEventDetail;
    try{history.replaceState(cleanState,"",location.href)}catch{}
  }
  return true;
}
function toggleAllianceEventDetail(eventType){
  if(allianceEventDetailOpen&&allianceEventActive===eventType){closeAllianceEventDetail();return}
  if(allianceEventDetailOpen){allianceEventActive=eventType;renderAllianceEventWorkspace();return}
  openAllianceEventDetail(eventType);
}
function allianceEventPlanSummary(eventType,groups){
  const saved=state.alliance?.event_plans?.[eventType],def=allianceEventDefinition(eventType);
  if(!saved)return "";
  const openRoster=Boolean(def.openRoster),participants=(openRoster?groups.participants:(saved.participants||groups.participants)).map(x=>typeof x==="string"?x:x.name).filter(Boolean),subs=openRoster?[]:(saved.substitutes||groups.substitutes).map(x=>typeof x==="string"?x:x.name).filter(Boolean),denominator=openRoster?groups.totalMembers:def.limit;
  return `<div class="allianceEventPlan"><div class="allianceEventPlanHead"><b>🧠 ${esc(t("alliance_event_generate_plan"))} · ${esc(def.label)}</b><span class="pill">${esc(participants.length)}/${esc(denominator)}</span></div><div><b>${esc(t("alliance_event_participants"))}</b><span>${esc(participants.join(" · ")||"—")}</span></div>${openRoster?"":`<div><b>${esc(t("alliance_event_substitutes"))}</b><span>${esc(subs.join(" · ")||"—")}</span></div>`}<small>${esc(t("alliance_event_plan_uses"))}</small></div>`;
}
function generateAllianceEventPlan(eventType){
  if(!hasDeclaredAllianceCommandRole()){const detail=$("#allianceEventDetail");if(detail)detail.insertAdjacentHTML("afterbegin",`<div class="notice warn">${esc(managerOnlyMessage())}</div>`);return}
  const groups=allianceEventGroups(eventType),def=allianceEventDefinition(eventType),participants=[...groups.participants,...groups.substitutes];
  if(!participants.length){const detail=$("#allianceEventDetail");if(detail)detail.insertAdjacentHTML("afterbegin",`<div class="notice warn">${esc(t("alliance_event_no_present"))}</div>`);return}
  state.alliance.event_plans={...(state.alliance.event_plans||{}),[eventType]:{event_type:eventType,generated_at:new Date().toISOString(),participants:groups.participants,substitutes:groups.substitutes,confirmation:groups.confirming.map(x=>x.name),absent:groups.absent.map(x=>x.name)}};
  if(eventType==="desert_storm"){
    const ds=ensureDesertStormState(),keys=participants.flatMap(desertStormMemberKeys).filter(Boolean),substituteKeys=groups.substitutes.flatMap(desertStormMemberKeys).filter(Boolean);
     ds.plan=buildDesertStormPlan(activeAllianceRosterMembers(),keys,{nowMs:serverNow.getTime(),team:ds.team,battleTime:ds.battle_time,substituteKeys});ds.updated_at=new Date().toISOString();
    state.alliance.event_plans[eventType]={...state.alliance.event_plans[eventType],participants:ds.plan.starters||groups.participants,substitutes:ds.plan.substitutes||groups.substitutes};
  }else if(eventType==="canyon_storm"){
    const canyon=ensureCanyonState();canyon.plan=canyonPlanForRoster(canyon,activeAllianceRosterMembers());canyon.updated_at=new Date().toISOString();
    state.alliance.event_plans[eventType]={...state.alliance.event_plans[eventType],participants:canyon.plan.participants||groups.participants,substitutes:canyon.plan.substitutes||groups.substitutes};
  }
  state.alliance.updated_at=new Date().toISOString();saveState({renderUi:false});renderAllianceEventWorkspace();
  const detail=$("#allianceEventDetail");detail?.scrollIntoView?.({behavior:"smooth",block:"nearest"});
}
function renderAllianceEventWorkspace(){
  const cards=$("#allianceEventCards"),detail=$("#allianceEventDetail");if(!cards||!detail)return;
  const access=runtimeAccessState();if(!access.privateVisible){cards.innerHTML="";detail.classList.add("hidden");return}
  const groupsByType=new Map(ALLIANCE_EVENT_DEFS.map(def=>[def.type,allianceEventGroups(def.type)]));
  cards.innerHTML=ALLIANCE_EVENT_DEFS.map(rawDef=>{const def=allianceEventDefinition(rawDef.type),groups=groupsByType.get(def.type),active=def.type===allianceEventActive,openRoster=Boolean(def.openRoster),denominator=openRoster?groups.totalMembers:def.limit,summary=openRoster?`🟢 ${groups.participants.length}/${denominator}`:`🟢 ${groups.participants.length}/${denominator} · 🟠 ${groups.substitutes.length}/${def.subLimit}`;return `<button type="button" class="allianceEventCard${active&&allianceEventDetailOpen?" active":""}" data-alliance-event="${def.type}"><span class="allianceEventCardIcon">${def.icon}</span><span><b>${esc(def.label)}</b><small>${summary}</small><small>❓ ${groups.confirming.length} · 🔴 ${groups.absent.length}</small></span><span class="allianceEventChevron" aria-hidden="true">${active&&allianceEventDetailOpen?"▴":"▾"}</span></button>`}).join("");
  const workspace=cards.closest("#allianceEventWorkspace");
  if(allianceEventDetailOpen){
    const activeCard=[...cards.querySelectorAll("[data-alliance-event]")].find(button=>button.dataset.allianceEvent===allianceEventActive);
    if(activeCard)activeCard.insertAdjacentElement("afterend",detail);else workspace?.appendChild(detail);
  }else workspace?.appendChild(detail);
  if(!allianceEventDetailOpen){detail.classList.add("hidden");detail.setAttribute("aria-hidden","true");detail.innerHTML="";return}
  const def=allianceEventDefinition(allianceEventActive),groups=groupsByType.get(def.type),openRoster=Boolean(def.openRoster),all=openRoster?[["participants","🟢 "+t("alliance_event_participants"),groups.participants],["confirming","❓ "+t("alliance_event_confirming"),groups.confirming],["absent","🔴 "+t("alliance_event_absent"),groups.absent]]:[["participants","🟢 "+t("alliance_event_participants"),groups.participants],["substitutes","🟠 "+t("alliance_event_substitutes"),groups.substitutes],["confirming","❓ "+t("alliance_event_confirming"),groups.confirming],["absent","🔴 "+t("alliance_event_absent"),groups.absent]];
  const groupHtml=all.map(([kind,label,items])=>`<details class="allianceEventGroup" open><summary><span>${label}</span><b>${items.length}</b></summary><div class="allianceEventGroupList">${items.length?items.map(member=>{const linked=member.warboost_linked===true,status=allianceEventStatus(member,def.type),key=allianceEventMemberKey(member);return `<div class="allianceEventMember"><button type="button" class="allianceEventMemberButton" data-alliance-player-key="${esc(key)}"><b>${esc(member.name||t("player"))}</b><small>${esc(normalizeAllianceRole(member.role))}${Number(member.power_m)>0?` · ${esc(fmtPower(member.power_m))}`:""}${linked?" · 🟢 "+esc(t("alliance_event_linked")):" · ⚪ "+esc(t("alliance_event_unlinked"))}</small></button>${linked?`<span class="allianceEventSource">${esc(availabilitySourceLabel(allianceEventAvailability(def.type,member).source))}</span>`:`<select class="allianceEventManualStatus" data-alliance-event-status="${esc(key)}" aria-label="${esc(t("alliance_event_selected"))} ${esc(member.name||t("player"))}"><option value="unknown"${status==="unknown"?" selected":""}>${esc(t("alliance_event_confirming"))}</option><option value="present"${status==="present"?" selected":""}>${esc(t("alliance_event_present"))}</option><option value="absent"${status==="absent"?" selected":""}>${esc(t("alliance_event_absent"))}</option><option value="uncertain"${status==="uncertain"?" selected":""}>${esc(t("alliance_event_confirming"))}</option></select>`}</div>`}).join(""):`<div class="allianceEventEmpty">${esc(t("alliance_event_empty"))}</div>`}</div></details>`).join("");
   const renderedGroupHtml=stormAvailabilityEvent(def.type)?groupHtml.replace(/(<select[^>]*data-alliance-event-status="([^"]+)"[^>]*>)[\s\S]*?(<\/select>)/g,(_,open,key,close)=>{
     const member=activeAllianceRosterMembers().find(x=>allianceEventMemberKey(x)===key);
     return `${open}${availabilityStatusOptions(def.type,member?allianceEventStatus(member,def.type):"unknown")}${close}`;
   }):groupHtml;
   const denominator=openRoster?groups.totalMembers:def.limit;
   detail.classList.remove("hidden");detail.setAttribute("aria-hidden","false");detail.innerHTML=`<div class="allianceEventDetailHead"><div><span class="eyebrow">${def.icon} ${esc(t("alliance_event_selected"))}</span><h3>${esc(def.label)}</h3><p>${esc(t("alliance_event_participants"))} ${groups.participants.length}/${denominator}${openRoster?"":` · ${esc(t("alliance_event_substitutes"))} ${groups.substitutes.length}/${def.subLimit}`} · ${esc(t("alliance_event_confirming"))} ${groups.confirming.length} · ${esc(t("alliance_event_absent"))} ${groups.absent.length}</p></div><button type="button" class="primaryAction" data-alliance-event-plan>🧠 ${esc(t("alliance_event_generate_plan"))}</button></div><div class="allianceEventGroups">${renderedGroupHtml}</div><div id="allianceEventPlan">${allianceEventPlanSummary(def.type,groups)}</div>`;
}
function normalizeAndPersistPendingAccounts(members){
  const alliance=state.alliance||{},raw=Array.isArray(alliance.unlinked_accounts)?alliance.unlinked_accounts:[],normalized=normalizeUnlinkedAccounts(raw,members,{serverId:alliance.server_id||state.player?.server_id,allianceTag:alliance.tag,currentPlayerId:state.player_id,currentPlayerName:state.player?.name,currentPlayerAliases:pendingIdentityAliasesFor(state.player_id),identityLinkStatus:alliance.identity_link_status});
  if(JSON.stringify(raw)!==JSON.stringify(normalized)){
    state.alliance={...alliance,unlinked_accounts:normalized};
    saveState({renderUi:false});
  }
  return normalized;
}
function renderAllianceIdentityLinks(members){
  const box=$("#allianceIdentitySummary"),pendingBox=$("#unlinkedWarBoostAccounts"),pendingDetails=$("#unlinkedWarBoostDetails");
  const summary=rosterLinkSummary(members),reviewNames=new Set((state.alliance?.roster_review||[]).map(x=>rosterNameKey(x?.name))),formerNames=new Set((state.alliance?.former_members||[]).map(x=>rosterNameKey(x?.name)));
  const normalizedPending=normalizeAndPersistPendingAccounts(members);
  const canonicalSelf=canonicalSelfRosterMember(members);
  if(canonicalSelf?.name&&state.player?.name!==canonicalSelf.name){state.player={...state.player,name:canonicalSelf.name};safeLocalSet(STORE_KEY,JSON.stringify(state));}
  const selfNameKeys=new Set([state.player?.name,canonicalSelf?.name].map(rosterNameKey).filter(Boolean)),pending=normalizedPending.filter(x=>!reviewNames.has(rosterNameKey(x?.name))&&!formerNames.has(rosterNameKey(x?.name))&&!(canonicalSelf&&selfNameKeys.has(rosterNameKey(x?.name))&&normalizeServerId(x?.server_id)===normalizeServerId(canonicalSelf.server_id||state.player?.server_id)&&normalizeAllianceTag(x?.alliance_tag)===normalizeAllianceTag(canonicalSelf.alliance_tag||state.alliance?.tag)));
   const pendingStatuses=new Set(['no_match','ambiguous','missing_nickname','missing_server','missing_alliance','context_conflict','ambiguous_rename']);
   const currentStatus=String(state.alliance?.identity_link_status||"unknown"),currentLinked=(members||[]).some(m=>m?.warboost_linked===true&&String(m?.player_id||"").trim()===String(state.player_id||"").trim());
  if(box){
    const currentText=currentLinked?t("identity_current_linked"):(pendingStatuses.has(currentStatus)?t("identity_current_pending"):"");
    box.textContent=[t("identity_roster_summary",{linked:summary.linked,unlinked:summary.unlinked}),pending.length?t("identity_pending_cloud",{count:pending.length}):null,currentText].filter(Boolean).join(" · ");
  }
  if(pendingDetails){pendingDetails.classList.toggle("hidden",!pending.length);pendingDetails.open=pending.length>0}
  if(pendingBox){
    pendingBox.innerHTML=pending.length?pending.map((x,i)=>`<div class="unlinkedAccountRow"><div><b>⚪ ${esc(x.name||t("player"))}</b><small>${esc(t("server"))} ${esc(x.server_id||"—")} · ${esc(t("alliance"))} ${esc(x.alliance_tag||state.alliance?.tag||"—")}</small><small>${esc(t("identity_exact_match_guard"))}</small></div><button class="smallBtn" type="button" data-identity-retry="${i}">${esc(t("identity_retry_match"))}</button></div>`).join(""):"";
    pendingBox.querySelectorAll("[data-identity-retry]").forEach(btn=>btn.addEventListener("click",async()=>{const index=Number(btn.dataset.identityRetry),target=pending[index]||null;if(!target)return;btn.disabled=true;const old=btn.textContent;btn.textContent=t("identity_retrying");try{await syncAll();const wanted=String(target.name||"").trim().toLowerCase(),stillPending=(state.alliance?.unlinked_accounts||[]).some(x=>String(x?.name||"").trim().toLowerCase()===wanted);const statusBox=$("#allianceIdentitySummary");if(stillPending&&statusBox){statusBox.className="notice identityLinkSummary warn";statusBox.textContent=`${statusBox.textContent} · ⚠️ ${t("identity_exact_match_guard")}`}else if(statusBox){statusBox.className="notice identityLinkSummary";statusBox.textContent=`${statusBox.textContent} · ✅ ${String(target.name||t("player"))}`}}catch(e){const statusBox=$("#allianceIdentitySummary");if(statusBox){statusBox.className="notice identityLinkSummary warn";statusBox.textContent=`⚠️ ${e?.message||t("identity_exact_match_guard")}`}}finally{btn.disabled=false;btn.textContent=old}}));
  }
}

function renderAllianceActivity(){
  const members=state.alliance.members||[],box=$("#activitySummary"),summary=summarizeAllianceActivity(members),c=summary.counts;
  const insufficient=Number(c.insufficient??c.refresh??0);
  if(box)box.innerHTML=`<div><b>🟢 ${c.active}</b><small>${esc(t("activity_active_confirmed"))}</small></div><div><b>⚪ ${insufficient}</b><small>${esc(t("activity_insufficient_data"))}</small></div><div><b>🔴 ${c.inactive}</b><small>${esc(t("activity_inactive_confirmed"))}</small></div>`;
  const note=$("#activityNote");if(note)note.textContent=members.length?t("activity_reliability_note"):t("activity_no_data");
  renderAllianceIdentityLinks(members);
  const overview=allianceParticipationOverview(members,{nowMs:serverNow.getTime(),days:30});
  const managementBox=$("#allianceParticipationManagementSummary");if(managementBox){
    const linkedText=t("participation_management_linked",{linked:overview.linked,total:overview.total_members});
    const evidenceText=t("participation_management_evidence",{known:overview.known_members,total:overview.total_members});
     const insufficientText=t("participation_management_insufficient",{count:overview.insufficient_members,total:overview.total_members});
     const pendingText=t("participation_management_pending",{count:(state.alliance?.unlinked_accounts||[]).length});
    const absenceText=t("participation_management_absences",{count:overview.confirmed_absences});
     managementBox.innerHTML=`<div class="managementSummaryHead"><b>🧠 ${esc(t("participation_management_title"))}</b><span class="pill">30 j</span></div><div class="managementSummaryGrid"><span>${esc(linkedText)}</span><span>${esc(evidenceText)}</span><span>${esc(insufficientText)}</span><span>${esc(pendingText)}</span><span>${esc(absenceText)}</span></div><p>${esc(t("participation_management_guard"))}</p>`;
  }
  renderAllianceParticipationTable(members);
  return summary;
}
function rankManagerCountsLine(counts={}){return ["R1","R2","R3","R4"].map(r=>`${r} ${Number(counts?.[r]||0)}`).join(" · ")}
function rankManagerMemberByKey(key){return (state.alliance?.members||[]).find(m=>rankManagementKey(m)===key)||null}
function rankManagerStatus(messageKey="",vars={},warn=false){const box=$("#rankManagerStatus");if(!box)return;box.className=`notice${warn?" warn":""}`;box.classList.toggle("hidden",!messageKey);box.textContent=messageKey?t(messageKey,vars):""}
function rankManagerErrorKey(code){
  return {member_identity_ambiguous:"rank_manager_error_identity_ambiguous",member_identity_unconfirmed:"rank_manager_error_identity_unconfirmed",self_identity_no_match:"rank_manager_link_no_match",self_identity_incomplete:"rank_manager_link_incomplete",self_identity_mismatch:"rank_manager_link_mismatch",self_identity_context_conflict:"rank_manager_link_context_conflict",roster_member_already_linked:"rank_manager_link_already_owned",account_already_linked:"rank_manager_link_account_owned",alliance_roster_not_ready:"rank_manager_error_roster_not_ready",alliance_write_conflict:"rank_manager_error_conflict",alliance_role_write_conflict:"rank_manager_error_conflict",member_not_found:"rank_manager_error_not_found",r4_r5_required:"rank_manager_error_r4_required",self_role_not_manager:"rank_manager_error_self_not_manager",r4_limit:"rank_manager_r4_limit",r5_protected:"rank_manager_last_r5_guard"}[String(code||"")]||"rank_manager_server_error"
}
function rankManagerShowError(error){
  const code=String(error?.code||"rank_manager_permission_failed");
  if(code==="r4_r5_required"||code==="self_role_not_manager"){showAllianceRoleGuard($("#rankManagerStatus"));return}
  const key=rankManagerErrorKey(code);rankManagerStatus(key==="rank_manager_server_error"?key:key,{limit:error?.limit||10,code},true)
}
function rankManagerSyncState(){
  const access=allianceCommandAccess(),proof=confirmedCanonicalSelfRole(state.alliance?.members||[],state.player_id||cloudSession?.user?.id),userId=String(state.player_id||cloudSession?.user?.id||""),owner=Boolean(userId&&String(state.alliance?.owner_player_id||"")===userId),needsSync=access.cloudAvailable!==true||state.alliance?.management_verified!==true,canResync=Boolean(needsSync&&cloudSession?.access_token&&proof.ok&&(["R4","R5"].includes(proof.role)||owner));
  let reason="rank_manager_sync_identity_required";
  if(!needsSync)reason="rank_manager_sync_verified";
  else if(rankManagerRoleResyncPromise)reason="rank_manager_syncing";
  else if(!cloudSession?.access_token)reason="rank_manager_sync_login_required";
  else if(proof.code==="member_identity_ambiguous")reason="rank_manager_sync_identity_ambiguous";
  return {access,proof,owner,needsSync,canResync,reason,syncing:Boolean(rankManagerRoleResyncPromise)};
}
function legacyRosterCapDetected(){
  return Boolean(state.migration?.legacy_local_roster_capped_at_100===true&&Array.isArray(state.alliance?.members)&&state.alliance.members.length===100);
}
function rosterDiagnosticText(){
  if(rosterDiagnostic.status==="loading")return t("rank_manager_roster_diagnostic_loading");
  if(rosterDiagnostic.status==="error")return t("rank_manager_roster_diagnostic_unavailable");
  if(rosterDiagnostic.status==="ready"&&rosterDiagnostic.source==="canonical")return t("rank_manager_roster_diagnostic_canonical",{count:rosterDiagnostic.canonical_count});
  if(rosterDiagnostic.status==="ready"&&rosterDiagnostic.source==="cloud_members")return t("rank_manager_roster_diagnostic_cloud_members",{count:rosterDiagnostic.cloud_member_count});
  if(legacyRosterCapDetected())return t("rank_manager_roster_diagnostic_legacy",{count:state.alliance.members.length});
  return t("rank_manager_roster_diagnostic_unknown",{count:Array.isArray(state.alliance?.members)?state.alliance.members.length:0});
}
async function refreshRosterDiagnostic({force=false}={}){
  if(rosterDiagnosticPromise||!cloudSession?.access_token)return false;
  if(!force&&(rosterDiagnostic.status==="ready"||rosterDiagnostic.status==="error")&&Date.now()-Number(rosterDiagnostic.at||0)<60000)return true;
  rosterDiagnostic={...rosterDiagnostic,status:"loading"};
  rosterDiagnosticPromise=(async()=>{
    let sharedChanged=false;
    try{
      const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role?action=roster_diagnostic",{method:"GET",headers:authHeaders()},12000);
      if(!r.ok)throw new Error(j?.error||"roster_diagnostic_failed");
      const sharedRows=Array.isArray(j.roster)?j.roster:[],sharedMeta={...(j.alliance||{}),roster_updated_at:j.canonical_updated_at||null};
      sharedChanged=hydrateSharedAllianceRoster(sharedRows,sharedMeta);
      canonicalRosterReady=Boolean(j.source==="canonical"||sharedRows.length);
      rosterDiagnostic={status:"ready",source:j.source||"unknown",canonical_count:Number.isFinite(Number(j.canonical_count))?Number(j.canonical_count):null,cloud_member_count:Number.isFinite(Number(j.cloud_member_count))?Number(j.cloud_member_count):null,link_status:j.link_status||"unknown",link_candidates:Array.isArray(j.link_candidates)?j.link_candidates:[],account_identity:j.account_identity||null,roster:sharedRows,alliance:j.alliance||null,authorization:j.authorization||null,at:Date.now()};
      const candidate=rosterDiagnostic.link_candidates?.length===1?rosterDiagnostic.link_candidates[0]:null;
      if(candidate&&candidate.linked_to_self!==true&&["R4","R5"].includes(normalizedRole(candidate.role))&&rosterDiagnostic.link_status==="ready"&&!sharedRosterLinkPromise){
        sharedRosterLinkPromise=linkOwnCanonicalIdentity().finally(()=>{sharedRosterLinkPromise=null});
        await sharedRosterLinkPromise;
      }
      return true;
    }catch{rosterDiagnostic={...rosterDiagnostic,status:"error",at:Date.now()};return false}
    finally{rosterDiagnosticPromise=null;renderAllianceRankManager();if(sharedChanged)render()}
  })();
  return rosterDiagnosticPromise;
}
function rankManagerIdentityLinkText(){
  const status=String(rosterDiagnostic.link_status||"unknown");
  if(status==="member_identity_ambiguous")return t("rank_manager_link_ambiguous");
  if(status==="roster_member_already_linked")return t("rank_manager_link_already_owned");
  if(status==="account_already_linked")return t("rank_manager_link_account_owned");
  if(status==="self_identity_no_match")return t("rank_manager_link_no_match");
  if(status==="self_identity_incomplete")return t("rank_manager_link_incomplete");
  if(status==="self_identity_context_conflict")return t("rank_manager_link_context_conflict");
  return t("rank_manager_link_help");
}
function renderRankManagerAssociationSummary(members=[]){
  const box=$("#rankManagerAssociationSummary");if(!box)return;
  const rows=dedupeRosterAccountLinks(members),summary=rosterLinkSummary(rows);
  const linked=rows.filter(m=>m?.warboost_linked===true&&String(m?.player_id||"").trim());
  const pending=normalizeAndPersistPendingAccounts(rows);
  const reasonLabel=reason=>{
    const map={no_match:"Pseudo non trouvé dans le roster canonique",ambiguous:"Plusieurs membres correspondent",ambiguous_roster_match:"Plusieurs membres correspondent",roster_member_already_linked:"Membre déjà lié à un autre compte",account_already_linked:"Compte déjà lié à un autre membre",identity_incomplete:"Pseudo, serveur ou alliance incomplet",context_conflict:"Serveur ou alliance différent"};
    return map[String(reason||"")]||"Correspondance exacte requise";
  };
  const linkedHtml=linked.length?linked.map(member=>`<div class="identityAssociationRow"><div><b>🟢 ${esc(member.name||t("player"))}</b><small>Membre : ${esc(member.name||"—")} · Pseudo : ${esc(member.name||"—")}</small><small>${esc(t("server"))} ${esc(member.server_id||"—")} · ${esc(t("alliance"))} ${esc(member.alliance_tag||"—")} · Grade ${esc(normalizeAllianceRole(member.role))}</small></div><span>${esc(t("identity_linked_short"))}</span></div>`).join(""):`<p class="privacyText">Aucune liaison active.</p>`;
  const pendingHtml=pending.length?pending.map(account=>`<div class="identityAssociationRow pending"><div><b>⚪ ${esc(account.name||t("player"))}</b><small>Membre : — · Pseudo : ${esc(account.name||"—")}</small><small>${esc(t("server"))} ${esc(account.server_id||"—")} · ${esc(t("alliance"))} ${esc(account.alliance_tag||"—")} · Grade —</small></div><span>${esc(reasonLabel(account.reason))}</span></div>`).join(""):`<p class="privacyText">Aucun compte en attente.</p>`;
  box.innerHTML=`<div class="identityAssociationHead"><b>Associations WarBoost</b><span class="pill">${summary.linked}/${summary.total} liés · ${pending.length} en attente</span></div><p class="privacyText">La liaison exige le pseudo Last War exact, le serveur et l’alliance. Le grade reste indépendant et peut changer sans casser la liaison.</p><div class="identityAssociationGroup"><b>Comptes liés</b>${linkedHtml}</div><div class="identityAssociationGroup"><b>Comptes en attente / blocage</b>${pendingHtml}</div>`;
}
async function linkOwnCanonicalIdentity(){
  const candidate=rosterDiagnostic.link_candidates?.length===1?rosterDiagnostic.link_candidates[0]:null;
  if(!candidate)return rankManagerStatus("rank_manager_link_no_match",{},true);
  const button=$("#rankManagerLinkSelfBtn");if(button)button.disabled=true;
  rankManagerStatus("rank_manager_link_saving",{},false);
  try{
    const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"link_self_identity",name:candidate.name,server_id:candidate.server_id,alliance_tag:candidate.alliance_tag})},18000);
    if(!r.ok)throw Object.assign(new Error(j.error||"self_identity_link_failed"),{code:j.error||"self_identity_link_failed"});
    const userId=String(cloudSession?.user?.id||state.player_id||""),linked=state.alliance?.members?.find(m=>rosterNameKey(m?.name)===rosterNameKey(candidate.name)&&String(m?.server_id||state.alliance?.server_id)===String(candidate.server_id)&&String(m?.alliance_tag||state.alliance?.tag||"").toUpperCase()===String(candidate.alliance_tag||"").toUpperCase());
    if(linked){linked.player_id=userId;linked.warboost_linked=true;linked.identity_basis="lastwar_nickname_server_alliance";linked.role=j.identity?.role||linked.role}
    const role=normalizedRole(j.membership?.role||j.identity?.role||state.alliance?.role),owner=j.owner===true||String(state.alliance?.owner_player_id||"")===userId;
    state.alliance={...state.alliance,role,cloud_role_verified:Boolean(j.cloud_role_verified),management_verified:Boolean(j.management_verified||owner)};
    state.player={...state.player,role:j.identity?.role||state.player?.role};
    desertStormRoleResyncAttempted=false;rosterDiagnostic={...rosterDiagnostic,status:"idle",link_candidates:[],at:0};saveState({renderUi:false});render();rankManagerStatus("rank_manager_linked",{},false);
    await refreshRosterDiagnostic();render();
    return true;
  }catch(error){rankManagerShowError(error);return false}
  finally{if(button)button.disabled=false;renderAllianceRankManager()}
}
async function resyncOwnRankManagerRole(){
  const eligibility=rankManagerSyncState();if(!eligibility.canResync){rankManagerStatus(eligibility.reason,{},true);return false}
  if(rankManagerRoleResyncPromise)return rankManagerRoleResyncPromise;
  const button=$("#rankManagerSyncSelfBtn");if(button)button.disabled=true;rankManagerStatus("rank_manager_saving",{},false);
  rankManagerRoleResyncPromise=(async()=>{
    try{
      const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"sync_own_role"})},15000);
      if(!r.ok)throw Object.assign(new Error(j.error||"role_resync_failed"),{code:j.error||"role_resync_failed",limit:j.limit});
      const role=normalizedRole(j.membership?.role||state.alliance?.role),userId=String(state.player_id||cloudSession?.user?.id||""),owner=String(state.alliance?.owner_player_id||"")===userId;
      state.alliance={...state.alliance,role,cloud_role_verified:true,management_verified:owner||["R4","R5"].includes(role)};
      saveState();render();rankManagerStatus("rank_manager_resync_saved",{role,mode:j.mode||"own_role_resynchronized"},false);
      return true;
    }catch(error){rankManagerShowError(error);return false}
    finally{rankManagerRoleResyncPromise=null;if(button)button.disabled=false;renderAllianceRankManager()}
  })();
  return rankManagerRoleResyncPromise;
}
function renderAllianceRankManager(){
  const section=$("#rankManagerSection"),list=$("#rankManagerList"),previewBox=$("#rankManagerPreview"),applyBtn=$("#rankManagerApplyBtn"),clearBtn=$("#rankManagerClearBtn"),syncBtn=$("#rankManagerSyncSelfBtn"),search=$("#rankManagerSearch");if(!section||!list)return;
  const manager=canonicalRosterReady&&hasDeclaredAllianceCommandRole(),members=state.alliance?.members||[],r5Members=members.filter(m=>confirmedMemberRank(m)==="R5"),r5Count=r5Members.length,pendingR5Keys=r5Members.filter(m=>!rankChangeDraft.has(rankManagementKey(m))).map(m=>rankManagementKey(m)).filter(Boolean),protectedKey=pendingR5Keys.length===1?pendingR5Keys[0]:"",q=rosterNameKey(rankManagerSearchTerm),syncState=rankManagerSyncState(),accessNotice=$("#rankManagerAccessNotice"),diagnosticBox=$("#rankManagerRosterDiagnostic"),linkBox=$("#rankManagerIdentityLink");
  const warning=$("#rankManagerR5Warning");if(warning){warning.classList.toggle("hidden",r5Count<2);warning.textContent=r5Count>=2?t("rank_manager_multiple_r5",{count:r5Count}):""}
  if(accessNotice){accessNotice.classList.toggle("hidden",!syncState.needsSync);accessNotice.textContent=syncState.needsSync?t(syncState.reason):""}
  if(syncBtn){syncBtn.classList.toggle("hidden",!syncState.needsSync);syncBtn.disabled=!syncState.canResync||syncState.syncing}
  if(diagnosticBox){diagnosticBox.textContent=rosterDiagnosticText();void refreshRosterDiagnostic()}
  if(linkBox){
    const candidate=rosterDiagnostic.link_candidates?.length===1?rosterDiagnostic.link_candidates[0]:null;
    const canLink=Boolean(candidate&&rosterDiagnostic.link_status==="ready"&&!candidate.linked);
    const show=syncState.needsSync&&rosterDiagnostic.status==="ready"&&canLink;
    linkBox.classList.toggle("hidden",!show);
    if(show){linkBox.innerHTML=`<b>${esc(t("rank_manager_link_title"))}</b><p>${esc(rankManagerIdentityLinkText())}</p><div class="identityLinkCandidate"><span>${esc(candidate.name)} · ${esc(candidate.server_id)} · ${esc(candidate.alliance_tag)} · ${esc(candidate.role)}</span><button id="rankManagerLinkSelfBtn" class="smallBtn" type="button">${esc(t("rank_manager_link_button"))}</button></div>`;$("#rankManagerLinkSelfBtn")?.addEventListener("click",linkOwnCanonicalIdentity)}
    else if(syncState.needsSync&&rosterDiagnostic.status==="ready"&&rosterDiagnostic.link_status!=="ready"){linkBox.innerHTML=`<b>${esc(t("rank_manager_link_title"))}</b><p>${esc(rankManagerIdentityLinkText())}</p>`}
    else linkBox.innerHTML="";
  }
  renderRankManagerAssociationSummary(members);
  const selection=searchSelection(search);
  section.classList.toggle("managerLocked",!manager);preserveSearchInput(search,rankManagerSearchTerm);
  const rows=members.filter(m=>!q||rosterNameKey(m.name).includes(q)).sort((a,b)=>({R5:5,R4:4,R3:3,R2:2,R1:1}[confirmedMemberRank(b)]||0)-({R5:5,R4:4,R3:3,R2:2,R1:1}[confirmedMemberRank(a)]||0)||(Number(b.power_m)||0)-(Number(a.power_m)||0)||String(a.name||"").localeCompare(String(b.name||"")));
  list.innerHTML=rows.length?rows.map(m=>{const key=rankManagementKey(m),from=confirmedMemberRank(m),draft=rankChangeDraft.get(key),to=draft||from,changed=Boolean(draft)&&to!==from,isSelf=Boolean(m.player_id)&&String(m.player_id)===String(state.player_id||""),isProtectedR5=from==="R5"&&key===protectedKey,disabled=!manager||isProtectedR5||(isSelf&&from!=="R5"),options=from==="R5"?`<option value="" disabled${draft?"":" selected"}>${esc(t("rank_manager_current_r5"))}</option>${["R1","R2","R3","R4"].map(r=>`<option value="${r}"${draft===r?" selected":""}>${r}</option>`).join("")}`:`<option value="" disabled${draft?"":" selected"}>—</option>${["R1","R2","R3","R4"].map(r=>`<option value="${r}"${draft===r?" selected":""}>${r}</option>`).join("")}`;return `<div class="rankManagerRow${changed?" changed":""}${isSelf?" self":""}${isProtectedR5?" protectedR5":""}"><div><b>${esc(m.name||t("player"))}</b><small>${from} · ${t("hq")} ${esc(m.hq_level??"—")} · ${esc(fmtPower(m.power_m))}${m.warboost_linked===true?` · 🟢 WarBoost`:""}${isProtectedR5?` · ${esc(t("rank_manager_last_r5_guard"))}`:""}${isSelf?` · ${esc(t("rank_manager_self_guard"))}`:""}</small></div><div class="rankMove"><span>${from}</span><span aria-hidden="true">→</span><select data-rank-change-key="${esc(key)}" data-rank-current="${from}"${disabled?" disabled":""}>${options}</select></div></div>`}).join(""):`<div class="notice">${esc(t("rank_manager_no_match"))}</div>`;restoreSearchSelection(search,selection);
  list.querySelectorAll("select[data-rank-change-key]").forEach(sel=>sel.addEventListener("change",()=>{const key=sel.dataset.rankChangeKey,from=sel.dataset.rankCurrent,to=sel.value;if(to===from)rankChangeDraft.delete(key);else rankChangeDraft.set(key,to);renderAllianceRankManager()}));
  const changes=[...rankChangeDraft.entries()].map(([key,to_role])=>({key,to_role})),preview=previewAllianceRankChanges(state.alliance?.members||[],changes,{maxR4:10});
  if(previewBox){const changed=preview.changes||[],err=preview.errors?.[0];previewBox.innerHTML=changed.length?`<div class="rankPreviewCounts"><span>${esc(t("rank_manager_before"))}: ${esc(rankManagerCountsLine(preview.before))}</span><span>${esc(t("rank_manager_after"))}: ${esc(rankManagerCountsLine(preview.after))}</div><div class="rankPreviewChanges">${changed.map(x=>`<span><b>${esc(x.name)}</b> ${x.from_role} → ${x.to_role}</span>`).join("")}</div>${err?`<div class="notice warn">${esc(err.code==="r4_limit"?t("rank_manager_r4_limit",{limit:err.limit}):err.code==="r5_protected"?t("rank_manager_last_r5_guard"):t("rank_manager_invalid"))}</div>`:""}`:`<div class="privacyText">${esc(t("rank_manager_empty"))}</div>`}
  if(applyBtn){applyBtn.disabled=!manager||!preview.changes.length||!preview.ok;applyBtn.textContent=t("rank_manager_apply")}
  if(clearBtn)clearBtn.disabled=!rankChangeDraft.size;
}
async function updateRankPermissionTransition(change,targetManagementRole){const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({player_id:change.player_id,role:targetManagementRole})},15000);if(!r.ok)throw Object.assign(new Error(j.error||"role_update_failed"),{code:j.error||"role_update_failed"});return j}
async function persistCanonicalRosterRankBatch(preview){
  const payload=(preview?.changes||[]).map(change=>{const member=rankManagerMemberByKey(change.key),memberKey=member?.canonical_member_key||canonicalRosterMemberKey(member,{serverId:state.alliance?.server_id||state.player?.server_id||"",allianceTag:state.alliance?.tag||""});return {member_key:memberKey||null,name:member?.name||change.name,server_id:member?.server_id||state.alliance?.server_id||state.player?.server_id||"",alliance_tag:member?.alliance_tag||state.alliance?.tag||"",from_role:change.from_role,to_role:change.to_role}});
  const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({roster_rank_changes:payload})},18000);
  if(!r.ok)throw Object.assign(new Error(j.error||"roster_rank_persist_failed"),{code:j.error||"roster_rank_persist_failed"});return j
}
async function applyRankManagerChanges(){
  if(!canonicalRosterReady)return rankManagerStatus("rank_manager_error_roster_not_ready",{},true);
  if(!hasDeclaredAllianceCommandRole()){showAllianceRoleGuard($("#rankManagerStatus"));return}
  const changes=[...rankChangeDraft.entries()].map(([key,to_role])=>({key,to_role})),preview=previewAllianceRankChanges(state.alliance?.members||[],changes,{maxR4:10});
  if(!preview.changes.length)return rankManagerStatus("rank_manager_empty",{},true);if(!preview.ok){const e=preview.errors?.[0];return rankManagerStatus(e?.code==="r4_limit"?"rank_manager_r4_limit":e?.code==="r5_protected"?"rank_manager_last_r5_guard":"rank_manager_invalid",{limit:e?.limit||10},true)}
  if(!window.confirm(t("rank_manager_confirm",{count:preview.changes.length})))return;
  const permission=permissionTransitions(preview),completed=[];rankManagerStatus("rank_manager_saving",{},false);const applyBtn=$("#rankManagerApplyBtn");if(applyBtn)applyBtn.disabled=true;
  try{
    // Management permissions are updated first for linked accounts. If the canonical
    // roster write fails, these transitions are rolled back below.
    for(const transition of permission){const targetRole=transition.to_role==="R4"?"R4":"R1";await updateRankPermissionTransition(transition,targetRole);completed.push(transition)}
    // Persist the exact roster grades before any cloud refresh can re-apply stale ranks.
    const canonicalBatch=await persistCanonicalRosterRankBatch(preview);
  }catch(error){
    for(const transition of completed.reverse()){try{await updateRankPermissionTransition(transition,transition.management_role==="R4"?"R4":"R1")}catch{}}
    rankManagerShowError(error);if(applyBtn)applyBtn.disabled=false;return;
  }
  const now=new Date().toISOString(),result=applyAllianceRankChanges(state.alliance?.members||[],changes,{now,maxR4:10});if(!result.changed){rankManagerStatus("rank_manager_invalid",{},true);if(applyBtn)applyBtn.disabled=false;return}
  const permissionMap=new Map(permission.map(x=>[x.key,x.to_role==="R4"?"R4":"R1"]));
  state.alliance.members=result.members.map(m=>{const key=rankManagementKey(m),management=permissionMap.get(key);return management?{...m,management_role:management,updated_at:now}:m});
  for(const change of result.preview.changes){const member=rankManagerMemberByKey(change.key);if(String(member?.player_id||"")===String(state.player_id||"")){state.player.role=change.to_role;state.player.updated_at=now;const mgmt=permissionMap.get(change.key);if(mgmt){state.alliance.role=mgmt;state.alliance.management_verified=mgmt==="R4"}}}
  state.alliance.updated_at=now;state.alliance.roster_updated_at=canonicalBatch?.roster_updated_at||now;state.alliance.roster_sync_status="synced";state.alliance.roster_sync_error=null;rankChangeDraft.clear();saveState();
  // The canonical batch is already committed. Do not run a generic sync here:
  // an older profile snapshot could merge back over the just-committed rank.
  // Legacy HF8.6.4 verification marker only: await syncAll().catch(()=>{})
  render();rankManagerStatus("rank_manager_saved",{count:result.preview.changes.length},false);
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
  const box=$("#memberList"),members=state.alliance.members||[],review=state.alliance.roster_review||[];if(!box)return;
  const membersCount=$("#membersAccordionCount");if(membersCount)membersCount.textContent=`${members.length}`;
  const summary=renderAllianceActivity(),roles=["R5","R4","R3","R2","R1"];
  if(!members.length&&!review.length){box.innerHTML=`<div class="notice">${t("no_members")}</div>`;return}
  const chips=roles.map(role=>`<span class="roleCountChip"><b>${role}</b><small>${summary.roleCounts[role]||0}</small></span>`).join("");
  const rosterIntegrityWarning=members.length>0&&Number(summary.roleCounts.R5||0)===0?`<div class="notice warn rosterIntegrityWarning">⚠️ R5 · ${esc(t("role_empty"))} · ${esc(t("sync_needed"))}</div>`:"";
  const groups=roles.map(role=>{
    const rows=members.filter(m=>normalizeAllianceRole(m.role)===role).sort((a,b)=>(Number(b.power_m)||0)-(Number(a.power_m)||0));
    const open=openRosterRoles.has(role)?" open":"";
    const body=rows.length?rows.map(renderMemberRow).join(""):`<div class="emptyRole">${esc(t("role_empty"))}</div>`;
    return `<details class="roleRosterGroup" data-roster-role="${role}"${open}><summary><span class="roleRosterTitle"><b>${role}</b><small>${rows.length} ${esc(t("members_short"))}</small></span><span class="roleRosterChevron" aria-hidden="true">⌄</span></summary><div class="roleRosterBody">${body}</div></details>`;
  }).join("");
  const reviewHtml=review.length?`<details class="roleRosterGroup rosterReviewGroup" open><summary><span class="roleRosterTitle"><b>⚠️ ${esc(t("roster_review_title"))}</b><small>${review.length}</small></span><span class="roleRosterChevron" aria-hidden="true">⌄</span></summary><div class="roleRosterBody">${review.map(m=>{const key=rosterLifecycleKey(m),history=membershipHistoryLine(m,2);return `<div class="member compactMember rosterLifecycleRow"><div><b>${esc(m.name||t("player"))}</b><small>${esc(t("roster_review_reason"))} · ${esc(normalizeAllianceRole(m.role))}</small>${history?`<span class="membershipHistoryLine">${esc(history)}</span>`:""}</div><div class="rosterLifecycleActions"><button class="smallBtn" type="button" data-roster-review-action="keep" data-roster-key="${esc(key)}">${esc(t("roster_review_keep"))}</button><button class="smallBtn dangerBtn" type="button" data-roster-review-action="leave" data-roster-key="${esc(key)}">${esc(t("roster_review_departed"))}</button></div></div>`}).join("")}</div></details>`:"";
  box.innerHTML=`${rosterIntegrityWarning}<div class="rosterOverview"><div><b>${esc(t("roster_by_role"))}</b><small>${esc(t("roster_hint"))}</small></div><div class="roleCountRow">${chips}</div></div>${review.length?`<div class="notice warn rosterReviewNotice">${esc(t("roster_review_guard",{count:review.length}))}</div>`:""}<div class="roleRosterList">${groups}${reviewHtml}</div>`;
  box.querySelectorAll("details[data-roster-role]").forEach(d=>d.addEventListener("toggle",()=>{const role=d.dataset.rosterRole;if(d.open)openRosterRoles.add(role);else openRosterRoles.delete(role)}));
  box.querySelectorAll("select[data-member-management-id]").forEach(sel=>sel.addEventListener("change",async()=>{const playerId=sel.dataset.memberManagementId,nextRole=sel.value,row=(state.alliance.members||[]).find(m=>String(m.player_id)===String(playerId)),previous=row?.management_role||"R1";sel.disabled=true;try{const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({player_id:playerId,role:nextRole})},15000);if(!r.ok)throw new Error(j.error||"role_update_failed");if(row){row.management_role=nextRole;row.updated_at=new Date().toISOString()}saveState()}catch{sel.value=previous;const status=$("#rosterImportStatus");if(status){status.className="notice warn";status.textContent=`⚠️ ${t("management_permission")}`}}finally{sel.disabled=false}}));
  box.querySelectorAll("[data-roster-review-action]").forEach(btn=>btn.addEventListener("click",async()=>{if(!hasDeclaredAllianceCommandRole())return;const key=btn.dataset.rosterKey,action=btn.dataset.rosterReviewAction,row=(state.alliance.roster_review||[]).find(m=>rosterLifecycleKey(m)===key);if(action==="leave"){if(!window.confirm(t("roster_remove_confirm",{name:row?.name||t("player")})))return;await removeRosterEntry(row,key)}else{const now=new Date().toISOString(),r=restoreRosterReviewMember({members:state.alliance.members,review:state.alliance.roster_review},key,{now});if(r.changed){state.alliance.members=r.members;state.alliance.roster_review=r.review;state.alliance.updated_at=now;saveState();render()}}}));
  box.querySelectorAll("[data-roster-active-remove]").forEach(btn=>btn.addEventListener("click",async()=>{if(!hasDeclaredAllianceCommandRole())return;const key=btn.dataset.rosterActiveRemove,name=btn.dataset.rosterName||t("player");if(!window.confirm(t("roster_remove_confirm",{name})))return;await removeRosterEntry((state.alliance.members||[]).find(m=>rosterLifecycleKey(m)===key),key)}));
}

async function removeRosterEntry(row,key){
  if(!row)return;
  const status=$("#rosterImportStatus"),context={serverId:state.alliance?.server_id||state.player?.server_id||row.server_id,allianceTag:state.alliance?.tag||row.alliance_tag},canonicalKey=row.canonical_member_key||canonicalRosterMemberKey(row,context);
  try{
    const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"remove_roster_members",members:[{member_key:canonicalKey||key,canonical_member_key:canonicalKey,name:row.name,server_id:row.server_id||context.serverId,alliance_tag:row.alliance_tag||context.allianceTag,expected_role:row.role}]})},18000);
    if(!r.ok)throw Object.assign(new Error(j?.message||j?.error||"roster_remove_failed"),{code:j?.error});
    const now=new Date().toISOString(),rLocal=removeActiveRosterMember({members:state.alliance.members,review:state.alliance.roster_review,former:state.alliance.former_members,removal_tombstones:state.alliance.roster_removal_tombstones},key,{now});
     if(rLocal.changed||String(row?.membership_status||"")==="review"){
       state.alliance.members=rLocal.members;state.alliance.roster_review=actionReviewRemoval(state.alliance.roster_review,key);state.alliance.former_members=[];state.alliance.roster_removal_tombstones=normalizeRosterRemovalTombstones(j.removal_tombstones||rLocal.removal_tombstones);state.alliance.updated_at=now;state.alliance.roster_sync_status="synced";state.alliance.roster_sync_error=null;const desert=ensureDesertStormState();desert.registered_keys=desert.registered_keys.filter(x=>x!==key);desert.substitute_keys=desert.substitute_keys.filter(x=>x!==key);saveState();render();
    }
  }catch(error){if(status){status.className="notice warn";status.textContent=`⚠️ ${error.message||t("roster_sync_failed")}`;status.classList.remove("hidden")}}
}
function actionReviewRemoval(rows,key){return (Array.isArray(rows)?rows:[]).filter(x=>rosterLifecycleKey(x)!==key)}


function ensureDesertStormState(){
  const a=state.alliance||(state.alliance={});const current=a.desert_storm&&typeof a.desert_storm==="object"?a.desert_storm:{};
  a.desert_storm={team:String(current.team||"A").toUpperCase()==="B"?"B":"A",battle_time:String(current.battle_time||""),registered_keys:Array.isArray(current.registered_keys)?[...new Set(current.registered_keys.map(String).filter(Boolean))]:[],substitute_keys:Array.isArray(current.substitute_keys)?[...new Set(current.substitute_keys.map(String).filter(Boolean))]:[],selection_initialized:current.selection_initialized===true,plan:current.plan&&typeof current.plan==="object"?current.plan:null,availability_reset_at:current.availability_reset_at||null,updated_at:current.updated_at||null};
  return a.desert_storm;
}
function desertStormFeatureAccess(){if(!canonicalRosterReady)return false;if(proState.beta!==false)return requireBetaAccess()&&requireBetaConsent();return requirePro()}
function dsLabel(key){return t(`ds_${key}`)}
function dsMissionLabel(code,options={}){return desertStormMissionLabel(code,{...options,translate:dsLabel})}
function desertStormWarningText(w){if(!w)return "";const k=`ds_warning_${w.code}`;return t(k,{count:w.count??0})}
function desertStormCopyText(plan){
  if(!plan)return "";const head=[t("ds_copy_title"),`${t("ds_team")} ${plan.team}${plan.battle_time?` · ${plan.battle_time}`:""}`];
   const groups=(plan.groups||[]).map((g,groupIndex)=>{const names=(g.members||[]).map(x=>x.name).filter(Boolean).join(" / "),missionContext={groupIndex};return `G${g.id} ${names}\n${t("ds_opening")}: ${dsMissionLabel(g.mission?.opening,missionContext)} → ${t("ds_center")}: ${dsMissionLabel(g.mission?.center,missionContext)} → ${t("ds_late")}: ${dsMissionLabel(g.mission?.late,missionContext)}`});
  const subs=(plan.substitutes||[]).map(x=>x.name).filter(Boolean);const rules=[t("ds_order_objectives"),t("ds_order_center"),t("ds_order_help")];
  return [...head,...groups,subs.length?`${t("ds_substitutes")}: ${subs.join(" / ")}`:null,...rules].filter(Boolean).join("\n");
}
function desertStormCurrentSelectionSignature(ds=ensureDesertStormState(),selection=null){
  const selected=selection||desertStormPlanSelection(activeAllianceRosterMembers());
  return desertStormSelectionSignature({registered_keys:selected.registeredKeys,substitute_keys:selected.substituteKeys,team:ds.team,battle_time:ds.battle_time});
}
function clearDesertStormPlanReadyStatus(){
  const status=$("#desertStormStatus");if(!status)return;
  if(status.dataset?.desertStormPlanSuccess==="true"||status.textContent===t("ds_plan_ready")){
    if(status.dataset)delete status.dataset.desertStormPlanSuccess;
    status.textContent="";status.className="notice hidden";status.classList.add("hidden");
  }
}
function invalidateDesertStormPlan(ds=ensureDesertStormState()){
  ds.plan=null;clearDesertStormPlanReadyStatus();
}
function desertStormSelfRoleProof(){return confirmedCanonicalSelfRole(state.alliance?.members||[],state.player_id||cloudSession?.user?.id)}
function desertStormSelectionAccess(){
  const access=allianceCommandAccess(),proof=desertStormSelfRoleProof(),userId=String(state.player_id||cloudSession?.user?.id||""),owner=Boolean(userId&&String(state.alliance?.owner_player_id||"")===userId),canResync=Boolean(canonicalRosterReady&&cloudSession?.access_token&&proof.ok&&(["R4","R5"].includes(proof.role)||owner));
  return {allowed:canonicalRosterReady&&access.allowed,canResync,syncing:Boolean(desertStormRoleResyncPromise)};
}
async function tryDesertStormRoleResync(){
  const access=desertStormSelectionAccess();if(access.allowed||access.syncing||desertStormRoleResyncAttempted||!access.canResync)return false;
  desertStormRoleResyncAttempted=true;
  desertStormRoleResyncPromise=(async()=>{
    try{
      const {response:r,json:j}=await fetchJsonBounded("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"sync_own_role"})},15000);
      if(!r.ok)throw Object.assign(new Error(j.error||"role_resync_failed"),{code:j.error||"role_resync_failed"});
      const role=normalizedRole(j.membership?.role||"R1"),owner=String(state.alliance?.owner_player_id||"")===String(state.player_id||cloudSession?.user?.id||"");
      if(!owner&&!["R4","R5"].includes(role))throw Object.assign(new Error("self_role_not_manager"),{code:"self_role_not_manager"});
      state.alliance={...state.alliance,role,cloud_role_verified:true,management_verified:owner||["R4","R5"].includes(role)};
      saveState();
      return true;
    }catch{return false}
    finally{desertStormRoleResyncPromise=null;renderDesertStormPlanner()}
  })();
  return desertStormRoleResyncPromise;
}
 function desertStormSelectionFeedback(message,warn=false){
  const status=$("#desertStormStatus");if(!status)return;
  if(status.dataset)delete status.dataset.desertStormPlanSuccess;
  status.className=`notice${warn?" warn":""}`;
  status.textContent=message;
  status.classList.remove("hidden");
 }
 function renderDesertStormPicker(){
  const box=$("#desertStormRosterPicker"),counter=$("#desertStormCount");if(!box)return;const ds=ensureDesertStormState(),activeMembers=currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members),inactiveMembers=[...(state.alliance.roster_review||[]),...(state.alliance.former_members||[])];
  ds.registered_keys=normalizeDesertStormSelections(ds.registered_keys,activeMembers,inactiveMembers);
  ds.substitute_keys=normalizeDesertStormSubstituteSelections(ds.substitute_keys,ds.registered_keys,activeMembers,inactiveMembers);
  const members=activeMembers.map(m=>({...m,_key:desertStormMemberKeys(m)[0]})).filter(m=>m._key),selected=new Set(ds.registered_keys),substituteKeys=new Set(ds.substitute_keys),participantKeys=new Set(ds.registered_keys.filter(key=>!substituteKeys.has(key))),selectionAccess=desertStormSelectionAccess(),q=rosterNameKey(desertStormSearchTerm);
  const rows=members.map((row,index)=>({row,index,rank:participantKeys.has(row._key)?0:substituteKeys.has(row._key)?1:2})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(entry=>entry.row).filter(m=>!q||rosterNameKey(m.name).includes(q));
  if(counter)counter.textContent=`Participants ${participantKeys.size}/20 · Remplaçants ${substituteKeys.size}/10`;
  const notice=selectionAccess.syncing?t("ds_selection_syncing"):selectionAccess.allowed?"":t("ds_selection_requires_verified_access"),disabled=selectionAccess.allowed?"":" disabled aria-disabled=\"true\"";
  const overCapacity=participantKeys.size>20||substituteKeys.size>10;
  box.innerHTML=`${notice?`<div class="notice warn dsSelectionGuard">${esc(notice)}</div>`:""}${overCapacity?`<div class="notice warn dsSelectionGuard">Sélection existante au-delà de la limite. Désélectionne des joueurs pour revenir à 20 participants et 10 remplaçants.</div>`:""}${rows.length?rows.map(m=>{const status=substituteKeys.has(m._key)?"substitute":"participant",badge=status==="participant"?`<span class="availabilityAssignmentBadge participant" role="img" aria-label="Participant" title="Participant">✓ Participant</span>`:`<span class="availabilityAssignmentBadge substitute" role="img" aria-label="Remplaçant" title="Remplaçant">Remplaçant</span>`,statusControls=selected.has(m._key)?`<span class="dsStatusChoices" role="group" aria-label="Statut de ${esc(m.name||t("player"))}"><button type="button" class="dsStatusChoice${status==="participant"?" active":""}" data-ds-status-key="${esc(m._key)}" data-ds-status="participant" aria-pressed="${status==="participant"}">Participant</button><button type="button" class="dsStatusChoice${status==="substitute"?" active":""}" data-ds-status-key="${esc(m._key)}" data-ds-status="substitute" aria-pressed="${status==="substitute"}">Remplaçant</button></span>`:"";return `<label class="dsPlayerPick${selected.has(m._key)?" selected":""}${status==="substitute"?" substitute":""}${selectionAccess.allowed?"":" locked"}"><input type="checkbox" data-ds-player-key="${esc(m._key)}"${selected.has(m._key)?" checked":""}${disabled}/><span class="dsPlayerPickInfo"><b>${esc(m.name||t("player"))}${selected.has(m._key)?badge:""}</b><small>${esc(normalizeAllianceRole(m.role))} · ${t("hq")} ${esc(m.hq_level??"—")} · ${m.squad_power_m?`${esc(t("combat_squad_short"))} ${esc(fmtPower(m.squad_power_m))} · `:""}${esc(t("combat_account_short"))} ${esc(fmtPower(m.power_m))}</small>${statusControls}</span></label>`}).join(""):`<div class="notice">${esc(t("ds_no_match"))}</div>`}`;
  box.querySelectorAll("[data-ds-player-key]").forEach(ch=>ch.addEventListener("change",()=>{
     if(!desertStormSelectionAccess().allowed){ch.checked=!ch.checked;return}
      const current=ensureDesertStormState(),key=ch.dataset.dsPlayerKey,wasSelected=current.registered_keys.includes(key);
      if(ch.checked&&!wasSelected&&current.registered_keys.filter(candidate=>!current.substitute_keys.includes(candidate)).length>=20){ch.checked=false;desertStormSelectionFeedback("Limite atteinte : 20 participants maximum.",true);return}
      toggleDesertStormSelection(current.registered_keys,key,ch.checked);
      if(!ch.checked)current.substitute_keys=current.substitute_keys.filter(candidate=>candidate!==key);
       current.selection_initialized=true;invalidateDesertStormPlan(current);current.updated_at=new Date().toISOString();
      saveState({renderUi:false});renderDesertStormPicker();
  }));
  box.querySelectorAll("[data-ds-status-key]").forEach(button=>button.addEventListener("click",event=>{
    event.preventDefault();event.stopPropagation();
    if(!desertStormSelectionAccess().allowed)return;
    const current=ensureDesertStormState(),key=button.dataset.dsStatusKey,next=button.dataset.dsStatus,selectedNow=current.registered_keys.includes(key),isSub=current.substitute_keys.includes(key);
    if(!selectedNow||((next==="substitute")===isSub))return;
    if(next==="substitute"&&current.substitute_keys.length>=10){desertStormSelectionFeedback("Limite atteinte : 10 remplaçants maximum.",true);return}
    if(next==="participant"&&current.registered_keys.filter(candidate=>!current.substitute_keys.includes(candidate)).length>=20){desertStormSelectionFeedback("Limite atteinte : 20 participants maximum.",true);return}
    current.substitute_keys=next==="substitute"?[...new Set([...current.substitute_keys,key])]:current.substitute_keys.filter(candidate=>candidate!==key);
     current.selection_initialized=true;invalidateDesertStormPlan(current);current.updated_at=new Date().toISOString();saveState({renderUi:false});renderDesertStormPicker();
  }));
}
function renderDesertStormPlan(planOverride=null,{scrollIntoView=Boolean(planOverride)}={}){
  const box=$("#desertStormPlan"),copyBtn=$("#desertStormCopyBtn");if(!box)return {ok:false,error:"desert_storm_plan_container_missing"};
  const ds=ensureDesertStormState(),signature=desertStormCurrentSelectionSignature(ds),cached=recentlyGeneratedDesertStormPlan;
  let plan=planOverride||ds.plan;
  if(plan&&!plan.selection_signature){plan={...plan,selection_signature:signature};if(!planOverride)ds.plan=plan}
  if(plan&&plan.selection_signature!==signature){if(!planOverride)ds.plan=null;plan=null}
  if(!plan&&!planOverride&&cached?.signature===signature&&cached.plan){
    plan=cached.plan;ds.plan=plan;ds.updated_at=new Date().toISOString();state.alliance.updated_at=ds.updated_at;saveState({renderUi:false});
  }
  const rendered=renderDesertStormPlanInto(box,copyBtn,plan,{translate:t,escapeHtml:esc,missionLabel:dsMissionLabel,warningText:desertStormWarningText,copyText:desertStormCopyText,rulesetDate:DESERT_STORM_RULESET.observed_at,scrollIntoView});
  if(!rendered.ok)clearDesertStormPlanReadyStatus();
  if(rendered.ok&&copyBtn)copyBtn.onclick=async()=>{try{await navigator.clipboard.writeText(desertStormCopyText(plan));const old=copyBtn.textContent;copyBtn.textContent=t("copy");setTimeout(()=>copyBtn.textContent=old,1200)}catch{}};
  return rendered;
}
function renderDesertStormPlanner(){
  const section=$("#desertStormPlanner");if(!section)return;const ds=ensureDesertStormState(),manager=hasDeclaredAllianceCommandRole(),access=runtimeAccessState(),box=$("#desertStormRosterPicker"),counter=$("#desertStormCount");section.classList.toggle("managerLocked",!manager);
  const search=$("#desertStormSearch"),team=$("#desertStormTeam"),time=$("#desertStormTime"),clear=$("#desertStormClearBtn"),generate=$("#desertStormGenerateBtn");
  const selection=searchSelection(search);
  const selectionAccess=desertStormSelectionAccess(),disabled=!access.privateVisible||!selectionAccess.allowed;for(const el of [search,team,time,clear,generate])if(el)el.disabled=disabled;
  if(search?.isContentEditable||search?.getAttribute?.("contenteditable")){search.setAttribute("contenteditable",disabled?"false":"plaintext-only");search.setAttribute("aria-disabled",disabled?"true":"false")}
  if(!access.privateVisible){
    if(counter)counter.textContent="0";
    if(box)box.innerHTML=`<div class="notice warn">${esc(betaAccessMessage())}</div>`;
    const planBox=$("#desertStormPlan"),copyButton=$("#desertStormCopyBtn");
    if(planBox){planBox.innerHTML="";planBox.hidden=true;planBox.classList.add("hidden")}
    if(copyButton){copyButton.hidden=true;copyButton.classList.add("hidden")}
    clearDesertStormPlanReadyStatus();return
  }
  preserveSearchInput(search,desertStormSearchTerm);if(team)team.value=ds.team;if(time)time.value=ds.battle_time||"";
  renderDesertStormPicker();renderDesertStormPlan();restoreSearchSelection(search,selection);
  if(!selectionAccess.allowed&&!selectionAccess.syncing&&selectionAccess.canResync)void tryDesertStormRoleResync();
}

function activeAllianceRosterMembers(){
  return currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members).map(m=>({...m,lifecycle_key:rosterLifecycleKey(m)}));
}
function availabilityRowsForRoster(eventType,members,resetAt=null){
  const rows=mergeEventAvailabilities([
    ...(Array.isArray(state.alliance?.event_availability)?state.alliance.event_availability:[]),
    ...members.flatMap(m=>Array.isArray(m?.event_availability)?m.event_availability:[])
  ]).filter(row=>row.event_type===eventType);
  const resetMs=Date.parse(resetAt||"");
  return Number.isFinite(resetMs)?rows.filter(row=>{const updated=Date.parse(row.updated_at||"");return Number.isFinite(updated)&&updated>resetMs}):rows;
}
function desertStormAvailabilityCapacity(members=activeAllianceRosterMembers()){
  const ds=ensureDesertStormState(),rows=availabilityRowsForRoster("desert_storm",members,ds.availability_reset_at);
  return availabilityCapacityRoster(members,rows,{event_type:"desert_storm",max_starters:DESERT_STORM_RULESET.max_starters,max_substitutes:DESERT_STORM_RULESET.max_substitutes});
}
function desertStormPresentKeys(members=activeAllianceRosterMembers()){
  const capacity=desertStormAvailabilityCapacity(members);
  return [...capacity.participants,...capacity.substitutes].map(member=>desertStormMemberKeys(member)[0]||member.lifecycle_key||rosterLifecycleKey(member)).filter(Boolean);
}
function desertStormPlanSelection(members=activeAllianceRosterMembers()){
  const ds=ensureDesertStormState(),managedSelection=ds.selection_initialized===true||ds.registered_keys.length>0||ds.substitute_keys.length>0;
  if(managedSelection){
    const registeredKeys=normalizeDesertStormSelections(ds.registered_keys,members),substituteKeys=normalizeDesertStormSubstituteSelections(ds.substitute_keys,registeredKeys,members);
    return {registeredKeys,substituteKeys};
  }
  const capacity=desertStormAvailabilityCapacity(members);
  const keyFor=member=>desertStormMemberKeys(member)[0]||member.lifecycle_key||rosterLifecycleKey(member);
  return {
    registeredKeys:[...capacity.participants,...capacity.substitutes].map(keyFor).filter(Boolean),
    substituteKeys:capacity.substitutes.map(keyFor).filter(Boolean)
  };
}
function sortAvailabilityAssignmentRows(rows,participantKeys,substituteKeys,keyFn){
  return rows.map((row,index)=>({row,index,rank:keyFn(row).some(key=>participantKeys.has(key))?0:keyFn(row).some(key=>substituteKeys.has(key))?1:2}))
    .sort((a,b)=>a.rank-b.rank||a.index-b.index).map(entry=>entry.row);
}

function ensureCanyonState(){
  const alliance=state.alliance||(state.alliance={});
  const resetMs=Date.parse(alliance.canyon?.availability_reset_at||"");
  const generic=(alliance.event_availability||[]).filter(row=>row?.event_type==="canyon_storm").filter(row=>{if(!Number.isFinite(resetMs))return true;const updated=Date.parse(row.updated_at||"");return Number.isFinite(updated)&&updated>resetMs}).map(row=>({...row,member_key:row.member_key||row.canonical_member_key||row.lifecycle_key,canonical_member_key:row.canonical_member_key||null}));
  alliance.canyon=normalizeCanyonState({...alliance.canyon,availability:mergeAvailabilityRecords(alliance.canyon?.availability,generic)});
  return alliance.canyon;
}
function canyonSelectionMessage(text,warn=false){
  const message=$("#canyonStatusMessage");
  if(!message)return;
  message.className=`notice${warn?" warn":""}`;
  message.textContent=text;
  message.classList.remove("hidden");
}
function canyonHasPreparationSelection(canyon){
  const availability=(canyon?.availability||[]).some(row=>row?.status&&row.status!=="unknown"||String(row?.time_slot||"").trim());
  const plan=Boolean(canyon?.plan&&(canyon.plan.participants?.length||canyon.plan.substitutes?.length||canyon.plan.confirmation?.length||canyon.plan));
  return Boolean(availability||plan||canyon?.adjudicator_key);
}
function clearCanyonSelection(){
  const access=desertStormSelectionAccess();
  if(!access.allowed){
    canyonSelectionMessage(managerOnlyMessage(),true);
    return false;
  }
  const canyon=ensureCanyonState(),hasSelection=canyonHasPreparationSelection(canyon);
  if(!hasSelection){
    canyonSelectionMessage("Aucune sélection à effacer");
    return false;
  }
  const prompt=lang.startsWith("fr")?"Effacer la sélection Tempête du Canyon ?":"Clear the current Canyon Storm selection?";
  if(!window.confirm(prompt))return false;
  const now=new Date().toISOString(),members=currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members);
  state.alliance.canyon=clearCanyonPreparationSelection(canyon,members,now);
  state.alliance.updated_at=now;
  saveState();
  renderCanyonPlanner();
  canyonSelectionMessage(lang.startsWith("fr")?"Sélection Tempête du Canyon effacée.":"Canyon Storm selection cleared.");
  return true;
}
function canyonFactionLabel(value){return ({instigators:"Instaurateurs",scouts:"Éclaireurs",unknown:"Inconnue"})[value]||"Inconnue"}
function canyonStatusLabel(value){return ({preparation:"Préparation",battle:"Bataille",completed:"Terminé"})[value]||"Préparation"}
function canyonRoleLabel(value){return ({capture:"Capture",defense_garrison:"Garnison / défense",mobile_reaction:"Mobile / réaction",collection_energy:"Collecte / énergie",adjudicator:"Judicateur"})[value]||"À confirmer"}
function canyonObjectiveLabel(value){return ({data_center_i:"Centre de Données I",sample_warehouse_i:"Entrepôt d’Échantillons I",power_tower:"Tour d’Alimentation",virus_lab:"Laboratoire de Virus",defense_system_i:"Système de Défense I",serum_factory_i:"Usine de Sérum I",power_plant:"Centrale Électrique",point_supply_box:"Boîte de Ravitaillement"})[value]||value}
function canyonMemberKeys(member={}){return [...new Set([String(member.canonical_member_key||"").trim(),rosterLifecycleKey(member)].filter(Boolean))]}
function canyonAvailabilityFor(canyon,member){
  const keys=new Set(canyonMemberKeys(member));
  return (canyon.availability||[]).find(x=>keys.has(String(x.canonical_member_key||x.lifecycle_key||x.member_key||"")))||normalizeAvailabilityRecord({...member,event_type:"canyon_storm",status:"unknown"});
}
function canyonAvailabilityAssignments(canyon,active){
  const capacity=availabilityCapacityRoster(active,canyon.availability||[],{
    event_type:"canyon_storm",
    max_starters:CANYON_STORM_RULESET.max_starters,
    max_substitutes:CANYON_STORM_RULESET.max_substitutes
  });
  return {present:capacity.participants,participants:capacity.participants,substitutes:capacity.substitutes};
}
function upsertCanyonAvailability(member,patch={}){
  const canyon=ensureCanyonState(),keys=new Set(canyonMemberKeys(member)),at=new Date().toISOString(),existingIndex=canyon.availability.findIndex(x=>keys.has(String(x.canonical_member_key||x.lifecycle_key||x.member_key||""))),existing=existingIndex>=0?canyon.availability[existingIndex]:{};
  const explicit=Object.hasOwn(patch,"status")||Object.hasOwn(patch,"time_slot");
  const next=normalizeAvailabilityRecord({...existing,...member,...patch,event_type:"canyon_storm",source:explicit?"alliance_manager_manual":null,reliability:explicit?1:null,updated_at:at});
  if(existingIndex>=0)canyon.availability[existingIndex]=next;else canyon.availability.push(next);
  const generic=normalizeEventAvailability({...next,event_type:"canyon_storm",event_instance:canyon.scheduled_at||"current",event_date:String(canyon.scheduled_at||"").slice(0,10)||null,source:explicit?"alliance_manager_manual":"legacy",updated_at:at});
  state.alliance.event_availability=mergeEventAvailabilities(state.alliance.event_availability,[generic]);
  const rosterMember=(state.alliance.members||[]).find(row=>canyonMemberKeys(row).some(key=>keys.has(key)));
  if(rosterMember){rosterMember.event_availability=mergeEventAvailabilities(rosterMember.event_availability,[generic]);rosterMember.availability_history=mergeAvailabilityHistory(rosterMember.availability_history,[generic])}
  canyon.plan=null;canyon.validated_at=null;canyon.validated_by=null;canyon.updated_at=at;state.alliance.updated_at=at;
  saveState({renderUi:false});
}
function canyonScheduledTime(canyon){const value=String(canyon?.scheduled_at||"");return value.includes("T")?value.split("T")[1].slice(0,5):""}
function canyonPlanForRoster(canyon,members){
  const scheduled=String(canyon?.scheduled_at||""),[date,time=""]=scheduled.split("T");
  return buildCanyonPlan(members,canyon.availability||[],{faction:canyon.faction,status:canyon.status,date:date||null,time:time.slice(0,5)||null,adjudicator_key:canyon.adjudicator_key});
}
function renderCanyonAvailability(){
  const box=$("#canyonAvailabilityList"),slotBox=$("#canyonSlotSummary");if(!box)return;
  const canyon=ensureCanyonState(),active=currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members),assignments=canyonAvailabilityAssignments(canyon,active),participantKeys=new Set(assignments.participants.flatMap(canyonMemberKeys)),substituteKeys=new Set(assignments.substitutes.flatMap(canyonMemberKeys)),q=rosterNameKey(canyonSearchTerm),rows=sortAvailabilityAssignmentRows(active,participantKeys,substituteKeys,canyonMemberKeys).filter(m=>!q||rosterNameKey(m.name).includes(q)),counts=countAvailabilitySlots(canyon.availability,{event_type:"canyon_storm"}),best=recommendBestSlot(canyon.availability,{event_type:"canyon_storm"}),access=desertStormSelectionAccess(),disabled=access.allowed?"":" disabled";
  const slots=Object.values(counts).filter(x=>x.slot!=="to_confirm");
   if(slotBox)slotBox.innerHTML=slots.length?slots.map(x=>`<div class="canyonSlotChip"><b>${esc(x.slot)}${x.slot===best.slot?" · proposé":""}</b><span>Présents ${x.present} · Remplaçants ${x.substitute} · À confirmer ${x.to_confirm}</span></div>`).join(""):`<div class="notice">Créneaux à confirmer${best.slot&&best.slot!=="to_confirm"?` · proposition ${esc(best.slot)}`:""}</div>`;
  box.innerHTML=rows.length?rows.map(member=>{
     const row=canyonAvailabilityFor(canyon,member),key=canyonMemberKeys(member)[0],power=Number(member.squad_power_m)>0?`Escouade ${fmtPower(member.squad_power_m)}`:Number(member.power_m)>0?`Compte ${fmtPower(member.power_m)}`:"Puissance à confirmer",source=row.source?` · source ${row.source}${row.reliability!==null?` · fiabilité ${Math.round(row.reliability*100)}%`:""}`:"",badge=participantKeys.has(key)?`<span class="availabilityAssignmentBadge participant" role="img" aria-label="Participant" title="Participant">✓ Participant</span>`:substituteKeys.has(key)?`<span class="availabilityAssignmentBadge substitute" role="img" aria-label="Remplaçant" title="Remplaçant">Remplaçant</span>`:"";
      return `<div class="canyonAvailabilityRow" data-canyon-member="${esc(key)}"><div><b>${esc(member.name||t("player"))}${badge}</b><small>${esc(normalizeAllianceRole(member.role))} · ${esc(power)}${esc(source)}</small></div><select data-canyon-status="${esc(key)}"${disabled}>${availabilityStatusOptions("canyon_storm",row.status)}</select><input type="time" data-canyon-slot="${esc(key)}" value="${esc(row.time_slot||"")}" aria-label="Créneau de ${esc(member.name||t("player"))}"${disabled}/></div>`;
  }).join(""):`<div class="notice">Aucun joueur du roster correspondant.</div>`;
  const byKey=new Map(active.flatMap(m=>canyonMemberKeys(m).map(k=>[k,m])));
  box.querySelectorAll("[data-canyon-status]").forEach(input=>input.addEventListener("change",()=>{const member=byKey.get(input.dataset.canyonStatus);if(!member)return;const slot=[...box.querySelectorAll("[data-canyon-slot]")].find(x=>x.dataset.canyonSlot===input.dataset.canyonStatus)?.value||canyonAvailabilityFor(canyon,member).time_slot||canyonScheduledTime(canyon);upsertCanyonAvailability(member,{status:input.value,time_slot:slot||null});renderCanyonPlanner()}));
  box.querySelectorAll("[data-canyon-slot]").forEach(input=>input.addEventListener("change",()=>{const member=byKey.get(input.dataset.canyonSlot);if(!member)return;upsertCanyonAvailability(member,{time_slot:input.value||null});renderCanyonPlanner()}));
}
function renderCanyonRules(){
  const objectives=$("#canyonObjectives"),skills=$("#canyonSkills"),faction=ensureCanyonState().faction;
  if(objectives)objectives.innerHTML=`<div class="notice">Victoire : le camp avec le plus de Points de Champ de Bataille à la fin.</div><div class="canyonObjectiveList">
    <div class="canyonRuleCard"><b>Factions et entrée</b><small>Instaurateurs : 1 Force Opérationnelle, moins nombreux, bonus passifs, Judicateur possible. Éclaireurs : 2 Forces Opérationnelles, avantage numérique. Entrée réservée aux participants/remplaçants de l’alliance inscrite, avec une base hors Terres Contaminées près du Capitole. Début dans une zone protégée.</small></div>
    <div class="canyonRuleCard"><b>Laboratoire et points excédentaires</b><small>Le Laboratoire de Virus devient accessible après un certain temps · délai exact à confirmer. Les bâtiments peuvent accumuler des points excédentaires récupérables via les Boîtes de Ravitaillement.</small></div>
    <div class="canyonRuleCard"><b>Phase 1 · production initiale</b><small>Centre de Données I +20/s · Entrepôt d’Échantillons I +15/s · Tour d’Alimentation +50/s.</small></div>
    <div class="canyonRuleCard"><b>Phase 2 · contrôle et récupération</b><small>Système de Défense I +20/s · Usine de Sérum I +20/s · Centrale Électrique : collecte avec files inactives, valeur à confirmer · Boîte de Ravitaillement : récupère les points excédentaires, valeur à confirmer.</small></div>
    <div class="canyonRuleCard"><b>Phase 3 · Laboratoire de Virus</b><small>+120/s · priorité maximale avec défense et garnison.</small></div>
    <div class="canyonRuleCard"><b>Tour d’Alimentation</b><small>Instaurateurs : peut activer le bouclier de la Zone Sûre Centrale et rendre les bases présentes invulnérables aux attaques.</small></div>
    <div class="canyonRuleCard"><b>Système de Défense</b><small>Une fois capturé, attaque automatiquement les bâtiments centraux ennemis et blesse les troupes de garnison.</small></div>
    <div class="canyonRuleCard"><b>Usine de Sérum</b><small>Buff périodique au commandant qui la contrôle · effet exact à confirmer.</small></div></div>`;
  if(skills)skills.innerHTML=`${faction==="unknown"?`<div class="notice warn">Faction à confirmer : les compétences des deux factions restent visibles.</div>`:""}<div class="canyonSkillList">
    ${faction!=="scouts"?`<div class="canyonRuleCard"><b>Tour Sismique · Instaurateurs</b><small>30 s · coût 500000 · recharge 300 s · à l’arrivée 1000 dégâts de durabilité, puis toutes les 3 s 300 dégâts + 60 unités gravement blessées.</small></div>`:""}
    <div class="canyonRuleCard"><b>Hôpital de Front · universelle</b><small>30 s · coût 500000 · recharge 300 s · toutes les 3 s restaure 300 durabilité et soigne 150 unités blessées.</small></div>
    ${faction!=="instigators"?`<div class="canyonRuleCard"><b>Tourelle d’Artillerie · Éclaireurs</b><small>30 s · coût 750000 · recharge 300 s · toutes les 2 s 300 dégâts à la base ennemie la plus proche + 60 unités gravement blessées.</small></div>`:""}
    ${faction!=="scouts"?`<div class="canyonRuleCard"><b>Jour du Jugement · Judicateur Instaurateurs</b><small>120 s · coût 1000000 · recharge 300 s · téléportation réussie : 5000 dégâts ; destruction : recharge −30 s ; base ennemie détruite : recharge de téléportation +60 s.</small></div>`:""}
    <div class="canyonRuleCard"><b>Obtention d’énergie</b><small>Bataille · Assistance · Stratégie / garnison. Valeurs non confirmées : à confirmer.</small></div></div>`;
}
function renderCanyonPlan(){
  const box=$("#canyonPlan"),validate=$("#canyonValidateBtn");if(!box)return;const canyon=ensureCanyonState(),plan=canyon.plan;
  if(!plan){box.innerHTML=`<div class="notice">Renseigne les disponibilités réelles puis génère une proposition. Les données manquantes resteront « à confirmer ».</div>`;validate?.classList.add("hidden");return}
  const roleWhy={capture:"Sécuriser les objectifs de production confirmés.",defense_garrison:"Tenir les structures et la garnison.",mobile_reaction:"Réagir entre les objectifs sans abandonner la défense.",collection_energy:"Collecter l’énergie et les points excédentaires.",adjudicator:"Utiliser le rôle Judicateur confirmé pour les Instaurateurs."};
  const phases=(plan.phases||[]).map((phase,index)=>`<div class="canyonPhase"><h4>Phase ${index+1} · ${esc((phase.objectives||[]).map(canyonObjectiveLabel).join(" · "))}</h4>${(phase.assignments||[]).length?(phase.assignments||[]).map(x=>`<div class="canyonAssignment"><b>${esc(x.name)} · ${esc(canyonRoleLabel(x.role))}</b><small>Pourquoi : ${esc(roleWhy[x.role]||"À confirmer")} · Sources : ${esc((x.sources||[]).map(s=>s==="confirmed_rule"?"règle confirmée":s==="player_data"?"donnée joueur":"donnée alliance").join(", "))}</small></div>`).join(""):`<div class="notice">Affectations à confirmer.</div>`}</div>`).join("");
  const subs=Array.isArray(plan.substitutes)?plan.substitutes:[],confirm=(plan.confirmation||[]).length;
  box.innerHTML=`<div class="canyonPlanTop"><b>${canyon.validated_at?"Plan validé R4/R5":"Proposition à valider"}</b><small>${plan.participants?.length||0}/20 titulaires · ${subs.length}/10 remplaçants · ${confirm} disponibilités à confirmer${plan.faction_to_confirm?" · faction à confirmer":""}</small></div>${subs.length?`<div class="dsSubs"><b>Remplaçants</b><small>${esc(subs.join(" · "))}</small></div>`:""}<div class="canyonPhaseList">${phases}</div>`;
  if(validate)validate.classList.toggle("hidden",Boolean(canyon.validated_at));
}
function renderCanyonPlanner(){
   const section=$("#canyonPlanner");if(!section)return;const canyon=ensureCanyonState(),access=desertStormSelectionAccess(),runtime=runtimeAccessState(),disabled=!runtime.privateVisible||!access.allowed;
  section.classList.toggle("managerLocked",disabled);
   const faction=$("#canyonFaction"),status=$("#canyonStatus"),date=$("#canyonDateTime"),adjudicator=$("#canyonAdjudicator"),adjudicatorField=$("#canyonAdjudicatorField"),search=$("#canyonSearch"),generate=$("#canyonGenerateBtn"),clear=$("#canyonClearBtn");
    for(const el of [faction,status,date,adjudicator,search,generate])if(el)el.disabled=disabled;
    if(clear)clear.disabled=!runtime.privateVisible;
  if(faction)faction.value=canyon.faction;if(status)status.value=canyon.status;if(date)date.value=canyon.scheduled_at||"";if(search&&search!==document.activeElement)search.value=canyonSearchTerm;
   const active=currentActiveRosterMembers(state.alliance.members,state.alliance.roster_review,state.alliance.former_members),assignments=canyonAvailabilityAssignments(canyon,active),available=assignments.present;
  if(adjudicatorField)adjudicatorField.classList.toggle("hidden",canyon.faction!=="instigators");
  if(adjudicator){adjudicator.innerHTML=`<option value="">À confirmer</option>${available.map(m=>{const key=canyonMemberKeys(m)[0];return `<option value="${esc(key)}"${key===canyon.adjudicator_key?" selected":""}>${esc(m.name)}</option>`}).join("")}`;adjudicator.value=canyon.adjudicator_key||""}
   const summary=$("#canyonSummary"),participantCount=assignments.participants.length,substituteCount=assignments.substitutes.length,best=recommendBestSlot(canyon.availability,{event_type:"canyon_storm"}),priority=canyon.status==="completed"?"Terminé":canyon.status==="battle"?"Laboratoire / objectifs":"Disponibilités";
   if(summary)summary.innerHTML=`<div><small>Faction</small><b>${esc(canyonFactionLabel(canyon.faction))}</b></div><div><small>Participants</small><b>${participantCount}/${CANYON_STORM_RULESET.max_starters}</b></div><div><small>Remplaçants</small><b>${substituteCount}/${CANYON_STORM_RULESET.max_substitutes}</b></div><div><small>Priorité</small><b>${esc(best.slot&&best.slot!=="to_confirm"?`${priority} · ${best.slot}`:priority)}</b></div>`;
  section.querySelectorAll("[data-canyon-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.canyonTab===canyonActiveTab));
  section.querySelectorAll("[data-canyon-panel]").forEach(panel=>panel.classList.toggle("hidden",panel.dataset.canyonPanel!==canyonActiveTab));
   renderCanyonAvailability();renderCanyonRules();renderCanyonPlan();
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
  $("#vsUsScore").textContent=liveKnown?fmtVsNumber(v.our_score):"—";$("#vsThemScore").textContent=liveKnown?fmtVsNumber(v.their_score):"—";
  if(unknown){unknown.classList.toggle("hidden",liveKnown);unknown.textContent=stale?`${t("vs_stale_notice")} · ${vsSideLabel(v,"ours")} ${fmtVsNumber(v.our_score)} / ${vsSideLabel(v,"theirs")} ${fmtVsNumber(v.their_score)}`:t("vs_score_unknown")}
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
function renderAdvice(){
  const title=$("#adviceTitle"),text=$("#adviceText"),action=$("#adviceAction");if(!title||!text||!action)return;
  const access=runtimeAccessState();
  if(!access.privateVisible){
    const waiting=access.phase==="syncing";title.textContent=waiting?t("syncing"):t("configure_profile");text.textContent=betaAccessMessage();action.textContent=!access.logged?t("login"):access.phase==="consent-required"?t("configure"):t("update");return;
  }
  const p=state?.player||{};
  if(!String(p.name||"").trim()){title.textContent=t("configure_profile");text.textContent=t("configure_text");action.textContent=t("configure");return}
  // HF8.6.27: once an owned player profile exists, paint a valid player-aware baseline FIRST.
  // Optional priority calculations may refine it, but can no longer leave the stale pre-login "Configure ton profil" card behind.
  title.textContent=t("hello",{name:p.name});text.textContent=t("sync_four");action.textContent=t("open_player");
  let onboarding;try{onboarding=playerOnboardingStatus()}catch(error){pushBootstrapStage("RENDER_ADVICE_ONBOARDING",0,"error",error?.message||error?.name||"error","browser");return}
  if(!onboarding.complete){action.textContent=t("scan_account");return}
  let primary=null;try{primary=selectPrimarySquad(state)}catch(error){pushBootstrapStage("RENDER_ADVICE_PRIMARY",0,"error",error?.message||error?.name||"error","browser");return}
  if(!primary)return;
  const primaryName=`${t("squad")} ${primary.i+1}`;let advice=t("priority_text",{power:fmtPower(primary.s?.power)});
  try{
    const primaryPower=Number(primary.s?.power),strongestOther=(state.squads||[]).map((sq,i)=>({s:sq,i,p:Number(sq?.power)})).filter(x=>x.i!==primary.i&&squadHasData(x.s)&&Number.isFinite(x.p)&&x.p>0).sort((a,b)=>b.p-a.p)[0];
    if(primary.i===0&&Number.isFinite(primaryPower)&&strongestOther&&strongestOther.p>primaryPower)advice+=` ${t("stronger_squad_note",{name:`${t("squad")} ${strongestOther.i+1}`,power:fmtPower(strongestOther.p)})}`;
  }catch(error){pushBootstrapStage("RENDER_ADVICE_COMPARE",0,"error",error?.message||error?.name||"error","browser")}
  title.textContent=t("priority",{name:primaryName});text.textContent=advice;action.textContent=t("view_squads");
}
 function renderAccountFields(){const p=state.player,ctx=state.player_context||{},reveal=betaPrivateDataVisible(),canonical=canonicalSelfRosterMember(),displayName=canonical?.name||p.name||"";if(!$("#fName"))return;const ids=["fName","fServer","fHq","fAlliance","fRole","fObjective","fAccountAge","fServerProfile"];if(!reveal){$("#fName").value="";$("#fServer").value="";$("#fHq").value="";$("#fAlliance").value="";$("#fRole").value="";if($("#fObjective"))$("#fObjective").value="auto";if($("#fAccountAge"))$("#fAccountAge").value="";if($("#fServerProfile"))$("#fServerProfile").value="auto"}else{$("#fName").value=displayName;$("#fServer").value=p.server_id||"";$("#fHq").value=p.hq_level||"";$("#fAlliance").value=state.alliance.tag||"";$("#fRole").value=p.role||"R1";if($("#fObjective"))$("#fObjective").value=ctx.objective||"auto";if($("#fAccountAge"))$("#fAccountAge").value=ctx.account_age_days??"";if($("#fServerProfile"))$("#fServerProfile").value=ctx.server_profile||"auto"}ids.forEach(id=>{const el=$("#"+id);if(el)el.disabled=!reveal});if($("#fName"))$("#fName").readOnly=Boolean(reveal&&canonical);if($("#saveProfileBtn"))$("#saveProfileBtn").disabled=!reveal;renderVoiceSettings()}
function renderProvider(){
  const sync=state?.sync||{},sources=sync.sources||{},pill=$("#providerPill"),box=$("#providerStatus"),access=runtimeAccessState(),reveal=access.privateVisible;
  if(pill){pill.textContent=t("safe_external_disabled");pill.className="pill"}
  const publicState=$("#publicSourceState"),scanState=$("#scanSourceState"),allianceState=$("#allianceCloudState");
  if(publicState)publicState.textContent=t("safe_external_disabled");
  if(scanState)scanState.textContent=(sources.scan||sync.last_scan)?t("available"):t("ready");
  if(allianceState)allianceState.textContent=(sources.alliance||cloudSession)?t("available"):t("not_connected");
  const scanBtn=$("#openScanBtn"),syncBtn=$("#syncAllBtn");if(scanBtn)scanBtn.disabled=!reveal;if(syncBtn)syncBtn.disabled=!reveal;
  if(!box)return;
  box.className=`notice${reveal?"":" warn"}`;
  if(!reveal){box.textContent=betaAccessMessage();return}
  // HF8.6.27: the provider panel derives from the same READY access contract as Account/Player.
  // It must never remain on the old "Synchronisation…" message after the owned profile is visible.
  box.textContent=sync.pending_cloud_save?t("offline_keep"):(sync.status==="ok"||sync.last_sync?t("safe_sync_done"):t("safe_sync_note"));
}
function openDrawer(name){
  // Re-render immediately before a user opens any data drawer. Because render() now has complete
  // per-surface boundaries, a failure in one module cannot stop this drawer from refreshing.
  if(["account","player","alliance","vs","season","qg35Coach"].includes(String(name||"")))safeRenderStep(`DRAWER_REFRESH_${String(name||"").toUpperCase()}`,render);
  closeDrawers();
  $("#backdrop").classList.add("open");const d=$("#"+name+"Drawer");if(d){d.classList.add("open");d.setAttribute("aria-hidden","false")}
  if(name==="account"){safeRenderStep("ACCOUNT_OPEN_FIELDS",renderAccountFields);safeRenderStep("ACCOUNT_OPEN_AUTH",renderAuth);safeRenderStep("ACCOUNT_OPEN_BETA",renderBeta);safeRenderStep("ACCOUNT_OPEN_PRO",renderPro)}
  if(betaPrivateDataVisible()&&name==="player")safeRenderStep("PLAYER_OPEN_CORE",()=>renderPlayerCoreSummary(state.player,state.drone||{}));
  if(betaPrivateDataVisible()&&name==="alliance"){safeRenderStep("ALLIANCE_OPEN_CORE",()=>renderAllianceCoreSummary(state.player,state.alliance));safeRenderStep("ALLIANCE_OPEN_MEMBERS",renderMembers);safeRenderStep("ALLIANCE_OPEN_ACCESS",renderAllianceAccess);safeRenderStep("ALLIANCE_OPEN_DESERT_STORM",renderDesertStormPlanner);safeRenderStep("ALLIANCE_OPEN_CANYON",renderCanyonPlanner);bindAllianceAccordions();resetAllianceAccordions()}
  if(betaPrivateDataVisible()&&name==="vs")safeRenderStep("VS_OPEN_CORE",renderVsLive);
  if(betaPrivateDataVisible()&&name==="season"){safeRenderStep("SEASON_OPEN_ACCESS",renderSeasonAccess);safeRenderStep("SEASON_OPEN_CORE",()=>renderSeasonCoreSummary(state.season));}
  if(betaPrivateDataVisible()&&name==="qg35Coach")safeRenderStep("QG35_COACH_OPEN",renderEndgameCoachDrawer);
  if(name==="player"||name==="alliance")setTimeout(()=>speakGreeting(name),80)
}
function closeDrawers(){unmountAuthControls();closeAlliancePlayerProfile();closeAllianceEventDetail();$("#backdrop").classList.remove("open");$$('.drawer').forEach(d=>{d.classList.remove("open");d.setAttribute("aria-hidden","true")})}

$$('[data-open]').forEach(b=>b.addEventListener("click",()=>{if(!requireBetaAccess()||!requireBetaConsent())return;openDrawer(b.dataset.open)}));$("#homeProBtn")?.addEventListener("click",()=>{openDrawer("account");setTimeout(()=>$("#proSection")?.scrollIntoView({behavior:"smooth",block:"start"}),140)});$$('[data-close]').forEach(b=>b.addEventListener("click",closeDrawers));$("#backdrop").addEventListener("click",closeDrawers);$("#accountBtn").addEventListener("click",()=>openDrawer("account"));$("#adviceAction").addEventListener("click",()=>{if(state.player.name&&(!requireBetaAccess()||!requireBetaConsent()))return;if(playerNeedsOnboarding()&&betaPrivateDataVisible()){const next=playerOnboardingStatus().next_type||"profile";return openQuickScan(next)}openDrawer(state.player.name?"player":"account")});$("#languageSelect").addEventListener("change",e=>{languageChoice=e.target.value;safeLocalSet(LANG_KEY,languageChoice);applyLanguage()});
$("#qg35CoachCard")?.addEventListener("click",event=>{const card=event.currentTarget;if(card?.disabled||!betaPrivateDataVisible())return;if(!requireBetaAccess()||!requireBetaConsent())return;openDrawer("qg35Coach")});
$("#qg35UnknownScanBtn")?.addEventListener("click",()=>openQuickScan("profile"));
$("#qg35CoachDrawer")?.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target:null;if(!target)return;
  const scan=target.closest("[data-qg35-scan-type]");
  if(scan){openQuickScan(scan.dataset.qg35ScanType);return}
  const why=target.closest("[data-qg35-why]");
  if(why){const index=why.dataset.qg35Why,body=$(`#qg35Why${index}`),expanded=why.getAttribute("aria-expanded")==="true";if(body)body.classList.toggle("hidden",expanded);why.setAttribute("aria-expanded",String(!expanded));return}
  if(target.closest("[data-qg35-pro]")){if(requirePro()){renderEndgameCoachDrawer();$("#qg35AdvancedSections")?.scrollIntoView({behavior:"smooth",block:"start"})}}
});
$("#saveProfileBtn").addEventListener("click",async()=>{
   const status=$("#profileSaveStatus"),btn=$("#saveProfileBtn"),name=canonicalSelfRosterMember()?.name||$("#fName").value.trim(),server=$("#fServer").value.trim(),hq=Number($("#fHq").value),requestedRole=$("#fRole").value.trim().toUpperCase()||"R1";
  const show=(text,warn=false)=>{if(status){status.className=`notice${warn?" warn":""}`;status.textContent=text;status.classList.remove("hidden")}};
  if(!name||!/^\d{1,6}$/.test(server)||!Number.isFinite(hq)||hq<1||hq>200)return show(t("profile_required"),true);
  if(!/^R[1-5]$/.test(requestedRole))return show(t("profile_role_invalid"),true);
  state.player.name=name;state.player.server_id=server;state.player.hq_level=Math.round(hq);
  const ctxAgeRaw=String($("#fAccountAge")?.value??"").trim(),ctxAge=ctxAgeRaw===""?null:Number(ctxAgeRaw);state.player_context={...(state.player_context||{}),objective:$("#fObjective")?.value||"auto",account_age_days:ctxAge!==null&&Number.isFinite(ctxAge)&&ctxAge>=0?Math.round(ctxAge):null,server_profile:$("#fServerProfile")?.value||"auto",updated_at:new Date().toISOString()};state.player.role=safeSelfRole(requestedRole);state.player.updated_at=new Date().toISOString();state.alliance.server_id=state.player.server_id;state.alliance.tag=$("#fAlliance").value.trim().toUpperCase();state.vs.our_alliance=state.alliance.tag;reconcileCurrentPlayerAllianceIdentity({touch:true});recordProgressionSnapshot("manual_profile");saveState();
  if(btn){btn.disabled=true;btn.textContent=t("syncing")}show(t("syncing"));clearTimeout(pushTimer);pushTimer=null;
  try{const saved=await pushServerState();if(!saved?.ok){show(t("profile_saved_pending"),true);return}const joined=await joinPendingAlliance();if(joined)await pushServerState();show(t("profile_saved_cloud"),false);setTimeout(closeDrawers,650)}catch{show(t("profile_saved_pending"),true)}finally{if(btn){btn.disabled=false;btn.textContent=t("save")}}
});

async function syncAll(){
  if(!requireBetaAccess()||!requireBetaConsent())return;
  const btns=[$("#syncAllBtn"),$("#syncPlayerBtn")].filter(Boolean);
  btns.forEach(b=>{b.disabled=true;b.textContent=t("syncing")});
  try{
    if(!hasMeaningfulCore(state)&&cloudSession?.access_token){
      const recovered=await reconcileAuthenticatedRuntime("manual-sync",{force:true});
      if(!recovered?.ok||!hasMeaningfulCore(state)){
        const note=$("#playerSyncInfo");
        if(note){note.className="notice warn";note.classList.remove("hidden");note.textContent=t("offline_keep")}
        scheduleCloudPullRetry();return;
      }
    }
    const {response:r,json:j}=await fetchJsonBounded("/api/sync",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({state,locale:lang,base_updated_at:cloudRevision})},20000);
    if(r.ok&&j.state){
      cloudRevision=j.updated_at||cloudRevision;
      const remote=hydrateCloudState(j.state,initialState(),cloudSession?.user?.id||state.player_id);
      let merged;
      try{merged=mergeStateProtected(state,remote,{preferBase:false})}catch{merged=remote}
      try{state=repairLegacySquadIdentity(merged).state}catch{state=remote}
      state=adoptCanonicalPendingAccounts(state,remote,{available:j.alliance_pending_source==="canonical"});
      state.sync={...state.sync,status:"ok",provider:j.provider||state.sync.provider||"warboost-local",provider_kind:j.provider_kind||state.sync.provider_kind||"local",capabilities:j.capabilities||state.sync.capabilities||[],last_sync:j.synced_at||new Date().toISOString(),last_error:null,sources:{...state.sync.sources,...j.sources}};
      saveState();$("#playerSyncInfo").textContent=t("safe_sync_done");
    }else if(r.status===409&&j?.error==="profile_write_conflict"){
      const remote=j?.state?hydrateCloudState(j.state,initialState(),cloudSession?.user?.id||state.player_id):null;
      if(remote){
        try{state=mergeStateProtected(remote,state,{preferBase:false})}catch{state=remote}
        state=adoptCanonicalPendingAccounts(state,remote,{available:false});
      }
      cloudRevision=j?.updated_at||null;state.sync.last_error="profile_write_conflict";state.sync.status="waiting";saveState();scheduleCloudRetry(250);
    }else{
      state.sync.last_error=j.message||j.error||t("hybrid_no_public");state.sync.status="waiting";saveState();
    }
  }catch{
    state.sync.last_error=t("offline_keep");state.sync.status="offline";saveState();
  }finally{
    btns.forEach((b,i)=>{b.disabled=false;b.textContent=i===0?t("public_refresh"):t("public_button")});
  }
}
$("#syncAllBtn").addEventListener("click",syncAll);$("#syncPlayerBtn").addEventListener("click",syncAll);
$("#openScanBtn").addEventListener("click",()=>openQuickScan("profile"));$("#scanPlayerBtn").addEventListener("click",()=>openQuickScan(playerOnboardingStatus().next_type||"profile"));$("#playerOnboardingScanBtn")?.addEventListener("click",e=>openQuickScan(e.currentTarget?.dataset?.nextScan||playerOnboardingStatus().next_type||"profile"));$("#quickProfileScanBtn")?.addEventListener("click",()=>openQuickScan("profile"));$("#quickSquadScanBtn")?.addEventListener("click",()=>{const strongest=strongestSquadFromState(state);openQuickScan(`squad${strongest.id||1}`)});$("#quickDroneScanBtn")?.addEventListener("click",()=>openQuickScan("drone"));$("#scanShopBtn")?.addEventListener("click",()=>openQuickScan("shop"));$("#scanVsBtn")?.addEventListener("click",()=>openQuickScan("vs"));$("#vsStartScanBtn")?.addEventListener("click",()=>openQuickScan("vs"));$("#scanSeasonBtn")?.addEventListener("click",()=>openQuickScan("season"));

async function fetchWarBoostScan(payload){const response=await fetch("/api/scan",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify(payload)}),json=await response.json().catch(()=>({}));return {response,json}}
function scanResultHasUsefulData(scanType,payload){const type=String(scanType||"profile").toLowerCase(),x=payload&&typeof payload==="object"?payload:{};if(type==="profile"){const p=x.player||{};return Boolean(p.name||p.server_id||p.coordinates||p.role||Number(p.hq_level)>0||Number(p.power_m)>0)}if(type==="drone"){const d=x.drone||{};return Number(d.level)>0||Number(d.power_m)>0}const sm=type.match(/^squad([1-4])$/);if(sm){const sq=x.squads?.[Number(sm[1])-1];if(!sq)return false;if(Number(sq.power)>0)return true;return (sq.heroes||[]).some(h=>Boolean(h?.name||Number(h?.level)>=0&&h?.level!==null||Number(h?.stars)>0||Number(h?.power)>0||h?.exclusive||h?.gear))}if(type==="exclusive")return Array.isArray(x.exclusive_weapons)&&x.exclusive_weapons.some(w=>w?.hero_name||w?.weapon_name||Number(w?.level)>=0&&w?.level!==null||Number(w?.power)>0);if(type==="awakening")return Array.isArray(x.hero_progression)&&x.hero_progression.some(h=>h?.hero_name||h?.awakening);if(type==="shop")return Boolean(x.shop&&(x.shop.store_type||x.shop.currency||Number(x.shop.currency_balance)>0||(x.shop.offers||[]).length));if(type==="vs")return Boolean(x.vs&&(x.vs.theme||x.vs.our_alliance||x.vs.opponent||Number(x.vs.our_score)>0||Number(x.vs.their_score)>0||x.vs.time_remaining_text));if(type==="season")return Boolean(x.season&&Object.keys(x.season).some(k=>k!=="updated_at"));return Object.keys(x).length>0}
async function imageToDataUrl(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=2048,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);let data=c.toDataURL("image/jpeg",.9);if(data.length>3900000)data=c.toDataURL("image/jpeg",.78);URL.revokeObjectURL(url);resolve(data)}catch(e){reject(e)}};img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url})}
$("#scanFile").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{scanImageData=await imageToDataUrl(file);scanImageName=String(file.name||"capture.jpg");$("#scanPreview").src=scanImageData;$("#scanPreview").classList.remove("hidden");$("#clearScanCaptureBtn")?.classList.remove("hidden");const kept=await savePendingSingleScan(pendingScanOwner(),{scan_type:$("#scanType")?.value||"profile",image_data_url:scanImageData,name:scanImageName});$("#scanStatus").className=kept?"notice":"notice warn";$("#scanStatus").textContent=t(kept?"scan_ready":"scan_pending_local_failed")}catch{$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_error")}});
$("#scanType")?.addEventListener("change",()=>{if(scanImageData)void savePendingSingleScan(pendingScanOwner(),{scan_type:$("#scanType")?.value||"profile",image_data_url:scanImageData,name:scanImageName})});
$("#clearScanCaptureBtn")?.addEventListener("click",()=>{clearScanImage();const st=$("#scanStatus");if(st){st.className="notice";st.textContent=t("scan_wait")}});
async function analyzeExclusiveScan(){
  const btn=$("#analyzeScanBtn"),status=$("#scanStatus"),scanType="exclusive";
  if(!scanImageData){status.className="notice warn";status.textContent=t("scan_wait");return}
  if(!requireBetaAccess()||!requireBetaConsent())return;
  if(!cloudSession?.access_token){openDrawer("account");authMessage(t("connect_pro"));return}
  btn.disabled=true;btn.textContent=t("scan_processing");status.className="notice";status.textContent=t("scan_processing");
  try{
    const {response:r,json:j}=await fetchWarBoostScan({scan_type:scanType,locale:lang,image_data_url:scanImageData,current_state:state});
    if(!r.ok){
      const message=j?.message||j?.error||t("scan_error");
      status.className="notice warn";status.textContent=t("scan_exclusive_analysis_failed",{message});return;
    }
    const rows=Array.isArray(j?.state?.exclusive_weapons)?j.state.exclusive_weapons:[];
    if(!j?.state||!scanResultHasUsefulData(scanType,j.state)||!rows.length||exclusiveResultFieldCount(rows)<1){
      await savePendingSingleScan(pendingScanOwner(),{scan_type:scanType,image_data_url:scanImageData,name:scanImageName});
      status.className="notice warn";status.textContent=t("scan_exclusive_no_data");return;
    }
    const rendered=renderExclusiveConfirmation(rows);
    if(!rendered){
      await savePendingSingleScan(pendingScanOwner(),{scan_type:scanType,image_data_url:scanImageData,name:scanImageName});
      status.className="notice warn";status.textContent=t("scan_exclusive_no_data");return;
    }
     const first=rows[0],hero=first?.hero_name||first?.weapon_name||t("exclusive_weapon"),fields=exclusiveResultFieldCount(rows);
     const needsPowerReview=rows.some(row=>{const raw=String(row?.power_raw??"").trim();return Boolean(raw&&confirmedHeroPower(exclusivePower(row?.power??raw))===null)});
     status.className=needsPowerReview?"notice warn":"notice";
     status.textContent=needsPowerReview
       ?(lang.startsWith("fr")?"Puissance détectée à vérifier. Corrige la valeur dans le panneau avant l’enregistrement.":t("scan_exclusive_power_verify"))
       :t("scan_exclusive_result_ready",{hero,fields});
  }catch(error){status.className="notice warn";status.textContent=error?.message||t("scan_error")}
  finally{btn.disabled=false;btn.textContent=t("analyze")}
}
$("#analyzeScanBtn").addEventListener("click",async event=>{
  if($("#scanType")?.value!=="exclusive")return;
  event.stopImmediatePropagation();
  await analyzeExclusiveScan();
});
$("#saveExclusiveConfirmBtn")?.addEventListener("click",()=>saveConfirmedExclusiveScan());
$("#cancelExclusiveConfirmBtn")?.addEventListener("click",()=>{
  pendingExclusiveScan=[];$("#exclusiveConfirmPanel")?.classList.add("hidden");
  const status=$("#scanStatus");if(status){status.className="notice";status.textContent=t("scan_ready")}
});
$("#scanType")?.addEventListener("change",()=>{pendingExclusiveScan=[];$("#exclusiveConfirmPanel")?.classList.add("hidden");updateSquadCaptureHelp($("#scanType")?.value||"profile")});
$("#collapseAllSquadsBtn")?.addEventListener("click",e=>{e.preventDefault();document.querySelectorAll("#squadList details.squad").forEach(squad=>{squad.open=false})});
$("#squadCaptureHelpBtn")?.addEventListener("click",()=>openSquadCaptureHelp(false));
$("#squadCaptureAckBtn")?.addEventListener("click",closeSquadCaptureHelp);
$("#analyzeScanBtn").addEventListener("click",async()=>{if(!scanImageData){$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_wait");return}if(!requireBetaAccess()||!requireBetaConsent())return;if(!cloudSession?.access_token){openDrawer("account");authMessage(t("connect_pro"));return}const btn=$("#analyzeScanBtn");btn.disabled=true;btn.textContent=t("scan_processing");$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_processing");try{const {response:r,json:j}=await fetchWarBoostScan({scan_type:$("#scanType").value,locale:lang,image_data_url:scanImageData,current_state:state});if(r.ok&&j.state){const scanType=$("#scanType").value;if(!scanResultHasUsefulData(scanType,j.state)){const st=$("#scanStatus");st.className="notice warn";st.textContent=t("scan_error");await savePendingSingleScan(pendingScanOwner(),{scan_type:scanType,image_data_url:scanImageData,name:scanImageName});return}const sm=String(scanType||"").match(/^squad([1-4])$/i);let suggestedNames=[],scanSlots=[],scanPowerConfirmed=false;if(sm){const idx=Number(sm[1])-1,incomingSq=j.state.squads?.[idx];scanPowerConfirmed=heroPowerIsConfirmed(incomingSq?.power);if(incomingSq?.heroes){scanSlots=Array.from({length:5},(_,i)=>({...((incomingSq.heroes?.[i]&&typeof incomingSq.heroes[i]==="object")?incomingSq.heroes[i]:{})}));suggestedNames=scanSlots.map(h=>String(h?.name||"").trim());delete incomingSq.heroes}}state=repairLegacySquadIdentity(mergeStateProtected(state,j.state,{preferBase:false})).state;if(sm){const staged=state.squads?.[Number(sm[1])-1];if(staged){if(!scanPowerConfirmed&&heroPowerIsConfirmed(staged.power)){staged.last_confirmed_power=staged.last_confirmed_power??staged.power;staged.power=null;staged.power_sync_status="pending"}else if(scanPowerConfirmed){staged.last_confirmed_power=staged.power;staged.power_sync_status="confirmed"}staged.needs_rescan=true;staged.composition_changed_at=j.scanned_at||new Date().toISOString()}}state.sync.last_scan=j.scanned_at||new Date().toISOString();state.sync.sources={...state.sync.sources,scan:true,};if(["profile","drone","exclusive","awakening"].includes(scanType)||sm)recordProgressionSnapshot(`scan_${scanType}`,j.scanned_at||new Date().toISOString());saveState();$("#proPriorityPanel")?.classList.add("hidden");$("#playerSyncInfo")?.classList.remove("hidden");if(sm){const count=suggestedNames.filter(Boolean).length;$("#scanStatus").className="notice warn";$("#scanStatus").textContent=count>0?t("hero_auto_recognized",{count}):t("hero_confirm_needed");startHeroConfirmation(Number(sm[1]),suggestedNames,scanSlots)}else{$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_saved");closeHeroConfirmation(false);if(scanType==="vs"){render();openDrawer("vs");if(proFeatureAllowed()){const live=await requestAdvice("vs");$("#vsPlanText").textContent=structuredAdviceText("vs",live)}}}}else{const scanStatus=$("#scanStatus");scanStatus.className="notice warn";if(j.code==="WRONG_SQUAD_CAPTURE"){scanStatus.textContent=t("scan_wrong_squad_capture");openSquadCaptureHelp(true)}else scanStatus.textContent=j.code==="SCAN_NOT_CONFIGURED"?t("scan_unconfigured"):(j.message||t("scan_error"))}}catch(e){$("#scanStatus").className="notice warn";$("#scanStatus").textContent=e?.message||t("scan_error")}finally{btn.disabled=false;btn.textContent=t("analyze")}});

async function requestAdvice(scope){if(scope==="vs"){state.vs.week=currentVsWeek();state.vs.day=currentVsDay()}try{const {response:r,json:j}=await fetchJsonBounded("/api/advice",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({scope,state,locale:lang})},25000);if(r.ok)return j}catch{}return null}
async function runPlayerAdvice(scrollShop=false){if(!requirePro())return;const ready=playerOnboardingStatus(),note=$("#playerSyncInfo");if(!ready.mainReady){if(note){note.className="notice warn";note.classList.remove("hidden");note.textContent=t("onboarding_need_squad")}renderPlayerOnboarding();$("#playerOnboarding")?.scrollIntoView({behavior:"smooth",block:"center"});return}const buttons=[$("#playerAdviceBtn"),$("#shopAdviceBtn")].filter(Boolean),panel=$("#proPriorityPanel"),labels=buttons.map(b=>b.textContent);buttons.forEach(b=>{b.disabled=true;b.textContent=t("pro_analyzing")});if(note){note.classList.remove("hidden");note.textContent=t("pro_analyzing")}if(panel)panel.classList.add("hidden");const j=await requestAdvice("player");if(j?.analysis){renderProPriority(j.analysis);if(scrollShop)setTimeout(()=>$("#proShopList")?.scrollIntoView({behavior:"smooth",block:"start"}),120)}else if(note)note.textContent=j?.advice||t("player_sync_note");buttons.forEach((b,i)=>{b.disabled=false;b.textContent=labels[i]})}
$("#playerAvailabilityEvent")?.addEventListener("change",renderPlayerAvailability);
$("#playerAvailabilityDate")?.addEventListener("change",renderPlayerAvailability);
$("#playerAvailabilitySaveBtn")?.addEventListener("click",savePlayerAvailability);
$("#managerAvailabilityEvent")?.addEventListener("change",renderAllianceAvailability);
$("#managerAvailabilityDate")?.addEventListener("change",renderAllianceAvailability);
$("#managerAvailabilitySearch")?.addEventListener("input",renderAllianceAvailability);
$("#alliancePlayerModal")?.addEventListener("click",event=>{if(event.target?.closest?.("[data-alliance-player-close]")){event.preventDefault();closeAlliancePlayerProfile()}});
$("#allianceEventWorkspace")?.addEventListener("click",event=>{
  const card=event.target?.closest?.("[data-alliance-event]");
  if(card){event.preventDefault();toggleAllianceEventDetail(card.dataset.allianceEvent||"desert_storm");return}
  const player=event.target?.closest?.("[data-alliance-player-key]");
  if(player){event.preventDefault();openAlliancePlayerProfile(player.dataset.alliancePlayerKey,allianceEventActive);return}
  const plan=event.target?.closest?.("[data-alliance-event-plan]");
  if(plan){event.preventDefault();generateAllianceEventPlan(allianceEventActive)}
});
$("#allianceEventWorkspace")?.addEventListener("change",event=>{
  const select=event.target?.closest?.("[data-alliance-event-status]");if(!select)return;
  const member=activeAllianceRosterMembers().find(x=>allianceEventMemberKey(x)===select.dataset.allianceEventStatus);
  saveAllianceEventStatus(member,allianceEventActive,select.value);renderAllianceEventWorkspace();
});
bindAllianceAccordions();
window.addEventListener("popstate",()=>{
  if(alliancePlayerProfileIsOpen()){closeAlliancePlayerProfile({fromHistory:true});return}
  if(allianceEventDetailIsOpen())closeAllianceEventDetail({fromHistory:true});
});
document.addEventListener("keydown",event=>{
  if(event.key!=="Escape")return;
  if(alliancePlayerProfileIsOpen()){event.preventDefault();closeAlliancePlayerProfile();return}
  if(allianceEventDetailIsOpen()){event.preventDefault();closeAllianceEventDetail()}
});
$("#playerAdviceBtn").addEventListener("click",()=>runPlayerAdvice(false));$("#shopAdviceBtn")?.addEventListener("click",()=>runPlayerAdvice(true));
$("#warPlanBtn").addEventListener("click",async()=>{if(!requirePro())return;if(!hasDeclaredAllianceCommandRole()){$("#warPlanText").textContent=managerOnlyMessage();return}const j=await requestAdvice("alliance");$("#warPlanText").textContent=structuredAdviceText("alliance",j);renderAllianceStructured(j)});
$("#rankManagerSearch")?.addEventListener("input",e=>{rankManagerSearchTerm=searchInputValue(e.target);scheduleAllianceRankSearchRender()});
$("#rankManagerClearBtn")?.addEventListener("click",()=>{rankChangeDraft.clear();renderAllianceRankManager();rankManagerStatus("",{},false)});
$("#rankManagerSyncSelfBtn")?.addEventListener("click",resyncOwnRankManagerRole);
$("#rankManagerApplyBtn")?.addEventListener("click",applyRankManagerChanges);
function unlockDesertStormSearch(event){unlockDesertStormSearchInput(event.currentTarget)}
const desertStormSearchInput=$("#desertStormSearch");
desertStormSearchInput?.addEventListener("pointerdown",unlockDesertStormSearch);
desertStormSearchInput?.addEventListener("keydown",unlockDesertStormSearch);
desertStormSearchInput?.addEventListener("focus",unlockDesertStormSearch);
desertStormSearchInput?.addEventListener("input",e=>{desertStormSearchTerm=searchInputValue(e.target);scheduleDesertStormSearchRender()});
  $("#desertStormTeam")?.addEventListener("change",e=>{if(!hasDeclaredAllianceCommandRole())return;const ds=ensureDesertStormState(),team=String(e.target.value||"A").toUpperCase()==="B"?"B":"A";if(team===ds.team)return;ds.team=team;invalidateDesertStormPlan(ds);ds.updated_at=new Date().toISOString();saveState()});
$("#desertStormTime")?.addEventListener("change",e=>{if(!hasDeclaredAllianceCommandRole())return;const ds=ensureDesertStormState(),battleTime=String(e.target.value||"");if(battleTime===ds.battle_time)return;ds.battle_time=battleTime;invalidateDesertStormPlan(ds);ds.updated_at=new Date().toISOString();saveState()});
 $("#desertStormClearBtn")?.addEventListener("click",()=>{const clearPrompt=lang.startsWith("fr")?"Effacer toute la sélection Tempête du Désert ?":t("ds_clear_confirm")==="ds_clear_confirm"?"Clear all selected Desert Storm players?":t("ds_clear_confirm");if(!hasDeclaredAllianceCommandRole()||!window.confirm(clearPrompt))return;const ds=ensureDesertStormState(),now=new Date().toISOString();ds.registered_keys=[];ds.substitute_keys=[];ds.selection_initialized=true;invalidateDesertStormPlan(ds);ds.availability_reset_at=now;ds.updated_at=now;saveState();renderDesertStormPlanner();const st=$("#desertStormStatus");if(st){st.className="notice";st.textContent=t("ds_cleared");st.classList.remove("hidden")}});
  function desertStormPlanGenerationError(error){
   const st=$("#desertStormStatus");if(!st)return;
    if(st.dataset)delete st.dataset.desertStormPlanSuccess;
    const code=String(error?.code||error?.message||""),detailByCode={
      desert_storm_plan_invalid:"Le moteur n’a fourni aucun groupe de participants exploitable.",
      desert_storm_plan_container_missing:"La zone d’affichage du plan est introuvable.",
      desert_storm_plan_render_failed:"Le plan a été généré, mais son contenu n’a pas pu être affiché.",
      desert_storm_battle_time_required:"Choisis l’heure de bataille."
    };
    const detail=detailByCode[code]||String(error?.message||error?.code||error||"Erreur inconnue").replace(/[_-]+/g," ").replace(/\s+/g," ").trim().slice(0,220);
   st.className="notice warn";
    st.textContent=lang.startsWith("fr")?`La création du plan a échoué : ${detail||"erreur inconnue"}.`:`Plan generation failed: ${detail||"unknown error"}.`;
   st.classList.remove("hidden");
 }
 function generateDesertStormPlan(){
   const st=$("#desertStormStatus");
     if(st){if(st.dataset)delete st.dataset.desertStormPlanSuccess;st.classList.add("hidden");st.textContent=""}
   if(!hasDeclaredAllianceCommandRole()){if(st){st.className="notice warn";st.textContent=managerOnlyMessage();st.classList.remove("hidden")}return}
    if(!desertStormFeatureAccess()){if(st){st.className="notice warn";st.textContent=lang.startsWith("fr")?"Le roster canonique ou l’accès R4/R5 n’est pas confirmé. Actualise puis réessaie.":"Canonical roster or R4/R5 access is not confirmed. Refresh and try again.";st.classList.remove("hidden")}return}
   try{
     const ds=ensureDesertStormState(),members=activeAllianceRosterMembers(),selection=desertStormPlanSelection(members);
     if(!selection.registeredKeys.length){if(st){st.className="notice warn";st.textContent=t("ds_no_registered");st.classList.remove("hidden")}return}
     const signature=desertStormCurrentSelectionSignature(ds,selection);
     const plan=buildDesertStormPlan(members,selection.registeredKeys,{nowMs:serverNow.getTime(),team:ds.team,battleTime:ds.battle_time,substituteKeys:selection.substituteKeys});
      if(!plan||!Array.isArray(plan.groups))throw Object.assign(new Error("desert_storm_plan_invalid"),{code:"desert_storm_plan_invalid"});
     plan.selection_signature=signature;plan.generated_at=new Date().toISOString();
     recentlyGeneratedDesertStormPlan={signature,plan};
     ds.plan=plan;ds.updated_at=new Date().toISOString();state.alliance.updated_at=ds.updated_at;
     const saved=saveState({renderUi:false});
      const rendered=renderDesertStormPlan(plan,{scrollIntoView:true});
      if(!rendered.ok)throw Object.assign(new Error(rendered.error||"desert_storm_plan_render_failed"),{code:rendered.error||"desert_storm_plan_render_failed"});
     if(st){st.className=`notice${saved?"":" warn"}`;st.textContent=saved?t("ds_plan_ready"):(lang.startsWith("fr")?"Plan affiché, mais sa sauvegarde locale a échoué.":"Plan displayed, but local saving failed.");if(saved&&st.dataset)st.dataset.desertStormPlanSuccess="true";st.classList.remove("hidden")}
    }catch(error){desertStormPlanGenerationError(error)}
 }
 $("#desertStormGenerateBtn")?.addEventListener("click",generateDesertStormPlan);
$("#canyonPlanner")?.querySelectorAll("[data-canyon-tab]").forEach(btn=>btn.addEventListener("click",()=>{canyonActiveTab=btn.dataset.canyonTab||"preparation";renderCanyonPlanner()}));
$("#canyonSearch")?.addEventListener("input",e=>{canyonSearchTerm=String(e.target.value||"");scheduleCanyonSearchRender()});
 $("#canyonStatus")?.addEventListener("change",e=>{if(!desertStormSelectionAccess().allowed)return;const canyon=ensureCanyonState(),now=new Date().toISOString();canyon.status=e.target.value;canyon.plan=null;canyon.validated_at=null;canyon.validated_by=null;canyon.updated_at=now;state.alliance.updated_at=now;saveState()});
 $("#canyonDateTime")?.addEventListener("change",e=>{if(!desertStormSelectionAccess().allowed)return;const canyon=ensureCanyonState(),now=new Date().toISOString();canyon.scheduled_at=String(e.target.value||"")||null;canyon.plan=null;canyon.validated_at=null;canyon.validated_by=null;canyon.updated_at=now;state.alliance.updated_at=now;saveState()});
 $("#canyonFaction")?.addEventListener("change",e=>{if(!desertStormSelectionAccess().allowed)return;const canyon=ensureCanyonState(),now=new Date().toISOString();canyon.faction=["instigators","scouts"].includes(e.target.value)?e.target.value:"unknown";if(canyon.faction!=="instigators")canyon.adjudicator_key=null;canyon.plan=null;canyon.validated_at=null;canyon.validated_by=null;canyon.updated_at=now;state.alliance.updated_at=now;saveState()});
 $("#canyonAdjudicator")?.addEventListener("change",e=>{if(!desertStormSelectionAccess().allowed)return;const canyon=ensureCanyonState(),now=new Date().toISOString();canyon.adjudicator_key=String(e.target.value||"")||null;canyon.plan=null;canyon.validated_at=null;canyon.validated_by=null;canyon.updated_at=now;state.alliance.updated_at=now;saveState()});
  $("#allianceDrawer")?.addEventListener("click",event=>{const button=event.target?.closest?.("#canyonClearBtn");if(!button)return;event.preventDefault();clearCanyonSelection()});
 $("#canyonGenerateBtn")?.addEventListener("click",()=>{const message=$("#canyonStatusMessage");if(!desertStormSelectionAccess().allowed){if(message){message.className="notice warn";message.textContent=managerOnlyMessage();message.classList.remove("hidden")}return}if(!desertStormFeatureAccess())return;const canyon=ensureCanyonState(),members=activeAllianceRosterMembers(),now=new Date().toISOString();canyon.plan=canyonPlanForRoster(canyon,members);canyon.validated_at=null;canyon.validated_by=null;canyon.updated_at=now;state.alliance.updated_at=now;canyonActiveTab="plan";saveState();if(message){message.className="notice";message.textContent=canyon.plan.faction_to_confirm?"Plan générique créé · faction à confirmer.":"Plan Canyon créé · validation R4/R5 requise.";message.classList.remove("hidden")}});
$("#canyonValidateBtn")?.addEventListener("click",()=>{if(!desertStormSelectionAccess().allowed)return;const canyon=ensureCanyonState();if(!canyon.plan)return;const now=new Date().toISOString();canyon.validated_at=now;canyon.validated_by=String(state.player?.name||state.player_id||"R4/R5");canyon.updated_at=now;state.alliance.updated_at=now;saveState();const message=$("#canyonStatusMessage");if(message){message.className="notice";message.textContent="Plan Canyon validé par un R4/R5.";message.classList.remove("hidden")}});
$("#vsPlanBtn").addEventListener("click",async()=>{if(!requirePro())return;const j=await requestAdvice("vs");$("#vsPlanText").textContent=structuredAdviceText("vs",j)});$("#seasonLifecycleSelect")?.addEventListener("change",()=>{const value=$("#seasonLifecycleSelect").value||"unknown",now=new Date().toISOString();state.season=repairSeasonState({...state.season,lifecycle:value,lifecycle_source:"manual",ended_at:(value==="ended"||value==="interseason")?(state.season.ended_at||now):null,updated_at:now});saveState();$("#seasonAdviceText").textContent=t("season_empty")});
$("#seasonAdviceBtn").addEventListener("click",async()=>{if(!requirePro())return;const j=await requestAdvice("season");$("#seasonAdviceText").textContent=structuredAdviceText("season",j)});
async function getAdvice(scope){const j=await requestAdvice(scope);return structuredAdviceText(scope,j)}

function currentRosterIdentityContext(){return {server_id:state.player?.server_id||state.alliance?.server_id||"",alliance_tag:state.alliance?.tag||""}}
function currentRosterIdentityCollections(){return {members:state.alliance?.members||[],review:state.alliance?.roster_review||[],former:state.alliance?.former_members||[]}}
function rosterDraftKey(row){return rosterIdentityKey(row?.name||"",currentRosterIdentityContext().alliance_tag)}
function scanRole(v){const role=String(v??"").trim().toUpperCase();return /^R[1-5]$/.test(role)?role:null}
function confirmedMemberRank(member){return member?.rank_confirmation_status==="unconfirmed"?"?":normalizeAllianceRole(member?.role)}
function mergeRosterScanRows(base=[],incoming=[]){
  const tag=currentRosterIdentityContext().alliance_tag,map=new Map();for(const raw of [...(Array.isArray(base)?base:[]),...(Array.isArray(incoming)?incoming:[])]){const name=cleanRosterOcrName(raw?.name||"",tag),key=rosterIdentityKey(name,tag);if(!name||!key)continue;const role=scanRole(raw?.role),hq=Number(raw?.hq_level),power=Number(raw?.power_m),confidence=Number(raw?.confidence);const row={...raw,name,role,hq_level:Number.isFinite(hq)&&hq>0?Math.round(hq):null,power_m:Number.isFinite(power)&&power>0?Math.round(power*100)/100:null,confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):null,updated_at:raw?.updated_at||null,rank_confirmation_status:raw?.rank_confirmation_status||(role==="R4"||role==="R5"?"confirmed_scan":"unconfirmed")};const old=map.get(key);if(!old){map.set(key,row);continue}const oldScore=(old.confidence??0)+(old.hq_level?0.15:0)+(old.power_m?0.15:0),newScore=(row.confidence??0)+(row.hq_level?0.15:0)+(row.power_m?0.15:0);map.set(key,newScore>=oldScore?{...old,...row}:{...row,...old})}return [...map.values()].sort((a,b)=>({R5:5,R4:4,R3:3,R2:2,R1:1}[b.role]||0)-({R5:5,R4:4,R3:3,R2:2,R1:1}[a.role]||0)||(b.power_m||0)-(a.power_m||0)||a.name.localeCompare(b.name));
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
  box.innerHTML=rosterScanDraft.length?rosterScanDraft.map((r,i)=>`<div class="rosterScanRow" data-roster-draft-index="${i}"><input data-rsf="name" value="${esc(r.name)}" aria-label="${esc(t("nickname"))}"/><select data-rsf="role"><option value=""${!r.role?" selected":""}>—</option>${["R5","R4","R3","R2","R1"].map(x=>`<option value="${x}"${r.role===x?" selected":""}>${x}</option>`).join("")}</select><input data-rsf="hq" inputmode="numeric" value="${esc(r.hq_level??"")}" placeholder="QG"/><input data-rsf="power" inputmode="decimal" value="${esc(r.power_m??"")}" placeholder="M"/><button type="button" data-roster-draft-remove="${i}">×</button><div class="rosterScanConfidence">${esc(t("roster_scan_confidence"))}: ${r.confidence===null?"—":Math.round(r.confidence*100)+"%"}</div><div class="rosterIdentityStatus ${esc(r.identity_status||"new")}">${esc(rosterIdentityStatusText(r))}${r.identity_status==="possible"?` <button type="button" class="smallBtn" data-roster-confirm-match="${i}">${esc(t("roster_identity_use_match"))}</button>`:""}</div></div>`).join(""):`<div class="privacyText">${esc(t("roster_scan_empty"))}</div>`;
  box.querySelectorAll("[data-roster-draft-remove]").forEach(b=>b.addEventListener("click",()=>{rosterScanDraft.splice(Number(b.dataset.rosterDraftRemove),1);renderRosterScanDraft()}));
  box.querySelectorAll("[data-roster-confirm-match]").forEach(b=>b.addEventListener("click",()=>{const i=Number(b.dataset.rosterConfirmMatch),row=rosterScanDraft[i];if(!row)return;rosterScanDraft[i]=confirmRosterScanPossibleMatch(row,currentRosterIdentityCollections(),currentRosterIdentityContext());renderRosterScanDraft()}));
  box.querySelectorAll("[data-roster-draft-index]").forEach(row=>row.addEventListener("change",()=>{const i=Number(row.dataset.rosterDraftIndex),cur=rosterScanDraft[i];if(!cur)return;cur.name=row.querySelector('[data-rsf="name"]')?.value.trim()||"";cur.role=scanRole(row.querySelector('[data-rsf="role"]')?.value);cur.rank_confirmation_status="unconfirmed";const h=Number(row.querySelector('[data-rsf="hq"]')?.value),p=Number(String(row.querySelector('[data-rsf="power"]')?.value||"").replace(',','.'));cur.hq_level=Number.isFinite(h)&&h>0?Math.round(h):null;cur.power_m=Number.isFinite(p)&&p>0?Math.round(p*100)/100:null;rosterScanDraft[i]=resolveRosterScanRows([cur],currentRosterIdentityCollections(),currentRosterIdentityContext())[0];renderRosterScanDraft()}));
}
function collectRosterScanDraftFromDom(){
  const box=$("#rosterScanDraft");if(!box)return rosterScanDraft;
  box.querySelectorAll("[data-roster-draft-index]").forEach(row=>{const i=Number(row.dataset.rosterDraftIndex),cur=rosterScanDraft[i];if(!cur)return;cur.name=row.querySelector('[data-rsf="name"]')?.value.trim()||"";cur.role=scanRole(row.querySelector('[data-rsf="role"]')?.value);const h=Number(row.querySelector('[data-rsf="hq"]')?.value),p=Number(String(row.querySelector('[data-rsf="power"]')?.value||"").replace(',','.'));cur.hq_level=Number.isFinite(h)&&h>0?Math.round(h):null;cur.power_m=Number.isFinite(p)&&p>0?Math.round(p*100)/100:null});
  rosterScanDraft=resolveCurrentRosterScanDraft(rosterScanDraft);
  return rosterScanDraft;
}
async function persistRosterCandidate(candidate){
  if(!cloudSession?.access_token||!betaAccessAllowed()||!betaConsentAccepted())throw Object.assign(new Error(t("roster_sync_login_required")),{code:"roster_cloud_required"});
  const {response:r,json:j}=await fetchJsonBounded("/api/sync",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({state:candidate,locale:lang,base_updated_at:cloudRevision})},20000);
  if(!r.ok)throw Object.assign(new Error(j?.message||j?.error||t("roster_sync_failed")),{code:j?.error||"roster_sync_failed",limit:j?.limit,count:j?.count});
  return j;
}
async function applyRosterRows(imported,{complete=false,status=null,source="manual_import"}={}){
  const now=new Date().toISOString(),rows=(Array.isArray(imported)?imported:[]).filter(x=>x?.name).map(row=>({...row,server_id:state.player?.server_id||row.server_id||"",alliance_tag:state.alliance?.tag||row.alliance_tag||"",source,updated_at:row.updated_at||now}));
  if(!rows.length){if(status){status.className="notice warn";status.textContent=t("import_error");status.classList.remove("hidden")}return null}
  const candidate=JSON.parse(JSON.stringify(state)),result=applyRosterImportLifecycle({members:candidate.alliance.members,review:candidate.alliance.roster_review,former:candidate.alliance.former_members,removal_tombstones:candidate.alliance.roster_removal_tombstones},rows,{complete,now});
  candidate.alliance.members=result.members.map(row=>({...row,canonical_member_key:canonicalRosterMemberKey(row,{serverId:candidate.alliance.server_id||candidate.player?.server_id,allianceTag:candidate.alliance.tag})}));
  candidate.alliance.roster_review=result.review;candidate.alliance.former_members=[];candidate.alliance.roster_removal_tombstones=result.removal_tombstones||candidate.alliance.roster_removal_tombstones||[];if(complete)candidate.alliance.roster_snapshot_complete_at=now;candidate.alliance.roster_sync_status="pending";candidate.alliance.roster_sync_error=null;candidate.alliance.updated_at=now;candidate.sync.sources={...candidate.sync.sources,alliance:true};
  let synced=null;
  try{synced=await persistRosterCandidate(candidate)}catch(error){
    candidate.alliance.roster_sync_status="pending";candidate.alliance.roster_sync_error=String(error?.message||error?.code||t("roster_sync_failed")).slice(0,300);state=candidate;saveState();render();
    if(status&&(error?.code==="roster_canonical_persist_required"||error?.code==="r4_r5_required"))showAllianceRoleGuard(status);
    else if(status){status.className="notice warn";status.textContent=`${t("roster_sync_pending")} ${candidate.alliance.roster_sync_error}`;status.classList.remove("hidden")}
    return {...result,synced:false,error};
  }
  cloudRevision=synced?.updated_at||cloudRevision;
  state=synced?.state?hydrateCloudState(synced.state,initialState(),cloudSession?.user?.id||state.player_id):candidate;
  state=adoptCanonicalPendingAccounts(state,synced?.state||null,{available:synced?.alliance_pending_source==="canonical"});
  state.alliance.roster_sync_status="synced";state.alliance.roster_sync_error=null;saveState();render();
  if(status){status.className="notice";status.textContent=complete?t("roster_import_complete_result",{active:result.summary.active_count,review:result.summary.review_count,added:result.summary.added,returned:result.summary.returned}):t("roster_import_partial_result",{count:result.summary.imported,added:result.summary.added,returned:result.summary.returned});status.classList.remove("hidden")}return {...result,synced:true};
}
function renderRosterScanFiles(){
  const info=$("#rosterScanFileInfo"),list=$("#rosterScanFileList");
  if(info)info.textContent=rosterScanFiles.length?t("roster_scan_files",{count:rosterScanFiles.length}):"";
  if(!list)return;
  list.innerHTML=rosterScanFiles.map((file,i)=>`<div class="rosterScanFileItem"><div><b>${i+1}</b><span>${esc(file?.name||`capture-${i+1}`)}</span><small>${Number(file?.size)>0?`${Math.max(1,Math.round(Number(file.size)/1024))} Ko`:""}</small></div><button type="button" data-roster-file-remove="${i}" aria-label="${esc(t("roster_scan_remove_row"))}" title="${esc(t("roster_scan_remove_row"))}">×</button></div>`).join("");
  list.querySelectorAll("[data-roster-file-remove]").forEach(btn=>btn.addEventListener("click",async()=>{rosterScanFiles=removeRosterScanFile(rosterScanFiles,Number(btn.dataset.rosterFileRemove));rosterScanDraft=[];renderRosterScanFiles();renderRosterScanDraft();const kept=await persistPendingRosterQueue();if(!kept&&rosterScanFiles.length){const st=$("#rosterScanStatus");if(st){st.className="notice warn";st.textContent=t("scan_pending_local_failed");st.classList.remove("hidden")}}}));
}
$("#rosterScanFiles")?.addEventListener("change",async e=>{
  const result=appendRosterScanFiles(rosterScanFiles,e.target.files,{limit:ROSTER_SCAN_FILE_LIMIT});
  rosterScanFiles=result.files;
  // Any queue change invalidates the previous OCR draft. Re-analysis always uses
  // the complete current queue, preventing stale first-capture results.
  if(result.added>0){rosterScanDraft=[];renderRosterScanDraft();const st=$("#rosterScanStatus");if(st){st.className="notice";st.textContent=t("roster_scan_reanalyze");st.classList.remove("hidden")}}
  // Android can return one screenshot per picker opening. Reset only the native
  // input so the next tap appends another image to our persistent queue.
  e.target.value="";
  renderRosterScanFiles();
  const kept=await persistPendingRosterQueue();
  if(!kept&&rosterScanFiles.length){const st=$("#rosterScanStatus");if(st){st.className="notice warn";st.textContent=t("scan_pending_local_failed");st.classList.remove("hidden")}}
});
$("#rosterScanAnalyzeBtn")?.addEventListener("click",async()=>{const status=$("#rosterScanStatus"),btn=$("#rosterScanAnalyzeBtn");if(!hasDeclaredAllianceCommandRole()){showAllianceRoleGuard(status);return}if(!rosterScanFiles.length){if(status){status.className="notice warn";status.textContent=t("roster_scan_choose_first");status.classList.remove("hidden")}return}if(!requireBetaAccess()||!requireBetaConsent())return;if(!cloudSession?.access_token){openDrawer("account");return}btn.disabled=true;const old=btn.textContent;btn.textContent=t("scan_processing");if(status){status.className="notice";status.textContent=t("roster_scan_processing",{count:rosterScanFiles.length});status.classList.remove("hidden")}try{let rows=[];for(let i=0;i<rosterScanFiles.length;i++){const image=await imageToDataUrl(rosterScanFiles[i]),{response:r,json:j}=await fetchWarBoostScan({scan_type:"alliance_roster",locale:lang,image_data_url:image,current_state:state});if(!r.ok)throw new Error(j.message||j.error||"scan_failed");rows=mergeRosterScanRows(rows,j.roster_rows||[]);if(status)status.textContent=t("roster_scan_progress",{done:i+1,total:rosterScanFiles.length,rows:rows.length})}rosterScanDraft=resolveCurrentRosterScanDraft(mergeRosterScanRows([],rows));renderRosterScanDraft();if(status){status.className="notice";status.textContent=t("roster_scan_ready",{count:rosterScanDraft.length})}}catch(e){if(status){status.className="notice warn";status.textContent=e?.message||t("scan_error")}}finally{btn.disabled=false;btn.textContent=old}});
$("#rosterScanImportBtn")?.addEventListener("click",async()=>{const status=$("#rosterScanStatus");if(!hasDeclaredAllianceCommandRole()){showAllianceRoleGuard(status);return}collectRosterScanDraftFromDom();if(rosterScanHasUnresolvedIdentity(rosterScanDraft)){if(status){status.className="notice warn";status.textContent=t("roster_identity_unresolved_block");status.classList.remove("hidden")}renderRosterScanDraft();return}if(rosterScanDraft.some(row=>!scanRole(row?.role))){if(status){status.className="notice warn";status.textContent="Chaque grade doit être confirmé avant l’import.";status.classList.remove("hidden")}return}const rows=mergeRosterScanRows([],rosterScanDraft).filter(x=>x.name);const complete=$("#rosterScanFullSnapshot")?.checked===true;const result=await applyRosterRows(rows,{complete,status,source:"roster_scan"});if(result?.synced){rosterScanDraft=[];rosterScanFiles=[];if($("#rosterScanFiles"))$("#rosterScanFiles").value="";void clearPendingRosterFiles(pendingScanOwner());renderRosterScanFiles();if($("#rosterScanFullSnapshot"))$("#rosterScanFullSnapshot").checked=false;renderRosterScanDraft()}});

$("#rosterImportBtn")?.addEventListener("click",async()=>{
  const status=$("#rosterImportStatus");if(!hasDeclaredAllianceCommandRole()){showAllianceRoleGuard(status);return}
  const now=new Date().toISOString(),complete=$("#rosterFullSnapshot")?.checked===true;
  const imported=parseRosterImport($("#rosterImportText")?.value||"",{now}).map(row=>({...row,server_id:state.player?.server_id||row.server_id||"",alliance_tag:state.alliance?.tag||row.alliance_tag||""}));
  if(!imported.length){if(status){status.className="notice warn";status.textContent=t("import_error")}return}
  const result=await applyRosterRows(imported,{complete,status,source:"manual_import"});if(!result?.synced)return;
  if($("#rosterImportText"))$("#rosterImportText").value="";if($("#rosterFullSnapshot"))$("#rosterFullSnapshot").checked=false;
});
$("#eventImportBtn")?.addEventListener("click",async()=>{
  const status=$("#eventImportStatus");
  if(!hasDeclaredAllianceCommandRole()){showAllianceRoleGuard(status);return}
  const parsed=parseParticipationImport($("#eventImportText")?.value||""),members=state.alliance.members||[];
  let applied=0,unmatched=0,ambiguous=0;
  for(const row of parsed.rows){
    const key=rosterNameKey(row.name||""),matches=members.filter(m=>rosterNameKey(m?.name||"")===key);
    if(matches.length!==1){if(matches.length>1)ambiguous++;else unmatched++;continue}
    const member=matches[0];member.activity_events=mergeActivityEvents(member.activity_events,[row]);member.updated_at=new Date().toISOString();applied++;
  }
  if(!applied){if(status){status.className="notice warn";status.textContent=t("participation_import_none",{errors:parsed.errors.length,unmatched:unmatched+ambiguous})}return}
  state.alliance.updated_at=new Date().toISOString();state.sync.sources={...state.sync.sources,alliance:true};saveState();
  const synced=await pushServerState();
  if(!synced?.ok){showAllianceRoleGuard(status);return}
  if(status){status.className="notice";status.textContent=t("participation_import_done",{count:applied,unmatched:unmatched+ambiguous,errors:parsed.errors.length})}
  if($("#eventImportText"))$("#eventImportText").value="";
});

$("#shareInviteBtn").addEventListener("click",async()=>{const btn=$("#shareInviteBtn");if(!requireBetaAccess()||!requireBetaConsent())return;if(!["R4","R5"].includes(normalizedRole(state.player?.role))){inviteMessage(t("alliance_invite_manager_only"));return}if(!cloudSession?.access_token){inviteMessage(t("alliance_invite_connect"));openDrawer("account");return}const original=btn?.textContent;if(btn){btn.disabled=true;btn.textContent="…"}try{const saved=await pushServerState();if(!saved?.ok)throw Object.assign(new Error("cloud_save_required"),{code:"cloud_save_required"});const {response:rr,json:jj}=await fetchJsonBounded("/api/invite",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({name:state.alliance.name||state.alliance.tag||"WarBoost"})},18000);if(!rr.ok||!jj.invite_code)throw Object.assign(new Error(jj.message||jj.error||"invite_failed"),{code:jj.error||"invite_failed"});const code=jj.invite_code;state.alliance.id=jj.alliance?.id||state.alliance.id;state.alliance.server_id=jj.alliance?.server_id||state.player?.server_id||state.alliance.server_id;state.alliance.tag=jj.alliance?.tag||state.alliance.tag;state.alliance.name=jj.alliance?.name||state.alliance.name;state.alliance.invite_code=code;state.alliance.role=jj.role||state.alliance.role;state.alliance.management_verified=jj.scope_verified===true&&["R4","R5"].includes(normalizedRole(jj.role));state.vs.our_alliance=state.alliance.tag;state.sync.sources={...state.sync.sources,alliance:true};saveState();inviteMessage(t("alliance_invite_ready_scoped",{server:state.alliance.server_id||state.player?.server_id||"—",alliance:state.alliance.tag||"—"}),true);const url=`${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`,text=`WarBoost · ${t("server")} ${state.alliance.server_id||state.player?.server_id||"—"} · ${state.alliance.tag||"—"} · ${code}`;try{if(navigator.share)await navigator.share({title:`WarBoost · ${t("alliance")}`,text,url});else{await navigator.clipboard.writeText(`${text}\n${url}`);if(btn){btn.textContent=t("copy");setTimeout(()=>{btn.textContent=t("share")},1400)}}}catch{}}catch(e){const key={manager_role_required:"alliance_invite_manager_only",manager_roster_match_required:"alliance_manager_roster_match_required",manager_roster_role_required:"alliance_invite_manager_only",alliance_roster_identity_ambiguous:"alliance_roster_identity_ambiguous",lastwar_nickname_required:"lastwar_nickname_required",lastwar_server_required:"lastwar_server_required",lastwar_alliance_required:"lastwar_alliance_required",alliance_space_exists_invitation_required:"alliance_space_exists_invitation_required",alliance_owner_scope_conflict:"alliance_owner_scope_conflict",alliance_scope_ambiguous_admin_required:"alliance_scope_ambiguous_admin_required",cloud_save_required:"offline_keep"}[e.code]||"alliance_invite_failed";inviteMessage(t(key))}finally{if(btn){btn.disabled=false;if(btn.textContent==="…")btn.textContent=original||t("share")}}});
async function joinPendingAlliance(){const code=String(pendingJoinCode()||state.alliance.invite_code||"").trim();if(!code||!state.player.name||!cloudSession?.access_token||!betaAccessAllowed()||!betaConsentAccepted())return false;try{const {response:r,json:j}=await fetchJsonBounded("/api/join",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({invite_code:code})},18000);if(!r.ok){const key={alliance_owner_switch_blocked:"alliance_owner_switch_blocked",invite_not_found:"alliance_invite_not_found",lastwar_identity_required:"lastwar_identity_required",lastwar_nickname_required:"lastwar_nickname_required",lastwar_server_required:"lastwar_server_required",lastwar_alliance_required:"lastwar_alliance_required",alliance_scope_not_ready:"alliance_scope_not_ready",alliance_server_mismatch:"alliance_server_mismatch",alliance_tag_mismatch:"alliance_tag_mismatch",alliance_roster_not_ready:"alliance_roster_not_ready",player_not_in_alliance_roster:"player_not_in_alliance_roster",alliance_roster_identity_ambiguous:"alliance_roster_identity_ambiguous",alliance_scope_ambiguous_admin_required:"alliance_scope_ambiguous_admin_required"}[j?.error]||"alliance_join_failed";inviteMessage(t(key));return false}if(j.alliance){state.alliance.id=j.alliance.id||state.alliance.id;state.alliance.server_id=j.alliance.server_id||state.player?.server_id||state.alliance.server_id;state.alliance.tag=j.alliance.tag||state.alliance.tag;state.alliance.name=j.alliance.name||state.alliance.name;state.alliance.role=j.membership?.role||"R1";state.alliance.management_verified=j.scope_verified===true&&["R4","R5"].includes(normalizedRole(state.alliance.role));state.vs.our_alliance=state.alliance.tag;state.sync.sources={...state.sync.sources,alliance:true};clearPendingJoinCode();saveState();inviteMessage(t(j.already_member?"alliance_already_joined":"alliance_joined_scoped",{server:state.alliance.server_id||"—",alliance:state.alliance.tag||"—"}),true);return true}}catch{inviteMessage(t("alliance_join_failed"))}return false}
function handleJoinLink(){const raw=new URLSearchParams(location.search).get("join");if(!raw)return;const code=rememberPendingJoinCode(raw);if(!code)return;state.alliance.invite_code=code;safeLocalSet(STORE_KEY,JSON.stringify(state));setTimeout(()=>openDrawer("account"),500)}


function supportStatusLabel(status){return t(`support_status_${String(status||"received")}`)}
function renderSupportAccess(){
  const logged=Boolean(cloudSession?.user),notice=$("#supportAuthNotice"),create=$("#supportCreateSection");if($("#supportBuildPill"))$("#supportBuildPill").textContent=`V${APP_VERSION} · ${RELEASE_LABEL}`;
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
  try{const {response:r,json:j}=await fetchJsonBounded("/api/support",{cache:"no-store",headers:authHeaders()},20000);if(!r.ok)throw new Error(j.message||j.error||"support_error");supportTicketsState=Array.isArray(j.tickets)?j.tickets:[];renderSupportTickets()}catch(e){supportMessage(e.message||t("support_error"))}finally{if(btn)btn.disabled=false}
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
  try{const file=$("#supportAttachment")?.files?.[0]||null,attachment=await supportImageData(file),drawer=document.querySelector(".drawer.open")?.id||"supportDrawer",diagnostics=$("#supportDiagnostics")?.checked!==false?{app_version:APP_VERSION,release:RELEASE_LABEL,locale:lang,screen:drawer.replace(/Drawer$/,""),platform:navigator.platform||"",online:navigator.onLine,ui_consistency:{coach_title:Boolean($("#adviceTitle")?.textContent),provider_status:Boolean($("#providerStatus")?.textContent),player_activity_status:Boolean($("#playerActivityStatus")?.textContent)},bootstrap:compactBootstrapDiagnostics()}:{};const {response:r,json:j}=await fetchJsonBounded("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"create",category:$("#supportCategory")?.value||"other",subject,description,nickname:state?.player?.name||"",app_version:APP_VERSION,locale:lang,screen:drawer.replace(/Drawer$/,""),diagnostics,attachment_data_url:attachment?.data_url||null,attachment_name:attachment?.name||null})},30000);if(!r.ok)throw new Error(j.message||j.error||t("support_error"));supportMessage(t("support_sent",{ticket:j.ticket?.ticket_no||""}),true);if($("#supportSubject"))$("#supportSubject").value="";if($("#supportDescription"))$("#supportDescription").value="";if($("#supportAttachment"))$("#supportAttachment").value="";await refreshSupportTickets()}catch(e){supportMessage(e.message||t("support_error"))}finally{supportBusy=false;if(btn){btn.disabled=false;btn.textContent=t("support_send")}}
}
async function replySupportTicket(ticketId){
  const input=[...document.querySelectorAll("[data-support-reply-input]")].find(x=>x.dataset.supportReplyInput===String(ticketId)),body=String(input?.value||"").trim();if(body.length<2)return;
  try{const {response:r,json:j}=await fetchJsonBounded("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"reply",ticket_id:ticketId,body,as_support:false})},20000);if(!r.ok)throw new Error(j.message||j.error||t("support_error"));if(input)input.value="";await refreshSupportTickets()}catch(e){supportMessage(e.message||t("support_error"))}
}
async function openSupportAttachment(ticketId){try{const {response:r,json:j}=await fetchJsonBounded("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action:"attachment",ticket_id:ticketId})},20000);if(!r.ok||!j.url)throw new Error(j.message||j.error||t("support_error"));window.open(j.url,"_blank","noopener,noreferrer")}catch(e){supportMessage(e.message||t("support_error"))}}
$("#supportBtn")?.addEventListener("click",()=>{openDrawer("support");renderSupportAccess();refreshSupportTickets()});
$("#supportSubmitBtn")?.addEventListener("click",submitSupportTicket);
$("#supportRefreshBtn")?.addEventListener("click",refreshSupportTickets);

function proMessage(text,ok=false){const el=$("#proMessage");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text}
function renderCommercialPreview(){const box=$("#proCommercialPreview"),price=$("#commercialPreviewPrice"),note=$("#commercialPreviewNote");if(!box)return;box.classList.toggle("hidden",proState.beta===false);if(price)price.textContent=formatProPrice(proState.plan||{amount:499,currency:"eur"});if(note)note.textContent=t("commercial_preview_note")}
function renderPro(){const pill=$("#proPill"),btn=$("#proActionBtn"),title=$("#proTitle"),price=$("#proPrice"),section=$("#proSection");if(!pill||!btn)return;const logged=Boolean(cloudSession?.user),beta=safeLaunchBetaMode(),included=Boolean(beta&&logged&&betaAccessAllowed());section?.classList.toggle("betaIncluded",beta);renderCommercialPreview();if(beta){pill.textContent=included?t("beta_pro_short"):t("beta_badge");pill.classList.toggle("active",included);title.textContent=included?t("beta_pro_included"):t("beta_pro_title");if(!logged){price.textContent=t("beta_pro_signin");btn.textContent=t("login");btn.disabled=false;return}if(betaState.enforced&&!betaState.allowed){price.textContent=t("beta_invite_required");btn.textContent=t("beta_invite_short");btn.disabled=true;return}price.textContent=t("beta_pro_free");btn.textContent=t("beta_pro_included");btn.disabled=true;return}pill.textContent=proState.active?"PRO":t("free");pill.classList.toggle("active",proState.active);title.textContent=proState.active?t("pro_active"):t("upgrade");if(!logged){price.textContent=t("connect_for_pro");btn.textContent=t("login");btn.disabled=false;return}if(!proState.configured){price.textContent=t("pro_config");btn.textContent=t("pro_soon");btn.disabled=true;return}const formatted=formatProPrice(proState.plan);price.textContent=proState.active?t("subscription_active",{price:formatted}):formatted;btn.textContent=proState.active?t("manage_subscription"):t("go_pro");btn.disabled=!proState.payments_enabled}
async function refreshPro(){if(!cloudSession?.access_token){proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null};renderPro();return}try{const r=await fetchSessionCritical("/api/pro",{cache:"no-store",headers:authHeaders()},8000),j=await r.json().catch(()=>({}));if(r.ok)proState={active:Boolean(j.active),status:j.status||"free",configured:Boolean(j.configured),plan:j.plan||null,beta:j.beta!==false,payments_enabled:Boolean(j.payments_enabled),commercial_preview:Boolean(j.commercial_preview),subscription:j.subscription||null};else proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null}}catch{proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null}}renderPro()}
function requirePro(){if(safeLaunchBetaMode()){if(!requireBetaAccess()||!requireBetaConsent())return false;return true}if(proState.active)return true;openDrawer("account");setTimeout(()=>$("#proSection")?.scrollIntoView({behavior:"smooth",block:"center"}),160);proMessage(cloudSession?.user?t("pro_required"):t("connect_pro"));return false}
async function openProAction(){if(proState.beta!==false){proMessage(t("beta_payment_disabled"),true);return}if(!cloudSession?.user){openDrawer("account");return}if(!proState.payments_enabled){proMessage(t("commercial_payment_not_ready"));return}const btn=$("#proActionBtn"),original=btn?.textContent;if(btn){btn.disabled=true;btn.textContent="…"}try{const action=proState.active?"portal":"checkout",{response:r,json:j}=await fetchJsonBounded("/api/pro",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action})},15000);if(!r.ok||!/^https:\/\//i.test(String(j.url||"")))throw new Error(j.message||j.error||t("commercial_payment_not_ready"));location.href=j.url}catch(e){proMessage(e.message||t("commercial_payment_not_ready"))}finally{if(btn){btn.disabled=false;btn.textContent=original||t(proState.active?"manage_subscription":"go_pro")}}}
$("#betaConsent")?.addEventListener("change",async e=>{const key=betaConsentStorageKey();if(!key){e.target.checked=false;return}if(e.target.checked){localStorage.setItem(key,"1");if(cloudSession?.access_token){resetBootstrapDiagnostics("consent");const pulled=await restoreAuthenticatedProfile(safeClone(state),{reason:"consent"});/* legacy: await pullServerState(safeClone(state),{fastRestore:true}) */if((pulled?.ok||pulled?.cloud_empty)&&betaAccessAllowed()&&hasMeaningfulCore(state))void pushServerState();void refreshPro()}}else{localStorage.removeItem(key);betaState={...betaState,restore_error:null};render();renderBeta();renderPro()}});
$("#betaRestoreRetryBtn")?.addEventListener("click",retryCloudProfileRestore);
$("#betaFeedbackBtn")?.addEventListener("click",()=>{if(!requireBetaAccess())return;openDrawer("feedback")});
function betaFeedbackReport(){const kind=$("#betaFeedbackKind")?.value||"bug",message=String($("#betaFeedbackText")?.value||"").trim(),diagnostics=$("#betaFeedbackDiagnostics")?.checked!==false,drawer=document.querySelector(".drawer.open")?.id||"feedbackDrawer";const lines=[`WarBoost V${APP_VERSION} · ${t("beta_badge")}`,`${t("beta_feedback_kind")}: ${kind}`,message||t("beta_feedback_empty")];if(diagnostics){const userId=String(cloudSession?.user?.id||""),ownerId=String(state?.player_id||""),lastFailure=lastBootstrapFailure();lines.push(`Diagnostics: version=${APP_VERSION}; release=${RELEASE_LABEL}; locale=${lang}; screen=${drawer.replace(/Drawer$/,'')}; logged=${userId?"yes":"no"}; betaAccess=${betaState.access_status}; betaAllowed=${betaAccessAllowed()?"yes":"no"}; consent=${betaConsentAccepted()?"yes":"no"}; ownerMatch=${userId&&ownerId===userId?"yes":"no"}; privateVisible=${betaPrivateDataVisible()?"yes":"no"}; cloudVerified=${cloudProfileVerified?"yes":"no"}; hydration=${cloudHydrationPending?"pending":"idle"}; sync=${state?.sync?.status||"unknown"}; cloudDirty=${cloudDirty?"yes":"no"}; lastFailure=${lastFailure?.stage||"none"}:${lastFailure?.error||"none"}`)}return lines.join("\n")}
$("#betaFeedbackShareBtn")?.addEventListener("click",async()=>{const text=betaFeedbackReport(),status=$("#betaFeedbackStatus");try{if(navigator.share)await navigator.share({title:`WarBoost V${APP_VERSION} · ${t("beta_feedback_title")}`,text});else await navigator.clipboard.writeText(text);if(status){status.className="notice";status.textContent=navigator.share?t("beta_feedback_shared"):t("beta_feedback_copied")}}catch(e){if(e?.name!=="AbortError"&&status){status.className="notice warn";status.textContent=t("beta_feedback_failed")}}});

$("#voiceEnabled")?.addEventListener("change",e=>{localStorage.setItem(VOICE_ENABLED_KEY,e.target.checked?"1":"0");renderVoiceSettings()});
$("#voiceSelect")?.addEventListener("change",e=>{localStorage.setItem(VOICE_ID_KEY,e.target.value||"");refreshVoices()});
$("#voiceTestBtn")?.addEventListener("click",()=>speakGreeting("test",true));
if("speechSynthesis" in window){window.speechSynthesis.addEventListener?.("voiceschanged",refreshVoices);setTimeout(refreshVoices,100)}
$("#proActionBtn")?.addEventListener("click",openProAction);

function bindAuthControls(){
$("#loginBtn")?.addEventListener("click",async()=>{
  if(!cloud)return authMessage(cloudAuthFailureMessage());
  const email=$("#authEmail").value.trim().toLowerCase(),password=$("#authPassword").value;
  if(!email||!password)return authMessage(t("auth_invalid"));
  setAuthBusy(true);
  try{
    const {data,error}=await cloud.auth.signInWithPassword({email,password});
    if(error){
      if(authNeedsEmailConfirmation(error)){revealEmailConfirmation(email);authMessage(t("auth_email_not_confirmed"));return}
      authMessage(authFriendlyError(error));return;
    }
    await ensureAuthenticatedSessionApplied(data);
    clearPendingAuthEmail();$("#otpBox")?.classList.add("hidden");authMessage(cloudProfileVerified?t("auth_success"):`${t("auth_success")} ${t("syncing")}`,true);
  }catch(error){authMessage(authFriendlyError(error))}
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
    if(data?.session){await ensureAuthenticatedSessionApplied(data);clearPendingAuthEmail();$("#otpBox")?.classList.add("hidden");authMessage(cloudProfileVerified?t("auth_success"):`${t("auth_success")} ${t("syncing")}`,true);return}
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
    const {data,error}=await cloud.auth.verifyOtp({email,token,type:"email"});
    if(error){authMessage(authFriendlyError(error));return}
    await ensureAuthenticatedSessionApplied(data);
    clearPendingAuthEmail();$("#otpBox")?.classList.add("hidden");if($("#authOtp"))$("#authOtp").value="";authMessage(cloudProfileVerified?t("email_confirmed"):`${t("email_confirmed")} ${t("syncing")}`,true);
  }catch(error){authMessage(authFriendlyError(error))}
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
}
$("#betaCodeActivateBtn")?.addEventListener("click",activateBetaCode);
$("#betaAccessCode")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();activateBetaCode()}});
$("#logoutBtn")?.addEventListener("click",async()=>{const signedOutUserId=String(cloudSession?.user?.id||"");if(signedOutUserId&&String(state?.player_id||"")===signedOutUserId)rememberAccountState(signedOutUserId,state);if(cloud)await cloud.auth.signOut();clearSignedOutAuthUi();cloudSession=null;cloudRevision=null;proState={active:false,status:"free",configured:false,plan:null,beta:true,payments_enabled:false,commercial_preview:true,subscription:null};betaState={...betaState,allowed:false,access_status:"sign-in-required"};render();renderAuth();renderBeta()});

document.addEventListener("click",e=>{const btn=e.target.closest?.("[data-inline-hero-save]");if(!btn)return;e.preventDefault();e.stopPropagation();const container=btn.closest?.("[data-inline-confirm]");saveInlineHeroNames(btn.dataset.inlineHeroSave,container,btn)});
document.addEventListener("click",e=>{const btn=e.target.closest?.(".heroConfirmAction[data-hero-confirm]");if(!btn)return;e.preventDefault();e.stopPropagation();startHeroConfirmation(btn.dataset.heroConfirm)});
$("#saveHeroNamesBtn")?.addEventListener("click",saveHeroConfirmation);$("#skipHeroNamesBtn")?.addEventListener("click",skipHeroConfirmation);
idleLifecycle=createIdleLifecycle({
  onSuspend:()=>{stopForegroundRefreshes();try{closeDrawers()}catch{}},
  onBackground:()=>stopForegroundRefreshes(),
  onResume:({reason})=>performIdleResume(reason),
  onRecentReturn:({reason})=>{startForegroundRefreshes();queueCriticalUiRepaint();void reconcileAuthenticatedRuntime(reason)}
});
window.addEventListener("online",()=>{
  queueCriticalUiRepaint();
  if(idleLifecycle?.isIdleDue())void idleLifecycle.returnFrom("online",{bypassRetryThrottle:true});
  else void reconcileAuthenticatedRuntime("online",{force:true});
});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&cloudDirty)void pushServerState({keepalive:true})});
window.addEventListener("pagehide",()=>{if(cloudDirty)void pushServerState({keepalive:true})});
if("serviceWorker" in navigator)window.addEventListener("load",async()=>{try{const generation="warboost-v2-5-30-hf8-6-30-idle-resume-r1",reloadKey=`${generation}:reloaded`,reg=await navigator.serviceWorker.register(`/sw.js?rev=${generation}`,{updateViaCache:"none"});let refreshing=sessionStorage.getItem(reloadKey)==="1";const activateWaiting=()=>{if(reg.waiting&&sessionStorage.getItem(reloadKey)!=="1")reg.waiting.postMessage({type:"WARBOOST_ACTIVATE"})};navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing||sessionStorage.getItem(reloadKey)==="1")return;refreshing=true;sessionStorage.setItem(reloadKey,"1");location.reload()});activateWaiting();reg.addEventListener("updatefound",()=>{const worker=reg.installing;if(worker)worker.addEventListener("statechange",()=>{if(worker.state==="installed")activateWaiting()})});await reg.update();activateWaiting()}catch{}});
handleJoinLink();applyLanguage();startForegroundRefreshes({refreshTime:true});void initCloudAuth().then(()=>idleLifecycle?.start(),()=>idleLifecycle?.start());render();renderAuth();renderBeta();restorePendingScans();
// Legacy HF8.6.19 returning-player verification marker: function betaPrivateDataVisible(){const userId=String(cloudSession?.user?.id||"");const trustedLocal=Boolean(userId&&hasMeaningfulCore(readAccountState(userId))),checking=betaState?.access_status==="checking";return Boolean(cloudSession?.user)&&!checking&&betaAccessAllowed()&&betaConsentAccepted()&&(cloudProfileVerified||trustedLocal)}
