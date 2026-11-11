import assert from "node:assert/strict";
import {access,readFile,readdir} from "node:fs/promises";
import {posix} from "node:path";
import {
  collectLocalJsImports,
  collectServiceWorkerModuleUrls,
  relativeOutputSpecifier,
  rewriteLocalJsImports,
  rewriteServiceWorkerModuleUrls,
  versionedLocalJsPath,
} from "./web-module-urls.mjs";
const read=file=>readFile(file,"utf8");
const config=JSON.parse(await read("vercel.json"));
const pkg=JSON.parse(await read("package.json"));
assert.equal(config.outputDirectory,"web-dist");
assert.equal(config.buildCommand,"npm run build:web");
assert.equal(pkg.scripts.build,"npm run build:web");
assert.equal(pkg.scripts["build:mobile"],"node scripts/build-mobile-web.mjs");
assert.equal(pkg.scripts["mobile:sync"],"npm run build:mobile && npx cap sync");
for(const file of ["index.html","security.html","privacy.html","delete-account.html","support-admin.html","manifest.webmanifest","publisher-ui.js"]){
  assert.equal(await read(`web-dist/${file}`),await read(file),`${file} must remain the original web source`);
}
assert.doesNotMatch(await read("web-dist/index.html"),/class="warboost-native"|warboost-source-commit|\/native\.css/);
for(const name of ["api","server.mjs","supabase","scripts","package.json",".git",".env","mobile","native.css","private-download",".local","attached_assets"]){
  await assert.rejects(access(`web-dist/${name}`),{code:"ENOENT"});
}
const webNativeBridge=await read("web-dist/lib/mobile-capacitor.js");
assert.match(webNativeBridge,/Native Capacitor bridge is not bundled in the web output/);
assert.doesNotMatch(webNativeBridge,/@capacitor\/|from\s*["']node:/,
  "the web-only native bridge stub must not import native or Node dependencies");
const nativeBuilder=await read("scripts/build-mobile-web.mjs");
assert.ok(nativeBuilder.indexOf('await moduleTree("lib/mobile-runtime.js")')<nativeBuilder.indexOf('await build({entryPoints:["mobile/capacitor-entry.js"]'),
  "the native builder must replace the web-only stub with the actual Capacitor bundle");
assert.match(nativeBuilder,/outfile:`\$\{out\}\/lib\/mobile-capacitor\.js`/,
  "the native Capacitor bridge keeps its existing mobile output path");
const sourceApp=await read("app.js");
const sourceAppImports=collectLocalJsImports(sourceApp);
const versionedAppImports=sourceAppImports.filter(reference=>reference.query);
assert.equal(versionedAppImports.length,11,"all currently versioned local app-module imports must be rewritten");
const expectedApp=rewriteLocalJsImports(sourceApp,reference=>{
  const targetSource=posix.normalize(posix.join(posix.dirname("app.js"),reference.path));
  return relativeOutputSpecifier("app.js",versionedLocalJsPath(targetSource,reference.query));
});
assert.equal(await read("web-dist/app.js"),expectedApp,"only local module cache queries are rewritten into versioned file paths");
assert.equal(await read("web-dist/sw.js"),rewriteServiceWorkerModuleUrls(await read("sw.js")),
  "service-worker module precache URLs must use the same query-free versioned paths");

// Reproduce all 11 current app references plus a literal dynamic import. A
// Vercel-style filesystem resolver must be able to open each emitted URL
// exactly as written, without stripping a query string on its own.
const regressionFixture=[
  sourceApp,
  '\nconst deferredLoadingScreen = () => import("./lib/loading-screen.js?v=warboost-startup-screen-r2");',
].join("");
const regressionReferences=collectLocalJsImports(regressionFixture).filter(reference=>reference.query);
assert.equal(regressionReferences.length,12,"11 current static imports plus one dynamic-import regression fixture");
const rewrittenFixture=rewriteLocalJsImports(regressionFixture,reference=>{
  const targetSource=posix.normalize(posix.join(posix.dirname("app.js"),reference.path));
  return relativeOutputSpecifier("app.js",versionedLocalJsPath(targetSource,reference.query));
});
for(const reference of collectLocalJsImports(rewrittenFixture)){
  assert.equal(reference.query,"",`query-free browser module path required: ${reference.specifier}`);
  const target=posix.normalize(posix.join(posix.dirname("app.js"),reference.path));
  await access(`web-dist/${target}`);
}
const externalFixture='import x from "https://cdn.example.test/module.js?v=external"; const loadExternal = () => import("https://cdn.example.test/lazy.js?v=external");';
assert.equal(rewriteLocalJsImports(externalFixture,()=>{throw new Error("external imports must not be rewritten")}),externalFixture);
for(const reference of collectServiceWorkerModuleUrls(await read("sw.js"))){
  await access(`web-dist/${versionedLocalJsPath(reference.path,reference.query)}`);
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
    for(const reference of collectLocalJsImports(source)){
      assert.equal(reference.query,"",`${file}: local JS import must not contain a query suffix`);
      if(file==="web-dist/lib/mobile-runtime.js"&&reference.path==="./mobile-capacitor.js"){
        assert.match(await read(file),/if\(!isNativeWarBoost\)return/,
          "web runtime must continue to guard the lazy native import");
      }
      const relativeFile=file.slice("web-dist/".length);
      const target=posix.normalize(posix.join(posix.dirname(relativeFile),reference.path));
      await access(`web-dist/${target}`);
    }
  }
}
await verifyFiles("web-dist");
for(const reference of collectServiceWorkerModuleUrls(await read("web-dist/sw.js"))){
  assert.equal(reference.query,"","service-worker module cache URLs must be query-free");
  await access(`web-dist/${reference.path}`);
}
console.log(`PASS web output: Vercel-style exact-path resolution for ${regressionReferences.length} query import fixtures, query-free versioned module paths, PWA cache assets, no native or private/server sources.`);
