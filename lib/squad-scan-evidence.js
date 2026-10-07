import {catalogHeroName,catalogHero,heroKey} from "./heroes.js";
import {parseHeroPower} from "./hero-power.js";
import {canonicalPowerMillions} from "./power-units.js";
import {confirmedCompositionForSquad,squadForStableSlot} from "./squad-identity.js";

const text=value=>typeof value==="string"?value.trim().slice(0,100):"";
const confidence=value=>value!==null&&value!==""&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1?Number(value):null;

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
  const score=confidence(raw.name_confidence),basis=text(raw.name_evidence).toLowerCase();
  const observed=text(raw.name_text)||(["visible_text","visible_fragment"].includes(basis)?text(raw.name):"");
  let name=null,method="unresolved";
  if(basis==="visible_text"&&score!==null&&score>=0.88){
    const observedName=catalogHeroName(observed),claimedName=catalogHeroName(raw.name);
    if(observedName&&(!claimedName||claimedName===observedName)){name=observedName;method="visible_text"}
  }
  if(!name&&["visible_text","visible_fragment"].includes(basis)&&score!==null&&score>=0.90){
    const fragment=heroKey(observed).replace(/[^a-z0-9]/g,"");
    if(fragment.length>=4){
      const matches=[...new Set(knownNames.map(catalogHeroName).filter(Boolean))].filter(candidate=>{
        const hero=catalogHero(candidate);
        return [candidate,...(hero?.aliases||[])].some(alias=>heroKey(alias).replace(/[^a-z0-9]/g,"").includes(fragment));
      });
      // A conflicting full readable identity must never be rewritten using hints.
      if(matches.length===1&&!catalogHeroName(observed)&&(!catalogHeroName(raw.name)||catalogHeroName(raw.name)===matches[0])){
        name=matches[0];method="visible_fragment_and_confirmed_profile";
      }
    }
  }
  const rawPower=text(raw.power_text),powerScore=confidence(raw.power_confidence);
  const invalidScore=raw.power_confidence!=null&&raw.power_confidence!==""&&powerScore===null;
  const parsedText=rawPower?parseHeroPower(rawPower):null,parsedNumber=parseHeroPower(raw.power);
  const contradiction=parsedText!==null&&parsedNumber!==null&&Math.abs(canonicalPowerMillions(parsedText)-canonicalPowerMillions(parsedNumber))>0.001;
  let power=rawPower?parsedText:parsedNumber;
  const powerMethod=contradiction?"conflicting_values":invalidScore?"invalid_confidence":powerScore!==null&&powerScore<0.90?"low_confidence":power!==null&&power>0?"visible_value":rawPower?"unreadable":"missing";
  if(contradiction||invalidScore||powerScore!==null&&powerScore<0.90||power===null||power<=0)power=null;
  return {name,power,evidence:{
    identity:{text:observed,confidence:score,method},
    power:{text:rawPower||String(raw.power??"").slice(0,100),confidence:powerScore,method:powerMethod}
  }};
}

export function mergeScanEvidence(current={},incoming={}){
  const out={};
  for(const field of ["identity","power"]){
    const old=current[field],next=incoming[field];
    const accepted=value=>["visible_text","visible_fragment_and_confirmed_profile","visible_value"].includes(value?.method);
    // A new accepted value must retain its own evidence, not an older higher score.
    const selected=!next?old:!old?next:accepted(old)&&!accepted(next)?old:next;
    if(selected)out[field]=JSON.parse(JSON.stringify(selected));
  }
  return out;
}

export function squadExtractionPrompt(knownNames=[]){
  return `
Read the five visible hero rows/cards separately, in screen order; never substitute the total squad power for an individual power.
For EACH of the five slots return name_text (exact readable letters, or null), name_evidence ("visible_text", "visible_fragment" or "unreadable"), name_confidence (0..1 or null), power_text (exact individual power text with M/K unit, or null), power_confidence (0..1 or null), and any clearly visible level/stars/gear.
Read small text carefully, including comma decimal separators and unit suffixes. A missing individual power must remain null; never divide the total by five, sum other stats, copy an old power, or use a portrait as name evidence.
Confirmed names from THIS authenticated player's squad, if available: ${JSON.stringify(knownNames)}.
These names are disambiguation hints ONLY for genuinely visible name letters; they are NOT the current formation. Do not copy them by slot order or fill unreadable names from the list. A portrait, level, star count, color, equipment or screen position alone cannot identify a hero.
When only a fragment is readable preserve that exact fragment in name_text, set name_evidence="visible_fragment", and do not invent the missing letters. The server, not you, will check whether it matches one confirmed name uniquely.
Return all five slots even when some fields are unreadable. No extra provider pass or external Last War access is allowed.`;
}
