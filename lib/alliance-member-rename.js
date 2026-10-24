import {normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag} from "./alliance-identity.js";

export const RENAME_FIELDS=["roster_member_id","identity_lifecycle_key","name_confirmed_at","name_aliases","name_audit"];
const nameKey=(name,tag)=>normalizeLastWarNickname(name,tag);
const fail=code=>{throw Object.assign(new Error(code),{code,status:409})};
function inScope(row,scope){
  return normalizeServerId(row.server_id||scope.serverId)===normalizeServerId(scope.serverId)&&
    normalizeAllianceTag(row.alliance_tag||scope.allianceTag)===normalizeAllianceTag(scope.allianceTag);
}
export function renameMetadata(row={}){
  return {roster_member_id:String(row.roster_member_id||"").slice(0,120)||null,
    identity_lifecycle_key:String(row.identity_lifecycle_key||"").slice(0,260)||null,
    name_confirmed_at:row.name_confirmed_at||null,
    name_aliases:(Array.isArray(row.name_aliases)?row.name_aliases:[]).map(x=>String(x).trim().slice(0,80)).filter(Boolean),
    name_audit:(Array.isArray(row.name_audit)?row.name_audit:[]).map(x=>({
      old_name:String(x.old_name||"").slice(0,80),new_name:String(x.new_name||"").slice(0,80),
      actor_player_id:String(x.actor_player_id||"").slice(0,120),at:x.at||null
    }))};
}
export function preferredRenameEvidence(a={},b={}){
  const at=Date.parse(a.name_confirmed_at||"")||0,bt=Date.parse(b.name_confirmed_at||"")||0;
  const winner=bt>at?b:a;
  return at||bt?{...renameMetadata(winner),name:winner.name,canonical_member_key:winner.canonical_member_key}:{};
}
export function prepareRosterRename(rows,request,{serverId,allianceTag,actorId,memberId,now,extraRows=[]}){
  const scope={serverId,allianceTag},key=String(request.member_key||"");
  if(!key||!actorId||!memberId)fail("member_identity_required");
  const matches=rows.map((row,index)=>({row,index})).filter(x=>x.row.canonical_member_key===key&&inScope(x.row,scope));
  if(matches.length!==1)fail(matches.length?"member_identity_ambiguous":"member_not_found");
  const {row:old,index}=matches[0],newName=String(request.new_name||"").trim();
  if(typeof request.new_name!=="string")fail("nickname_invalid");
  if(!newName||newName.length>80||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(newName))fail("nickname_invalid");
  if(String(request.expected_name||"")!==old.name)fail("member_name_changed");
  if(newName===old.name)fail("nickname_unchanged");
  const normalized=nameKey(newName,allianceTag);
  if(!normalized)fail("nickname_invalid");
  for(const other of rows){
    if(other===old||!inScope(other,scope))continue;
    if(nameKey(other.name,allianceTag)===nameKey(old.name,allianceTag))fail("member_identity_ambiguous");
    if(nameKey(other.name,allianceTag)===normalized)fail("nickname_taken");
    if((other.name_aliases||[]).some(alias=>nameKey(alias,allianceTag)===normalized))fail("nickname_identity_conflict");
    if(old.player_id&&other.player_id===old.player_id)fail("member_identity_ambiguous");
  }
  for(const other of extraRows){
    if(!inScope(other,scope)||nameKey(other.name,allianceTag)!==normalized)continue;
    if(!old.player_id||String(other.player_id||"")!==String(old.player_id))fail("nickname_identity_conflict");
  }
  const renamed={...old,...renameMetadata(old),name:newName,
    roster_member_id:old.roster_member_id||memberId,
    identity_lifecycle_key:old.identity_lifecycle_key||request.lifecycle_key,
    name_confirmed_at:now,updated_at:now,
    name_aliases:[...new Set([...(old.name_aliases||[]),old.name])],
    name_audit:[...(old.name_audit||[]),{old_name:old.name,new_name:newName,actor_player_id:actorId,at:now}]};
  const roster=rows.map((row,i)=>i===index?renamed:row);
  return {roster,member:renamed};
}

export function alignRenamedRosterRows(rows,evidence){
  return rows.map(row=>{
    const hits=evidence.filter(known=>known.name_confirmed_at&&
      normalizeServerId(row.server_id)===normalizeServerId(known.server_id)&&
      normalizeAllianceTag(row.alliance_tag)===normalizeAllianceTag(known.alliance_tag)&&
      (!row.player_id||!known.player_id||row.player_id===known.player_id)&&
      (!row.canonical_member_key||row.canonical_member_key===known.canonical_member_key)&&
      (row.canonical_member_key===known.canonical_member_key||row.name===known.name||(known.name_aliases||[]).includes(row.name)));
    return hits.length===1?{...row,...preferredRenameEvidence(row,hits[0])}:row;
  });
}

// Only the persisted canonical roster may supply rename evidence on the server.
// Incoming client names, aliases and timestamps cannot rename or relink accounts.
export function protectCanonicalRosterNames(existing,incoming,scope){
  return incoming.map(raw=>{
    const row={...raw};for(const field of RENAME_FIELDS)delete row[field];
    const candidates=existing.filter(old=>inScope(old,scope)&&(
      (row.canonical_member_key&&row.canonical_member_key===old.canonical_member_key)||
      (old.name_confirmed_at&&(old.name_aliases||[]).some(alias=>nameKey(alias,scope.allianceTag)===nameKey(row.name,scope.allianceTag)))||
      nameKey(row.name,scope.allianceTag)===nameKey(old.name,scope.allianceTag)));
    if(candidates.length>1)fail("member_identity_ambiguous");
    const old=candidates[0];if(!old)return row;
    if(raw.roster_member_id&&old.roster_member_id&&raw.roster_member_id!==old.roster_member_id)fail("nickname_identity_conflict");
    if(old.player_id&&row.player_id&&old.player_id!==row.player_id)fail("nickname_identity_conflict");
    const aliasOnly=nameKey(row.name,scope.allianceTag)!==nameKey(old.name,scope.allianceTag);
    if(aliasOnly&&row.canonical_member_key!==old.canonical_member_key&&
      !(row.player_id&&old.player_id&&row.player_id===old.player_id))fail("nickname_identity_conflict");
    return {...row,...renameMetadata(old),name:old.name,canonical_member_key:old.canonical_member_key,
      player_id:old.player_id||row.player_id,warboost_linked:old.warboost_linked===true||row.warboost_linked===true};
  });
}

// Relabel current references only, preserving historical records and opaque keys.
export function applyCanonicalRenames(state,rows=state.alliance?.members||[],{clone=true}={}){
  const scope={serverId:state.alliance?.server_id||state.player?.server_id,allianceTag:state.alliance?.tag};
  const renamed=rows.filter(row=>row.name_confirmed_at&&row.roster_member_id&&inScope(row,scope));
  if(!renamed.length)return state;
  const result=clone?JSON.parse(JSON.stringify(state)):state;
  const aliases=new Map();
  for(const row of renamed)for(const alias of row.name_aliases||[]){
    const key=nameKey(alias,scope.allianceTag);
    if(rows.some(other=>other!==row&&nameKey(other.name,scope.allianceTag)===key))continue;
    if(aliases.has(key)&&aliases.get(key)!==row)aliases.set(key,null);else aliases.set(key,row);
  }
  const skip=new Set(["name_audit","name_aliases","membership_history","activity_events","availability_history","snapshots","progression_snapshots","roster_review","roster_removal_tombstones"]);
  const labels=new Set(["name","member_name","player_name","target_name","departed_name","replacement_name","personal_name"]);
  function relabel(value,parent=""){
    if(!value||typeof value!=="object")return;
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++){
        if(typeof value[i]==="string"&&["members","participants","substitutes"].includes(parent)){
          const target=aliases.get(nameKey(value[i],scope.allianceTag));if(target)value[i]=target.name;
        }else relabel(value[i],parent);
      }
      return;
    }
    for(const [key,item] of Object.entries(value)){
      if(skip.has(key))continue;
      if(labels.has(key)&&typeof item==="string"){
        const target=aliases.get(nameKey(item,scope.allianceTag));
        const id=value.player_id,keyId=value.canonical_member_key;
        if(target&&(!id||id===target.player_id)&&(!keyId||keyId===target.canonical_member_key))value[key]=target.name;
      }else relabel(item,key);
    }
  }
  relabel(result.alliance);relabel(result.vs);relabel(result.season);
  const self=renamed.find(row=>row.warboost_linked===true&&row.player_id===result.player_id);
  if(self)result.player={...result.player,name:self.name};
  return result;
}