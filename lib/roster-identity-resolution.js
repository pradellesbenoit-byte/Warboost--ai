import {rosterNameKey} from './roster-import.js';

function clean(v,max=120){return String(v??'').replace(/\u00a0/g,' ').trim().slice(0,max)}
function role(v){const r=clean(v,8).toUpperCase();return /^R[1-5]$/.test(r)?r:null}
function context(v){return clean(v,32).toUpperCase().replace(/\s+/g,'')}
function server(v){return clean(v,24).toLowerCase().replace(/\s+/g,'')}
function escRe(v){return String(v||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function typography(v){return clean(v,120).replace(/[’‘`´]/g,"'").replace(/[‐‑‒–—]/g,'-').replace(/\s+/g,' ').trim()}

/**
 * Last War can render the alliance tag before a nickname, e.g. [ALL4]Player.
 * Only a BRACKETED prefix equal to the known alliance tag is removed. A bare
 * token inside the nickname (e.g. "xXx Kaufik ALL4 xXx") is never removed.
 */
export function cleanRosterOcrName(value,allianceTag=''){
  let out=typography(value);const tag=context(allianceTag);if(!out||!tag)return out;
  const tagPattern=escRe(tag).replace(/\\ /g,'\\s*');
  const wrappers=[
    new RegExp(`^\\s*\\[\\s*${tagPattern}\\s*\\]\\s*`,'i'),
    new RegExp(`^\\s*【\\s*${tagPattern}\\s*】\\s*`,'i'),
    new RegExp(`^\\s*［\\s*${tagPattern}\\s*］\\s*`,'i')
  ];
  let changed=true;while(changed){changed=false;for(const re of wrappers){const next=out.replace(re,'').trim();if(next!==out){out=next;changed=true}}}
  return typography(out);
}

export function rosterIdentityKey(name,allianceTag=''){
  return rosterNameKey(cleanRosterOcrName(name,allianceTag)).replace(/[’‘`´]/g,"'").replace(/[‐‑‒–—]/g,'-');
}
function compactName(name,allianceTag=''){
  return rosterIdentityKey(name,allianceTag).replace(/[^\p{L}\p{N}]+/gu,'');
}
function levenshtein(a,b){
  const x=String(a||''),y=String(b||'');if(x===y)return 0;if(!x.length)return y.length;if(!y.length)return x.length;
  let prev=Array.from({length:y.length+1},(_,i)=>i),cur=new Array(y.length+1);
  for(let i=1;i<=x.length;i++){cur[0]=i;for(let j=1;j<=y.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));[prev,cur]=[cur,prev]}
  return prev[y.length];
}
export function rosterNameSimilarity(a,b,allianceTag=''){
  const x=compactName(a,allianceTag),y=compactName(b,allianceTag);if(!x||!y)return 0;if(x===y)return 1;
  return Math.max(0,1-levenshtein(x,y)/Math.max(x.length,y.length));
}
function contextCompatible(candidate={},ctx={}){
  const cs=server(candidate.server_id),xs=server(ctx.server_id),ca=context(candidate.alliance_tag),xa=context(ctx.alliance_tag);
  if(cs&&xs&&cs!==xs)return false;if(ca&&xa&&ca!==xa)return false;return true;
}
function evidence(candidate,row,ctx){
  const sim=rosterNameSimilarity(row?.name,candidate?.name,ctx.alliance_tag),a=compactName(row?.name,ctx.alliance_tag),b=compactName(candidate?.name,ctx.alliance_tag);
  const min=Math.min(a.length,b.length),max=Math.max(a.length,b.length),prefix=Boolean(min>=4&&(a.startsWith(b)||b.startsWith(a))),prefixRatio=max?min/max:0;
  const sameRole=Boolean(role(row?.role)&&role(candidate?.role)&&role(row.role)===role(candidate.role));
  const rh=Number(row?.hq_level),ch=Number(candidate?.hq_level),sameHq=Number.isFinite(rh)&&Number.isFinite(ch)&&rh>0&&ch>0&&Math.round(rh)===Math.round(ch);
  // Power is intentionally absent: progression must never change identity.
  const plausible=sim>=0.78||(prefix&&min>=7&&prefixRatio>=0.62)||(sim>=0.64&&sameRole&&sameHq&&min>=4);
  return {similarity:Math.round(sim*1000)/1000,prefix,prefix_ratio:Math.round(prefixRatio*1000)/1000,same_role:sameRole,same_hq:sameHq,plausible};
}
function sourceRank(s){return s==='active'?3:s==='review'?2:s==='former'?1:0}
function collectCandidates(current={}){
  const rows=[];for(const [source,list] of [['active',current.members],['review',current.review],['former',current.former]])for(const member of Array.isArray(list)?list:[])if(member?.name)rows.push({source,member});
  return rows;
}
function exactResolution(row,candidates,ctx){
  const key=rosterIdentityKey(row?.name,ctx.alliance_tag);if(!key)return [];
  return candidates.filter(x=>contextCompatible(x.member,ctx)&&rosterIdentityKey(x.member?.name,ctx.alliance_tag)===key).sort((a,b)=>sourceRank(b.source)-sourceRank(a.source));
}
function statusForSource(source){return source==='former'?'former':source==='review'?'review':'existing'}
function matchedResult(row,hit,ctx){
  const m=hit.member;return {...row,detected_name:row.detected_name||cleanRosterOcrName(row.name,ctx.alliance_tag),name:m.name,identity_status:statusForSource(hit.source),identity_match:'exact',identity_needs_confirmation:false,matched_name:m.name,matched_source:hit.source,matched_lifecycle_key:m.lifecycle_key||null,matched_player_id:m.player_id||null,previous_power_m:Number.isFinite(Number(m.power_m))?Number(m.power_m):null,previous_hq_level:Number.isFinite(Number(m.hq_level))?Number(m.hq_level):null,previous_role:role(m.role)};
}

/** Resolve a scanned row against known members without ever using power as identity. */
export function resolveRosterScanIdentity(rawRow,current={},ctx={}){
  const cleaned=cleanRosterOcrName(rawRow?.name,ctx.alliance_tag),row={...rawRow,name:cleaned,detected_name:cleaned};
  if(!cleaned)return {...row,identity_status:'invalid',identity_needs_confirmation:true,identity_match:'none'};
  const candidates=collectCandidates(current).filter(x=>contextCompatible(x.member,ctx));
  const exact=exactResolution(row,candidates,ctx);
  if(exact.length===1)return matchedResult(row,exact[0],ctx);
  if(exact.length>1){
    // Prefer a single currently-active copy only; otherwise force review.
    const active=exact.filter(x=>x.source==='active');if(active.length===1)return matchedResult(row,active[0],ctx);
    return {...row,identity_status:'ambiguous',identity_needs_confirmation:true,identity_match:'exact_ambiguous',identity_candidates:exact.slice(0,5).map(x=>({name:x.member.name,source:x.source,similarity:1}))};
  }
  const scored=candidates.map(x=>({...x,e:evidence(x.member,row,ctx)})).filter(x=>x.e.plausible).sort((a,b)=>b.e.similarity-a.e.similarity||Number(b.e.same_role)-Number(a.e.same_role)||Number(b.e.same_hq)-Number(a.e.same_hq)||sourceRank(b.source)-sourceRank(a.source));
  if(scored.length){
    const top=scored[0],second=scored[1],clear=!second||top.e.similarity-second.e.similarity>=0.08||((top.e.same_role&&top.e.same_hq)&&!(second.e.same_role&&second.e.same_hq));
    if(clear)return {...row,identity_status:'possible',identity_needs_confirmation:true,identity_match:'fuzzy_suggestion',possible_match:{name:top.member.name,source:top.source,similarity:top.e.similarity,lifecycle_key:top.member.lifecycle_key||null,player_id:top.member.player_id||null,previous_power_m:Number.isFinite(Number(top.member.power_m))?Number(top.member.power_m):null,previous_hq_level:Number.isFinite(Number(top.member.hq_level))?Number(top.member.hq_level):null,previous_role:role(top.member.role)},identity_candidates:scored.slice(0,3).map(x=>({name:x.member.name,source:x.source,similarity:x.e.similarity}))};
    return {...row,identity_status:'ambiguous',identity_needs_confirmation:true,identity_match:'fuzzy_ambiguous',identity_candidates:scored.slice(0,5).map(x=>({name:x.member.name,source:x.source,similarity:x.e.similarity}))};
  }
  return {...row,identity_status:'new',identity_needs_confirmation:false,identity_match:'none'};
}

export function resolveRosterScanRows(rows=[],current={},ctx={}){
  return (Array.isArray(rows)?rows:[]).map(row=>resolveRosterScanIdentity(row,current,ctx));
}

export function confirmRosterScanPossibleMatch(row,current={},ctx={}){
  if(row?.identity_status!=='possible'||!row?.possible_match?.name)return row;
  const targetName=row.possible_match.name,candidates=collectCandidates(current).filter(x=>contextCompatible(x.member,ctx)&&rosterIdentityKey(x.member.name,ctx.alliance_tag)===rosterIdentityKey(targetName,ctx.alliance_tag));
  if(candidates.length!==1)return {...row,identity_status:'ambiguous',identity_needs_confirmation:true};
  return matchedResult({...row,name:targetName,detected_name:row.detected_name||row.name},candidates[0],ctx);
}

export function rosterScanHasUnresolvedIdentity(rows=[]){return (Array.isArray(rows)?rows:[]).some(r=>r?.identity_needs_confirmation===true||['ambiguous','invalid','possible'].includes(r?.identity_status))}
