import {catalogHeroName} from "./heroes.js";

export const portraitFeatureEligible=feature=>typeof feature==="string"&&
  !/(?:level|lvl|niveau|stars?|power|puissance|hp|atk|étoiles?|etoiles?)|\blv\.?\s*\d|\d+\s*[★⭐]|^\s*[\d,.%+ -]+[Mk]?\s*$/i.test(feature);

// Reference IDs are opaque bank identifiers. Only casing and surrounding
// whitespace are normalized; no fuzzy match, path, URL or inferred reference.
export function validatePortraitReference(portrait,canonicalName,variant,references=[]){
  const reported=typeof portrait.reference_id==="string"?portrait.reference_id.trim().slice(0,120):"";
  if(!reported)return {reference:null,reason:"missing_reference_id"};
  const matches=references.filter(ref=>ref.status==="verified"&&
    typeof ref.id==="string"&&ref.id.toLowerCase()===reported.toLowerCase());
  if(matches.length!==1)return {reference:null,reason:matches.length?"ambiguous_candidates":"reference_not_found"};
  const ref=matches[0];
  if(catalogHeroName(ref.canonicalName)!==canonicalName)return {reference:null,reason:"hero_mismatch"};
  if(ref.variant!==variant)return {reference:null,reason:"variant_mismatch"};
  return {reference:ref,reason:null};
}

export function portraitDiagnostics(portrait,canonicalName,variant,score,features,validation,minimumConfidence){
  const rawCandidate=typeof portrait.candidate_name==="string"?portrait.candidate_name.trim().slice(0,120):"";
  const alternatives=rawCandidate.split(/\s*(?:\/|\||,|\bor\b|\bou\b)\s*/i).map(catalogHeroName).filter(Boolean);
  const reasons=[];
  if(new Set(alternatives).size>1)reasons.push("ambiguous_candidates");
  else if(!canonicalName)reasons.push("no_candidate");
  if(score===null)reasons.push("invalid_confidence");
  else if(score<minimumConfidence)reasons.push("confidence_below_threshold");
  if(features.length<2)reasons.push("insufficient_visual_details");
  if(!variant)reasons.push("unsupported_variant");
  if(validation.reason)reasons.push(validation.reason);
  return {
    reported_candidate:rawCandidate||null,canonical_name:canonicalName,
    raw_confidence:score,reported_confidence:typeof portrait.confidence==="number"||typeof portrait.confidence==="string"?String(portrait.confidence).slice(0,40):null,
    tier:"low",reported_variant:typeof portrait.variant==="string"?portrait.variant.slice(0,120):null,
    variant,reported_reference_id:typeof portrait.reference_id==="string"?portrait.reference_id.slice(0,120):null,
    validated_reference_id:validation.reference?.id||null,
    visible_details:features,
    discarded_details:(Array.isArray(portrait.discarded_visual_features)?portrait.discarded_visual_features:[])
      .filter(value=>typeof value==="string").map(value=>value.slice(0,120)).slice(0,4),
    accepted:reasons.length===0,reason:reasons[0]||"verified_reference_proposal",reasons
  };
}

const explanations={
  no_candidate:"aucun héros identifiable",
  confidence_below_threshold:"confiance visuelle insuffisante",
  invalid_confidence:"confiance visuelle non renseignée ou invalide",
  insufficient_visual_details:"détails visuels distinctifs insuffisants",
  unsupported_variant:"apparence non reconnue",
  missing_reference_id:"référence visuelle manquante",
  reference_not_found:"référence visuelle introuvable dans la banque",
  hero_mismatch:"référence visuelle d’un autre héros",
  variant_mismatch:"référence d’une autre apparence",
  ambiguous_candidates:"plusieurs identités possibles",
  class_mismatch:"le portrait ne correspond pas à la classe clairement visible",
  conflicting_identity:"le nom et le portrait se contredisent"
};
export function portraitDiagnosticLabel(identity){
  const diagnostic=identity?.portrait?.diagnostic;
  if(!diagnostic)return "";
  if(!identity.candidate&&diagnostic.zoom_evidence?.selection==="conflict")
    return "Identité non retenue : les deux lectures du portrait se contredisent.";
  if(!identity.candidate||identity.tier==="low")
    return `Identité non retenue : ${explanations[diagnostic.reason]||"preuve visuelle insuffisante"}.`;
  const tier={strong:"forte",medium:"moyenne",low:"faible"}[identity.tier]||"inconnue";
  return `${identity.candidate} proposée — confiance ${tier} — à confirmer.`;
}

// A low/unscored visual hypothesis may be shown as a proposal only when it
// resolves to a catalogue hero, the attached reference was validated server-
// side, and the model supplied at least two eligible visible portrait details.
// It is never copied into a slot name by this helper.
export function reviewablePortraitProposal(identity){
  if(identity?.tier!=="low")return null;
  const name=catalogHeroName(identity?.portrait?.candidate),diagnostic=identity?.portrait?.diagnostic;
  if(!name||identity.portrait.reference_verified!==true||typeof identity.portrait.reference_id!=="string"||
    diagnostic?.validated_reference_id?.toLowerCase?.()!==identity.portrait.reference_id.toLowerCase()||
    !identity.portrait.variant||diagnostic?.zoom_evidence?.selection==="conflict"||
    ["conflicting_identity","class_mismatch"].includes(diagnostic?.reason)||
    ["strong_signals_conflict","ambiguous_signals","class_mismatch"].includes(diagnostic?.arbitration?.decision))return null;
  const features=(identity.portrait.visible_features||[]).filter(portraitFeatureEligible);
  if(new Set(features).size<2)return null;
  const textCandidate=catalogHeroName(identity.text);
  if(textCandidate&&textCandidate!==name)return null;
  if(diagnostic?.arbitration?.text_candidate&&diagnostic.arbitration.text_candidate!==name)return null;
  return {name,features};
}

// Only named catalogue observations already supplied by the two reads.
// These are alternatives for a human, never votes or calibrated probabilities.
export function portraitConflictCandidates(identity){
  const zoom=identity?.portrait?.diagnostic?.zoom_evidence;
  if(zoom?.selection!=="conflict"||zoom.derived_from_same_capture!==true)return null;
  const full=catalogHeroName(zoom.full_capture?.candidate_name);
  const crop=catalogHeroName(zoom.zoom?.candidate_name);
  return full&&crop&&full!==crop?{full,zoom:crop}:null;
}
