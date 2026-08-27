import {canonicalHeroName,isGenericHeroName} from "./heroes.js";

const HERO_FIELDS=["level","stars","power","exclusive","gear","awakening"];

function clone(x){return JSON.parse(JSON.stringify(x??null));}
function heroName(v){const n=canonicalHeroName(v);return n&&!isGenericHeroName(n)?n:"";}
function heroKey(v){return heroName(v).toLowerCase();}
function known(v){return !(v===null||v===undefined||v==="");}
function blankHero(){return {name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null};}
function blankSquad(id){return {id,name:`Squad ${id}`,power:null,updated_at:null,needs_rescan:false,composition_changed_at:null,heroes:Array.from({length:5},blankHero)};}
function timestamp(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
function detailScore(h={}){return HERO_FIELDS.reduce((sum,k)=>sum+(known(h?.[k])?1:0),0);}
function mergeKnown(base={},extra={}){const out={...clone(base)};for(const k of HERO_FIELDS){if(known(extra?.[k]))out[k]=clone(extra[k]);}return out;}
function globalHeroOverlay(state,name,base={}){
  const out={...clone(base),name:heroName(name)};
  const key=heroKey(name);
  const progression=(Array.isArray(state?.hero_progression)?state.hero_progression:[]).filter(x=>heroKey(x?.hero_name||x?.name)===key).sort((a,b)=>timestamp(b?.updated_at)-timestamp(a?.updated_at))[0];
  const weapon=(Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[]).filter(x=>heroKey(x?.hero_name)===key).sort((a,b)=>timestamp(b?.updated_at)-timestamp(a?.updated_at))[0];
  if(progression){
    if(known(progression.stars))out.stars=progression.stars;
    if(known(progression.exclusive))out.exclusive=progression.exclusive;
    if(progression.awakening&&typeof progression.awakening==="object")out.awakening={...(out.awakening||{}),...clone(progression.awakening)};
  }
  if(weapon&&known(weapon.level))out.exclusive=weapon.level;
  return out;
}
function occurrences(state){
  const map=new Map();
  (state?.squads||[]).forEach((sq,si)=>(sq?.heroes||[]).forEach((h,hi)=>{
    const key=heroKey(h?.name);if(!key)return;
    if(!map.has(key))map.set(key,[]);
    map.get(key).push({si,hi,sq,h:clone(h),updated_at:sq?.updated_at||null});
  }));
  return map;
}
function preferredOccurrence(rows=[],preferredSquadId=null){
  if(preferredSquadId){const hit=rows.find(x=>x.si===Number(preferredSquadId)-1);if(hit)return hit;}
  return [...rows].sort((a,b)=>timestamp(b.updated_at)-timestamp(a.updated_at)||detailScore(b.h)-detailScore(a.h))[0]||null;
}
function donorOccurrence(rows=[],keeper=null){
  const others=rows.filter(x=>x!==keeper);
  return [...others].sort((a,b)=>detailScore(b.h)-detailScore(a.h)||timestamp(a.updated_at)-timestamp(b.updated_at))[0]||keeper||null;
}
function ensureShape(input={}){
  const out=clone(input)||{};
  out.squads=Array.from({length:4},(_,i)=>{
    const sq=out.squads?.[i]||blankSquad(i+1);
    return {...sq,id:i+1,name:`Squad ${i+1}`,needs_rescan:sq?.needs_rescan===true,composition_changed_at:sq?.composition_changed_at||null,heroes:Array.from({length:5},(_,j)=>({...blankHero(),...(sq?.heroes?.[j]||{}),name:heroName(sq?.heroes?.[j]?.name)}))};
  });
  return out;
}
function clearOccurrence(out,row,now){
  const sq=out.squads?.[row.si];if(!sq)return;
  sq.heroes[row.hi]=blankHero();
  sq.needs_rescan=true;
  sq.composition_changed_at=now;
}
function enforceUnique(out,{preferredSquadId=null,now=new Date().toISOString()}={}){
  const map=occurrences(out);let removed=0;
  for(const rows of map.values()){
    if(rows.length<2)continue;
    const keep=preferredOccurrence(rows,preferredSquadId);
    for(const row of rows){if(row.si===keep.si&&row.hi===keep.hi)continue;clearOccurrence(out,row,now);removed++;}
  }
  return removed;
}

/**
 * Confirm a scanned/manual squad composition without ever carrying attributes by slot.
 * Hero-level data follows the canonical hero identity. Any scan values are applied only
 * after the user has confirmed which hero occupies that scanned slot.
 */
export function reconcileConfirmedSquad(input,{squadId,names,incomingHeroes=[],updatedAt=null}={}){
  const out=ensureShape(input),id=Number(squadId),now=updatedAt||new Date().toISOString();
  if(!Number.isInteger(id)||id<1||id>4)throw new Error("invalid_squad_id");
  const confirmed=Array.from({length:5},(_,i)=>heroName(names?.[i]));
  if(confirmed.some(x=>!x))throw new Error("missing_hero_identity");
  if(new Set(confirmed.map(x=>x.toLowerCase())).size!==5)throw new Error("duplicate_hero_identity");

  const before=occurrences(out),target=out.squads[id-1],movedFrom=new Set();
  const rebuilt=confirmed.map((name,i)=>{
    const key=heroKey(name),rows=before.get(key)||[];
    const own=preferredOccurrence(rows,id);
    // If the hero is known in another squad, that identity record is authoritative over
    // the previous occupant of this target slot.
    let base=own?.h||blankHero();
    const external=[...rows].filter(x=>x.si!==id-1).sort((a,b)=>detailScore(b.h)-detailScore(a.h)||timestamp(b.updated_at)-timestamp(a.updated_at))[0];
    if(external){base=mergeKnown(base,external.h);movedFrom.add(external.si);}
    base=globalHeroOverlay(out,name,base);
    const scanned=incomingHeroes?.[i]&&typeof incomingHeroes[i]==="object"?incomingHeroes[i]:{};
    base=mergeKnown(base,scanned);
    base.name=name;
    return base;
  });

  // Remove every selected hero from other squads: moving a hero is a move, never a copy.
  for(const [key,rows] of before.entries()){
    if(!confirmed.some(n=>heroKey(n)===key))continue;
    for(const row of rows){if(row.si===id-1)continue;clearOccurrence(out,row,now);movedFrom.add(row.si);}
  }

  target.heroes=rebuilt;
  target.updated_at=now;
  target.needs_rescan=false;
  target.composition_changed_at=now;
  const duplicates_removed=enforceUnique(out,{preferredSquadId:id,now});
  out.updated_at=now;
  out.migration={...(out.migration||{}),squad_identity_model:"hero-keyed-v2.4.5"};
  return {state:out,moved_from_squads:[...movedFrom].map(x=>x+1),duplicates_removed};
}

/**
 * One-time/idempotent repair for V2.4.4 positional-merge corruption. When a hero exists
 * in multiple squads, keep its newest location but prefer the best identity record from
 * another occurrence for hero attributes, then overlay hero-specific EX/Awakening data.
 */
export function repairLegacySquadIdentity(input,{now=new Date().toISOString()}={}){
  const out=ensureShape(input),map=occurrences(out);let changed=false,duplicates_removed=0;
  for(const [key,rows] of map.entries()){
    if(rows.length<2)continue;
    const keeper=preferredOccurrence(rows),donor=donorOccurrence(rows,keeper),name=heroName(keeper?.h?.name||donor?.h?.name);
    let restored=donor?.h?clone(donor.h):clone(keeper.h);
    // Fill only donor gaps from the keeper; conflicting values stay with the donor because
    // the newer keeper may contain the previous slot occupant's V2.4.4 attributes.
    for(const field of HERO_FIELDS){if(!known(restored?.[field])&&known(keeper?.h?.[field]))restored[field]=clone(keeper.h[field]);}
    restored=globalHeroOverlay(out,name,restored);restored.name=name;
    out.squads[keeper.si].heroes[keeper.hi]=restored;
    for(const row of rows){if(row.si===keeper.si&&row.hi===keeper.hi)continue;clearOccurrence(out,row,now);duplicates_removed++;changed=true;}
  }
  const extra=enforceUnique(out,{now});if(extra){duplicates_removed+=extra;changed=true;}
  if(changed){out.updated_at=now;out.migration={...(out.migration||{}),squad_identity_repaired_at:out.migration?.squad_identity_repaired_at||now,squad_identity_model:"hero-keyed-v2.4.5"};}
  return {state:out,changed,duplicates_removed};
}

export function squadIdentityAudit(input={}){
  const out=ensureShape(input),seen=new Map(),duplicates=[];
  out.squads.forEach((sq,si)=>sq.heroes.forEach((h,hi)=>{const key=heroKey(h?.name);if(!key)return;if(seen.has(key))duplicates.push({hero:h.name,first:seen.get(key),duplicate:{squad:si+1,slot:hi+1}});else seen.set(key,{squad:si+1,slot:hi+1});}));
  return {unique:duplicates.length===0,duplicates,configured_heroes:seen.size,needs_rescan:out.squads.filter(x=>x.needs_rescan).map(x=>x.id)};
}
