import {rosterNameKey} from './roster-import.js';
import {mergeActivityEvents} from './activity-events.js';
import {preferredRankEvidence,rankConfirmationStatus} from './rank-provenance.js';
import {alignRenamedRosterRows} from './alliance-member-rename.js';

function clean(v,max=120){return String(v??'').trim().slice(0,max)}
function role(v){const r=clean(v,8).toUpperCase();return /^R[1-5]$/.test(r)?r:null}
function when(v){const s=clean(v,40);return Number.isFinite(Date.parse(s))?s:null}
function context(v){return clean(v,24).toUpperCase().replace(/\s+/g,'')}
function historyType(v){const x=clean(v,40);return ['joined','returned','role_changed','review_required','verified_present','left_confirmed'].includes(x)?x:null}
function powerValue(v){const n=Number(v);return Number.isFinite(n)&&n>0?Math.round(n*100)/100:null}
export const ROSTER_REMOVAL_TOMBSTONE="roster_removal_tombstone";
export function isRosterRemovalTombstone(row={}){return row?.__warboost_type===ROSTER_REMOVAL_TOMBSTONE||row?.roster_removal_tombstone===true}
function tombstoneKey(row={}){return clean(row?.key||row?.canonical_member_key,260)||rosterLifecycleKey(row)}
function departureHistory(raw={}){
  const source=raw?.history&&typeof raw.history==="object"?raw.history:{};
  const activity_events=mergeActivityEvents(source.activity_events,raw?.activity_events).slice(0,120);
  const membership_history=normalizeMembershipHistory([...(Array.isArray(source.membership_history)?source.membership_history:[]),...(Array.isArray(raw?.membership_history)?raw.membership_history:[])]);
  const history={};if(activity_events.length)history.activity_events=activity_events;if(membership_history.length)history.membership_history=membership_history;
  return history;
}
function canonicalTombstoneKey(key){return String(key||"").startsWith("canonical:")}
function mergeTombstones(a,b){
  const aRemoved=Date.parse(a.removed_at)||0,bRemoved=Date.parse(b.removed_at)||0,removed_at=aRemoved>=bRemoved?a.removed_at:b.removed_at;
  const rejoined_at=[a.rejoined_at,b.rejoined_at].filter(x=>Date.parse(x||"")>Date.parse(removed_at||"")).sort((x,y)=>Date.parse(x)-Date.parse(y)).at(-1)||null;
  const latest=bRemoved>=aRemoved?b:a,history=departureHistory({history:{
    activity_events:mergeActivityEvents(a.history?.activity_events,b.history?.activity_events),
    membership_history:[...(a.history?.membership_history||[]),...(b.history?.membership_history||[])]
  }});
  const key=canonicalTombstoneKey(a.key)?a.key:canonicalTombstoneKey(b.key)?b.key:latest.key;
  return {key,name:latest.name||a.name||b.name,server_id:latest.server_id||a.server_id||b.server_id,alliance_tag:latest.alliance_tag||a.alliance_tag||b.alliance_tag,removed_at,rejoined_at,...(Object.keys(history).length?{history}:{})};
}
export function normalizeRosterRemovalTombstones(rows=[]){
  const out=[],indices=new Map();
  for(const raw of Array.isArray(rows)?rows:[]){
    const key=tombstoneKey(raw),removed_at=when(raw?.removed_at||raw?.left_at||raw?.missing_from_snapshot_at);
    if(!key||!removed_at)continue;
    const history=departureHistory(raw),candidate={key,name:clean(raw?.name,80),server_id:clean(raw?.server_id,20),alliance_tag:context(raw?.alliance_tag),removed_at,rejoined_at:when(raw?.rejoined_at),...(Object.keys(history).length?{history}:{})};
    const identity=rosterLifecycleKey(candidate),index=indices.get(key)??(identity?indices.get(identity):undefined);
    if(index!==undefined)out[index]=mergeTombstones(out[index],candidate);
    else out.push(candidate);
    const savedIndex=index===undefined?out.length-1:index,saved=out[savedIndex],savedIdentity=rosterLifecycleKey(saved);
    indices.set(saved.key,savedIndex);if(savedIdentity)indices.set(savedIdentity,savedIndex);
  }
  return out.slice(-300);
}
export function extractRosterRemovalTombstones(rows=[]){return normalizeRosterRemovalTombstones((Array.isArray(rows)?rows:[]).filter(isRosterRemovalTombstone))}
export function rosterRemovalTombstoneRow(raw={}){
  const t=normalizeRosterRemovalTombstones([raw])[0];if(!t)return null;
  return {__warboost_type:ROSTER_REMOVAL_TOMBSTONE,canonical_member_key:t.key,key:t.key,name:t.name,server_id:t.server_id,alliance_tag:t.alliance_tag,removed_at:t.removed_at,rejoined_at:t.rejoined_at||null,...(t.history?{history:t.history}:{})};
}
export function rosterRemovalTombstoneBlocksMember(row,tombstone){
  if(!tombstone)return false;
  const membershipEvidence=Math.max(Date.parse(row?.joined_at||'')||0,Date.parse(row?.returned_at||'')||0,Date.parse(row?.canonical_presence_at||'')||0),removed=Date.parse(tombstone.removed_at||'')||0;
  return !membershipEvidence||membershipEvidence<=removed;
}
export function rosterRemovalTombstoneForMember(member,tombstones=[]){
  const lifecycleKey=rosterLifecycleKey(member),canonicalKey=clean(member?.canonical_member_key,260);
  if(!lifecycleKey&&!canonicalKey)return null;
  for(const raw of Array.isArray(tombstones)?tombstones:[]){
    const t=normalizeRosterRemovalTombstones([raw])[0];if(!t)continue;
    if(t.key===lifecycleKey||t.key===canonicalKey||(lifecycleKey&&rosterLifecycleKey(t)===lifecycleKey))return t;
  }
  return null;
}
function tombstoneAliasMap(tombstones=[]){
  const map=new Map();for(const t of tombstones){map.set(t.key,t);const identity=rosterLifecycleKey(t);if(identity)map.set(identity,t)}return map;
}
function resetForRejoin(raw={},now){
  const {activity_events,event_availability,availability_history,membership_history,power_history,player_id,warboost_linked,identity_basis,identity_linked_at,management_role,joined_at,returned_at,left_at,missing_from_snapshot_at,...safe}=raw;
  return newMember({...safe,player_id:null,warboost_linked:false,identity_basis:null,identity_linked_at:null,management_role:null,membership_history:[],activity_events:[],event_availability:[],availability_history:[],power_history:[],joined_at:now,returned_at:null,left_at:null,missing_from_snapshot_at:null},now);
}
export function normalizeRosterPowerHistory(rows=[]){const out=[];for(const raw of Array.isArray(rows)?rows:[]){const at=when(raw?.at),power_m=powerValue(raw?.power_m);if(!at||power_m===null)continue;out.push({at,power_m,source:clean(raw?.source,40)||'roster'})}const seen=new Set();return out.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).filter(x=>{const k=`${x.at}|${x.power_m}`;if(seen.has(k))return false;seen.add(k);return true}).slice(-80)}
function addPowerObservation(history,power_m,at,source){const p=powerValue(power_m),stamp=when(at);if(p===null||!stamp)return normalizeRosterPowerHistory(history);return normalizeRosterPowerHistory([...(history||[]),{at:stamp,power_m:p,source:source||'roster_import'}])}

export function rosterLifecycleKey(member={}){
  if(member?.name_confirmed_at&&member?.identity_lifecycle_key)return String(member.identity_lifecycle_key);
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
  return {...raw,role:role(raw?.role),membership_status:status,activity_events:mergeActivityEvents(raw?.activity_events),membership_history:normalizeMembershipHistory(raw?.membership_history),power_history:normalizeRosterPowerHistory(raw?.power_history),joined_at:when(raw?.joined_at),returned_at:when(raw?.returned_at),left_at:when(raw?.left_at),missing_from_snapshot_at:when(raw?.missing_from_snapshot_at)};
}

function mergeMember(oldRaw,incomingRaw,{now,returnKind=null}={}){
  const old=prepared(oldRaw),incoming=prepared(incomingRaw),oldRole=role(old.role),nextRole=role(incoming.role||oldRole);
  const rankWinner=preferredRankEvidence(old,incoming);
  const authoritativeRole=rankWinner?.rank_confirmed_at?role(rankWinner.role):nextRole;
  let powerHistory=normalizeRosterPowerHistory([...(old.power_history||[]),...(incoming.power_history||[])]);
  powerHistory=addPowerObservation(powerHistory,old.power_m,old.updated_at||old.imported_at||old.joined_at||now,old.source||'existing_roster');
  powerHistory=addPowerObservation(powerHistory,incoming.power_m,incoming.updated_at||incoming.imported_at||now,incoming.source||'roster_import');
  let row={...old,...incoming,player_id:old.player_id||incoming.player_id||null,warboost_linked:old.warboost_linked===true||incoming.warboost_linked===true,identity_basis:old.identity_basis||incoming.identity_basis||null,identity_linked_at:old.identity_linked_at||incoming.identity_linked_at||null,activity_events:mergeActivityEvents(old.activity_events,incoming.activity_events),power_history:powerHistory,role:authoritativeRole,rank_confirmed_at:rankWinner?.rank_confirmed_at||null,rank_confirmed_source:rankWinner?.rank_confirmed_source||null,rank_confirmation_status:rankConfirmationStatus(rankWinner),membership_status:'active',joined_at:old.joined_at||incoming.joined_at||now,returned_at:old.returned_at||incoming.returned_at||null,left_at:null,missing_from_snapshot_at:null,membership_history:normalizeMembershipHistory([...(old.membership_history||[]),...(incoming.membership_history||[])])};
  if(oldRole!==authoritativeRole)row=addHistory(row,{type:'role_changed',at:row.rank_confirmed_at||now,from_role:oldRole,to_role:authoritativeRole,source:row.rank_confirmed_source||'roster_import'});
  if(returnKind==='returned')row=addHistory({...row,returned_at:now},{type:'returned',at:now,source:'roster_import'});
  if(returnKind==='verified_present')row=addHistory(row,{type:'verified_present',at:now,source:'roster_import'});
  return row;
}

function newMember(raw,now){
  let row=prepared({...raw,membership_status:'active',joined_at:raw?.joined_at||now,left_at:null,missing_from_snapshot_at:null},'active');
  row={...row,power_history:addPowerObservation(row.power_history,row.power_m,row.updated_at||row.imported_at||now,row.source||'roster_import')};
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
  importedRows=alignRenamedRosterRows(importedRows,[...(current.members||[]),...(current.review||[])]);
  let tombstones=normalizeRosterRemovalTombstones([...(current?.removal_tombstones||[]),...(current?.former||[])]);
  const tombstoneMap=tombstoneAliasMap(tombstones);
  let members=dedupeRows(current?.members).filter(x=>!rosterRemovalTombstoneBlocksMember(x,tombstoneMap.get(rosterLifecycleKey(x)))),
      review=dedupeRows(current?.review).map(x=>prepared(x,'review')).filter(x=>!rosterRemovalTombstoneBlocksMember(x,tombstoneMap.get(rosterLifecycleKey(x)))),
      former=[];
  const rawImported=dedupeRows(importedRows).map(x=>prepared(x,'active'));
  const imported=rawImported.filter(incoming=>{
    const t=tombstoneMap.get(rosterLifecycleKey(incoming));if(!t)return true;
    const proofAt=Math.max(Date.parse(incoming.joined_at||'')||0,Date.parse(incoming.returned_at||'')||0,Date.parse(incoming.canonical_presence_at||'')||0,complete?(Date.parse(now)||0):0);
    const allowed=proofAt>Date.parse(t.removed_at);
    if(!allowed)return false;
    t.rejoined_at=now;
    return true;
  });
  const summary={imported:imported.length,added:0,returned:0,rejoined:0,verified_present:0,role_changed:0,review_required:0,active_count:0,review_count:0,former_count:0,complete:Boolean(complete)};
  const beforeRoles=new Map([...members,...review].map(x=>[rosterLifecycleKey(x),role(x.role)]));

  if(!complete){
    for(const incoming of imported){
      const key=rosterLifecycleKey(incoming);if(!key)continue;
       const removed=tombstoneMap.get(key);
       let idx=maps(members).get(key);
       if(removed&&removed.rejoined_at&&!idx){
         members.push(resetForRejoin(incoming,now));summary.added++;summary.rejoined++;continue;
       }
      if(idx!==undefined){members[idx]=mergeMember(members[idx],incoming,{now});continue}
      idx=maps(review).get(key);
      if(idx!==undefined){const old=review[idx];members.push(mergeMember(old,incoming,{now,returnKind:'verified_present'}));review=removeByKey(review,key);summary.verified_present++;continue}
      members.push(newMember(incoming,now));summary.added++;
    }
  }else{
    const nextMembers=[];const incomingKeys=new Set();
     const activeMap=maps(members),reviewMap=maps(review);
    for(const incoming of imported){
      const key=rosterLifecycleKey(incoming);if(!key||incomingKeys.has(key))continue;incomingKeys.add(key);
      let row=null;
       const ai=activeMap.get(key),ri=reviewMap.get(key),fi=undefined;
      if(ai!==undefined)row=mergeMember(members[ai],incoming,{now});
      else if(ri!==undefined){row=mergeMember(review[ri],incoming,{now,returnKind:'verified_present'});summary.verified_present++}
       else if(tombstoneMap.has(key)){row=resetForRejoin(incoming,now);summary.added++;summary.rejoined++}
      else{row=newMember(incoming,now);summary.added++}
      nextMembers.push(row);
    }
    const nextReview=[];
    for(const old of members){const key=rosterLifecycleKey(old);if(!key||incomingKeys.has(key))continue;let row=prepared({...old,membership_status:'review',missing_from_snapshot_at:old.missing_from_snapshot_at||now},'review');const already=(old.membership_history||[]).some(x=>x.type==='review_required'&&x.at===row.missing_from_snapshot_at);if(!already)row=addHistory(row,{type:'review_required',at:now,source:'complete_roster_snapshot'});nextReview.push(row);summary.review_required++}
    for(const old of review){const key=rosterLifecycleKey(old);if(key&&!incomingKeys.has(key)&&!nextReview.some(x=>rosterLifecycleKey(x)===key))nextReview.push(prepared(old,'review'))}
    review=nextReview;
    members=nextMembers;
  }

   const after=[...members,...review];
  for(const row of after){const key=rosterLifecycleKey(row),before=beforeRoles.get(key);if(before&&before!==role(row.role))summary.role_changed++}
  members=dedupeRows(members).map(x=>prepared(x,'active'));
  review=dedupeRows(review).map(x=>prepared(x,'review'));
   summary.active_count=members.length;summary.review_count=review.length;summary.former_count=0;
   return {members,review,former:[],removal_tombstones:tombstones,summary};
}

export function confirmRosterDeparture(current={},memberKey,{now=new Date().toISOString()}={}){
  let review=dedupeRows(current?.review).map(x=>prepared(x,'review')),tombstones=normalizeRosterRemovalTombstones([...(current?.removal_tombstones||[]),...(current?.former||[])]);
  const index=review.findIndex(x=>rosterLifecycleKey(x)===memberKey||x.canonical_member_key===memberKey);if(index<0)return {review,former:[],removal_tombstones:tombstones,changed:false};
  const row=review[index],previous=rosterRemovalTombstoneForMember(row,tombstones),history=departureHistory({
    history:previous?.history,
    activity_events:row.activity_events,
    membership_history:[...(previous?.history?.membership_history||[]),...(row.membership_history||[]),{type:'left_confirmed',at:now,source:'r5_r4_confirmation'}]
  });
  review.splice(index,1);tombstones=normalizeRosterRemovalTombstones([...tombstones,{...row,key:memberKey,removed_at:now,rejoined_at:null,history}]);
  const member=rosterRemovalTombstoneForMember(row,tombstones);return {review,former:[],removal_tombstones:tombstones,changed:true,member};
}

export function restoreRosterReviewMember(current={},memberKey,{now=new Date().toISOString()}={}){
  let members=dedupeRows(current?.members).map(x=>prepared(x,'active')),review=dedupeRows(current?.review).map(x=>prepared(x,'review'));
  const index=review.findIndex(x=>rosterLifecycleKey(x)===memberKey);if(index<0)return {members,review,changed:false};
  let row=prepared({...review[index],membership_status:'active',missing_from_snapshot_at:null,left_at:null},'active');row=addHistory(row,{type:'verified_present',at:now,source:'r5_r4_confirmation'});
  review.splice(index,1);members=removeByKey(members,memberKey);members.push(row);return {members,review,changed:true,member:row};
}

export function mergeRosterLifecycleMetadata(localRows=[],freshRows=[],{removal_tombstones=[]}={}){
  const tombstones=normalizeRosterRemovalTombstones(removal_tombstones),tombstoneMap=tombstoneAliasMap(tombstones);
  const local=dedupeRows(localRows).filter(x=>!rosterRemovalTombstoneBlocksMember(x,tombstoneMap.get(rosterLifecycleKey(x)))),byKey=maps(local);
  const fresh=dedupeRows(freshRows).filter(x=>{
    const t=tombstoneMap.get(rosterLifecycleKey(x));return !rosterRemovalTombstoneBlocksMember(x,t);
  }),freshKeys=new Set(fresh.map(rosterLifecycleKey));
  const merged=fresh.map(raw=>{
    const key=rosterLifecycleKey(raw),t=tombstoneMap.get(key),idx=byKey.get(key),old=idx===undefined?null:local[idx];
    if(t&&(!old||rosterRemovalTombstoneBlocksMember(old,t))){
      const rejoinedAt=[t.rejoined_at,raw.joined_at,raw.returned_at].filter(x=>Date.parse(x||"")).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)||new Date().toISOString();
      return resetForRejoin(raw,rejoinedAt);
    }
    if(!old)return prepared(raw,'active');
    const rankWinner=preferredRankEvidence(old,raw);
    const authoritativeRole=rankWinner?.rank_confirmed_at?role(rankWinner.role):role(raw.role||old.role);
    return prepared({...old,...raw,player_id:old.player_id||raw.player_id||null,warboost_linked:old.warboost_linked===true||raw.warboost_linked===true,identity_basis:old.identity_basis||raw.identity_basis||null,identity_linked_at:old.identity_linked_at||raw.identity_linked_at||null,activity_events:mergeActivityEvents(old.activity_events,raw.activity_events),role:authoritativeRole,rank_confirmed_at:rankWinner?.rank_confirmed_at||null,rank_confirmed_source:rankWinner?.rank_confirmed_source||null,joined_at:old.joined_at||raw.joined_at||null,returned_at:old.returned_at||raw.returned_at||null,membership_history:normalizeMembershipHistory([...(old.membership_history||[]),...(raw.membership_history||[])])},'active');
  });
  const localOnly=local.filter(row=>!freshKeys.has(rosterLifecycleKey(row))).map(row=>prepared(row,'active'));
  return merged.concat(localOnly);
}

// A canonical roster response can be structurally valid while omitting the last
// locally verified R5 (for example during a partial import). Keep that member in
// the client/server state until a later roster response explicitly includes R5.
export function preserveVerifiedR5(localRows=[],freshRows=[],{removal_tombstones=[]}={}){
  const tombstones=normalizeRosterRemovalTombstones(removal_tombstones),tombstoneMap=tombstoneAliasMap(tombstones),local=dedupeRows(localRows).map(x=>prepared(x,'active')).filter(x=>!rosterRemovalTombstoneBlocksMember(x,tombstoneMap.get(rosterLifecycleKey(x))));
  const fresh=dedupeRows(freshRows).map(x=>prepared(x,'active')).filter(x=>!rosterRemovalTombstoneBlocksMember(x,tombstoneMap.get(rosterLifecycleKey(x))));
  if(fresh.some(x=>String(x?.role||'').toUpperCase()==='R5'))return {rows:fresh,preserved:false};
  const verified=local.filter(x=>x.membership_status==='active'&&String(x?.role||'').toUpperCase()==='R5');
  if(!verified.length)return {rows:fresh,preserved:false};
  const keys=new Set(fresh.map(rosterLifecycleKey));
  return {rows:dedupeRows([...fresh,...verified.filter(x=>!keys.has(rosterLifecycleKey(x)))].map(x=>prepared(x,'active'))),preserved:true};
}

export function rosterLifecycleCounts(alliance={}){return {active:Array.isArray(alliance?.members)?alliance.members.length:0,review:Array.isArray(alliance?.roster_review)?alliance.roster_review.length:0,former:Array.isArray(alliance?.former_members)?alliance.former_members.length:0}}

export function removeActiveRosterMember(current={},memberKey,{now=new Date().toISOString()}={}){
  let members=dedupeRows(current?.members).map(x=>prepared(x,'active')),
      review=dedupeRows(current?.review).map(x=>prepared(x,'review')),
      tombstones=normalizeRosterRemovalTombstones([...(current?.removal_tombstones||[]),...(current?.former||[])]);
  const index=members.findIndex(x=>rosterLifecycleKey(x)===memberKey||x.canonical_member_key===memberKey);if(index<0)return {members,review,former:[],removal_tombstones:tombstones,changed:false};
  const row=members[index],previous=rosterRemovalTombstoneForMember(row,tombstones),history=departureHistory({
    history:previous?.history,
    activity_events:row.activity_events,
    membership_history:[...(previous?.history?.membership_history||[]),...(row.membership_history||[]),{type:'left_confirmed',at:now,source:'r5_r4_direct_removal'}]
  });
  members.splice(index,1);review=removeByKey(review,rosterLifecycleKey(row));tombstones=normalizeRosterRemovalTombstones([...tombstones,{...row,key:memberKey,removed_at:now,rejoined_at:null,history}]);
  const member=rosterRemovalTombstoneForMember(row,tombstones);return {members,review,former:[],removal_tombstones:tombstones,changed:true,member};
}

export function reinstateFormerRosterMember(current={},memberKey,{now=new Date().toISOString()}={}){
  return {members:dedupeRows(current?.members).map(x=>prepared(x,'active')),review:dedupeRows(current?.review).map(x=>prepared(x,'review')),former:[],removal_tombstones:normalizeRosterRemovalTombstones([...(current?.removal_tombstones||[]),...(current?.former||[])]),changed:false};
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
export function markCanonicalRosterPresence(rows=[],snapshotAt=null){
  const fallback=when(snapshotAt);
  return (Array.isArray(rows)?rows:[]).map(raw=>{
    const presence=fallback||when(raw?.canonical_presence_at)||when(raw?.updated_at)||when(raw?.imported_at);
    return presence?{...raw,canonical_presence_at:presence}:raw;
  });
}
export function currentActiveRosterMembers(members=[],review=[],former=[],removal_tombstones=[]){
  const tombstones=normalizeRosterRemovalTombstones([...(Array.isArray(removal_tombstones)?removal_tombstones:[]),...(Array.isArray(former)?former:[])]);
  const tombstoneMap=tombstoneAliasMap(tombstones),active=dedupeRows(members).map(x=>prepared(x,'active')).filter(x=>x.membership_status==='active'&&!rosterRemovalTombstoneBlocksMember(x,tombstoneMap.get(rosterLifecycleKey(x))));
  const blockers=dedupeRows(review).map(x=>prepared(x,'review'));
  return active.filter(m=>{
    const aAt=Math.max(activeEvidenceAt(m),Date.parse(m?.canonical_presence_at||'')||0);
    for(const b of blockers){if(!identityCompatible(m,b))continue;const bAt=blockingEvidenceAt(b);if(bAt>aAt)return false}
    return true;
  });
}
