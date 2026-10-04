// Historical entrypoint retained for npm verify.
// The old count-then-INSERT fake cannot validate the new transactional contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import {betaCodeVisible} from "../lib/beta-activation-ui.js";
import "./verify-beta-activation-atomic.mjs";

const html=fs.readFileSync("index.html","utf8");
for(const id of ["betaCodeBox","betaAccessCode","betaCodeActivateBtn","betaCodeStatus"])
  assert.ok(html.includes(`id="${id}"`));
assert.equal(fs.readdirSync("api").filter(file=>file.endsWith(".js")).length,12);
assert.equal(betaCodeVisible({
  allowed:true,access_status:"account",alliance_beta_allowed:false,
  beta_access_status:"invite-required",beta_code_eligible:true
},{logged:true}),true);
console.log("PASS historical beta-code entrypoint now verifies real PostgreSQL atomic admission and the current UI contract");