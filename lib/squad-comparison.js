// Temporary comparison only. Never import persistence, restore or reconciliation.
import {projectSquads,SQUAD_COMPARE_SCHEMA} from "./squad-comparison-project.js";
import {compareSquadProjections} from "./squad-comparison-results.js";
export {projectSquads,SQUAD_COMPARE_SCHEMA,SQUAD_COMPARE_CATEGORIES} from "./squad-comparison-project.js";
export {compareSquadProjections} from "./squad-comparison-results.js";
const date=input=>typeof input==="string"&&Number.isFinite(Date.parse(input))?new Date(input).toISOString():null;

// Ephemeral UI state only; context/fingerprints are never returned or logged.
export function createSquadComparison({context,request,onChange=()=>{}}){
  let generation=0,busy=false,stamp=null,view={kind:"idle"};
  const authorized=ctx=>Boolean(ctx.allowed&&ctx.session&&ctx.owner&&String(ctx.local?.player_id||"")===String(ctx.owner));
  const stampOf=ctx=>JSON.stringify([ctx.session,ctx.owner,ctx.revision,ctx.local]);
  function current(){
    const ctx=context();
    if(!authorized(ctx)||stamp!==null&&stamp!==stampOf(ctx))return {kind:stamp===null?"idle":"stale"};
    return view;
  }
  return {
    view:current,
    async run(){
      const ctx=context();
      if(!authorized(ctx)){view={kind:"error",reason:"auth"};onChange();return;}
      const nextStamp=stampOf(ctx);
      if(busy&&stamp===nextStamp)return;
      const mine=++generation;
      stamp=nextStamp;busy=true;view={kind:"busy"};onChange();
      const local=projectSquads(JSON.parse(JSON.stringify(ctx.local?.squads??null)));
      try{
        const reply=await request();
        if(mine!==generation)return;
        if(!authorized(context())||stamp!==stampOf(context())){view={kind:"stale"};return;}
        const {response,json}=reply;
        if(!response?.ok){
          const reason=response?.status===504||/timeout/i.test(String(json?.error||""))?"timeout":
            response?.status===401?"auth":response?.status===428?"consent":
            response?.status===403||json?.error==="database_permissions_missing"?"forbidden":
            response?.status===409?"conflict":"server";
          view={kind:"error",reason};return;
        }
        if(json?.ok!==true||json.read_only!==true||!date(json.checked_at)||
          json.profile_present!==false&&(!date(json.revision)||json?.squads?.schema!==SQUAD_COMPARE_SCHEMA))
          {view={kind:"error",reason:"unconfirmed"};return;}
        view={kind:"result",at:json.checked_at,rows:compareSquadProjections(local,json.squads,{available:json.profile_present===true})};
      }catch(error){
        if(mine!==generation)return;
        view=stamp!==stampOf(context())?{kind:"stale"}:
          {kind:"error",reason:/timeout|abort/i.test(String(error?.code||error?.name))?"timeout":"network"};
      }finally{
        if(mine===generation){busy=false;onChange();}
      }
    }
  };
}
