import {cp, mkdir, readFile, readdir, rm} from "node:fs/promises";
import {posix} from "node:path";

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
console.log(`PASS web build: ${pages.length} original pages, PWA and ${visited.size} browser modules in ${out}; native/server/private files excluded.`);
