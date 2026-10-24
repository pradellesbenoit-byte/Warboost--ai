import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const root=new URL("../../",import.meta.url);
test("Vercel serves the web build, preserves API discovery, security and required assets",()=>{
  const config=JSON.parse(readFileSync(new URL("vercel.json",root),"utf8"));
  assert.equal(config.buildCommand,"npm run build:web");
  assert.equal(config.outputDirectory,"web-dist");
  assert.equal(config.cleanUrls,true);
  assert.equal(config.functions["api/scan.js"].includeFiles,"research/hero-references/**");
  assert.equal(config.functions["api/advice.js"].includeFiles,"assets/last-war-knowledge.json");
  assert.ok(existsSync(new URL("assets/last-war-knowledge.json",root)));
  assert.ok(existsSync(new URL("research/hero-references/manifest.json",root)));
  assert.deepEqual(config.rewrites,["time","cron-sync"].flatMap(n=>["","/",".js"].map(s=>({source:`/api/${n}${s}`,destination:"/api/sync"})))); // No catch-all hiding /api routes.
  assert.ok(config.headers[0].headers.some(h=>h.key==="Content-Security-Policy"));
});
test("missing creation RPC fails once, without non-atomic writes or SQL fallback",async()=>{
  process.env.SUPABASE_URL="https://synthetic.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-test-only";
  const calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url,method:init.method});
    return new Response(JSON.stringify({code:"PGRST202",message:"Could not find the function"}),{
      status:404,headers:{"content-type":"application/json"}
    });
  };
  const {createAllianceWithOwner}=await import("../../lib/supabase.js");
  await assert.rejects(createAllianceWithOwner({
    tag:"TEST",server_id:"999",invite_code:"SYNTHETIC",owner_player_id:"synthetic-owner"
  }),error=>error.status===503&&error.code==="alliance_creation_unavailable");
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://synthetic.invalid/rest/v1/rpc/wb1_create_alliance_atomic");
  assert.equal(calls[0].method,"POST");
});
