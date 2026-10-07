import {catalogHeroName} from "./heroes.js";
import {canonicalPowerMillions} from "./power-units.js";
import {reconcileConfirmedSquad,normalizeSquadSlots,squadForStableSlot} from "./squad-identity.js";
import {mergeFreshRecord} from "./field-freshness.js";

const FIELDS=["level","stars","power","exclusive","gear"];
const clone=value=>JSON.parse(JSON.stringify(value));
function existingEvidence(record){
  const out=clone(record);
  out.field_updated_at={...(out.field_updated_at||{})};
  out.field_source={...(out.field_source||{})};
  for(const field of FIELDS)if(out[field]!=null&&out[field]!==""){
    if(out.updated_at)out.field_updated_at[field]??=out.updated_at;
    out.field_source[field]??=out.source||"unknown";
  }
  return out;
}

// Only a complete, unambiguous identity set may replace a composition.
// Partial observations enrich an exact existing identity, never a positional guess.
export function applyReviewedSquad(input,{squadId,heroes=[],updatedAt,issues=[],powerConfirmed=false,evidence=[],evidenceAt=updatedAt}={}){
  if(!Number.isInteger(squadId)||squadId<1||squadId>4)throw new Error("invalid_squad_id");
  const out=clone(input);
  out.squads=Array.from({length:4},(_,i)=>normalizeSquadSlots(squadForStableSlot(input.squads,i+1)||{},i+1));
  const target=out.squads[squadId-1];
  if(!target)throw new Error("invalid_squad_id");
  const pending=[...issues],names=Array.from({length:5},(_,i)=>catalogHeroName(heroes[i]?.name));
  heroes=heroes.map(hero=>({
    name:hero?.name,
    ...Object.fromEntries(FIELDS.filter(field=>{
      const value=hero?.[field];
      return value!=null&&value!==""&&!(["level","stars","power"].includes(field)&&(!Number.isFinite(Number(value))||Number(value)<=0));
    }).map(field=>[field,hero[field]]))
  }));
  const duplicates=new Set(names.filter((name,i)=>name&&names.indexOf(name)!==i));
  const complete=names.every(Boolean)&&duplicates.size===0;
  let acceptedFields=complete?5:0;
  for(let i=0;i<5;i++){
    if(!names[i])pending.push({slot:i+1,field:"name",reason:heroes[i]?.name?"unknown":evidence[i]?.identity?.text?"uncertain":"missing",value:heroes[i]?.name||evidence[i]?.identity?.text||""});
    else if(duplicates.has(names[i]))pending.push({slot:i+1,field:"name",reason:"duplicate",value:names[i]});
    for(const field of ["level","stars","power"]){
      if(heroes[i]?.[field]==null||heroes[i]?.[field]===""||Number(heroes[i]?.[field])<=0){
        const powerReason=field==="power"?evidence[i]?.power?.method:null;
        pending.push({slot:i+1,field,reason:["low_confidence","conflicting_values","invalid_confidence","unreadable"].includes(powerReason)?powerReason:"missing"});
      }
    }
    if((!names[i]||duplicates.has(names[i]))&&heroes[i]?.power>0)pending.push({slot:i+1,field:"power",reason:"unlinked"});
  }
  let state=out;
  if(complete){
    const compositionChanged=names.some((name,index)=>name!==catalogHeroName(target.heroes?.[index]?.name));
    state=reconcileConfirmedSquad(out,{squadId,names,incomingHeroes:heroes,updatedAt}).state;
    if(compositionChanged&&!powerConfirmed){
      const squad=state.squads[squadId-1];
      squad.last_confirmed_power=reviewedSquadPower(target.power)??target.last_confirmed_power??null;
      squad.power=null;squad.power_sync_status="pending";
      pending.push({field:"power",reason:"composition_changed"});
    }
  }else{
    for(let i=0;i<5;i++){
      const name=names[i];
      if(!name||duplicates.has(name))continue;
      const matches=(target.heroes||[]).map((hero,index)=>({hero,index})).filter(({hero})=>catalogHeroName(hero.name)===name);
      if(matches.length!==1){
        pending.push({slot:i+1,field:"name",reason:"unlinked",value:name});
        continue;
      }
      const {hero,index}=matches[0],values={};
      for(const field of FIELDS){
        const value=heroes[i]?.[field];
        if(value==null||value===""||typeof value==="number"&&value<=0)continue;
        values[field]=value;
      }
      acceptedFields+=Object.keys(values).length;
      target.heroes[index]=mergeFreshRecord(existingEvidence(hero),{...values,updated_at:updatedAt,source:"confirmed_scan"},FIELDS);
      // Update the identity registry too, so reopening cannot restore an older profile.
      out.hero_profiles??=[];
      const profileIndex=out.hero_profiles.findIndex(profile=>catalogHeroName(profile.hero_name||profile.name)===name);
      const profile=profileIndex<0?{hero_name:name}:out.hero_profiles[profileIndex];
      const updated=mergeFreshRecord(existingEvidence(profile),{...values,updated_at:updatedAt,source:"confirmed_scan"},FIELDS);
      if(profileIndex<0)out.hero_profiles.push(updated);else out.hero_profiles[profileIndex]=updated;
    }
  }
  const squad=state.squads[squadId-1];
  if(evidence.length)squad.composition_conflict={...(squad.composition_conflict||{}),scan_evidence:{observed_at:evidenceAt,reviewed_at:updatedAt,heroes:clone(evidence.slice(0,5))}};
  if(pending.length){
    squad.needs_rescan=true;
    squad.composition_conflict={...(squad.composition_conflict||{}),scan_pending:pending};
  }else if(squad.composition_conflict?.scan_pending){
    delete squad.composition_conflict.scan_pending;
  }
  return {state,pending,complete,acceptedFields};
}

export function reviewedSquadPower(value){
  const number=canonicalPowerMillions(value);
  return number!==null&&number>0?number:null;
}

export function scanFieldDescription(path,lang="fr"){
  const fr=lang.startsWith("fr"),field=String(path?.at(-1)||"");
  const fields=fr?{name:"nom",level:"niveau",stars:"étoiles",power:"puissance",gear:"équipement",exclusive:"arme exclusive"}:{};
  const prefix=path?.[0]==="squads"
    ?`${fr?"Escouade":"Squad"} ${Number(path[1])+1}${path[2]==="heroes"?` · ${fr?"héros":"hero"} ${Number(path[3])+1}`:""} · `:"";
  return prefix+(fields[field]||field);
}

export function squadPendingDescription(item,lang="fr"){
  const fr=lang.startsWith("fr");
  const reasons=fr?{missing:"manquant",unknown:"non reconnu",duplicate:"en double",unlinked:"identité non associée",uncertain:"identité incertaine",low_confidence:"confiance OCR insuffisante",conflicting_values:"valeurs OCR contradictoires",invalid_confidence:"confiance OCR invalide",unreadable:"texte illisible",invalid_number:"nombre invalide",negative_number:"valeur négative",invalid_gear:"équipement invalide",composition_changed:"composition modifiée, ancien total conservé dans l’historique"}:
    {missing:"missing",unknown:"unrecognized",duplicate:"duplicate",unlinked:"unlinked identity",uncertain:"uncertain identity",low_confidence:"insufficient OCR confidence",conflicting_values:"conflicting OCR values",invalid_confidence:"invalid OCR confidence",unreadable:"unreadable text",invalid_number:"invalid number",negative_number:"negative value",invalid_gear:"invalid gear",composition_changed:"composition changed; previous total retained in history"};
  return `${item.slot?`${fr?"Héros":"Hero"} ${item.slot}`:fr?"Escouade":"Squad"} · ${scanFieldDescription([item.field],lang)} : ${reasons[item.reason]||item.reason}${item.value?` (${item.value})`:""}`;
}
