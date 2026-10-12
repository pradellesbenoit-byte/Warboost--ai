// Server-only roster operation. Never saves a personal profile, snapshot or membership.
import {normalizeState} from "./normalize.js";
import {normalizeServerId,normalizeAllianceTag} from "./alliance-identity.js";
import {sanitizeCanonicalRoster,mergeCanonicalRoster} from "./alliance-scope.js";
import {currentActiveRosterMembers} from "./alliance-roster-lifecycle.js";
import {canonicalAllianceAuthorization} from "./alliance-authorization.js";
import {safeRosterDiagnostic} from "./roster-sync.js";

const fields=["name","server_id","alliance_tag","role","hq_level","power_m","rank_confirmed_at","rank_confirmed_source","updated_at"];
const fail=(code,status)=>Object.assign(new Error(code),{code,status});
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?
  Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

export async function syncAllianceRoster(body,{playerId,access,betaAllowed},services){
  let attempted=false,persisted=false,authorizationAllowed=null;
  const confirmation=()=>({requested:true,persisted,write_state:persisted?"confirmed":attempted?"unknown":"not_attempted"});
  try{
    if(!betaAllowed)throw fail("BETA_INVITE_REQUIRED",403);
    if(!services.configured())throw fail("roster_cloud_service_unavailable",503);
    const patch=body.roster_patch;
    if(!patch||!Array.isArray(patch.members)||!patch.members.length||patch.members.length>200)
      throw fail("roster_patch_invalid",422);
    if(!Object.hasOwn(body,"base_roster_updated_at"))throw fail("alliance_revision_required",409);
    const saved=services.userConfigured()&&access?
      await services.getProfileForUser(playerId,access):await services.getProfile(playerId);
    if(!saved?.state)throw fail("roster_context_unavailable",409);
    // Identity and scope come exclusively from the authenticated account's cloud profile.
    const cloud=normalizeState({...saved.state,player_id:playerId});
    const serverId=normalizeServerId(cloud.player?.server_id),allianceTag=normalizeAllianceTag(cloud.alliance?.tag);
    if(!serverId||!allianceTag)throw fail("roster_context_unavailable",409);
    if(normalizeServerId(patch.server_id)!==serverId||normalizeAllianceTag(patch.alliance_tag)!==allianceTag)
      throw fail("roster_scope_mismatch",403);
    let ctx=await services.getAllianceRoster(playerId,{serverId,allianceTag});
    if(!ctx?.alliance||!Array.isArray(ctx.alliance.roster))throw fail("roster_context_unavailable",409);
    if(normalizeServerId(ctx.alliance.server_id)!==serverId||normalizeAllianceTag(ctx.alliance.tag)!==allianceTag||
      (patch.alliance_id&&String(patch.alliance_id)!==String(ctx.alliance.id)))
      throw fail("roster_scope_mismatch",403);
    const authorization=canonicalAllianceAuthorization({playerId,membership:ctx.membership,
      alliance:ctx.alliance,roster:ctx.alliance.roster,
      identity:{name:cloud.player.name,server_id:serverId,alliance_tag:allianceTag}});
    authorizationAllowed=authorization.allowed;
    if(!authorization.allowed)throw fail("r4_r5_required",403);
    if((body.base_roster_updated_at||null)!==(ctx.alliance.roster_updated_at||null))
      throw fail("alliance_write_conflict",409);
    if(!ctx.alliance.updated_at)throw fail("alliance_revision_required",409);
    for(const row of patch.members){
      if(!row||typeof row!=="object"||
        (row.server_id&&normalizeServerId(row.server_id)!==serverId)||
        (row.alliance_tag&&normalizeAllianceTag(row.alliance_tag)!==allianceTag))
        throw fail("roster_scope_mismatch",403);
    }
    // Browser links, lifecycle deletions, personal combat data and privileges are not patch fields.
    const incoming=sanitizeCanonicalRoster(patch.members.map(row=>
      Object.fromEntries(fields.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]))),{serverId,allianceTag});
    if(!incoming.length)throw fail("roster_patch_invalid",422);
    // Always additive, including retries of an earlier "complete" capture. Departures
    // remain the responsibility of the existing explicit, authorized removal flow.
    const roster=currentActiveRosterMembers(mergeCanonicalRoster(ctx.alliance.roster,incoming,{serverId,allianceTag}),
      [],[],ctx.roster_tombstones);
    const allianceId=ctx.alliance.id;
    attempted=true;
    const written=await services.updateAllianceScopeRoster({alliance_id:allianceId,roster,
      roster_tombstones:ctx.roster_tombstones||[],expected_updated_at:ctx.alliance.updated_at});
    persisted=true;
    ctx=await services.getAllianceRoster(playerId,{serverId,allianceTag});
    if(!ctx?.alliance||ctx.alliance.id!==allianceId||
      ctx.alliance.updated_at!==written?.updated_at||
      normalizeServerId(ctx.alliance.server_id)!==serverId||normalizeAllianceTag(ctx.alliance.tag)!==allianceTag||
      !written?.roster_updated_at||ctx.alliance.roster_updated_at!==written.roster_updated_at||
      stable(sanitizeCanonicalRoster(ctx.alliance.roster,{serverId,allianceTag}))!==
        stable(sanitizeCanonicalRoster(roster,{serverId,allianceTag})))
      throw fail("roster_sync_unconfirmed",409);
    return {status:200,body:{ok:true,operation:"alliance_roster",player_id:playerId,
      alliance_pending_source:"canonical",roster_confirmation:confirmation(),
      alliance:{id:allianceId,server_id:serverId,tag:allianceTag,
        members:ctx.roster,canonical_roster:ctx.roster,roster_updated_at:ctx.alliance.roster_updated_at,
        roster_sync_status:"synced",roster_sync_error:null}}};
  }catch(error){
    // A CAS rejection is definitive; a network failure after PATCH is not.
    if(!persisted&&["alliance_write_conflict","alliance_revision_required"].includes(error.code))attempted=false;
    const upstream=String(error.body?.code||"");
    return {status:error.status||503,body:{error:safeRosterDiagnostic(error).code,
      roster_confirmation:confirmation(),
      authorization:{allowed:authorizationAllowed},
      upstream_code:/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(upstream)?upstream:null}};
  }
}
