import {cp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {posix} from "node:path";
import {build as bundle} from "esbuild";

// Publish original browser sources, never the native HTML transformations.
// API routes remain at repository root for Vercel's serverless discovery.
const out="web-dist";
const pages=["index.html","offline.html","privacy.html","security.html","legal.html","delete-account.html","reset-password.html","support-admin.html"];
const roots=["app.js","publisher-ui.js","i18n.js","sw.js","delete-account-page.js","reset-password.js","support-admin.js"];
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of [...pages,"manifest.webmanifest",...(await readdir(".")).filter(file=>/\.(css|png|jpg|jpeg|webp|svg|ico)$/.test(file))]){
  await cp(file,`${out}/${file}`);
}
await cp("assets",`${out}/assets`,{recursive:true});
const visited=new Set();
async function copyModule(file){
  if(visited.has(file))return;
  if(!/^(?:lib\/[\w/-]+\.js|[\w-]+\.js)$/.test(file))throw new Error(`Non-public module: ${file}`);
  visited.add(file);
  const source=await readFile(file,"utf8");
  await mkdir(posix.dirname(`${out}/${file}`),{recursive:true});
  await cp(file,`${out}/${file}`);
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+\.js)(?:\?[^"']*)?["']/g)){
    // Generated only for Capacitor; guarded by isNativeWarBoost in this module.
    if(file==="lib/mobile-runtime.js"&&match[1]==="./mobile-capacitor.js")continue;
    await copyModule(posix.normalize(posix.join(posix.dirname(file),match[1])));
  }
}
for(const file of roots)await copyModule(file);
// Keep modules explicitly cached by the PWA even if not statically imported.
const sw=await readFile("sw.js","utf8");
for(const match of sw.matchAll(/["']\/(lib\/[^"'?]+\.js)(?:\?[^"']*)?["']/g))await copyModule(match[1]);

// The OCR engine and all of its runtime data are self-hosted. Never publish a
// CDN fallback or place the large WASM/model files in the source tree.
const localOcrRoot=`${out}/assets/local-ocr`;
const localOcrCore=`${localOcrRoot}/core`;
const localOcrLang=`${localOcrRoot}/lang`;
await mkdir(localOcrCore,{recursive:true});await mkdir(localOcrLang,{recursive:true});
const packageJson=JSON.parse(await readFile("package.json","utf8"));
if(packageJson.devDependencies?.["tesseract.js"]!=="7.0.0"||
   packageJson.devDependencies?.["@tesseract.js-data/eng"]!=="1.0.0"||
   packageJson.devDependencies?.["@tesseract.js-data/fra"]!=="1.0.0"){
  throw new Error("Local OCR packages must remain pinned to the reviewed versions.");
}
await cp("node_modules/tesseract.js/dist/worker.min.js",`${localOcrRoot}/worker.min.js`);
await cp("node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt",`${localOcrRoot}/worker.min.js.LICENSE.txt`);
for(const file of ["tesseract-core-lstm.wasm.js","tesseract-core-simd-lstm.wasm.js","tesseract-core-relaxedsimd-lstm.wasm.js"]){
  await cp(`node_modules/tesseract.js-core/${file}`,`${localOcrCore}/${file}`);
}
for(const code of ["eng","fra"]){
  await cp(`node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`,`${localOcrLang}/${code}.traineddata.gz`);
}
await cp("node_modules/tesseract.js-core/LICENSE",`${localOcrRoot}/TESSERACT-CORE-LICENSE.txt`);
await writeFile(`${localOcrRoot}/NOTICE.txt`,
  "Local OCR assets (no external OCR service):\\n"+
  "tesseract.js 7.0.0 — Apache-2.0; worker notice is in worker.min.js.LICENSE.txt.\\n"+
  "tesseract.js-core 7.0.0 — Apache-2.0; see TESSERACT-CORE-LICENSE.txt.\\n"+
  "@tesseract.js-data/eng 1.0.0 and @tesseract.js-data/fra 1.0.0 — MIT, 4.0.0_best_int traineddata.\\n"+
  "Source: https://github.com/naptha/tesseract.js and https://github.com/naptha/tessdata.\\n");
await bundle({
  entryPoints:["lib/local-scan-ocr-engine.js"],
  outfile:`${localOcrRoot}/ocr-engine.js`,
  bundle:true,platform:"browser",format:"esm",target:["es2020"],minify:true,
  legalComments:"external",sourcemap:false
});
console.log(`PASS web build: ${pages.length} original pages, PWA, ${visited.size} browser modules and self-hosted local OCR assets in ${out}; native/server/private files excluded.`);
