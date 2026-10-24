import {HERO_DEFINITIONS,catalogHeroName,heroKey} from "./heroes.js";
import {HERO_REFERENCE_INDEX,HERO_EXCLUSIVE_WEAPON_OWNERS} from "./hero-reference-index.js";
import {validatePortraitReference,portraitDiagnostics,portraitFeatureEligible} from "./portrait-diagnostics.js";

// Shared appearance contexts, NOT a claim that every hero has every upgrade.
// Verified capture references can be added without creating a second hero identity.
export const HERO_APPEARANCE_CONTEXTS=Object.freeze([
  {id:"normal",labels:["normal","standard"]},
  {id:"exclusive_weapon",labels:["exclusive weapon","arme exclusive","EW","EW30"],requiresVerifiedReference:true},
  {id:"awakening",labels:["awakening","awakened","éveil"]},
  {id:"ssr_to_ur",labels:["SSR UR","SSR to UR","promotion SSR UR"]},
  {id:"other_appearance",labels:["other appearance","autre apparence"]}
]);
export const HERO_IDENTITY_THRESHOLDS=Object.freeze({strong:0.88,medium:0.70,portraitOnlyMaximum:0.84});
export const HERO_RECOGNITION_LIBRARY=Object.freeze(HERO_DEFINITIONS.map(hero=>Object.freeze({
  id:heroKey(hero.name),canonicalName:hero.name,displayName:hero.displayName||hero.name,type:hero.type,
  aliases:Object.freeze([...(hero.aliases||[])]),
  equipment:Object.freeze(HERO_EXCLUSIVE_WEAPON_OWNERS.includes(hero.name)?["exclusive_weapon"]:[]),
  appearances:Object.freeze(HERO_APPEARANCE_CONTEXTS.filter(context=>
    context.id==="normal"||HERO_REFERENCE_INDEX.some(ref=>ref.canonicalName===hero.name&&ref.variant===context.id)||
    (context.id==="ssr_to_ur"&&["Mason","Violet","Scarlett"].includes(hero.name))
  ).map(context=>Object.freeze({
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
export function visibleHeroClass(raw={}){
  if(raw.class_evidence!=="visible_text"||validIdentityConfidence(raw.class_confidence)<HERO_IDENTITY_THRESHOLDS.strong)return null;
  return ({tank:"tank",aircraft:"aircraft",missile:"missile"})[heroKey(raw.class_text)]||null;
}
export function recognizeHeroIdentity(raw={},attachedReferences=[]){
  const score=validIdentityConfidence(raw.name_confidence),basis=short(raw.name_evidence).toLowerCase();
  const observed=short(raw.name_text)||(["visible_text","visible_fragment"].includes(basis)?short(raw.name):"");
  const observedName=recognitionHeroName(observed),claimedName=recognitionHeroName(raw.name);
  const portrait=raw.portrait&&typeof raw.portrait==="object"?raw.portrait:{};
  const portraitName=recognitionHeroName(portrait.candidate_name),portraitScore=validIdentityConfidence(portrait.confidence);
  const confidenceCap=validIdentityConfidence(portrait.zoom_evidence?.confidence_cap);
  const admissiblePortraitScore=portraitScore===null?null:Math.min(portraitScore,confidenceCap??1);
  const variant=heroAppearanceContext(portrait.variant);
  const validation=validatePortraitReference(portrait,portraitName,variant,Array.isArray(attachedReferences)?attachedReferences:[]);
  const reference=validation.reference;
  const features=[...new Set((Array.isArray(portrait.visible_features)?portrait.visible_features:[])
    .filter(portraitFeatureEligible).map(short).filter(Boolean))].slice(0,4);
  const diagnostic=portraitDiagnostics(portrait,portraitName,variant,portraitScore,features,validation,HERO_IDENTITY_THRESHOLDS.medium);
  // Model-reported visual observations are proposals, not a verified image match.
  // WarBoost's decorative SVGs must NEVER be used as Last War reference portraits.
  const classType=visibleHeroClass(raw);
  const classMismatch=Boolean(classType&&portraitName&&
    HERO_RECOGNITION_LIBRARY.find(hero=>hero.canonicalName===portraitName)?.type!==classType);
  const visual=portraitName&&variant&&
    (!HERO_APPEARANCE_CONTEXTS.find(context=>context.id===variant)?.requiresVerifiedReference||Boolean(reference))&&
    features.length>=2&&portraitScore!==null&&portraitScore>=HERO_IDENTITY_THRESHOLDS.medium;
  let candidate=null,effective=null,method="unresolved";
  const readable=["visible_text","visible_fragment"].includes(basis);
  if(readable&&score!==null&&score>=HERO_IDENTITY_THRESHOLDS.medium){
    candidate=observedName||matchRosterFragment(observed);
    if(candidate){effective=score;method=observedName?"visible_text":"visible_fragment_catalog"}
  }
  const visualContradictsLetters=readable&&observed&&visual&&
    ![portraitName,...(HERO_RECOGNITION_LIBRARY.find(hero=>hero.canonicalName===portraitName)?.aliases||[])]
      .some(label=>heroKey(label).includes(heroKey(observed)))&&!observedName;
  const claimedMismatch=Boolean(candidate&&claimedName&&candidate!==claimedName);
  let conflict=visualContradictsLetters||claimedMismatch||
    (observedName&&visual&&observedName!==portraitName)||
    (candidate&&visual&&candidate!==portraitName);
  const strongText=readable&&basis==="visible_text"&&score!==null&&score>=HERO_IDENTITY_THRESHOLDS.strong;
  const strongPortrait=Boolean(visual&&reference&&admissiblePortraitScore>=HERO_IDENTITY_THRESHOLDS.strong);
  let decision="no_conflict";
  if(conflict&&!claimedMismatch&&visual&&reference&&
    ((!readable||score===null||score<HERO_IDENTITY_THRESHOLDS.medium)||(strongPortrait&&!strongText))){
    candidate=portraitName;effective=Math.min(portraitScore,HERO_IDENTITY_THRESHOLDS.portraitOnlyMaximum);
    method="portrait_candidate";decision="verified_portrait_over_weak_ocr";conflict=false;
  }else if(conflict&&!claimedMismatch&&strongText&&candidate&&
    (!reference||(admissiblePortraitScore!==null&&admissiblePortraitScore<HERO_IDENTITY_THRESHOLDS.strong))){
    // A model confidence is not a valid reference match. A missing/wrong hero/
    // wrong variant reference must not veto independently legible strong OCR.
    // Preserve the rejected visual evidence, and still require player review.
    effective=score;method="visible_text";decision="strong_ocr_over_weak_portrait";conflict=false;
  }else if(conflict)decision=strongText&&strongPortrait?"strong_signals_conflict":"ambiguous_signals";
  if(conflict){candidate=null;effective=null;method="conflicting_identity"}
  else if(decision==="no_conflict"&&candidate&&visual){effective=Math.min(effective,portraitScore);method="text_portrait"}
  else if(decision==="no_conflict"&&!candidate&&visual){
    candidate=portraitName;effective=Math.min(portraitScore,HERO_IDENTITY_THRESHOLDS.portraitOnlyMaximum);method="portrait_candidate";
  }
  if(classType&&candidate&&HERO_RECOGNITION_LIBRARY.find(hero=>hero.canonicalName===candidate)?.type!==classType){
    candidate=null;effective=null;method="unresolved";decision="class_mismatch";
  }
  if(candidate&&confidenceCap!==null&&["portrait_candidate","text_portrait"].includes(method))
    effective=Math.min(effective,confidenceCap);
  const tier=candidate?(effective>=HERO_IDENTITY_THRESHOLDS.strong?"strong":"medium"):"low";
  diagnostic.tier=tier;
  if(conflict){diagnostic.accepted=false;diagnostic.reason="conflicting_identity";diagnostic.reasons.unshift("conflicting_identity")}
  if((classMismatch&&!conflict)||decision==="class_mismatch"){
    diagnostic.accepted=false;diagnostic.reason="class_mismatch";diagnostic.reasons.unshift("class_mismatch");
  }
  if(decision==="strong_ocr_over_weak_portrait"){
    diagnostic.accepted=false;diagnostic.reason="weak_portrait_overruled";
    diagnostic.reasons.unshift("weak_portrait_overruled");
  }
  diagnostic.arbitration={decision,text_candidate:observedName||null,text_confidence:score,
    portrait_candidate:portraitName,portrait_confidence:portraitScore,
    admissible_portrait_confidence:admissiblePortraitScore,visible_class:classType};
  return {name:candidate,evidence:{text:observed,confidence:effective,reported_text_confidence:score,
    method,tier,status:tier==="strong"?"proposed":tier==="medium"?"to_confirm":"unresolved",
    requires_confirmation:tier==="medium"||Boolean(candidate&&visual&&reference)||decision!=="no_conflict",candidate,
    portrait:{candidate:portraitName,confidence:portraitScore,variant,visible_features:features,
      reference_verified:Boolean(reference),reference_id:reference?.id||null,confidence_cap:confidenceCap,match_verified:false,diagnostic}}};
}
export function heroRecognitionPrompt(attachedReferences=[]){
  return `All ${HERO_RECOGNITION_LIBRARY.length} roster heroes are equally eligible. No priority, no popularity/rarity weighting, no preferred squad and no profile-based ranking.
Roster: ${JSON.stringify(HERO_RECOGNITION_LIBRARY.map(hero=>({name:hero.displayName,canonical_name:hero.canonicalName,type:hero.type,aliases:hero.aliases})))}.
Inspect each portrait AND readable name independently, without guessing. Appearance contexts: ${HERO_APPEARANCE_CONTEXTS.filter(x=>!x.requiresVerifiedReference||attachedReferences.some(ref=>ref.status==="verified"&&ref.variant===x.id)).map(x=>x.id).join(", ")}. An awakening, SSR-to-UR promotion or other verified appearance NEVER creates a different hero. Do not assume that every context exists for every hero. Exclusive weapons (EW/EW30) are equipment, NOT automatic visual evolutions. Use the normal appearance unless an attached verified reference explicitly attests a changed hero portrait; never infer a changed portrait from a weapon level or vehicle.
For a visual proposal return portrait:{candidate_name:string|null,confidence:number|null,variant:string|null,reference_id:string|null,visible_features:string[]}. Describe at least two distinguishing details actually visible in the PLAYER capture.
${attachedReferences.length?"Verified named-source reference atlases are attached separately. Compare the capture against them, return the exact reference_id only if the appearance really matches, and do not mistake atlas labels for OCR from the player capture. Normal references do not prove an Awakening, promotion or level-30 appearance. Source verification is not match verification. Every reference-assisted identity needs explicit user confirmation.":"Do not invent reference matches: no verified portrait reference library is attached."}
A visual proposal alone needs manual confirmation; it cannot establish a strong identity. Generic level, stars, gear, color or position alone are not identifying evidence.
Return the name OCR and portrait as separate observations with their own confidence, even when they disagree. Never suppress a reliable portrait solely to agree with weak OCR. Two strong contradictory signals remain unresolved on the server. Class is only a negative cross-class filter when explicitly visible with high confidence, never a source of a hero name. Do not infer class from a claimed Tank team, saved profile, level, stars, power or weapon.
Unreadable or ambiguous names stay null. Report separate text and portrait confidence honestly; never fill five names just to complete the formation.`;
}
