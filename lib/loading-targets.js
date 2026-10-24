// Presentation only. Do not inspect tokens, profile contents or personal data.
export function loadingTargetIds(kind){
  if(kind==="scan:roster")return ["rosterScanStatus"];
  if(kind==="scan")return ["scanStatus"];
  if(kind==="roster:update")return ["rosterScanImportBtn"];
  if(kind==="advice:player")return ["playerAdviceBtn","adviceText"];
  if(kind==="advice:alliance")return ["warPlanBtn","warPlanText"];
  if(kind==="advice:vs")return ["vsPlanBtn","vsPlanText"];
  if(kind==="advice:season")return ["seasonAdviceBtn","seasonAdviceText"];
  if(kind==="advice:knowledge")return ["knowledgeRefreshBtn","adviceText"];
  if(kind==="sync")return ["syncPlayerBtn","syncAllBtn","syncPill"];
  return ["syncPill"];
}
export function requestLoadingTargetIds(input,init={},syncAlreadyVisible=false){
  const url=String(input).split("?")[0];
  if(url==="/api/scan")return []; // Whole conversion/batch lifecycle owns the scan target.
  if(url==="/api/advice")return []; // Advice scope/batch owns the target.
  if(url==="/api/sync")return syncAlreadyVisible?[]:["syncPill"]; // Do not duplicate the owning button feedback.
  if(url==="/api/state")return ["syncPill"];
  if(url==="/api/cloud-config"||url==="/api/pro")return ["betaRestoreRetryBtn","syncPill"];
  if(url==="/api/alliance-role")return ["rankManagerStatus","rosterImportStatus","syncPill"];
  if(url==="/api/invite"||url==="/api/join")return ["shareInviteBtn","joinAllianceBtn","syncPill"];
  if(url==="/api/support")return ["supportSubmitBtn","supportRefreshBtn","syncPill"];
  if(url.includes("/account")||url.includes("/delete"))return ["accountDeletionStatus"];
  // Clock pings, analytics and instantaneous operations are deliberately silent.
  return [];
}
