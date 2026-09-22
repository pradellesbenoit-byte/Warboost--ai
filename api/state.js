import {configured,userConfigured,getProfile,getProfileForUser,saveProfileIfUnchanged,saveProfileForUserIfUnchanged,insertSnapshot,insertSnapshotForUser,listSnapshots,listSnapshotsForUser,getAllianceRoster,updateAllianceScopeRoster} from "../lib/supabase.js";
import {normalizeState} from "../lib/normalize.js";
import {recoverHeroData,heroDataSignature} from "../lib/hero-history.js";
import {requireBetaUser,betaAccessForUserAsync,BETA_CONSENT_VERSION} from "../lib/beta-access.js";
import {requireUser} from "../lib/auth.js";
import {mergeCloudRosterWithIdentity,mergeCurrentPlayerActivityIntoRoster} from "../lib/alliance-roster-merge.js";
import {linkCurrentPlayerIdentityIntoRoster,normalizeServerId,normalizeAllianceTag} from "../lib/alliance-identity.js";
import {markCanonicalRosterPresence,mergeRosterLifecycleMetadata,currentActiveRosterMembers,preserveVerifiedR5} from "../lib/alliance-roster-lifecycle.js";
import {isManagerRole} from "../lib/alliance-scope.js";
import {canonicalRosterMemberKey} from "../lib/alliance-rank-management.js";
import {canonicalAllianceAuthorization} from "../lib/alliance-authorization.js";
import {mergeEventAvailabilities,mergeAvailabilityHistory} from "../lib/event-availability.js";

function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
function recoverySummary(r){return {changed:Boolean(r?.changed),recovered_fields:Number(r?.recovered_fields||0),recovered_heroes:Array.isArray(r?.recovered_heroes)?r.recovered_heroes:[],conflicts:Array.isArray(r?.conflicts)?r.conflicts:[],sources:Array.isArray(r?.sources)?r.sources:[]}}
function heroPowerRepairProjection(state={}){
  const profiles=(Array.isArray(state?.hero_profiles)?state.hero_profiles:[]).map(x=>({hero_name:x?.hero_name||x?.name||"",power:x?.power??null,updated_at:x?.updated_at||null,field_updated_at:x?.field_updated_at?.power||null})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const weapons=(Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[]).map(x=>({hero_name:x?.hero_name||"",weapon_name:x?.weapon_name||"",level:x?.level??null,power:x?.power??null,updated_at:x?.updated_at||null})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const squads=(Array.isArray(state?.squads)?state.squads:[]).map((sq,i)=>({id:sq?.id||i+1,heroes:(Array.isArray(sq?.heroes)?sq.heroes:[]).map(h=>({name:h?.name||"",power:h?.power??null}))}));
  return JSON.stringify({profiles,weapons,squads});
}
function fastRestoreRequested(req){return String(req.query?.restore||"")==="1"||(()=>{try{return new URL(req.url||"/","http://localhost").searchParams.get("restore")==="1"}catch{return false}})()}
function betaConsentHeader(req){return String(req.headers?.["x-warboost-beta-consent"]||"").trim()}
function betaAccessError(beta){if(!beta?.configured)return {status:503,code:"BETA_INVITES_NOT_CONFIGURED",message:"Le registre d’invitations WarBoost doit être configuré avant l’ouverture de la bêta."};if(beta?.allowed)return null;const status=String(beta?.access_status||"");return {status:403,code:status==="revoked"?"BETA_INVITE_REVOKED":status==="expired"?"BETA_INVITE_EXPIRED":"BETA_INVITE_REQUIRED",message:status==="revoked"?"Accès bêta WarBoost révoqué":status==="expired"?"Invitation bêta WarBoost expirée":"Invitation bêta WarBoost requise"}}
function orderedRestoreTrace(trace){const order={AUTH_USER:0,BETA_INVITE:1,BETA_ACCEPT:2,PROFILE_READ:3};return [...trace].sort((a,b)=>(order[a?.stage]??50)-(order[b?.stage]??50))}
function confirmedRankAt(row){const n=Date.parse(row?.rank_confirmed_at||"");return Number.isFinite(n)?n:0}

// HF8.6.10: a generic player-state save must never overwrite the authoritative
// Last War roster identity/rank/known metrics with stale browser data.
async function canonicalizeAllianceState(input,playerId){
  let state=normalizeState({...input,player_id:playerId});
  if(!configured())return {state,changed:false,status:"service_unavailable"};
  const ctx=await getAllianceRoster(playerId).catch(()=>null);
  if(!ctx?.alliance)return {state,changed:false,status:"no_alliance"};
  let canonical=Array.isArray(ctx.roster)?ctx.roster:[];
  if(!canonical.length)return {state,changed:false,status:"no_canonical_roster"};

  const authoritativeTag=normalizeAllianceTag(ctx.alliance.tag||state.alliance?.tag);
  const authoritativeServer=normalizeServerId(ctx.alliance.server_id||state.player?.server_id);
  const context={serverId:authoritativeServer,allianceTag:authoritativeTag};
  const authorization=canonicalAllianceAuthorization({playerId,membership:ctx.membership,alliance:ctx.alliance,roster:ctx.roster,identity:{name:state.player?.name,server_id:state.player?.server_id,alliance_tag:state.alliance?.tag}});
  // A confirmed manual rank change can race an older generic profile save. The
  // role endpoint writes the confirmation marker to the canonical roster; if a
  // late /api/state request carries that same newer marker, repair the canonical
  // row before hydrating the profile. Unmarked browser roles never get this
  // privilege.
  const manager=authorization.allowed;
  if(manager&&ctx.alliance.updated_at&&Array.isArray(state.alliance?.members)){
    const localByKey=new Map(state.alliance.members.map(row=>[canonicalRosterMemberKey(row,context),row]).filter(([key])=>Boolean(key)));
    let canonicalChanged=false;
    canonical=canonical.map(raw=>{
      const key=canonicalRosterMemberKey(raw,context),local=localByKey.get(key);
      if(!local||local.rank_confirmed_source!=="r5_r4_manual_rank_management"||confirmedRankAt(local)<=confirmedRankAt(raw))return raw;
      canonicalChanged=true;
      return {...raw,role:local.role,rank_confirmed_at:local.rank_confirmed_at,rank_confirmed_source:local.rank_confirmed_source,updated_at:local.updated_at||local.rank_confirmed_at};
    });
    if(canonicalChanged){
      try{
        const saved=await updateAllianceScopeRoster({alliance_id:ctx.alliance.id,server_id:authoritativeServer,tag:authoritativeTag,name:ctx.alliance.name,roster:canonical,expected_updated_at:ctx.alliance.updated_at});
        if(saved?.roster)canonical=saved.roster;
        if(saved?.updated_at)ctx.alliance={...ctx.alliance,...saved};
      }catch{
        // Keep the newer confirmed row in the returned profile; a later CAS-safe
        // request will retry the canonical repair without deleting any data.
      }
    }
  }
  const canonicalWithPresence=markCanonicalRosterPresence(canonical,ctx.alliance.roster_updated_at);
  const canonicalWithKeys=canonicalWithPresence.map(raw=>{
    const row={...raw,server_id:normalizeServerId(raw?.server_id)||authoritativeServer,alliance_tag:normalizeAllianceTag(raw?.alliance_tag)||authoritativeTag};
    return {...row,canonical_member_key:canonicalRosterMemberKey(row,context)};
  });
  const stableStamp=state.updated_at||state.alliance?.updated_at||new Date().toISOString();

  const ownLink=linkCurrentPlayerIdentityIntoRoster(canonicalWithKeys,{
    playerId,
    name:state.player?.name,
    serverId:authoritativeServer,
    allianceTag:authoritativeTag,
    activityEvents:state.activity_events,
    updatedAt:stableStamp
  });
  const identityMerge=mergeCloudRosterWithIdentity(ownLink.members,ctx.cloud_roster||[],context);
  const rosterWithActivity=mergeCurrentPlayerActivityIntoRoster(identityMerge.roster,{
    playerId,
    name:state.player?.name,
    serverId:authoritativeServer,
    allianceTag:authoritativeTag,
    activityEvents:state.activity_events,
    updatedAt:stableStamp
  });
  const rosterWithLifecycle=mergeRosterLifecycleMetadata(state.alliance?.members,rosterWithActivity);
  const preservedR5=preserveVerifiedR5(state.alliance?.members,rosterWithLifecycle);
  const activeRoster=currentActiveRosterMembers(preservedR5.rows,state.alliance?.roster_review,state.alliance?.former_members);

  const nextAlliance={
    ...state.alliance,
    id:ctx.alliance.id,
    owner_player_id:ctx.alliance.owner_player_id||state.alliance?.owner_player_id||null,
    server_id:authoritativeServer,
    tag:authoritativeTag,
    name:ctx.alliance.name||state.alliance?.name,
    invite_code:ctx.alliance.invite_code||state.alliance?.invite_code,
    role:ctx.membership?.role||state.alliance?.role||"R1",
    cloud_role_verified:Boolean(ctx.membership?.role),
    management_verified:authorization.allowed,
    identity_link_status:ownLink.status,
    members:activeRoster,
    r5_sync_required:Boolean(preservedR5.preserved),
    event_availability:mergeEventAvailabilities(state.alliance?.event_availability,activeRoster.flatMap(row=>row.event_availability||[])),
    availability_history:mergeAvailabilityHistory(state.alliance?.availability_history,activeRoster.flatMap(row=>row.availability_history||[])),
    unlinked_accounts:identityMerge.unlinked_accounts,
    roster_updated_at:ctx.alliance.roster_updated_at||state.alliance?.roster_updated_at||null
  };
  const before=JSON.stringify({id:state.alliance?.id,server_id:state.alliance?.server_id,tag:state.alliance?.tag,role:state.alliance?.role,members:state.alliance?.members||[],unlinked_accounts:state.alliance?.unlinked_accounts||[]});
  const after=JSON.stringify({id:nextAlliance.id,server_id:nextAlliance.server_id,tag:nextAlliance.tag,role:nextAlliance.role,members:nextAlliance.members||[],unlinked_accounts:nextAlliance.unlinked_accounts||[]});
  state=normalizeState({...state,alliance:nextAlliance});
  return {state,changed:before!==after,status:"canonical_roster_applied"};
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const restoreTrace=[],trace=entry=>{if(entry&&restoreTrace.length<12)restoreTrace.push(entry)};
  try{
    if(!configured()&&!userConfigured())return res.status(503).json({error:"database_not_configured",message:"Le serveur fonctionne en mode local tant que Supabase V1 n'est pas configuré."});
    const access=accessToken(req),fastRestore=req.method==="GET"&&fastRestoreRequested(req);

    // HF8.6.20 login-critical path: authenticate once, then validate the invitation and read the
    // verified user's profile in parallel. HF8.6.19 performed AUTH -> INVITE -> PROFILE serially
    // while the browser aborted at 6.5 s; on a Vercel cold start this could never reliably finish.
    if(fastRestore){
      const authStarted=Date.now();let user;
      try{user=await requireUser(req);trace({stage:"AUTH_USER",ms:Math.max(0,Date.now()-authStarted),status:"ok",error:null})}
      catch(error){trace({stage:"AUTH_USER",ms:Math.max(0,Date.now()-authStarted),status:"error",error:String(error?.code||error?.name||"auth_failed")});throw error}
      if(betaConsentHeader(req)!==BETA_CONSENT_VERSION)return res.status(428).json({error:"BETA_CONSENT_REQUIRED",message:"Consentement bêta requis avant l'envoi de données",restore_trace:orderedRestoreTrace(restoreTrace)});
      const playerId=String(user.id),profileStarted=Date.now();
      const profilePromise=(configured()?getProfile(playerId,{timeoutMs:4000}):getProfileForUser(playerId,access,{timeoutMs:4000}))
        .then(row=>{trace({stage:"PROFILE_READ",ms:Math.max(0,Date.now()-profileStarted),status:"ok",error:null});return row})
        .catch(error=>{trace({stage:"PROFILE_READ",ms:Math.max(0,Date.now()-profileStarted),status:"error",error:String(error?.code||error?.name||"profile_read_failed")});throw error});
      const betaPromise=betaAccessForUserAsync(user,{trace,inviteTimeoutMs:3500,acceptTimeoutMs:900});
      const [beta,row]=await Promise.all([betaPromise,profilePromise]);
      const accessError=betaAccessError(beta);if(accessError)return res.status(accessError.status).json({error:accessError.code,message:accessError.message,restore_trace:orderedRestoreTrace(restoreTrace)});
      if(!row?.state)return res.status(200).json({ok:true,state:null,updated_at:row?.updated_at||null,hero_history_recovery:recoverySummary(null),alliance_roster_repair:{changed:false,status:"empty_profile"},access_mode:configured()?"service-fast":"user-rls-fast",restore_mode:"fast-profile",restore_strategy:"parallel",restore_trace:orderedRestoreTrace(restoreTrace)});
      const current=normalizeState({...row.state,player_id:playerId});
      let rosterRepair;
      try{rosterRepair=await canonicalizeAllianceState(current,playerId)}
      catch{rosterRepair={state:current,changed:false,status:"canonicalization_deferred"}}
      const finalState=rosterRepair.state;
      return res.status(200).json({ok:true,state:finalState,updated_at:row?.updated_at||finalState.updated_at,hero_history_recovery:recoverySummary(null),alliance_roster_repair:{changed:rosterRepair.changed,status:rosterRepair.status},access_mode:configured()?"service-fast":"user-rls-fast",restore_mode:"fast-profile",restore_strategy:"parallel",restore_trace:orderedRestoreTrace(restoreTrace)});
    }

    const {user}=await requireBetaUser(req,{consent:true,trace}),playerId=user.id,userMode=userConfigured()&&Boolean(access);
    const getOwn=()=>userMode?getProfileForUser(playerId,access):getProfile(playerId);
    const saveOwn=(state,expectedUpdatedAt)=>userMode?saveProfileForUserIfUnchanged(playerId,state,access,expectedUpdatedAt):saveProfileIfUnchanged(playerId,state,expectedUpdatedAt);
    const snapshotOwn=(state,source)=>userMode?insertSnapshotForUser(playerId,state,access,source):insertSnapshot(playerId,state,source);
    const historyOwn=limit=>userMode?listSnapshotsForUser(playerId,access,limit):listSnapshots(playerId,limit);

    if(req.method==="GET"){
      const profileStarted=Date.now();
      let row;
      try{row=await getOwn();trace({stage:"PROFILE_READ",ms:Math.max(0,Date.now()-profileStarted),status:"ok",error:null})}
      catch(error){trace({stage:"PROFILE_READ",ms:Math.max(0,Date.now()-profileStarted),status:"error",error:String(error?.code||error?.name||"profile_read_failed")});throw error}
      if(!row?.state)return res.status(200).json({ok:true,state:null,updated_at:row?.updated_at||null,hero_history_recovery:recoverySummary(null),alliance_roster_repair:{changed:false,status:"empty_profile"},access_mode:userMode?"user-rls":"service",restore_mode:"full",restore_trace:restoreTrace});
      const current=normalizeState({...row.state,player_id:playerId});
      // Legacy HF8.6.18 verifier marker only: fastRestore; restore_mode:"fast-profile"; status:"deferred_fast_restore"; if(fastRestore)return
      let snapshots=[];try{snapshots=await historyOwn(100)}catch{}
      const recovered=recoverHeroData(current,{historicalStates:(snapshots||[]).map(x=>({state:x?.state,captured_at:x?.captured_at,source:x?.source||"wb1_snapshots"}))});
      let finalState=normalizeState({...recovered.state,player_id:playerId}),updatedAt=row.updated_at||finalState.updated_at;
      const rosterRepair=await canonicalizeAllianceState(finalState,playerId);
      finalState=rosterRepair.state;
      const normalizedHeroPowerDataChanged=heroPowerRepairProjection(row.state)!==heroPowerRepairProjection(finalState);
      if(recovered.changed||rosterRepair.changed||normalizedHeroPowerDataChanged){
        try{const saved=await saveOwn(finalState,row.updated_at||null);finalState=normalizeState(saved?.state||finalState);updatedAt=saved?.updated_at||updatedAt}
        catch(error){if(error?.code!=="profile_write_conflict")throw error;const latest=await getOwn();finalState=normalizeState({...latest?.state,player_id:playerId});updatedAt=latest?.updated_at||updatedAt}
      }
      return res.status(200).json({ok:true,state:finalState,updated_at:updatedAt,hero_history_recovery:recoverySummary(recovered),alliance_roster_repair:{changed:rosterRepair.changed,status:rosterRepair.status},access_mode:userMode?"user-rls":"service",restore_trace:restoreTrace});
    }

    if(req.method==="POST"){
      const previous=await getOwn();
      const baseUpdatedAt=req.body?.base_updated_at===null?null:String(req.body?.base_updated_at||"").trim()||null;
      if(previous?.updated_at&&baseUpdatedAt!==String(previous.updated_at)){
        return res.status(409).json({error:"profile_write_conflict",message:"Le profil a été modifié sur un autre appareil.",state:previous.state,updated_at:previous.updated_at});
      }
      if(!previous&&baseUpdatedAt!==null)return res.status(409).json({error:"profile_write_conflict",message:"Le profil cloud a changé. Recharge les données avant de réessayer.",state:null,updated_at:null});
      let incoming=normalizeState({...req.body?.state,player_id:playerId});
      let recovered=null;
      if(previous?.state){
        recovered=recoverHeroData(incoming,{historicalStates:[{state:previous.state,captured_at:previous.updated_at,source:"previous_profile"}]});
        incoming=normalizeState({...recovered.state,player_id:playerId});
        if(heroDataSignature(previous.state)!==heroDataSignature(incoming)){
          try{await snapshotOwn(normalizeState({...previous.state,player_id:playerId}),"warboost-prewrite")}catch{}
        }
      }
      const rosterRepair=await canonicalizeAllianceState(incoming,playerId);
      incoming=rosterRepair.state;
      let row;
      try{row=await saveOwn(incoming,previous?.updated_at||null)}
      catch(error){
        if(error?.code!=="profile_write_conflict")throw error;
        const latest=await getOwn();
        return res.status(409).json({error:"profile_write_conflict",message:error.message,state:latest?.state||null,updated_at:latest?.updated_at||null});
      }
      return res.status(200).json({ok:true,state:row?.state||incoming,updated_at:row?.updated_at||incoming.updated_at,hero_history_recovery:recoverySummary(recovered),alliance_roster_repair:{changed:rosterRepair.changed,status:rosterRepair.status},access_mode:userMode?"user-rls":"service"});
    }

    res.setHeader("Allow","GET, POST");return res.status(405).json({error:"method_not_allowed"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"state_error",message:e.message,restore_trace:restoreTrace})}
}
