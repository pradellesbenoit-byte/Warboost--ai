import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const serverSharedModules=["../lib/shop-catalog.js","../lib/resource-acquisition.js"];
for(const relativePath of serverSharedModules){
  const source=await readFile(new URL(relativePath,import.meta.url),"utf8");
  assert.doesNotMatch(
    source,
    /from\s*["'][^"']+\?v=/,
    `${relativePath} is shared with Vercel functions and must not use browser cache-query imports.`,
  );
}

const serviceWorker=await readFile(new URL("../sw.js",import.meta.url),"utf8");
assert.ok(serviceWorker.includes('"/lib/shop-catalog.js"'),"The unversioned catalogue import should be cached for offline browser use.");
assert.ok(serviceWorker.includes('"/lib/shop-observations-2026-09-28.js"'),"The unversioned observations import should be cached for offline browser use.");

const [state,health,advice,sync]=await Promise.all([
  import("../api/state.js"),
  import("../api/health.js"),
  import("../api/advice.js"),
  import("../api/sync.js"),
]);
for(const handler of [state.default,health.default,advice.default,sync.default]){
  assert.equal(typeof handler,"function","Each API entrypoint should load as a handler.");
}

function mockResponse(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){this.headers[name]=value},
    status(code){this.statusCode=code;return this},
    json(body){this.body=body;return this},
  };
}

const stateResponse=mockResponse();
await state.default({method:"GET",url:"/api/state?restore=1",query:{restore:"1"},headers:{}},stateResponse);
assert.equal(stateResponse.statusCode,401,"An unauthenticated restore request should reach normal auth handling.");
assert.equal(stateResponse.body?.error,"AUTH_REQUIRED");

const healthResponse=mockResponse();
await health.default({method:"GET",url:"/api/health?clock=1",query:{clock:"1"},headers:{}},healthResponse);
assert.equal(healthResponse.statusCode,200,"The clock-only health endpoint should load without external services.");
assert.equal(healthResponse.body?.clock_only,true);

console.log("beta API import verification passed");