import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mergeCloudRosterWithIdentity} from "../lib/alliance-roster-merge.js";
import {mergeCanonicalRoster} from "../lib/alliance-scope.js";

const scope={serverId:"123",allianceTag:"TEST"};
const linkedSeth={
  name:"Seth I",role:"R4",hq_level:35,power_m:318,server_id:"123",alliance_tag:"TEST",
  player_id:"synthetic-seth-account",warboost_linked:true,
  identity_basis:"lastwar_nickname_server_alliance",squad_power_m:42
};
const unlinkedPlayer={
  name:"Roster Only",role:"R3",hq_level:30,power_m:150,server_id:"123",alliance_tag:"TEST",
  player_id:null,warboost_linked:false
};

{
  const {roster}=mergeCloudRosterWithIdentity(
    [linkedSeth,unlinkedPlayer],
    [
      {...linkedSeth,power_m:304.3,squad_power_m:43},
      {...unlinkedPlayer,player_id:"synthetic-roster-only-account",power_m:145}
    ],
    scope
  );
  assert.equal(roster.length,2,"linked and unlinked players remain one row each");
  assert.equal(roster[0].power_m,318,"stale linked cloud profile cannot roll back canonical power");
  assert.equal(roster[0].squad_power_m,43,"non-power profile fields still enrich the roster");
  assert.equal(roster[0].role,"R4","canonical grade remains unchanged");
  assert.equal(roster[1].power_m,150,"an unlinked member keeps their canonical power");
  assert.equal(roster[1].role,"R3","an unlinked member keeps their canonical grade");
}

{
  const unknownPower={...unlinkedPlayer,name:"Cloud Fill",power_m:null};
  const {roster}=mergeCloudRosterWithIdentity(
    [unknownPower],
    [{...unknownPower,player_id:"synthetic-cloud-fill",power_m:12.5}],
    scope
  );
  assert.equal(roster.length,1);
  assert.equal(roster[0].power_m,12.5,"a linked profile may fill a missing canonical power");
}

{
  const oldCanonical={...linkedSeth,power_m:304.3};
  const authorizedRosterImport=mergeCanonicalRoster(
    [oldCanonical],
    [{...oldCanonical,power_m:318}],
    scope
  );
  assert.equal(authorizedRosterImport[0].power_m,318,"explicit roster import can confirm a real progression");

  const staleGenericProfile={...linkedSeth,power_m:304.3,hq_level:36};
  const genericSync=mergeCanonicalRoster(
    [{...linkedSeth,power_m:318}],
    [staleGenericProfile],
    {...scope,preserveExistingPower:true}
  );
  assert.equal(genericSync[0].power_m,318,"generic profile sync cannot roll back canonical power");
  assert.equal(genericSync[0].hq_level,36,"generic sync may still enrich other profile fields");
}

{
  const syncSource=readFileSync(new URL("../api/sync.js",import.meta.url),"utf8");
  assert.match(
    syncSource,
    /const genericSyncOptions=\{serverId:targetServer,allianceTag:targetTag,preserveExistingPower:true\}/,
    "generic sync must explicitly preserve existing canonical power"
  );
  assert.match(syncSource,/replaceCanonicalRosterFromCompleteSnapshot\(ctx\.alliance\?\.roster,candidateRoster,genericSyncOptions\)/);
  assert.match(syncSource,/mergeCanonicalRoster\(ctx\.alliance\?\.roster,candidateRoster,genericSyncOptions\)/);
}

console.log("PASS linked canonical 318M wins over stale cloud 304.3M; unlinked and missing-power cases; explicit import; generic sync protection; other fields preserved");
