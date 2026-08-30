import {configured,findInvite,getAllianceMembership,getAllianceById,joinAlliance} from "../lib/supabase.js";
import {requireUser} from "../lib/auth.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  const code=String(req.body?.invite_code||"").trim().toUpperCase();
  if(!code)return res.status(400).json({error:"invite_code_required"});
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const user=await requireUser(req),target=await findInvite(code);
    if(!target)return res.status(404).json({error:"invite_not_found"});
    const current=await getAllianceMembership(user.id);
    if(current?.alliance_id===target.id){
      return res.status(200).json({ok:true,alliance:target,membership:current,already_member:true,switched:false});
    }
    if(current?.alliance_id){
      const currentAlliance=await getAllianceById(current.alliance_id);
      if(String(currentAlliance?.owner_player_id||"")===String(user.id)){
        return res.status(409).json({error:"alliance_owner_switch_blocked",message:"Transfer alliance ownership before joining another WarBoost alliance."});
      }
    }
    const membership=await joinAlliance({alliance_id:target.id,player_id:user.id,role:"R1"});
    return res.status(200).json({ok:true,alliance:target,membership,already_member:false,switched:Boolean(current?.alliance_id)});
  }catch(e){return res.status(e.status||500).json({error:e.code||"join_failed",message:e.message})}
}
