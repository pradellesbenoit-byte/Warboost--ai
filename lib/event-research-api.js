import {getAllianceMembership,getAllianceById,getOwnedAlliance} from "./supabase.js";
import {canonicalAllianceAuthorization} from "./alliance-authorization.js";
import {currentActiveRosterMembers} from "./alliance-roster-lifecycle.js";
import {eventStrategyResearch} from "./event-strategy-research.js";

// User comes only from the authenticated, consent-checked advice endpoint.
export async function researchForAllianceManager(user,type){
  const membership=await getAllianceMembership(user.id);
  const alliance=membership?.alliance_id?await getAllianceById(membership.alliance_id):await getOwnedAlliance(user.id);
  const roster=currentActiveRosterMembers(Array.isArray(alliance?.roster)?alliance.roster:[]);
  const auth=canonicalAllianceAuthorization({playerId:user.id,membership,alliance,roster});
  if(!auth.allowed)throw Object.assign(new Error("verified_manager_required"),{status:403,code:"verified_manager_required"});
  if(!["desert_storm","canyon_storm","vs","season","other"].includes(type))
    throw Object.assign(new Error("event_type_invalid"),{status:400,code:"event_type_invalid"});
  return await eventStrategyResearch(type);
}