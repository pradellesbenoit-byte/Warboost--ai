const MIN_AUTOMATIC_POWER = 100_000;
const MAX_DRONE_POWER = 10_000_000_000;

export function classifyDroneScreen(extracted){
  const title=String(extracted?.screen_title||extracted?.drone?.screen_title||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  // A visible screen title takes precedence over a provider's generic screen_type.
  if(/boost\s*(?:de\s*)?combat|combat\s*boost/.test(title))return "combat_boost";
  if(/attributs\s*(?:du\s*)?drone|drone\s*attributes/.test(title))return "attributes";
  const type=String(extracted?.screen_type||extracted?.drone?.screen_type||"").toLowerCase().replace(/[\s-]+/g,"_");
  if(["combat_boost","boost_combat"].includes(type))return "combat_boost";
  if(["attributes","attributs","drone_attributes"].includes(type))return "attributes";
  if(["components","composants","drone_components"].includes(type))return "components";
  if(["skill_chip","puce_de_competence","skill_chips"].includes(type))return "skill_chip";
  return "unknown";
}

/** Parse a visible whole Drone power in raw game units, never in millions. */
export function parseDronePowerUnits(value){
  if(value===null||value===undefined)return null;
  let units=null;
  if(typeof value==="number"){
    if(Number.isSafeInteger(value))units=value;
  }else{
    const text=String(value).trim().replace(/\s+/g," ").replace(/[’‘]/g,"'");
    if(/^\d{6,11}$/.test(text))units=Number(text);
    else if(/^\d{1,3}(?: \d{3}){1,3}$/.test(text.replace(/ +/g," ")))units=Number(text.replace(/ /g,""));
    else if(/^\d{1,3}(?:\.\d{3}){1,3}$/.test(text))units=Number(text.replace(/\./g,""));
    else if(/^\d{1,3}(?:,\d{3}){1,3}$/.test(text))units=Number(text.replace(/,/g,""));
    else if(/^\d{1,3}(?:'\d{3}){1,3}$/.test(text))units=Number(text.replace(/'/g,""));
    else {
      const million=text.match(/^(\d{1,4}(?:[.,]\d{1,6})?)\s*M$/i);
      if(million)units=Math.round(Number(million[1].replace(",","."))*1_000_000);
    }
  }
  return Number.isSafeInteger(units)&&units>=MIN_AUTOMATIC_POWER&&units<=MAX_DRONE_POWER?units:null;
}

function excludedPowerLabel(value){
  const label=String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return /[%+]|\d\s*\/\s*\d|(?:^|\W)(?:pv|hp|atq|atk|def|attack|defense|health|ressources?|resources?|gold|or|food|nourriture|iron|fer|oil|petrole|fuel|diamonds?|diamants?|progression|progress|exp|xp|niveau|level)(?:$|\W)/.test(label);
}

/** Header evidence may be icon-associated: a printed "Power" label is not required. */
export function selectDronePowerCandidate(extracted){
  const screenType=classifyDroneScreen(extracted),raw=extracted?.drone||{};
  if(screenType==="unknown")return null;
  const candidates=Array.isArray(raw.power_candidates)?raw.power_candidates.slice(0,16):[];
  const legacy={text:raw.power_raw,label:raw.power_label,evidence:raw.power_evidence,
    confidence:raw.power_confidence,region:raw.power_region,anchor:raw.power_anchor};
  const accepted=[];
  for(const candidate of [...candidates,legacy]){
    if(!candidate||typeof candidate!=="object")continue;
    const units=parseDronePowerUnits(candidate.text),confidence=Number(candidate.confidence);
    if(units===null||confidence<0.9||confidence>1||!Number.isFinite(confidence)||
      String(candidate.evidence||"").toLowerCase()!=="visible_drone_power"||excludedPowerLabel(candidate.label))continue;
    const header=screenType==="attributes"&&candidate.region==="drone_power_header"&&candidate.anchor==="above_drone_attributes";
    // New candidates require spatial evidence; the backwards-compatible single
    // field still requires its explicit label and cannot contradict a known zone.
    const label=String(candidate.label||"").trim();
    const labelled=candidate===legacy&&label.length>=2&&label.length<=80&&!/^exact visible label/i.test(label)&&
      (!candidate.region||candidate.region==="drone_power_header"&&header);
    if(header||labelled)accepted.push({units,confidence,header});
  }
  const pool=accepted.some(c=>c.header)?accepted.filter(c=>c.header):accepted;
  pool.sort((a,b)=>b.confidence-a.confidence);
  const best=pool[0];if(!best)return null;
  if(pool.some(c=>c.units!==best.units&&best.confidence-c.confidence<0.05-1e-9))return null;
  return best;
}

export function sanitizeDroneScan(extracted,now){
  const screenType=classifyDroneScreen(extracted),raw=extracted?.drone||{},drone={};
  const levelSource=screenType==="combat_boost"
    ?(extracted?.boostCombat?.level??extracted?.boost_combat?.level??raw?.boostCombat?.level??raw?.level)
    :screenType==="attributes"?raw?.level:null;
  const levelText=typeof levelSource==="number"?String(levelSource):String(levelSource??"").trim();
  const levelMatch=levelText.match(/^(?:(?:lv|lvl|level|niv|niveau)\.?\s*)?(\d{1,4})$/i);
  const level=levelMatch?Number(levelMatch[1]):null;
  if(levelSource!==null&&levelSource!==undefined&&levelSource!==""&&Number.isInteger(level)&&level>=1&&level<=5000){
    if(screenType==="combat_boost")drone.boostCombat={level,updated_at:now};
    else if(screenType==="attributes")drone.level=level;
  }
  const power=selectDronePowerCandidate(extracted);
  if(power){
    drone.power_m=power.units/1_000_000;
  }
  for(const [type,field] of [["components","components"],["skill_chip","skill_chips"]]){
    if(screenType!==type)continue;
    const items=Array.isArray(raw?.[field])?raw[field]:Array.isArray(raw?.drone?.[field])?raw.drone[field]:[];
    const named=new Map();
    for(const row of items.slice(0,16)){
      const name=String(row?.name||"").trim(),level=Number(row?.level),confidence=Number(row?.confidence);
      if(name.length<2||name.length>80||row?.evidence!=="visible_same_card"||!Number.isFinite(confidence)||confidence<0.9||confidence>1||row.level==null||!Number.isInteger(level)||level<0||level>5000)continue;
      named.set(name.toLowerCase(),{name,level,updated_at:now});
    }
    if(named.size)drone[field]=[...named.values()];
  }
  if(Object.keys(drone).length)drone.updated_at=now;
  return {screenType,drone};
}