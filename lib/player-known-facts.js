import {mergeFreshRecord} from "./field-freshness.js";

export function normalizeKnownResources(value={}){
  const out={};
  for(const [key,item] of Object.entries(value||{})){
    if(/^[a-z][a-z0-9_]{0,39}$/.test(key)&&typeof item==="number"&&Number.isFinite(item)&&item>=0)out[key]=item;
  }
  for(const key of ["source","updated_at","field_source","field_updated_at"])if(value?.[key])out[key]=value[key];
  return out;
}
export function normalizeDroneParts(rows=[]){
  const out=new Map();
  for(const row of Array.isArray(rows)?rows.slice(0,32):[]){
    const name=String(row?.name||"").trim().slice(0,80);if(!name)continue;
    const key=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const level=typeof row.level==="number"&&Number.isFinite(row.level)&&row.level>=0?row.level:null;
    const fact={name,level};
    for(const field of ["source","updated_at","field_source","field_updated_at"])if(row[field])fact[field]=row[field];
    out.set(key,mergeFreshRecord(out.get(key)||{},fact,["name","level"],{baseSource:"drone",incomingSource:"drone"}));
  }
  return [...out.values()];
}
export function mergeDroneFacts(a={},b={}){
  a=a&&typeof a==="object"?a:{};b=b&&typeof b==="object"?b:{};
  const out=mergeFreshRecord(a,b,["level","power_m"],{baseSource:"drone",incomingSource:"drone"});
  out.boostCombat=mergeFreshRecord(a.boostCombat,b.boostCombat,["level"],{baseSource:"drone",incomingSource:"drone"});
  out.components=normalizeDroneParts([...(a.components||[]),...(b.components||[])]);
  out.skill_chips=normalizeDroneParts([...(a.skill_chips||[]),...(b.skill_chips||[])]);
  return out;
}
export function mergeKnownResources(a={},b={}){
  const left=normalizeKnownResources(a),right=normalizeKnownResources(b);
  return mergeFreshRecord(left,right,Object.keys(right).filter(k=>typeof right[k]==="number"),{baseSource:"resources",incomingSource:"resources"});
}