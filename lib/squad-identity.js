import {canonicalHeroName,isGenericHeroName} from "./heroes.js";

const HERO_FIELDS=["level","stars","power","exclusive","gear","awakening"];
const SOURCE_RANK={exclusive_weapon:7,hero_progression:6,confirmed_scan:5,confirmed_manual:4,squad:3,migration:2,unknown:1};

function clone(x){return JSON.parse(JSON.stringify(x??null));}
function heroName(v){const n=canonicalHeroName(v);return n&&!isGenericHeroName(n)?n:"";}
function heroKey(v){return heroName(v).toLowerCase();}
function known(v){return !(v===null||v===undefined||v==="");}
function blankHero(){return {name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null};}
function blankSquad(id){return {id,name:`Squad ${id}`,power:null,updated_at:null,needs_rescan:false,composition_changed_at:null,heroes:Array.from({length:5},blankHero)};}
function timestamp(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
function detailScore(h={}){return HERO_FIELDS.reduce((sum,k)=>sum+(known(h?.[k])?1:0),0);}
function mergeKnown(base={},extra={}){const out={...clone(base)};for(const k of HERO_FIELDS){if(known(extra?.[k]))out[k]=clone(extra[k]);}return out;}
function sourceRank(v){return SOURCE_RANK[String(v||"unknown")]||0;}
function recordUpdatedAt(record={}){return record.updated_at||null;}
function fieldTime(record={},field){return record?.field_updated_at?.[field]||recordUpdatedAt(record)||null;}
function fieldSource(record={},field){return record?.field_source?.[field]||record?.source||"unknown";}
function profileHero(record){const out=blankHero();out.name=heroName(record?.hero_name||record?.name);for(const f of HERO_FIELDS)if(known(record?.[f]))out[f]=clone(record[f]);return out;}
function emptyProfile(name){return {hero_name:heroName(name),level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null,updated_at:null,field_updated_at:{},field_source:{}};}
function mergeProfileField(record,field,value,{updatedAt=null,source="unknown",force=false}={}){
  if(!known(value))return false;
  const curKnown=known(record?.[field]),curTime=timestamp(fieldTime(record,field)),nextTime=timestamp(updatedAt),curRank=sourceRank(fieldSource(record,field)),nextRank=sourceRank(source);
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
    for(const f of HERO_FIELDS)if(known(raw?.[f]))record[f]=clone(raw[f]);map.set(key,record);
  }
}
function buildProfileMap(state,{includeSquads=true}={}){
  const map=new Map();ingestExistingProfiles(map,state);
  if(includeSquads){
    for(const sq of state?.squads||[]){const at=sq?.updated_at||state?.updated_at||null;for(const h of sq?.heroes||[]){const name=heroName(h?.name);if(name)mergeProfileRecord(map,name,h,{updatedAt:at,source:"squad"});}}
  }
  for(const h of Array.isArray(state?.hero_progression)?state.hero_progression:[]){const name=heroName(h?.hero_name||h?.name);if(!name)continue;const at=h?.updated_at||state?.updated_at||null;mergeProfileRecord(map,name,{stars:h?.stars,exclusive:h?.exclusive,awakening:h?.awakening},{updatedAt:at,source:"hero_progression"});}
  for(const w of Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[]){const name=heroName(w?.hero_name);if(!name)continue;const at=w?.updated_at||state?.updated_at||null;mergeProfileRecord(map,name,{exclusive:w?.level},{updatedAt:at,source:"exclusive_weapon"});}
  return map;
}
function profileArray(map){return [...map.values()].map(r=>({...r,hero_name:heroName(r.hero_name)})).filter(r=>r.hero_name).sort((a,b)=>a.hero_name.localeCompare(b.hero_name)).slice(0,40);}
function sameJson(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null);}
function syncProfiles(out,{includeSquads=true}={}){const before=clone(out.hero_profiles||[]),map=buildProfileMap(out,{includeSquads});out.hero_profiles=profileArray(map);return {map,changed:!sameJson(before,out.hero_profiles)};}
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
function ensureShape(input={}){const out=clone(input)||{};out.hero_profiles=Array.isArray(out.hero_profiles)?out.hero_profiles:[];out.squads=Array.from({length:4},(_,i)=>{const sq=out.squads?.[i]||blankSquad(i+1);return {...sq,id:i+1,name:`Squad ${i+1}`,needs_rescan:sq?.needs_rescan===true,composition_changed_at:sq?.composition_changed_at||null,heroes:Array.from({length:5},(_,j)=>({...blankHero(),...(sq?.heroes?.[j]||{}),name:heroName(sq?.heroes?.[j]?.name)}))};});return out;}
function clearOccurrence(out,row,now){const sq=out.squads?.[row.si];if(!sq)return;sq.heroes[row.hi]=blankHero();sq.needs_rescan=true;sq.composition_changed_at=now;}
function enforceUnique(out,{preferredSquadId=null,now=new Date().toISOString()}={}){const map=occurrences(out);let removed=0;for(const rows of map.values()){if(rows.length<2)continue;const keep=preferredOccurrence(rows,preferredSquadId);for(const row of rows){if(row.si===keep.si&&row.hi===keep.hi)continue;clearOccurrence(out,row,now);removed++;}}return removed;}

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

/** Confirm a scanned/manual squad composition without ever carrying attributes by slot. */
export function reconcileConfirmedSquad(input,{squadId,names,incomingHeroes=[],updatedAt=null}={}){
  const out=ensureShape(input),id=Number(squadId),now=updatedAt||new Date().toISOString();
  if(!Number.isInteger(id)||id<1||id>4)throw new Error("invalid_squad_id");
  const confirmed=Array.from({length:5},(_,i)=>heroName(names?.[i]));
  if(confirmed.some(x=>!x))throw new Error("missing_hero_identity");
  if(new Set(confirmed.map(x=>x.toLowerCase())).size!==5)throw new Error("duplicate_hero_identity");

  // Snapshot every currently known hero BEFORE any move clears an old squad.
  const profileMap=buildProfileMap(out,{includeSquads:true});
  const before=occurrences(out),target=out.squads[id-1],movedFrom=new Set();
  const rebuilt=confirmed.map((name,i)=>{
    const key=heroKey(name),rows=before.get(key)||[];
    let base=profileMap.has(key)?profileHero(profileMap.get(key)):blankHero();
    const own=preferredOccurrence(rows,id);if(own?.h)base=mergeKnown(base,own.h);
    const external=[...rows].filter(x=>x.si!==id-1).sort((a,b)=>detailScore(b.h)-detailScore(a.h)||timestamp(b.updated_at)-timestamp(a.updated_at))[0];
    if(external){base=mergeKnown(base,external.h);movedFrom.add(external.si);}
    const scanned=incomingHeroes?.[i]&&typeof incomingHeroes[i]==="object"?incomingHeroes[i]:{};
    base=mergeKnown(base,scanned);base.name=name;
    // Persist only fields actually read by the scan as fresh; name confirmation alone never erases data.
    const scannedKnown={};for(const f of HERO_FIELDS)if(known(scanned?.[f]))scannedKnown[f]=clone(scanned[f]);
    if(Object.keys(scannedKnown).length)mergeProfileRecord(profileMap,name,scannedKnown,{updatedAt:now,source:"confirmed_scan"});
    return base;
  });

  for(const [key,rows] of before.entries()){
    if(!confirmed.some(n=>heroKey(n)===key))continue;
    for(const row of rows){if(row.si===id-1)continue;clearOccurrence(out,row,now);movedFrom.add(row.si);}
  }

  target.heroes=rebuilt;target.updated_at=now;target.needs_rescan=false;target.composition_changed_at=now;
  const duplicates_removed=enforceUnique(out,{preferredSquadId:id,now});
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
  const out=ensureShape(input),map=occurrences(out);let changed=false,duplicates_removed=0;
  for(const rows of map.values()){
    if(rows.length<2)continue;
    const keeper=preferredOccurrence(rows),donor=donorOccurrence(rows,keeper),name=heroName(keeper?.h?.name||donor?.h?.name);
    let restored=donor?.h?clone(donor.h):clone(keeper.h);
    for(const field of HERO_FIELDS){if(!known(restored?.[field])&&known(keeper?.h?.[field]))restored[field]=clone(keeper.h[field]);}
    restored=globalHeroOverlay(out,name,restored);restored.name=name;
    out.squads[keeper.si].heroes[keeper.hi]=restored;
    for(const row of rows){if(row.si===keeper.si&&row.hi===keeper.hi)continue;clearOccurrence(out,row,now);duplicates_removed++;changed=true;}
  }
  const extra=enforceUnique(out,{now});if(extra){duplicates_removed+=extra;changed=true;}
  const profiles=syncProfiles(out,{includeSquads:true});if(profiles.changed)changed=true;
  if(changed){out.updated_at=out.updated_at||now;out.migration={...(out.migration||{}),squad_identity_repaired_at:duplicates_removed?(out.migration?.squad_identity_repaired_at||now):out.migration?.squad_identity_repaired_at,hero_profile_registry_at:out.migration?.hero_profile_registry_at||now,squad_identity_model:"hero-keyed-v2.4.7"};}
  return {state:out,changed,duplicates_removed,profiles:out.hero_profiles.length};
}

export function squadIdentityAudit(input={}){const out=ensureShape(input),seen=new Map(),duplicates=[];out.squads.forEach((sq,si)=>sq.heroes.forEach((h,hi)=>{const key=heroKey(h?.name);if(!key)return;if(seen.has(key))duplicates.push({hero:h.name,first:seen.get(key),duplicate:{squad:si+1,slot:hi+1}});else seen.set(key,{squad:si+1,slot:hi+1});}));return {unique:duplicates.length===0,duplicates,configured_heroes:seen.size,needs_rescan:out.squads.filter(x=>x.needs_rescan).map(x=>x.id),hero_profiles:(out.hero_profiles||[]).length};}
