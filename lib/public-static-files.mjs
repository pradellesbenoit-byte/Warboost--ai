import {readFile, readdir, realpath, lstat} from "node:fs/promises";
import path from "node:path";

const PAGES=["index.html","offline.html","privacy.html","security.html","legal.html","delete-account.html","reset-password.html","support-admin.html"];
const ROOTS=["app.js","publisher-ui.js","i18n.js","sw.js","delete-account-page.js","reset-password.js","support-admin.js"];
const PRIVATE=new Set(["api","node_modules","supabase","scripts","docs","research","attached_assets","screenshots","demo-lastwar-presentation","generated-artifacts","android","ios"]);
const EXTENSIONS=new Set([".html",".css",".js",".webmanifest",".png",".jpg",".jpeg",".webp",".svg",".ico"]);

export function publicRequestKey(rawPath){
  let pathname;
  try{pathname=decodeURIComponent(rawPath.split("?")[0]);}catch{return {status:400};}
  if(!pathname.startsWith("/")||pathname.includes("\\")||/[\u0000-\u001f\u007f]/.test(pathname)||
    pathname.split("/").some(part=>part.startsWith(".")||PRIVATE.has(part)))return {status:403};
  if(pathname==="/")pathname="/index.html";
  if(!path.posix.extname(pathname))pathname+=".html";
  if(!EXTENSIONS.has(path.posix.extname(pathname).toLowerCase()))return {status:403};
  return {key:pathname,status:200};
}

// Only startup-owned names may reach the filesystem. HTTP input is never a filename.
// Snapshot bytes also remove the realpath/read symlink race and forbid all links.
export async function createPublicStaticFiles(root,{pages=PAGES,roots=ROOTS}={}){
  root=await realpath(root);
  const files=new Map(),visited=new Set();
  async function snapshot(name){
    if(name.split("/").some(part=>part.startsWith(".")||PRIVATE.has(part)))throw new Error("private_public_asset");
    const file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep))throw new Error("outside_public_root");
    let current=root;
    for(const part of name.split("/")){
      current=path.join(current,part);
      if((await lstat(current)).isSymbolicLink())throw new Error("public_symlink_forbidden");
    }
    const resolved=await realpath(file);
    if(!resolved.startsWith(root+path.sep))throw new Error("outside_public_root");
    const info=await lstat(resolved);
    if(!info.isFile())throw new Error("public_asset_not_file");
    const data=await readFile(resolved);
    files.set("/"+name,{data,extension:path.extname(name).toLowerCase()});
    return data.toString("utf8");
  }
  for(const name of [...pages,"manifest.webmanifest"])await snapshot(name);
  for(const entry of await readdir(root,{withFileTypes:true}))
    if(/\.(css|png|jpg|jpeg|webp|svg|ico)$/.test(entry.name))await snapshot(entry.name);
  async function assets(dir){
    for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
      const name=dir+"/"+entry.name;
      if(entry.name.startsWith("."))continue;
      if(entry.isSymbolicLink())throw new Error("public_symlink_forbidden");
      if(entry.isDirectory())await assets(name);
      else if(EXTENSIONS.has(path.extname(name).toLowerCase()))await snapshot(name);
    }
  }
  await assets("assets");
  async function module(name){
    if(visited.has(name))return;
    if(!/^(?:lib\/[\w/-]+\.js|[\w-]+\.js)$/.test(name))throw new Error("non_browser_module");
    visited.add(name);
    const source=await snapshot(name);
    for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+\.js)(?:\?[^"']*)?["']/g)){
      if(name==="lib/mobile-runtime.js"&&match[1]==="./mobile-capacitor.js")continue;
      await module(path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1])));
    }
  }
  for(const name of roots)await module(name);
  const sw=files.get("/sw.js")?.data.toString("utf8")||"";
  for(const match of sw.matchAll(/["']\/(lib\/[^"'?]+\.js)(?:\?[^"']*)?["']/g))await module(match[1]);
  return files;
}
