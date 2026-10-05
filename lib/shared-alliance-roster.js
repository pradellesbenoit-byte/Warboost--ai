import {mergeActivityEvents} from "./activity-events.js";
import {mergeEventAvailabilities,mergeAvailabilityHistory} from "./event-availability.js";
import {normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag} from "./alliance-identity.js";
import {preferredRenameEvidence} from "./alliance-member-rename.js";
import {isRosterRemovalTombstone} from "./alliance-roster-lifecycle.js";

function clean(v,max=260){return String(v??"").trim().slice(0,max)}
function identityKey(row={},context={}){
  const server=normalizeServerId(row.server_id||context.serverId),tag=normalizeAllianceTag(row.alliance_tag||context.allianceTag),name=normalizeLastWarNickname(row.name,tag);
  if(name)return `${name}|${server}|${tag}`;
  const explicit=clean(row.canonical_member_key);
  return explicit?`canonical:${explicit}`:"";
}
function useful(value){return value!==null&&value!==undefined&&value!==""&&(!Array.isArray(value)||value.length>0)}

// Membership comes from this list only, never from enrichment or account rows.
export function activeCanonicalRoster(rows=[],context={},limit=100){
  const identities=new Set(),canonicalKeys=new Set();
  return (Array.isArray(rows)?rows:[]).filter(row=>{
    if(!row||isRosterRemovalTombstone(row)||row.__warboost_type)return false;
    if(row.membership_status&&row.membership_status!=="active")return false;
    const departed=Math.max(Date.parse(row.left_at)||0,Date.parse(row.missing_from_snapshot_at)||0);
    const presentAt=Math.max(Date.parse(row.joined_at)||0,Date.parse(row.returned_at)||0,Date.parse(row.canonical_presence_at)||0);
    if(departed&&departed>=presentAt)return false;
    if(context.serverId&&normalizeServerId(row.server_id||context.serverId)!==normalizeServerId(context.serverId))return false;
    if(context.allianceTag&&normalizeAllianceTag(row.alliance_tag||context.allianceTag)!==normalizeAllianceTag(context.allianceTag))return false;
    const key=identityKey(row,context),canonical=clean(row.canonical_member_key);
    if(!key||identities.has(key)||(canonical&&canonicalKeys.has(canonical)))return false;
    identities.add(key);if(canonical)canonicalKeys.add(canonical);
    return true;
  }).slice(0,limit).map(row=>({...row}));
}

export function reconcileCanonicalAlliance(base={},incoming={},merged={}){
  const context={serverId:merged.server_id,allianceTag:merged.tag};
  const matches=alliance=>normalizeServerId(alliance.server_id)===normalizeServerId(context.serverId)&&normalizeAllianceTag(alliance.tag)===normalizeAllianceTag(context.allianceTag);
  const candidates=[base,incoming].filter(alliance=>matches(alliance)&&Array.isArray(alliance.canonical_roster));
  candidates.sort((a,b)=>(Date.parse(b.roster_updated_at)||0)-(Date.parse(a.roster_updated_at)||0));
  const authority=candidates[0];
  if(!authority){const out={...merged,members:activeCanonicalRoster(merged.members,context)};delete out.canonical_roster;return out}
  const canonical=activeCanonicalRoster(authority.canonical_roster,context);
  return {...merged,canonical_roster:canonical,roster_updated_at:authority.roster_updated_at||null,members:mergeSharedAllianceRoster(canonical,merged.members,context)};
}

export function mergeSharedAllianceRoster(sharedRows=[],localRows=[],context={}){
  const shared=activeCanonicalRoster(sharedRows,context),local=activeCanonicalRoster(localRows,context,Infinity),byKey=new Map();
  for(const row of local){
    if(row.canonical_member_key)byKey.set(`key:${row.canonical_member_key}`,row);
    const key=identityKey(row,context);if(key){if(byKey.has(key))byKey.set(key,null);else byKey.set(key,row)}
  }
  return shared.map(raw=>{
    const key=identityKey(raw,context),personal=byKey.get(`key:${raw.canonical_member_key}`)||(byKey.has(key)?byKey.get(key):null),base={...raw};
    if(!personal)return base;
    const merged={...personal,...base};
    for(const field of ["hq_level","power_m","squad_power_m","squad_id","squad_type","squad_heroes","squad_profile_updated_at","drone_level","drone_power_m","squad_power_updated_at","vs_points","season_points","contribution","last_active_at"]){
      if(!useful(base[field])&&useful(personal[field]))merged[field]=personal[field];
    }
    merged.player_id=clean(base.player_id,120)||clean(personal.player_id,120)||null;
    merged.warboost_linked=base.warboost_linked===true||personal.warboost_linked===true;
    merged.identity_basis=base.identity_basis||personal.identity_basis||null;
    merged.identity_linked_at=base.identity_linked_at||personal.identity_linked_at||null;
    merged.activity_events=mergeActivityEvents(base.activity_events,personal.activity_events);
    merged.event_availability=mergeEventAvailabilities(base.event_availability,personal.event_availability);
    merged.availability_history=mergeAvailabilityHistory(base.availability_history,personal.availability_history);
    for(const field of ["membership_status","joined_at","returned_at","left_at","missing_from_snapshot_at","canonical_presence_at","membership_history"])merged[field]=base[field];
    return {...merged,...preferredRenameEvidence(personal,base)};
  });
}