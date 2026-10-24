import {canonicalPowerMillions} from "./power-units.js";

function text(value){return String(value??"").trim().replace(/[\s\u00a0\u202f]+/g,"")}

function normalizedNumberText(value){
  const raw=text(value);
  if(!raw)return null;
  const sign=raw.startsWith("-")||raw.startsWith("+")?raw[0]:"";
  const body=sign?raw.slice(1):raw;
  if(!/^\d[\d.,]*$/.test(body))return null;
  const dots=(body.match(/\./g)||[]).length,commas=(body.match(/,/g)||[]).length;
  if(dots&&commas){
    const decimal=body.lastIndexOf(".")>body.lastIndexOf(",")?".":",";
    const integer=body.slice(0,body.lastIndexOf(decimal)).replace(/[.,]/g,"");
    const fraction=body.slice(body.lastIndexOf(decimal)+1).replace(/[.,]/g,"");
    return `${sign}${integer}.${fraction}`;
  }
  const separator=dots?".":commas?",":null;
  if(!separator)return `${sign}${body}`;
  const count=separator==="."?dots:commas;
  if(count>1)return `${sign}${body.replace(/[.,]/g,"")}`;
  const [integer,fraction=""]=body.split(separator);
  // A three-digit fractional part is a localized thousands group; one or two
  // digits is a decimal fraction (notably "5,65 M").
  return fraction.length===3
    ?`${sign}${body.replace(/[.,]/g,"")}`
    :`${sign}${integer}.${fraction}`;
}

// Hero power historically uses raw combat units in some saved states and millions
// in others. Keep the stored numeric value compatible, but parse explicit display
// units so a scan value such as "5,65 M" is not silently discarded.
export function parseHeroPower(value){
  if(value===null||value===undefined||value==="")return null;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  const raw=text(value),match=raw.match(/^([+-]?[\d.,]+)([kmb])?$/i);
  if(!match)return null;
  const normalized=normalizedNumberText(match[1]);if(normalized===null)return null;
  const number=Number(normalized);if(!Number.isFinite(number))return null;
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