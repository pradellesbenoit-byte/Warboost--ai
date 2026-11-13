import {cp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {posix} from "node:path";

// Publish original browser sources, never the native HTML transformations.
// API routes remain at repository root for Vercel's serverless discovery.
const out="web-dist";
const pages=["index.html","offline.html","privacy.html","security.html","legal.html","delete-account.html","reset-password.html","support-admin.html"];
const roots=["app.js","publisher-ui.js","i18n.js","sw.js","delete-account-page.js","reset-password.js","support-admin.js"];
function isUnpublishedDraft(html){
  const draft=/\bBROUILLON\s+NON\s+(?:VALID[ÉE]|PUBLI[ÉE])(?:\s|<|$)/i.test(html);
  const noindex=[...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag])=>
    /name\s*=\s*["']robots["']/i.test(tag)&&/content\s*=\s*["'][^"']*\bnoindex\b[^"']*["']/i.test(tag));
  return draft&&noindex;
}
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
const publishedPages=[],excludedDraftPages=[];
for(const file of pages){
  if(isUnpublishedDraft(await readFile(file,"utf8"))){excludedDraftPages.push(file);continue}
  await cp(file,`${out}/${file}`);
  publishedPages.push(file);
}
for(const file of ["manifest.webmanifest",...(await readdir(".")).filter(file=>/\.(css|png|jpg|jpeg|webp|svg|ico)$/.test(file))]){
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
let sw=await readFile("sw.js","utf8");
for(const file of excludedDraftPages)sw=sw.replace(new RegExp(`,\\s*["']/${file}["']`,"g"),"");
await writeFile(`${out}/sw.js`,sw);
for(const match of sw.matchAll(/["']\/(lib\/[^"'?]+\.js)(?:\?[^"']*)?["']/g))await copyModule(match[1]);
console.log(`PASS web build: ${publishedPages.length} published pages, ${excludedDraftPages.length} unpublished drafts excluded (${excludedDraftPages.join(",")||"none"}), PWA and ${visited.size} browser modules in ${out}; native/server/private files excluded.`);
