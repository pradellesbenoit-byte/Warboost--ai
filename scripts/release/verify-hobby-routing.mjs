import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import shared from "../../api/sync.js";
import originalTime from "../../server/time.js";
import originalCron from "../../server/cron-sync.js";
const root=new URL("../../",import.meta.url);
const before="2cde1309e787f1b129f518e2c37735b592a77ef6";
const git=(path)=>execFileSync("git",["show",`${before}:${path}`],{encoding:"utf8"});
const invoke=async(handler,{url="/api/sync",method="POST",headers={},query={},body={}}={})=>{
  const result={headers:{}};
  const res={
    setHeader(k,v){result.headers[k]=v},
    status(n){result.status=n;return this},
    json(body){result.body=body;return this},
    end(body){result.body=body;return this}
  };
  await handler({url,method,headers,query,body},res);
  return result;
};
test("source deployment contains exactly twelve entry points and fourteen public routes",()=>{
  assert.equal(readdirSync(new URL("api/",root)).filter(f=>f.endsWith(".js")).length,12);
  for(const name of ["advice","alliance-role","cloud-config","health","ingest","invite","join","pro","scan","state","support","sync"])
    assert.ok(existsSync(new URL(`api/${name}.js`,root)));
  const config=JSON.parse(readFileSync(new URL("vercel.json",root)));
  assert.deepEqual(config.rewrites,["time","cron-sync"].flatMap(n=>["","/",".js"].map(s=>({source:`/api/${n}${s}`,destination:"/api/sync"}))));
});
test("all five relocated modules preserve their bytes and original behavior",()=>{
  for(const name of ["time","cron-sync","_knowledge","_hero-reference-images","_scan-timing"])
    assert.equal(readFileSync(new URL(`server/${name}.js`,root),"utf8"),git(`api/${name}.js`),name);
  for(const name of ["state","pro","invite","join","alliance-role","support","cloud-config","health","ingest"])
    assert.equal(readFileSync(new URL(`api/${name}.js`,root),"utf8"),git(`api/${name}.js`),name);
});
test("time keeps its methods, payload, headers and optional aliases",async()=>{
  for(const method of ["GET","POST","HEAD","OPTIONS"]){
    const a=await invoke(shared,{url:"/api/time?clock=1",method});
    const b=await invoke(originalTime,{url:"/api/time?clock=1",method});
    assert.equal(a.status,b.status);
    assert.deepEqual(a.headers,b.headers);
    for(const k of Object.keys(b.body).filter(k=>!["now","unix_ms"].includes(k)))assert.deepEqual(a.body[k],b.body[k]);
  }
  for(const url of ["/api/time/","/api/time.js"])assert.equal((await invoke(shared,{url,method:"GET"})).status,200);
});
test("cron keeps its authorization and cannot be selected using client query fields",async()=>{
  process.env.CRON_SECRET="synthetic-cron-only";
  try{
    for(const method of ["GET","POST"]){
      assert.deepEqual(await invoke(shared,{url:"/api/cron-sync",method}),await invoke(originalCron,{url:"/api/cron-sync",method}));
      assert.equal((await invoke(shared,{url:"/api/cron-sync",method,headers:{authorization:"Bearer wrong"}})).status,401);
    }
    assert.equal((await invoke(shared,{url:"/api/sync?route=time&path=/api/time",method:"GET",query:{route:"time",path:"/api/time"}})).status,405);
    assert.equal((await invoke(shared,{url:"/api/cron-sync?route=time",method:"GET",query:{route:"time"}})).status,401);
  }finally{delete process.env.CRON_SECRET}
});
test("unknown, encoded and prototype paths fail closed",async()=>{
  for(const url of ["/api/_knowledge","/api/pro","/api/__proto__","/api/%74ime","/other/time"])
    assert.equal((await invoke(shared,{url,method:"GET"})).status,404,url);
});
test("critical user routes still reject missing identity without external calls",async()=>{
  process.env.SUPABASE_URL="https://synthetic.invalid";
  process.env.SUPABASE_ANON_KEY="synthetic-public-only";
  process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-service-only";
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error("External network forbidden in route test")};
  try{
    for(const name of ["state","invite","join","alliance-role"]){
      const {default:handler}=await import(`../../api/${name}.js`);
      const result=await invoke(handler,{url:`/api/${name}`,body:{invite_code:"SYNTHETIC-ONLY"}});
      assert.equal(result.status,401,name);
    }
    assert.equal((await invoke(shared,{url:"/api/sync"})).status,401);
    assert.equal((await invoke(shared,{url:"/api/time?route=cron-sync",method:"GET"})).status,200);
    assert.equal(calls,0);
  }finally{
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
