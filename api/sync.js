import {mergeNewest,normalizeState} from "../lib/normalize.js";
import {configured,userConfigured,getProfile,getProfileForUser,saveProfileIfUnchanged,saveProfileForUserIfUnchanged,insertSnapshot,insertSnapshotForUser,getAllianceRoster,updateAllianceScopeRoster} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {mergeCloudRosterPreservingManual,mergeCloudRosterWithIdentity,mergeCurrentPlayerActivityIntoRoster} from "../lib/alliance-roster-merge.js";
import {linkCurrentPlayerIdentityIntoRoster,normalizeServerId,normalizeAllianceTag} from "../lib/alliance-identity.js";
import {allianceScopeFromState,sanitizeCanonicalRoster,joinProofForAlliance,isManagerRole,mergeCanonicalRoster,replaceCanonicalRosterFromCompleteSnapshot} from "../lib/alliance-scope.js";
import {markCanonicalRosterPresence,mergeRosterLifecycleMetadata,currentActiveRosterMembers,preserveVerifiedR5} from "../lib/alliance-roster-lifecycle.js";
import {canonicalRosterMemberKey} from "../lib/alliance-rank-management.js";
import {canonicalAllianceAuthorization,authorizationMessage} from "../lib/alliance-authorization.js";
void mergeCloudRosterPreservingManual; // backward-compatibility safeguard remains exported and audited
function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  try{
    const {user}=await requireBetaUser(req,{consent:true}),playerId=user.id,access=accessToken(req),userMode=userConfigured()&&Boolean(access),current=normalizeState({...req.body?.state,player_id:playerId}),requestedRosterSync=current.alliance?.roster_sync_status==="pending";let base=current,saved=null,rosterPersisted=false;
    if(configured()||userMode){saved=userMode?await getProfileForUser(playerId,access):await getProfile(playerId);const baseUpdatedAt=req.body?.base_updated_at===null?null:String(req.body?.base_updated_at||"").trim()||null;if(saved?.updated_at&&baseUpdatedAt!==String(saved.updated_at))return res.status(409).json({error:"profile_write_conflict",message:"Le profil a été modifié sur un autre appareil.",state:saved.state,updated_at:saved.updated_at});if(saved?.state){const requestedRosterSync=current.alliance?.roster_sync_status==="pending";base=mergeNewest(base,saved.state);if(requestedRosterSync){base.alliance={...base.alliance,members:current.alliance.members,roster_review:current.alliance.roster_review,former_members:current.alliance.former_members,roster_snapshot_complete_at:current.alliance.roster_snapshot_complete_at,roster_sync_status:"pending",roster_sync_error:null}}}}
    let merged=base,provider="warboost-cloud",providerKind="warboost",capabilities=["player-consented-cloud","scan-derived-data","alliance-roster"];
    const now=new Date().toISOString();
    merged.sync={...merged.sync,provider,provider_kind:providerKind,access_status:"safe-launch-external-disabled",capabilities,status:"ok",last_sync:now,last_error:null,auto_ready:true,sources:{...merged.sync?.sources,official:false,public:false,scan:Boolean(merged.sync?.last_scan),alliance:false}};
    if(configured()||userMode){
      if(configured()){
        let ctx=await getAllianceRoster(playerId).catch(()=>null);
          if(ctx){
          const targetServer=normalizeServerId(ctx.alliance?.server_id),targetTag=normalizeAllianceTag(ctx.alliance?.tag);
          const authorization=canonicalAllianceAuthorization({playerId,membership:ctx.membership,alliance:ctx.alliance,roster:ctx.roster,identity:{name:merged.player?.name,server_id:merged.player?.server_id,alliance_tag:merged.alliance?.tag}});
           let managementVerified=authorization.allowed;

          // R5/R4 may refresh the canonical Last War roster for their own exact server+alliance
          // scope. Partial imports remain additive. A smaller roster may replace the canonical
          // list only after the manager explicitly marked the import as a COMPLETE roster snapshot.
          if(managementVerified){
            const scope=allianceScopeFromState(merged),candidateRoster=sanitizeCanonicalRoster(merged.alliance?.members,{serverId:targetServer,allianceTag:targetTag}),existingCount=Array.isArray(ctx.alliance?.roster)?ctx.alliance.roster.length:0;
            const snapshotAt=Date.parse(merged.alliance?.roster_snapshot_complete_at||""),serverRosterAt=Date.parse(ctx.alliance?.roster_updated_at||"");
            const completeSnapshotFresh=Number.isFinite(snapshotAt)&&snapshotAt>0&&(!Number.isFinite(serverRosterAt)||snapshotAt>serverRosterAt);
            if(scope.server_id===targetServer&&scope.alliance_tag===targetTag&&candidateRoster.length>0&&(completeSnapshotFresh||candidateRoster.length>=existingCount)){
              const canonicalMerged=completeSnapshotFresh?replaceCanonicalRosterFromCompleteSnapshot(ctx.alliance?.roster,candidateRoster,{serverId:targetServer,allianceTag:targetTag}):mergeCanonicalRoster(ctx.alliance?.roster,candidateRoster,{serverId:targetServer,allianceTag:targetTag});
               await updateAllianceScopeRoster({alliance_id:ctx.alliance.id,roster:canonicalMerged,expected_updated_at:ctx.alliance.updated_at});
               rosterPersisted=true;
              ctx=await getAllianceRoster(playerId).catch(()=>ctx);
            }
          }

          const authoritativeTag=normalizeAllianceTag(ctx.alliance.tag||merged.alliance?.tag),authoritativeServer=normalizeServerId(ctx.alliance.server_id||merged.player?.server_id),context={serverId:authoritativeServer,allianceTag:authoritativeTag};
          const canonical=markCanonicalRosterPresence(Array.isArray(ctx.roster)?ctx.roster:[],ctx.alliance?.roster_updated_at).map(row=>({...row,canonical_member_key:canonicalRosterMemberKey(row,{serverId:authoritativeServer,allianceTag:authoritativeTag})}));
          const ownLink=linkCurrentPlayerIdentityIntoRoster(canonical,{playerId,name:merged.player?.name,serverId:authoritativeServer,allianceTag:authoritativeTag,activityEvents:merged.activity_events,updatedAt:now});
          const identityMerge=mergeCloudRosterWithIdentity(ownLink.members,ctx.cloud_roster||[],context);
          const rosterWithActivity=mergeCurrentPlayerActivityIntoRoster(identityMerge.roster,{playerId,name:merged.player?.name,serverId:authoritativeServer,allianceTag:authoritativeTag,activityEvents:merged.activity_events,updatedAt:now});
          const rosterMerged=mergeRosterLifecycleMetadata(merged.alliance?.members,rosterWithActivity);
          const preservedR5=preserveVerifiedR5(merged.alliance?.members,rosterMerged);
          // A stale server-side canonical roster must never resurrect a player that R5/R4 explicitly removed
          // or placed in review. Only a later explicit roster import/reintegration may clear that lifecycle state.
          const roster=currentActiveRosterMembers(preservedR5.rows,merged.alliance?.roster_review,merged.alliance?.former_members);
           const refreshedAuthorization=canonicalAllianceAuthorization({playerId,membership:ctx.membership,alliance:ctx.alliance,roster:canonical,identity:{name:merged.player?.name,server_id:merged.player?.server_id,alliance_tag:merged.alliance?.tag}});
           managementVerified=refreshedAuthorization.allowed;
            merged.alliance={...merged.alliance,id:ctx.alliance.id,owner_player_id:ctx.alliance.owner_player_id||merged.alliance.owner_player_id||null,server_id:authoritativeServer,tag:authoritativeTag,name:ctx.alliance.name||merged.alliance.name,invite_code:ctx.alliance.invite_code||merged.alliance.invite_code,role:ctx.membership.role||"R1",cloud_role_verified:Boolean(ctx.membership?.role),management_verified:Boolean(String(ctx.alliance.owner_player_id||"")===String(playerId)||managementVerified),identity_link_status:ownLink.status,members:roster,r5_sync_required:Boolean(preservedR5.preserved),unlinked_accounts:identityMerge.unlinked_accounts,roster_updated_at:ctx.alliance.roster_updated_at||merged.alliance.roster_updated_at||null,roster_sync_status:rosterPersisted||!requestedRosterSync?"synced":"pending",roster_sync_error:null,updated_at:now};merged.sync.sources.alliance=true}
          if(requestedRosterSync&&!rosterPersisted){
            const currentAuthorization=canonicalAllianceAuthorization({playerId,membership:ctx.membership,alliance:ctx.alliance,roster:canonical,identity:{name:merged.player?.name,server_id:merged.player?.server_id,alliance_tag:merged.alliance?.tag}});
            const message=!currentAuthorization.allowed?authorizationMessage(currentAuthorization):"Le roster candidat ne correspond pas au serveur et à l’alliance canoniques, ou sa révision cloud a changé.";
            return res.status(409).json({error:"roster_canonical_persist_required",message,authorization:currentAuthorization,canonical_count:Array.isArray(ctx.alliance?.roster)?ctx.alliance.roster.length:0,candidate_count:Array.isArray(merged.alliance?.members)?merged.alliance.members.length:0});
          }
        const written=await saveProfileIfUnchanged(playerId,merged,saved?.updated_at||null);saved=written||saved;await insertSnapshot(playerId,merged,provider);
      }else if(userMode){
        const ownLink=linkCurrentPlayerIdentityIntoRoster(merged.alliance?.members,{playerId,name:merged.player?.name,serverId:merged.player?.server_id,allianceTag:merged.alliance?.tag,activityEvents:merged.activity_events,updatedAt:now});
        merged.alliance={...merged.alliance,members:ownLink.members,identity_link_status:ownLink.status};const written=await saveProfileForUserIfUnchanged(playerId,merged,access,saved?.updated_at||null);saved=written||saved;await insertSnapshotForUser(playerId,merged,access,provider)
      }
    }
    const cfg={official:false,approved:false,legacy:false,authorization_status:"safe-launch-disabled",safe_launch_lock:true};
    return res.status(200).json({ok:true,provider,provider_kind:providerKind,capabilities,sources:merged.sync.sources,provider_config:cfg,public_config:cfg,safe_launch:true,synced_at:merged.sync.last_sync,state:merged,updated_at:saved?.updated_at||null,access_mode:userMode?"user-rls":"service"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"sync_failed",message:e.name==="AbortError"?"Source timeout":e.message})}
}
