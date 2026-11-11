import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildGameDataResetPreview,GAME_RESET_BRANCH,GAME_RESET_TEST_PROJECT} from "../lib/game-data-reset-plan.js";

const plan=buildGameDataResetPreview({
  environment:"test",
  branch:GAME_RESET_BRANCH,
  projectRef:GAME_RESET_TEST_PROJECT
});
assert.equal(plan.mode,"preview-only");
assert.equal(plan.destructive,false);
assert.equal(plan.databaseConnection,false);
assert.equal(plan.executionImplemented,false);
assert.equal(plan.exactRowCountsAvailable,false);
assert.equal(plan.authAccountsPreserved,true);
assert.deepEqual(plan.coreGameTables.map(row=>row.table),["public.wb1_profiles","public.wb1_snapshots"]);
assert.deepEqual(plan.allianceTablesRequireSeparateApproval.map(row=>row.table),["public.wb1_alliance_members","public.wb1_alliances"]);
for(const table of ["auth.users","auth.identities","public.warboost_subscriptions","public.warboost_pro_grants","public.wb1_beta_invites","public.wb1_support_tickets"])
  assert.ok(plan.preservedTables.includes(table),`${table} must remain outside the game-data reset`);
for(const badTarget of [
  {environment:"production",branch:GAME_RESET_BRANCH,projectRef:GAME_RESET_TEST_PROJECT},
  {environment:"test",branch:"main",projectRef:GAME_RESET_TEST_PROJECT},
  {environment:"test",branch:GAME_RESET_BRANCH,projectRef:"production-project"}
]) assert.throws(()=>buildGameDataResetPreview(badTarget),error=>error.code==="GAME_RESET_TARGET_BLOCKED");

const runner=await readFile(new URL("./preview-game-data-reset.mjs",import.meta.url),"utf8");
assert.doesNotMatch(runner,/fetch\s*\(|createClient\s*\(|\.from\s*\(|\b(?:DELETE|TRUNCATE|DROP)\b/i);
console.log("PASS game-data reset preview: isolated target required; no database connection or mutation; auth, billing, invites and support preserved; alliance reset requires separate approval.");
