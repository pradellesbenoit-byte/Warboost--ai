import {projectSquads} from "./squad-comparison.js";

// Deliberately isolated from invitation, restore, roster and persistence helpers.
export function createSquadCompareHandler({requireUser,readForUser,consentVersion}){
  return async function squadCompareHandler(req,res){
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Vary","Authorization");
    if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"method_not_allowed"});}
    if(req.query?.identity||req.query?.restore||req.query?.player_id||req.query?.user_id)
      return res.status(400).json({error:"squad_compare_invalid_request"});
    try{
      const user=await requireUser(req);
      if(!user?.id)return res.status(401).json({error:"AUTH_INVALID"});
      if(String(req.headers?.["x-warboost-beta-consent"]||"")!==consentVersion)
        return res.status(428).json({error:"BETA_CONSENT_REQUIRED"});
      const bearer=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
      if(!bearer)return res.status(401).json({error:"AUTH_REQUIRED"});
      const row=await readForUser(String(user.id),bearer,{timeoutMs:6000});
      return res.status(200).json({ok:true,read_only:true,checked_at:new Date().toISOString(),
        profile_present:Boolean(row),revision:row?.updated_at||null,squads:projectSquads(row?.squads)});
    }catch(error){
      const status=Number(error?.status),code=String(error?.code||"");
      if(status===401)return res.status(401).json({error:"AUTH_INVALID"});
      if(status===403||code==="database_permissions_missing"||code==="42501")
        return res.status(403).json({error:"database_permissions_missing"});
      if(/timeout/i.test(code))return res.status(504).json({error:"squad_compare_timeout"});
      return res.status(503).json({error:"squad_compare_unavailable"});
    }
  };
}
