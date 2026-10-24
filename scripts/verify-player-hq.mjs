import assert from "node:assert/strict";
import fs from "node:fs";
import {confirmPlayerHq,mergePlayerHqFields,playerHqNeedsCloudSync} from "../lib/player-hq.js";
import {normalizeState} from "../lib/normalize.js";

const account="player-account-a";
const oldAt="2026-10-01T10:00:00.000Z";
const confirmedAt="2026-10-01T10:05:00.000Z";
const cloudAt15MinutesLater="2026-10-01T10:20:00.000Z";
const legacy30={hq_level:30,hq_level_source:null,hq_level_confirmed_at:null};
const confirmed31=confirmPlayerHq(legacy30,31,{source:"confirmed_scan",confirmedAt});
assert.equal(confirmed31.accepted,true,"a reviewed QG30→31 scan is explicitly confirmed");
assert.deepEqual(
  {level:confirmed31.player.hq_level,source:confirmed31.player.hq_level_source,at:confirmed31.player.hq_level_confirmed_at},
  {level:31,source:"confirmed_scan",at:confirmedAt}
);

const persisted=normalizeState(JSON.parse(JSON.stringify({
  player_id:account,
  updated_at:confirmedAt,
  player:confirmed31.player
})));
assert.equal(persisted.player.hq_level,31,"local save/reload retains the confirmed HQ");
assert.equal(persisted.player.hq_level_source,"confirmed_scan","normalization preserves HQ provenance");
assert.equal(persisted.player.hq_level_confirmed_at,confirmedAt,"normalization preserves the field timestamp");

const staleCloud30=normalizeState({
  player_id:account,
  updated_at:cloudAt15MinutesLater,
  player:{hq_level:30}
}).player;
const afterDelayedResume=mergePlayerHqFields(persisted.player,staleCloud30,{sameAccount:true});
assert.equal(afterDelayedResume.hq_level,31,"a 15-minute-newer whole-profile cloud timestamp cannot roll back a confirmed HQ");
assert.equal(afterDelayedResume.hq_level_source,"confirmed_scan");
assert.equal(playerHqNeedsCloudSync(persisted.player,staleCloud30,{sameAccount:true}),true,"a local confirmed HQ is queued back to stale cloud");

const localLegacy30=normalizeState({
  player_id:account,
  updated_at:oldAt,
  player:{hq_level:30}
}).player;
const newerCloud31=normalizeState({
  player_id:account,
  updated_at:cloudAt15MinutesLater,
  player:{hq_level:31,hq_level_source:"confirmed_scan",hq_level_confirmed_at:cloudAt15MinutesLater}
}).player;
assert.equal(mergePlayerHqFields(localLegacy30,newerCloud31,{sameAccount:true}).hq_level,31,"a newer confirmed cloud HQ replaces an older local HQ");
assert.equal(playerHqNeedsCloudSync(localLegacy30,newerCloud31,{sameAccount:true}),false,"a winning cloud HQ needs no redundant push");

const oldConfirmed30=confirmPlayerHq(legacy30,30,{source:"confirmed_scan",confirmedAt:oldAt}).player;
const staleCloudConfirmed30={hq_level:30,hq_level_source:"confirmed_scan",hq_level_confirmed_at:oldAt};
assert.equal(
  mergePlayerHqFields(persisted.player,staleCloudConfirmed30,{sameAccount:true}).hq_level,
  31,
  "a stale lower confirmed cloud observation cannot replace a newer local confirmation"
);
const uncertain29=confirmPlayerHq(persisted.player,29,{source:"confirmed_scan",confirmedAt:cloudAt15MinutesLater});
assert.equal(uncertain29.accepted,false,"a scan result below the confirmed HQ remains uncommitted");
assert.equal(uncertain29.reason,"scan_decrease");
assert.equal(uncertain29.player.hq_level,31);
assert.equal(mergePlayerHqFields(persisted.player,{hq_level:30},{sameAccount:true}).hq_level,31,"an unmarked/ambiguous lower scan cannot downgrade confirmed data");

const confirmed32=confirmPlayerHq(persisted.player,32,{source:"confirmed_scan",confirmedAt:cloudAt15MinutesLater});
assert.equal(confirmed32.accepted,true,"a subsequent higher scan can be confirmed");
assert.equal(mergePlayerHqFields(persisted.player,confirmed32.player,{sameAccount:true}).hq_level,32);
assert.equal(mergePlayerHqFields(persisted.player,confirmed32.player,{sameAccount:true}).hq_level_source,"confirmed_scan");

const manualDecrease=confirmPlayerHq(persisted.player,30,{source:"manual_profile",confirmedAt:cloudAt15MinutesLater});
assert.equal(manualDecrease.accepted,true,"a deliberate manual profile confirmation is distinct from an uncertain scan");
assert.equal(
  mergePlayerHqFields(persisted.player,manualDecrease.player,{sameAccount:true}).hq_level,
  30,
  "a newer explicit manual correction follows the same field timestamp rules"
);

const otherAccount={hq_level:35,hq_level_source:"manual_profile",hq_level_confirmed_at:cloudAt15MinutesLater};
const accountB={hq_level:30,hq_level_source:null,hq_level_confirmed_at:null};
assert.equal(mergePlayerHqFields(otherAccount,accountB,{sameAccount:false}).hq_level,30,"a different account never inherits the prior account's HQ");
assert.equal(mergePlayerHqFields(otherAccount,{}, {sameAccount:false}).hq_level,null,"a missing target-account HQ does not inherit another account's value");
assert.equal(mergePlayerHqFields(oldConfirmed30,legacy30,{sameAccount:true}).hq_level,30,"legacy profiles remain readable");

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const api=fs.readFileSync(new URL("../api/state.js",import.meta.url),"utf8");
const sw=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.match(app,/mergePlayerHqFields\(base\?\.player,incoming\?\.player,\{sameAccount:!\(baseOwner&&incomingOwner&&baseOwner!==incomingOwner\)\}\)/,"protected state merges explicitly isolate account ownership");
assert.match(app,/confirmPlayerHq\(state\.player,Math\.round\(hq\),\{source:"manual_profile",confirmedAt\}\)/,"manual HQ edits receive explicit provenance");
assert.match(app,/confirmPlayerHq\(state\.player,hqLevel,\{source:"confirmed_scan",confirmedAt:hqConfirmedAt\}\)/,"profile scans are stamped only at owner confirmation");
assert.match(app,/preferLocal\|\|squadResult\.localNewer\.length>0\|\|hqNeedsPush/,"a locally winning HQ is retried to cloud after restore");
assert.match(app,/if\(owner!==id\)return safeClone\(cached\)/,"an account-scoped login cache wins over unowned device state");
assert.match(api,/mergePlayerHqFields\(previousState\.player,incoming\.player,\{sameAccount:true\}\)/,"server writes preserve field-level HQ evidence and block stale clients");
assert.match(sw,/SHELL\.push\("\/lib\/player-hq\.js","\/app\.js\?v=player-hq-confirmation-r1"\)/,"offline PWA cache includes the HQ module and refreshed app entrypoint");
assert.match(index,/\/app\.js\?v=player-hq-confirmation-r1/,"the HTML entrypoint requests the current HQ safeguard");

console.log("PASS: confirmed player HQ survives scan, local/cloud restore, delayed retry, explicit manual correction, and account isolation.");