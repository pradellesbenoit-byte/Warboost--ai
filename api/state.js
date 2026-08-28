import {configured,userConfigured,getProfile,upsertProfile,getProfileForUser,upsertProfileForUser,insertSnapshot,insertSnapshotForUser,listSnapshots,listSnapshotsForUser} from "../lib/supabase.js";
import {normalizeState} from "../lib/normalize.js";
import {recoverHeroData,heroDataSignature} from "../lib/hero-history.js";
import {requireUser} from "../lib/auth.js";

function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
function recoverySummary(r){return {changed:Boolean(r?.changed),recovered_fields:Number(r?.recovered_fields||0),recovered_heroes:Array.isArray(r?.recovered_heroes)?r.recovered_heroes:[],conflicts:Array.isArray(r?.conflicts)?r.conflicts:[],sources:Array.isArray(r?.sources)?r.sources:[]}}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  try{
    if(!configured()&&!userConfigured())return res.status(503).json({error:"database_not_configured",message:"Le serveur fonctionne en mode local tant que Supabase V1 n'est pas configuré."});
    const user=await requireUser(req),playerId=user.id,access=accessToken(req),userMode=userConfigured()&&Boolean(access);
    const getOwn=()=>userMode?getProfileForUser(playerId,access):getProfile(playerId);
    const saveOwn=state=>userMode?upsertProfileForUser(playerId,state,access):upsertProfile(playerId,state);
    const snapshotOwn=(state,source)=>userMode?insertSnapshotForUser(playerId,state,access,source):insertSnapshot(playerId,state,source);
    const historyOwn=limit=>userMode?listSnapshotsForUser(playerId,access,limit):listSnapshots(playerId,limit);

    if(req.method==="GET"){
      const row=await getOwn();
      if(!row?.state)return res.status(200).json({ok:true,state:null,updated_at:row?.updated_at||null,hero_history_recovery:recoverySummary(null),access_mode:userMode?"user-rls":"service"});
      const current=normalizeState({...row.state,player_id:playerId});
      let snapshots=[];try{snapshots=await historyOwn(100)}catch{}
      const recovered=recoverHeroData(current,{historicalStates:(snapshots||[]).map(x=>({state:x?.state,captured_at:x?.captured_at,source:x?.source||"wb1_snapshots"}))});
      let finalState=normalizeState({...recovered.state,player_id:playerId}),updatedAt=row.updated_at||finalState.updated_at;
      if(recovered.changed){const saved=await saveOwn(finalState);finalState=normalizeState(saved?.state||finalState);updatedAt=saved?.updated_at||updatedAt;}
      return res.status(200).json({ok:true,state:finalState,updated_at:updatedAt,hero_history_recovery:recoverySummary(recovered),access_mode:userMode?"user-rls":"service"});
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
      const row=await saveOwn(incoming);
      return res.status(200).json({ok:true,state:row?.state||incoming,updated_at:row?.updated_at||incoming.updated_at,hero_history_recovery:recoverySummary(recovered),access_mode:userMode?"user-rls":"service"});
    }

    res.setHeader("Allow","GET, POST");return res.status(405).json({error:"method_not_allowed"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"state_error",message:e.message})}
}
