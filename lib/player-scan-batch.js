import {mergeFreshRecord} from "./field-freshness.js";
import {canonicalHeroName} from "./heroes.js";
import {mergeScanEvidence} from "./squad-scan-evidence.js";
import {attachSquadWeaponProofs,squadCaptureSummary,squadWeaponReviewRecord} from "./squad-capture.js";

export const PLAYER_SCAN_BATCH_LIMIT=3;
export const FORMATION_SCAN_BATCH_LIMIT=6;
export function playerScanBatchLimit(type){return /^squad[1-4]$/.test(String(type))?FORMATION_SCAN_BATCH_LIMIT:PLAYER_SCAN_BATCH_LIMIT}
const key=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");
const clone=value=>JSON.parse(JSON.stringify(value));
function identity(row){
  if(row?.hero_name)return `hero:${key(canonicalHeroName(row.hero_name)||row.hero_name)}`;
  if(row?.item_name)return `item:${key(row.store||"")}:${key(row.item_name)}`;
  if(row?.name)return `name:${key(canonicalHeroName(row.name)||row.name)}`;
  return null;
}
function readable(value,field,record){
  if(value===null||value===undefined||value==="")return false;
  if(["power","power_m"].includes(field)&&Number(value)===0)return false;
  return !record?.field_confidence||record.field_confidence[field]===undefined||Number(record.field_confidence[field])>=0.9;
}
function fuse(a,b,conflicts,path=""){
  if(Array.isArray(b)){
    const out=Array.isArray(a)?clone(a):[];
    for(let i=0;i<b.length;i++){
      const row=b[i];if(row==null)continue;
      // Formation slots are positional even when names repeat. Collapsing a
      // duplicate here would hide ambiguity and allow an unsafe weapon link.
      const id=path.endsWith(".squads")||path.endsWith(".heroes")?null:identity(row),at=id?out.findIndex(x=>identity(x)===id):i;
      if(at<0){out.push(fuse(undefined,row,conflicts,`${path}.${id}`));continue}
      if(out[at]===undefined)out[at]=fuse(undefined,row,conflicts,`${path}.${i}`);
      else out[at]=fuse(out[at],row,conflicts,`${path}.${id||i}`);
    }
    return out;
  }
  if(b&&typeof b==="object"){
    const out=a&&typeof a==="object"&&!Array.isArray(a)?clone(a):{};
    const fields=[];
    for(const [field,value] of Object.entries(b)){
      if(["source","updated_at","field_source","field_updated_at","field_confidence"].includes(field))continue;
      if(field==="scan_evidence"){out[field]=mergeScanEvidence(out[field],value);continue}
      if(!readable(value,field,b))continue;
      if(value&&typeof value==="object"){out[field]=fuse(out[field],value,conflicts,`${path}.${field}`);continue}
      if(!/source|_at$|status|confidence|evidence|confirm/.test(field)&&out[field]!==undefined&&out[field]!==value)conflicts.add(`${path}.${field}`);
      fields.push(field);
    }
    const incoming=Object.fromEntries(fields.map(field=>[field,b[field]]));
    for(const field of ["source","updated_at","field_source","field_updated_at"])if(b[field]!==undefined)incoming[field]=b[field];
    return mergeFreshRecord(out,incoming,fields,{baseSource:"vision_scan",incomingSource:"vision_scan"});
  }
  return b??a;
}
export function mergePlayerScanBatch(type,results){
  if(!Array.isArray(results)||!results.length||results.length>playerScanBatchLimit(type))throw new Error("invalid_scan_batch");
  const conflicts=new Set();let state={};
  const squad=String(type).match(/^squad([1-4])$/),index=squad?Number(squad[1])-1:null;
  const captures=squad?results.map((result,index)=>({index,type:result.capture_type||
    (result.state?.squads?"formation_details":"unknown")})):[];
  const proofs=squad?results.filter(result=>result.capture_type==="exclusive_weapon_detail").flatMap(result=>result.state?.exclusive_weapons||[]):[];
  const ordered=squad?[...results].sort((a,b)=>(a.capture_type==="formation_overview"?1:0)-(b.capture_type==="formation_overview"?1:0)):results;
  for(const result of ordered){
    if(squad&&result.capture_type==="exclusive_weapon_detail")continue;
    if(squad&&result.capture_type==="unknown")continue;
    const data=clone(result.state||{});
    if(squad)delete data.exclusive_weapons;
    if(squad){
      const heroes=data.squads?.[index]?.heroes||[],old=state.squads?.[index]?.heroes||[];
      const names=new Set([...old,...heroes].map(identity).filter(Boolean));
      if(names.size>5)throw Object.assign(new Error("Choisis des captures de la même escouade."),{code:"batch_squad_identity_conflict"});
      // The first capture establishes slots. Other captures enrich by hero identity,
      // never by the position a hero happens to occupy on another screenshot.
      if(old.length&&data.squads?.[index]){
        const aligned=clone(old);
        for(const hero of heroes){const id=identity(hero);if(!id)continue;const slot=aligned.findIndex(x=>identity(x)===id);
          if(slot>=0)aligned[slot]=fuse(aligned[slot],hero,conflicts,`hero.${id}`);
          // No unique correspondence with a primary formation slot: abstain.
          // A named secondary capture must not populate an unidentified slot.
          else conflicts.add(`hero.${id}.unlinked_formation_slot`);
        }
        data.squads[index].heroes=aligned;
      }
    }
    state=fuse(state,data,conflicts);
  }
  const weapons=squad?attachSquadWeaponProofs(state.squads?.[index],proofs):null;
  if(weapons)for(const conflict of weapons.conflicts)conflicts.add(conflict);
  if(weapons?.linked.length)state.exclusive_weapons=weapons.linked.map(squadWeaponReviewRecord);
  return {state,conflicts:[...conflicts],capture_count:results.length,
    ...(squad?{captures,complementary_evidence:weapons,capture_summary:squadCaptureSummary(captures,weapons)}:{}),
    scanned_at:results.map(x=>x.scanned_at).filter(Boolean).sort().at(-1)||null};
}

export async function analyzePlayerCaptureBatch({type,images,request,isCurrent=()=>true,onProgress=()=>{}}){
  if(!images.length||images.length>playerScanBatchLimit(type))throw new Error(`Choisis de 1 à ${playerScanBatchLimit(type)} captures.`);
  const unique=[...new Set(images)],results=[];
  if(/^squad[1-4]$/.test(type)){
    if(!isCurrent())return null;
    onProgress(1,1);
    const {response,json}=await request({image_data_urls:unique});
    if(!isCurrent())return null;
    if(!response.ok||!json?.state)throw Object.assign(new Error(json?.message||json?.error||"Analyse du lot impossible. Réessaie sans confirmer."),{code:json?.code||json?.error});
    if(json.batch_analysis!==true||json.capture_count!==unique.length)
      throw Object.assign(new Error("La réponse ne correspond pas au lot complet. Réessaie sans confirmer."),{code:"INVALID_FORMATION_BATCH"});
    if(!json.state.squads?.[Number(type.slice(-1))-1])
      throw Object.assign(new Error(`${json.capture_summary||""} Ajoute une capture « Détails de la formation ». Aucun écran d’arme ne prouve la composition.`),{code:"WRONG_SQUAD_CAPTURE"});
    return json;
  }
  // Technology already has a protected, bounded provider-side three-image contract.
  const batches=type==="technology"?[unique]:unique.map(image=>[image]);
  for(let i=0;i<batches.length;i++){
    if(!isCurrent())return null;
    onProgress(i+1,batches.length);
    const payload=type==="technology"?{image_data_urls:batches[i]}:{image_data_url:batches[i][0]};
    const {response,json}=await request(payload);
    if(!isCurrent())return null;
    if(!response.ok||!json?.state)throw Object.assign(new Error(json?.message||json?.error||"Analyse impossible. Réessaie sans confirmer."),{code:json?.code||json?.error});
    results.push(json);
  }
  const merged={...mergePlayerScanBatch(type,results),capture_count:unique.length};
  if(/^squad[1-4]$/.test(type)&&!merged.state.squads?.[Number(type.slice(-1))-1])
    throw Object.assign(new Error(`${merged.capture_summary} Ajoute une capture « Détails de la formation » pour relier les héros. Aucun écran d’arme ne prouve la composition.`),{code:"WRONG_SQUAD_CAPTURE"});
  return merged;
}