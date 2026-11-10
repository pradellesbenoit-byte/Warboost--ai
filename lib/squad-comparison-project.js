// Pure, bounded projection. No restoration, provenance backfill or persistence.
import {HERO_CATALOG,canonicalHeroName,isGenericHeroName} from "./heroes.js";
import {confirmedCompositionForSquad} from "./squad-identity.js";
import {projectComparisonGear} from "./squad-comparison-gear.js";
import {canonicalPowerMillions} from "./power-units.js";

export const SQUAD_COMPARE_SCHEMA=3;
export const SQUAD_COMPARE_CATEGORIES=["composition","confirmation","levels","stars","power","gear","weapons","awakening"];
export const COMPARISON_REASONS=new Set([
  "value_absent","value_unreadable","name_unknown","gear_format_unsupported","gear_layout_mismatch",
  "legacy_shape_unsupported","squad_data_absent","invalid_squad_id","duplicate_squad_id",
  "heroes_structure_unsupported","too_many_heroes","duplicate_hero","confirmation_missing",
  "confirmation_identity_mismatch","explicit_empty_inconsistent","identity_missing",
  "hero_identity_mismatch","confirmation_invalid","cloud_data_unavailable","schema_unsupported",
  "legacy_squad_number","field_confirmation_missing"
  ,"gear_number_ambiguous","gear_json_invalid","gear_text_invalid","gear_text_partial"
]);
const missing=()=>({kind:"missing"});
const unreadable=(reason="value_unreadable")=>({kind:"unreadable",reason});
const value=(data,confirmed=false)=>({kind:"value",value:data,confirmed});
const knownHeroes=new Set(HERO_CATALOG.map(canonicalHeroName));
const date=input=>typeof input==="string"&&Number.isFinite(Date.parse(input));
const explicitSources=new Set(["confirmed_manual","confirmed_scan","owner_confirmed_scan","explicit_confirmation","lastwar_scan_confirmed"]);
const unreadableStatuses=new Set(["unreadable","illisible","not_detected","ambiguous"]);
function fieldProof(record,field){
  // No envelope timestamp or inferred legacy/manual label can certify a field.
  if(["pending","needs_confirmation","needs_verification","conflict",...unreadableStatuses].includes(record?.field_status?.[field]))return false;
  if(field==="power"&&record?.power_sync_status==="pending")return false;
  if(field==="power"&&date(record?.composition_changed_at)&&date(record?.field_updated_at?.power)&&
    Date.parse(record.field_updated_at.power)<Date.parse(record.composition_changed_at))return false;
  return explicitSources.has(record?.field_source?.[field])&&date(record?.field_updated_at?.[field]);
}
function atom(input,status){
  if(unreadableStatuses.has(status))return unreadable();
  if(input===null||input===undefined||input==="")return missing();
  if(typeof input==="number")return Number.isFinite(input)?value(input):unreadable();
  if(typeof input==="boolean")return value(input);
  if(typeof input!=="string"||input.length>2048)return unreadable("legacy_shape_unsupported");
  const text=input.trim();
  if(!text)return missing();
  if(/^(?:\?|—|-|unreadable|illisible|non détecté|unknown|ambiguous)$/i.test(text))return unreadable();
  return value(/^-?\d+(?:\.\d+)?$/.test(text)?Number(text):text);
}
function identity(input,status){
  const simple=atom(input,status);
  if(simple.kind!=="value")return simple;
  if(typeof input!=="string"||input.length>100)return unreadable("name_unknown");
  const name=canonicalHeroName(input);
  return knownHeroes.has(name)&&!isGenericHeroName(name)?value(name):unreadable("name_unknown");
}
const structuredKeys=new Set(["level","name","weapon_name","type","status","active","reshaped","stars",
  "stats","bonuses","hp","atk","attack","def","defense","resistance","damage_resistance",
  "hero_hp","hero_attack","hero_defense","max_skill_level","skill_max_level","value","unit"]);
function structured(input,depth=0){
  if(!input||typeof input!=="object")return atom(input);
  if(!Object.keys(input).length)return missing();
  if(depth>3||Array.isArray(input)&&input.length>12)return unreadable("legacy_shape_unsupported");
  if(Array.isArray(input))return value(input.map(item=>structured(item,depth+1)));
  if(Object.keys(input).some(key=>!structuredKeys.has(key)))return unreadable("legacy_shape_unsupported");
  return value(Object.fromEntries(Object.keys(input).sort().map(key=>[key,structured(input[key],depth+1)])));
}
function gear(input,status){
  return projectComparisonGear(input,status);
}
function totalPower(input,status){
  const simple=atom(input,status);
  if(simple.kind!=="value")return simple;
  const power=canonicalPowerMillions(input);
  return power===null?unreadable():value(power);
}
function numericField(input,status){
  const entry=atom(input,status);
  return entry.kind!=="value"||typeof entry.value==="number"&&entry.value>=0?
    entry:unreadable("legacy_shape_unsupported");
}
const evidence=(entry,record,field)=>entry.kind==="value"?{...entry,confirmed:fieldProof(record,field)}:entry;
const meaningful=entry=>Boolean(entry&&(entry.kind==="value"||entry.kind==="unreadable"||
  typeof entry==="object"&&Object.values(entry).some(item=>typeof item==="object"&&meaningful(item))));

export function projectSquads(raw){
  const valid=Array.isArray(raw),positional=valid&&raw.every(item=>item?.id==null);
  const invalidIds=valid&&(positional&&raw.length>4||raw.some(item=>item?.id!=null&&(
    !["number","string"].includes(typeof item.id)||!Number.isInteger(Number(item.id))||Number(item.id)<1||Number(item.id)>4)));
  return {schema:SQUAD_COMPARE_SCHEMA,rows:Array.from({length:4},(_,index)=>{
    const id=index+1,matches=valid?raw.filter(item=>item?.id!=null&&Number(item.id)===id):[];
    const squad=matches.length===1?matches[0]:!matches.length&&positional?raw[index]:null;
    const issues=[];
    const issue=(reason,scope="squad",slot=null,category="structure")=>issues.push({reason,scope,slot,category});
    if(!valid)issue("squad_data_absent");
    if(invalidIds)issue("invalid_squad_id");
    if(matches.length>1)issue("duplicate_squad_id");
    if(valid&&!positional&&!matches.length&&raw.some(item=>item&&item.id==null))issue("invalid_squad_id");
    if(squad&&positional)issue("legacy_squad_number","notice");
    if(squad&&(typeof squad!=="object"||Array.isArray(squad)))issue("legacy_shape_unsupported");
    if(squad?.heroes!=null&&!Array.isArray(squad.heroes))issue("heroes_structure_unsupported","heroes");
    if(squad?.heroes?.length>5)issue("too_many_heroes","heroes");
    const heroes=Array.from({length:5},(_,slot)=>{
      const hero=Array.isArray(squad?.heroes)?squad.heroes[slot]:null;
      if(hero!=null&&(typeof hero!=="object"||Array.isArray(hero))){
        issue("legacy_shape_unsupported","slot",slot+1,"composition");return {};
      }
      return hero||{};
    });
    const composition=heroes.map(hero=>identity(hero.name,hero.field_status?.name));
    const proof=squad?confirmedCompositionForSquad(squad):null;
    const confirmed=proof?.every(name=>knownHeroes.has(canonicalHeroName(name)))?proof:null;
    const validEmpty=Boolean(squad?.explicit_empty===true&&date(squad?.empty_confirmed_at));
    const invalidProof=Boolean(["explicit_confirmation","explicit_swap"].includes(squad?.composition_source)&&!confirmed&&!validEmpty);
    composition.forEach((entry,slot)=>{
      if(entry.kind==="value"&&composition.some((other,i)=>i!==slot&&other.kind==="value"&&other.value===entry.value))
        issue("duplicate_hero","identity",slot+1,"composition");
      if(confirmed&&entry.kind==="value"&&entry.value!==canonicalHeroName(confirmed[slot]))
        issue("confirmation_identity_mismatch","identity",slot+1,"composition");
      if(squad?.composition_source==="explicit_swap_empty"&&entry.kind==="value")
        issue("explicit_empty_inconsistent","identity",slot+1,"composition");
      if(entry.kind==="value")entry.confirmed=Boolean(confirmed&&entry.value===canonicalHeroName(confirmed[slot]));
    });
    const fields=field=>heroes.map(hero=>evidence(
      (field==="power"?totalPower:numericField)(hero[field],hero.field_status?.[field]),hero,field));
    const power={total:evidence(totalPower(squad?.power,squad?.field_status?.power),squad,"power"),heroes:fields("power")};
    const confirmation={
      composition:confirmed?value(confirmed.map(name=>canonicalHeroName(name)),true):proof||invalidProof?unreadable("confirmation_invalid"):missing(),
      at:confirmed?new Date(squad.composition_confirmed_at).toISOString():null,
      source:confirmed?squad.composition_source:null,
      empty:squad?.composition_source==="explicit_swap_empty"?
        date(squad.composition_changed_at)?new Date(squad.composition_changed_at).toISOString():"unverified":null,
      powerStatus:power.total.kind!=="missing"?atom(squad?.power_sync_status):missing()
    };
    const categories={composition,confirmation,levels:fields("level"),stars:fields("stars"),power,
      gear:heroes.map(hero=>evidence(gear(hero.gear,hero.field_status?.gear),hero,"gear")),
      weapons:heroes.map(hero=>evidence(unreadableStatuses.has(hero.field_status?.exclusive)?unreadable():structured(hero.exclusive),hero,"exclusive")),
      awakening:heroes.map(hero=>evidence(unreadableStatuses.has(hero.field_status?.awakening)?unreadable():structured(hero.awakening),hero,"awakening"))};
    const hasData=Object.entries(categories).some(([key,entry])=>key!=="confirmation"&&meaningful(entry))||
      Boolean(confirmed)||Boolean(Array.isArray(squad?.confirmed_composition)&&squad.confirmed_composition.some(Boolean));
    if(hasData&&!confirmed&&!confirmation.empty)issue(proof||invalidProof?"confirmation_invalid":"confirmation_missing","notice",null,"confirmation");
    if(hasData&&confirmation.empty==="unverified")issue("confirmation_invalid","notice",null,"confirmation");
    return {id,hasData,ambiguous:issues.some(item=>item.scope!=="notice"),issues,categories,
      marker:squad?.composition_conflict?.reason==="squad_freshness_ambiguous"};
  })};
}
