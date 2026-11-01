import test from "node:test";
import assert from "node:assert/strict";
import {PREPUSH_PRIVACY_BRANCHES,prepushPrivacyBaseRef} from "./prepush-privacy-branch-policy.mjs";

test("privacy audit accepts only the public beta and isolated review branches",()=>{
  assert.deepEqual(PREPUSH_PRIVACY_BRANCHES,[
    "public-beta-safe-launch",
    "warboost-free-access-review-20261025"
  ]);
  for(const branch of PREPUSH_PRIVACY_BRANCHES)
    assert.equal(prepushPrivacyBaseRef(branch),`origin/${branch}`);
});

test("privacy audit rejects main and arbitrary branch names without touching Git refs",()=>{
  for(const branch of ["main","demo-lastwar-presentation","beta","unknown",""])
    assert.throws(()=>prepushPrivacyBaseRef(branch),/not allowed/);
});
