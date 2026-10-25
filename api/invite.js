import {configured,findAllianceByScope,getAllianceMembership,getAllianceById,getOwnedAlliance,getProfile,joinAlliance,updateAllianceScopeRoster} from "../lib/supabase.js";
import {requireProductUser} from "../lib/pro-access.js";
import {managerProofFromState,joinProofForAlliance,publicAllianceScope,isManagerRole,mergeCanonicalRoster} from "../lib/alliance-scope.js";

function fail(status,code,message){return Object.assign(new Error(message||code),{status,code})}

async function profileState(playerId){const row=await getProfile(playerId);return row?.state||null}

async function verifiedManagerForExisting(userId,alliance,membership){
  if(!membership||!isManagerRole(membership.role))throw fail(403,"manager_role_required","R5/R4 required to share a WarBoost alliance invitation.");
  const state=await profileState(userId);if(!state)throw fail(409,"lastwar_identity_required","Save and synchronize your Last War identity first.");
  const joinProof=joinProofForAlliance(state,alliance);
  if(!joinProof.ok)throw fail(joinProof.code==="alliance_roster_identity_ambiguous"?409:403,joinProof.code);
  if(!isManagerRole(joinProof.roster_role))throw fail(403,"manager_roster_role_required","Your exact Last War roster row must be R5 or R4.");
  return {state,proof:joinProof};
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const {user}=await requireProductUser(req,{consent:true});
    const current=await getAllianceMembership(user.id);
    if(current){
      if(!isManagerRole(current.role))throw fail(403,"manager_role_required","R5/R4 required to share a WarBoost alliance invitation.");
      let alliance=await getAllianceById(current.alliance_id);
      if(!alliance)throw fail(404,"alliance_not_found");

      // HF6 spaces are upgraded lazily after the additive HF7 migration. The manager's
      // exact Last War profile/roster establishes server + roster scope; never e-mail.
      if(!String(alliance.server_id||"").trim()||!Array.isArray(alliance.roster)||!alliance.roster.length){
        const state=await profileState(user.id),bootstrap=managerProofFromState(state||{});
        if(!bootstrap.ok)throw fail(bootstrap.code==="alliance_roster_identity_ambiguous"?409:403,bootstrap.code);
        if(cleanTag(alliance.tag)!==bootstrap.scope.alliance_tag)throw fail(403,"alliance_tag_mismatch");
        alliance=await updateAllianceScopeRoster({alliance_id:alliance.id,server_id:bootstrap.scope.server_id,tag:bootstrap.scope.alliance_tag,name:alliance.name||bootstrap.scope.alliance_tag,roster:bootstrap.roster,expected_updated_at:alliance.updated_at})||alliance;
      }
      const sameScope=await findAllianceByScope(String(alliance.server_id||""),String(alliance.tag||""));
      if(sameScope.length!==1||String(sameScope[0]?.id||"")!==String(alliance.id||""))throw fail(409,"alliance_scope_ambiguous_admin_required","This server/alliance scope is ambiguous and must be reviewed before invitations can be shared.");

      const verified=await verifiedManagerForExisting(user.id,alliance,current);
      // Refresh the canonical roster only from an exact R5/R4 identity. Never publish a
      // smaller/partial roster over a larger existing roster by accident.
      const fresh=managerProofFromState(verified.state);
      if(fresh.ok&&fresh.scope.server_id===String(alliance.server_id||"")&&fresh.scope.alliance_tag===cleanTag(alliance.tag)){
        const existingCount=Array.isArray(alliance.roster)?alliance.roster.length:0;
        if(fresh.roster.length>=existingCount&&fresh.roster.length>0){const roster=mergeCanonicalRoster(alliance.roster,fresh.roster,{serverId:fresh.scope.server_id,allianceTag:fresh.scope.alliance_tag});alliance=await updateAllianceScopeRoster({alliance_id:alliance.id,roster,expected_updated_at:alliance.updated_at})||alliance;}
      }
      return res.status(200).json({ok:true,existing:true,alliance:publicAllianceScope(alliance),invite_code:alliance.invite_code,role:verified.proof.roster_role,scope_verified:true});
    }

    const state=await profileState(user.id);if(!state)throw fail(409,"lastwar_identity_required","Save and synchronize your Last War identity first.");
    const proof=managerProofFromState(state);
    if(!proof.ok)throw fail(proof.code==="alliance_roster_identity_ambiguous"?409:403,proof.code);

    const owned=await getOwnedAlliance(user.id);
    if(owned){
      // Recover only when the exact server+alliance scope still matches the owner's Last War identity.
      if(String(owned.server_id||"").trim()&&String(owned.server_id)!==proof.scope.server_id)throw fail(409,"alliance_owner_scope_conflict");
      if(cleanTag(owned.tag)!==proof.scope.alliance_tag)throw fail(409,"alliance_owner_scope_conflict");
      const upgraded=await updateAllianceScopeRoster({alliance_id:owned.id,server_id:proof.scope.server_id,tag:proof.scope.alliance_tag,name:owned.name||proof.scope.alliance_tag,roster:proof.roster,expected_updated_at:owned.updated_at})||owned;
      const membership=await joinAlliance({alliance_id:upgraded.id,player_id:user.id,role:proof.roster_role});
      return res.status(200).json({ok:true,existing:true,recovered:true,alliance:publicAllianceScope(upgraded),invite_code:upgraded.invite_code,role:membership?.role||proof.roster_role,scope_verified:true});
    }

    const scoped=await findAllianceByScope(proof.scope.server_id,proof.scope.alliance_tag);
    if(scoped.length>1)throw fail(409,"alliance_scope_ambiguous_admin_required");
    if(scoped.length===1)throw fail(409,"alliance_space_exists_invitation_required","This server/alliance already has a WarBoost space. Ask an R5/R4 of that space for an invitation.");

    // This profile/roster can be supplied by its author. It is NOT independent proof of R4/R5.
    // Never bootstrap ownership from a self-declared rank, screenshot or arbitrary roster.
    throw fail(409,"ALLIANCE_MANAGER_VERIFICATION_REQUIRED","La création d’un nouvel espace nécessite une vérification indépendante de l’identité et du grade R4/R5. Aucun code bêta n’est requis pour le compte FREE.");
  }catch(e){return res.status(e.status||500).json({error:e.code||"invite_failed",message:e.message})}
}
