import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Test actual installation behavior, not an old release string or a comment.
export async function verifySwResources(required){
  const handlers=new Map(),resources=[];
  let cacheName="",pending;
  vm.runInNewContext(fs.readFileSync("sw.js","utf8"),{
    self:{addEventListener:(type,handler)=>handlers.set(type,handler),skipWaiting:()=>Promise.resolve()},
    caches:{open:async name=>{cacheName=name;return {addAll:async files=>resources.push(...files)}}},
    URL,console
  });
  handlers.get("install")({waitUntil:promise=>{pending=promise}});
  await pending;
  assert.ok(cacheName.startsWith("warboost-"));
  for(const resource of required)assert.ok(resources.some(x=>x.split("?")[0].replace(/^\.\//,"").replace(/^\//,"")===resource),`Missing cached ${resource}`);
  return {cacheName,resources};
}