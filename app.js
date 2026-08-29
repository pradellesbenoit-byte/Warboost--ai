import {LANGUAGES,resolveLanguage,localeFor,dirFor,translator} from "./i18n.js";
import {HERO_CATALOG,canonicalHeroName,isGenericHeroName,heroPresentation} from "./lib/heroes.js";
import {classifyAllianceMember,summarizeAllianceActivity,normalizeAllianceRole} from "./lib/alliance-activity.js";
import {canonicalShopStore} from "./lib/shop-catalog.js";
import {reconcileConfirmedSquad,repairLegacySquadIdentity,swapSquads,selectPrimarySquad,squadHasData} from "./lib/squad-identity.js";
import {recoverHeroData} from "./lib/hero-history.js";
import {parseRosterImport,mergeRosterMembers} from "./lib/roster-import.js";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const APP_VERSION="2.5.3";
const STORE_KEY="warboost_v1_core_state", CLIENT_KEY="warboost_v1_client_id", LANG_KEY="warboost_v12_language";
const BACKUP_KEY="warboost_last_good_state", VOICE_ENABLED_KEY="warboost_voice_enabled", VOICE_ID_KEY="warboost_voice_id";
const LEGACY_LANGUAGE_KEYS=["wb17_language","wb171_language","warboost_language"];
const LEGACY_DATA_KEYS=["wb12_account","wb11_account","wb10_profile","wb10_alliance","wb10_simple","wb10_roster","wb19_imported_players"];

function uid(){return crypto.randomUUID?.()||`wb-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function clientId(){let id=localStorage.getItem(CLIENT_KEY);if(!id){id=uid();localStorage.setItem(CLIENT_KEY,id)}return id}
function emptyHero(i){return {name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null}}
function emptySquad(i){return {id:i,name:`Squad ${i}`,power:null,updated_at:null,needs_rescan:false,composition_changed_at:null,heroes:[1,2,3,4,5].map(emptyHero)}}
function initialState(){return {version:APP_VERSION,player_id:clientId(),updated_at:null,player:{name:"",server_id:"",hq_level:null,power_m:null,coordinates:null,role:"R1"},player_context:{objective:"auto",account_age_days:null,server_profile:"auto",updated_at:null},exclusive_weapons:[],hero_progression:[],hero_profiles:[],drone:{level:null,power_m:null,updated_at:null},shop:{store_type:"",currency:"",currency_balance:null,vip_level:null,vip_days_remaining:null,offers:[],snapshots:[],updated_at:null},squads:[1,2,3,4].map(emptySquad),alliance:{id:null,tag:"",name:"",role:"R1",invite_code:"",members:[],updated_at:null},vs:{week:null,day:null,our_alliance:"",opponent:"",our_score:null,their_score:null,updated_at:null},season:{name:"",number:null,day:null,total_days:null,profession:"",progress_pct:0,resistance:null,focus:null,measured_hybrid_synergy:false,awakening_swap:null,updated_at:null},technology:{type_mastery_pct:null,hero_tech_pct:null,siege_to_seize_pct:null,defensive_fortification_pct:null,tactical_weapon_pct:null,updated_at:null},sync:{provider:"warboost-local",provider_kind:"local",access_status:"pending",capabilities:[],status:"local",last_sync:null,last_error:null,auto_ready:true,last_scan:null,official_last_sync:null,public_last_sync:null,sources:{official:false,public:false,scan:false,alliance:false}}}}
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
function mergeState(base,incoming){if(!incoming||typeof incoming!=="object")return base;const out={...base,...incoming};out.player={...base.player,...incoming.player};out.player_context={...(base.player_context||{}),...(incoming.player_context||{})};out.drone={...base.drone,...incoming.drone};out.shop=mergeShopState(base.shop,incoming.shop);out.alliance={...base.alliance,...incoming.alliance};out.vs={...base.vs,...incoming.vs};out.season={...base.season,...incoming.season};out.technology={...(base.technology||{}),...(incoming.technology||{})};out.exclusive_weapons=mergeExclusiveWeapons(base.exclusive_weapons,incoming.exclusive_weapons);out.hero_progression=mergeHeroProgression(base.hero_progression,incoming.hero_progression);out.hero_profiles=mergeHeroProfiles(base.hero_profiles,incoming.hero_profiles);out.sync={...base.sync,...incoming.sync,sources:{...base.sync.sources,...incoming.sync?.sources}};out.squads=Array.from({length:4},(_,i)=>{const b=base.squads?.[i]||emptySquad(i+1),src=incoming.squads?.[i];if(!src)return b;return {...b,...src,id:i+1,name:`Squad ${i+1}`,needs_rescan:src.needs_rescan===true,composition_changed_at:src.composition_changed_at||b.composition_changed_at||null,heroes:Array.from({length:5},(_,j)=>mergeHeroSlotIdentitySafe(b.heroes?.[j],src.heroes?.[j]))}});out.version=APP_VERSION;return out}
function hasValue(v){return !(v===null||v===undefined||v===""||(Array.isArray(v)&&v.length===0))}
function safeFields(base={},incoming={},preferBase=false){const out={...base};for(const [k,v] of Object.entries(incoming||{})){if(!hasValue(v))continue;if(preferBase&&hasValue(out[k]))continue;out[k]=v}return out}
function allianceMemberKey(m){const id=String(m?.player_id||"").trim();if(id)return `id:${id}`;const name=String(m?.name||"").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");return name?`name:${name}`:""}
function mergeAllianceMembersProtected(baseList,incomingList,preferBase=false){const out=[],index=new Map(),add=(raw,preferExisting)=>{if(!raw||typeof raw!=="object")return;const key=allianceMemberKey(raw);if(!key)return;const i=index.get(key);if(i===undefined){index.set(key,out.length);out.push({...raw});return}const old=out[i],winner=preferExisting?safeFields(old,raw,true):safeFields(old,raw,false);winner.player_id=old.player_id||raw.player_id||null;winner.name=raw.name||old.name||"";out[i]=winner};for(const m of Array.isArray(baseList)?baseList:[])add(m,false);for(const m of Array.isArray(incomingList)?incomingList:[])add(m,preferBase);return out.slice(0,300)}
function mergeStateProtected(base,incoming,{preferBase=false}={}){
  if(!incoming||typeof incoming!=="object")return mergeState(initialState(),base);
  const out=mergeState(base,incoming);
  out.player=safeFields(base.player,incoming.player,preferBase);
  out.player_context=safeFields(base.player_context||{},incoming.player_context||{},preferBase);
  out.drone=safeFields(base.drone,incoming.drone,preferBase);
  out.shop=mergeShopState(base.shop,incoming.shop);if(preferBase){out.shop={...out.shop,...base.shop,offers:base.shop?.offers||[],snapshots:out.shop.snapshots||base.shop?.snapshots||[]};}
  out.alliance=safeFields(base.alliance,incoming.alliance,preferBase);out.alliance.members=mergeAllianceMembersProtected(base.alliance?.members,incoming.alliance?.members,preferBase);
  out.vs=safeFields(base.vs,incoming.vs,preferBase);out.season=safeFields(base.season,incoming.season,preferBase);out.technology=safeFields(base.technology||{},incoming.technology||{},preferBase);out.hero_progression=mergeHeroProgression(base.hero_progression,incoming.hero_progression);out.hero_profiles=mergeHeroProfiles(base.hero_profiles,incoming.hero_profiles);
  out.sync={...base.sync,...safeFields(base.sync,incoming.sync,preferBase),sources:{...base.sync?.sources,...incoming.sync?.sources}};
  out.squads=Array.from({length:4},(_,i)=>{const b=base.squads?.[i]||emptySquad(i+1),n=incoming.squads?.[i];if(!n)return b;const sq=safeFields(b,n,preferBase);sq.id=i+1;sq.name=`Squad ${i+1}`;sq.needs_rescan=preferBase?b.needs_rescan===true:n.needs_rescan===true;sq.composition_changed_at=(preferBase?b.composition_changed_at:null)||n.composition_changed_at||b.composition_changed_at||null;sq.heroes=Array.from({length:5},(_,j)=>{const bh=b.heroes?.[j]||emptyHero(j+1),nh=n.heroes?.[j];if(!nh)return bh;const nn=canonicalStoredHeroName(nh?.name),bn=canonicalStoredHeroName(bh?.name);if(nn&&bn&&nn.toLowerCase()!==bn.toLowerCase())return preferBase?bh:{...emptyHero(j+1),...nh,name:nn};if(!nn)return bh;const h=safeFields(bh,nh,preferBase);h.name=nn;return h});return sq});
  out.exclusive_weapons=mergeExclusiveWeapons(base.exclusive_weapons,incoming.exclusive_weapons);out.version=APP_VERSION;return out
}
function safeClone(value){try{return typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value))}catch{return value}}
function rememberLastGoodState(value,reason="local"){if(!hasMeaningfulCore(value))return;try{localStorage.setItem(BACKUP_KEY,JSON.stringify({saved_at:new Date().toISOString(),reason,state:safeClone(value)}))}catch{}}
function readLastGoodState(){try{return JSON.parse(localStorage.getItem(BACKUP_KEY)||"null")?.state||null}catch{return null}}
function readLegacyJson(key){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null}catch{return null}}
function hasMeaningfulCore(x){return Boolean(x?.player?.name||x?.player?.server_id||Number(x?.player?.hq_level)>0||Number(x?.player?.power_m)>0||(x?.squads||[]).some(sq=>Number(sq?.power)>0||(sq?.heroes||[]).some(h=>h?.name||h?.level||h?.stars||h?.exclusive||h?.gear))||Number(x?.drone?.level)>0||Number(x?.drone?.power_m)>0||x?.alliance?.tag||(x?.alliance?.members||[]).length)}
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
  if(r&&(!out.alliance.role||out.alliance.role==='R1')){out.alliance.role=r;changed=true}
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
function loadState(){try{const raw=localStorage.getItem(STORE_KEY);const parsed=raw?JSON.parse(raw):null;if(parsed&&hasMeaningfulCore(parsed))rememberLastGoodState(parsed,"pre-v2.5.3-load");const base=parsed?mergeState(initialState(),parsed):initialState();const migrated=migrateLegacyLocalState(base),repaired=repairLegacySquadIdentity(migrated.state),recovered=recoverLocalHeroHistory(repaired.state),finalRepair=repairLegacySquadIdentity(recovered.state);let next=finalRepair.state;const backup=readLastGoodState();if(!hasMeaningfulCore(next)&&hasMeaningfulCore(backup))next=mergeStateProtected(next,backup,{preferBase:false});next.version=APP_VERSION;if(migrated.changed||repaired.changed||recovered.changed||finalRepair.changed||!raw)localStorage.setItem(STORE_KEY,JSON.stringify(next));rememberLastGoodState(next,"post-v2.5.3-load");return next}catch{const backup=readLastGoodState();return hasMeaningfulCore(backup)?mergeState(initialState(),backup):initialState()}}

let state=loadState(),serverNow=new Date(),pushTimer=null,suppressPush=false,cloud=null,cloudSession=null,proState={active:false,status:"free",configured:false,plan:null},scanImageData=null;
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
function authHeaders(extra={}){return {...extra,...(cloudSession?.access_token?{authorization:`Bearer ${cloudSession.access_token}`}:{})}}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function tpl(key,vars={}){return t(key,vars)}
function fmtPower(v){if(v===null||v===undefined||v==="")return "—";const n=Number(v);if(!Number.isFinite(n))return String(v);return `${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n)} M`}
function fmtAgo(iso){if(!iso)return t("never");const d=Math.max(0,Date.now()-new Date(iso).getTime());if(d<60e3)return t("just_now");if(d<3600e3)return `${Math.floor(d/60e3)} ${t("minutes")}`;if(d<86400e3)return `${Math.floor(d/3600e3)} ${t("hours")}`;return `${Math.floor(d/86400e3)} ${t("days")}`}
function updatedLabel(iso){if(!iso)return t("not_synced");const d=Math.max(0,Date.now()-new Date(iso).getTime());return d<60e3?t("updated_now"):t("updated_ago",{ago:fmtAgo(iso)})}
function isoWeek(d){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return Math.ceil((((x-y)/86400000)+1)/7)}
function currentVsWeek(){return isoWeek(serverNow||new Date())}
function currentVsDay(){return vsDayFromServer(serverNow||new Date())}
function normalizedRole(v){const r=String(v||"R1").toUpperCase();return /^R[1-5]$/.test(r)?r:"R1"}
function isAllianceManager(){return ["R4","R5"].includes(normalizedRole(state?.alliance?.role))}
function managerOnlyMessage(){return t("manager_only")}

function voiceEnabled(){return localStorage.getItem(VOICE_ENABLED_KEY)!=="0"}
function preferredVoiceId(){return localStorage.getItem(VOICE_ID_KEY)||""}
function refreshVoices(){if(!("speechSynthesis" in window))return;availableVoices=window.speechSynthesis.getVoices()||[];const sel=$("#voiceSelect");if(!sel)return;const chosen=preferredVoiceId(),langLocale=String(locale||"").toLowerCase();const sorted=[...availableVoices].sort((a,b)=>{const am=String(a.lang||"").toLowerCase().startsWith(langLocale.split("-")[0])?0:1,bm=String(b.lang||"").toLowerCase().startsWith(langLocale.split("-")[0])?0:1;return am-bm||String(a.name).localeCompare(String(b.name))});sel.innerHTML=`<option value="">${esc(t("automatic"))}</option>`+sorted.map(v=>`<option value="${esc(v.voiceURI)}"${v.voiceURI===chosen?" selected":""}>${esc(v.name)} · ${esc(v.lang||"")}</option>`).join("")}
function voiceGreetingText(){const name=state?.player?.name||"WarBoost",role=normalizedRole(state?.alliance?.role||state?.player?.role),k=String(lang||"en").toLowerCase();if(k.startsWith("fr")){const title={R5:"Général",R4:"Mon colonel",R3:"Commandant",R2:"Capitaine",R1:"Soldat"}[role]||role;return `Bonjour ${title} ${name}. WarBoost est prêt.`}return `${t("hello",{name})}. ${t("role")} ${role}. WarBoost.`}
function speakGreeting(section="player",force=false){if(!voiceEnabled()||!("speechSynthesis" in window))return;if(!force&&voiceGreetedSections.has(section))return;const text=voiceGreetingText();if(!text)return;try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text),chosen=preferredVoiceId(),voice=availableVoices.find(v=>v.voiceURI===chosen)||availableVoices.find(v=>String(v.lang||"").toLowerCase().startsWith(String(locale||"").toLowerCase().split("-")[0]));if(voice)u.voice=voice;u.lang=voice?.lang||locale;u.rate=.96;window.speechSynthesis.speak(u);if(!force)voiceGreetedSections.add(section)}catch{}}
function renderVoiceSettings(){const enabled=$("#voiceEnabled"),pill=$("#voiceStatusPill");if(enabled)enabled.checked=voiceEnabled();if(pill)pill.textContent=voiceEnabled()?t("voice_on"):t("voice_off");refreshVoices()}
function safeSelfRole(requested){const r=normalizedRole(requested),verified=normalizedRole(state?.alliance?.role);if(["R4","R5"].includes(verified))return verified;return ["R1","R2","R3"].includes(r)?r:"R1"}

function vsDayFromServer(d){const day=d.getUTCDay();return day===0?6:day}
function renderScanTypeOptions(){const sel=$("#scanType");if(!sel)return;const current=sel.value||"profile";const opts=[["profile",t("scan_profile")],["squad1",`${t("squad")} 1`],["squad2",`${t("squad")} 2`],["squad3",`${t("squad")} 3`],["squad4",`${t("squad")} 4`],["drone",t("scan_drone")],["exclusive",t("scan_exclusive")],["awakening",t("scan_awakening")],["shop",t("scan_shop")],["vs",t("scan_vs")],["season",t("scan_season")]];sel.innerHTML=opts.map(([v,label])=>`<option value="${v}">${label}</option>`).join("");sel.value=opts.some(([v])=>v===current)?current:"profile"}
function applyLanguage(){lang=resolveLanguage(languageChoice);locale=localeFor(lang);t=translator(lang);document.documentElement.lang=lang;document.documentElement.dir=dirFor(lang);$$('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});$$('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));const sel=$("#languageSelect");if(sel){sel.innerHTML=LANGUAGES.map(([v,label])=>`<option value="${v}">${label}</option>`).join("");sel.value=languageChoice}renderScanTypeOptions();renderClock();render();renderAuth();renderPro();renderVoiceSettings();$("#proPriorityPanel")?.classList.add("hidden");$("#playerSyncInfo")?.classList.remove("hidden")}
function saveState(){state=repairLegacySquadIdentity(state).state;state.updated_at=new Date().toISOString();state.version=APP_VERSION;localStorage.setItem(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"save");render();if(!suppressPush)scheduleServerSave()}
function scheduleServerSave(){clearTimeout(pushTimer);pushTimer=setTimeout(pushServerState,700)}

async function initCloudAuth(){try{const r=await fetch("/api/cloud-config",{cache:"no-store"});const cfg=await r.json();if(!r.ok||!cfg.configured||!window.supabase?.createClient)throw new Error();cloud=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data}=await cloud.auth.getSession();await applySession(data?.session||null);cloud.auth.onAuthStateChange((_event,session)=>applySession(session||null))}catch{renderAuth()}}
async function applySession(session){cloudSession=session||null;if(cloudSession?.user?.id){const loginSeed=safeClone(state),oldId=state.player_id;rememberLastGoodState(loginSeed,"before-login");state.player_id=cloudSession.user.id;if(oldId!==state.player_id)localStorage.setItem(STORE_KEY,JSON.stringify(state));const pulled=await pullServerState(loginSeed);if(pulled?.cloud_empty&&hasMeaningfulCore(loginSeed)){state=mergeStateProtected(state,{...loginSeed,player_id:cloudSession.user.id},{preferBase:false});state.player_id=cloudSession.user.id;saveState();await pushServerState()}await refreshPro()}else{proState={active:false,status:"free",configured:false,plan:null}}renderAuth();renderPro()}
function renderAuth(){const logged=Boolean(cloudSession?.user);$("#authLoggedOut")?.classList.toggle("hidden",logged);$("#authLoggedIn")?.classList.toggle("hidden",!logged);if($("#authPill"))$("#authPill").textContent=logged?t("connected"):(cloud?t("ready"):t("local"));if(logged&&$("#authIdentity"))$("#authIdentity").textContent=`WarBoost · ${cloudSession.user.email||""}`;renderPro()}
function authMessage(text,ok=false){const el=$("#authMessage");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text}
async function pushServerState(){if(!cloudSession?.access_token)return;try{const r=await fetch("/api/state",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({state})});if(!r.ok)return;const j=await r.json().catch(()=>({}));if(j?.updated_at){state.sync.last_sync=state.sync.last_sync||j.updated_at;localStorage.setItem(STORE_KEY,JSON.stringify(state))}}catch{}}
async function pullServerState(loginSeed=null){if(!cloudSession?.access_token)return {skipped:true};try{const r=await fetch("/api/state",{cache:"no-store",headers:authHeaders()}),j=await r.json().catch(()=>({}));if(!r.ok){if(j?.error==="database_schema_missing"){state.sync.last_error=t("cloud_schema_missing");state.sync.status="offline";renderProvider()}return {ok:false,error:j?.error||"state_error"}}if(!j?.state)return {ok:true,cloud_empty:true};const localBefore=hasMeaningfulCore(loginSeed)?loginSeed:safeClone(state),localTs=Date.parse(state?.updated_at||"")||0,cloudTs=Date.parse(j.updated_at||j.state?.updated_at||"")||0,preferLocal=Boolean(localTs&&cloudTs&&localTs>cloudTs);suppressPush=true;let merged=mergeStateProtected(state,j.state,{preferBase:preferLocal});if(hasMeaningfulCore(localBefore)&&!hasMeaningfulCore(merged))merged=mergeStateProtected(merged,localBefore,{preferBase:false});const localRecovered=recoverLocalHeroHistory(merged);state=repairLegacySquadIdentity(localRecovered.state).state;state.player_id=cloudSession.user.id;state.updated_at=preferLocal?(state.updated_at||new Date().toISOString()):(j.state?.updated_at||j.updated_at||state.updated_at);localStorage.setItem(STORE_KEY,JSON.stringify(state));rememberLastGoodState(state,"cloud-pull");render();suppressPush=false;return {ok:true,cloud_empty:false}}catch{return {ok:false,error:"offline"}}}

async function refreshServerTime(){try{const r=await fetch("/api/health",{cache:"no-store"});if(!r.ok)throw new Error();const j=await r.json();serverNow=new Date(j.now);state.vs.week=j.iso_week;state.vs.day=j.vs_day;$("#syncPill").className="syncState good";$("#syncPill").textContent=t("server_ok")}catch{serverNow=new Date();state.vs.week=isoWeek(serverNow);state.vs.day=vsDayFromServer(serverNow);$("#syncPill").className="syncState";$("#syncPill").textContent=t("local_time")}renderClock();render()}
function renderClock(){const d=serverNow;const clock=$("#serverClock"),day=$("#serverDay");if(clock)clock.textContent=d.toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit",second:"2-digit"});if(day)day.textContent=`${d.toLocaleDateString(locale,{weekday:"long",day:"2-digit",month:"short"})} · ${t("week")} ${isoWeek(d)}`}
setInterval(()=>{serverNow=new Date(serverNow.getTime()+1000);renderClock()},1000);setInterval(refreshServerTime,5*60*1000);

function render(){const p=state.player,a=state.alliance,v=state.vs,s=state.season,d=state.drone||{};if(!$("#playerMeta"))return;$("#playerMeta").textContent=p.name?(p.hq_level?`${t("hq")} ${p.hq_level}`:t("connected")):t("to_connect");$("#allianceMeta").textContent=a.tag||"—";$("#vsMeta").textContent=`${t("week")} ${currentVsWeek()}`;$("#seasonMeta").textContent=s.name||(s.number?`S${s.number}`:t("to_fill"));$("#pName").textContent=p.name||"—";$("#pHq").textContent=p.hq_level?`${t("hq")} ${p.hq_level}`:"—";$("#pPower").textContent=fmtPower(p.power_m);$("#pDrone").textContent=d.level?`${t("level")}${d.level}${d.power_m?` · ${fmtPower(d.power_m)}`:""}`:"—";renderSquads();renderExclusiveWeapons();$("#aTag").textContent=a.tag||"—";$("#aCount").textContent=String(a.members?.length||0);$("#aRole").textContent=a.role||p.role||"R1";$("#inviteCode").textContent=ensureInviteCode();$("#rosterFresh").textContent=a.updated_at?updatedLabel(a.updated_at):t("sync_needed");renderMembers();$("#vsWeekTitle").textContent=t("vs_week",{week:currentVsWeek()});$("#vsDayPill").textContent=t("day_n",{day:currentVsDay()});$("#vsUs").textContent=v.our_alliance||a.tag||t("your_alliance");$("#vsThem").textContent=v.opponent||t("unknown_opponent");$("#vsUsScore").textContent=v.our_score??"—";$("#vsThemScore").textContent=v.their_score??"—";renderVsTimeline();$("#sName").textContent=s.name||(s.number?`S${s.number}`:"—");$("#sDay").textContent=s.day||"—";$("#sProfession").textContent=s.profession||"—";const pct=Math.max(0,Math.min(100,Number(s.progress_pct||0)));$("#seasonProgressBar").style.width=`${pct}%`;$("#seasonProgressLabel").textContent=`${pct}%`;$("#seasonStatus").textContent=s.updated_at?`${t("last_update",{ago:fmtAgo(s.updated_at)})} · ${s.resistance??"—"}`:t("season_wait");renderAdvice();renderAccountFields();renderProvider()}
function squadHasSavedData(sq){return Boolean(sq?.updated_at||Number(sq?.power)>0||(sq?.heroes||[]).some(h=>h?.name||h?.level||h?.stars||h?.power||h?.exclusive||h?.gear))}
function formatGear(raw){const s=String(raw||"").trim();if(!s)return "";const localizeRarities=value=>String(value||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean).map(x=>{const k=`rarity_${x}`;return t(k)===k?x:t(k)}).join("/");let m=s.match(/^count=(\d+);level=(\d+);rarity=([a-z,]+)$/i);if(!m)m=s.match(/^(\d+)\s+gear items?,\s*Lv\.?\s*(\d+),\s*([a-z]+)\s+rarity$/i);if(m)return `${m[1]} ${t("gear_items")} · ${t("level")}${m[2]} · ${t("rarity")} ${localizeRarities(m[3])}`;const ml=s.match(/^count=(\d+);levels=([0-9,]+);rarity=([a-z,]+)$/i);if(ml){const levels=ml[2].split(",").map(x=>Number(x)).filter(Number.isFinite),levelText=levels.map(x=>`${t("level")}${x}`).join("/");return `${ml[1]} ${t("gear_items")} · ${levelText} · ${t("rarity")} ${localizeRarities(ml[3])}`}const lv=s.match(/^Lv\.?\s*(\d+)$/i);if(lv)return `${t("level")}${lv[1]}`;return s}
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
    const name=`${t("squad")} ${id}`,optional4=i===3&&!squadHasSavedData(sq),freshness=optional4?t("optional_squad4"):(sq.needs_rescan?t("sync_needed"):(sq.updated_at?updatedLabel(sq.updated_at):t("not_synced")));
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
function adaptiveServerLabel(v){return t(v==="new"?"server_profile_new":v==="mature"?"server_profile_mature":v==="competitive"?"server_profile_competitive":v==="mixed"?"server_profile_mixed":"server_profile_auto")}
function adaptiveDateLabel(v){const d=new Date(v||"");if(Number.isNaN(d.getTime()))return "—";try{return new Intl.DateTimeFormat(localeFor(lang),{dateStyle:"short",timeStyle:"short"}).format(d)}catch{return d.toLocaleString()}}
function adaptiveContextSummary(ctx){if(!ctx)return "";const parts=[`${t("objective_label")}: ${adaptiveObjectiveLabel(ctx.objective)}`,`${t("server_profile_label")}: ${adaptiveServerLabel(ctx.server_profile)}`];if(ctx.account_age_days!=null)parts.push(`${t("account_age_days")}: ${ctx.account_age_days}`);if(ctx.season?.number)parts.push(`${t("season")} S${ctx.season.number}${ctx.season.phase&&ctx.season.phase!=="unknown"?` · ${t(`season_phase_${ctx.season.phase}`)}`:""}`);if(ctx.composition?.main_type){const typeKey=`unit_type_${String(ctx.composition.main_type).toLowerCase()}`,typeLabel=t(typeKey);parts.push(`${t("squad")}: ${typeLabel===typeKey?"—":typeLabel}`)}parts.push(`${t("context_confidence")}: ${ctx.confidence}%`);return `${t("pro_context_title")} · ${parts.join(" · ")}`}
const AI_NATIVE_LANGS=new Set(["fr","en-GB","en-US","es","de","ja","zh","ar"]);
function aiUsesNativeCopy(){return AI_NATIVE_LANGS.has(lang)}
function aiKindLabel(kind){const key=`ai_kind_${String(kind||"focus").toLowerCase()}`,v=t(key);return v===key?String(kind||t("plan7_focus")):v}
function aiTargetLabel(x){const hero=proHeroAttr(x);if(hero)return hero;const kind=String(x?.kind||"").toLowerCase();if(kind==="drone")return t("drone");if(kind==="technology")return aiKindLabel("technology");return ""}
function structuredPriorityTitle(x){const target=aiTargetLabel(x),kind=aiKindLabel(x?.kind);return target?`${kind} · ${target}`:kind}
function structuredPriorityAction(x){const target=aiTargetLabel(x)||aiKindLabel(x?.kind);return x?.kind==="scan"?t("plan7_scan"):`${t("plan7_focus")}: ${target}`}
function structuredShopItemLabel(x){if(["scan","official"].includes(String(x?.source||""))&&x?.item)return String(x.item);const f=String(x?.diagnostic_alignment?.resource_family||"");if(f==="hero_xp")return aiKindLabel("level");if(f==="hero_shards")return aiKindLabel("stars");if(f==="exclusive_weapon_shards")return aiKindLabel("exclusive");if(f==="awakening_shards")return aiKindLabel("awakening");if(f==="gear_materials")return aiKindLabel("gear");if(f==="drone_components")return aiKindLabel("drone");if(f==="technology_materials")return aiKindLabel("technology");return aiKindLabel("focus")}
function shopVerdictLabel(x){const k=String(x?.verdict_key||"");if(["buy","priority","strong_buy"].includes(k))return t("shop_buy");if(["skip","avoid","low"].includes(k))return t("shop_skip");return t("shop_consider")}
function planModeLabel(mode){return mode==="scan"?t("plan7_scan"):mode==="hold"?t("plan7_hold"):mode==="shop"?t("shop_consider"):mode==="timing"?t("vs"):mode==="review"?t("refresh"):t("plan7_focus")}
function planTargetLabel(row){if(aiUsesNativeCopy())return String(row?.target||"").trim();const kind=String(row?.kind||"").toLowerCase(),raw=String(row?.target||"").trim();if(raw&&HERO_CATALOG.some(n=>n.toLowerCase()===canonicalStoredHeroName(raw).toLowerCase()))return canonicalStoredHeroName(raw);if(kind==="drone")return t("drone");if(kind==="technology")return aiKindLabel("technology");return aiKindLabel(kind||"focus")}
function planActionText(row){const target=planTargetLabel(row)||aiKindLabel(row?.kind);if(row?.mode==="scan"||row?.mode==="review")return t("plan7_scan");if(row?.mode==="hold")return t("plan7_hold");return `${t("plan7_focus")}: ${target}`}
function renderPlayer7DayPlan(analysis){const box=$("#player7DayPlan");if(!box)return;const rows=analysis?.seven_day_plan?.days||[];box.innerHTML=rows.length?rows.map(row=>{const target=planTargetLabel(row);return `<div class="plan7Row"><span class="plan7Day">${esc(`#${row.day}`)}</span><div class="plan7Main"><b>${esc(planModeLabel(row.mode))}${target?` · ${esc(target)}`:""}</b><small>${esc(planActionText(row))}</small></div><span class="plan7Rule">${esc(row.no_exact_quantity?t("condition_refresh"):"")}</span></div>`}).join(""):`<div class="notice">${esc(t("player_sync_note"))}</div>`}
function renderProPriority(analysis){
  const native=aiUsesNativeCopy(),ui=aiUiText(),panel=$("#proPriorityPanel"),summary=$("#proPrioritySummary"),contextBox=$("#proAdaptiveContext"),list=$("#proPriorityList"),compare=$("#proSquadCompare"),confidence=$("#proConfidence"),note=$("#playerSyncInfo"),shopList=$("#proShopList"),shopSummary=$("#proShopSummary"),shopConfidence=$("#shopConfidence"),shopCatalogPill=$("#shopCatalogPill"),avoid=$("#proAvoidList");
  if(!panel||!analysis)return;
  if(note)note.classList.add("hidden");panel.classList.remove("hidden");
  const top=Array.isArray(analysis.priorities)?analysis.priorities[0]:null;
  if(summary){
    if(native){const mi=analysis.meta_intelligence,composition=analysis.composition?.label?` · ${analysis.composition.label}`:"";summary.textContent=`${analysis.summary||""}${composition}${analysis.candidates_evaluated?` · ${t("options_compared_count",{count:analysis.candidates_evaluated})}`:""}${mi?.source_count?` · ${ui.sources} ${mi.source_count} · ${ui.meta} ${mi.confidence}%`:""}`}
    else{const target=top?structuredPriorityTitle(top):t("plan7_scan");summary.textContent=`${`${t("plan7_focus")}: ${target}`}${analysis.candidates_evaluated?` · ${t("options_compared_count",{count:analysis.candidates_evaluated})}`:""}`}
  }
  if(contextBox){const text=adaptiveContextSummary(analysis.adaptive_context);contextBox.textContent=text;contextBox.classList.toggle("hidden",!text)}
  if(confidence)confidence.textContent=native?(analysis.confidence_label||`${analysis.confidence||0}%`):`${analysis.confidence||0}%`;
  if(list){
    const items=(Array.isArray(analysis.priorities)?analysis.priorities:[]).slice(0,3);
    list.innerHTML=items.length?items.map((x,i)=>{const hero=proHeroAttr(x),heroVisual=proHeroVisual(hero,i===0),progress=native?proProgressLabel(x):"",marginal=Number(x.marginal_value_score),certainty=adaptiveCertaintyLabel(x.certainty),condition=adaptiveConditionLabel(x.condition_key),calculated=adaptiveDateLabel(x.calculated_at||analysis.generated_at),title=native?`${x.title||""}${x.target?` · ${x.target}`:""}`:structuredPriorityTitle(x),action=native?(x.action||""):structuredPriorityAction(x),reason=native?(x.reason||""):t("condition_neutral"),impact=native?(x.impact_label||"—"):(Number.isFinite(Number(x.impact_score))?`${Math.round(Number(x.impact_score))}/100`:"—"),roi=native?(x.resource_efficiency_label||x.roi_label||"—"):(Number.isFinite(Number(x.roi_score))?`${Math.round(Number(x.roi_score))}/100`:"—");return `<article class="priorityCard compactDecision${heroVisual?"":" noHeroDecision"}"${hero?` data-hero="${esc(hero)}"`:""}><span class="priorityRank">${esc(x.rank||"•")}</span>${heroVisual}<div class="priorityMain"><div class="decisionHead"><div class="decisionTitle"><b>${esc(title)}</b>${progress?`<span class="priorityProgress">${esc(progress)}</span>`:""}</div><span class="decisionMetric">${esc(native?ui.impact:"⚡")} : ${esc(impact)} · ${esc(t("resource_efficiency"))} : ${esc(roi)}</span></div>${Number.isFinite(marginal)?`<small>📈 ${esc(t("marginal_return"))} ${marginal}/100 · ${esc(t("certainty_label"))}: ${esc(certainty)}</small>`:""}<strong>${esc(action)}</strong><details class="decisionDetails"><summary>${esc(native?ui.why:"ℹ️")}</summary><p>${esc(reason)}</p>${native&&x.comparison_note?`<small>⚖️ ${esc(x.comparison_note)}</small>`:""}${progress?`<small>🎯 ${esc(progress)}</small>`:""}${x.progress_needed_levels>0?`<small>📈 ${esc(String(x.progress_needed_levels))} ${esc(t("levels_to_breakpoint"))}</small>`:""}${x.condition_key?`<small>🔀 ${esc(t("conditional_recommendation"))}: ${esc(condition)}</small>`:""}${native&&x.data_freshness?.label?`<small>🕒 ${esc(x.data_freshness.label)}</small>`:""}<small>📅 ${esc(t("recommendation_date"))}: ${esc(calculated)}</small>${native?`<small>🆓 ${esc(x.buy_free||"")}</small><small>💎 ${esc(x.buy_paid||"")}</small>`:`<small>🛡️ ${esc(t("condition_refresh"))}</small>`}</details></div></article>`}).join(""):`<div class="notice">${esc(native?(analysis.summary||t("player_sync_note")):t("player_sync_note"))}</div>`;
  }
  if(avoid){const rows=Array.isArray(analysis.avoid_now)?analysis.avoid_now:[];avoid.innerHTML=native&&rows.length?`<div class="avoidTitle">⛔ ${esc(ui.avoid)}</div>${rows.map(x=>`<div class="avoidRow">${esc(x)}</div>`).join("")}`:`<div class="avoidTitle">⛔ ${esc(t("plan7_hold"))}</div>`}
  if(compare){const rows=Array.isArray(analysis.squads)?analysis.squads:[];compare.innerHTML=rows.map(x=>`<div class="compareRow"><span class="compareNo">${esc(x.id)}</span><div><b>${esc(native?(x.name||`${t("squad")} ${x.id}`):`${t("squad")} ${x.id}`)}</b><small>${native&&x.status?`${esc(x.status)} · `:""}${native?`${esc(t("pro_data_quality"))} `:"📊 "}${esc(x.data_quality??0)}% · ${esc(x.heroes_detected??0)}/5</small></div><strong>${esc(x.power_label||"—")}</strong></div>`).join("")}
  const shop=analysis.shop||{};
  if(shopSummary)shopSummary.textContent=native?(shop.summary||t("shop_summary_default")):t("shop_summary_default");
  if(shopConfidence)shopConfidence.textContent=native?(shop.confidence_label||`${shop.confidence||0}%`):`${shop.confidence||0}%`;
  if(shopCatalogPill){shopCatalogPill.textContent=native?(shop.catalog_label||"—"):t("adaptive");shopCatalogPill.className=`pill ${shop.catalog_status==="official"?"catalogOfficialPill":"catalogPartialPill"}`}
  if(shopList){const rows=(Array.isArray(shop.recommendations)?shop.recommendations:[]).slice(0,3);shopList.innerHTML=rows.length?rows.map(x=>`<article class="shopCard ${esc(x.verdict_key||"")}"><div class="shopHead"><span class="shopRank">${esc(x.rank||"•")}</span><div><b>${esc(native?(x.item||""):structuredShopItemLabel(x))}</b><small>${native?`${esc(x.store||"")}${x.price_label?` · ${esc(x.price_label)}`:""}`:(["scan","official"].includes(String(x.source||""))&&x.price_label?esc(x.price_label):"")}</small>${x.score!=null?`<span class="shopScore">${esc(String(Math.round(Number(x.score))))}/100</span>`:""}</div><span class="shopVerdict">${esc(native?(x.verdict||""):shopVerdictLabel(x))}</span></div><details class="decisionDetails"><summary>${esc(native?ui.details:"ℹ️")}</summary><p>${esc(native?(x.reason||""):t("condition_neutral"))}</p>${native&&x.target?`<strong>${esc(x.target)}</strong>`:""}</details></article>`).join(""):`<div class="notice">${esc(t("shop_no_recommendations"))}</div>`}
  renderPlayer7DayPlan(analysis);
}

function activityLabel(a){
  return a.key==="active"?t("activity_active_confirmed"):a.key==="inactive"?t("activity_inactive_probable"):a.key==="unknown"?t("activity_indeterminate"):t("activity_refresh");
}
function activityIcon(a){return a.key==="active"?"🟢":a.key==="inactive"?"🔴":a.key==="unknown"?"⚪":"🟠"}
function activityReason(a){
  if(a.reason==="recent_activity")return t("activity_reason_recent");
  if(a.reason==="recent_progress")return t("activity_reason_progress");
  if(a.reason==="stale_snapshot")return t("activity_reason_stale");
  if(a.reason==="fresh_negative_evidence")return t("activity_reason_negative");
  return t("activity_reason_insufficient");
}
function renderAllianceActivity(){
  const members=state.alliance.members||[],box=$("#activitySummary"),summary=summarizeAllianceActivity(members);
  const c=summary.counts;
  if(box)box.innerHTML=`<div><b>🟢 ${c.active}</b><small>${esc(t("activity_active_confirmed"))}</small></div><div><b>🟠 ${c.refresh}</b><small>${esc(t("activity_refresh"))}</small></div><div><b>🔴 ${c.inactive}</b><small>${esc(t("activity_inactive_probable"))}</small></div>`;
  const note=$("#activityNote");if(note)note.textContent=members.length?t("activity_reliability_note"):t("activity_no_data");
  return summary;
}
function renderMemberRow(m){
  const a=classifyAllianceMember(m),icon=activityIcon(a),label=activityLabel(a),reason=activityReason(a),delta=Number(m?.delta_m),canManage=normalizedRole(state?.alliance?.role)==="R5"&&Boolean(m?.player_id);
  const deltaText=Number.isFinite(delta)&&delta!==0?`${delta>0?"+":""}${delta} M`:"",role=normalizeAllianceRole(m.role),roleControl=canManage?`<select class="memberRoleSelect" data-member-role-id="${esc(m.player_id)}" aria-label="${esc(t("role"))}">${["R5","R4","R3","R2","R1"].map(r=>`<option value="${r}"${r===role?" selected":""}>${r}</option>`).join("")}</select>`:"";
  return `<div class="member compactMember"><div><b>${icon} ${esc(m.name||t("player"))}</b><small>${t("hq")} ${m.hq_level??"—"} · ${fmtPower(m.power_m)} · ${role}</small><span class="activityLine">${esc(label)} · ${esc(reason)}</span></div><div class="memberRight">${deltaText?`<div class="delta">${esc(deltaText)}</div>`:""}${roleControl}</div></div>`;
}
function renderMembers(){
  const box=$("#memberList"),members=state.alliance.members||[];if(!box)return;
  const summary=renderAllianceActivity(),roles=["R5","R4","R3","R2","R1"];
  if(!members.length){box.innerHTML=`<div class="notice">${t("no_members")}</div>`;return}
  const chips=roles.map(role=>`<span class="roleCountChip"><b>${role}</b><small>${summary.roleCounts[role]||0}</small></span>`).join("");
  const groups=roles.map(role=>{
    const rows=members.filter(m=>normalizeAllianceRole(m.role)===role).sort((a,b)=>(Number(b.power_m)||0)-(Number(a.power_m)||0));
    const open=openRosterRoles.has(role)?" open":"";
    const body=rows.length?rows.map(renderMemberRow).join(""):`<div class="emptyRole">${esc(t("role_empty"))}</div>`;
    return `<details class="roleRosterGroup" data-roster-role="${role}"${open}><summary><span class="roleRosterTitle"><b>${role}</b><small>${rows.length} ${esc(t("members_short"))}</small></span><span class="roleRosterChevron" aria-hidden="true">⌄</span></summary><div class="roleRosterBody">${body}</div></details>`;
  }).join("");
  box.innerHTML=`<div class="rosterOverview"><div><b>${esc(t("roster_by_role"))}</b><small>${esc(t("roster_hint"))}</small></div><div class="roleCountRow">${chips}</div></div><div class="roleRosterList">${groups}</div>`;
  box.querySelectorAll("details[data-roster-role]").forEach(d=>d.addEventListener("toggle",()=>{const role=d.dataset.rosterRole;if(d.open)openRosterRoles.add(role);else openRosterRoles.delete(role)}));
  box.querySelectorAll("select[data-member-role-id]").forEach(sel=>sel.addEventListener("change",async()=>{const playerId=sel.dataset.memberRoleId,nextRole=sel.value,previous=(state.alliance.members||[]).find(m=>String(m.player_id)===String(playerId))?.role||"R1";sel.disabled=true;try{const r=await fetch("/api/alliance-role",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({player_id:playerId,role:nextRole})}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"role_update_failed");const row=(state.alliance.members||[]).find(m=>String(m.player_id)===String(playerId));if(row){row.role=nextRole;row.updated_at=new Date().toISOString()}saveState()}catch{sel.value=previous;const status=$("#rosterImportStatus");if(status){status.className="notice warn";status.textContent=`⚠️ ${t("role")}`}}finally{sel.disabled=false}}));
}
function memberNames(items){return (Array.isArray(items)?items:[]).filter(Boolean).join(" / ")||"—"}
function renderAllianceStructured(j){
  const immediate=$("#allianceImmediate"),planB=$("#alliancePlanB");
  const actions=Array.isArray(j?.immediate_actions)?j.immediate_actions:[],fallback=Array.isArray(j?.plan_b)?j.plan_b:[];
  if(immediate){immediate.classList.toggle("hidden",!actions.length);immediate.innerHTML=actions.length?`<b>⚡ ${esc(t("immediate_actions"))}</b>${actions.map(x=>`<div><strong>${esc(t(`alliance_group_${x.kind}`))}</strong><small>${esc(memberNames(x.members))}</small></div>`).join("")}`:""}
  if(planB){planB.classList.toggle("hidden",!fallback.length);planB.innerHTML=fallback.length?`<b>🛡️ ${esc(t("plan_b"))}</b>${fallback.map(x=>{const icon=x.kind==="refresh"?"🟠":x.kind==="defensive"?"🛡️":"✅",label=x.kind==="refresh"?t("refresh"):t("plan_b");return `<div><strong>${icon} ${esc(label)} · ${esc(String(x.count??0))}</strong></div>`}).join("")}`:""}
}
function structuredAdviceText(scope,j){
  if(!j)return scope==="alliance"?t("war_plan_empty"):scope==="vs"?t("vs_empty"):t("season_empty");
  if(aiUsesNativeCopy()&&j.advice)return j.advice;
  if(scope==="alliance")return `${t("alliance")} · 🟢 ${j.activity?.active??0} · 🟠 ${j.activity?.refresh??0}`;
  if(scope==="vs"){const d=Number(j.day),key=Number.isInteger(d)&&d>=1&&d<=6?`vs_focus_${d}`:null,gap=Number(j.score_gap),focus=key?t(key):t("plan7_hold");return `${Number.isInteger(d)?`${t("vs")} · #${d}\n`:""}${t("plan7_focus")}: ${focus}${Number.isFinite(gap)?`\nΔ ${Math.round(gap*100)/100}`:""}\n${t("vs_hold_rule")}`}
  if(scope==="season"){const parts=[t("season_structured_priority")];if(j.progress_pct!=null)parts.push(`${t("season_progress")}: ${j.progress_pct}%`);if(j.profession)parts.push(`${t("profession")}: ${j.profession}`);if(j.resistance!=null)parts.push(`🛡️ ${j.resistance}`,t("season_resistance_priority"));if(j.day&&j.total_days&&Number(j.day)/Number(j.total_days)>=.8)parts.push(t("season_late_priority"));return parts.join("\n")}
  return j.advice||"";
}

function renderVsTimeline(){const active=Number(currentVsDay()||1),fmt=new Intl.DateTimeFormat(locale,{weekday:"short"}),monday=new Date(Date.UTC(2026,0,5));$("#vsTimeline").innerHTML=Array.from({length:6},(_,i)=>{const d=new Date(monday);d.setUTCDate(monday.getUTCDate()+i);return `<div class="day ${active===i+1?"active":""}">${fmt.format(d)}<br>${t("day_label")}${i+1}</div>`}).join("")}
function renderAdvice(){const p=state.player;if(!p.name){$("#adviceTitle").textContent=t("configure_profile");$("#adviceText").textContent=t("configure_text");$("#adviceAction").textContent=t("configure");return}const primary=selectPrimarySquad(state);if(!primary){$("#adviceTitle").textContent=t("hello",{name:p.name});$("#adviceText").textContent=t("sync_four");$("#adviceAction").textContent=t("open_player");return}const primaryName=`${t("squad")} ${primary.i+1}`;let text=t("priority_text",{power:fmtPower(primary.s.power)});const primaryPower=Number(primary.s.power),strongestOther=state.squads.map((s,i)=>({s,i,p:Number(s?.power)})).filter(x=>x.i!==primary.i&&squadHasData(x.s)&&Number.isFinite(x.p)&&x.p>0).sort((a,b)=>b.p-a.p)[0];if(primary.i===0&&Number.isFinite(primaryPower)&&strongestOther&&strongestOther.p>primaryPower){text+=` ${t("stronger_squad_note",{name:`${t("squad")} ${strongestOther.i+1}`,power:fmtPower(strongestOther.p)})}`}$("#adviceTitle").textContent=t("priority",{name:primaryName});$("#adviceText").textContent=text;$("#adviceAction").textContent=t("view_squads")}
function renderAccountFields(){const p=state.player,ctx=state.player_context||{};if(!$("#fName"))return;$("#fName").value=p.name||"";$("#fServer").value=p.server_id||"";$("#fHq").value=p.hq_level||"";$("#fAlliance").value=state.alliance.tag||"";$("#fRole").value=state.alliance.role||p.role||"R1";if($("#fObjective"))$("#fObjective").value=ctx.objective||"auto";if($("#fAccountAge"))$("#fAccountAge").value=ctx.account_age_days??"";if($("#fServerProfile"))$("#fServerProfile").value=ctx.server_profile||"auto";renderVoiceSettings()}
function renderProvider(){const s=state.sync||{},sources=s.sources||{},official=Boolean(sources.official),pill=$("#providerPill"),box=$("#providerStatus");if(!pill||!box)return;pill.textContent=official?t("official_connected"):t("official_pending");pill.className=`pill ${official?"activePill":""}`;$("#publicSourceState").textContent=official?t("official_connected"):t("official_pending");$("#scanSourceState").textContent=(sources.scan||s.last_scan)?t("available"):t("ready");$("#allianceCloudState").textContent=(sources.alliance||cloudSession)?t("available"):t("not_connected");if(s.last_error&&s.status==="offline"){box.className="notice warn";box.textContent=s.last_error}else if(official){box.className="notice";box.textContent=s.official_last_sync?t("last_update",{ago:fmtAgo(s.official_last_sync)}):t("official_connected_note")}else{box.className="notice warn";box.textContent=t("hybrid_no_public")}}
function ensureInviteCode(){if(!state.alliance.invite_code){const base=(state.alliance.tag||"WB").replace(/[^A-Z0-9]/gi,"").toUpperCase().slice(0,4)||"WB";state.alliance.invite_code=`${base}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;localStorage.setItem(STORE_KEY,JSON.stringify(state))}return state.alliance.invite_code}
function openDrawer(name){closeDrawers();$("#backdrop").classList.add("open");const d=$("#"+name+"Drawer");if(d){d.classList.add("open");d.setAttribute("aria-hidden","false");if(name==="player"||name==="alliance")setTimeout(()=>speakGreeting(name),80)}}
function closeDrawers(){$("#backdrop").classList.remove("open");$$('.drawer').forEach(d=>{d.classList.remove("open");d.setAttribute("aria-hidden","true")})}

$$('[data-open]').forEach(b=>b.addEventListener("click",()=>openDrawer(b.dataset.open)));$$('[data-close]').forEach(b=>b.addEventListener("click",closeDrawers));$("#backdrop").addEventListener("click",closeDrawers);$("#accountBtn").addEventListener("click",()=>openDrawer("account"));$("#adviceAction").addEventListener("click",()=>openDrawer(state.player.name?"player":"account"));$("#languageSelect").addEventListener("change",e=>{languageChoice=e.target.value;localStorage.setItem(LANG_KEY,languageChoice);applyLanguage()});
$("#saveProfileBtn").addEventListener("click",async()=>{state.player.name=$("#fName").value.trim();state.player.server_id=$("#fServer").value.trim();state.player.hq_level=Number($("#fHq").value)||null;const ctxAgeRaw=String($("#fAccountAge")?.value??"").trim(),ctxAge=ctxAgeRaw===""?null:Number(ctxAgeRaw);state.player_context={...(state.player_context||{}),objective:$("#fObjective")?.value||"auto",account_age_days:ctxAge!==null&&Number.isFinite(ctxAge)&&ctxAge>=0?Math.round(ctxAge):null,server_profile:$("#fServerProfile")?.value||"auto",updated_at:new Date().toISOString()};const requestedRole=$("#fRole").value.trim().toUpperCase()||"R1",safeRole=safeSelfRole(requestedRole);state.player.role=safeRole;state.alliance.tag=$("#fAlliance").value.trim().toUpperCase();if(!["R4","R5"].includes(normalizedRole(state.alliance.role)))state.alliance.role=safeRole;state.vs.our_alliance=state.alliance.tag;if(["R4","R5"].includes(requestedRole)&&!["R4","R5"].includes(normalizedRole(state.alliance.role))){const el=$("#accountMessage")||$("#authMessage");if(el){el.className="notice warn";el.textContent=managerOnlyMessage()}}saveState();await joinPendingAlliance();closeDrawers()});

async function syncAll(){const btns=[$("#syncAllBtn"),$("#syncPlayerBtn")].filter(Boolean);btns.forEach(b=>{b.disabled=true;b.textContent=t("syncing")});try{const r=await fetch("/api/sync",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({state,locale:lang})});const j=await r.json().catch(()=>({}));if(r.ok&&j.state){state=repairLegacySquadIdentity(mergeState(state,j.state)).state;state.sync={...state.sync,status:"ok",provider:j.provider||state.sync.provider||"warboost-local",provider_kind:j.provider_kind||state.sync.provider_kind||"local",capabilities:j.capabilities||state.sync.capabilities||[],last_sync:j.synced_at||new Date().toISOString(),last_error:null,sources:{...state.sync.sources,...j.sources}};saveState();$("#playerSyncInfo").textContent=(state.sync.sources?.official?t("official_sync_done"):t("public_done"))}else{state.sync.last_error=j.message||j.error||t("hybrid_no_public");state.sync.status="waiting";saveState()}}catch{state.sync.last_error=t("offline_keep");state.sync.status="offline";saveState()}finally{btns.forEach((b,i)=>{b.disabled=false;b.textContent=i===0?t("public_refresh"):t("public_button")})}}
$("#syncAllBtn").addEventListener("click",syncAll);$("#syncPlayerBtn").addEventListener("click",syncAll);
$("#openScanBtn").addEventListener("click",()=>openDrawer("scan"));$("#scanPlayerBtn").addEventListener("click",()=>openDrawer("scan"));$("#scanShopBtn")?.addEventListener("click",()=>{openDrawer("scan");renderScanTypeOptions();if($("#scanType"))$("#scanType").value="shop"});

async function imageToDataUrl(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=2048,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);let data=c.toDataURL("image/jpeg",.9);if(data.length>3900000)data=c.toDataURL("image/jpeg",.78);URL.revokeObjectURL(url);resolve(data)}catch(e){reject(e)}};img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url})}
$("#scanFile").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{scanImageData=await imageToDataUrl(file);$("#scanPreview").src=scanImageData;$("#scanPreview").classList.remove("hidden");$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_ready")}catch{$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_error")}});
$("#analyzeScanBtn").addEventListener("click",async()=>{if(!scanImageData){$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_wait");return}if(!cloudSession?.access_token){openDrawer("account");authMessage(t("connect_pro"));return}const btn=$("#analyzeScanBtn");btn.disabled=true;btn.textContent=t("scan_processing");$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_processing");try{const r=await fetch("/api/scan",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({scan_type:$("#scanType").value,locale:lang,image_data_url:scanImageData,current_state:state})});const j=await r.json().catch(()=>({}));if(r.ok&&j.state){const scanType=$("#scanType").value;const sm=String(scanType||"").match(/^squad([1-4])$/i);let suggestedNames=[],scanSlots=[];if(sm){const idx=Number(sm[1])-1,incomingSq=j.state.squads?.[idx];if(incomingSq?.heroes){scanSlots=Array.from({length:5},(_,i)=>({...((incomingSq.heroes?.[i]&&typeof incomingSq.heroes[i]==="object")?incomingSq.heroes[i]:{})}));suggestedNames=scanSlots.map(h=>String(h?.name||"").trim());delete incomingSq.heroes}}state=repairLegacySquadIdentity(mergeState(state,j.state)).state;if(sm){const staged=state.squads?.[Number(sm[1])-1];if(staged){staged.needs_rescan=true;staged.composition_changed_at=j.scanned_at||new Date().toISOString()}}state.sync.last_scan=j.scanned_at||new Date().toISOString();state.sync.sources={...state.sync.sources,scan:true};saveState();$("#proPriorityPanel")?.classList.add("hidden");$("#playerSyncInfo")?.classList.remove("hidden");if(sm){const count=suggestedNames.filter(Boolean).length;$("#scanStatus").className="notice warn";$("#scanStatus").textContent=count>0?t("hero_auto_recognized",{count}):t("hero_confirm_needed");startHeroConfirmation(Number(sm[1]),suggestedNames,scanSlots)}else{$("#scanStatus").className="notice";$("#scanStatus").textContent=t("scan_saved");closeHeroConfirmation(true)}}else{$("#scanStatus").className="notice warn";$("#scanStatus").textContent=j.code==="SCAN_NOT_CONFIGURED"?t("scan_unconfigured"):(j.message||t("scan_error"))}}catch{$("#scanStatus").className="notice warn";$("#scanStatus").textContent=t("scan_error")}finally{btn.disabled=false;btn.textContent=t("analyze")}});

async function requestAdvice(scope){if(scope==="vs"){state.vs.week=currentVsWeek();state.vs.day=currentVsDay()}try{const r=await fetch("/api/advice",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({scope,state,locale:lang})});const j=await r.json().catch(()=>({}));if(r.ok)return j}catch{}return null}
async function runPlayerAdvice(scrollShop=false){if(!requirePro())return;const buttons=[$("#playerAdviceBtn"),$("#shopAdviceBtn")].filter(Boolean),note=$("#playerSyncInfo"),panel=$("#proPriorityPanel"),labels=buttons.map(b=>b.textContent);buttons.forEach(b=>{b.disabled=true;b.textContent=t("pro_analyzing")});if(note){note.classList.remove("hidden");note.textContent=t("pro_analyzing")}if(panel)panel.classList.add("hidden");const j=await requestAdvice("player");if(j?.analysis){renderProPriority(j.analysis);if(scrollShop)setTimeout(()=>$("#proShopList")?.scrollIntoView({behavior:"smooth",block:"start"}),120)}else if(note)note.textContent=j?.advice||t("player_sync_note");buttons.forEach((b,i)=>{b.disabled=false;b.textContent=labels[i]})}
$("#playerAdviceBtn").addEventListener("click",()=>runPlayerAdvice(false));$("#shopAdviceBtn")?.addEventListener("click",()=>runPlayerAdvice(true));
$("#warPlanBtn").addEventListener("click",async()=>{if(!requirePro())return;if(!isAllianceManager()){$("#warPlanText").textContent=managerOnlyMessage();return}const j=await requestAdvice("alliance");$("#warPlanText").textContent=structuredAdviceText("alliance",j);renderAllianceStructured(j)});$("#vsPlanBtn").addEventListener("click",async()=>{if(!requirePro())return;const j=await requestAdvice("vs");$("#vsPlanText").textContent=structuredAdviceText("vs",j)});$("#seasonAdviceBtn").addEventListener("click",async()=>{if(!requirePro())return;const j=await requestAdvice("season");$("#seasonAdviceText").textContent=structuredAdviceText("season",j)});
async function getAdvice(scope){const j=await requestAdvice(scope);return structuredAdviceText(scope,j)}
$("#rosterImportBtn")?.addEventListener("click",()=>{const status=$("#rosterImportStatus");if(!isAllianceManager()){if(status){status.className="notice warn";status.textContent=managerOnlyMessage()}return}const imported=parseRosterImport($("#rosterImportText")?.value||"");if(!imported.length){if(status){status.className="notice warn";status.textContent=t("import_error")}return}const before=(state.alliance.members||[]).length;state.alliance.members=mergeRosterMembers(state.alliance.members,imported);state.alliance.updated_at=new Date().toISOString();state.sync.sources={...state.sync.sources,alliance:true};saveState();const added=Math.max(0,state.alliance.members.length-before);if(status){status.className="notice";status.textContent=`${imported.length} ${t("import_done")} · +${added}`};if($("#rosterImportText"))$("#rosterImportText").value=""});

$("#shareInviteBtn").addEventListener("click",async()=>{let code=ensureInviteCode();try{const rr=await fetch("/api/invite",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({tag:state.alliance.tag||"WB",name:state.alliance.name||state.alliance.tag||"WarBoost",invite_code:code})});const jj=await rr.json().catch(()=>({}));if(rr.ok&&jj.invite_code){code=jj.invite_code;state.alliance.id=jj.alliance?.id||state.alliance.id;state.alliance.invite_code=code;state.sync.sources={...state.sync.sources,alliance:true};saveState()}}catch{}const url=`${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`,text=`WarBoost · ${code}`;try{if(navigator.share)await navigator.share({title:`WarBoost · ${t("alliance")}`,text,url});else{await navigator.clipboard.writeText(`${text}\n${url}`);$("#shareInviteBtn").textContent=t("copy");setTimeout(()=>$("#shareInviteBtn").textContent=t("share"),1400)}}catch{}});
async function joinPendingAlliance(){const code=String(state.alliance.invite_code||"").trim();if(!code||!state.player.name||!cloudSession?.access_token)return;try{const r=await fetch("/api/join",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({invite_code:code})});const j=await r.json().catch(()=>({}));if(r.ok&&j.alliance){state.alliance.id=j.alliance.id||state.alliance.id;state.alliance.tag=j.alliance.tag||state.alliance.tag;state.alliance.name=j.alliance.name||state.alliance.name;state.vs.our_alliance=state.alliance.tag;state.sync.sources={...state.sync.sources,alliance:true};saveState()}}catch{}}
function handleJoinLink(){const code=new URLSearchParams(location.search).get("join");if(!code)return;state.alliance.invite_code=code.toUpperCase();localStorage.setItem(STORE_KEY,JSON.stringify(state));setTimeout(()=>openDrawer("account"),500)}

function formatProPrice(plan){if(!plan?.amount)return "PRO";try{const value=new Intl.NumberFormat(locale,{style:"currency",currency:String(plan.currency||"eur").toUpperCase()}).format(Number(plan.amount)/100),period=plan.interval==="year"?t("per_year"):plan.interval==="month"?t("per_month"):"";return `${value}${period}`}catch{return "PRO"}}
function proMessage(text,ok=false){const el=$("#proMessage");if(!el)return;el.className=`notice${ok?"":" warn"}`;el.textContent=text}
function renderPro(){const pill=$("#proPill"),btn=$("#proActionBtn"),title=$("#proTitle"),price=$("#proPrice");if(!pill||!btn)return;const logged=Boolean(cloudSession?.user);pill.textContent=proState.active?"PRO":t("free");pill.classList.toggle("active",proState.active);title.textContent=proState.active?t("pro_active"):t("upgrade");if(!logged){price.textContent=t("connect_for_pro");btn.textContent=t("login");btn.disabled=false;return}if(!proState.configured){price.textContent=t("pro_config");btn.textContent=t("pro_soon");btn.disabled=true;return}const formatted=formatProPrice(proState.plan);price.textContent=proState.active?t("subscription_active",{price:formatted}):formatted;btn.textContent=proState.active?t("manage_subscription"):t("go_pro");btn.disabled=false}
async function refreshPro(){if(!cloudSession?.access_token){proState={active:false,status:"free",configured:false,plan:null};renderPro();return}try{const r=await fetch("/api/pro",{cache:"no-store",headers:authHeaders()});const j=await r.json().catch(()=>({}));if(r.ok)proState={active:Boolean(j.active),status:j.status||"free",configured:Boolean(j.configured),plan:j.plan||null};else proState={active:false,status:"free",configured:false,plan:null}}catch{proState={active:false,status:"free",configured:false,plan:null}}renderPro()}
function requirePro(){if(proState.active)return true;openDrawer("account");setTimeout(()=>$("#proSection")?.scrollIntoView({behavior:"smooth",block:"center"}),160);proMessage(cloudSession?.user?t("pro_required"):t("connect_pro"));return false}
async function openProAction(){if(!cloudSession?.access_token){proMessage(t("connect_for_pro"));$("#authEmail")?.focus();return}const btn=$("#proActionBtn");if(!proState.configured){proMessage(t("pro_config"));return}btn.disabled=true;const original=btn.textContent;btn.textContent="…";try{const action=proState.active?"portal":"checkout",r=await fetch(`/api/pro?action=${action}`,{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify({action})}),j=await r.json().catch(()=>({}));if(!r.ok||!j.url)throw new Error(j.message||"Stripe");location.href=j.url}catch(e){proMessage(e.message||"Stripe");btn.disabled=false;btn.textContent=original}}
$("#voiceEnabled")?.addEventListener("change",e=>{localStorage.setItem(VOICE_ENABLED_KEY,e.target.checked?"1":"0");renderVoiceSettings()});
$("#voiceSelect")?.addEventListener("change",e=>{localStorage.setItem(VOICE_ID_KEY,e.target.value||"");refreshVoices()});
$("#voiceTestBtn")?.addEventListener("click",()=>speakGreeting("test",true));
if("speechSynthesis" in window){window.speechSynthesis.addEventListener?.("voiceschanged",refreshVoices);setTimeout(refreshVoices,100)}
$("#proActionBtn")?.addEventListener("click",openProAction);const proReturn=new URLSearchParams(location.search).get("pro");if(proReturn){setTimeout(()=>{openDrawer("account");if(proReturn==="success")setTimeout(refreshPro,900)},500);history.replaceState({},"",location.pathname)}

$("#loginBtn")?.addEventListener("click",async()=>{if(!cloud)return authMessage(t("auth_cloud_missing"));const email=$("#authEmail").value.trim().toLowerCase(),password=$("#authPassword").value,{error}=await cloud.auth.signInWithPassword({email,password});if(error)return authMessage(error.message);authMessage(t("auth_success"),true)});
$("#signupBtn")?.addEventListener("click",async()=>{if(!cloud)return authMessage(t("auth_cloud_missing"));const email=$("#authEmail").value.trim().toLowerCase(),password=$("#authPassword").value;if(!email||password.length<6)return authMessage(t("auth_invalid"));const {error}=await cloud.auth.signUp({email,password});if(error)return authMessage(error.message);localStorage.setItem("warboost_v1_pending_email",email);$("#otpBox").classList.remove("hidden");authMessage(t("signup_sent"),true)});
$("#verifyOtpBtn")?.addEventListener("click",async()=>{if(!cloud)return;const email=localStorage.getItem("warboost_v1_pending_email")||$("#authEmail").value.trim().toLowerCase(),token=$("#authOtp").value.replace(/\D/g,"");if(token.length<6||token.length>8)return authMessage(t("otp_full"));const {error}=await cloud.auth.verifyOtp({email,token,type:"email"});if(error)return authMessage(error.message);localStorage.removeItem("warboost_v1_pending_email");authMessage(t("email_confirmed"),true)});
$("#logoutBtn")?.addEventListener("click",async()=>{if(cloud)await cloud.auth.signOut();cloudSession=null;state.player_id=clientId();renderAuth()});

document.addEventListener("click",e=>{const btn=e.target.closest?.("[data-inline-hero-save]");if(!btn)return;e.preventDefault();e.stopPropagation();const container=btn.closest?.("[data-inline-confirm]");saveInlineHeroNames(btn.dataset.inlineHeroSave,container,btn)});
document.addEventListener("click",e=>{const btn=e.target.closest?.(".heroConfirmAction[data-hero-confirm]");if(!btn)return;e.preventDefault();e.stopPropagation();startHeroConfirmation(btn.dataset.heroConfirm)});
$("#saveHeroNamesBtn")?.addEventListener("click",saveHeroConfirmation);$("#skipHeroNamesBtn")?.addEventListener("click",skipHeroConfirmation);
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
handleJoinLink();applyLanguage();refreshServerTime();pullServerState();initCloudAuth();render();renderAuth();
