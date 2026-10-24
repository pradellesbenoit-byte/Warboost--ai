// Data provenance, NEVER authentication or a new scan confirmation.
const copy=value=>JSON.parse(JSON.stringify(value));
const fields=["name","level","stars","power","exclusive","gear"];
const reviewedSources=new Set(["manual","confirmed_manual","confirmed_scan","owner_confirmed_scan","explicit_confirmation"]);
const emptyHero=()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null});

export function isLegacySavedSquad(squad){
  const record=squad?.legacy_v1;
  return record?.version===1&&record.source_version==="1.3.3"&&
    typeof record.owner_id==="string"&&Boolean(record.owner_id)&&
    Number(record.squad_id)===Number(squad.id)&&
    Array.isArray(record.heroes)&&record.heroes.length===5&&
    record.heroes.every(hero=>hero&&typeof hero==="object"&&typeof hero.name==="string");
}

export function legacySavedHeroes(squad){
  if(!isLegacySavedSquad(squad))return null;
  const retired=squad.legacy_v1.retired_slots||[];
  return squad.legacy_v1.heroes.map((saved,index)=>{
    if(retired.includes(index))return emptyHero();
    const current=squad.heroes?.[index]||{},out={...emptyHero(),...copy(saved)};
    // V1 generated these strings for absent names; they were never identities.
    if(/^(?:hero|héros)\s*\d+$/i.test(out.name))out.name="";
    // Keep identity bound to its original slot. Only separately reviewed fields
    // may evolve without a new five-name composition confirmation.
    if(current.name===saved.name){
      for(const field of fields.filter(key=>key!=="name")){
        if(reviewedSources.has(current.field_source?.[field])&&
          Date.parse(current.field_updated_at?.[field]||"")>(Date.parse(squad.legacy_v1.saved_at||"")||0))
          out[field]=current[field]??null;
      }
      out.field_source=copy(current.field_source||{});
      out.field_updated_at=copy(current.field_updated_at||{});
      if(current.updated_at)out.updated_at=current.updated_at;
    }
    return out;
  });
}

export function prepareLegacyV1State(input={}){
  const owner=input.player_id;
  if(input.legacy_v1_backup&&(input.legacy_v1_backup.owner_id!==owner||
    input.legacy_v1_backup.document?.player_id!==owner||
    input.legacy_v1_backup.document?.version!=="1.3.3"))
    throw new Error("legacy_owner_mismatch");
  for(const squad of input.squads||[])
    if(squad?.legacy_v1&&(!isLegacySavedSquad(squad)||squad.legacy_v1.owner_id!==owner))
      throw new Error("legacy_squad_owner_or_slot_mismatch");
  if(input.version!=="1.3.3")return input;
  if(typeof owner!=="string"||!owner)throw new Error("legacy_owner_required");
  if(!Array.isArray(input.squads)||input.squads.length!==4||
    input.squads.some((squad,index)=>Number(squad?.id)!==index+1||
      !Array.isArray(squad.heroes)||squad.heroes.length!==5))
    throw new Error("legacy_squad_shape_mismatch");
  const out=copy(input);
  out.legacy_v1_backup=out.legacy_v1_backup||{
    version:1,owner_id:owner,document:copy(input)
  };
  out.squads=out.squads.map(squad=>({...squad,
    legacy_v1:squad.legacy_v1||{
      version:1,source_version:"1.3.3",owner_id:owner,squad_id:squad.id,
      saved_at:squad.updated_at||input.updated_at||null,
      heroes:copy(squad.heroes),retired_slots:[]
    }
  }));
  return out;
}

export function restoreLegacyV1State(input,owner){
  const backup=input?.legacy_v1_backup;
  if(backup?.version!==1||backup.owner_id!==owner||input.player_id!==owner||
    backup.document?.player_id!==owner||backup.document?.version!=="1.3.3")
    throw new Error("legacy_restore_owner_or_version_mismatch");
  return copy(backup.document);
}
