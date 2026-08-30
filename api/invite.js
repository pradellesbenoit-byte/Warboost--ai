import {randomBytes} from "node:crypto";
import {configured,createAlliance,findInvite,getAllianceMembership,getAllianceById,getOwnedAlliance,joinAlliance} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";

function cleanTag(v){return String(v||"WB").replace(/[^A-Z0-9]/gi,"").toUpperCase().slice(0,8)||"WB"}
function cleanName(v,fallback){return String(v||fallback||"WarBoost").trim().slice(0,80)||fallback||"WarBoost"}
function inviteCode(tag){return `${tag}-${randomBytes(4).toString("hex").toUpperCase()}`}
function manager(role){return ["R4","R5"].includes(String(role||"").trim().toUpperCase())}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const {user}=await requireBetaUser(req,{consent:true});
    const current=await getAllianceMembership(user.id);
    if(current){
      const alliance=await getAllianceById(current.alliance_id);
      if(alliance){
        if(!manager(current.role))return res.status(403).json({error:"manager_role_required",message:"R5/R4 required to share a WarBoost alliance invitation."});
        return res.status(200).json({ok:true,existing:true,alliance,invite_code:alliance.invite_code,role:current.role||"R1"});
      }
    }

    // Recover safely if a previous alliance creation succeeded but membership insertion was interrupted.
    const owned=await getOwnedAlliance(user.id);
    if(owned){
      const membership=await joinAlliance({alliance_id:owned.id,player_id:user.id,role:"R5"});
      return res.status(200).json({ok:true,existing:true,recovered:true,alliance:owned,invite_code:owned.invite_code,role:membership?.role||"R5"});
    }

    const tag=cleanTag(req.body?.tag),name=cleanName(req.body?.name,tag);
    for(let attempt=0;attempt<6;attempt++){
      const code=inviteCode(tag);
      if(await findInvite(code))continue;
      try{
        const row=await createAlliance({tag,name,invite_code:code,owner_player_id:user.id});
        if(!row?.id)continue;
        const membership=await joinAlliance({alliance_id:row.id,player_id:user.id,role:"R5"});
        return res.status(200).json({ok:true,existing:false,alliance:row,invite_code:row.invite_code||code,role:membership?.role||"R5"});
      }catch(e){
        const raw=`${e?.body?.code||""} ${e?.body?.message||""} ${e?.message||""}`.toLowerCase();
        if(e?.status===409||/23505|duplicate|unique/.test(raw))continue;
        throw e;
      }
    }
    return res.status(503).json({error:"invite_code_generation_failed"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"invite_failed",message:e.message})}
}
