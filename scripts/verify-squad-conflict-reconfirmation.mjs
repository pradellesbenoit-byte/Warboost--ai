import assert from "node:assert/strict";
import {
  mergeSquadIdentityHistory,
  reconcileConfirmedSquad,
  repairLegacySquadIdentity
} from "../lib/squad-identity.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";

const owner="synthetic-owner";
const names=["Carlie","Lucius","Morrison","DVA","Skyler"];
const differentNames=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
const oldConfirmedAt="2026-11-02T18:00:00.000Z";
const oldMarkerAt="2026-11-02T19:00:00.000Z";
const localConfirmedAt="2026-11-02T20:00:00.000Z";
const cloudNewerAt="2026-11-02T21:00:00.000Z";
const localHistory={event:"local-prior-identity",squad_id:1};
const cloudHistory={event:"cloud-prior-identity",squad_id:1};

function clone(value){return JSON.parse(JSON.stringify(value))}
function squadState({composition=names,confirmedAt=oldConfirmedAt,updatedAt=oldMarkerAt,markerAt=oldMarkerAt,history=[localHistory],power=45.6}={}){
  const heroes=composition.map(name=>({
    name,level:155,stars:5,gear:{level:40,slot:`gear-${name}`},
    exclusive:name==="DVA"?{level:30,specializations:{attack:{level:0},hp:{level:0,locked:true},defense:{level:0,locked:true}}}:null
  }));
  return {
    player_id:owner,
    player:{power_m:null},
    technology:{branches:{"Spécialisation Avion":0}},
    squads:[
      {id:1,name:"Squad 1",power,updated_at:updatedAt,needs_rescan:true,
        composition_source:"explicit_confirmation",composition_confirmed_at:confirmedAt,
        composition_changed_at:confirmedAt,confirmed_composition:[...composition],heroes,
        composition_conflict:{status:"needs_verification",reason:"squad_freshness_ambiguous",
          ...(markerAt?{detected_at:markerAt}:{}),identity_history:clone(history)}},
      ...[2,3,4].map(id=>({id,name:`Squad ${id}`,power:null,updated_at:null,needs_rescan:false,
        composition_source:null,composition_confirmed_at:null,confirmed_composition:["","","","",""],
        heroes:Array.from({length:5},()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null})),
        composition_conflict:null}))
    ]
  };
}
let assertions=0;
function equal(actual,expected,message){assert.deepEqual(actual,expected,message);assertions++}
function truthy(value,message){assert.ok(value,message);assertions++}
function falsy(value,message){assert.ok(!value,message);assertions++}

const before= squadState();
const confirmed=reconcileConfirmedSquad(before,{squadId:1,names,updatedAt:localConfirmedAt}).state;
equal(confirmed.squads[0].composition_conflict?.reason,undefined,"explicit confirmation clears the active old reason");
equal(confirmed.squads[0].needs_rescan,false,"explicit confirmation clears the stale rescan flag");

const repaired=repairLegacySquadIdentity(clone(confirmed),{now:"2026-11-02T20:00:01.000Z"}).state;
equal(repaired.squads[0].composition_conflict?.reason,undefined,"legacy identity repair does not restore the old reason");

const reopened=clone(repaired);
const oldCloud=clone(before);
oldCloud.squads[0].composition_conflict.identity_history=[cloudHistory];
const resolved=reconcileCloudSquads(reopened,oldCloud,clone(reopened));
equal(resolved.state.squads[0].composition_conflict?.reason,undefined,"old Cloud marker does not return after reconfirmation");
equal(resolved.state.squads[0].composition_conflict?.status,undefined,"the stale marker status is cleared with its reason");
equal(resolved.state.squads[0].needs_rescan,false,"the old Cloud rescan state does not override explicit reconfirmation");
equal(resolved.conflicts,[],"old marker does not create a new active conflict");
equal(resolved.state.squads[0].confirmed_composition,names,"all five confirmed names survive");
equal(resolved.state.squads[0].power,45.6,"squad power is preserved independently");
equal(resolved.state.squads[0].heroes[3].exclusive,before.squads[0].heroes[3].exclusive,"DVA weapon and specialization data survive");
equal(resolved.state.squads[0].heroes[3].gear,before.squads[0].heroes[3].gear,"DVA equipment survives");
equal(resolved.state.technology.branches["Spécialisation Avion"],0,"confirmed technology zero remains intact");
truthy(resolved.state.squads[0].composition_conflict.identity_history.some(x=>x.event==="local-prior-identity"),"local identity history is retained");
truthy(resolved.state.squads[0].composition_conflict.identity_history.some(x=>x.event==="cloud-prior-identity"),"Cloud identity history is retained");

const oldWithoutDetectedAt=clone(oldCloud);
delete oldWithoutDetectedAt.squads[0].composition_conflict.detected_at;
const fallbackMerge=mergeSquadIdentityHistory(repaired.squads[0],oldWithoutDetectedAt.squads[0]);
equal(fallbackMerge.reason,undefined,"a newer explicit confirmation also clears a stale marker using squad updated_at fallback");
const reverseMerge=mergeSquadIdentityHistory(oldCloud.squads[0],repaired.squads[0]);
equal(reverseMerge.reason,undefined,"stale-marker filtering is independent of argument order");
equal(reverseMerge.identity_history.map(x=>x.event).sort(),["cloud-prior-identity","local-prior-identity"],"both histories survive reverse-order merge");
const unprovenOldMarker=clone(oldWithoutDetectedAt.squads[0]);
unprovenOldMarker.updated_at=null;
unprovenOldMarker.composition_confirmed_at=null;
const missingProofMerge=mergeSquadIdentityHistory(repaired.squads[0],unprovenOldMarker);
equal(missingProofMerge.reason,"squad_freshness_ambiguous","a marker with no reliable age is not discarded");

const genuinelyNewMarker={...clone(oldCloud.squads[0]),updated_at:"2026-11-02T20:30:00.000Z",
  composition_conflict:{status:"needs_verification",reason:"squad_freshness_ambiguous",
    detected_at:"2026-11-02T20:30:00.000Z",identity_history:[cloudHistory]}};
const preserveNewMarker=mergeSquadIdentityHistory(repaired.squads[0],genuinelyNewMarker);
equal(preserveNewMarker.reason,"squad_freshness_ambiguous","a marker detected after local confirmation remains active");
const preserveOtherConflict=mergeSquadIdentityHistory(repaired.squads[0],{
  ...clone(oldCloud.squads[0]),
  composition_conflict:{status:"needs_verification",reason:"duplicate_hero_identity",identity_history:[cloudHistory]}
});
equal(preserveOtherConflict.reason,"duplicate_hero_identity","a different unresolved identity conflict is preserved");

const newerDifferentCloud=squadState({composition:differentNames,confirmedAt:cloudNewerAt,
  updatedAt:cloudNewerAt,markerAt:"2026-11-02T20:30:00.000Z",history:[cloudHistory]});
const newerResult=reconcileCloudSquads(clone(repaired),newerDifferentCloud,clone(repaired));
equal(newerResult.state.squads[0].confirmed_composition,differentNames,"a newer explicit Cloud composition is not overwritten by the older local composition");
equal(newerResult.state.squads[0].composition_conflict.reason,"squad_freshness_ambiguous","the newer divergent Cloud conflict is not silently cleared");
truthy(newerResult.state.squads[0].needs_rescan,"the divergent composition remains flagged for review");
truthy(newerResult.state.squads[0].composition_conflict.identity_history.some(x=>x.event==="local-prior-identity"),"local history remains available when newer Cloud composition wins");

console.log(`PASS: squad conflict reconfirmation and newer-cloud safeguards (${assertions} assertions)`);
