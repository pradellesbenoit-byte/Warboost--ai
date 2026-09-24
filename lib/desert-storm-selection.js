import {rosterLifecycleKey} from "./alliance-roster-lifecycle.js";

function clean(v){return String(v??"").trim()}

export function toggleDesertStormSelection(registeredKeys=[],key,checked){
  const normalized=clean(key),keys=Array.isArray(registeredKeys)?registeredKeys:[];
  if(!normalized)return keys;
  const index=keys.indexOf(normalized);
  if(checked){if(index<0)keys.push(normalized)}
  else if(index>=0)keys.splice(index,1);
  return keys;
}

export function desertStormMemberKeys(member={}){
  const canonical=clean(member?.canonical_member_key);
  const lifecycle=clean(member?.lifecycle_key||rosterLifecycleKey(member));
  return [...new Set([canonical,lifecycle].filter(Boolean))];
}

function aliasMap(members=[]){
  const map=new Map();
  for(const member of Array.isArray(members)?members:[]){
    const keys=desertStormMemberKeys(member),stable=keys[0];
    if(!stable)continue;
    for(const key of keys){
      if(!map.has(key))map.set(key,stable);
      else if(map.get(key)!==stable)map.set(key,null);
    }
  }
  return map;
}

export function normalizeDesertStormSelections(registeredKeys=[],activeMembers=[],inactiveMembers=[]){
  const active=aliasMap(activeMembers),inactive=new Set((Array.isArray(inactiveMembers)?inactiveMembers:[]).flatMap(desertStormMemberKeys));
  const out=[],seen=new Set();
  for(const raw of Array.isArray(registeredKeys)?registeredKeys:[]){
    const key=clean(raw);if(!key)continue;
    const mapped=active.has(key)?active.get(key):inactive.has(key)?null:key;
    if(!mapped||seen.has(mapped))continue;
    seen.add(mapped);out.push(mapped);
  }
  return out;
}

export function normalizeDesertStormSubstituteSelections(substituteKeys=[],registeredKeys=[],activeMembers=[],inactiveMembers=[]){
  const registered=new Set(normalizeDesertStormSelections(registeredKeys,activeMembers,inactiveMembers));
  return normalizeDesertStormSelections(substituteKeys,activeMembers,inactiveMembers).filter(key=>registered.has(key));
}