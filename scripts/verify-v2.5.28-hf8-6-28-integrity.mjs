import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const migration=read("migration_v2_5_28_hf8_6_28_integrity.sql");
const previousAllianceMigration=read("migration_v2_5_28_hf7_alliance_scope.sql");
const schema=read("supabase/schema.sql");
const supabase=read("lib/supabase.js");
const stateApi=read("api/state.js");
const syncApi=read("api/sync.js");
const inviteApi=read("api/invite.js");
const roleApi=read("api/alliance-role.js");
const supportApi=read("api/support.js");
const app=read("app.js");
const vercel=read("vercel.json");
const server=read("server.mjs");

assert.doesNotMatch(migration,/\b(drop\s+(table|column)|truncate|delete\s+from)\b/i);
assert.doesNotMatch(previousAllianceMigration,/\b(drop\s+(table|column)|truncate|delete\s+from)\b/i);
assert.match(schema,/create table if not exists public\.wb1_profiles/);
assert.match(schema,/player_id text primary key/);
assert.match(schema,/create table if not exists public\.wb1_alliances/);
assert.match(schema,/create table if not exists public\.wb1_alliance_members/);
assert.match(previousAllianceMigration,/add column if not exists server_id text/);
assert.match(previousAllianceMigration,/add column if not exists roster jsonb/);
assert.match(migration,/wb1_create_alliance_atomic/);
assert.match(migration,/insert into public\.wb1_alliances[\s\S]+insert into public\.wb1_alliance_members/);
assert.match(migration,/grant execute[\s\S]+service_role/);
assert.match(supabase,/saveProfileIfUnchanged/);
assert.match(supabase,/updated_at=eq\./);
assert.match(stateApi,/profile_write_conflict/);
assert.match(stateApi,/base_updated_at/);
assert.match(syncApi,/saveProfileIfUnchanged/);
assert.match(inviteApi,/createAllianceWithOwner/);
assert.doesNotMatch(inviteApi,/await createAlliance\(/);
assert.match(roleApi,/expected_updated_at:ctx\.alliance\.updated_at/);
assert.match(roleApi,/expected_updated_at:target\.updated_at/);
assert.match(app,/base_updated_at:cloudRevision/);
assert.match(app,/profile_write_conflict/);
assert.match(app,/cloudRevision=null/);
assert.match(supportApi,/safeDiagnostics/);
assert.match(supportApi,/ATTACHMENT_INVALID/);
assert.match(supportApi,/deleteAttachment/);
assert.match(vercel,/Content-Security-Policy/);
assert.match(server,/path\.join\(ROOT,"api",`\$\{name\}\.js`\)/);

const oldEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,fetch:globalThis.fetch};
try{
  process.env.SUPABASE_URL="https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY="test-only";
  const calls=[];
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes("updated_at=eq.2026-09-18T10%3A00%3A00.000Z"))return new Response(JSON.stringify([{player_id:"p1",state:{player:{name:"A"}},updated_at:"2026-09-18T10:01:00.000Z"}]),{status:200});
    if(String(url).includes("updated_at=eq.stale"))return new Response("[]",{status:200});
    if(String(url).endsWith("/rest/v1/rpc/wb1_create_alliance_atomic"))return new Response(JSON.stringify([{id:"a1",tag:"TAG"}]),{status:200});
    return new Response(JSON.stringify({message:"unexpected mock request"}),{status:500});
  };
  const {saveProfileIfUnchanged,createAllianceWithOwner}=await import(`../lib/supabase.js?integrity=${Date.now()}`);
  const saved=await saveProfileIfUnchanged("p1",{player:{name:"A"}},"2026-09-18T10:00:00.000Z");
  assert.equal(saved.updated_at,"2026-09-18T10:01:00.000Z");
  await assert.rejects(()=>saveProfileIfUnchanged("p1",{player:{name:"B"}},"stale"),error=>error?.status===409&&error?.code==="profile_write_conflict");
  const alliance=await createAllianceWithOwner({tag:"TAG",name:"Tag",server_id:"1",invite_code:"CODE",owner_player_id:"p1",owner_role:"R5"});
  assert.equal(alliance.id,"a1");
  assert.ok(calls.some(call=>call.url.endsWith("/rest/v1/rpc/wb1_create_alliance_atomic")));
}finally{
  globalThis.fetch=oldEnv.fetch;
  if(oldEnv.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldEnv.url;
  if(oldEnv.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldEnv.key;
}

console.log("HF8.6.28 integrity safeguards: PASS");