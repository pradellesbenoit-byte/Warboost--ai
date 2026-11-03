import {canonicalHeroName,isGenericHeroName} from "./heroes.js";
import {canonicalPowerMillions} from "./power-units.js";

export const SQUAD_CLOUD_CHECK_SCHEMA=1;
const own=(object,key)=>Boolean(object&&Object.prototype.hasOwnProperty.call(object,key));
const date=value=>typeof value==="string"&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const text=value=>typeof value==="string"&&value.trim()&&value.length<=120?value.trim():null;
const stable=value=>JSON.stringify(value&&typeof value==="object"?
  Array.isArray(value)?value.map(item=>JSON.parse(stable(item))):
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(stable(value[key]))])):value);
const canonicalName=value=>{
  const raw=text(value);
  return raw&&!isGenericHeroName(raw)?canonicalHeroName(raw):null;
};
function validProjectedRecord(record){
  return Boolean(record&&record.schema===SQUAD_CLOUD_CHECK_SCHEMA&&
    typeof record.profilePresent==="boolean"&&
    record.composition&&typeof record.composition.readable==="boolean"&&
    Array.isArray(record.composition.slots)&&record.composition.slots.length===5&&
    record.composition.slots.every(slot=>typeof slot?.readable==="boolean")&&
    record.power&&typeof record.power.readable==="boolean"&&
    record.confirmation&&typeof record.confirmation.readable==="boolean"&&
    record.weapons&&typeof record.weapons.readable==="boolean"&&
    Array.isArray(record.weapons.slots)&&record.weapons.slots.length===5&&
    record.weapons.slots.every(slot=>typeof slot?.readable==="boolean")&&
    record.marker&&typeof record.marker.readable==="boolean");
}

function locateSquad1(squads){
  if(!Array.isArray(squads))return {readable:false,squad:null};
  const identified=squads.filter(item=>item&&item.id!=null);
  if(identified.length){
    if(identified.some(item=>!Number.isInteger(Number(item.id))||Number(item.id)<1||Number(item.id)>4))
      return {readable:false,squad:null};
    const matches=identified.filter(item=>Number(item.id)===1);
    return matches.length===1?{readable:true,squad:matches[0]}:
      matches.length>1?{readable:false,squad:null}:{readable:true,squad:null};
  }
  if(squads.length>4)return {readable:false,squad:null};
  return {readable:true,squad:squads[0]||null};
}

function markerEvidence(squad){
  if(!squad||!own(squad,"composition_conflict"))return {readable:false,value:null};
  const conflict=squad.composition_conflict;
  if(conflict==null)return {readable:true,value:{active:false,reason:null}};
  if(typeof conflict!=="object"||Array.isArray(conflict))return {readable:false,value:null};
  const allowedKeys=new Set(["identity_history","status","reason","detected_at","needs_rescan","heroes","scan_pending"]);
  const keys=Object.keys(conflict);
  if(!keys.length||keys.some(key=>!allowedKeys.has(key))||
    own(conflict,"identity_history")&&!Array.isArray(conflict.identity_history)||
    own(conflict,"scan_pending")&&!Array.isArray(conflict.scan_pending)||
    own(conflict,"status")&&conflict.status!=null&&typeof conflict.status!=="string"||
    own(conflict,"reason")&&conflict.reason!=null&&typeof conflict.reason!=="string"||
    own(conflict,"needs_rescan")&&typeof conflict.needs_rescan!=="boolean"||
    own(conflict,"detected_at")&&conflict.detected_at!=null&&!date(conflict.detected_at))
    return {readable:false,value:null};
  if(keys.every(key=>key==="identity_history"))return {readable:true,value:{active:false,reason:null}};
  const reason=text(conflict.reason);
  const active=Boolean(reason||conflict.status||conflict.needs_rescan||
    conflict.detected_at||conflict.heroes||conflict.scan_pending?.length);
  return {readable:true,value:{active,reason:active?
    reason==="squad_freshness_ambiguous"?"squad_freshness_ambiguous":"other":null}};
}

function weaponEvidence(weapons,readable,heroName){
  if(!readable)return {readable:false,value:null};
  if(!heroName)return {readable:true,value:null};
  const matches=weapons.filter(item=>canonicalName(item?.hero_name)===heroName);
  if(matches.length>1)return {readable:false,value:null};
  if(!matches.length)return {readable:true,value:null};
  const weapon=matches[0],weaponName=text(weapon?.weapon_name);
  let level=null;
  if(weapon?.level!==null&&weapon?.level!==undefined&&weapon?.level!==""){
    level=Number(weapon.level);
    if(!Number.isFinite(level)||level<0)return {readable:false,value:null};
  }
  return {readable:true,value:{hero:canonicalName(weapon.hero_name),name:weaponName,level}};
}

// Safe projection used on both sides of the comparison. It never returns the
// whole profile, raw conflict history, account ID, or unrelated player fields.
export function projectSquadCloudCheckRecord(profile,{profilePresent=true,revision=null}={}){
  const record=profile&&typeof profile==="object"&&!Array.isArray(profile)?profile:{};
  const located=locateSquad1(record.squads);
  const squad=located.squad&&typeof located.squad==="object"&&!Array.isArray(located.squad)?located.squad:null;
  const heroesReadable=Boolean(squad&&Array.isArray(squad.heroes)&&squad.heroes.length<=5);
  const heroes=heroesReadable?squad.heroes:[];
  const slots=Array.from({length:5},(_,index)=>{
    const hero=heroes[index];
    const raw=hero&&own(hero,"name")?canonicalName(hero.name):null;
    return {readable:heroesReadable,value:raw};
  });
  const weaponsReadable=own(record,"exclusive_weapons")&&Array.isArray(record.exclusive_weapons);
  const weapons=Array.from({length:5},(_,index)=>weaponEvidence(
    weaponsReadable?record.exclusive_weapons:[],weaponsReadable,slots[index].value));
  const powerValues=squad?["power","power_m"].filter(key=>own(squad,key)&&squad[key]!==null&&squad[key]!=="")
    .map(key=>typeof squad[key]==="boolean"?null:canonicalPowerMillions(squad[key])):[];
  const powerInvalid=powerValues.some(value=>value===null);
  const powerDisagrees=powerValues.length>1&&powerValues.some(value=>value!==powerValues[0]);
  const power=powerValues[0]??null;
  const confirmationReadable=Boolean(squad&&
    (own(squad,"composition_source")||own(squad,"composition_confirmed_at")||own(squad,"confirmed_composition")));
  const confirmedNames=Array.isArray(squad?.confirmed_composition)&&squad.confirmed_composition.length===5?
    squad.confirmed_composition.map(canonicalName):null;
  const source=text(squad?.composition_source);
  const confirmedAt=date(squad?.composition_confirmed_at);
  const confirmationValue=confirmedNames&&confirmedNames.every(Boolean)&&source&&confirmedAt?
    {source,at:confirmedAt,names:confirmedNames}:null;
  const marker=markerEvidence(squad);
  return {
    schema:SQUAD_CLOUD_CHECK_SCHEMA,
    profilePresent:Boolean(profilePresent),
    revision:date(revision),
    squadPresent:Boolean(squad),
    squadUpdatedAt:date(squad?.updated_at),
    composition:{readable:located.readable&&heroesReadable,slots},
    power:{readable:Boolean(squad)&&!powerInvalid&&!powerDisagrees,value:power},
    confirmation:{readable:confirmationReadable,value:confirmationValue},
    weapons:{readable:weaponsReadable,slots:weapons},
    marker
  };
}

function field(key,localEvidence,cloudEvidence,localValue,cloudValue){
  const readable=localEvidence?.readable===true&&cloudEvidence?.readable===true;
  const state=!readable?"not_verifiable":localValue==null||cloudValue==null?"missing":
    stable(localValue)===stable(cloudValue)?"identical":"different";
  return {key,state,local:localValue??null,cloud:cloudValue??null};
}

export function compareSquadCloudCheck(local,cloud){
  const profileState=cloud?.profilePresent===true?"identical":cloud?.profilePresent===false?"missing":"not_verifiable";
  const fields=[{key:"profile",state:profileState,local:true,
    cloud:typeof cloud?.profilePresent==="boolean"?cloud.profilePresent:null}];
  for(let index=0;index<5;index++){
    fields.push({...field("hero",local?.composition?.slots?.[index],cloud?.composition?.slots?.[index],
      local?.composition?.slots?.[index]?.value,cloud?.composition?.slots?.[index]?.value),slot:index+1});
  }
  fields.push(field("power",local?.power,cloud?.power,local?.power?.value,cloud?.power?.value));
  fields.push(field("confirmation",local?.confirmation,cloud?.confirmation,
    local?.confirmation?.value,cloud?.confirmation?.value));
  for(let index=0;index<5;index++){
    fields.push({...field("weapon",local?.weapons?.slots?.[index],cloud?.weapons?.slots?.[index],
      local?.weapons?.slots?.[index]?.value,cloud?.weapons?.slots?.[index]?.value),slot:index+1});
  }
  fields.push(field("marker",local?.marker,cloud?.marker,local?.marker?.value,cloud?.marker?.value));
  const requiredFields=fields.filter(item=>item.key!=="weapon");
  const requiredMatch=requiredFields.every(item=>item.state==="identical");
  const markerClear=local?.marker?.readable===true&&cloud?.marker?.readable===true&&
    local?.marker?.value?.active===false&&cloud?.marker?.value?.active===false;
  const weaponsReadable=local?.weapons?.readable===true&&cloud?.weapons?.readable===true;
  const optionalMissingWeaponSlots=[];
  let weaponsMatch=true;
  for(let index=0;index<5;index++){
    const weapon=fields.find(item=>item.key==="weapon"&&item.slot===index+1);
    if(weapon?.state==="identical")continue;
    const localWeapon=local?.weapons?.slots?.[index],cloudWeapon=cloud?.weapons?.slots?.[index];
    const hero=fields.find(item=>item.key==="hero"&&item.slot===index+1);
    const missingOnBoth=weapon?.state==="missing"&&
      localWeapon?.readable===true&&cloudWeapon?.readable===true&&
      localWeapon.value==null&&cloudWeapon.value==null&&
      hero?.state==="identical"&&hero.local!=null;
    if(missingOnBoth)optionalMissingWeaponSlots.push(index+1);
    else weaponsMatch=false;
  }
  const comparableBase=cloud?.profilePresent===true&&Boolean(cloud?.revision)&&
    requiredMatch&&markerClear&&weaponsReadable;
  const identical=comparableBase&&weaponsMatch&&optionalMissingWeaponSlots.length===0;
  const optionalWeaponsMissing=comparableBase&&weaponsMatch&&optionalMissingWeaponSlots.length>0;
  const summary=cloud?.profilePresent===false?"missing":
    identical?"identical":optionalWeaponsMissing?"optional_missing":"review";
  return {schema:SQUAD_CLOUD_CHECK_SCHEMA,summary,fields,
    optionalMissingWeaponSlots,
    optionalMissingWeaponCount:optionalMissingWeaponSlots.length,
    cloudRevision:cloud?.revision||null,cloudSquadUpdatedAt:cloud?.squadUpdatedAt||null,
    markerReadable:cloud?.marker?.readable===true};
}

export function createSquadCloudCheck({context,request,onChange=()=>{}}){
  let generation=0,busy=false,stamp=null,view={kind:"idle"};
  const authorized=ctx=>Boolean(ctx?.allowed&&ctx?.session&&ctx?.owner&&
    String(ctx.local?.player_id||"")===String(ctx.owner));
  const projection=ctx=>projectSquadCloudCheckRecord(ctx.local);
  const stampOf=ctx=>JSON.stringify([ctx.session,ctx.owner,projection(ctx)]);
  function current(){
    const ctx=context();
    if(!authorized(ctx))return stamp===null?view:{kind:"stale"};
    if(stamp!==null&&stamp!==stampOf(ctx))return {kind:"stale"};
    return view;
  }
  return {
    view:current,
    async run(){
      const initial=context();
      if(!authorized(initial)){view={kind:"error",reason:initial?.blockedReason||"auth"};onChange();return}
      const initialStamp=stampOf(initial),mine=++generation;
      if(busy&&stamp===initialStamp)return;
      stamp=initialStamp;busy=true;view={kind:"busy"};onChange();
      try{
        const reply=await request();
        if(mine!==generation)return;
        const latest=context();
        if(!authorized(latest)||stamp!==stampOf(latest)){view={kind:"stale"};return}
        const {response,json}=reply||{};
        if(!response?.ok){
          view={kind:"error",reason:response?.status===401?"auth":response?.status===428?"consent":
            response?.status===403?"forbidden":response?.status===504?"timeout":
              response?.status===409?"conflict":"server"};
          return;
        }
        if(json?.ok!==true||json?.read_only!==true||json?.schema!==SQUAD_CLOUD_CHECK_SCHEMA||
          !date(json?.checked_at)||typeof json?.profile_present!=="boolean"||
          !validProjectedRecord(json?.cloud)||
          json.profile_present&&json.cloud.profilePresent!==true||
          !json.profile_present&&json.cloud.profilePresent!==false){
          view={kind:"error",reason:"unconfirmed"};return;
        }
        const local=projection(latest);
        view={kind:"result",checkedAt:date(json.checked_at),
          comparison:compareSquadCloudCheck(local,json.cloud)};
      }catch(error){
        if(mine!==generation)return;
        view=stamp!==stampOf(context())?{kind:"stale"}:
          {kind:"error",reason:/timeout|abort/i.test(String(error?.code||error?.name))?"timeout":"network"};
      }finally{
        if(mine===generation){busy=false;onChange()}
      }
    }
  };
}
