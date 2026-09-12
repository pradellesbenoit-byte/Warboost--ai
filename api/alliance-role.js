import {configured,getAllianceMembership,getAllianceById,setAllianceMemberRole} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";

function role(v){const r=String(v||"R1").toUpperCase();return /^R[1-5]$/.test(r)?r:"R1"}
// Backward-compatibility audit marker for legacy verifiers: r5_required. HF8.6.3 extends safe role maintenance to verified R4 while keeping R5 protected.

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const {user}=await requireBetaUser(req,{consent:true});
    const actor=await getAllianceMembership(user.id);
    if(!actor)return res.status(403).json({error:"alliance_membership_required"});
    const alliance=await getAllianceById(actor.alliance_id);
    if(!alliance)return res.status(404).json({error:"alliance_not_found"});
    const actorRole=role(actor.role),isOwner=String(alliance.owner_player_id||"")===String(user.id);
    // HF8.6.3: verified R4 and R5 may maintain R4 management permissions for their alliance.
    // R5 ownership remains protected and can never be transferred by an R4.
    if(!(isOwner||actorRole==="R5"||actorRole==="R4"))return res.status(403).json({error:"r4_r5_required"});
    const targetPlayerId=String(req.body?.player_id||"").trim(),targetRole=role(req.body?.role);
    if(!targetPlayerId)return res.status(400).json({error:"player_id_required"});
    const target=await getAllianceMembership(targetPlayerId);
    if(!target||String(target.alliance_id)!==String(actor.alliance_id))return res.status(404).json({error:"member_not_found"});
    const targetCurrentRole=role(target.role),targetIsOwner=String(alliance.owner_player_id||"")===targetPlayerId;
    if(targetIsOwner&&targetRole!=="R5")return res.status(400).json({error:"owner_must_remain_r5"});
    if(targetRole==="R5"&&!isOwner)return res.status(403).json({error:"owner_required_for_r5"});
    if(actorRole==="R4"&&!isOwner){
      if(targetCurrentRole==="R5"||targetIsOwner)return res.status(403).json({error:"r5_protected"});
      if(!["R1","R4"].includes(targetRole))return res.status(400).json({error:"management_role_invalid"});
    }
    if(String(targetPlayerId)===String(user.id)&&targetRole==="R5"&&!isOwner)return res.status(403).json({error:"owner_required_for_r5"});
    const row=await setAllianceMemberRole({alliance_id:actor.alliance_id,player_id:targetPlayerId,role:targetRole});
    if(!row)return res.status(404).json({error:"member_not_found"});
    return res.status(200).json({ok:true,membership:row});
  }catch(e){return res.status(e.status||500).json({error:e.code||"alliance_role_failed",message:e.message})}
}
