import {mergeNewest,normalizeState} from "../lib/normalize.js";
import {configured,getProfile,upsertProfile,insertSnapshot,getAllianceRoster} from "../lib/supabase.js";
import {fetchLastWarState,providerConfig} from "../lib/provider.js";
import {requireUser} from "../lib/auth.js";
export default async function handler(req,res){res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  try{
    const user=await requireUser(req),playerId=user.id,current=normalizeState({...req.body?.state,player_id:playerId});let base=current;
    if(configured()){const saved=await getProfile(playerId);if(saved?.state)base=mergeNewest(base,saved.state)}
    let merged=base,provider="warboost-local",providerKind="local",remoteOk=false,remoteError=null,capabilities=[];
    try{
      const remote=await fetchLastWarState({player_id:playerId,identity:base.player,alliance:base.alliance?.tag||""});
      merged=mergeNewest(merged,remote.state||{});provider=remote.provider||provider;providerKind=remote.kind||"approved";capabilities=remote.capabilities||[];remoteOk=true;
    }catch(e){if(e.code!=="PROVIDER_NOT_CONNECTED")remoteError=e.message}
    const now=new Date().toISOString(),officialOk=remoteOk&&(providerKind==="official"||providerKind==="approved"),legacyOk=remoteOk&&providerKind==="legacy";
    merged.sync={
      ...merged.sync,
      provider,
      provider_kind:providerKind,
      access_status:officialOk?"authorized":providerConfig().authorization_status,
      capabilities,
      status:"ok",
      last_sync:now,
      official_last_sync:officialOk?now:merged.sync?.official_last_sync||null,
      public_last_sync:legacyOk?now:merged.sync?.public_last_sync||null,
      last_error:remoteError,
      auto_ready:true,
      sources:{...merged.sync?.sources,official:officialOk,public:legacyOk,scan:Boolean(merged.sync?.last_scan),alliance:false}
    };
    if(configured()){
      await upsertProfile(playerId,merged);
      const ctx=await getAllianceRoster(playerId).catch(()=>null);
      if(ctx){const prev=new Map((merged.alliance?.members||[]).map(m=>[m.player_id||m.name,m]));const roster=ctx.roster.map(m=>{const old=prev.get(m.player_id)||prev.get(m.name),delta=Number.isFinite(Number(m.power_m))&&Number.isFinite(Number(old?.power_m))?Number((Number(m.power_m)-Number(old.power_m)).toFixed(2)):null;return {...m,delta_m:delta}});merged.alliance={...merged.alliance,id:ctx.alliance.id,tag:ctx.alliance.tag||merged.alliance.tag,name:ctx.alliance.name||merged.alliance.name,invite_code:ctx.alliance.invite_code||merged.alliance.invite_code,role:ctx.membership.role||merged.alliance.role,members:roster,updated_at:now};merged.sync.sources.alliance=true;await upsertProfile(playerId,merged)}
      await insertSnapshot(playerId,merged,remoteOk?provider:"warboost-local");
    }
    const cfg=providerConfig();
    return res.status(200).json({ok:true,provider,provider_kind:providerKind,capabilities,sources:merged.sync.sources,provider_config:cfg,public_config:cfg,synced_at:merged.sync.last_sync,state:merged});
  }catch(e){return res.status(e.status||500).json({error:e.code||"sync_failed",message:e.name==="AbortError"?"Source timeout":e.message})}
}
