import {configured,findInvite,findAllianceByScope,getAllianceMembership,getAllianceById,getProfile,joinAlliance} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {joinProofForAlliance,publicAllianceScope} from "../lib/alliance-scope.js";

function fail(status,code,message){return Object.assign(new Error(message||code),{status,code})}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  const code=String(req.body?.invite_code||"").trim().toUpperCase();
  if(!code)return res.status(400).json({error:"invite_code_required"});
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const {user}=await requireBetaUser(req,{consent:true}),target=await findInvite(code);
    if(!target)return res.status(404).json({error:"invite_not_found"});
    if(String(target.server_id||"").trim()&&String(target.tag||"").trim()){const sameScope=await findAllianceByScope(target.server_id,target.tag);if(sameScope.length!==1||String(sameScope[0]?.id||"")!==String(target.id||""))throw fail(409,"alliance_scope_ambiguous_admin_required","This server/alliance scope is ambiguous and must be reviewed before anyone can join.");}

    // The invite code is not authorization by itself. The authenticated account must have
    // an exact Last War nickname + server + alliance match in the target canonical roster.
    const profile=await getProfile(user.id),state=profile?.state;
    if(!state)throw fail(409,"lastwar_identity_required","Save and synchronize your Last War identity first.");
    const proof=joinProofForAlliance(state,target);
    if(!proof.ok){
      const conflict=["alliance_roster_identity_ambiguous","alliance_scope_not_ready"].includes(proof.code);
      throw fail(conflict?409:403,proof.code);
    }

    const current=await getAllianceMembership(user.id);
    if(current?.alliance_id===target.id){
      // Keep server-side role aligned with the exact current Last War roster row.
      const membership=await joinAlliance({alliance_id:target.id,player_id:user.id,role:proof.roster_role});
      return res.status(200).json({ok:true,alliance:publicAllianceScope(target),membership,already_member:true,switched:false,scope_verified:true});
    }
    if(current?.alliance_id){
      const currentAlliance=await getAllianceById(current.alliance_id);
      if(String(currentAlliance?.owner_player_id||"")===String(user.id)){
        return res.status(409).json({error:"alliance_owner_switch_blocked",message:"Transfer alliance ownership before joining another WarBoost alliance."});
      }
    }

    // Switching is allowed only after the target roster exact-match proof above succeeded.
    const membership=await joinAlliance({alliance_id:target.id,player_id:user.id,role:proof.roster_role});
    return res.status(200).json({ok:true,alliance:publicAllianceScope(target),membership,already_member:false,switched:Boolean(current?.alliance_id),scope_verified:true});
  }catch(e){return res.status(e.status||500).json({error:e.code||"join_failed",message:e.message})}
}
