import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";

// Read-only audit of objects reachable from this branch but not its remote base.
// Never scans local backups, credentials, production data or other branches.
const git=(...args)=>execFileSync("git",["--no-optional-locks",...args],{encoding:"utf8"});
assert.equal(git("branch","--show-current").trim(),"public-beta-safe-launch");
const base=git("rev-parse","origin/public-beta-safe-launch").trim();
git("merge-base","--is-ancestor",base,"HEAD");
const commits=git("rev-list",`${base}..HEAD`).trim().split(/\s+/).filter(Boolean);
const forbidden=/^(?:attached_assets\/|\.local\/private-(?:git-backups|scan-captures)\/|generated-artifacts\/)/;
for(const commit of commits){
  const paths=git("diff-tree","--no-commit-id","--name-only","--diff-filter=AM","-r",commit).trim().split("\n").filter(Boolean);
  assert.ok(!paths.some(path=>forbidden.test(path)),`private/generated asset introduced by ${commit}`);
}
let blobs=0,pngs=0;
for(const entry of git("rev-list","--objects","HEAD",`^${base}`).trim().split("\n").filter(Boolean)){
  const oid=entry.split(" ")[0];
  if(git("cat-file","-t",oid).trim()!=="blob")continue;
  blobs++;
  const bytes=execFileSync("git",["--no-optional-locks","cat-file","blob",oid],{maxBuffer:32*1024*1024});
  assert.ok(!bytes.subarray(0,16).toString().startsWith("# v2 git bundle"),"private recovery bundle must not be sent");
  assert.ok(!bytes.subarray(0,16).toString().startsWith("# v3 git bundle"),"private recovery bundle must not be sent");
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))continue;
  pngs++;
  for(let offset=8;offset+12<=bytes.length;){
    const length=bytes.readUInt32BE(offset),type=bytes.toString("ascii",offset+4,offset+8);
    assert.ok(!["eXIf","tEXt","iTXt","zTXt"].includes(type),`image metadata in pending blob ${oid}`);
    offset+=length+12;
  }
}
for(const file of [".gitignore",".replitignore"]){
  const contents=await readFile(file,"utf8");
  for(const path of ["/attached_assets/","/.local/private-git-backups/","/.local/private-scan-captures/","/generated-artifacts/"])
    assert.ok(contents.split(/\r?\n/).includes(path),`${file} must exclude ${path}`);
}
console.log(`PASS pre-push privacy: ${commits.length} commits, ${blobs} new blobs, ${pngs} new PNGs; no private upload, recovery bundle or PNG metadata.`);
