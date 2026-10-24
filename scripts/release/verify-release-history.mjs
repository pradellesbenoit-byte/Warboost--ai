import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
const BASE="59945b3e8f50c9f2c8b3cb58bd16fe8f6f1daa54";
const REVIEW="0b418e319c99de4d42dbe412e0be58eff3e07f53";
const ZIP_BLOB="6fe1145d516c06b50fa40e8ba23d148062565041";
const git=(...args)=>execFileSync("git",["--no-optional-locks","-c","diff.autoRefreshIndex=false",...args],{encoding:"utf8",maxBuffer:16*1024*1024});
const changes=()=>git("diff","--name-only","--diff-filter=AM",BASE,"HEAD").trim().split("\n").filter(Boolean);

test("release has three local commits from commercial main, never the beta private history",()=>{
  assert.equal(git("branch","--show-current").trim(),"warboost-release-v2-review-20261024");
  assert.equal(git("rev-list","--count",`${BASE}..HEAD`).trim(),"3");
  assert.equal(git("rev-parse","HEAD^").trim(),"0b4b34cff558c855305a30f98302ecc76ab0c42c");
  assert.equal(git("rev-parse","HEAD^^^").trim(),BASE);
  assert.notEqual(git("rev-parse","HEAD").trim(),REVIEW);
});
test("private ZIP is unreachable even in the complete release ancestry",()=>{
  assert.ok(git("rev-list","--objects","HEAD").split("\n").every(row=>row.split(" ")[0]!==ZIP_BLOB));
  for(const path of changes())
    assert.doesNotMatch(path,/(^|\/)(private-download|attached_assets|screenshots|test-environment|operator-backup|\.env[^/]*)(\/|$)|\.(zip|dump|db|sqlite|pem|p12|pfx)$/i);
});
test("only the authorized Vercel build configuration changes; SQL and demo remain untouched",()=>{
  assert.equal(git("diff","--name-only",BASE,"HEAD","--",".replit",".github","supabase","schema.sql","demo-lastwar-presentation").trim(),"");
  assert.equal(git("show","HEAD:vercel.json"),git("show","3de64e9:vercel.json"));
});
test("runtime sources match review except V1 preservation and missing alliance RPC refusal",()=>{
  const patched=new Set(["app.js","lib/normalize.js","lib/squad-identity.js","lib/legacy-squad-compat.js","lib/supabase.js"]);
  for(const path of changes().filter(path=>/^(lib\/|api\/)|^(app\.js|index\.html|i18n\.js|analysis-indicator\.css)$/.test(path)))
    if(!patched.has(path))
    assert.equal(git("rev-parse",`HEAD:${path}`).trim(),git("rev-parse",`${REVIEW}:${path}`).trim(),path);
});
test("no recognizable real credential format in new text blobs",()=>{
  for(const commit of git("rev-list",`${BASE}..HEAD`).trim().split("\n")){
    for(const path of git("diff-tree","--no-commit-id","--name-only","--diff-filter=AM","-r",commit).trim().split("\n")){
      if(!/\.(m?js|cjs|json|md|html|css|txt|sql)$/.test(path))continue;
      const text=git("show",`${commit}:${path}`);
      assert.doesNotMatch(text,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
      assert.doesNotMatch(text,/\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bsk_live_[A-Za-z0-9]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{60,}\b/);
    }
  }
});
