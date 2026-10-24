const LIFECYCLES=new Set(['active','ended','interseason','unknown']);
function clean(v){return String(v??'').trim().toLowerCase()}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
export function normalizeSeasonLifecycle(v){
  const x=clean(v).replace(/[ _]+/g,'-');
  if(!x)return null;
  if(['active','current','ongoing','in-season','inseason'].includes(x))return 'active';
  if(['ended','finished','complete','completed','closed','over'].includes(x))return 'ended';
  if(['interseason','inter-season','between-seasons','between-season','offseason','off-season'].includes(x))return 'interseason';
  if(['unknown','auto','unconfirmed','unset'].includes(x))return 'unknown';
  return LIFECYCLES.has(x)?x:null;
}
export function seasonLifecycle(season={}){
  const explicit=normalizeSeasonLifecycle(season?.lifecycle??season?.status??season?.state);
  if(explicit)return explicit;
  if(season?.interseason===true)return 'interseason';
  if(season?.ended_at||season?.finished_at)return 'ended';
  const day=num(season?.day),total=num(season?.total_days);
  if(day!==null&&day>=1&&(total===null||total<=0||day<=total))return 'active';
  if(day!==null&&total!==null&&total>0&&day>total)return 'ended';
  if(season?.active===true)return 'active';
  if(season?.active===false&&(season?.number||season?.name))return 'unknown';
  return 'unknown';
}
export function seasonIsActive(season={}){return seasonLifecycle(season)==='active'}
export function seasonIsEnded(season={}){const x=seasonLifecycle(season);return x==='ended'||x==='interseason'}
export function activeSeasonProgress(season={}){
  if(!seasonIsActive(season))return null;
  const n=num(season?.progress_pct);return n===null?null:Math.max(0,Math.min(100,n));
}
export function repairSeasonState(season={}){
  const out={...(season&&typeof season==='object'?season:{})};
  const explicit=normalizeSeasonLifecycle(out.lifecycle??out.status??out.state);
  out.lifecycle=seasonLifecycle(out);
  const day=num(out.day),total=num(out.total_days),raw=num(out.progress_pct);
  // V2.5.9 and earlier converted a missing progress value to 0. If no season day/length exists,
  // that legacy zero is ambiguous and must return to unknown instead of becoming a factual 0%.
  if(raw===0&&day===null&&total===null&&out.lifecycle!=='active'&&!explicit)out.progress_pct=null;
  else if(raw===null)out.progress_pct=null;
  else out.progress_pct=Math.max(0,Math.min(100,raw));
  if(out.lifecycle==='interseason'||out.lifecycle==='ended'){
    // Historical values may stay stored elsewhere, but current-season progress is non-applicable.
    out.progress_pct=null;
  }
  out.lifecycle_source=String(out.lifecycle_source||out.status_source||'').trim().slice(0,40)||null;
  out.ended_at=out.ended_at||out.finished_at||null;
  return out;
}
