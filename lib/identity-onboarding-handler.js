import {requireBetaUser} from "./beta-access.js";
import {configured,getProfile,getAllianceRoster,getOwnedAlliance,findAllianceByScope,
  findProfilesByIdentityScope,saveProfileIfUnchanged} from "./supabase.js";
import {createIdentityOnboardingService} from "./identity-onboarding-service.js";

const service=createIdentityOnboardingService({getProfile,getAllianceRoster,getOwnedAlliance,
  findAllianceByScope,findProfilesByIdentityScope,saveProfileIfUnchanged});

// A sub-action of /api/state keeps the existing deployment function count unchanged.
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST"].includes(req.method)){
    res.setHeader("Allow","GET, POST");return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  }
  try{
    const {user}=await requireBetaUser(req,{consent:true});
    if(!configured())return res.status(503).json({error:"IDENTITY_CHECK_UNAVAILABLE"});
    if(req.method==="GET"){
      const {context,...result}=await service.read(String(user.id));
      return res.json(result);
    }
    if(!Object.hasOwn(req.body||{},"base_updated_at"))return res.status(400).json({error:"IDENTITY_INVALID"});
    const result=await service.complete(String(user.id),req.body?.identity||{},req.body.base_updated_at);
    return res.json(result);
  }catch(error){
    return res.status(error.status||503).json({error:error.code||"IDENTITY_CHECK_UNAVAILABLE",
      ...(error.authority?{authority:error.authority}:{})});
  }
}