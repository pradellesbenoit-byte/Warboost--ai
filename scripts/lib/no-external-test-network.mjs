// Test-process guard only: production code never imports this module.
// Fixtures may inject their own in-memory transports; default HTTP is loopback-only.
import http from "node:http";
import https from "node:https";
const allowed=host=>["localhost","127.0.0.1","::1","[::1]"].includes(String(host||"").toLowerCase());
const denied=()=>{throw new Error("External network forbidden in synthetic validation")};
const fetchOriginal=globalThis.fetch;
globalThis.fetch=(input,...options)=>{
  const url=new URL(typeof input==="string"||input instanceof URL?input:input.url);
  if(!allowed(url.hostname))return Promise.reject(new Error("External network forbidden in synthetic validation"));
  return fetchOriginal(input,...options);
};
for(const transport of [http,https]){
  for(const name of ["request","get"]){
    const original=transport[name];
    transport[name]=function(input,...args){
      const options=typeof input==="string"||input instanceof URL?new URL(input):input;
      if(!allowed(options?.hostname||options?.host?.replace(/:\d+$/,"")))return denied();
      return original.call(this,input,...args);
    };
  }
}
