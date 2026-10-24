// Canonical identity is derived from the visible title, never from a card's position.
export const TECHNOLOGY_NAMES={
  development:["Développement","Development"],
  economy:["Économie","Economy"],
  heroes:["Héros","Heroes"],
  units:["Unités","Units"],
  team_1:["Équipe 1","Team 1"],
  team_2:["Équipe 2","Team 2"],
  team_3:["Équipe 3","Team 3"],
  alliance_duel:["Duel d’Alliances","Alliance Duel"],
  intercity_truck:["Camion Interurbain","Intercity Truck"],
  special_forces:["Forces Spéciales","Special Forces"],
  siege_to_seize:["Assiéger pour Saisir","Siege to Seize"],
  defensive_fortification:["Fortification des Défenses","Defensive Fortification"],
  tank_specialization:["Spécialisation Tank","Tank Specialization"],
  missile_specialization:["Spécialisation Missile","Missile Specialization"],
  aircraft_specialization:["Spécialisation Avion","Aircraft Specialization"],
  oil_era:["L’Ère du Pétrole","The Oil Era"],
  team_4:["Équipe 4","Team 4"],
  tactical_weapon:["Arme Tactique","Tactical Weapon"]
};
const normalized=text=>String(text??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const aliases=new Map(Object.entries(TECHNOLOGY_NAMES).flatMap(([key,names])=>names.map(name=>[normalized(name),key])));
export function canonicalTechnologyName(name){
  const title=String(name??"").trim(),clean=normalized(title);
  if(!clean||title.length>80||clean.length<2||!/\p{L}/u.test(clean)||/^(unknown|unreadable|inconnu|illisible|carte inconnue|technology|technologie)(?: |$)/.test(clean)||["niveau max","locked","verrouillee"].includes(clean))return null;
  return aliases.get(clean)||`custom_${clean.replaceAll(" ","_").slice(0,64)}`;
}
export function parseTechnologyPercent(value){
  if(typeof value==="number")return Number.isFinite(value)&&value>=0&&value<=100?value:null;
  const text=String(value??"").trim(),match=text.match(/^(\d{1,3}(?:[.,]\d{1,2})?)\s*%$/);
  if(!match)return null;
  const n=Number(match[1].replace(",","."));return n>=0&&n<=100?n:null;
}
function technologyState(raw){
  const label=normalized(raw?.state||raw?.status||raw?.value||"");
  if(["niveau max","max level","level max","max"].includes(label))return "max";
  if(["verrouillee","verrouille","locked"].includes(label))return "locked";
  return "unknown";
}
export function sanitizeTechnologyCards(raw,now){
  const cards=Array.isArray(raw?.cards)?raw.cards:[];
  const branches={},unmapped=[],seen=new Map();
  for(const card of cards.slice(0,80)){
    if(!card||typeof card!=="object")continue;
    const name=String(card.name||card.title||"").trim().slice(0,80);
    const nameConfidence=Number(card.name_confidence);
    const key=card.name_evidence==="visible_text"&&nameConfidence>=0.9&&nameConfidence<=1?canonicalTechnologyName(name):null;
    const valueBound=card.value_evidence==="same_card"&&Number(card.value_confidence)>=0.9&&Number(card.value_confidence)<=1;
    const state=technologyState(card),stateEvidence=[card.state_evidence,card.value_evidence]
      .filter(value=>value!==undefined&&value!==null&&String(value).trim()!=="").map(String);
    const stateConfidence=Number(card.state_confidence??card.value_confidence);
    const stateBound=stateEvidence.length
      ?stateEvidence.every(value=>value==="same_card")&&stateConfidence>=0.9&&stateConfidence<=1
      :Boolean(key);
    const rawPercent=card.percent??card.progress_pct??card.value;
    const percent=valueBound?parseTechnologyPercent(rawPercent):null;
    const explicitTextState=["max","locked"].includes(state)&&stateBound?state:"unknown";
    const status=explicitTextState!=="unknown"?explicitTextState:percent!==null?"percent":"unknown";
    const prerequisite=status==="locked"&&card.prerequisite_evidence==="visible_text"?String(card.prerequisite||"").trim().slice(0,180):"";
    const entry={name,state:status,...(status==="percent"?{percent}:{}),...(prerequisite?{prerequisite}:{}),updated_at:now};
    if(key){
      const previous=branches[key];
      if(seen.has(key)){
        const sameObservation=previous&&previous.state===entry.state&&previous.percent===entry.percent&&
          String(previous.prerequisite||"").trim()===String(entry.prerequisite||"").trim();
        if(sameObservation)continue;
        if(previous)unmapped.push({...previous,visible_name:previous.name,name:""});
        delete branches[key];
        unmapped.push({...entry,visible_name:name,name:""});
        seen.set(key,null);
        continue; // contradictory duplicate in one image is not evidence
      }
      seen.set(key,entry);branches[key]=entry;
    }else if(name||status!=="unknown")unmapped.push({...entry,name:"",visible_name:name});
  }
  return {branches,unmapped};
}
export function normalizeTechnologyBranches(branches){
  const out={};
  for(const [key,value] of Object.entries(branches||{})){
    if(key!==canonicalTechnologyName(value?.name)||!value||typeof value!=="object")continue;
    const state=value.state,percent=parseTechnologyPercent(value.percent===null?null:`${value.percent}%`);
    if(!["percent","max","locked"].includes(state)||state==="percent"&&percent===null)continue;
    out[key]={name:String(value.name||TECHNOLOGY_NAMES[key][0]).slice(0,80),state,...(state==="percent"?{percent}:{}),
      ...(state==="locked"&&value.prerequisite?{prerequisite:String(value.prerequisite).slice(0,180)}:{}),
      updated_at:typeof value.updated_at==="string"?value.updated_at:null};
  }
  return out;
}
export function mergeTechnologyBranches(base,incoming){
  const out={...normalizeTechnologyBranches(base)};
  for(const [key,item] of Object.entries(normalizeTechnologyBranches(incoming))){
    const old=out[key],nextAt=Date.parse(item.updated_at||""),oldAt=Date.parse(old?.updated_at||"");
    if(!old||Number.isFinite(nextAt)&&(!Number.isFinite(oldAt)||nextAt>=oldAt))out[key]=item;
  }
  return out;
}
export function finalizeTechnologyReview(technology,now){
  if(!technology?.branches&&!technology?.unmapped)return technology;
  const branches={},duplicates=new Set();
  for(const [source,entry] of [...Object.entries(technology.branches||{}),...(technology.unmapped||[]).map((entry,index)=>[`unmapped-${index}`,entry])]){
    const key=canonicalTechnologyName(entry?.name);
    if(!key||duplicates.has(key))continue;
    const state=entry?.state,percent=parseTechnologyPercent(entry?.percent===undefined?null:`${entry.percent}%`);
    if(!["percent","max","locked"].includes(state)||state==="percent"&&percent===null)continue;
    if(branches[key]){delete branches[key];duplicates.add(key);continue}
    branches[key]={name:String(entry.name).trim(),state,...(state==="percent"?{percent}:{}),
      ...(state==="locked"&&entry.prerequisite?{prerequisite:String(entry.prerequisite).trim().slice(0,180)}:{}),updated_at:now};
  }
  const {unmapped,...legacy}=technology;
  return {...legacy,branches};
}