import {TECHNOLOGY_NAMES} from "./technology-scan.js";

export const TECHNOLOGY_KEYS=Object.keys(TECHNOLOGY_NAMES);
export const technologyFingerprint=value=>JSON.stringify(value??null);
const LEGACY={heroes:"hero_tech_pct",siege_to_seize:"siege_to_seize_pct",defensive_fortification:"defensive_fortification_pct",tactical_weapon:"tactical_weapon_pct"};
export function technologyEntry(state,key){
  const branch=state.technology?.branches?.[key];if(branch)return branch;
  const value=state.technology?.[LEGACY[key]];
  // No inferred mapping for legacy type_mastery_pct (its branch is ambiguous).
  if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>100)return undefined;
  return {name:TECHNOLOGY_NAMES[key][0],state:"percent",percent:value,updated_at:state.technology?.updated_at||null};
}

// Only the edited branch changes. Unknown is an explicit dated clearing marker,
// not an absent scan result: older snapshots must not restore the cleared value.
export function applyManualTechnology(state,{owner,key,state:status,percent,prerequisite,baseline,now=new Date().toISOString()}){
  if(!owner||state.player_id!==owner)throw new Error("owner");
  if(!TECHNOLOGY_KEYS.includes(key)||!["unknown","percent","max","locked"].includes(status))throw new Error("invalid");
  const current=technologyEntry(state,key);
  if(technologyFingerprint(current)!==baseline)throw new Error("conflict");
  let value;
  if(status==="percent"){
    if(String(percent??"").trim()==="")throw new Error("invalid");
    value=Number(percent);
    if(!Number.isFinite(value)||value<0||value>100)throw new Error("invalid");
  }
  const clock=Date.parse(now);
  if(!Number.isFinite(clock))throw new Error("invalid");
  const at=new Date(Math.max(clock,(Date.parse(current?.updated_at)||0)+1)).toISOString();
  const entry={name:TECHNOLOGY_NAMES[key][0],state:status,
    ...(status==="percent"?{percent:value}:{}),
    ...(status==="locked"&&String(prerequisite||"").trim()?{prerequisite:String(prerequisite).trim().slice(0,180)}:{}),
    source:"manual",confirmed_at:at,updated_at:at};
  return {...state,technology:{...state.technology,branches:{...state.technology?.branches,[key]:entry},updated_at:at}};
}
