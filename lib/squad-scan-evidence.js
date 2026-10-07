import {catalogHeroName} from "./heroes.js";
import {parseHeroPower} from "./hero-power.js";
import {canonicalPowerMillions} from "./power-units.js";
import {confirmedCompositionForSquad,squadForStableSlot} from "./squad-identity.js";
import {recognizeHeroIdentity,heroRecognitionPrompt,validIdentityConfidence} from "./hero-recognition.js";

const text=value=>typeof value==="string"?value.trim().slice(0,100):"";
const confidence=validIdentityConfidence;

// Context is a hint, not evidence of what the screenshot contains.
export function confirmedSquadHints(state,squadId,userId){
  if(!userId||state?.player_id!==userId)return [];
  const squad=squadForStableSlot(state.squads,squadId);
  const composition=confirmedCompositionForSquad(squad||{},squadId);
  if(!composition)return [];
  const names=composition.map(catalogHeroName);
  return names.length===5&&names.every(Boolean)&&new Set(names).size===5?names:[];
}

export function squadEvidence(raw={},knownNames=[]){
  const identity=recognizeHeroIdentity(raw),name=identity.name;
  const rawPower=text(raw.power_text),powerScore=confidence(raw.power_confidence);
  const invalidScore=raw.power_confidence!=null&&raw.power_confidence!==""&&powerScore===null;
  const parsedText=rawPower?parseHeroPower(rawPower):null,parsedNumber=parseHeroPower(raw.power);
  const contradiction=parsedText!==null&&parsedNumber!==null&&Math.abs(canonicalPowerMillions(parsedText)-canonicalPowerMillions(parsedNumber))>0.001;
  let power=rawPower?parsedText:parsedNumber;
  const powerMethod=contradiction?"conflicting_values":invalidScore?"invalid_confidence":powerScore!==null&&powerScore<0.90?"low_confidence":power!==null&&power>0?"visible_value":rawPower?"unreadable":"missing";
  if(contradiction||invalidScore||powerScore!==null&&powerScore<0.90||power===null||power<=0)power=null;
  return {name,power,evidence:{
    identity:identity.evidence,
    power:{text:rawPower||String(raw.power??"").slice(0,100),confidence:powerScore,method:powerMethod}
  }};
}

export function mergeScanEvidence(current={},incoming={}){
  const out={};
  for(const field of ["identity","power"]){
    const old=current[field],next=incoming[field];
    const accepted=value=>["visible_text","visible_fragment_and_confirmed_profile","visible_fragment_catalog","text_portrait","portrait_candidate","visible_value"].includes(value?.method);
    // A new accepted value must retain its own evidence, not an older higher score.
    const selected=!next?old:!old?next:accepted(old)&&!accepted(next)?old:next;
    if(selected)out[field]=JSON.parse(JSON.stringify(selected));
  }
  return out;
}

export function squadExtractionPrompt(knownNames=[]){
  return `
Read the five visible hero rows/cards separately, in screen order; never substitute the total squad power for an individual power.
 ${heroRecognitionPrompt()}
For EACH of the five slots return name_text (exact readable letters, or null), name_evidence ("visible_text", "visible_fragment" or "unreadable"), name_confidence (0..1 or null), power_text (exact individual power text with M/K unit, or null), power_confidence (0..1 or null), and any clearly visible level/stars/gear.
Read small text carefully, including comma decimal separators and unit suffixes. A missing individual power must remain null; never divide the total by five, sum other stats or copy an old power. Never put a portrait guess into readable name text.
The complete roster, not a saved composition, defines eligible identities. Profile context is disambiguation hints ONLY, never identity evidence. Do not copy old names by slot order or fill unreadable names from a profile. Never identify from level, star count, color, equipment or position alone.
When only a fragment is readable preserve that exact fragment in name_text, set name_evidence="visible_fragment", and do not invent the missing letters. The server checks uniqueness across the ENTIRE roster, with no hero priority.
Return all five slots even when some fields are unreadable. No extra provider pass or external Last War access is allowed.`;
}
