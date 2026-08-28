import {canonicalHeroName,isGenericHeroName} from "./heroes.js";

const HERO_FIELDS=["level","stars","power","exclusive","gear","awakening"];
const SOURCE_RANK={
  exclusive_weapon:100,
  confirmed_scan:95,
  hero_progression:90,
  history_snapshot:80,
  previous_profile:78,
  history_profile:76,
  history_squad:72,
  legacy_imported_player:74,
  legacy_profile:52,
  squad:50,
  unknown:1
};

function clone(x){return x==null?x:JSON.parse(JSON.stringify(x));}
function known(v){return !(v===null||v===undefined||v===""||(Array.isArray(v)&&v.length===0));}
function heroName(v){const n=canonicalHeroName(v);return n&&!isGenericHeroName(n)?n:"";}
function heroKey(v){return heroName(v).toLowerCase();}
function stamp(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
function sourceRank(v){return SOURCE_RANK[String(v||"unknown")]||0;}
function same(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null);}
function blankProfile(name){return {hero_name:heroName(name),level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null,updated_at:null,field_updated_at:{},field_source:{}};}
function candidateValueKey(v){return typeof v==="object"?JSON.stringify(v):String(v);}
function normalizePlayerName(v){return String(v||"").trim().toLocaleLowerCase().replace(/\s+/g," ");}
function fieldValue(raw,field){
  if(field==="exclusive")return raw?.exclusive??raw?.exclusive_weapon??raw?.weapon_level??null;
  if(field==="gear")return raw?.gear??raw?.gear_average??raw?.equipment_level??null;
  if(field==="awakening")return raw?.awakening??null;
  return raw?.[field]??null;
}
function candidateMeta({source="unknown",updatedAt=null,origin=null}={}){return {source,updated_at:updatedAt||null,origin:origin||source,rank:sourceRank(source)};}
function addCandidate(map,name,raw,meta={}){
  const canonical=heroName(name||raw?.hero_name||raw?.name);if(!canonical)return;
  const key=heroKey(canonical);if(!map.has(key))map.set(key,{hero_name:canonical,fields:{}});
  const entry=map.get(key);entry.hero_name=canonical;
  for(const field of HERO_FIELDS){
    const value=fieldValue(raw,field);if(!known(value))continue;
    const updatedAt=raw?.field_updated_at?.[field]||raw?.updated_at||meta.updatedAt||null;
    const source=raw?.field_source?.[field]||meta.source||"unknown";
    const item={value:clone(value),updated_at:updatedAt,source,origin:meta.origin||source,rank:sourceRank(source)};
    (entry.fields[field]||(entry.fields[field]=[])).push(item);
  }
}
function collectStateCandidates(map,state,{capturedAt=null,source="history_snapshot",origin=null}={}){
  if(!state||typeof state!=="object")return;
  for(const p of Array.isArray(state.hero_profiles)?state.hero_profiles:[])addCandidate(map,p?.hero_name||p?.name,p,{updatedAt:capturedAt,source:source==="history_snapshot"?"history_profile":source,origin});
  for(const h of Array.isArray(state.hero_progression)?state.hero_progression:[])addCandidate(map,h?.hero_name||h?.name,{stars:h?.stars,exclusive:h?.exclusive,awakening:h?.awakening,updated_at:h?.updated_at},{updatedAt:capturedAt,source:"hero_progression",origin});
  for(const w of Array.isArray(state.exclusive_weapons)?state.exclusive_weapons:[])addCandidate(map,w?.hero_name,{exclusive:w?.level,updated_at:w?.updated_at},{updatedAt:capturedAt,source:"exclusive_weapon",origin});
  for(const sq of Array.isArray(state.squads)?state.squads:[]){
    // A squad explicitly marked for rescan is not reliable enough to restore per-hero fields.
    if(sq?.needs_rescan===true)continue;
    const at=sq?.updated_at||capturedAt||state?.updated_at||null;
    for(const h of Array.isArray(sq?.heroes)?sq.heroes:[])addCandidate(map,h?.name,h,{updatedAt:at,source:source==="previous_profile"?"previous_profile":"history_squad",origin});
  }
}
function collectLegacyProfile(map,profile={}){
  for(let i=1;i<=5;i++){
    const name=heroName(profile?.[`heroName${i}`]);if(!name)continue;
    addCandidate(map,name,{level:profile?.[`heroLevel${i}`],stars:profile?.[`heroStars${i}`],exclusive:profile?.[`heroWeapon${i}`],gear:profile?.[`heroGear${i}`]},{source:"legacy_profile",updatedAt:null,origin:"wb10_profile"});
  }
}
function collectLegacyImportedPlayers(map,players=[],currentPlayerName=""){
  const wanted=normalizePlayerName(currentPlayerName);if(!wanted)return;
  for(const raw of Array.isArray(players)?players:[]){
    const p=raw?.player&&typeof raw.player==="object"?raw.player:raw;
    if(normalizePlayerName(p?.name)!==wanted)continue;
    const at=p?.imported_at||raw?.imported_at||null;
    for(const sq of Array.isArray(p?.squads)?p.squads:[]){
      for(const h of Array.isArray(sq?.heroes)?sq.heroes:[])addCandidate(map,h?.name,{level:h?.level,stars:h?.stars,power:h?.power??h?.power_m,exclusive:h?.exclusive??h?.exclusive_weapon,gear:h?.gear??h?.gear_average,awakening:h?.awakening,updated_at:h?.updated_at||at},{source:"legacy_imported_player",updatedAt:at,origin:"wb19_imported_players"});
    }
  }
}
function candidateOrder(a,b){return b.rank-a.rank||stamp(b.updated_at)-stamp(a.updated_at);}
function chooseCandidate(items=[]){
  const list=items.filter(x=>known(x?.value)).sort(candidateOrder);if(!list.length)return {chosen:null,conflict:false};
  const top=list[0],topTime=stamp(top.updated_at),sameTop=list.filter(x=>x.rank===top.rank&&stamp(x.updated_at)===topTime);
  const values=new Set(sameTop.map(x=>candidateValueKey(x.value)));
  if(values.size>1)return {chosen:null,conflict:true,candidates:sameTop};
  // Slot-era sources are intentionally conservative. A historical squad row or wb10_profile
  // can have been affected by the old slot carry-over bug. Never restore it alone.
  if(top.rank<=SOURCE_RANK.history_squad){
    const sameValue=list.filter(x=>candidateValueKey(x.value)===candidateValueKey(top.value));
    const independent=new Set(sameValue.map(x=>`${x.origin||x.source}|${x.updated_at||"undated"}`));
    const hasTrustedCorroboration=sameValue.some(x=>x.rank>SOURCE_RANK.history_squad);
    if(!hasTrustedCorroboration&&independent.size<2)return {chosen:null,conflict:false,needs_corroboration:true,candidates:sameValue};
  }
  return {chosen:top,conflict:false};
}
function currentProfileMap(state={}){
  const map=new Map();
  for(const raw of Array.isArray(state.hero_profiles)?state.hero_profiles:[]){const name=heroName(raw?.hero_name||raw?.name);if(!name)continue;const p={...blankProfile(name),...clone(raw),hero_name:name,field_updated_at:{...(raw?.field_updated_at||{})},field_source:{...(raw?.field_source||{})}};map.set(heroKey(name),p);}
  // Current same-hero data always wins over history. Seed missing profile fields from live state.
  for(const sq of Array.isArray(state.squads)?state.squads:[]){for(const h of Array.isArray(sq?.heroes)?sq.heroes:[]){const name=heroName(h?.name);if(!name)continue;const key=heroKey(name),p=map.get(key)||blankProfile(name),at=sq?.updated_at||state?.updated_at||null;for(const f of HERO_FIELDS){const v=fieldValue(h,f);if(known(v)&&!known(p[f])){p[f]=clone(v);p.field_updated_at[f]=at;p.field_source[f]="squad";}}map.set(key,p);}}
  for(const h of Array.isArray(state.hero_progression)?state.hero_progression:[]){const name=heroName(h?.hero_name||h?.name);if(!name)continue;const key=heroKey(name),p=map.get(key)||blankProfile(name),at=h?.updated_at||state?.updated_at||null;for(const f of ["stars","exclusive","awakening"]){const v=fieldValue(h,f);if(known(v)&&!known(p[f])){p[f]=clone(v);p.field_updated_at[f]=at;p.field_source[f]="hero_progression";}}map.set(key,p);}
  for(const w of Array.isArray(state.exclusive_weapons)?state.exclusive_weapons:[]){const name=heroName(w?.hero_name);if(!name||!known(w?.level))continue;const key=heroKey(name),p=map.get(key)||blankProfile(name);if(!known(p.exclusive)){p.exclusive=clone(w.level);p.field_updated_at.exclusive=w?.updated_at||state?.updated_at||null;p.field_source.exclusive="exclusive_weapon";}map.set(key,p);}
  return map;
}
function profileArray(map){return [...map.values()].filter(x=>x.hero_name).sort((a,b)=>a.hero_name.localeCompare(b.hero_name)).slice(0,40);}
function overlayProfilesToSquads(state,map){let changed=false;for(const sq of state?.squads||[]){for(const h of sq?.heroes||[]){const key=heroKey(h?.name),p=map.get(key);if(!key||!p)continue;for(const f of HERO_FIELDS){if(!known(h?.[f])&&known(p?.[f])){h[f]=clone(p[f]);changed=true;}}}}return changed;}

/**
 * Recover missing hero progression by canonical hero identity only.
 * Current known values are never overwritten. Historical data can only fill blanks.
 * If equally recent/equally trusted history conflicts, the field remains unknown.
 */
export function recoverHeroData(input,{historicalStates=[],legacyProfile=null,legacyImportedPlayers=[],currentPlayerName=null,now=new Date().toISOString()}={}){
  const state=clone(input)||{},before=JSON.stringify({hero_profiles:state.hero_profiles||[],squads:state.squads||[]});
  const profileMap=currentProfileMap(state),candidates=new Map(),sources=new Set(),conflicts=[];let recoveredFields=0;
  for(const item of Array.isArray(historicalStates)?historicalStates:[]){const hist=item?.state&&typeof item.state==="object"?item.state:item;const source=item?.source==="previous_profile"?"previous_profile":"history_snapshot";collectStateCandidates(candidates,hist,{capturedAt:item?.captured_at||item?.updated_at||hist?.updated_at||null,source,origin:item?.source||"wb1_snapshots"});sources.add(item?.source||"wb1_snapshots");}
  if(legacyProfile&&typeof legacyProfile==="object"){collectLegacyProfile(candidates,legacyProfile);sources.add("wb10_profile");}
  if(Array.isArray(legacyImportedPlayers)&&legacyImportedPlayers.length){collectLegacyImportedPlayers(candidates,legacyImportedPlayers,currentPlayerName||state?.player?.name||"");sources.add("wb19_imported_players");}

  for(const [key,entry] of candidates){
    let p=profileMap.get(key)||blankProfile(entry.hero_name),touched=false;
    for(const field of HERO_FIELDS){if(known(p?.[field]))continue;const result=chooseCandidate(entry.fields?.[field]||[]);if(result.conflict){conflicts.push({hero:entry.hero_name,field,reason:"equal_trust_conflict",sources:(result.candidates||[]).map(x=>x.origin||x.source)});continue;}if(result.needs_corroboration){conflicts.push({hero:entry.hero_name,field,reason:"low_trust_needs_corroboration",sources:(result.candidates||[]).map(x=>x.origin||x.source)});continue;}const c=result.chosen;if(!c)continue;p[field]=clone(c.value);p.field_updated_at={...(p.field_updated_at||{}),[field]:c.updated_at||null};p.field_source={...(p.field_source||{}),[field]:c.source||"history_snapshot"};if(stamp(c.updated_at)>=stamp(p.updated_at))p.updated_at=c.updated_at||p.updated_at||null;recoveredFields++;touched=true;}
    if(touched||!profileMap.has(key))profileMap.set(key,p);
  }
  state.hero_profiles=profileArray(profileMap);
  const overlaid=overlayProfilesToSquads(state,profileMap);
  const after=JSON.stringify({hero_profiles:state.hero_profiles||[],squads:state.squads||[]}),changed=before!==after;
  if(changed){state.updated_at=state.updated_at||now;state.migration={...(state.migration||{}),hero_history_recovery_at:now,hero_history_model:"identity-only-v2.5.0",hero_history_recovered_fields:Number(state.migration?.hero_history_recovered_fields||0)+recoveredFields};}
  return {state,changed,recovered_fields:recoveredFields,recovered_heroes:[...new Set(state.hero_profiles.filter(p=>Object.values(p.field_source||{}).some(s=>["history_profile","history_squad","previous_profile","legacy_profile","legacy_imported_player","exclusive_weapon","hero_progression"].includes(s))).map(p=>p.hero_name))],conflicts,sources:[...sources],overlaid};
}

export function heroDataSignature(state={}){
  const cleanHero=h=>({name:heroName(h?.name),level:h?.level??null,stars:h?.stars??null,power:h?.power??null,exclusive:h?.exclusive??null,gear:h?.gear??null,awakening:h?.awakening??null});
  const squads=(state?.squads||[]).map(sq=>({id:sq?.id,power:sq?.power??null,heroes:(sq?.heroes||[]).map(cleanHero)}));
  const profiles=(state?.hero_profiles||[]).map(p=>({hero_name:heroName(p?.hero_name||p?.name),level:p?.level??null,stars:p?.stars??null,power:p?.power??null,exclusive:p?.exclusive??null,gear:p?.gear??null,awakening:p?.awakening??null})).sort((a,b)=>a.hero_name.localeCompare(b.hero_name));
  const progression=(state?.hero_progression||[]).map(h=>({hero_name:heroName(h?.hero_name||h?.name),stars:h?.stars??null,exclusive:h?.exclusive??null,awakening:h?.awakening??null})).sort((a,b)=>a.hero_name.localeCompare(b.hero_name));
  const weapons=(state?.exclusive_weapons||[]).map(w=>({hero_name:heroName(w?.hero_name),level:w?.level??null})).sort((a,b)=>a.hero_name.localeCompare(b.hero_name));
  return JSON.stringify({squads,profiles,progression,weapons});
}

export const HERO_HISTORY_SOURCE_RANK={...SOURCE_RANK};
