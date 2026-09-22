const RANK_RE=/^R[1-5]$/;

export const MANUAL_RANK_SOURCE="r5_r4_manual_rank_management";
export const LAST_WAR_SCAN_RANK_SOURCE="lastwar_scan";

function clean(value){return String(value??"").trim().toUpperCase()}

export function explicitAllianceRank(value){
  const rank=clean(value);
  return RANK_RE.test(rank)?rank:null;
}

export function explicitLastWarManagerRank(value){
  const rank=explicitAllianceRank(value);
  return rank==="R4"||rank==="R5"?rank:null;
}

export function confirmedRankTimestamp(row={}){
  const stamp=Date.parse(String(row?.rank_confirmed_at||""));
  return Number.isFinite(stamp)?stamp:0;
}

export function rankEvidencePriority(source){
  if(source===MANUAL_RANK_SOURCE)return 2;
  if(source===LAST_WAR_SCAN_RANK_SOURCE)return 1;
  return 0;
}

export function preferredRankEvidence(current={},candidate={}){
  const currentAt=confirmedRankTimestamp(current),candidateAt=confirmedRankTimestamp(candidate);
  if(candidateAt!==currentAt)return candidateAt>currentAt?candidate:current;
  const currentPriority=rankEvidencePriority(current?.rank_confirmed_source);
  const candidatePriority=rankEvidencePriority(candidate?.rank_confirmed_source);
  if(candidatePriority!==currentPriority)return candidatePriority>currentPriority?candidate:current;
  return candidateAt>0&&candidate?.role?candidate:current;
}

export function rankConfirmationStatus(row={}){
  if(row?.rank_confirmed_source===MANUAL_RANK_SOURCE&&confirmedRankTimestamp(row)>0)return "confirmed_manual";
  if(row?.rank_confirmed_source===LAST_WAR_SCAN_RANK_SOURCE&&confirmedRankTimestamp(row)>0)return "confirmed_scan";
  if(explicitAllianceRank(row?.role))return "legacy_observed";
  return "unconfirmed";
}