// Account access, invitation access and PRO are three independent states.
export function betaCodeVisible(state,{logged=false,betaGranted=false}={}){
  return Boolean(logged&&!betaGranted&&state?.alliance_beta_allowed!==true&&
    state?.beta_code_eligible===true&&
    !["revoked","expired","owner-mismatch"].includes(state?.beta_access_status));
}
export function betaActivationErrorKey(code){
  return ({
    BETA_CODE_INVALID:"beta_code_invalid",BETA_CODE_EXPIRED:"beta_code_expired",
    BETA_CODE_FULL:"beta_code_full",BETA_ACCESS_REVOKED:"beta_access_revoked",
    BETA_INVITE_REVOKED:"beta_access_revoked",BETA_INVITE_EXPIRED:"beta_access_expired",
    BETA_INVITE_OWNER_MISMATCH:"beta_invitation_other_account"
  })[code]||"beta_code_error";
}
export function betaActivationSucceeded(response,json){
  return Boolean(response?.ok&&json?.ok===true&&json.allowed===true);
}