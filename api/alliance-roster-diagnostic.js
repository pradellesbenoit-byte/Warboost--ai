import {configured,getAllianceMembership,getAllianceRoster} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method_not_allowed"});
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const {user}=await requireBetaUser(req,{consent:true});
    const membership=await getAllianceMembership(user.id);
    if(!membership)return res.status(403).json({error:"alliance_membership_required"});
    const ctx=await getAllianceRoster(user.id);
    if(!ctx?.alliance)return res.status(404).json({error:"alliance_not_found"});
    const canonical=Array.isArray(ctx.alliance.roster)?ctx.alliance.roster:[];
    const cloudMembers=Array.isArray(ctx.cloud_roster)?ctx.cloud_roster:[];
    return res.status(200).json({
      ok:true,
      source:canonical.length?"canonical":"cloud_members",
      canonical_count:canonical.length,
      cloud_member_count:cloudMembers.length,
      canonical_updated_at:ctx.alliance.roster_updated_at||null
    });
  }catch(e){return res.status(e.status||500).json({error:e.code||"alliance_roster_diagnostic_failed",message:e.message})}
}