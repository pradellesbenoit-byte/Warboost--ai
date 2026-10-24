// Offline proposal only. Never imported by an API, browser entry or startup.
import {createHash} from "node:crypto";
import {normalizeState} from "../../lib/normalize.js";

const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash("sha256").update(JSON.stringify(value),"utf8").digest("hex");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const present=value=>value!==null&&value!==undefined&&value!=="";

export function prepareOfflineTransition({accountId,state,snapshots=[]}={}){
  if(!uuid.test(accountId||"")||!state||state.player_id!==accountId)
    throw new Error("owner_mismatch");
  if(!Array.isArray(snapshots)||snapshots.some(row=>
    (row.player_id??row.user_id)!==accountId||
    (row.state?.player_id&&row.state.player_id!==accountId)))
    throw new Error("snapshot_owner_mismatch");
  const original=clone({state,snapshots});
  const backup={version:1,owner:accountId,payload:original,sha256:digest(original)};
  const candidate=normalizeState(clone(state));
  const blockers=[];
  const compare=(before,after,path)=>{
    if(present(before)&&JSON.stringify(before)!==JSON.stringify(after))
      blockers.push({code:"legacy_field_changed",path});
  };
  for(const field of ["name","server_id","hq_level","power_m"])
    compare(state.player?.[field],candidate.player?.[field],`player.${field}`);
  for(let i=0;i<4;i++){
    const before=state.squads?.[i],after=candidate.squads?.[i];
    if(!before)continue;
    compare(before.power,after?.power,`squads.${i}.power`);
    for(let j=0;j<5;j++){
      for(const field of ["name","level","stars","power","exclusive","gear"])
        compare(before.heroes?.[j]?.[field],after?.heroes?.[j]?.[field],
          `squads.${i}.heroes.${j}.${field}`);
    }
  }
  for(const field of ["level","power_m"])
    compare(state.drone?.[field],candidate.drone?.[field],`drone.${field}`);
  const oldMembers=state.alliance?.members||[];
  const newMembers=candidate.alliance?.members||[];
  for(let i=0;i<oldMembers.length;i++)
    for(const field of ["name","role","server_id","hq_level","power_m"])
      compare(oldMembers[i]?.[field],newMembers[i]?.[field],`alliance.members.${i}.${field}`);
  return {compatible:blockers.length===0,blockers,candidate,backup};
}

export function restoreOfflineBackup(backup,accountId){
  if(backup?.version!==1||backup.owner!==accountId||
    backup.payload?.state?.player_id!==accountId||
    backup.sha256!==digest(backup.payload))
    throw new Error("backup_integrity_or_owner_mismatch");
  const rows=backup.payload.snapshots;
  if(!Array.isArray(rows)||rows.some(row=>(row.player_id??row.user_id)!==accountId))
    throw new Error("backup_snapshot_owner_mismatch");
  return clone(backup.payload);
}
