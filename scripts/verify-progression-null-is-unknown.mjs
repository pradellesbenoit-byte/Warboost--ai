import assert from "node:assert/strict";
import {progressionComparison} from "../lib/progression-history.js";

const snapshots=(accountPower)=>[
  {at:"2026-11-01T12:00:00.000Z",account_power_m:accountPower,main_squad_power_m:45.6},
  {at:"2026-11-02T12:00:00.000Z",account_power_m:accountPower,main_squad_power_m:45.6}
];

const unknown=progressionComparison(snapshots(null),1);
assert.equal(unknown.account.current,null,"missing account power remains unknown");
assert.equal(unknown.main_squad.current,45.6,"squad power remains a separate metric");

const zero=progressionComparison(snapshots(0),1);
assert.equal(zero.account.current,0,"an explicitly recorded zero remains zero");

console.log("PASS: progression null stays unknown; explicit zero and squad power are preserved (3 assertions)");
