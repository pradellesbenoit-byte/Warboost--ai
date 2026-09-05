import {requireUser} from "../lib/auth.js";
import {betaAccessForUser} from "../lib/beta-access.js";

// V2.5.24 Safe Launch: no payment provider code is shipped in this build.
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  try{
    const user=await requireUser(req);
    const beta=betaAccessForUser(user);
    if(req.method==="GET")return res.status(200).json({
      ok:true,beta:true,release:true,safe_launch:true,configured:false,
      beta_configured:beta.configured,enforced:beta.enforced,allowed:beta.allowed,
      invited_count:beta.invited_count,consent_version:beta.consent_version,
      access_status:beta.access_status,active:Boolean(beta.allowed),
      status:beta.allowed?"beta":"invite_required",plan:null,
      payments_enabled:false,pro_included:Boolean(beta.allowed)
    });
    if(req.method==="POST")return res.status(403).json({
      ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",
      message:"WarBoost payments are disabled in the Safe Launch beta. PRO features are included for invited testers."
    });
    return res.status(405).json({error:"method_not_allowed"});
  }catch(e){
    return res.status(e?.status||500).json({error:e?.code||"pro_error",message:e?.message||"WarBoost PRO error"});
  }
}
