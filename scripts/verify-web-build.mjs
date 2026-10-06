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
for(const file of ["index.html","security.html","privacy.html","delete-account.html","support-admin.html","manifest.webmanifest","sw.js","app.js","publisher-ui.js"]){
  assert.equal(await read(`web-dist/${file}`),await read(file),`${file} must remain the original web source`);
}
assert.doesNotMatch(await read("web-dist/index.html"),/class="warboost-native"|warboost-source-commit|\/native\.css/);
for(const name of ["api","server.mjs","supabase","scripts","package.json",".git",".env","mobile","native.css"]){
  await assert.rejects(access(`web-dist/${name}`),{code:"ENOENT"});
}
async function verifyFiles(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=`${dir}/${entry.name}`;
    if(entry.isDirectory()){await verifyFiles(file);continue;}
    if(!file.endsWith(".js"))continue;
    for(const match of (await read(file)).matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+\.js)(?:\?[^"']*)?["']/g)){
      if(file==="web-dist/lib/mobile-runtime.js"&&match[1]==="./mobile-capacitor.js"){
        assert.match(await read(file),/if\(!isNativeWarBoost\)return/);
        continue;
      }
      await access(posix.normalize(posix.join(posix.dirname(file),match[1])));
    }
  }
}
await verifyFiles("web-dist");
for(const match of (await read("sw.js")).matchAll(/["'](\/[^"']+)["']/g)){
  const path=match[1].split("?")[0];
  if(path==="/"||path.startsWith("/api/"))continue;
  await access(`web-dist${path}`);
}
console.log("PASS web output: Vercel configuration, unchanged web/PWA pages, complete local JS imports/cache assets, no native or private/server sources.");
