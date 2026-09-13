import {configured,userConfigured,getProfile,upsertProfile,getProfileForUser,upsertProfileForUser,insertSnapshot,insertSnapshotForUser,listSnapshots,listSnapshotsForUser,getAllianceRoster} from "../lib/supabase.js";
import {normalizeState} from "../lib/normalize.js";
import {recoverHeroData,heroDataSignature} from "../lib/hero-history.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {mergeCloudRosterWithIdentity,mergeCurrentPlayerActivityIntoRoster} from "../lib/alliance-roster-merge.js";
import {linkCurrentPlayerIdentityIntoRoster,normalizeServerId,normalizeAllianceTag} from "../lib/alliance-identity.js";
import {mergeRosterLifecycleMetadata,currentActiveRosterMembers} from "../lib/alliance-roster-lifecycle.js";

function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
function recoverySummary(r){return {changed:Boolean(r?.changed),recovered_fields:Number(r?.recovered_fields||0),recovered_heroes:Array.isArray(r?.recovered_heroes)?r.recovered_heroes:[],conflicts:Array.isArray(r?.conflicts)?r.conflicts:[],sources:Array.isArray(r?.sources)?r.sources:[]}}

// HF8.6.10: a generic player-state save must never overwrite the authoritative
// Last War roster identity/rank/known metrics with stale browser data.
async function canonicalizeAllianceState(input,playerId){
  let state=normalizeState({...input,player_id:playerId});
  if(!configured())return {state,changed:false,status:"service_unavailable"};
  const ctx=await getAllianceRoster(playerId).catch(()=>null);
  if(!ctx?.alliance)return {state,changed:false,status:"no_alliance"};
  const canonical=Array.isArray(ctx.roster)?ctx.roster:[];
  if(!canonical.length)return {state,changed:false,status:"no_canonical_roster"};

  const authoritativeTag=normalizeAllianceTag(ctx.alliance.tag||state.alliance?.tag);
  const authoritativeServer=normalizeServerId(ctx.alliance.server_id||state.player?.server_id);
  const context={serverId:authoritativeServer,allianceTag:authoritativeTag};
  const stableStamp=state.updated_at||state.alliance?.updated_at||new Date().toISOString();

  const ownLink=linkCurrentPlayerIdentityIntoRoster(canonical,{
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
  const activeRoster=currentActiveRosterMembers(rosterWithLifecycle,state.alliance?.roster_review,state.alliance?.former_members);

  const nextAlliance={
    ...state.alliance,
    id:ctx.alliance.id,
    server_id:authoritativeServer,
    tag:authoritativeTag,
    name:ctx.alliance.name||state.alliance?.name,
    invite_code:ctx.alliance.invite_code||state.alliance?.invite_code,
    role:ctx.membership?.role||state.alliance?.role||"R1",
    identity_link_status:ownLink.status,
    members:activeRoster,
    unlinked_accounts:identityMerge.unlinked_accounts
  };
  const before=JSON.stringify({id:state.alliance?.id,server_id:state.alliance?.server_id,tag:state.alliance?.tag,role:state.alliance?.role,members:state.alliance?.members||[],unlinked_accounts:state.alliance?.unlinked_accounts||[]});
  const after=JSON.stringify({id:nextAlliance.id,server_id:nextAlliance.server_id,tag:nextAlliance.tag,role:nextAlliance.role,members:nextAlliance.members||[],unlinked_accounts:nextAlliance.unlinked_accounts||[]});
  state=normalizeState({...state,alliance:nextAlliance});
  return {state,changed:before!==after,status:"canonical_roster_applied"};
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  try{
    if(!configured()&&!userConfigured())return res.status(503).json({error:"database_not_configured",message:"Le serveur fonctionne en mode local tant que Supabase V1 n'est pas configuré."});
    const {user}=await requireBetaUser(req,{consent:true}),playerId=user.id,access=accessToken(req),userMode=userConfigured()&&Boolean(access);
    const getOwn=()=>userMode?getProfileForUser(playerId,access):getProfile(playerId);
    const saveOwn=state=>userMode?upsertProfileForUser(playerId,state,access):upsertProfile(playerId,state);
    const snapshotOwn=(state,source)=>userMode?insertSnapshotForUser(playerId,state,access,source):insertSnapshot(playerId,state,source);
    const historyOwn=limit=>userMode?listSnapshotsForUser(playerId,access,limit):listSnapshots(playerId,limit);

    if(req.method==="GET"){
      const row=await getOwn();
      if(!row?.state)return res.status(200).json({ok:true,state:null,updated_at:row?.updated_at||null,hero_history_recovery:recoverySummary(null),alliance_roster_repair:{changed:false,status:"empty_profile"},access_mode:userMode?"user-rls":"service"});
      const current=normalizeState({...row.state,player_id:playerId});
      let snapshots=[];try{snapshots=await historyOwn(100)}catch{}
      const recovered=recoverHeroData(current,{historicalStates:(snapshots||[]).map(x=>({state:x?.state,captured_at:x?.captured_at,source:x?.source||"wb1_snapshots"}))});
      let finalState=normalizeState({...recovered.state,player_id:playerId}),updatedAt=row.updated_at||finalState.updated_at;
      const rosterRepair=await canonicalizeAllianceState(finalState,playerId);
      finalState=rosterRepair.state;
      if(recovered.changed||rosterRepair.changed){const saved=await saveOwn(finalState);finalState=normalizeState(saved?.state||finalState);updatedAt=saved?.updated_at||updatedAt;}
      return res.status(200).json({ok:true,state:finalState,updated_at:updatedAt,hero_history_recovery:recoverySummary(recovered),alliance_roster_repair:{changed:rosterRepair.changed,status:rosterRepair.status},access_mode:userMode?"user-rls":"service"});
    }

    if(req.method==="POST"){
      const previous=await getOwn();
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
      const row=await saveOwn(incoming);
      return res.status(200).json({ok:true,state:row?.state||incoming,updated_at:row?.updated_at||incoming.updated_at,hero_history_recovery:recoverySummary(recovered),alliance_roster_repair:{changed:rosterRepair.changed,status:rosterRepair.status},access_mode:userMode?"user-rls":"service"});
    }

    res.setHeader("Allow","GET, POST");return res.status(405).json({error:"method_not_allowed"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"state_error",message:e.message})}
}
