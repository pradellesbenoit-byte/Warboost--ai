import {rosterLifecycleKey} from './alliance-roster-lifecycle.js';
import {confirmedActivityEvents} from './activity-events.js';

export const AVAILABILITY_EVENT_TYPES=Object.freeze(['desert_storm','canyon_storm','vs','season']);
export const AVAILABILITY_STATES=Object.freeze(['present','absent','uncertain','unknown']);

const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const validDate=v=>{const s=clean(v,40);return s&&Number.isFinite(Date.parse(s))?s:null};
const eventType=v=>{const s=clean(v).toLowerCase().replace(/[\s-]+/g,'_');return AVAILABILITY_EVENT_TYPES.includes(s)?s:null};
const state=v=>{
  const s=clean(v).toLowerCase().replace(/[\s-]+/g,'_');
  const aliases={participated:'present',confirmed_present:'present',yes:'present',absent_confirmed:'absent',no_show:'absent'};
  const normalized=aliases[s]||s;
  return AVAILABILITY_STATES.includes(normalized)?normalized:'unknown';
};
const keyOf=(v={})=>clean(v.canonical_member_key)||clean(v.lifecycle_key)||clean(rosterLifecycleKey(v))||clean(v.member_key)||clean(v.key)||clean(v.name);
const rankWeight=role=>({R5:5,R4:4,R3:3,R2:2,R1:1})[clean(role,4).toUpperCase()]||null;
const positiveNumber=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:null};
function confirmedEvidence(member={}){
  const squadPower=positiveNumber(member.squad_power_m??member.main_squad_power_m),accountPower=positiveNumber(member.power_m),rank=rankWeight(member.role);
  const participation=confirmedActivityEvents(member.activity_events||[]).length;
  const squadConfirmed=Boolean(member.warboost_linked===true&&(squadPower!==null||(Array.isArray(member.squad_heroes)&&member.squad_heroes.filter(Boolean).length)));
  return {squad_power_m:squadPower,account_power_m:accountPower,confirmed_participations:participation,rank_known:rank!==null?clean(member.role,4).toUpperCase():null,main_squad_confirmed:squadConfirmed};
}
function evidenceScore(member={}){
  const e=confirmedEvidence(member);
  return (e.squad_power_m??0)*100+(e.account_power_m??0)*2+e.confirmed_participations*5+(rankWeight(e.rank_known)||0)+(e.main_squad_confirmed?1:0);
}

/** Normalize one durable, persistence-ready availability observation. */
export function normalizeAvailabilityRecord(raw={},defaults={}){
  const member=raw.member||raw.member_data||raw;
  const status=state(raw.status||raw.availability||raw.presence||raw.participation_status);
  const event=eventType(raw.event_type||raw.event||defaults.event_type)||eventType(defaults.event_type);
  const slot=clean(raw.time_slot||raw.slot||raw.time||defaults.time_slot,80)||null;
  const source=clean(raw.source||defaults.source,80)||null;
  const reliability=raw.reliability===null||raw.reliability===undefined?null:
    (Number.isFinite(Number(raw.reliability))?Math.max(0,Math.min(1,Number(raw.reliability))):null);
  const updated_at=validDate(raw.updated_at||raw.confirmed_at||defaults.updated_at);
  return {
    canonical_member_key:clean(raw.canonical_member_key||member.canonical_member_key)||null,
    lifecycle_key:clean(raw.lifecycle_key||member.lifecycle_key)||clean(rosterLifecycleKey(member))||null,
    member_key:keyOf(raw.canonical_member_key||raw.lifecycle_key?raw:member)||null,
    member_name:clean(raw.member_name||raw.name||member.name,120)||null,
    event_type:event,
    status,
    display_status:(status==='unknown'||status==='uncertain')?'to_confirm':status,
    time_slot:slot,
    source,
    reliability,
    updated_at
  };
}

export function normalizeAvailabilityRecords(records=[],defaults={}){
  return (Array.isArray(records)?records:[]).map(x=>normalizeAvailabilityRecord(x,defaults));
}

export function mergeAvailabilityRecords(...sources){
  const latest=new Map(),stamp=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0};
  for(const item of normalizeAvailabilityRecords(sources.flat())){
    const identity=item.canonical_member_key||item.lifecycle_key||item.member_key||item.member_name;
    if(!identity||!item.event_type)continue;
    const key=`${item.event_type}|${identity}|${item.time_slot||''}`,current=latest.get(key);
    if(current&&current.status!=='unknown'&&item.status==='unknown'&&!item.source)continue;
    if(current&&stamp(current.updated_at)>stamp(item.updated_at))continue;
    latest.set(key,item);
  }
  return [...latest.values()].slice(-500);
}

export function countAvailabilitySlots(records=[],{event_type=null,includeUnknown=true}={}){
  const out={};
  for(const row of normalizeAvailabilityRecords(records,{event_type})){
    if(event_type&&row.event_type!==event_type)continue;
    const slot=row.time_slot||'to_confirm';
    if(!includeUnknown&&slot==='to_confirm')continue;
    if(!out[slot])out[slot]={slot,present:0,absent:0,uncertain:0,unknown:0,to_confirm:0,total:0};
    out[slot][row.status]++;if(row.display_status==='to_confirm')out[slot].to_confirm++;
    out[slot].total++;
  }
  return out;
}

export function recommendBestSlot(records=[],options={}){
  const counts=countAvailabilitySlots(records,options), rows=Object.values(counts);
  rows.sort((a,b)=>b.present-a.present||b.uncertain-a.uncertain||a.to_confirm-b.to_confirm||a.slot.localeCompare(b.slot));
  return rows[0]||{slot:null,present:0,absent:0,uncertain:0,unknown:0,to_confirm:0,total:0};
}

/** Select only explicit attendance; uncertainty is retained as a confirmation queue. */
export function planAvailabilityRoster(members=[],records=[],{event_type=null,max_starters=20,max_substitutes=10,slot=null}={}){
  const people=Array.isArray(members)?members:[], observations=normalizeAvailabilityRecords(records,{event_type});
  const byKey=new Map();
  for(const row of observations){
    if(event_type&&row.event_type!==event_type)continue;
    if(slot&&row.time_slot!==slot)continue;
    const keys=[row.member_key,row.canonical_member_key,row.lifecycle_key].filter(Boolean);
    for(const k of keys){
      const old=byKey.get(k);
      if(old===null)continue;
      if(!old||Date.parse(row.updated_at||'')>=Date.parse(old.updated_at||''))byKey.set(k,row);
    }
  }
  const confirmation=[],eligible=[],excluded=[];
  for(const member of people){
    const keys=[keyOf(member),clean(member.canonical_member_key),clean(member.lifecycle_key),clean(rosterLifecycleKey(member))].filter(Boolean);
    const matches=[...new Set(keys.map(k=>byKey.get(k)).filter(Boolean))];
    const row=matches.length===1?matches[0]:matches.length>1&&matches.every(x=>x===matches[0])?matches[0]:
      normalizeAvailabilityRecord({...member,member_name:member.name,event_type});
    const item={...member,canonical_member_key:row.canonical_member_key,lifecycle_key:row.lifecycle_key,availability:row,confirmed_evidence:confirmedEvidence(member)};
    if(row.status==='present')eligible.push(item);
    else if(row.status==='absent')excluded.push(item);
    else confirmation.push(item);
  }
  eligible.sort((a,b)=>evidenceScore(b)-evidenceScore(a)||clean(a.name).localeCompare(clean(b.name)));
  const starters=eligible.slice(0,Math.max(0,max_starters)),substitutes=eligible.slice(starters.length,starters.length+Math.max(0,max_substitutes));
  return {event_type:eventType(event_type),starters,substitutes,confirmation,excluded,registered_count:people.length,
    counts:countAvailabilitySlots(observations,{event_type}),best_slot:recommendBestSlot(observations,{event_type})};
}

export const normalizeAvailability=normalizeAvailabilityRecord;
export const getAvailabilitySlotCounts=countAvailabilitySlots;
export const selectAvailabilityRoster=planAvailabilityRoster;