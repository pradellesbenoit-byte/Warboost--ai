import {cp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {posix} from "node:path";
import {
  collectLocalJsImports,
  collectServiceWorkerModuleUrls,
  relativeOutputSpecifier,
  rewriteLocalJsImports,
  rewriteServiceWorkerModuleUrls,
  versionedLocalJsPath,
} from "./web-module-urls.mjs";

// Publish original browser sources, never the native HTML transformations.
// API routes remain at repository root for Vercel's serverless discovery.
const out="web-dist";
const pages=["index.html","offline.html","privacy.html","security.html","legal.html","delete-account.html","reset-password.html","support-admin.html"];
const roots=["app.js","publisher-ui.js","i18n.js","sw.js","delete-account-page.js","reset-password.js","support-admin.js"];
const WEB_ONLY_NATIVE_BRIDGE=`// Vercel needs this path to exist in the unbundled web module graph.
// Native builds replace it with the real Capacitor bundle from mobile/capacitor-entry.js.
export function registerPlugin(){
  throw new Error("Native Capacitor bridge is not bundled in the web output.");
}
`;
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of [...pages,"manifest.webmanifest",...(await readdir(".")).filter(file=>/\.(css|png|jpg|jpeg|webp|svg|ico)$/.test(file))]){
  await cp(file,`${out}/${file}`);
}
await cp("assets",`${out}/assets`,{recursive:true});
const visited=new Set();
let nativeBridgeStubWritten=false;
async function copyModule(file,query=""){
  file=posix.normalize(file);
  if(!/^(?:lib\/[\w/-]+\.js|[\w-]+\.js)$/.test(file))throw new Error(`Non-public module: ${file}`);
  const outputPath=versionedLocalJsPath(file,query);
  const key=`${file}\0${query}`;
  if(visited.has(key))return outputPath;
  visited.add(key);
  const source=await readFile(file,"utf8");
  const references=collectLocalJsImports(source);
  for(const reference of references){
    // The web graph needs a resolvable fail-closed bridge stub. Native builds
    // independently bundle the real Capacitor entrypoint into mobile-dist.
    if(file==="lib/mobile-runtime.js"&&reference.path==="./mobile-capacitor.js"){
      const targetSource=posix.normalize(posix.join(posix.dirname(file),reference.path));
      const targetOutput=versionedLocalJsPath(targetSource,reference.query);
      const destination=`${out}/${targetOutput}`;
      await mkdir(posix.dirname(destination),{recursive:true});
      await writeFile(destination,WEB_ONLY_NATIVE_BRIDGE);
      nativeBridgeStubWritten=true;
      continue;
    }
    await copyModule(
      posix.normalize(posix.join(posix.dirname(file),reference.path)),
      reference.query,
    );
  }
  let output= rewriteLocalJsImports(source,(reference)=>{
    const targetSource=posix.normalize(posix.join(posix.dirname(file),reference.path));
    const targetOutput=versionedLocalJsPath(targetSource,reference.query);
    return relativeOutputSpecifier(outputPath,targetOutput);
  });
  if(file==="sw.js")output=rewriteServiceWorkerModuleUrls(output);
  const destination=`${out}/${outputPath}`;
  await mkdir(posix.dirname(destination),{recursive:true});
  await writeFile(destination,output);
  return outputPath;
}
for(const file of roots)await copyModule(file);
// Keep modules explicitly cached by the PWA even if not statically imported.
const sw=await readFile("sw.js","utf8");
for(const reference of collectServiceWorkerModuleUrls(sw))await copyModule(reference.path,reference.query);
console.log(`PASS web build: ${pages.length} original pages, PWA and ${visited.size+Number(nativeBridgeStubWritten)} browser modules/assets in ${out}; local module cache versions use query-free paths; native/server/private files excluded.`);
