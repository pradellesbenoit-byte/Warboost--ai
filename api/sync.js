import {PUBLISHER_DEMO_MODE,buildPublisherDemoState} from "../lib/publisher-demo.js";
import {mergeNewest,normalizeState} from "../lib/normalize.js";
import {configured,userConfigured,getProfile,upsertProfile,getProfileForUser,upsertProfileForUser,insertSnapshot,insertSnapshotForUser,getAllianceRoster} from "../lib/supabase.js";
import {fetchLastWarState,providerConfig} from "../lib/provider.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {mergeCloudRosterPreservingManual} from "../lib/alliance-roster-merge.js";
function accessToken(req){return String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim()}
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  if(PUBLISHER_DEMO_MODE){const now=new Date().toISOString(),state=buildPublisherDemoState(now);return res.status(200).json({ok:true,publisher_demo:true,read_only:true,provider:"publisher-demo",provider_kind:"publisher-demo",capabilities:[],sources:state.sync.sources,synced_at:now,state,official_connector:false,live_lastwar_data:false})}
  try{
    const {user}=await requireBetaUser(req,{consent:true}),playerId=user.id,access=accessToken(req),userMode=userConfigured()&&Boolean(access),current=normalizeState({...req.body?.state,player_id:playerId});let base=current;
    if(configured()||userMode){const saved=userMode?await getProfileForUser(playerId,access):await getProfile(playerId);if(saved?.state)base=mergeNewest(base,saved.state)}
    let merged=base,provider="warboost-local",providerKind="local",remoteOk=false,remoteError=null,capabilities=[];
    try{
      const remote=await fetchLastWarState({player_id:playerId,identity:base.player,alliance:base.alliance?.tag||""});
      merged=mergeNewest(merged,remote.state||{});provider=remote.provider||provider;providerKind=remote.kind||"approved";capabilities=remote.capabilities||[];remoteOk=true;
    }catch(e){if(e.code!=="PROVIDER_NOT_CONNECTED")remoteError=e.message}
    const now=new Date().toISOString(),officialOk=remoteOk&&(providerKind==="official"||providerKind==="approved"),legacyOk=remoteOk&&providerKind==="legacy";
    merged.sync={...merged.sync,provider,provider_kind:providerKind,access_status:officialOk?"authorized":providerConfig().authorization_status,capabilities,status:"ok",last_sync:now,official_last_sync:officialOk?now:merged.sync?.official_last_sync||null,public_last_sync:legacyOk?now:merged.sync?.public_last_sync||null,last_error:remoteError,auto_ready:true,sources:{...merged.sync?.sources,official:officialOk,public:legacyOk,scan:Boolean(merged.sync?.last_scan),alliance:false}};
    if(configured()||userMode){
      if(userMode)await upsertProfileForUser(playerId,merged,access);else await upsertProfile(playerId,merged);
      if(configured()){
        const ctx=await getAllianceRoster(playerId).catch(()=>null);
        if(ctx){
          const roster=mergeCloudRosterPreservingManual(merged.alliance?.members,ctx.roster);
          merged.alliance={...merged.alliance,id:ctx.alliance.id,tag:ctx.alliance.tag||merged.alliance.tag,name:ctx.alliance.name||merged.alliance.name,invite_code:ctx.alliance.invite_code||merged.alliance.invite_code,role:ctx.membership.role||merged.alliance.role,members:roster,updated_at:now};merged.sync.sources.alliance=true;await upsertProfile(playerId,merged)}
        await insertSnapshot(playerId,merged,remoteOk?provider:"warboost-local");
      }else if(userMode){await insertSnapshotForUser(playerId,merged,access,remoteOk?provider:"warboost-local")}
    }
    const cfg=providerConfig();return res.status(200).json({ok:true,provider,provider_kind:providerKind,capabilities,sources:merged.sync.sources,provider_config:cfg,public_config:cfg,synced_at:merged.sync.last_sync,state:merged,access_mode:userMode?"user-rls":"service"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"sync_failed",message:e.name==="AbortError"?"Source timeout":e.message})}
}
