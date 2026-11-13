import assert from "node:assert/strict";
import {access,readFile,readdir} from "node:fs/promises";
import {posix} from "node:path";
const read=file=>readFile(file,"utf8");
const config=JSON.parse(await read("vercel.json"));
const pkg=JSON.parse(await read("package.json"));
assert.equal(config.outputDirectory,"web-dist");
assert.equal(config.buildCommand,"npm run build:web");
assert.equal(pkg.scripts.build,"npm run build:web");
assert.equal(pkg.scripts["build:mobile"],"node scripts/build-mobile-web.mjs");
assert.equal(pkg.scripts["mobile:sync"],"npm run build:mobile && npx cap sync");
function isUnpublishedDraft(html){
  const draft=/\bBROUILLON\s+NON\s+(?:VALID[ÉE]|PUBLI[ÉE])(?:\s|<|$)/i.test(html);
  const noindex=[...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag])=>
    /name\s*=\s*["']robots["']/i.test(tag)&&/content\s*=\s*["'][^"']*\bnoindex\b[^"']*["']/i.test(tag));
  return draft&&noindex;
}
for(const file of ["index.html","offline.html","privacy.html","security.html","legal.html","delete-account.html","reset-password.html","support-admin.html"]){
  const source=await read(file,"utf8");
  if(isUnpublishedDraft(source)){
    await assert.rejects(access(`web-dist/${file}`),{code:"ENOENT"},`${file} marked unpublished must not be in web output`);
    continue;
  }
  assert.equal(await read(`web-dist/${file}`),source,`${file} must remain unchanged in web output`);
}
assert.doesNotMatch(await read("web-dist/index.html"),/class="warboost-native"|warboost-source-commit|\/native\.css/);
for(const name of ["api","server.mjs","supabase","scripts","docs","package.json",".git",".env","mobile","native.css"]){
  await assert.rejects(access(`web-dist/${name}`),{code:"ENOENT"});
}
async function verifyFiles(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=`${dir}/${entry.name}`;
    if(entry.isDirectory()){await verifyFiles(file);continue;}
    if(!file.endsWith(".js"))continue;
    const source=await read(file);
    // These modules are served unbundled. A static Node/package import aborts
    // the browser's entire module graph before the boot error handler can run.
    // Lazy imports in guarded native/server functions are not static imports.
    for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["']([^"']+)["']/g)){
      assert.match(match[1],/^(?:\.{1,2}\/|\/|https?:\/\/)/,
        `${file}: static import ${match[1]} cannot resolve in an unbundled browser`);
    }
    for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+\.js)(?:\?[^"']*)?["']/g)){
      if(file==="web-dist/lib/mobile-runtime.js"&&match[1]==="./mobile-capacitor.js"){
        assert.match(await read(file),/if\(!isNativeWarBoost\)return/);
        continue;
      }
      await access(posix.normalize(posix.join(posix.dirname(file),match[1])));
    }
  }
}
await verifyFiles("web-dist");
const outputSw=await read("web-dist/sw.js");
for(const file of ["legal.html","privacy.html"]){
  if(isUnpublishedDraft(await read(file,"utf8")))
    assert.equal(outputSw.includes(`"/${file}"`)||outputSw.includes(`'/${file}'`),false,`${file} draft must not be precached`);
}
for(const match of outputSw.matchAll(/["'](\/[^"']+)["']/g)){
  const path=match[1].split("?")[0];
  if(path==="/"||path.startsWith("/api/"))continue;
  await access(`web-dist${path}`);
}
console.log("PASS web output: Vercel configuration, unchanged published pages, drafts excluded from pages and service-worker cache, complete local JS imports/cache assets, no native or private/server sources.");
