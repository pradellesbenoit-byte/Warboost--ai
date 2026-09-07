import {mergeNewest,normalizeState} from "../lib/normalize.js";
import {configured,userConfigured,getProfile,upsertProfile,getProfileForUser,upsertProfileForUser,insertSnapshot,insertSnapshotForUser,getAllianceRoster} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {mergeCloudRosterPreservingManual} from "../lib/alliance-roster-merge.js";
function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  try{
    const {user}=await requireBetaUser(req,{consent:true}),playerId=user.id,access=accessToken(req),userMode=userConfigured()&&Boolean(access),current=normalizeState({...req.body?.state,player_id:playerId});let base=current;
    if(configured()||userMode){const saved=userMode?await getProfileForUser(playerId,access):await getProfile(playerId);if(saved?.state)base=mergeNewest(base,saved.state)}
    let merged=base,provider="warboost-cloud",providerKind="warboost",capabilities=["player-consented-cloud","scan-derived-data","alliance-roster"];
    const now=new Date().toISOString();
    merged.sync={...merged.sync,provider,provider_kind:providerKind,access_status:"safe-launch-external-disabled",capabilities,status:"ok",last_sync:now,last_error:null,auto_ready:true,sources:{...merged.sync?.sources,official:false,public:false,scan:Boolean(merged.sync?.last_scan),alliance:false}};
    if(configured()||userMode){
      if(userMode)await upsertProfileForUser(playerId,merged,access);else await upsertProfile(playerId,merged);
      if(configured()){
        const ctx=await getAllianceRoster(playerId).catch(()=>null);
        if(ctx){
          const roster=mergeCloudRosterPreservingManual(merged.alliance?.members,ctx.roster);
          merged.alliance={...merged.alliance,id:ctx.alliance.id,tag:ctx.alliance.tag||merged.alliance.tag,name:ctx.alliance.name||merged.alliance.name,invite_code:ctx.alliance.invite_code||merged.alliance.invite_code,role:ctx.membership.role||"R1",management_verified:true,members:roster,updated_at:now};merged.sync.sources.alliance=true;await upsertProfile(playerId,merged)}
        await insertSnapshot(playerId,merged,provider);
      }else if(userMode){await insertSnapshotForUser(playerId,merged,access,provider)}
    }
    const cfg={official:false,approved:false,legacy:false,authorization_status:"safe-launch-disabled",safe_launch_lock:true};
    return res.status(200).json({ok:true,provider,provider_kind:providerKind,capabilities,sources:merged.sync.sources,provider_config:cfg,public_config:cfg,safe_launch:true,synced_at:merged.sync.last_sync,state:merged,access_mode:userMode?"user-rls":"service"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"sync_failed",message:e.name==="AbortError"?"Source timeout":e.message})}
}
