import {mergeActivityEvents} from "./activity-events.js";
import {mergeEventAvailabilities,mergeAvailabilityHistory} from "./event-availability.js";
import {normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag} from "./alliance-identity.js";

function clean(v,max=260){return String(v??"").trim().slice(0,max)}
function identityKey(row={},context={}){
  const server=normalizeServerId(row.server_id||context.serverId),tag=normalizeAllianceTag(row.alliance_tag||context.allianceTag),name=normalizeLastWarNickname(row.name,tag);
  if(name&&server&&tag)return `${name}|${server}|${tag}`;
  const explicit=clean(row.canonical_member_key);
  return explicit?`canonical:${explicit}`:"";
}
function useful(value){return value!==null&&value!==undefined&&value!==""&&(!Array.isArray(value)||value.length>0)}

export function mergeSharedAllianceRoster(sharedRows=[],localRows=[],context={}){
  const shared=Array.isArray(sharedRows)?sharedRows:[],local=Array.isArray(localRows)?localRows:[],byKey=new Map(),byPlayer=new Map();
  for(const row of local){
    const key=identityKey(row,context);if(key){if(byKey.has(key))byKey.set(key,null);else byKey.set(key,row)}
    const playerId=clean(row?.player_id,120);if(playerId&&!byPlayer.has(playerId))byPlayer.set(playerId,row);
  }
  return shared.map(raw=>{
    const key=identityKey(raw,context),playerId=clean(raw?.player_id,120),personal=(byKey.has(key)?byKey.get(key):null)||byPlayer.get(playerId),base={...raw};
    if(!personal)return base;
    const merged={...personal,...base};
    for(const field of ["hq_level","power_m","squad_power_m","squad_id","squad_type","squad_heroes","squad_profile_updated_at","drone_level","drone_power_m","squad_power_updated_at","vs_points","season_points","contribution","last_active_at","joined_at","returned_at","left_at","missing_from_snapshot_at","membership_history"]){
      if(!useful(base[field])&&useful(personal[field]))merged[field]=personal[field];
    }
    merged.player_id=clean(base.player_id,120)||clean(personal.player_id,120)||null;
    merged.warboost_linked=base.warboost_linked===true||personal.warboost_linked===true;
    merged.identity_basis=base.identity_basis||personal.identity_basis||null;
    merged.identity_linked_at=base.identity_linked_at||personal.identity_linked_at||null;
    merged.activity_events=mergeActivityEvents(base.activity_events,personal.activity_events);
    merged.event_availability=mergeEventAvailabilities(base.event_availability,personal.event_availability);
    merged.availability_history=mergeAvailabilityHistory(base.availability_history,personal.availability_history);
    return merged;
  });
}