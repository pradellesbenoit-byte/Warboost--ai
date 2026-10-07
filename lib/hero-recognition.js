import {HERO_DEFINITIONS,catalogHeroName,heroKey} from "./heroes.js";
import {HERO_REFERENCE_INDEX} from "./hero-reference-index.js";

// Shared appearance contexts, NOT a claim that every hero has every upgrade.
// Verified capture references can be added without creating a second hero identity.
export const HERO_APPEARANCE_CONTEXTS=Object.freeze([
  {id:"normal",labels:["normal","standard"]},
  {id:"exclusive_weapon",labels:["exclusive weapon","arme exclusive"]},
  {id:"awakening",labels:["awakening","awakened","éveil"]},
  {id:"ssr_to_ur",labels:["SSR UR","SSR to UR","promotion SSR UR"]},
  {id:"other_appearance",labels:["other appearance","autre apparence"]}
]);
export const HERO_IDENTITY_THRESHOLDS=Object.freeze({strong:0.88,medium:0.70,portraitOnlyMaximum:0.84});
export const HERO_RECOGNITION_LIBRARY=Object.freeze(HERO_DEFINITIONS.map(hero=>Object.freeze({
  id:heroKey(hero.name),canonicalName:hero.name,displayName:hero.displayName||hero.name,type:hero.type,
  aliases:Object.freeze([...(hero.aliases||[])]),
  appearances:Object.freeze(HERO_APPEARANCE_CONTEXTS.map(context=>Object.freeze({
    id:context.id,availability:HERO_REFERENCE_INDEX.some(ref=>ref.canonicalName===hero.name&&ref.variant===context.id)?"verified":"unverified",
    references:Object.freeze(HERO_REFERENCE_INDEX.filter(ref=>ref.canonicalName===hero.name&&ref.variant===context.id))
  })))
})));
export function validIdentityConfidence(value){
  if(typeof value!=="number"&&typeof value!=="string")return null;
  if(typeof value==="string"&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))return null;
  return Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1?Number(value):null;
}
export function heroAppearanceContext(value){
  const key=heroKey(value);
  return HERO_APPEARANCE_CONTEXTS.find(context=>[context.id,...context.labels].some(label=>heroKey(label)===key))?.id||null;
}
export function recognitionHeroName(value){
  const exact=catalogHeroName(value);if(exact)return exact;
  const key=heroKey(value);if(!key)return null;
  const matches=HERO_RECOGNITION_LIBRARY.filter(hero=>
    [hero.canonicalName,hero.displayName,...hero.aliases].some(alias=>
      HERO_APPEARANCE_CONTEXTS.some(context=>[context.id,...context.labels].some(label=>
        key===heroKey(alias)+heroKey(label)||key===heroKey(label)+heroKey(alias)))));
  return matches.length===1?matches[0].canonicalName:null;
}
export function matchRosterFragment(value){
  const fragment=heroKey(value);
  if(fragment.length<4)return null;
  const matches=HERO_RECOGNITION_LIBRARY.filter(hero=>
    [hero.canonicalName,hero.displayName,...hero.aliases].some(alias=>heroKey(alias).includes(fragment)));
  return matches.length===1?matches[0].canonicalName:null;
}
const short=value=>typeof value==="string"?value.trim().slice(0,120):"";
export function recognizeHeroIdentity(raw={},attachedReferences=[]){
  const score=validIdentityConfidence(raw.name_confidence),basis=short(raw.name_evidence).toLowerCase();
  const observed=short(raw.name_text)||(["visible_text","visible_fragment"].includes(basis)?short(raw.name):"");
  const observedName=recognitionHeroName(observed),claimedName=recognitionHeroName(raw.name);
  const portrait=raw.portrait&&typeof raw.portrait==="object"?raw.portrait:{};
  const portraitName=recognitionHeroName(portrait.candidate_name),portraitScore=validIdentityConfidence(portrait.confidence);
  const variant=heroAppearanceContext(portrait.variant);
  const reference=Array.isArray(attachedReferences)?attachedReferences.find(ref=>
    ref.status==="verified"&&ref.id===short(portrait.reference_id)&&ref.canonicalName===portraitName&&ref.variant===variant):null;
  const features=[...new Set((Array.isArray(portrait.visible_features)?portrait.visible_features:[]).map(short).filter(Boolean))].slice(0,4);
  // Model-reported visual observations are proposals, not a verified image match.
  // WarBoost's decorative SVGs must NEVER be used as Last War reference portraits.
  const visual=portraitName&&variant&&features.length>=2&&portraitScore!==null&&portraitScore>=HERO_IDENTITY_THRESHOLDS.medium;
  let candidate=null,effective=null,method="unresolved";
  const readable=["visible_text","visible_fragment"].includes(basis);
  if(readable&&score!==null&&score>=HERO_IDENTITY_THRESHOLDS.medium){
    candidate=observedName||matchRosterFragment(observed);
    if(candidate){effective=score;method=observedName?"visible_text":"visible_fragment_catalog"}
  }
  const visualContradictsLetters=readable&&observed&&visual&&
    ![portraitName,...(HERO_RECOGNITION_LIBRARY.find(hero=>hero.canonicalName===portraitName)?.aliases||[])]
      .some(label=>heroKey(label).includes(heroKey(observed)))&&!observedName;
  const conflict=visualContradictsLetters||(candidate&&claimedName&&candidate!==claimedName)||
    (observedName&&visual&&observedName!==portraitName)||
    (candidate&&visual&&candidate!==portraitName);
  if(conflict){candidate=null;effective=null;method="conflicting_identity"}
  else if(candidate&&visual){effective=Math.min(effective,portraitScore);method="text_portrait"}
  else if(!candidate&&visual&&!observedName){
    candidate=portraitName;effective=Math.min(portraitScore,HERO_IDENTITY_THRESHOLDS.portraitOnlyMaximum);method="portrait_candidate";
  }
  const tier=candidate?(effective>=HERO_IDENTITY_THRESHOLDS.strong?"strong":"medium"):"low";
  return {name:candidate,evidence:{text:observed,confidence:effective,reported_text_confidence:score,
    method,tier,status:tier==="strong"?"proposed":tier==="medium"?"to_confirm":"unresolved",
    requires_confirmation:tier==="medium"||Boolean(candidate&&visual&&reference),candidate,
    portrait:{candidate:portraitName,confidence:portraitScore,variant,visible_features:features,
      reference_verified:Boolean(reference),reference_id:reference?.id||null,match_verified:false}}};
}
export function heroRecognitionPrompt(attachedReferences=[]){
  return `All ${HERO_RECOGNITION_LIBRARY.length} roster heroes are equally eligible. No priority, no popularity/rarity weighting, no preferred squad and no profile-based ranking.
Roster: ${JSON.stringify(HERO_RECOGNITION_LIBRARY.map(hero=>({name:hero.displayName,canonical_name:hero.canonicalName,type:hero.type,aliases:hero.aliases})))}.
Inspect each portrait AND readable name independently, without guessing. Appearance contexts: ${HERO_APPEARANCE_CONTEXTS.map(x=>x.id).join(", ")}. An exclusive weapon, awakening, SSR-to-UR promotion or other appearance NEVER creates a different hero. Do not assume that every context exists for every hero.
For a visual proposal return portrait:{candidate_name:string|null,confidence:number|null,variant:string|null,reference_id:string|null,visible_features:string[]}. Describe at least two distinguishing details actually visible in the PLAYER capture.
${attachedReferences.length?"Verified named-source reference atlases are attached separately. Compare the capture against them, return the exact reference_id only if the appearance really matches, and do not mistake atlas labels for OCR from the player capture. Normal references do not prove an Awakening, promotion or level-30 appearance. Source verification is not match verification. Every reference-assisted identity needs explicit user confirmation.":"Do not invent reference matches: no verified portrait reference library is attached."}
A visual proposal alone needs manual confirmation; it cannot establish a strong identity. Generic level, stars, gear, color or position alone are not identifying evidence.
Unreadable or ambiguous names stay null. Report separate text and portrait confidence honestly; never fill five names just to complete the formation.`;
}
