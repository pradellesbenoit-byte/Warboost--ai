function finiteNumber(v){
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function hoursSince(value,nowMs){
  if(!value)return null;
  const ts=Date.parse(value);if(!Number.isFinite(ts))return null;
  return Math.max(0,(nowMs-ts)/36e5);
}
export function normalizeAllianceRole(value){
  const r=String(value||"R1").trim().toUpperCase();
  return /^R[1-5]$/.test(r)?r:"R1";
}
export function classifyAllianceMember(member={},nowMs=Date.now()){
  const freshnessH=hoursSince(member.updated_at,nowMs);
  const lastActiveH=hoursSince(member.last_active_at,nowMs);
  const delta=finiteNumber(member.delta_m);
  const vs=finiteNumber(member.vs_points);
  const season=finiteNumber(member.season_points);
  const positive=[delta!==null&&delta>0,vs!==null&&vs>0,season!==null&&season>0].filter(Boolean).length;
  const explicitZero=[delta===0,vs===0,season===0].filter(Boolean).length;
  const statSignals=[delta,vs,season].filter(v=>v!==null).length;
  const explicitStatus=String(member.activity_status||member.status||"").trim().toLowerCase();
  const dataSignals=(freshnessH!==null?1:0)+(lastActiveH!==null?1:0)+statSignals+(explicitStatus?1:0);

  // A recent explicit Last War/WarBoost activity timestamp is strong evidence.
  if(lastActiveH!==null&&lastActiveH<=72){
    return {key:"active",confidence:"high",freshnessH,lastActiveH,positive,explicitZero,reason:"recent_activity"};
  }
  // Recent progression/VS/Season evidence can confirm activity, but only while the snapshot is reasonably fresh.
  if(positive>0&&freshnessH!==null&&freshnessH<=168){
    return {key:"active",confidence:freshnessH<=72?"high":"medium",freshnessH,lastActiveH,positive,explicitZero,reason:"recent_progress"};
  }
  // Never infer inactivity from an old snapshot alone. Require a fresh observation plus old explicit activity and multiple zero signals.
  const explicitInactive=["inactive","inactif","offline"].includes(explicitStatus);
  if(freshnessH!==null&&freshnessH<=72&&((lastActiveH!==null&&lastActiveH>336)||explicitInactive)&&positive===0&&explicitZero>=2){
    return {key:"inactive",confidence:"medium",freshnessH,lastActiveH,positive,explicitZero,reason:"fresh_negative_evidence"};
  }
  if(!dataSignals){
    return {key:"unknown",confidence:"low",freshnessH,lastActiveH,positive,explicitZero,reason:"no_evidence"};
  }
  // Stale, partial or contradictory information must be refreshed instead of being labelled inactive.
  return {key:"refresh",confidence:"low",freshnessH,lastActiveH,positive,explicitZero,reason:freshnessH!==null&&freshnessH>72?"stale_snapshot":"insufficient_evidence"};
}
export function summarizeAllianceActivity(members=[],nowMs=Date.now()){
  const rows=(Array.isArray(members)?members:[]).map(member=>({member,activity:classifyAllianceMember(member,nowMs)}));
  const counts={active:0,refresh:0,inactive:0,unknown:0};
  for(const row of rows){
    if(row.activity.key==="active")counts.active++;
    else if(row.activity.key==="inactive")counts.inactive++;
    else if(row.activity.key==="unknown"){counts.unknown++;counts.refresh++;}
    else counts.refresh++;
  }
  const roleCounts={R5:0,R4:0,R3:0,R2:0,R1:0};
  for(const row of rows)roleCounts[normalizeAllianceRole(row.member?.role)]++;
  const knownStrong=counts.active+counts.inactive;
  const confidence=rows.length?Math.max(20,Math.min(95,Math.round((knownStrong/rows.length)*70+25))):0;
  return {rows,counts,roleCounts,confidence};
}
