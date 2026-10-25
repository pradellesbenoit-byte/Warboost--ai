const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createFounderSpaceHandler({authorize,rpc}){
  return async(req,res)=>{
    res.setHeader("Cache-Control","no-store");
    if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
    try{
      const {user}=await authorize(req,{consent:true}),action=req.body?.action;
      if(!["create","mine","save_draft"].includes(action))return res.status(400).json({ok:false,error:"ALLIANCE_ACTION_INVALID"});
      if(action==="save_draft"&&(!Array.isArray(req.body.roster)||req.body.roster.length>100||!Number.isSafeInteger(req.body.revision)||req.body.revision<0))
        return res.status(400).json({ok:false,error:"ALLIANCE_DRAFT_INVALID"});
      const result=await rpc("wb1_founder_space",{p_user_id:user.id,p_action:action,
        p_roster:action==="save_draft"?req.body.roster:null,p_revision:action==="save_draft"?req.body.revision:null});
      return res.status(200).json({ok:true,...result});
    }catch(error){
      return res.status(error.status||409).json({ok:false,error:error.code==="FREE_ACCESS_SCHEMA_REQUIRED"?error.code:"ALLIANCE_DRAFT_NOT_CONFIRMED",
        message:"Espace non confirmé. Le brouillon saisi est conservé ; aucun droit de jeu ou d’alliance existante n’a été attribué."});
    }
  };
}
export function createAllianceAccessHandler({authorize,rpc}){
  return async(req,res)=>{
    res.setHeader("Cache-Control","no-store");
    if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
    try{
      const {user}=await authorize(req,{consent:true}),action=req.body?.action;
      if(["request","mine","list"].includes(action)){
        const result=await rpc("wb1_alliance_access_request",{p_user_id:user.id,p_action:action});
        return res.status(200).json({ok:true,...result});
      }
      if(["approve","reject"].includes(action)){
        if(!uuid.test(String(req.body?.request_id||"")))return res.status(400).json({error:"ALLIANCE_REQUEST_INVALID"});
        const result=await rpc("wb1_review_alliance_access",{p_user_id:user.id,p_request_id:req.body.request_id,p_accept:action==="approve"});
        return res.status(200).json({ok:true,...result});
      }
      return res.status(400).json({error:"ALLIANCE_APPROVAL_REQUIRED",message:"Demande une adhésion, sans code, puis attends la validation de ton responsable."});
    }catch(error){
      // Do not expose RPC bodies, profiles or database details.
      return res.status(error.status||409).json({ok:false,error:error.code||"ALLIANCE_ACCESS_NOT_CONFIRMED",message:error.code==="FREE_ACCESS_SCHEMA_REQUIRED"?error.message:"Adhésion non confirmée. Vérifie ton identité et demande une validation R4/R5."});
    }
  };
}
