import {rosterNameKey} from './roster-import.js';
import {mergeActivityEvents} from './activity-events.js';

function clean(v,max=120){return String(v??'').trim().slice(0,max)}
function role(v){const r=clean(v,8).toUpperCase();return /^R[1-5]$/.test(r)?r:'R1'}
function when(v){const s=clean(v,40);return Number.isFinite(Date.parse(s))?s:null}
function context(v){return clean(v,24).toUpperCase().replace(/\s+/g,'')}
function historyType(v){const x=clean(v,40);return ['joined','returned','role_changed','review_required','verified_present','left_confirmed'].includes(x)?x:null}

export function rosterLifecycleKey(member={}){
  const name=rosterNameKey(member?.name);if(!name)return '';
  const server=clean(member?.server_id,20).toLowerCase().replace(/\s+/g,'');
  const alliance=context(member?.alliance_tag);
  return `${name}|${server}|${alliance}`;
}

export function normalizeMembershipHistory(rows=[]){
  const out=[];
  for(const raw of Array.isArray(rows)?rows:[]){
    const type=historyType(raw?.type);const at=when(raw?.at);if(!type||!at)continue;
    const item={type,at};
    const from=role(raw?.from_role),to=role(raw?.to_role);
    if(type==='role_changed'&&from!==to){item.from_role=from;item.to_role=to}
    if(raw?.source)item.source=clean(raw.source,40);
    out.push(item);
  }
  const seen=new Set();return out.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).filter(x=>{const k=`${x.type}|${x.at}|${x.from_role||''}|${x.to_role||''}`;if(seen.has(k))return false;seen.add(k);return true}).slice(-40);
}

function addHistory(member,event){
  const eventAt=when(event?.at);const type=historyType(event?.type);if(!eventAt||!type)return member;
  const history=normalizeMembershipHistory([...(member?.membership_history||[]),{...event,type,at:eventAt}]);
  return {...member,membership_history:history};
}

function prepared(raw={},status='active'){
  return {...raw,role:role(raw?.role),membership_status:status,activity_events:mergeActivityEvents(raw?.activity_events),membership_history:normalizeMembershipHistory(raw?.membership_history),joined_at:when(raw?.joined_at),returned_at:when(raw?.returned_at),left_at:when(raw?.left_at),missing_from_snapshot_at:when(raw?.missing_from_snapshot_at)};
}

function mergeMember(oldRaw,incomingRaw,{now,returnKind=null}={}){
  const old=prepared(oldRaw),incoming=prepared(incomingRaw),oldRole=role(old.role),nextRole=role(incoming.role||oldRole);
  let row={...old,...incoming,player_id:old.player_id||incoming.player_id||null,warboost_linked:old.warboost_linked===true||incoming.warboost_linked===true,identity_basis:old.identity_basis||incoming.identity_basis||null,identity_linked_at:old.identity_linked_at||incoming.identity_linked_at||null,activity_events:mergeActivityEvents(old.activity_events,incoming.activity_events),role:nextRole,membership_status:'active',joined_at:old.joined_at||incoming.joined_at||now,returned_at:old.returned_at||incoming.returned_at||null,left_at:null,missing_from_snapshot_at:null,membership_history:normalizeMembershipHistory([...(old.membership_history||[]),...(incoming.membership_history||[])])};
  if(oldRole!==nextRole)row=addHistory(row,{type:'role_changed',at:now,from_role:oldRole,to_role:nextRole,source:'roster_import'});
  if(returnKind==='returned')row=addHistory({...row,returned_at:now},{type:'returned',at:now,source:'roster_import'});
  if(returnKind==='verified_present')row=addHistory(row,{type:'verified_present',at:now,source:'roster_import'});
  return row;
}

function newMember(raw,now){
  let row=prepared({...raw,membership_status:'active',joined_at:raw?.joined_at||now,left_at:null,missing_from_snapshot_at:null},'active');
  row=addHistory(row,{type:'joined',at:now,source:'roster_import'});return row;
}
function dedupeRows(rows=[]){
  const out=[],index=new Map();
  for(const raw of Array.isArray(rows)?rows:[]){const row=prepared(raw,raw?.membership_status||'active'),key=rosterLifecycleKey(row);if(!key)continue;const i=index.get(key);if(i===undefined){index.set(key,out.length);out.push(row)}else out[i]=mergeMember(out[i],row,{now:row.updated_at||new Date().toISOString()})}
  return out;
}
function maps(rows=[]){const m=new Map();rows.forEach((x,i)=>{const k=rosterLifecycleKey(x);if(k&&!m.has(k))m.set(k,i)});return m}
function removeByKey(rows,key){return rows.filter(x=>rosterLifecycleKey(x)!==key)}

export function applyRosterImportLifecycle(current={},importedRows=[],{complete=false,now=new Date().toISOString()}={}){
  let members=dedupeRows(current?.members),review=dedupeRows(current?.review).map(x=>prepared(x,'review')),former=dedupeRows(current?.former).map(x=>prepared(x,'left_confirmed'));
  const imported=dedupeRows(importedRows).map(x=>prepared(x,'active'));
  const summary={imported:imported.length,added:0,returned:0,verified_present:0,role_changed:0,review_required:0,active_count:0,review_count:0,former_count:0,complete:Boolean(complete)};
  const beforeRoles=new Map([...members,...review,...former].map(x=>[rosterLifecycleKey(x),role(x.role)]));

  if(!complete){
    for(const incoming of imported){
      const key=rosterLifecycleKey(incoming);if(!key)continue;
      let idx=maps(members).get(key);
      if(idx!==undefined){members[idx]=mergeMember(members[idx],incoming,{now});continue}
      idx=maps(review).get(key);
      if(idx!==undefined){const old=review[idx];members.push(mergeMember(old,incoming,{now,returnKind:'verified_present'}));review=removeByKey(review,key);summary.verified_present++;continue}
      idx=maps(former).get(key);
      if(idx!==undefined){const old=former[idx];members.push(mergeMember(old,incoming,{now,returnKind:'returned'}));former=removeByKey(former,key);summary.returned++;continue}
      members.push(newMember(incoming,now));summary.added++;
    }
  }else{
    const nextMembers=[];const incomingKeys=new Set();
    const activeMap=maps(members),reviewMap=maps(review),formerMap=maps(former);
    for(const incoming of imported){
      const key=rosterLifecycleKey(incoming);if(!key||incomingKeys.has(key))continue;incomingKeys.add(key);
      let row=null;
      const ai=activeMap.get(key),ri=reviewMap.get(key),fi=formerMap.get(key);
      if(ai!==undefined)row=mergeMember(members[ai],incoming,{now});
      else if(ri!==undefined){row=mergeMember(review[ri],incoming,{now,returnKind:'verified_present'});summary.verified_present++}
      else if(fi!==undefined){row=mergeMember(former[fi],incoming,{now,returnKind:'returned'});summary.returned++}
      else{row=newMember(incoming,now);summary.added++}
      nextMembers.push(row);
    }
    const nextReview=[];
    for(const old of members){const key=rosterLifecycleKey(old);if(!key||incomingKeys.has(key))continue;let row=prepared({...old,membership_status:'review',missing_from_snapshot_at:old.missing_from_snapshot_at||now},'review');const already=(old.membership_history||[]).some(x=>x.type==='review_required'&&x.at===row.missing_from_snapshot_at);if(!already)row=addHistory(row,{type:'review_required',at:now,source:'complete_roster_snapshot'});nextReview.push(row);summary.review_required++}
    for(const old of review){const key=rosterLifecycleKey(old);if(key&&!incomingKeys.has(key)&&!nextReview.some(x=>rosterLifecycleKey(x)===key))nextReview.push(prepared(old,'review'))}
    review=nextReview;
    former=former.filter(x=>!incomingKeys.has(rosterLifecycleKey(x)));
    members=nextMembers;
  }

  const after=[...members,...review,...former];
  for(const row of after){const key=rosterLifecycleKey(row),before=beforeRoles.get(key);if(before&&before!==role(row.role))summary.role_changed++}
  members=dedupeRows(members).map(x=>prepared(x,'active'));
  review=dedupeRows(review).map(x=>prepared(x,'review'));
  former=dedupeRows(former).map(x=>prepared(x,'left_confirmed'));
  summary.active_count=members.length;summary.review_count=review.length;summary.former_count=former.length;
  return {members,review,former,summary};
}

export function confirmRosterDeparture(current={},memberKey,{now=new Date().toISOString()}={}){
  let review=dedupeRows(current?.review).map(x=>prepared(x,'review')),former=dedupeRows(current?.former).map(x=>prepared(x,'left_confirmed'));
  const index=review.findIndex(x=>rosterLifecycleKey(x)===memberKey);if(index<0)return {review,former,changed:false};
  let row=prepared({...review[index],membership_status:'left_confirmed',left_at:now,missing_from_snapshot_at:null},'left_confirmed');row=addHistory(row,{type:'left_confirmed',at:now,source:'r5_r4_confirmation'});
  review.splice(index,1);former=removeByKey(former,memberKey);former.push(row);return {review,former,changed:true,member:row};
}

export function restoreRosterReviewMember(current={},memberKey,{now=new Date().toISOString()}={}){
  let members=dedupeRows(current?.members).map(x=>prepared(x,'active')),review=dedupeRows(current?.review).map(x=>prepared(x,'review'));
  const index=review.findIndex(x=>rosterLifecycleKey(x)===memberKey);if(index<0)return {members,review,changed:false};
  let row=prepared({...review[index],membership_status:'active',missing_from_snapshot_at:null,left_at:null},'active');row=addHistory(row,{type:'verified_present',at:now,source:'r5_r4_confirmation'});
  review.splice(index,1);members=removeByKey(members,memberKey);members.push(row);return {members,review,changed:true,member:row};
}

export function mergeRosterLifecycleMetadata(localRows=[],freshRows=[]){
  const local=dedupeRows(localRows),byKey=maps(local);
  return dedupeRows(freshRows).map(raw=>{
    const key=rosterLifecycleKey(raw),idx=byKey.get(key),old=idx===undefined?null:local[idx];if(!old)return prepared(raw,'active');
    return prepared({...raw,joined_at:old.joined_at||raw.joined_at||null,returned_at:old.returned_at||raw.returned_at||null,membership_history:normalizeMembershipHistory([...(old.membership_history||[]),...(raw.membership_history||[])])},'active');
  });
}

export function rosterLifecycleCounts(alliance={}){return {active:Array.isArray(alliance?.members)?alliance.members.length:0,review:Array.isArray(alliance?.roster_review)?alliance.roster_review.length:0,former:Array.isArray(alliance?.former_members)?alliance.former_members.length:0}}

export function removeActiveRosterMember(current={},memberKey,{now=new Date().toISOString()}={}){
  let members=dedupeRows(current?.members).map(x=>prepared(x,'active')),
      review=dedupeRows(current?.review).map(x=>prepared(x,'review')),
      former=dedupeRows(current?.former).map(x=>prepared(x,'left_confirmed'));
  const index=members.findIndex(x=>rosterLifecycleKey(x)===memberKey);if(index<0)return {members,review,former,changed:false};
  let row=prepared({...members[index],membership_status:'left_confirmed',left_at:now,missing_from_snapshot_at:null},'left_confirmed');
  row=addHistory(row,{type:'left_confirmed',at:now,source:'r5_r4_direct_removal'});
  members.splice(index,1);review=removeByKey(review,memberKey);former=removeByKey(former,memberKey);former.push(row);
  return {members,review,former,changed:true,member:row};
}

export function reinstateFormerRosterMember(current={},memberKey,{now=new Date().toISOString()}={}){
  let members=dedupeRows(current?.members).map(x=>prepared(x,'active')),
      review=dedupeRows(current?.review).map(x=>prepared(x,'review')),
      former=dedupeRows(current?.former).map(x=>prepared(x,'left_confirmed'));
  const index=former.findIndex(x=>rosterLifecycleKey(x)===memberKey);if(index<0)return {members,review,former,changed:false};
  let row=prepared({...former[index],membership_status:'active',returned_at:now,left_at:null,missing_from_snapshot_at:null},'active');
  row=addHistory(row,{type:'returned',at:now,source:'r5_r4_direct_reintegration'});
  former.splice(index,1);review=removeByKey(review,memberKey);members=removeByKey(members,memberKey);members.push(row);
  return {members,review,former,changed:true,member:row};
}

function identityCompatible(a={},b={}){
  const an=rosterNameKey(a?.name),bn=rosterNameKey(b?.name);if(!an||an!==bn)return false;
  const as=clean(a?.server_id,20).toLowerCase().replace(/\s+/g,''),bs=clean(b?.server_id,20).toLowerCase().replace(/\s+/g,'');
  const aa=context(a?.alliance_tag),ba=context(b?.alliance_tag);
  if(as&&bs&&as!==bs)return false;if(aa&&ba&&aa!==ba)return false;return true;
}
// Generic cloud/profile updated_at is NOT membership evidence. Only explicit roster lifecycle timestamps
// may reactivate or block a member; this prevents a stale canonical roster from reviving a removed player.
function activeEvidenceAt(x={}){return Math.max(Date.parse(x?.returned_at||'')||0,Date.parse(x?.joined_at||'')||0)}
function blockingEvidenceAt(x={}){return Math.max(Date.parse(x?.left_at||'')||0,Date.parse(x?.missing_from_snapshot_at||'')||0)}
export function currentActiveRosterMembers(members=[],review=[],former=[]){
  const active=dedupeRows(members).map(x=>prepared(x,'active')).filter(x=>x.membership_status==='active');
  const blockers=[...dedupeRows(review).map(x=>prepared(x,'review')),...dedupeRows(former).map(x=>prepared(x,'left_confirmed'))];
  return active.filter(m=>{
    const aAt=activeEvidenceAt(m);for(const b of blockers){if(!identityCompatible(m,b))continue;const bAt=blockingEvidenceAt(b);if(bAt>=aAt)return false}return true;
  });
}
