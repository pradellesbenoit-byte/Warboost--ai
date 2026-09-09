import {PLAYER_ACTIVITY_EVENT_TYPES,participationEventRecords,participationSummaryByType} from './activity-events.js';

function dateStamp(v){
  const s=String(v||'').trim();
  const n=/^\d{4}-\d{2}-\d{2}$/.test(s)?Date.parse(`${s}T12:00:00Z`):Date.parse(s);
  return Number.isFinite(n)?n:0;
}
function ageDays(nowMs,date){const ts=dateStamp(date);return ts?Math.max(0,(nowMs-ts)/864e5):null}

export function playerParticipationInsight(member,{nowMs=Date.now(),days=30}={}){
  const records=participationEventRecords(member?.activity_events,{nowMs,days})
    .filter(x=>PLAYER_ACTIVITY_EVENT_TYPES.includes(x.event_type))
    .sort((a,b)=>dateStamp(b.event_date)-dateStamp(a.event_date)||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  const summary=participationSummaryByType(records,{nowMs,days});
  const participated=records.filter(x=>x.participation_status==='participated');
  const distinctParticipatedTypes=new Set(participated.map(x=>x.event_type)).size;
  const latestKnown=records[0]?.event_date||null;
  const latestParticipation=participated.slice().sort((a,b)=>dateStamp(b.event_date)-dateStamp(a.event_date))[0]?.event_date||null;
  const latestParticipationAge=ageDays(nowMs,latestParticipation);
  let evidence_key='insufficient';
  if(participated.length>=3&&distinctParticipatedTypes>=2&&latestParticipationAge!=null&&latestParticipationAge<=10)evidence_key='multiple_confirmed';
  else if(participated.length>0)evidence_key='confirmed';
  else if(records.length>0)evidence_key='known_no_conclusion';
  const by_type=PLAYER_ACTIVITY_EVENT_TYPES.map(type=>{
    const rows=records.filter(x=>x.event_type===type);if(!rows.length)return null;
    const counts={participated:0,absent_confirmed:0,not_selected:0,excused:0,unknown:0};
    for(const row of rows)counts[row.participation_status]=(counts[row.participation_status]||0)+1;
    const latest=rows[0];
    return {event_type:type,counts,total:rows.length,last_date:latest?.event_date||null,last_status:latest?.participation_status||'unknown',last_source:latest?.source||'warboost_manual'};
  }).filter(Boolean);
  return {
    member,
    days,
    evidence_key,
    records,
    by_type,
    total:summary.total,
    latest_known_date:latestKnown,
    latest_participation_date:latestParticipation,
    participated_types:distinctParticipatedTypes
  };
}

export function allianceParticipationOverview(members,{nowMs=Date.now(),days=30}={}){
  const list=Array.isArray(members)?members:[];
  const insights=list.map(member=>playerParticipationInsight(member,{nowMs,days}));
  const linked=list.filter(m=>m?.warboost_linked===true).length;
  const known=insights.filter(x=>x.records.length>0).length;
  const linkedKnown=insights.filter(x=>x.member?.warboost_linked===true&&x.records.length>0).length;
  const linkedWithoutEvidence=Math.max(0,linked-linkedKnown);
  const totalRecords=insights.reduce((n,x)=>n+x.records.length,0);
  const participatedRecords=insights.reduce((n,x)=>n+Number(x.total?.participated||0),0);
  const confirmedAbsences=insights.reduce((n,x)=>n+Number(x.total?.absent_confirmed||0),0);
  const excused=insights.reduce((n,x)=>n+Number(x.total?.excused||0),0);
  const notSelected=insights.reduce((n,x)=>n+Number(x.total?.not_selected||0),0);
  return {days,total_members:list.length,linked,known_members:known,linked_known_members:linkedKnown,linked_without_evidence:linkedWithoutEvidence,total_records:totalRecords,participated_records:participatedRecords,confirmed_absences:confirmedAbsences,excused,not_selected:notSelected,insights};
}
