import {configured,getProfile,upsertProfile} from "../lib/supabase.js";
import {normalizeState} from "../lib/normalize.js";
import {requireUser} from "../lib/auth.js";
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");try{
  if(!configured())return res.status(503).json({error:"database_not_configured",message:"Le serveur fonctionne en mode local tant que Supabase V1 n'est pas configuré."});
  const user=await requireUser(req);const playerId=user.id;
  if(req.method==="GET"){const row=await getProfile(playerId);return res.status(200).json({ok:true,state:row?.state||null,updated_at:row?.updated_at||null});}
  if(req.method==="POST"){const state=normalizeState({...req.body?.state,player_id:playerId});const row=await upsertProfile(playerId,state);return res.status(200).json({ok:true,state:row?.state||state,updated_at:row?.updated_at||state.updated_at});}
  res.setHeader("Allow","GET, POST");return res.status(405).json({error:"method_not_allowed"});
}catch(e){return res.status(e.status||500).json({error:e.code||"state_error",message:e.message})}}
