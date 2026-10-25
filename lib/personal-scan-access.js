import {randomUUID} from "node:crypto";
import {requireProductUser,entitlementForUser} from "./pro-access.js";
import {accessPolicyRpc} from "./supabase.js";
import {freeScanNetworkDigest} from "./free-scan-network.js";

export const FREE_SCAN_TYPES=new Set(["profile","squad1","squad2","squad3","squad4","technology","drone","exclusive_weapon","exclusive"]);
export async function requirePersonalScanUser(req,{authorize=requireProductUser,consume=accessPolicyRpc,entitlement=entitlementForUser,networkDigest=freeScanNetworkDigest}={}){
  const type=String(req.body?.scan_type||"profile").toLowerCase();
  const {user}=await authorize(req,{consent:true});
  // Roster scan and advice remain PRO; FREE never grants a management role.
  if((await entitlement(user)).active)return {user};
  if(!FREE_SCAN_TYPES.has(type))throw Object.assign(new Error("Cette analyse nécessite un droit PRO vérifié."),{status:403,code:"PRO_REQUIRED"});
  const result=await consume("wb1_reserve_free_scan_v2",{p_user_id:user.id,p_request_id:randomUUID(),p_ip_digest:networkDigest(req)});
  if(result?.reserved!==true)throw Object.assign(new Error("Limite FREE du compte, du réseau ou du budget du jour atteinte. Aucun appel IA effectué. Réessaie plus tard."),{status:429,code:"FREE_SCAN_QUOTA_EXCEEDED"});
  return {user};
}
