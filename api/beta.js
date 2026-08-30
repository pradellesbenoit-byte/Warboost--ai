import {requireUser} from "../lib/auth.js";
import {betaAccessForUser,betaConfig} from "../lib/beta-access.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  try{
    const user=await requireUser(req),beta=betaAccessForUser(user);
    return res.status(200).json({ok:true,mode:"private-beta",...beta,feedback_mode:"device-share",payment_mode:"disabled"});
  }catch(e){
    if(e?.code==="AUTH_REQUIRED")return res.status(401).json({ok:false,error:e.code,...betaConfig(),allowed:false,access_status:"sign-in-required"});
    return res.status(e?.status||500).json({ok:false,error:e?.code||"beta_status_failed",message:e?.message||"Beta status failed"});
  }
}
