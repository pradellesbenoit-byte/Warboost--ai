import {mergeNewest,normalizeState} from "../lib/normalize.js";
import {configured,getProfile,upsertProfile,insertSnapshot} from "../lib/supabase.js";
import {fetchLastWarState} from "../lib/provider.js";
import {requireUser} from "../lib/auth.js";
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  try{const user=await requireUser(req);const playerId=user.id;const current=normalizeState({...req.body?.state,player_id:playerId});const remote=await fetchLastWarState({player_id:playerId,identity:current.player,alliance:current.alliance?.tag||""});let base=current;if(configured()){const saved=await getProfile(playerId);if(saved?.state)base=mergeNewest(base,saved.state)}const merged=mergeNewest(base,{...remote.state,sync:{provider:remote.provider,status:"ok",last_sync:new Date().toISOString(),last_error:null,auto_ready:true}});if(configured()){await upsertProfile(playerId,merged);await insertSnapshot(playerId,merged,remote.provider)}return res.status(200).json({ok:true,provider:remote.provider,synced_at:new Date().toISOString(),state:merged});}
  catch(e){const code=e.status||(e.code==="PROVIDER_NOT_CONNECTED"?503:502);return res.status(code).json({error:e.code||"sync_failed",message:e.name==="AbortError"?"La source Last War a dépassé 8 secondes.":e.message})}
}
