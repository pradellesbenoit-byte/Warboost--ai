// WarBoost V2.5.24 — Safe Launch hard lock.
// External game integrations are intentionally disabled in this public invite-only beta.
// A future authorized integration must ship in a separate reviewed build.
export function providerConfig(){
  return {
    official:false,
    approved:false,
    legacy:false,
    authorization_status:"safe-launch-disabled",
    approval_required:true,
    safe_launch_lock:true
  };
}
export async function fetchLastWarState(){
  throw Object.assign(
    new Error("External game integration is disabled in this WarBoost Safe Launch build. Use WarBoost Scan, manual input and WarBoost Cloud."),
    {code:"PROVIDER_NOT_CONNECTED",status:503,safe_launch_lock:true}
  );
}
