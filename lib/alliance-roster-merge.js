import {rosterNameKey} from './roster-import.js';
import {mergeActivityEvents} from './activity-events.js';

export function mergeCloudRosterPreservingManual(existingRows,cloudRows){
  const existing=Array.isArray(existingRows)?existingRows:[],cloud=Array.isArray(cloudRows)?cloudRows:[];
  const byId=new Map(existing.filter(m=>m?.player_id).map(m=>[String(m.player_id),m]));
  const byName=new Map(existing.filter(m=>m?.name).map(m=>[rosterNameKey(m.name),m]));
  const matched=new Set();
  const cloudRoster=cloud.map(m=>{
    const old=byId.get(String(m?.player_id||''))||byName.get(rosterNameKey(m?.name));
    if(old)matched.add(old);
    const nextPower=Number(m?.power_m),oldPower=Number(old?.power_m),delta=Number.isFinite(nextPower)&&Number.isFinite(oldPower)?Number((nextPower-oldPower).toFixed(2)):null;
    return {...old,...m,activity_events:mergeActivityEvents(old?.activity_events,m?.activity_events),source:'cloud',delta_m:delta};
  });
  const manual=existing.filter(m=>!matched.has(m)&&!m?.player_id).map(m=>({...m,activity_events:mergeActivityEvents(m?.activity_events),source:m.source||'manual_import'}));
  return [...cloudRoster,...manual];
}

// Read-after-write protection for the authenticated player's own activity.
// A freshly confirmed event must be visible in the returned alliance roster even
// if the profile roster query momentarily returns an older copy of that profile.
// This mirrors only the authenticated player's own state; it never invents data
// for another alliance member and does not create a new roster row.
export function mergeCurrentPlayerActivityIntoRoster(rows,{playerId,name,activityEvents,updatedAt}={}){
  const out=(Array.isArray(rows)?rows:[]).map(m=>({...m,activity_events:mergeActivityEvents(m?.activity_events)}));
  const id=String(playerId||'').trim(),nameKey=rosterNameKey(name||'');
  let idx=id?out.findIndex(m=>String(m?.player_id||'').trim()===id):-1;
  if(idx<0&&nameKey)idx=out.findIndex(m=>rosterNameKey(m?.name||'')===nameKey);
  if(idx<0)return out;
  const current=out[idx];
  out[idx]={...current,activity_events:mergeActivityEvents(current.activity_events,activityEvents),updated_at:updatedAt||current.updated_at||null};
  return out;
}
