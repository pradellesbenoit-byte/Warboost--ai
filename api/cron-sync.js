import {configured,listProfiles,upsertProfile,insertSnapshot} from "../lib/supabase.js";
import {mergeNewest} from "../lib/normalize.js";
import {fetchLastWarState} from "../lib/provider.js";
export default async function handler(req,res){
  const secret=String(process.env.CRON_SECRET||"");const auth=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"");
  if(!secret||auth!==secret)return res.status(401).json({error:"unauthorized"});
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const rows=await listProfiles(500);let updated=0,failed=0,skipped=0;
    for(const row of rows||[]){
      const cur=row.state||{};if(!cur?.player?.name||!cur?.player?.server_id){skipped++;continue}
      try{const remote=await fetchLastWarState({player_id:row.player_id,identity:cur.player,alliance:cur.alliance?.tag||""});const merged=mergeNewest(cur,{...remote.state,sync:{provider:remote.provider,status:"ok",last_sync:new Date().toISOString(),last_error:null,auto_ready:true}});await upsertProfile(row.player_id,merged);await insertSnapshot(row.player_id,merged,remote.provider);updated++}catch{failed++}
    }
    return res.status(200).json({ok:true,updated,failed,skipped,total:(rows||[]).length});
  }catch(e){return res.status(500).json({error:"cron_sync_failed",message:e.message})}
}
