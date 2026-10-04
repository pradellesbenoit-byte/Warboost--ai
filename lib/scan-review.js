import {sanitizeGear} from "./gear.js";
import {parseDronePowerUnits} from "./drone-scan.js";
import {parseTechnologyPercent} from "./technology-scan.js";
import {normalizeDroneParts} from "./player-known-facts.js";

const ROOTS={
  profile:["player","alliance"],
  drone:["drone"],
  shop:["shop"],
  vs:["vs"],
  season:["season","technology"],
  technology:["technology"],
  exclusive:["exclusive_weapons"],
  awakening:["hero_progression"],
  secret_mobile_squad:["special_events.secret_mobile_squad"]
};

export function createScanReviewDraft(scanType,payload,{includeHeroNames=false}={}){
  const type=String(scanType||"").toLowerCase(),match=type.match(/^squad([1-4])$/),roots=match?[`squads.${Number(match[1])-1}`]:ROOTS[type];
  if(!roots||!payload||typeof payload!=="object")return null;
  const staged={};
  for(const root of roots){
    const parts=root.split("."),value=parts.reduce((v,key)=>v?.[key],payload);
    if(value===undefined||value===null)continue;
    const profileAlliance=type==="profile"&&root==="alliance"&&value&&typeof value==="object";
    const droneFacts=type==="drone"&&root==="drone"&&value&&typeof value==="object";
    const reviewValue=profileAlliance
      ?Object.fromEntries(["tag","name","server_id"].filter(key=>value[key]!==undefined).map(key=>[key,value[key]]))
      :droneFacts
        ?Object.fromEntries(["level","power_m","boostCombat","components","skill_chips"].filter(key=>value[key]!==undefined).map(key=>[key,["components","skill_chips"].includes(key)?normalizeDroneParts(value[key]):value[key]]))
        :value;
     const cleaned=cleanReviewValue(reviewValue);
    if(cleaned===undefined)continue;
    let parent=staged;
    for(const key of parts.slice(0,-1))parent=parent[key]??=(Array.isArray(payload.squads)?[]:{});
    parent[parts.at(-1)]=cleaned;
  }
  if(match){
    const squad=staged.squads?.[Number(match[1])-1];
    if(squad){delete squad.id;delete squad.name}
    if(includeHeroNames&&squad)squad.heroes=Array.from({length:5},(_,i)=>({...squad.heroes?.[i],name:String(squad.heroes?.[i]?.name||"")}));
    if(!includeHeroNames&&squad?.heroes)for(const hero of squad.heroes)if(hero&&typeof hero==="object")delete hero.name;
  }
  return Object.keys(staged).length?staged:null;
}

function cleanReviewValue(value,key=""){
  if(value===null||value===undefined||key==="source"||key==="updated_at"||key==="field_source"||key==="field_updated_at"||/_at$|_source$|_status$/i.test(key)||/confirm/i.test(key)||key==="needs_rescan")return undefined;
  if(key==="gear"&&(typeof value!=="string"||sanitizeGear(value)!==value.trim()))return undefined;
  if(Array.isArray(value)){const values=value.map(item=>cleanReviewValue(item)??null);return values.some(item=>item!==null)?values:undefined}
  if(value&&typeof value==="object"){
    const out={};
    for(const [childKey,child] of Object.entries(value)){const cleaned=cleanReviewValue(child,childKey);if(cleaned!==undefined)out[childKey]=cleaned}
    return Object.keys(out).length?out:undefined;
  }
  if(["string","number","boolean"].includes(typeof value))return value;
  return undefined;
}

export function scanReviewEntries(draft){
  const entries=[];
  const walk=(value,path=[])=>{
    if(value===null||value===undefined)return;
    if(typeof value==="string"||typeof value==="number"||typeof value==="boolean"){
      entries.push({path,value});
      return;
    }
    if(Array.isArray(value)){value.forEach((item,index)=>walk(item,[...path,index]));return}
    if(typeof value==="object")for(const [key,item] of Object.entries(value))walk(item,[...path,key]);
  };
  walk(draft);
  return entries;
}

export function applyScanReviewEdits(draft,edits){
  const out=JSON.parse(JSON.stringify(draft||{}));
  const errors=[];
  for(const {path,value,badInput=false} of edits||[]){
    if(!Array.isArray(path)||!path.length)continue;
    let target=out,valid=true;
    const key=path.at(-1),optionalSquadHeroField=isOptionalSquadHeroField(path,key),optionalSquadPower=isOptionalSquadPower(path,key);
    const dronePower=path.length===2&&path[0]==="drone"&&key==="power_m";
     const techField=path[0]==="technology"&&path.length===4&&["branches","unmapped"].includes(path[1])&&["name","state","percent","prerequisite"].includes(key);
     const optionalSquadField=optionalSquadHeroField||optionalSquadPower||dronePower||techField;
    for(let index=0;index<path.length-1;index++){
      const part=path[index];
      if((typeof part!=="string"&&typeof part!=="number")||target?.[part]===undefined||target?.[part]===null){
        if(optionalSquadField){
          const next=path[index+1];
          target[part]=typeof next==="number"?[]:{};
        }else{valid=false;break}
      }
      target=target[part];
    }
    if(!valid)continue;
     const old=target?.[key],numericField=typeof old==="number"||optionalSquadPower||optionalSquadHeroField&&["level","stars","power"].includes(key);
    if(old===undefined&&!optionalSquadField)continue;
    if(key==="exclusive"&&isOpaqueExclusive(old)&&!String(value??"").trim()){delete target[key];continue}
    if(dronePower){
      if(badInput){errors.push({path,reason:"invalid_number"});continue}
      if(!String(value??"").trim()){delete target[key];continue}
      const units=parseDronePowerUnits(value);
      if(units===null){errors.push({path,reason:"invalid_number"});continue}
      target[key]=units/1_000_000;
     }else if(techField&&key==="percent"){
       const text=String(value??"").trim();
       if(!text){delete target[key];continue}
       const percent=parseTechnologyPercent(text.endsWith("%")?text:`${text}%`);
       if(badInput||percent===null){errors.push({path,reason:"invalid_number"});continue}
       target[key]=percent;
     }else if(techField&&key==="state"){
       if(!["percent","max","locked","unknown"].includes(String(value))){errors.push({path,reason:"invalid_technology_state"});continue}
       target[key]=String(value);
     }else if(key==="gear"){
      const text=String(value??"").trim();
      if(badInput){errors.push({path,reason:"invalid_gear"});continue}
      if(!text){delete target[key];continue}
      const normalized=sanitizeGear(text);
      if(!normalized||normalized!==text){errors.push({path,reason:"invalid_gear"});continue}
      target[key]=normalized;
    }else if(numericField){
      if(badInput){errors.push({path,reason:"invalid_number"});continue}
      const text=String(value??"").trim();
      if(!text){delete target[key];continue}
      const normalized=text.replace(",",".");
      const match=normalized.match(/^([+-]?)(?:(\d+(?:\.\d*)?)|(\.\d+))$/);
      if(!match){errors.push({path,reason:"invalid_number"});continue}
      const number=Number(normalized);
      if(!Number.isFinite(number)){errors.push({path,reason:"invalid_number"});continue}
      if(match[1]==="-"||number<0){errors.push({path,reason:"negative_number"});continue}
      target[key]=number;
    }else if(typeof old==="boolean"){
      if(value===true||String(value)==="true")target[key]=true;
      else if(value===false||String(value)==="false")target[key]=false;
      else errors.push({path,reason:"invalid_boolean"});
    }else{
      const text=String(value??"");
      if(!text.trim())delete target[key];
      else target[key]=text;
    }
  }
  stripOpaqueExclusive(out);
  return {patch:pruneReviewValue(out)||{},errors};
}

function isOptionalSquadHeroField(path,key){
  return path.length===5&&path[0]==="squads"&&Number.isInteger(path[1])&&path[1]>=0&&path[1]<4&&path[2]==="heroes"&&Number.isInteger(path[3])&&path[3]>=0&&path[3]<5&&
    ["name","level","stars","power","exclusive","gear"].includes(key);
}
function isOptionalSquadPower(path,key){
  return path.length===3&&path[0]==="squads"&&Number.isInteger(path[1])&&path[1]>=0&&path[1]<4&&key==="power";
}
function isOpaqueExclusive(value){
  return typeof value==="string"&&/^(?:(?:[^:：-]+)\s*[:：-]\s*)?(?:non[\s_-]*visible|not[\s_-]*visible|not[\s_-]*detected|n\/?a|unknown|unreadable|none|no weapon)$/i.test(value.trim());
}
function stripOpaqueExclusive(value){
  if(Array.isArray(value)){value.forEach(stripOpaqueExclusive);return}
  if(!value||typeof value!=="object")return;
  for(const [key,item] of Object.entries(value)){
    if(key==="exclusive"&&isOpaqueExclusive(item))delete value[key];
    else stripOpaqueExclusive(item);
  }
}

export function applyOwnedScanReview(draft,owner,edits){
  if(!draft||!String(owner||"")||draft.owner!==String(owner))return null;
  return applyScanReviewEdits(draft.patch,edits);
}

function pruneReviewValue(value,key=""){
  if(Array.isArray(value)){const items=value.map(item=>pruneReviewValue(item));const kept=key==="heroes"?items.map(item=>item===undefined?null:item):items.filter(item=>item!==undefined);return kept.some(item=>item!==undefined&&item!==null)?kept:undefined}
  if(value&&typeof value==="object"){
    const out={};
    for(const [childKey,item] of Object.entries(value)){const cleaned=pruneReviewValue(item,childKey);if(cleaned!==undefined)out[childKey]=cleaned}
    return Object.keys(out).length?out:undefined;
  }
  return value;
}

export function scanRequestMatches(request,current){
  return Boolean(request&&current&&request.owner===current.owner&&request.scanType===current.scanType&&request.imageFingerprint===current.imageFingerprint&&request.revision===current.revision);
}