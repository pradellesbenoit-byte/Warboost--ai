import assert from "node:assert/strict";
import {readdirSync,readFileSync,existsSync} from "node:fs";
import path from "node:path";
const root=path.resolve(process.argv[2]||".vercel/output");
const project=path.resolve(root,"../..");
const collect=(dir,predicate)=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=path.join(dir,e.name);
  return e.isDirectory()?(predicate(p)?[p]:collect(p,predicate)):[];
});
const funcs=collect(path.join(root,"functions"),p=>p.endsWith(".func"));
assert.equal(funcs.length,12,"Hobby requires exactly 12 generated functions here");
const names=funcs.map(p=>path.relative(path.join(root,"functions"),p).replace(/\.func$/,"")).sort();
const expected=["advice","alliance-role","cloud-config","health","ingest","invite","join","pro","scan","state","support","sync"];
assert.deepEqual(names,expected.map(n=>`api/${n}`));
for(const func of funcs){
  const cfg=JSON.parse(readFileSync(path.join(func,".vc-config.json")));
  assert.match(cfg.runtime,/^nodejs/);
  assert.ok(cfg.handler);
}
for(const [func,file] of [
  ["sync","server/time.js"],["sync","server/cron-sync.js"],["sync","lib/auth.js"],
  ["scan","server/_hero-reference-images.js"],["scan","server/_scan-timing.js"],
  ["scan","research/hero-references/manifest.json"],
  ["advice","server/_knowledge.js"],["advice","assets/last-war-knowledge.json"]
]){
  const dir=path.join(root,`functions/api/${func}.func`);
  const cfg=JSON.parse(readFileSync(path.join(dir,".vc-config.json")));
  // Vercel CLI externalizes FileFsRef resources via filePathMap. Its packager
  // uploads these source files rather than duplicating them in every .func.
  const mapped=cfg.filePathMap?.[file];
  if(mapped){
    const resolved=path.resolve(project,mapped);
    assert.ok(resolved.startsWith(project+path.sep),"Resource escapes project");
    assert.ok(existsSync(resolved),`Missing mapped ${func} resource ${file}`);
  }else assert.ok(existsSync(path.join(dir,file)),`Missing ${func} resource ${file}`);
}
for(const page of ["index.html","reset-password.html","privacy.html","sw.js","app.js"])
  assert.ok(existsSync(path.join(root,"static",page)),`Missing static ${page}`);
const config=JSON.parse(readFileSync(path.join(root,"config.json")));
assert.equal(config.version,3);
for(const name of ["time","cron-sync"]){
  assert.ok(config.routes.some(r=>r.dest==="/api/sync"&&r.src.includes(name)),`Missing compiled rewrite ${name}`);
}
console.log(`PASS actual Vercel Build Output: ${funcs.length} functions, all 14 public endpoints covered; static pages, backend auth and scan/advice assets included.`);
