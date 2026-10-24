import {canonicalHeroName,isGenericHeroName} from "./heroes.js";
import {canonicalPowerMillions} from "./power-units.js";
import {confirmedHeroPower,parseHeroPower} from "./hero-power.js";

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function when(v){const t=Date.parse(v||'');return Number.isFinite(t)?new Date(t).toISOString():null}
function round(v,d=2){const n=Number(v);if(!Number.isFinite(n))return null;const p=10**d;return Math.round(n*p)/p}
function heroName(v){const name=canonicalHeroName(v);return name&&!isGenericHeroName(name)?name:""}
function heroPower(v,key="power"){
  if(String(key).endsWith("_m")){const millions=canonicalPowerMillions(v);return millions===null?null:millions*1_000_000;}
  return parseHeroPower(v);
}
function snapshotHeroPowers(raw={},fallbackAt=null){
  const rows=[],seen=new Set(),add=(name,power,updatedAt=fallbackAt,powerKey="power")=>{
    const hero=heroName(name),value=heroPower(power,powerKey);if(!hero||value===null||value<=0)return;
    const key=hero.toLowerCase(),at=when(updatedAt)||fallbackAt||null,signature=`${key}|${value}|${at||""}`;
    if(seen.has(signature))return;seen.add(signature);rows.push({hero_name:hero,power:value,updated_at:at});
  };
  const collect=(value,inheritedAt=fallbackAt,depth=0)=>{
    if(!value||typeof value!=="object"||depth>5)return;
    const at=value.updated_at||value.captured_at||value.scanned_at||value.at||inheritedAt;
    const name=value.hero_name||value.hero?.name;
    const powerKey=value.power!==undefined?"power":value.power_m!==undefined?"power_m":value.hero_power!==undefined?"hero_power":"hero_power_m";
    const power=value[powerKey];
    if(name!==undefined&&power!==undefined)add(name,power,at,powerKey);
    for(const [key,child] of Object.entries(value)){
      if(key==="hero_powers"||key==="hero_profiles"||key==="hero_progression"||key==="heroes"||key==="squads"||key==="state"||key==="data"||key==="result"||key==="scan"||key==="payload"||key==="profile"||key==="history"){
        if(Array.isArray(child))for(const item of child)collect(item,at,depth+1);
        else if(child&&typeof child==="object")collect(child,at,depth+1);
      }
    }
  };
  collect(raw,fallbackAt);
  return rows.sort((a,b)=>(Date.parse(a.updated_at||"")||0)-(Date.parse(b.updated_at||"")||0)||a.hero_name.localeCompare(b.hero_name)).slice(-40);
}
function squadRows(state={}){return Array.from({length:4},(_,i)=>{const s=state?.squads?.[i]||{};return {id:i+1,power_m:canonicalPowerMillions(s.power_m??s.power),updated_at:when(s.updated_at)}})}
export function strongestSquadFromState(state={}){
  const rows=squadRows(state).filter(x=>x.power_m!==null&&x.power_m>0).sort((a,b)=>b.power_m-a.power_m||a.id-b.id);
  return rows[0]||{id:null,power_m:null,updated_at:null};
}
export function progressionSnapshotFromState(state={},opts={}){
  const at=when(opts.at)||new Date().toISOString(),strongest=strongestSquadFromState(state),squads=squadRows(state),hero_powers=[];
  for(const squad of Array.isArray(state?.squads)?state.squads:[])for(const hero of Array.isArray(squad?.heroes)?squad.heroes:[]){
    const power=confirmedHeroPower(hero?.power);if(heroName(hero?.name)&&power!==null)hero_powers.push({hero_name:heroName(hero.name),power,updated_at:when(hero?.updated_at)||at});
  }
  return {
    at,source:String(opts.source||'state').slice(0,40),
    account_power_m:canonicalPowerMillions(state?.player?.power_m),account_updated_at:when(state?.player?.updated_at)||at,
    hq_level:num(state?.player?.hq_level),
    drone_level:num(state?.drone?.level),drone_power_m:canonicalPowerMillions(state?.drone?.power_m),drone_updated_at:when(state?.drone?.updated_at)||at,
    main_squad_id:strongest.id,main_squad_power_m:strongest.power_m,main_squad_updated_at:strongest.updated_at,
    squad_powers:squads.map(x=>x.power_m),squad_updated_ats:squads.map(x=>x.updated_at),hero_powers
  };
}
function meaningful(s){return Boolean(s&&(s.account_power_m!==null||s.main_squad_power_m!==null||s.drone_power_m!==null||s.drone_level!==null||s.hq_level!==null||(s.squad_powers||[]).some(x=>x!==null)))}
function metricsKey(s){return JSON.stringify([s.account_power_m,s.account_updated_at,s.hq_level,s.drone_level,s.drone_power_m,s.drone_updated_at,s.main_squad_id,s.main_squad_power_m,s.main_squad_updated_at,...(s.squad_powers||[]),...(s.squad_updated_ats||[])])}
export function normalizeProgressionSnapshots(rows=[]){
  const out=[];for(const raw of Array.isArray(rows)?rows:[]){const at=when(raw?.at);if(!at)continue;const hero_powers=snapshotHeroPowers(raw,at),s={at,source:String(raw?.source||'state').slice(0,40),account_power_m:canonicalPowerMillions(raw?.account_power_m),account_updated_at:when(raw?.account_updated_at)||at,hq_level:num(raw?.hq_level),drone_level:num(raw?.drone_level),drone_power_m:canonicalPowerMillions(raw?.drone_power_m),drone_updated_at:when(raw?.drone_updated_at)||at,main_squad_id:num(raw?.main_squad_id),main_squad_power_m:canonicalPowerMillions(raw?.main_squad_power_m),main_squad_updated_at:when(raw?.main_squad_updated_at),squad_powers:Array.from({length:4},(_,i)=>canonicalPowerMillions(raw?.squad_powers?.[i])),squad_updated_ats:Array.from({length:4},(_,i)=>when(raw?.squad_updated_ats?.[i])),hero_powers};if(meaningful(s)||hero_powers.length)out.push(s)}
  out.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));const dedup=[];for(const s of out){const prev=dedup[dedup.length-1];if(prev&&metricsKey(prev)===metricsKey(s)&&Math.abs(Date.parse(s.at)-Date.parse(prev.at))<6*3600e3){dedup[dedup.length-1]={...prev,...s};continue}dedup.push(s)}return dedup.slice(-120);
}
export function mergeProgressionSnapshots(a=[],b=[]){return normalizeProgressionSnapshots([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])])}
export function appendProgressionSnapshot(rows=[],state={},opts={}){const next=progressionSnapshotFromState(state,opts);if(!meaningful(next))return normalizeProgressionSnapshots(rows);return mergeProgressionSnapshots(rows,[next])}
function pctDelta(current,previous){const c=num(current),p=num(previous);if(c===null||p===null||p===0)return null;return round(((c-p)/p)*100,1)}
function metricComparison(list,field,observedField,days){
  const byObservation=new Map();
  for(const s of list){const value=num(s[field]),observed=when(s[observedField])||when(s.at);if(value===null||!observed)continue;byObservation.set(observed,{value,observed,snapshot:s})}
  const obs=[...byObservation.values()].sort((a,b)=>Date.parse(a.observed)-Date.parse(b.observed));if(obs.length<2)return {current:obs.at(-1)?.value??null,previous:null,change_m:null,pct:null,per_day:null,elapsed_days:null,updated_at:obs.at(-1)?.observed||null};
  const latest=obs.at(-1),target=Date.parse(latest.observed)-Math.max(1,Number(days)||30)*86400000;let base=obs[0];for(const o of obs){if(Date.parse(o.observed)<=target)base=o;else break}if(base===latest)base=obs.at(-2);
  const elapsed=Math.max(.001,(Date.parse(latest.observed)-Date.parse(base.observed))/86400000),change=round(latest.value-base.value,2);
  return {current:latest.value,previous:base.value,change_m:change,pct:pctDelta(latest.value,base.value),per_day:round(change/elapsed,2),elapsed_days:round(elapsed,1),updated_at:latest.observed};
}
export function progressionComparison(rows=[],days=30){
  const list=normalizeProgressionSnapshots(rows);if(list.length<2)return null;const latest=list.at(-1),base=list[0];
  const account=metricComparison(list,'account_power_m','account_updated_at',days),main_squad=metricComparison(list,'main_squad_power_m','main_squad_updated_at',days),drone=metricComparison(list,'drone_power_m','drone_updated_at',days);
  const elapsed=[account.elapsed_days,main_squad.elapsed_days,drone.elapsed_days].filter(Number.isFinite);return {latest,base,elapsed_days:elapsed.length?Math.max(...elapsed):null,account,main_squad,drone};
}
