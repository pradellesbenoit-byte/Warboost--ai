import {readdir,readFile,writeFile,mkdir,cp,rm} from "node:fs/promises";
import {build} from "esbuild";
const out="mobile-dist";
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
// Explicit public inputs: never copy api/, server modules, SQL, secrets or repository metadata.
const pages=["index.html","privacy.html","security.html","legal.html","delete-account.html","offline.html","reset-password.html"];
const scripts=["app.js","i18n.js","delete-account-page.js","reset-password.js"];
for(const file of await readdir("."))if(file.endsWith(".css")||scripts.includes(file)||file==="manifest.webmanifest")await cp(file,`${out}/${file}`);
await cp("assets",`${out}/assets`,{recursive:true});
const visited=new Set();
async function moduleTree(file){
  if(visited.has(file))return;visited.add(file);
  const source=await readFile(file,"utf8");
  await mkdir(`${out}/${file.substring(0,file.lastIndexOf("/"))}`,{recursive:true});
  await cp(file,`${out}/${file}`);
  for(const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.js)(?:\?[^"']*)?["']/g)){
    const {posix}=await import("node:path");
    await moduleTree(posix.normalize(posix.join(posix.dirname(file),match[1])));
  }
}
for(const file of scripts)await moduleTree(file);
await moduleTree("lib/mobile-runtime.js");
await cp("mobile/native.css",`${out}/native.css`);
for(const file of pages){
  let html=await readFile(file,"utf8");
  html=html.replace("<html ", '<html class="warboost-native" ');
  html=html.replace("</head>",`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://localhost capacitor://localhost; connect-src 'self' https://beta.warboost.fr https://*.supabase.co https://*.supabase.in; object-src 'none'; base-uri 'self'"><link rel="stylesheet" href="/native.css"><script type="module" src="/lib/mobile-runtime.js"></script></head>`);
  await writeFile(`${out}/${file}`,html);
}
await build({entryPoints:["mobile/capacitor-entry.js"],outfile:`${out}/lib/mobile-capacitor.js`,bundle:true,format:"esm",minify:true});
console.log(`PASS mobile web build: ${pages.length} public pages and ${visited.size} original JS modules; APIs/secrets excluded.`);
