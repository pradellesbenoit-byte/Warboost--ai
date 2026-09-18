export const PENDING_AUTH_EMAIL_KEY="warboost_v1_pending_email";

export function clearSignedOutAuthUi({storage=globalThis.localStorage,documentRef=globalThis.document}={}){
  try{storage?.removeItem?.(PENDING_AUTH_EMAIL_KEY)}catch{}
  for(const id of ["authEmail","authPassword","authOtp"]){
    try{const input=documentRef?.getElementById?.(id);if(input)input.value=""}catch{}
  }
  try{documentRef?.getElementById?.("otpBox")?.classList?.add("hidden")}catch{}
}
