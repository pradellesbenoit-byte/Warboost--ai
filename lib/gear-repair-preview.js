// Owner-only, ephemeral repair planning. Deliberately has NO write capability.
import {projectSquads,SQUAD_COMPARE_SCHEMA} from "./squad-comparison-project.js";

const clone=value=>JSON.parse(JSON.stringify(value));
const date=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
const pieces=entry=>entry?.kind==="value"&&entry.layout==="slotted"?
  entry.value.segments.map(piece=>({slot:piece.slot,level:piece.level??null,rarity:piece.rarity??null})):[];
const full=entry=>entry?.kind==="value"&&entry.layout==="slotted"&&!entry.incomplete&&
  entry.value.segments.length===4&&[0,1,2,3].every(slot=>{
    const hits=entry.value.segments.filter(piece=>piece.slot===slot);
    return hits.length===1&&Number.isInteger(hits[0].level)&&hits[0].level>=0&&hits[0].level<=100&&
      ["red","orange","gold","purple","blue","green"].includes(hits[0].rarity);
  });

export function equipmentRepairCandidates(local,cloud){
  if(local?.schema!==SQUAD_COMPARE_SCHEMA||cloud?.schema!==SQUAD_COMPARE_SCHEMA||
    !Array.isArray(local.rows)||!Array.isArray(cloud.rows))return [];
  const candidates=[];
  for(let squad=1;squad<=4;squad++){
    const ls=local.rows.filter(row=>row.id===squad),cs=cloud.rows.filter(row=>row.id===squad);
    if(ls.length!==1||cs.length!==1)continue;
    const l=ls[0],c=cs[0];
    for(let index=0;index<5;index++){
      const gear=c.categories?.gear?.[index];
      if(gear?.diagnostic?.format!=="text_partial"||!gear.incomplete)continue;
      const input=l.categories?.gear?.[index],li=l.categories?.composition?.[index],ci=c.categories?.composition?.[index];
      const identity=li?.kind==="value"&&ci?.kind==="value"&&li.value===ci.value&&li.confirmed===true&&ci.confirmed===true;
      let reason="ready";
      if(l.ambiguous||c.ambiguous)reason="structure_ambiguous";
      else if(!identity)reason="identity_unverified";
      else if(!full(input))reason="local_incomplete";
      else{
        // Never silently replace even one readable cloud attribute that differs.
        const mismatch=pieces(gear).some(piece=>{
          const next=pieces(input).find(candidate=>candidate.slot===piece.slot);
          return !next||["level","rarity"].some(key=>piece[key]!==null&&piece[key]!==next[key]);
        });
        if(mismatch)reason="readable_difference";
      }
      candidates.push({id:`${squad}:${index+1}`,squad,slot:index+1,eligible:reason==="ready",reason,
        localConfirmed:input?.confirmed===true,cloudPieces:pieces(gear),localPieces:pieces(input),
        localKind:input?.kind||"missing",localFormat:input?.diagnostic?.format||"absent",
        selected:false,verified:false});
    }
  }
  return candidates;
}

export function createGearRepairPreview({context,request,requestReadiness,onChange=()=>{}}){
  let generation=0,stamp=null,busy=false,state={kind:"idle"};
  const allowed=ctx=>Boolean(ctx.allowed&&ctx.session&&ctx.owner&&String(ctx.local?.player_id||"")===String(ctx.owner));
  // Private fingerprints are neither returned, persisted, logged nor sent.
  const stampOf=ctx=>JSON.stringify([ctx.owner,ctx.session,ctx.revision,ctx.local]);
  function current(){
    const ctx=context();
    if(stamp!==null&&(!allowed(ctx)||stamp!==stampOf(ctx))){
      generation++;stamp=null;busy=false;state={kind:"stale"};
    }
    return state;
  }
  const notify=()=>onChange();
  return {
    view:()=>clone(current()),
    close(){generation++;stamp=null;busy=false;state={kind:"idle"};notify();},
    async prepare(){
      const ctx=context();
      if(!allowed(ctx)){state={kind:"error",reason:"auth"};notify();return;}
      if(busy&&stamp===stampOf(ctx))return;
      const mine=++generation;
      stamp=stampOf(ctx);busy=true;state={kind:"busy"};notify();
      const local=projectSquads(clone(ctx.local?.squads??null));
      try{
        // Optional public contract check is GET-only and cannot enable this UI's
        // write button. No automatic preflight/apply or SQL activation.
        let readiness={backend_prepared:true,release_approved:false,migration:"not_checked",writes_enabled:false};
        if(requestReadiness){
          const status=await requestReadiness();
          if(mine!==generation)return;
          if(!allowed(context())||stamp!==stampOf(context())){state={kind:"stale"};stamp=null;return;}
          if(status?.response?.ok&&status?.json?.read_only===true){
            readiness={backend_prepared:status.json.backend_prepared===true,
              release_approved:status.json.release_approved===true,
              migration:status.json.migration==="verified"?"verified":"not_checked",
              writes_enabled:false};
          }
        }
        const {response,json}=await request();
        if(mine!==generation)return;
        if(!allowed(context())||stamp!==stampOf(context())){state={kind:"stale"};stamp=null;return;}
        if(!response?.ok){
          const status=response?.status;
          state={kind:"error",reason:status===401?"auth":status===403?"forbidden":status===428?"consent":
            status===409?"conflict":status===504?"timeout":"server"};return;
        }
        if(json?.ok!==true||json.read_only!==true||json.profile_present!==true||
          !date(json.checked_at)||!date(json.revision)||json.squads?.schema!==SQUAD_COMPARE_SCHEMA){
          state={kind:"error",reason:"unconfirmed"};return;
        }
        state={kind:"result",stage:"selection",at:json.checked_at,readiness,
          candidates:equipmentRepairCandidates(local,json.squads)};
      }catch(error){
        if(mine!==generation)return;
        if(!allowed(context())||stamp!==stampOf(context())){state={kind:"stale"};stamp=null;}
        else state={kind:"error",reason:/abort|timeout/i.test(String(error?.name||error?.code))?"timeout":"network"};
      }finally{
        if(mine===generation){busy=false;notify();}
      }
    },
    select(id,selected){
      if(current().kind!=="result"||state.stage!=="selection")return false;
      const item=state.candidates.find(candidate=>candidate.id===id&&candidate.eligible);
      if(!item)return false;
      item.selected=selected===true;
      // Re-selection must never reuse a previous user attestation.
      item.verified=false;notify();return true;
    },
    verify(id,verified){
      if(current().kind!=="result"||state.stage!=="selection")return false;
      const item=state.candidates.find(candidate=>candidate.id===id&&candidate.eligible&&candidate.selected);
      if(!item)return false;
      item.verified=verified===true;notify();return true;
    },
    review(){
      if(current().kind!=="result"||state.stage!=="selection")return false;
      const selected=state.candidates.filter(candidate=>candidate.selected);
      if(!selected.length||selected.some(candidate=>!candidate.eligible||!candidate.verified))return false;
      state.stage="preview";notify();return true;
    },
    back(){
      if(current().kind!=="result")return;
      state.stage="selection";notify();
    }
    // No save(), token export, patch submission, storage or cloud revision setter.
  };
}
