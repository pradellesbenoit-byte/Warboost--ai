import assert from "node:assert/strict";
import {reconcileConfirmedSquad} from "../lib/squad-identity.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";

const owner="synthetic-owner";
const names=["Carlie","Lucius","Morrison","DVA","Skyler"];
const changedNames=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
const oldMarkerAt="2026-11-03T06:00:00.000Z";
const confirmedAt="2026-11-03T07:00:00.000Z";
const newerMarkerAt="2026-11-03T08:00:00.000Z";
const localHistory={event:"local-confirmation",squad_id:1};
const cloudHistory={event:"old-cloud-marker",squad_id:1};

function clone(value){return JSON.parse(JSON.stringify(value))}
function squad(id,heroNames=names,at=confirmedAt){
  return {
    id,name:`Squad ${id}`,power:45.6,updated_at:at,needs_rescan:false,
    composition_source:"explicit_confirmation",composition_confirmed_at:at,
    composition_changed_at:at,confirmed_composition:[...heroNames],power_sync_status:"confirmed",
    heroes:heroNames.map(name=>({
      name,level:155,stars:5,power:null,gear:{level:40,slot:`gear-${name}`},
      exclusive:name==="DVA"?{level:29,specializations:{attack:0,hp:"locked",defense:"locked"}}:null
    })),
    composition_conflict:null
  };
}
function stateWithSquad(one){
  return {
    player_id:owner,
    player:{power_m:null},
    technology:{branches:{"Spécialisation Avion":0,"Forces Spéciales":null}},
    squads:[one,...[2,3,4].map(id=>({
      id,name:`Squad ${id}`,power:null,updated_at:null,needs_rescan:false,
      composition_source:null,composition_confirmed_at:null,composition_changed_at:null,
      confirmed_composition:["","","","",""],
      heroes:Array.from({length:5},()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null})),
      composition_conflict:null
    }))]
  };
}
function addMarker(target,{at,history=cloudHistory}={}){
  target.squads[0].needs_rescan=true;
  target.squads[0].composition_conflict={
    status:"needs_verification",reason:"squad_freshness_ambiguous",detected_at:at,
    identity_history:[clone(history)]
  };
  return target;
}

let assertions=0;
function check(actual,expected,message){assert.deepEqual(actual,expected,message);assertions++}
function truthy(value,message){assert.ok(value,message);assertions++}

// Start with an active old ambiguity, then record a newer explicit confirmation.
const before=addMarker(stateWithSquad(squad(1,names,oldMarkerAt)),{at:oldMarkerAt});
before.squads[0].composition_confirmed_at=oldMarkerAt;
before.squads[0].composition_source="explicit_confirmation";
before.squads[0].confirmed_composition=[...names];
const local=reconcileConfirmedSquad(before,{
  squadId:1,names,updatedAt:confirmedAt
}).state;
local.squads[0].composition_conflict.identity_history.push(clone(localHistory));
check(local.squads[0].composition_conflict.reason,undefined,
  "explicit local confirmation clears the active prior reason");

// Cloud still has the old marker; merged already contains that marker too.
// Equal squad freshness leaves the merged slot in place and exercises the
// final identity-history merge in reconcileCloudSquads.
const remote=addMarker(clone(local),{at:oldMarkerAt});
remote.squads[0].composition_conflict.identity_history.push(clone(cloudHistory));
const merged=addMarker(clone(local),{at:oldMarkerAt});
merged.squads[0].composition_conflict.identity_history.push(clone(localHistory));
const reconciled=reconcileCloudSquads(local,remote,merged);
const resolved=reconciled.state.squads[0];
check(resolved.composition_conflict?.reason,undefined,
  "the final merge removes an old marker only when the same slot has later explicit proof");
check(resolved.needs_rescan,false,
  "the old marker's rescan flag is cleared when no other active conflict remains");
check(reconciled.conflicts,[],"a proven-stale marker does not create a new reconciliation conflict");
check(resolved.confirmed_composition,names,"all five confirmed hero names survive");
check(resolved.power,45.6,"squad power is preserved");
check(resolved.heroes[3].exclusive,local.squads[0].heroes[3].exclusive,
  "DVA exclusive-weapon progression is preserved");
check(resolved.heroes[3].gear,local.squads[0].heroes[3].gear,"DVA equipment is preserved");
check(reconciled.state.technology.branches["Spécialisation Avion"],0,
  "confirmed technology zero is preserved");
truthy(resolved.composition_conflict.identity_history.some(item=>item.event==="local-confirmation"),
  "local identity history is retained");
truthy(resolved.composition_conflict.identity_history.some(item=>item.event==="old-cloud-marker"),
  "Cloud identity history is retained even when its active marker is stale");

// A newer Cloud marker and a divergent explicit composition remain unresolved.
const newerCloud=addMarker(stateWithSquad(squad(1,changedNames,newerMarkerAt)),{
  at:newerMarkerAt,history:{event:"newer-cloud-conflict",squad_id:1}
});
const newer= reconcileCloudSquads(local,newerCloud,clone(local));
check(newer.state.squads[0].composition_conflict.reason,"squad_freshness_ambiguous",
  "a newer Cloud conflict is not filtered by older local confirmation");
check(newer.state.squads[0].confirmed_composition,changedNames,
  "the newer divergent Cloud composition is preserved, not silently replaced");
truthy(newer.state.squads[0].needs_rescan,"the newer divergent composition remains flagged for review");
truthy(newer.state.squads[0].composition_conflict.identity_history.some(item=>item.event==="local-confirmation"),
  "local history remains available alongside the newer Cloud conflict");

console.log(`PASS: final squad freshness merge regression (${assertions} assertions; synthetic state only)`);
