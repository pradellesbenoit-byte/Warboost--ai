export const AVAILABILITY_EVENT_TYPES=Object.freeze(["desert_storm","canyon_storm","vs","season","other"]);
export const AVAILABILITY_STATES=Object.freeze(["present","absent","uncertain","unknown"]);
export const AVAILABILITY_SOURCES=Object.freeze(["player_self_report","alliance_manager_manual","import","legacy"]);

const clean=(v,max=160)=>String(v??"").trim().slice(0,max);
const stamp=v=>{const n=Date.parse(v||"");return Number.isFinite(n)?n:0};
const eventType=v=>{const x=clean(v,40).toLowerCase().replace(/[\s-]+/g,"_");return AVAILABILITY_EVENT_TYPES.includes(x)?x:"other"};
const state=v=>{const x=clean(v,30).toLowerCase().replace(/[\s-]+/g,"_");const aliases={yes:"present",no:"absent",confirmed_present:"present",absent_confirmed:"absent"};return AVAILABILITY_STATES.includes(aliases[x]||x)?aliases[x]||x:"unknown"};
const source=v=>{const x=clean(v,50).toLowerCase();return AVAILABILITY_SOURCES.includes(x)?x:"legacy"};
const identityOf=x=>clean(x?.canonical_member_key)||clean(x?.lifecycle_key)||clean(x?.member_key)||clean(x?.player_id)||clean(x?.name);

export function normalizeEventAvailability(raw={},defaults={}){
  const identity=raw.member||raw.member_data||raw;
  const event_date=clean(raw.event_date||defaults.event_date,20)||null;
  const event_instance=clean(raw.event_instance||raw.instance||defaults.event_instance,80)||event_date||"current";
  const updated_at=clean(raw.updated_at||raw.confirmed_at||defaults.updated_at,40)||null;
  return {
    canonical_member_key:clean(raw.canonical_member_key||identity.canonical_member_key,260)||null,
    lifecycle_key:clean(raw.lifecycle_key||identity.lifecycle_key,260)||null,
    member_key:clean(raw.member_key||identity.member_key,260)||identityOf(identity)||null,
    player_id:clean(raw.player_id||identity.player_id,120)||null,
    member_name:clean(raw.member_name||raw.name||identity.name,120)||null,
    event_type:eventType(raw.event_type||raw.event||defaults.event_type),
    event_date,
    event_instance,
    status:state(raw.status||raw.availability||raw.presence||raw.participation_status),
    time_slot:clean(raw.time_slot||raw.slot||raw.time,30)||null,
    note:clean(raw.note,240)||null,
    source:source(raw.source||defaults.source),
    reliability:raw.reliability===null||raw.reliability===undefined?null:Math.max(0,Math.min(1,Number(raw.reliability)||0)),
    updated_at
  };
}

export function normalizeEventAvailabilities(rows=[],defaults={}){
  return (Array.isArray(rows)?rows:[]).map(row=>normalizeEventAvailability(row,defaults)).filter(row=>row.member_key||row.player_id||row.member_name);
}

function recordKey(row){
  const identity=row.canonical_member_key||row.lifecycle_key||row.member_key||row.player_id||row.member_name;
  return `${row.event_type}|${row.event_instance||row.event_date||"current"}|${identity||""}`;
}
function historyKey(row){return `${recordKey(row)}|${row.status}|${row.time_slot||""}|${row.updated_at||""}|${row.source}`;}
function prefer(a,b){
  if(!a)return b;
  const aPlayer=a.source==="player_self_report",bPlayer=b.source==="player_self_report";
  const future=x=>Boolean(x.event_date&&x.event_date>=new Date().toISOString().slice(0,10));
  if(bPlayer&&future(b)&&!(aPlayer&&future(a)))return b;
  if(aPlayer&&future(a)&&!bPlayer&&future(b))return a;
  if(stamp(b.updated_at)>=stamp(a.updated_at))return {...a,...b};
  return a;
}

export function mergeEventAvailabilities(...sources){
  const map=new Map();
  for(const row of normalizeEventAvailabilities(sources.flat())){
    const key=recordKey(row),old=map.get(key);map.set(key,prefer(old,row));
  }
  return [...map.values()].sort((a,b)=>stamp(b.updated_at)-stamp(a.updated_at)).slice(0,600);
}

export function mergeAvailabilityHistory(...sources){
  const seen=new Set(),out=[];
  for(const row of normalizeEventAvailabilities(sources.flat())){
    const key=historyKey(row);if(seen.has(key))continue;seen.add(key);out.push(row);
  }
  return out.sort((a,b)=>stamp(b.updated_at)-stamp(a.updated_at)).slice(0,1200);
}

export function upsertEventAvailability(current=[],history=[],raw,defaults={}){
  const next=normalizeEventAvailability(raw,defaults);
  return {current:mergeEventAvailabilities(current,[next]),history:mergeAvailabilityHistory(history,[next])};
}

export function availabilityForMember(rows=[],member={},event_type,event_instance="current"){
  const keys=new Set([member.canonical_member_key,member.lifecycle_key,member.member_key,member.player_id,member.name].filter(Boolean));
  return normalizeEventAvailabilities(rows).find(row=>row.event_type===eventType(event_type)&&(row.event_instance||"current")===event_instance&&[row.canonical_member_key,row.lifecycle_key,row.member_key,row.player_id,row.member_name].some(key=>keys.has(key)))||normalizeEventAvailability({...member,event_type,event_instance});
}

export function mergePlayerAvailabilityIntoRoster(roster=[],playerRows=[],{playerId,name,serverId,allianceTag}={}){
  const exactName=clean(name,120).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let changed=false;
  const rows=Array.isArray(roster)?roster.map(row=>{
    const samePlayer=playerId&&String(row.player_id||"")===String(playerId);
    const sameIdentity=exactName&&String(row.name||"").toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")===exactName&&String(row.server_id||serverId||"")===String(serverId||"")&&String(row.alliance_tag||allianceTag||"").toUpperCase()===String(allianceTag||"").toUpperCase();
    if(!samePlayer&&(!sameIdentity||row.warboost_linked!==true))return row;
    const merged=mergeEventAvailabilities(row.event_availability,playerRows);
    if(JSON.stringify(merged)!==JSON.stringify(row.event_availability||[])){changed=true;return {...row,event_availability:merged,availability_history:mergeAvailabilityHistory(row.availability_history,playerRows),updated_at:new Date().toISOString()};}
    return row;
  }):[];
  return {rows,changed};
}