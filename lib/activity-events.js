export const PLAYER_ACTIVITY_EVENT_TYPES=Object.freeze([
  "vs",
  "alliance_exercise",
  "zombie_siege",
  "desert_storm",
  "canyon_storm",
  "ghost_ops",
  "city_war",
  "season_war",
  "marauder"
]);

// Keep the V2.5.28 generic ids readable so old local/cloud confirmations survive upgrades.
export const LEGACY_ACTIVITY_EVENT_TYPES=Object.freeze(["zombie","alliance_event","war","season"]);
export const ACTIVITY_EVENT_TYPES=Object.freeze([...new Set([...PLAYER_ACTIVITY_EVENT_TYPES,...LEGACY_ACTIVITY_EVENT_TYPES])]);
export const PARTICIPATION_STATUSES=Object.freeze(["participated","absent_confirmed","not_selected","excused","unknown","removed"]);
export const ACTIVITY_EVENT_SOURCES=Object.freeze(["player_self_report","r5_r4_import","r5_r4_capture","warboost_manual","official_api"]);

const TYPE_SET=new Set(ACTIVITY_EVENT_TYPES),STATUS_SET=new Set(PARTICIPATION_STATUSES),SOURCE_SET=new Set(ACTIVITY_EVENT_SOURCES);

function clean(v,max=120){return String(v??"").trim().slice(0,max)}
function isoDateKey(v){const s=clean(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null}
function stamp(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0}
function normalizeToken(v){return clean(v,80).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")}
function eventType(v){const t=normalizeToken(v);return TYPE_SET.has(t)?t:null}
function eventStatus(raw={}){
  const direct=normalizeToken(raw?.participation_status||raw?.status);
  if(STATUS_SET.has(direct))return direct;
  if(raw?.confirmed===true)return "participated";
  if(raw?.confirmed===false)return "removed";
  return "unknown";
}
function eventSource(v){const s=normalizeToken(v);return SOURCE_SET.has(s)?s:"player_self_report"}

export function activityEventId(type,date){const t=eventType(type),d=isoDateKey(date);return t&&d?`${d}:${t}`:null}

export function normalizeActivityEvent(raw={}){
  const event_type=eventType(raw?.event_type||raw?.type),event_date=isoDateKey(raw?.event_date||raw?.date);
  if(!event_type||!event_date)return null;
  const id=activityEventId(event_type,event_date),participation_status=eventStatus(raw),confirmed=participation_status==="participated";
  const updated_at=clean(raw?.updated_at||raw?.confirmed_at,40)||null;
  const confirmed_at=confirmed?(clean(raw?.confirmed_at||raw?.updated_at,40)||null):null;
  const source=eventSource(raw?.source);
  return {id,event_type,event_date,participation_status,confirmed,confirmed_at,updated_at,source};
}

export function mergeActivityEvents(...lists){
  const map=new Map();
  for(const list of lists){
    for(const raw of Array.isArray(list)?list:[]){
      const item=normalizeActivityEvent(raw);if(!item)continue;
      const prev=map.get(item.id);
      if(!prev||stamp(item.updated_at)>=stamp(prev.updated_at))map.set(item.id,item);
    }
  }
  return [...map.values()].sort((a,b)=>stamp(b.updated_at)-stamp(a.updated_at)||b.id.localeCompare(a.id)).slice(0,720);
}

function eventObservedAt(item){
  const ts=stamp(item?.confirmed_at||item?.updated_at);if(ts)return ts;
  const d=isoDateKey(item?.event_date);return d?Date.parse(`${d}T12:00:00Z`):0;
}

export function participationEventRecords(records,{nowMs=Date.now(),days=30}={}){
  const maxAge=Math.max(1,Number(days)||30)*864e5+12*36e5;
  return mergeActivityEvents(records).filter(item=>{
    if(item.participation_status==="removed")return false;
    const ts=eventObservedAt(item);if(!ts)return false;
    const age=nowMs-ts;return age>=-12*36e5&&age<=maxAge;
  });
}

export function confirmedActivityEvents(records,{nowMs=Date.now(),days=7}={}){
  return participationEventRecords(records,{nowMs,days}).filter(item=>item.participation_status==="participated");
}

export function activityEventEvidence(records,nowMs=Date.now()){
  const rows=confirmedActivityEvents(records,{nowMs,days:7});
  const latest=rows.reduce((best,item)=>Math.max(best,eventObservedAt(item)),0);
  const latest_hours=latest?Math.max(0,(nowMs-latest)/36e5):null;
  return {rows,count:rows.length,latest_hours,types:[...new Set(rows.map(x=>x.event_type))]};
}

export function eventCountsByType(records,{nowMs=Date.now(),days=7}={}){
  const counts=Object.fromEntries(ACTIVITY_EVENT_TYPES.map(type=>[type,0]));
  for(const item of confirmedActivityEvents(records,{nowMs,days}))counts[item.event_type]=(counts[item.event_type]||0)+1;
  return counts;
}

export function participationSummaryByType(records,{nowMs=Date.now(),days=30}={}){
  const make=()=>({participated:0,absent_confirmed:0,not_selected:0,excused:0,unknown:0,total_known:0});
  const by_type=Object.fromEntries(PLAYER_ACTIVITY_EVENT_TYPES.map(type=>[type,make()]));
  const total=make();
  for(const item of participationEventRecords(records,{nowMs,days})){
    const bucket=by_type[item.event_type]||(by_type[item.event_type]=make());
    const status=PARTICIPATION_STATUSES.includes(item.participation_status)?item.participation_status:"unknown";
    if(status!=="removed"){bucket[status]=(bucket[status]||0)+1;total[status]=(total[status]||0)+1;bucket.total_known++;total.total_known++;}
  }
  return {days,by_type,total,records:participationEventRecords(records,{nowMs,days})};
}

const EVENT_ALIASES=new Map(Object.entries({
  vs:"vs",duel:"vs",alliance_duel:"vs",
  marshal:"alliance_exercise",marshals_guard:"alliance_exercise",marshal_guard:"alliance_exercise",alliance_exercise:"alliance_exercise",exercise:"alliance_exercise",
  zombie:"zombie_siege",zombie_siege:"zombie_siege",siege_zombie:"zombie_siege",
  desert:"desert_storm",desert_storm:"desert_storm",
  canyon:"canyon_storm",canyon_storm:"canyon_storm",
  ghost:"ghost_ops",ghost_ops:"ghost_ops",
  city:"city_war",city_war:"city_war",capitol:"city_war",stronghold:"city_war",strongholds:"city_war",
  season:"season_war",season_war:"season_war",seasonal_war:"season_war",
  marauder:"marauder",maraudeur:"marauder",
  alliance_event:"alliance_event",war:"city_war",guerre:"city_war"
}));
const STATUS_ALIASES=new Map(Object.entries({
  participated:"participated",participant:"participated",participated_yes:"participated",participe:"participated",participee:"participated",present:"participated",oui:"participated",yes:"participated",
  absent:"absent_confirmed",absent_confirmed:"absent_confirmed",no_show:"absent_confirmed",noshow:"absent_confirmed",
  not_selected:"not_selected",non_selected:"not_selected",non_selectionne:"not_selected",non_selectionnee:"not_selected",reserve_non_selected:"not_selected",
  excused:"excused",excuse:"excused",excusee:"excused",indisponible:"excused",
  unknown:"unknown",inconnu:"unknown",non_renseigne:"unknown",non_renseignee:"unknown"
}));
function canonicalImportedEvent(v){const k=normalizeToken(v);return EVENT_ALIASES.get(k)||eventType(k)}
function canonicalImportedStatus(v){const k=normalizeToken(v);return STATUS_ALIASES.get(k)||null}
function splitImportLine(line){
  const sep=line.includes("\t")?"\t":line.includes(";")?";":line.includes("|")?"|":",";
  return line.split(sep).map(x=>clean(x,160));
}
function looksLikeHeader(parts){const s=parts.map(normalizeToken).join(" ");return /(^| )(name|nom|pseudo|joueur|player)( |$)/.test(s)&&/(event|evenement|date|status|statut)/.test(s)}

export function parseParticipationImport(text,{now=new Date().toISOString()}={}){
  const rows=[],errors=[];
  for(const [index,line] of String(text||"").split(/\r?\n/).entries()){
    if(!line.trim())continue;
    const p=splitImportLine(line);if(looksLikeHeader(p))continue;
    if(p.length<4){errors.push({line:index+1,error:"expected_name_date_event_status"});continue}
    const [nameRaw,dateRaw,eventRaw,statusRaw]=p,name=clean(nameRaw,80),event_date=isoDateKey(dateRaw),event_type=canonicalImportedEvent(eventRaw),participation_status=canonicalImportedStatus(statusRaw);
    if(!name||!event_date||!event_type||!participation_status){errors.push({line:index+1,error:"invalid_participation_row"});continue}
    rows.push({name,event_type,event_date,participation_status,confirmed:participation_status==="participated",confirmed_at:participation_status==="participated"?now:null,updated_at:now,source:"r5_r4_import"});
  }
  return {rows,errors};
}
