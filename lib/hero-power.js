import {canonicalPowerMillions} from "./power-units.js";

function text(value){return String(value??"").trim().replace(/\s+/g,"").replace(",",".")}

// Hero power historically uses raw combat units in some saved states and millions
// in others. Keep the stored numeric value compatible, but parse explicit display
// units so a scan value such as "5,65 M" is not silently discarded.
export function parseHeroPower(value){
  if(value===null||value===undefined||value==="")return null;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  const raw=text(value),match=raw.match(/^([+-]?\d+(?:\.\d+)?)([kmb])?$/i);
  if(!match)return null;
  const number=Number(match[1]);if(!Number.isFinite(number))return null;
  const unit=String(match[2]||"").toLowerCase();
  if(unit==="b")return number*1_000_000_000;
  if(unit==="m")return number*1_000_000;
  if(unit==="k")return number*1_000;
  return number;
}

export function confirmedHeroPower(value){
  const parsed=parseHeroPower(value);
  if(parsed===null||parsed<=0)return null;
  return parsed;
}

export function confirmedHeroPowerMillions(value){
  const parsed=confirmedHeroPower(value);
  return parsed===null?null:canonicalPowerMillions(parsed);
}

export function heroPowerIsConfirmed(value){return confirmedHeroPower(value)!==null}