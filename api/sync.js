import {mergeNewest,normalizeState} from "../lib/normalize.js";
import {configured,userConfigured,getProfile,upsertProfile,getProfileForUser,upsertProfileForUser,insertSnapshot,insertSnapshotForUser,getAllianceRoster,updateAllianceScopeRoster} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {mergeCloudRosterPreservingManual,mergeCloudRosterWithIdentity,mergeCurrentPlayerActivityIntoRoster} from "../lib/alliance-roster-merge.js";
import {linkCurrentPlayerIdentityIntoRoster,normalizeServerId,normalizeAllianceTag} from "../lib/alliance-identity.js";
import {managerProofFromState,joinProofForAlliance,isManagerRole,mergeCanonicalRoster} from "../lib/alliance-scope.js";
void mergeCloudRosterPreservingManual; // backward-compatibility safeguard remains exported and audited
function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  try{
    const {user}=await requireBetaUser(req,{consent:true}),playerId=user.id,access=accessToken(req),userMode=userConfigured()&&Boolean(access),current=normalizeState({...req.body?.state,player_id:playerId});let base=current;
    if(configured()||userMode){const saved=userMode?await getProfileForUser(playerId,access):await getProfile(playerId);if(saved?.state)base=mergeNewest(base,saved.state)}
    let merged=base,provider="warboost-cloud",providerKind="warboost",capabilities=["player-consented-cloud","scan-derived-data","alliance-roster"];
    const now=new Date().toISOString();
    merged.sync={...merged.sync,provider,provider_kind:providerKind,access_status:"safe-launch-external-disabled",capabilities,status:"ok",last_sync:now,last_error:null,auto_ready:true,sources:{...merged.sync?.sources,official:false,public:false,scan:Boolean(merged.sync?.last_scan),alliance:false}};
    if(configured()||userMode){
      // Persist the player's consented profile first so the alliance aggregation can read the
      // current Last War nickname/server and today's self-reported participation. No e-mail is used.
      if(userMode)await upsertProfileForUser(playerId,merged,access);else await upsertProfile(playerId,merged);
      if(configured()){
        let ctx=await getAllianceRoster(playerId).catch(()=>null);
        if(ctx){
          const targetServer=normalizeServerId(ctx.alliance?.server_id),targetTag=normalizeAllianceTag(ctx.alliance?.tag);
          const existingJoinProof=joinProofForAlliance(merged,ctx.alliance);
          let managementVerified=Boolean(existingJoinProof.ok&&isManagerRole(existingJoinProof.roster_role)&&isManagerRole(ctx.membership?.role));

          // R5/R4 may refresh the canonical Last War roster for their own exact server+alliance
          // scope. A smaller/partial local roster never overwrites a larger canonical roster.
          if(managementVerified){
            const managerProof=managerProofFromState(merged),existingCount=Array.isArray(ctx.alliance?.roster)?ctx.alliance.roster.length:0;
            if(managerProof.ok&&managerProof.scope.server_id===targetServer&&managerProof.scope.alliance_tag===targetTag&&managerProof.roster.length>0&&managerProof.roster.length>=existingCount){
              const canonicalMerged=mergeCanonicalRoster(ctx.alliance?.roster,managerProof.roster,{serverId:targetServer,allianceTag:targetTag});
              await updateAllianceScopeRoster({alliance_id:ctx.alliance.id,roster:canonicalMerged});
              ctx=await getAllianceRoster(playerId).catch(()=>ctx);
            }
          }

          const authoritativeTag=normalizeAllianceTag(ctx.alliance.tag||merged.alliance?.tag),authoritativeServer=normalizeServerId(ctx.alliance.server_id||merged.player?.server_id),context={serverId:authoritativeServer,allianceTag:authoritativeTag};
          const canonical=Array.isArray(ctx.roster)?ctx.roster:[];
          const ownLink=linkCurrentPlayerIdentityIntoRoster(canonical,{playerId,name:merged.player?.name,serverId:authoritativeServer,allianceTag:authoritativeTag,activityEvents:merged.activity_events,updatedAt:now});
          const identityMerge=mergeCloudRosterWithIdentity(ownLink.members,ctx.cloud_roster||[],context);
          const roster=mergeCurrentPlayerActivityIntoRoster(identityMerge.roster,{playerId,name:merged.player?.name,serverId:authoritativeServer,allianceTag:authoritativeTag,activityEvents:merged.activity_events,updatedAt:now});
          const refreshedProof=joinProofForAlliance(merged,{...ctx.alliance,roster:canonical});
          managementVerified=Boolean(refreshedProof.ok&&isManagerRole(refreshedProof.roster_role)&&isManagerRole(ctx.membership?.role));
          merged.alliance={...merged.alliance,id:ctx.alliance.id,server_id:authoritativeServer,tag:authoritativeTag,name:ctx.alliance.name||merged.alliance.name,invite_code:ctx.alliance.invite_code||merged.alliance.invite_code,role:ctx.membership.role||"R1",management_verified:managementVerified,identity_link_status:ownLink.status,members:roster,unlinked_accounts:identityMerge.unlinked_accounts,updated_at:now};merged.sync.sources.alliance=true;await upsertProfile(playerId,merged)}
        await insertSnapshot(playerId,merged,provider);
      }else if(userMode){
        const ownLink=linkCurrentPlayerIdentityIntoRoster(merged.alliance?.members,{playerId,name:merged.player?.name,serverId:merged.player?.server_id,allianceTag:merged.alliance?.tag,activityEvents:merged.activity_events,updatedAt:now});
        merged.alliance={...merged.alliance,members:ownLink.members,identity_link_status:ownLink.status};await upsertProfileForUser(playerId,merged,access);await insertSnapshotForUser(playerId,merged,access,provider)
      }
    }
    const cfg={official:false,approved:false,legacy:false,authorization_status:"safe-launch-disabled",safe_launch_lock:true};
    return res.status(200).json({ok:true,provider,provider_kind:providerKind,capabilities,sources:merged.sync.sources,provider_config:cfg,public_config:cfg,safe_launch:true,synced_at:merged.sync.last_sync,state:merged,access_mode:userMode?"user-rls":"service"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"sync_failed",message:e.name==="AbortError"?"Source timeout":e.message})}
}
