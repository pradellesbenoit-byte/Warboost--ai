import {canonicalHeroName,isGenericHeroName} from "./heroes.js";
import {sanitizeGear} from "./gear.js";
import {confirmedHeroPower,heroPowerIsConfirmed} from "./hero-power.js";

const HERO_FIELDS=["level","stars","power","exclusive","gear","awakening"];
const SOURCE_RANK={exclusive_weapon:7,hero_progression:6,confirmed_scan:5,confirmed_manual:4,history_scan:4,progression_snapshot:3,squad:3,migration:2,unknown:1};
const HERO_SLOT_COUNT=5;

function clone(x){return JSON.parse(JSON.stringify(x??null));}
function heroName(v){const n=canonicalHeroName(v);return n&&!isGenericHeroName(n)?n:"";}
function heroKey(v){return heroName(v).toLowerCase();}
function known(v){return !(v===null||v===undefined||v==="");}
function knownHeroField(field,value){return field==="power"?heroPowerIsConfirmed(value):known(value);}
function blankHero(){return {name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null};}
function blankSquad(id){return {id,name:`Squad ${id}`,power:null,updated_at:null,needs_rescan:false,composition_changed_at:null,composition_confirmed_at:null,composition_source:null,confirmed_composition:Array.from({length:HERO_SLOT_COUNT},()=>""),composition_conflict:null,heroes:Array.from({length:HERO_SLOT_COUNT},blankHero)};}
function timestamp(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
function detailScore(h={}){return HERO_FIELDS.reduce((sum,k)=>sum+(knownHeroField(k,h?.[k])?1:0),0);}
function mergeKnown(base={},extra={}){const out={...clone(base)};for(const k of HERO_FIELDS){if(knownHeroField(k,extra?.[k]))out[k]=clone(extra[k]);}return out;}
function sourceRank(v){return SOURCE_RANK[String(v||"unknown")]||0;}
function recordUpdatedAt(record={}){return record.updated_at||null;}
function fieldTime(record={},field){return record?.field_updated_at?.[field]||recordUpdatedAt(record)||null;}
function fieldSource(record={},field){return record?.field_source?.[field]||record?.source||"unknown";}
function completeComposition(names=[]){return Array.isArray(names)&&names.length===HERO_SLOT_COUNT&&names.every(Boolean)&&new Set(names.map(x=>String(x).toLowerCase())).size===HERO_SLOT_COUNT;}
function normalizedComposition(value){return Array.from({length:HERO_SLOT_COUNT},(_,i)=>heroName(Array.isArray(value)?value[i]:""));}
function heroDetailScore(h={}){return HERO_FIELDS.reduce((sum,k)=>sum+(knownHeroField(k,h?.[k])?1:0),0);}

/** Always return five materialized hero objects; never preserve a sparse array. */
export function fixedHeroSlots(rows=[]){
  const source=Array.isArray(rows)?rows:[];
  return Array.from({length:HERO_SLOT_COUNT},(_,i)=>{
    const raw=source[i]&&typeof source[i]==="object"?source[i]:{};
    return {...blankHero(),...clone(raw),name:heroName(raw.name)};
  });
}

/**
 * Normalize one squad around its last confirmed composition.
 * A scan may stage new slot data, but it cannot change the persisted composition.
 * Legacy complete five-name squads are backfilled only when they are not marked as
 * needing confirmation; partial/sparse legacy data stays positional and asks for review.
 */
export function normalizeSquadSlots(input={},id=input?.id||1,{inferLegacy=true}={}){
  const squad={...input,id:Number(id)||1};
  const source=fixedHeroSlots(input?.heroes);
  const explicit=normalizedComposition(input?.confirmed_composition);
  const hasExplicit=completeComposition(explicit);
  const slotNames=source.map(h=>heroName(h.name));
  const inferred=!hasExplicit&&inferLegacy&&input?.needs_rescan!==true&&completeComposition(slotNames)?slotNames:null;
  const composition=hasExplicit?explicit:(inferred||explicit);
  const heroes=Array.from({length:HERO_SLOT_COUNT},(_,i)=>{
    const confirmedName=composition[i]||"";
    if(!confirmedName)return {...source[i],name:heroName(source[i]?.name)};
    const matches=source.filter(h=>heroName(h?.name).toLowerCase()===confirmedName.toLowerCase());
    const matched=[...matches].sort((a,b)=>heroDetailScore(b)-heroDetailScore(a))[0];
    return {...blankHero(),...(matched||{}),name:confirmedName};
  });
  return {
    ...squad,
    id:Number(id)||1,
    name:`Squad ${Number(id)||1}`,
    confirmed_composition:composition,
    composition_confirmed_at:input?.composition_confirmed_at||((hasExplicit||inferred)&&input?.updated_at?input.updated_at:null),
    composition_source:input?.composition_source||(hasExplicit?"manual_confirmation":inferred?"legacy_backfill":null),
    composition_conflict:input?.composition_conflict&&typeof input.composition_conflict==="object"?clone(input.composition_conflict):null,
    heroes
  };
}

export function confirmedCompositionForSquad(input={}){
  const normalized=normalizedComposition(input?.confirmed_composition);
  return completeComposition(normalized)?normalized:null;
}
function profileHero(record){const out=blankHero();out.name=heroName(record?.hero_name||record?.name);for(const f of HERO_FIELDS)if(knownHeroField(f,record?.[f]))out[f]=clone(record[f]);return out;}
function emptyProfile(name){return {hero_name:heroName(name),level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null,updated_at:null,field_updated_at:{},field_source:{}};}
function mergeProfileField(record,field,value,{updatedAt=null,source="unknown",force=false}={}){
  if(!knownHeroField(field,value))return false;
  const curKnown=knownHeroField(field,record?.[field]),curTime=timestamp(fieldTime(record,field)),nextTime=timestamp(updatedAt),curRank=sourceRank(fieldSource(record,field)),nextRank=sourceRank(source);
  const should=force||!curKnown||nextTime>curTime||(nextTime===curTime&&nextRank>curRank);
  if(!should)return false;
  record[field]=clone(value);
  record.field_updated_at={...(record.field_updated_at||{}),[field]:updatedAt||record.field_updated_at?.[field]||record.updated_at||null};
  record.field_source={...(record.field_source||{}),[field]:source};
  const best=timestamp(record.updated_at)>=nextTime?record.updated_at:updatedAt;
  record.updated_at=best||record.updated_at||null;
  return true;
}
function mergeProfileRecord(map,name,hero={},meta={}){
  const key=heroKey(name);if(!key)return false;
  const current=map.get(key)||emptyProfile(name);let changed=!map.has(key);
  current.hero_name=heroName(name);
  for(const field of HERO_FIELDS){if(mergeProfileField(current,field,hero?.[field],meta))changed=true;}
  map.set(key,current);return changed;
}
function ingestExistingProfiles(map,state){
  for(const raw of Array.isArray(state?.hero_profiles)?state.hero_profiles:[]){
    const name=heroName(raw?.hero_name||raw?.name);if(!name)continue;
    const key=heroKey(name),record=emptyProfile(name);record.updated_at=raw?.updated_at||null;record.field_updated_at={...(raw?.field_updated_at||{})};record.field_source={...(raw?.field_source||{}) };
    for(const f of HERO_FIELDS)if(knownHeroField(f,raw?.[f]))record[f]=clone(raw[f]);map.set(key,record);
  }
}
function buildProfileMap(state,{includeSquads=true}={}){
  const map=new Map();ingestExistingProfiles(map,state);
  if(includeSquads){
    for(const sq of state?.squads||[]){const at=sq?.updated_at||state?.updated_at||null;for(const h of sq?.heroes||[]){const name=heroName(h?.name);if(name)mergeProfileRecord(map,name,h,{updatedAt:at,source:"squad"});}}
  }
  for(const h of Array.isArray(state?.hero_progression)?state.hero_progression:[]){const name=heroName(h?.hero_name||h?.name);if(!name)continue;const at=h?.updated_at||state?.updated_at||null;mergeProfileRecord(map,name,{stars:h?.stars,exclusive:h?.exclusive,awakening:h?.awakening},{updatedAt:at,source:"hero_progression"});}
  for(const w of Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[]){const name=heroName(w?.hero_name);if(!name)continue;const at=w?.updated_at||state?.updated_at||null;mergeProfileRecord(map,name,{power:w?.power,exclusive:w?.level},{updatedAt:at,source:"exclusive_weapon"});}
  return map;
}
function profileArray(map){return [...map.values()].map(r=>({...r,hero_name:heroName(r.hero_name)})).filter(r=>r.hero_name).sort((a,b)=>a.hero_name.localeCompare(b.hero_name)).slice(0,40);}
function sameJson(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null);}
function syncProfiles(out,{includeSquads=true}={}){const before=clone(out.hero_profiles||[]),map=buildProfileMap(out,{includeSquads});out.hero_profiles=profileArray(map);return {map,changed:!sameJson(before,out.hero_profiles)};}
function powerCandidateIsNewer(next,current){const nextAt=timestamp(next?.updated_at),currentAt=timestamp(current?.updated_at);if(nextAt!==currentAt)return nextAt>currentAt;return sourceRank(next?.source)>sourceRank(current?.source);}
function confirmedSnapshotPower(value,key="power"){
  if(String(key).endsWith("_m")){const millions=Number(String(value??"").replace(",","."));return Number.isFinite(millions)&&millions>0?millions*1_000_000:null;}
  return confirmedHeroPower(value);
}
function collectNestedHeroPowerCandidates(candidates,root,inheritedAt=null,source="history_scan",depth=0){
  if(!root||typeof root!=="object"||depth>6)return;
  const add=(name,value,updatedAt,powerKey="power")=>{
    const key=heroKey(name),power=confirmedSnapshotPower(value,powerKey);if(!key||power===null)return;
    const candidate={name:heroName(name),power,updated_at:updatedAt||null,source};
    const current=candidates.get(key);
    if(!current||powerCandidateIsNewer(candidate,current))candidates.set(key,candidate);
  };
  const at=root?.field_updated_at?.power||root?.power_updated_at||root?.updated_at||root?.captured_at||root?.scanned_at||root?.at||inheritedAt||null;
  const name=root?.hero_name||root?.hero?.name||(depth>0?root?.name:null);
  const powerKey=root?.power!==undefined?"power":root?.power_m!==undefined?"power_m":root?.hero_power!==undefined?"hero_power":"hero_power_m";
  const power=root?.[powerKey];
  if(name!==undefined&&power!==undefined)add(name,power,at,powerKey);
  for(const [key,value] of Object.entries(root)){
    if(!["hero_powers","hero_profiles","hero_progression","heroes","squads","state","data","result","scan","payload","profile","history"].includes(key))continue;
    if(Array.isArray(value))for(const item of value)collectNestedHeroPowerCandidates(candidates,item,at,source,depth+1);
    else if(value&&typeof value==="object")collectNestedHeroPowerCandidates(candidates,value,at,source,depth+1);
  }
}
/**
 * Restore a confirmed identity power into empty squad slots without touching any
 * other hero attribute. Positive slot values always win during passive backfill;
 * explicit confirmed scans update the slot before calling this helper.
 */
export function backfillConfirmedHeroPowers(input,{now=null}={}){
  const out=ensureShape(input),candidates=new Map(),add=(name,value,updatedAt,source,valueKey="power")=>{
    const key=heroKey(name),power=confirmedSnapshotPower(value,valueKey);if(!key||power===null)return;
    const candidate={name:heroName(name),power,updated_at:updatedAt||null,source:source||"unknown"},current=candidates.get(key);
    if(!current||powerCandidateIsNewer(candidate,current))candidates.set(key,candidate);
  };
  const sourceTime=(raw,fallback=null)=>raw?.field_updated_at?.power||raw?.power_updated_at||raw?.updated_at||raw?.captured_at||raw?.scanned_at||raw?.at||fallback||null;
  for(const squad of out.squads)for(const raw of squad.heroes||[])add(raw?.name,raw?.power,sourceTime(raw,squad?.updated_at||out.updated_at),"squad");
  for(const raw of Array.isArray(out.hero_profiles)?out.hero_profiles:[]){
    add(raw?.hero_name||raw?.name,raw?.power,sourceTime(raw,out.updated_at),raw?.field_source?.power||"confirmed_scan");
    for(const history of [raw?.power_history,raw?.powerHistory,raw?.history])for(const item of Array.isArray(history)?history:[]){
      const powerKey=item?.power!==undefined?"power":item?.power_m!==undefined?"power_m":"hero_power";
      add(raw?.hero_name||raw?.name,item?.[powerKey],sourceTime(item,sourceTime(raw,out.updated_at)),"history_scan",powerKey);
    }
  }
  for(const raw of Array.isArray(out.exclusive_weapons)?out.exclusive_weapons:[])add(raw?.hero_name,raw?.power,sourceTime(raw,out.updated_at),"exclusive_weapon");
  for(const raw of Array.isArray(out.hero_progression)?out.hero_progression:[]){
    const powerKey=raw?.power!==undefined?"power":raw?.power_m!==undefined?"power_m":"hero_power";
    add(raw?.hero_name||raw?.name,raw?.[powerKey],sourceTime(raw,out.updated_at),"hero_progression",powerKey);
  }
  for(const raw of Array.isArray(out.progression_snapshots)?out.progression_snapshots:[]){
    for(const item of Array.isArray(raw?.hero_powers)?raw.hero_powers:[]){
      const powerKey=item?.power!==undefined?"power":item?.power_m!==undefined?"power_m":"hero_power";
      add(item?.hero_name||item?.name,item?.[powerKey],sourceTime(item,raw?.at||raw?.updated_at||out.updated_at),"progression_snapshot",powerKey);
    }
    collectNestedHeroPowerCandidates(candidates,raw,raw?.at||raw?.updated_at||out.updated_at,"progression_snapshot");
  }
  for(const key of ["scan_history","scanHistory","hero_scan_history","scan_snapshots","historical_states","hero_history"]){
    for(const item of Array.isArray(out?.[key])?out[key]:[])collectNestedHeroPowerCandidates(candidates,item,item?.captured_at||item?.updated_at||out.updated_at,"history_scan");
  }
  if(!candidates.size)return {state:out,changed:false,updated_heroes:[]};
  const profileMap=buildProfileMap(out,{includeSquads:true}),updated=[];let profileChanged=false;
  for(const candidate of candidates.values())profileChanged=mergeProfileRecord(profileMap,candidate.name,{power:candidate.power},{updatedAt:candidate.updated_at||now,source:candidate.source})||profileChanged;
  for(const squad of out.squads)for(const hero of squad.heroes){
    const candidate=candidates.get(heroKey(hero?.name));
    if(!candidate||heroPowerIsConfirmed(hero?.power))continue;
    hero.power=candidate.power;updated.push(candidate.name);
  }
  out.hero_profiles=profileArray(profileMap);
  const changed=updated.length>0||profileChanged;
  if(changed&&now)out.updated_at=now;
  return {state:out,changed,updated_heroes:[...new Set([...updated,...(profileChanged?[...candidates.values()].map(x=>x.name):[])])]};
}
function globalHeroOverlay(state,name,base={}){
  const map=buildProfileMap(state),record=map.get(heroKey(name));
  return record?{...profileHero(record),...mergeKnown(profileHero(record),base),name:heroName(name)}:{...clone(base),name:heroName(name)};
}
function occurrences(state){
  const map=new Map();
  (state?.squads||[]).forEach((sq,si)=>(sq?.heroes||[]).forEach((h,hi)=>{const key=heroKey(h?.name);if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push({si,hi,sq,h:clone(h),updated_at:sq?.updated_at||null});}));
  return map;
}
function preferredOccurrence(rows=[],preferredSquadId=null){if(preferredSquadId){const hit=rows.find(x=>x.si===Number(preferredSquadId)-1);if(hit)return hit;}return [...rows].sort((a,b)=>timestamp(b.updated_at)-timestamp(a.updated_at)||detailScore(b.h)-detailScore(a.h))[0]||null;}
function donorOccurrence(rows=[],keeper=null){const others=rows.filter(x=>x!==keeper);return [...others].sort((a,b)=>detailScore(b.h)-detailScore(a.h)||timestamp(a.updated_at)-timestamp(b.updated_at))[0]||keeper||null;}
function ensureShape(input={}){
  const out=clone(input)||{};
  out.hero_profiles=Array.isArray(out.hero_profiles)?out.hero_profiles:[];
  out.squads=Array.from({length:4},(_,i)=>{
    const sq=out.squads?.[i]||blankSquad(i+1);
    return normalizeSquadSlots({...sq,needs_rescan:sq?.needs_rescan===true,composition_changed_at:sq?.composition_changed_at||null},i+1,{inferLegacy:true});
  });
  return out;
}
function clearOccurrence(out,row,now){const sq=out.squads?.[row.si];if(!sq)return;sq.heroes[row.hi]=blankHero();sq.needs_rescan=true;sq.composition_changed_at=now;}
function enforceUnique(out,{now=new Date().toISOString()}={}){
  const map=occurrences(out);let conflicts=0;
  for(const rows of map.values()){
    if(rows.length<2)continue;
    const positions=rows.map(row=>({squad:row.si+1,slot:row.hi+1}));
    for(const row of rows){
      const sq=out.squads?.[row.si];if(!sq)continue;
      const prior=sq.composition_conflict&&typeof sq.composition_conflict==="object"?sq.composition_conflict:{};
      const heroes=(Array.isArray(prior.heroes)?prior.heroes:[]).filter(x=>x?.hero!==row.h?.name);
      heroes.push({hero:row.h?.name,positions});
      sq.composition_conflict={...prior,status:"needs_verification",detected_at:prior.detected_at||now,heroes};
      sq.needs_rescan=true;
      conflicts++;
    }
  }
  return conflicts;
}

/**
 * V2.4.7 hero profile registry.
 * The registry is independent from squad/slot position, so a hero can move between squads
 * without losing its own progression. Unknown scan fields never erase known hero data.
 */
export function synchronizeHeroProfiles(input,{now=new Date().toISOString()}={}){
  const out=ensureShape(input),synced=syncProfiles(out,{includeSquads:true});
  if(synced.changed){out.migration={...(out.migration||{}),hero_profile_registry_at:out.migration?.hero_profile_registry_at||now,squad_identity_model:"hero-keyed-v2.4.7"};}
  return {state:out,changed:synced.changed,profiles:out.hero_profiles.length};
}

/**
 * Apply confirmed exclusive-weapon power to the hero identity without treating
 * the weapon's power as a squad-total observation.
 */
export function mergeConfirmedExclusiveWeaponPowers(input,{weapons=[],updatedAt=null}={}){
  const out=ensureShape(input),now=updatedAt||new Date().toISOString(),powers=new Map();
  for(const raw of Array.isArray(weapons)?weapons:[]){
    const name=heroName(raw?.hero_name),power=confirmedHeroPower(raw?.power);
    if(!name||power===null)continue;
    powers.set(heroKey(name),{name,power});
  }
  if(!powers.size)return {state:out,changed:false,updated_heroes:[]};
  const updated=[];
  for(const squad of out.squads){
    for(const hero of squad.heroes){
      const match=powers.get(heroKey(hero?.name));
      if(!match)continue;
      if(confirmedHeroPower(hero.power)!==match.power){hero.power=match.power;updated.push(match.name);}
    }
  }
  const profiles=buildProfileMap(out,{includeSquads:true});
  for(const match of powers.values())mergeProfileRecord(profiles,match.name,{power:match.power},{updatedAt:now,source:"exclusive_weapon",force:true});
  out.hero_profiles=profileArray(profiles);
  const changed=updated.length>0||powers.size>0;
  if(changed)out.updated_at=now;
  const backfilled=backfillConfirmedHeroPowers(out,{now});
  return {state:backfilled.state,changed:changed||backfilled.changed,updated_heroes:[...new Set([...updated,...backfilled.updated_heroes,...[...powers.values()].map(x=>x.name)])]};
}

/** Confirm a scanned/manual squad composition without ever carrying attributes by slot. */
export function reconcileConfirmedSquad(input,{squadId,names,incomingHeroes=[],updatedAt=null}={}){
  const out=ensureShape(input),id=Number(squadId),now=updatedAt||new Date().toISOString();
  if(!Number.isInteger(id)||id<1||id>4)throw new Error("invalid_squad_id");
  const confirmed=Array.from({length:HERO_SLOT_COUNT},(_,i)=>heroName(names?.[i]));
  if(confirmed.some(x=>!x))throw new Error("missing_hero_identity");
  if(new Set(confirmed.map(x=>x.toLowerCase())).size!==HERO_SLOT_COUNT)throw new Error("duplicate_hero_identity");

  // Snapshot every currently known hero BEFORE any move clears an old squad.
  const profileMap=buildProfileMap(out,{includeSquads:true});
  const before=occurrences(out),target=out.squads[id-1],movedFrom=new Set();
  const rebuilt=confirmed.map((name,i)=>{
    const key=heroKey(name),rows=before.get(key)||[];
    let base=profileMap.has(key)?profileHero(profileMap.get(key)):blankHero();
    const own=preferredOccurrence(rows,id);if(own?.h)base=mergeKnown(base,own.h);
    const external=[...rows].filter(x=>x.si!==id-1).sort((a,b)=>detailScore(b.h)-detailScore(a.h)||timestamp(b.updated_at)-timestamp(a.updated_at))[0];
    if(external){base=mergeKnown(base,external.h);movedFrom.add(external.si);}
    const rawScanned=incomingHeroes?.[i]&&typeof incomingHeroes[i]==="object"?incomingHeroes[i]:{};
    const scanned={...rawScanned};
    if(known(rawScanned?.gear)){const safeGear=sanitizeGear(rawScanned.gear);if(safeGear)scanned.gear=safeGear;else delete scanned.gear;}
    base=mergeKnown(base,scanned);base.name=name;
    // Persist only fields actually read and validated by the scan as fresh; name confirmation alone never erases data.
    const scannedKnown={};for(const f of HERO_FIELDS)if(known(scanned?.[f]))scannedKnown[f]=clone(scanned[f]);
    if(Object.keys(scannedKnown).length)mergeProfileRecord(profileMap,name,scannedKnown,{updatedAt:now,source:"confirmed_scan"});
    return base;
  });

  target.heroes=Array.from({length:HERO_SLOT_COUNT},(_,i)=>rebuilt[i]||blankHero());
  target.confirmed_composition=Array.from({length:HERO_SLOT_COUNT},(_,i)=>confirmed[i]||"");
  target.composition_confirmed_at=now;
  target.composition_source="explicit_confirmation";
  target.composition_conflict=null;
  target.updated_at=now;target.needs_rescan=false;target.composition_changed_at=now;
  const duplicates_removed=enforceUnique(out,{now});
  // Capture the final clean state too; the registry survives future squad clears/replacements.
  out.hero_profiles=profileArray(profileMap);
  const finalProfiles=buildProfileMap(out,{includeSquads:true});out.hero_profiles=profileArray(finalProfiles);
  out.updated_at=now;
  out.migration={...(out.migration||{}),hero_profile_registry_at:out.migration?.hero_profile_registry_at||now,squad_identity_model:"hero-keyed-v2.4.7"};
  return {state:out,moved_from_squads:[...movedFrom].map(x=>x+1),duplicates_removed,profiles:out.hero_profiles.length};
}

/**
 * V2.5.2 primary-squad policy.
 * Squad 1 is the player-selected main squad whenever it contains saved data.
 * A stronger secondary squad never silently becomes the main squad after a permutation.
 * If Squad 1 has no data yet, WarBoost falls back to the strongest reliable configured squad.
 */
export function squadHasData(squad={}){
  const powerKnown=squad?.power!==null&&squad?.power!==undefined&&squad?.power!==""&&Number.isFinite(Number(squad.power));
  const heroKnown=(Array.isArray(squad?.heroes)?squad.heroes:[]).some(h=>Boolean(heroName(h?.name))||HERO_FIELDS.some(f=>known(h?.[f])));
  return Boolean(powerKnown||squad?.updated_at||heroKnown);
}
export function selectPrimarySquad(input={}){
  const squads=Array.from({length:4},(_,i)=>input?.squads?.[i]||blankSquad(i+1));
  const rows=squads.map((s,i)=>({s,i})).filter(x=>squadHasData(x.s));
  if(!rows.length)return null;
  const squadOne=rows.find(x=>x.i===0);
  if(squadOne)return {...squadOne,selection:"squad1_player_order"};
  const trusted=rows.filter(x=>x.s?.needs_rescan!==true),pool=trusted.length?trusted:rows;
  const powered=pool.filter(x=>x.s?.power!==null&&x.s?.power!==undefined&&x.s?.power!==""&&Number.isFinite(Number(x.s.power))).sort((a,b)=>Number(b.s.power)-Number(a.s.power));
  const picked=powered[0]||pool[0];
  return picked?{...picked,selection:"fallback_no_squad1"}:null;
}

/**
 * V2.5.1 whole-squad permutation.
 * Reorders two complete squad payloads at once: power, five hero objects, EX/gear/awakening
 * fields carried by those hero objects, freshness flags and every other squad-level field.
 * Hero profiles and global hero-keyed memories stay untouched because they belong to identities,
 * not to squad positions. The destination squad numbers remain stable (1..4).
 */
export function swapSquads(input,{fromSquadId,toSquadId,updatedAt=null}={}){
  const out=ensureShape(input),from=Number(fromSquadId),to=Number(toSquadId),now=updatedAt||new Date().toISOString();
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||from>4||to<1||to>4)throw new Error("invalid_squad_id");
  if(from===to)throw new Error("same_squad_id");
  const a=clone(out.squads[from-1]),b=clone(out.squads[to-1]);
  const relocate=(payload,id)=>({...payload,id,name:`Squad ${id}`,updated_at:now,composition_changed_at:now});
  out.squads[from-1]=relocate(b,from);
  out.squads[to-1]=relocate(a,to);
  out.updated_at=now;
  out.migration={...(out.migration||{}),squad_swap_model:"whole-squad-v2.5.1",last_squad_swap_at:now};
  return {state:out,from_squad:from,to_squad:to,updated_at:now};
}

/** One-time/idempotent repair for positional-merge corruption, then seed/update the hero registry. */
export function repairLegacySquadIdentity(input,{now=new Date().toISOString()}={}){
  const out=ensureShape(input),shapeChanged=!sameJson(out,input);let changed=shapeChanged;
  // Never clear a duplicate here: that can destroy the last confirmed slot.
  // Keep every occurrence and persist a review marker until the player confirms
  // the winning composition explicitly.
  const conflicts=enforceUnique(out,{now});if(conflicts)changed=true;
  const profiles=syncProfiles(out,{includeSquads:true});if(profiles.changed)changed=true;
  if(changed){out.updated_at=out.updated_at||now;out.migration={...(out.migration||{}),squad_identity_repaired_at:conflicts?(out.migration?.squad_identity_repaired_at||now):out.migration?.squad_identity_repaired_at,hero_profile_registry_at:out.migration?.hero_profile_registry_at||now,squad_identity_model:"hero-keyed-v2.4.7"};}
  return {state:out,changed,duplicates_removed:0,conflicts,profiles:out.hero_profiles.length};
}

export function squadIdentityAudit(input={}){const out=ensureShape(input),seen=new Map(),duplicates=[];out.squads.forEach((sq,si)=>sq.heroes.forEach((h,hi)=>{const key=heroKey(h?.name);if(!key)return;if(seen.has(key))duplicates.push({hero:h.name,first:seen.get(key),duplicate:{squad:si+1,slot:hi+1}});else seen.set(key,{squad:si+1,slot:hi+1});}));return {unique:duplicates.length===0,duplicates,configured_heroes:seen.size,needs_rescan:out.squads.filter(x=>x.needs_rescan).map(x=>x.id),hero_profiles:(out.hero_profiles||[]).length};}
