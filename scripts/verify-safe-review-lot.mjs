// Local Git/content audit only. No credentials, provider APIs or server startup.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";

const BASE="3de64e919709d2b3a956d6fa6d92b539580d0ec9";
const PRIVATE_ARCHIVE_COMMIT="fb42e8fc06307481a8f3e7720138ab659971c668";
// Publicly reportable object fingerprint, not archive contents. Do not require
// the excluded commit/blob to exist in a future clean clone of this branch.
const PRIVATE_ARCHIVE_BLOB="6fe1145d516c06b50fa40e8ba23d148062565041";
const git=(...args)=>execFileSync("git",["--no-optional-locks","-c","diff.autoRefreshIndex=false",...args],{encoding:"utf8"});
const changed=()=>git("diff","--name-status",BASE).trim().split("\n").filter(Boolean).map(line=>line.split("\t"));
const source=path=>readFileSync(path,"utf8");

test("new changes contain no archive, uploaded image, environment or operator payload",()=>{
  for(const [status,path] of changed()){
    if(status==="D")continue;
    assert.doesNotMatch(path,/(?:^|\/)(?:private-download|attached_assets|operator-backup|scan-diagnostic|test-environment|\.env[^/]*)(?:\/|$)|\.(?:zip|dump|sqlite|db|pem|p12|pfx)$/i);
    assert.doesNotMatch(path,/\.(?:png|jpe?g|webp|gif|pdf|sql)$/i);
    assert.doesNotMatch(path,/demo-lastwar-presentation/);
  }
});

test("deployment, payment configuration and existing SQL are unchanged",()=>{
  for(const [,path] of changed()){
    assert.notEqual(path,".replit");
    assert.notEqual(path,"vercel.json");
    assert.doesNotMatch(path,/^(?:\.github\/|supabase\/)|^api\/pro\.js$/);
  }
});

test("operator diagnostic launcher is absent and equipment writes stay disabled",()=>{
  assert.doesNotMatch(source("server.mjs"),/scripts\/scan-diagnostic|scan-diagnostic-development/);
  const scripts=JSON.parse(source("package.json")).scripts;
  assert.ok(Object.keys(scripts).every(name=>!name.startsWith("operator:")));
  assert.ok(Object.values(scripts).every(command=>!/(?:scan-diagnostic|operator-backup|test-environment)\//.test(command)));
  assert.match(source("lib/gear-repair-contract.js"),/GEAR_REPAIR_RELEASE_APPROVED=false/);
});

test("old uploaded captures are removed from the final tree",()=>{
  for(const path of [
    "attached_assets/0_1000024258_1791103581430.png",
    "attached_assets/Screenshot_20260929-174224_1790765041538.png",
    "attached_assets/Screenshot_20260929-174228_1790765041511.png",
    "attached_assets/file_000000003bfc8210b4265e8b717862b6_1790802352797.png"
  ]){
    // Preserve ignored local uploads in the original workspace. Only committed
    // paths can be sent by pushing this branch; never read or delete the files.
    assert.equal(git("ls-tree","--name-only","HEAD","--",path).trim(),"");
  }
});

test("new committed history never inherits the private archive commit or its blob",()=>{
  const objects=git("rev-list","--objects",`${BASE}..HEAD`).trim().split("\n");
  assert.ok(objects.every(line=>line.split(" ")[0]!==PRIVATE_ARCHIVE_BLOB));
  const commits=git("rev-list",`${BASE}..HEAD`).trim().split("\n");
  assert.ok(!commits.includes(PRIVATE_ARCHIVE_COMMIT));
  for(const commit of commits.filter(Boolean)){
    for(const path of git("diff-tree","--no-commit-id","--name-only","--diff-filter=AM","-r",commit).trim().split("\n").filter(Boolean)){
      assert.doesNotMatch(path,/\.(?:zip|dump|sqlite|db|pem|p12|pfx)$/i);
      assert.doesNotMatch(path,/(?:^|\/)(?:private-download|attached_assets|\.env[^/]*)(?:\/|$)/);
    }
  }
});
