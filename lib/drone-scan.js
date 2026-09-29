const MIN_AUTOMATIC_POWER = 100_000;
const MAX_DRONE_POWER = 10_000_000_000;

export function classifyDroneScreen(extracted){
  const title=String(extracted?.screen_title||extracted?.drone?.screen_title||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  // A visible screen title takes precedence over a provider's generic screen_type.
  if(/boost\s*(?:de\s*)?combat|combat\s*boost/.test(title))return "combat_boost";
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
    const text=String(value).trim().replace(/[\u00a0\u202f\u2009]/g," ").replace(/[’‘]/g,"'");
    if(/^\d{6,10}$/.test(text))units=Number(text);
    else if(/^\d{1,3}(?: \d{3}){1,3}$/.test(text))units=Number(text.replace(/ /g,""));
    else if(/^\d{1,3}(?:\.\d{3}){2,3}$/.test(text))units=Number(text.replace(/\./g,""));
    else if(/^\d{1,3}(?:,\d{3}){2,3}$/.test(text))units=Number(text.replace(/,/g,""));
    else if(/^\d{1,3}(?:'\d{3}){2,3}$/.test(text))units=Number(text.replace(/'/g,""));
    else {
      const million=text.match(/^(\d{1,4}(?:[.,]\d{1,6})?)\s*M$/i);
      if(million)units=Math.round(Number(million[1].replace(",","."))*1_000_000);
    }
  }
  return Number.isSafeInteger(units)&&units>=MIN_AUTOMATIC_POWER&&units<=MAX_DRONE_POWER?units:null;
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
  const evidence=String(raw?.power_evidence||"").toLowerCase(),confidence=Number(raw?.power_confidence);
  const label=String(raw?.power_label||"").trim(),power=parseDronePowerUnits(raw?.power_raw);
  if(screenType!=="unknown"&&evidence==="visible_drone_power"&&confidence>=0.9&&confidence<=1&&label.length>=2&&label.length<=80&&!/^exact visible label/i.test(label)&&power!==null){
    drone.power_m=power/1_000_000;
  }
  if(Object.keys(drone).length)drone.updated_at=now;
  return {screenType,drone};
}