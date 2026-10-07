import {parseGear,sanitizeGear} from "./gear.js";
import {canonicalPowerMillions} from "./power-units.js";

const GROUP_KINDS=new Set(["squad","hero","player","alliance","drone","boostCombat","shop","vs","season","technology","offer","member","progress","other"]);
const ROOT_KIND={
  player:"player",alliance:"alliance",drone:"drone",shop:"shop",vs:"vs",season:"season",
  technology:"technology",exclusive_weapons:"hero",hero_progression:"progress"
};
const HERO_FIELDS=["level","stars","power","exclusive","gear"];
const GEAR_RARITIES=new Set(["red","rouge","orange","gold","golden","or","purple","violet","violette","blue","bleu","bleue","green","vert","verte"]);

function opaqueExclusive(value){
  return typeof value==="string"&&/^(?:(?:[^:：-]+)\s*[:：-]\s*)?(?:non[\s_-]*visible|not[\s_-]*visible|not[\s_-]*detected|n\/?a|unknown|unreadable|none|no weapon)$/i.test(value.trim());
}

function isMissing(field,value,{hero=false}={}){
  if(value===undefined||value===null||value==="")return true;
  if(typeof value==="number"&&value===0&&(field==="power"||field==="power_m"||hero&&["level","stars"].includes(field)))return true;
  return false;
}

function row(path,field,value,{hero=false,forcedKind}={}){
  if(field==="gear"){
    const parsed=parseGear(value);
    if(!parsed.valid||sanitizeGear(value)!==String(value??"").trim())return {path,field,kind:"gear",value:"",status:"missing"};
    const segments=parsed.levelOnly!==null
      ?[{count:1,levels:[parsed.levelOnly],rarity:""}]
      :parsed.segments.map(segment=>({
        count:segment.count,
        levels:segment.level!==null?[segment.level]:(segment.levels||[]),
        rarity:segment.rarity||""
      }));
    return {path,field,kind:"gear",value:segments,status:"pending"};
  }
  if(field==="exclusive"&&opaqueExclusive(value)){
    return {path,field,kind:forcedKind||typeof value,value:"",status:"missing",exclusiveNotVisible:true};
  }
  const missing=isMissing(field,value,{hero});
  let kind=forcedKind;
  if(!kind)kind=typeof value==="number"?"number":typeof value==="boolean"?"boolean":value&&typeof value==="object"?"structured":"text";
  return {path,field,kind,value:missing?"":value,status:missing?"missing":"pending"};
}

function safeRows(value,path,hero=false){
  if(value===null||value===undefined)return [];
  if(Array.isArray(value)){
    return value.flatMap((item,index)=>safeRows(item,[...path,index],hero));
  }
  if(value&&typeof value==="object"){
    const rows=[];
    for(const [key,item] of Object.entries(value)){
      if(key==="name"&&path.at(-1)==="heroes")continue;
      if(item&&typeof item==="object"&&!Array.isArray(item)){
        rows.push(...safeRows(item,[...path,key],hero));
      }else if(Array.isArray(item)){
        rows.push(...safeRows(item,[...path,key],hero));
      }else{
        rows.push(row([...path,key],key,item,{hero}));
      }
    }
    return rows;
  }
  const field=String([...path].reverse().find(part=>typeof part==="string")||"value");
  return [row(path,field,value,{hero})];
}

function pushGroup(groups,kind,rows,number){
  if(!GROUP_KINDS.has(kind)||!rows.length)return;
  groups.push({kind,...(number===undefined?{}:{number}),rows});
}

function buildSquadGroups(groups,type,patch){
  const match=type.match(/^squad([1-4])$/);
  if(!match)return false;
  const squadNumber=Number(match[1]),index=squadNumber-1,squad=patch?.squads?.[index]||{};
  const power=row(["squads",index,"power"],"power",canonicalPowerMillions(squad.power));
  pushGroup(groups,"squad",[power],squadNumber);
  const heroes=Array.isArray(squad.heroes)?squad.heroes:[];
  for(let slot=0;slot<5;slot++){
    const hero=heroes[slot]&&typeof heroes[slot]==="object"?heroes[slot]:{};
    const fields=heroes.some(h=>h&&Object.hasOwn(h,"name"))?["name",...HERO_FIELDS]:HERO_FIELDS;
    const rows=fields.map(field=>row(["squads",index,"heroes",slot,field],field,hero[field],{hero:true}));
    pushGroup(groups,"hero",rows,slot+1);
  }
  return true;
}

function groupKind(root){
  if(ROOT_KIND[root])return ROOT_KIND[root];
  if(root==="members"||root==="alliance_roster")return "member";
  return "other";
}

function buildRootGroups(groups,root,value){
  const baseKind=groupKind(root);
  if(Array.isArray(value)){
    const itemKind=root==="offers"?"offer":root==="members"||root==="alliance_roster"?"member":baseKind;
    value.forEach((item,index)=>{
      const rows=safeRows(item,[root,index],root==="hero_progression"||root==="exclusive_weapons");
      pushGroup(groups,itemKind,rows,index+1);
    });
    return;
  }
  if(value&&typeof value==="object"){
    for(const [key,item] of Object.entries(value)){
      if(Array.isArray(item)){
        const kind=key==="offers"?"offer":key==="members"?"member":baseKind;
        item.forEach((entry,index)=>pushGroup(groups,kind,safeRows(entry,[root,key,index],root==="hero_progression"||root==="exclusive_weapons"),index+1));
      }else if(item&&typeof item==="object"){
        const nestedKind=key==="technology"?"technology":baseKind;
        pushGroup(groups,nestedKind,safeRows(item,[root,key]));
      }else{
        pushGroup(groups,baseKind,[row([root,key],key,item)]);
      }
    }
    return;
  }
  pushGroup(groups,baseKind,safeRows(value,[root]));
}

export function buildScanReviewGroups(type,patch){
  const scanType=String(type||"").toLowerCase();
  const groups=[];
  if(buildSquadGroups(groups,scanType,patch||{}))return groups;
  if(scanType==="drone"){
    if(!patch?.drone)return groups;
    const drone=patch.drone;
    const droneRows=[];
    if(drone.level!==undefined)droneRows.push(row(["drone","level"],"level",drone.level));
    const power=row(["drone","power_m"],"power_m",drone.power_m);
    power.kind="dronePower";
    power.value=power.status==="missing"?"":Math.round(drone.power_m*1_000_000);
    droneRows.push(power);
    pushGroup(groups,"drone",droneRows);
    if(drone.boostCombat?.level!==undefined)
      pushGroup(groups,"boostCombat",[row(["drone","boostCombat","level"],"level",drone.boostCombat.level)]);
    return groups;
  }
  if(["season","technology"].includes(scanType)&&patch?.technology){
    if(scanType==="season"&&patch.season)buildRootGroups(groups,"season",patch.season);
    const tech=patch.technology;
    const items=[...Object.entries(tech.branches||{}).map(([key,entry])=>({key,entry,area:"branches"})),
      ...(tech.unmapped||[]).map((entry,key)=>({key,entry,area:"unmapped"}))];
    for(const {key,entry,area} of items){
      const path=["technology",area,key],rows=[
        row([...path,"name"],"name",entry.name||""),
        row([...path,"state"],"state",entry.state||"unknown",{forcedKind:"technologyState"}),
        row([...path,"percent"],"percent",entry.percent,{forcedKind:"technologyPercent"})
      ];
      if(entry.prerequisite||entry.state==="locked")rows.push(row([...path,"prerequisite"],"prerequisite",entry.prerequisite||""));
      groups.push({kind:"technology",branchName:entry.name||entry.visible_name||"",branchState:entry.state||"unknown",rows});
    }
    return groups;
  }
  const roots={
    profile:["player","alliance"],shop:["shop"],vs:["vs"],
    season:["season","technology"],exclusive:["exclusive_weapons"],awakening:["hero_progression"]
  }[scanType];
  if(!roots||!patch||typeof patch!=="object")return groups;
  for(const root of roots){
    const value=patch[root];
    if(value===undefined||value===null)continue;
    if(root==="exclusive_weapons"&&Array.isArray(value)){
      value.forEach((entry,index)=>pushGroup(groups,"hero",safeRows(entry,[root,index],true),index+1));
    }else if(root==="hero_progression"&&Array.isArray(value)){
      value.forEach((entry,index)=>pushGroup(groups,"progress",safeRows(entry,[root,index],true),index+1));
    }else buildRootGroups(groups,root,value);
  }
  return groups;
}

export function serializeScanReviewGear(parts){
  if(!Array.isArray(parts))return {error:"invalid_parts"};
  const rawSegments=[];
  for(const part of parts){
    if(!part||typeof part!=="object")return {error:"invalid_segment"};
    const countText=String(part.count??"").trim(),levelsText=String(part.levels??"").trim(),rarityText=String(part.rarity??"").trim();
    if(!countText&&!levelsText&&!rarityText)continue;
    if(!/^[1-4]$/.test(countText))return {error:"invalid_count"};
    let levels=[];
    if(levelsText){
      const entries=levelsText.split(/[\/,]/);
      if(entries.length>4||entries.some(entry=>!/^(?:0|[1-9]\d*)$/.test(entry.trim())))return {error:"invalid_levels"};
      levels=entries.map(entry=>Number(entry.trim()));
      if(levels.some(level=>level<0||level>100))return {error:"invalid_levels"};
    }
    if(rarityText&&rarityText.split(",").some(value=>!GEAR_RARITIES.has(value.trim().toLowerCase())))return {error:"invalid_rarity"};
    const fields=[`count=${countText}`];
    if(levels.length===1)fields.push(`level=${levels[0]}`);
    else if(levels.length>1)fields.push(`levels=${levels.join(",")}`);
    if(rarityText)fields.push(`rarity=${rarityText.toLowerCase()}`);
    rawSegments.push(fields.join(";"));
  }
  if(!rawSegments.length)return {value:""};
  const value=sanitizeGear(rawSegments.join("|"));
  if(!value)return {error:"invalid_gear"};
  const parsed=parseGear(value);
  if(!parsed.valid||parsed.segments.reduce((sum,segment)=>sum+segment.count,0)>4)return {error:"invalid_gear"};
  return {value};
}