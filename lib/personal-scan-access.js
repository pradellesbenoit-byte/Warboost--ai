import {requireProductUser} from "./pro-access.js";
import {FREE_MANUAL_SCAN_TYPES} from "./free-scan-copy.js";

// Scans are a free capture/review workflow. Until an explicitly approved,
// non-paid local extractor exists, this provider-backed endpoint must not call
// an AI service or reserve a scan quota.
export const FREE_SCAN_TYPES=new Set(FREE_MANUAL_SCAN_TYPES);
export async function requirePersonalScanUser(req,{authorize=requireProductUser}={}){
  const type=String(req.body?.scan_type||"profile").toLowerCase();
  const {user}=await authorize(req,{consent:true});
  if(!FREE_SCAN_TYPES.has(type))throw Object.assign(new Error("Type de capture invalide."),{status:400,code:"INVALID_SCAN_TYPE"});
  throw Object.assign(new Error("La reconnaissance automatique gratuite n'est pas disponible dans cette version. Aucun fournisseur IA n'a été appelé."),{
    status:503,code:"SCAN_MANUAL_ONLY",quota_reserved:false
  });
}
