export const ACTIVITY_EVENT_TYPES=Object.freeze(["vs","zombie","marauder","alliance_event","war","season"]);
const TYPE_SET=new Set(ACTIVITY_EVENT_TYPES);

function clean(v,max=80){return String(v??"").trim().slice(0,max)}
function isoDateKey(v){const s=clean(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null}
function stamp(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0}
function eventType(v){const t=clean(v,40).toLowerCase().replace(/[\s-]+/g,"_");return TYPE_SET.has(t)?t:null}

export function activityEventId(type,date){const t=eventType(type),d=isoDateKey(date);return t&&d?`${d}:${t}`:null}

export function normalizeActivityEvent(raw={}){
  const event_type=eventType(raw?.event_type||raw?.type),event_date=isoDateKey(raw?.event_date||raw?.date);
  if(!event_type||!event_date)return null;
  const id=activityEventId(event_type,event_date),confirmed=raw?.confirmed===true;
  const updated_at=clean(raw?.updated_at||raw?.confirmed_at,40)||null;
  const confirmed_at=confirmed?(clean(raw?.confirmed_at||raw?.updated_at,40)||null):null;
  return {id,event_type,event_date,confirmed,confirmed_at,updated_at,source:"player_self_report"};
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
  return [...map.values()].sort((a,b)=>stamp(b.updated_at)-stamp(a.updated_at)||b.id.localeCompare(a.id)).slice(0,240);
}

function eventObservedAt(item){
  const ts=stamp(item?.confirmed_at);if(ts)return ts;
  const d=isoDateKey(item?.event_date);return d?Date.parse(`${d}T12:00:00Z`):0;
}

export function confirmedActivityEvents(records,{nowMs=Date.now(),days=7}={}){
  const maxAge=Math.max(1,Number(days)||7)*864e5+12*36e5;
  return mergeActivityEvents(records).filter(item=>{
    if(item.confirmed!==true)return false;
    const ts=eventObservedAt(item);if(!ts)return false;
    const age=nowMs-ts;return age>=-12*36e5&&age<=maxAge;
  });
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
