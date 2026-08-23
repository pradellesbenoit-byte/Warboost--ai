import {configured,userConfigured,getProfile,upsertProfile,getProfileForUser,upsertProfileForUser} from "../lib/supabase.js";
import {normalizeState} from "../lib/normalize.js";
import {requireUser} from "../lib/auth.js";
function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");try{
  if(!configured()&&!userConfigured())return res.status(503).json({error:"database_not_configured",message:"Le serveur fonctionne en mode local tant que Supabase V1 n'est pas configuré."});
  const user=await requireUser(req);const playerId=user.id,access=accessToken(req),userMode=userConfigured()&&Boolean(access);
  if(req.method==="GET"){const row=userMode?await getProfileForUser(playerId,access):await getProfile(playerId);return res.status(200).json({ok:true,state:row?.state||null,updated_at:row?.updated_at||null,access_mode:userMode?"user-rls":"service"});}
  if(req.method==="POST"){const state=normalizeState({...req.body?.state,player_id:playerId});const row=userMode?await upsertProfileForUser(playerId,state,access):await upsertProfile(playerId,state);return res.status(200).json({ok:true,state:row?.state||state,updated_at:row?.updated_at||state.updated_at,access_mode:userMode?"user-rls":"service"});}
  res.setHeader("Allow","GET, POST");return res.status(405).json({error:"method_not_allowed"});
}catch(e){return res.status(e.status||500).json({error:e.code||"state_error",message:e.message})}}
