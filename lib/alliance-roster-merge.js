import {rosterNameKey} from './roster-import.js';

export function mergeCloudRosterPreservingManual(existingRows,cloudRows){
  const existing=Array.isArray(existingRows)?existingRows:[],cloud=Array.isArray(cloudRows)?cloudRows:[];
  const byId=new Map(existing.filter(m=>m?.player_id).map(m=>[String(m.player_id),m]));
  const byName=new Map(existing.filter(m=>m?.name).map(m=>[rosterNameKey(m.name),m]));
  const matched=new Set();
  const cloudRoster=cloud.map(m=>{
    const old=byId.get(String(m?.player_id||''))||byName.get(rosterNameKey(m?.name));
    if(old)matched.add(old);
    const nextPower=Number(m?.power_m),oldPower=Number(old?.power_m),delta=Number.isFinite(nextPower)&&Number.isFinite(oldPower)?Number((nextPower-oldPower).toFixed(2)):null;
    return {...old,...m,source:'cloud',delta_m:delta};
  });
  const manual=existing.filter(m=>!matched.has(m)&&!m?.player_id).map(m=>({...m,source:m.source||'manual_import'}));
  return [...cloudRoster,...manual];
}
