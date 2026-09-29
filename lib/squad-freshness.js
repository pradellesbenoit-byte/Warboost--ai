import {confirmedCompositionForSquad} from "./squad-identity.js";

function time(value){
  const parsed=Date.parse(String(value||""));
  return Number.isFinite(parsed)?parsed:0;
}

function facts(squad){
  return Boolean(squad&&(squad.composition_source==="explicit_swap_empty"&&time(squad.composition_changed_at)>0||
    confirmedCompositionForSquad(squad)||
    squad.heroes?.some(hero=>hero?.name)||
    squad.power!==null&&squad.power!==undefined&&squad.power!==""));
}

function comparable(squad){
  return JSON.stringify({
    power:squad?.power??null,
    confirmed_composition:confirmedCompositionForSquad(squad)||null,
    heroes:Array.from({length:5},(_,i)=>{
      const hero=squad?.heroes?.[i]||{};
      return ["name","level","stars","power","exclusive","gear"].map(key=>hero[key]??null);
    })
  });
}

function freshness(squad){
  return {
    confirmed:squad?.composition_source==="explicit_swap_empty"?time(squad?.composition_changed_at):time(squad?.composition_confirmed_at),
    updated:time(squad?.updated_at)
  };
}

function mergeLaterObservations(primary,secondary){
  if(time(secondary?.updated_at)<=time(primary?.updated_at))return {squad:structuredClone(primary),changed:false};
  if(primary?.composition_source==="explicit_swap_empty"||secondary?.composition_source==="explicit_swap_empty")return {squad:structuredClone(primary),changed:false};
  const out=structuredClone(primary);
  let changed=false;
  const sameComposition=JSON.stringify(confirmedCompositionForSquad(primary))===JSON.stringify(confirmedCompositionForSquad(secondary));
  for(let i=0;i<5;i++){
    const current=out.heroes?.[i],observed=secondary?.heroes?.[i];
    if(!current?.name||!observed?.name||current.name.toLowerCase()!==observed.name.toLowerCase())continue;
    for(const field of ["level","stars","power","exclusive","gear","awakening"]){
      if(observed[field]!==null&&observed[field]!==undefined&&observed[field]!==""&&JSON.stringify(current[field])!==JSON.stringify(observed[field])){
        current[field]=structuredClone(observed[field]);changed=true;
      }
    }
  }
  if(secondary.power!==null&&secondary.power!==undefined&&secondary.power!==""&&String(secondary.power)!==String(primary.power??"")){
    out.power=secondary.power;
    out.power_sync_status=sameComposition?(secondary.power_sync_status||out.power_sync_status):"pending";
    if(!sameComposition){
      out.last_confirmed_power=primary.last_confirmed_power??primary.power??null;
      out.needs_rescan=true;
    }
    changed=true;
  }
  if(changed)out.updated_at=secondary.updated_at;
  return {squad:out,changed};
}

// Resolve only the four stable squad slots. Profile-wide timestamps can change
// for unrelated fields and are not evidence that a squad was reconfirmed.
export function reconcileCloudSquads(local,remote,merged){
  const owner=String(local?.player_id||""),remoteOwner=String(remote?.player_id||"");
  if(!owner||owner!==remoteOwner||String(merged?.player_id||"")!==owner)throw new Error("squad_owner_mismatch");
  const squads=Array.from({length:4},(_,index)=>merged.squads?.[index]);
  const localNewer=[],conflicts=[];
  for(let index=0;index<4;index++){
    const a=local.squads?.[index],b=remote.squads?.[index];
    const localFacts=facts(a),remoteFacts=facts(b);
    if(!localFacts&&!remoteFacts)continue;
    if(localFacts&&!remoteFacts){squads[index]=structuredClone(a);localNewer.push(index+1);continue}
    if(!localFacts&&remoteFacts){squads[index]=structuredClone(b);continue}
    const left=freshness(a),right=freshness(b);
    let winner=0;
    if(left.confirmed&&right.confirmed){
      winner=Math.sign(left.confirmed-right.confirmed);
      if(!winner)winner=Math.sign(left.updated-right.updated);
    }else if(left.confirmed||right.confirmed){
      winner=left.confirmed?1:-1;
    }else{
      winner=Math.sign(left.updated-right.updated);
    }
    if(winner>0){
      squads[index]=mergeLaterObservations(a,b).squad;
      localNewer.push(index+1);
    }else if(winner<0){
      const observed=mergeLaterObservations(b,a);
      squads[index]=observed.squad;
      if(observed.changed)localNewer.push(index+1);
    }
    else if(comparable(a)!==comparable(b)){
      // Equal/missing evidence is not permission to replace either confirmed
      // composition silently. Keep the device copy and request verification.
      squads[index]={...structuredClone(a),needs_rescan:true,composition_conflict:{
        ...(a?.composition_conflict||{}),status:"needs_verification",reason:"squad_freshness_ambiguous"
      }};
      conflicts.push(index+1);
    }
  }
  return {state:{...merged,squads},localNewer,conflicts};
}