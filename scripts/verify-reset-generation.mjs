import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {normalizeResetGeneration,resetGenerationDecision,resetGenerationRequestMatches,
  quarantineOwnedAccountCaches,preserveForeignCacheBeforeReplace} from "../lib/reset-generation.js";

const USER_A="10000000-0000-4000-8000-000000000001";
const USER_B="20000000-0000-4000-8000-000000000002";
const migration=await readFile(new URL("../supabase/migration_v2_5_34_account_reset_generation.sql",import.meta.url),"utf8");
const appSource=await readFile(new URL("../app.js",import.meta.url),"utf8");
const stateApi=await readFile(new URL("../api/state.js",import.meta.url),"utf8");
const syncApi=await readFile(new URL("../api/sync.js",import.meta.url),"utf8");
const identityHandler=await readFile(new URL("../lib/identity-onboarding-handler.js",import.meta.url),"utf8");

assert.equal(normalizeResetGeneration("2"),2);
assert.equal(normalizeResetGeneration("-1"),null);
assert.equal(resetGenerationDecision(null,0).action,"allow_legacy");
assert.equal(resetGenerationDecision(null,1).action,"invalidate_cache");
assert.equal(resetGenerationDecision(0,1).action,"invalidate_cache");
assert.equal(resetGenerationDecision(2,1).reason,"server_generation_rollback");
assert.equal(resetGenerationRequestMatches(0,0),true);
assert.equal(resetGenerationRequestMatches(undefined,0),false);
assert.equal(resetGenerationRequestMatches(0,1),false);
assert.match(appSource,/reset_generation:resetGenerationValue/,"client writes must carry the verified generation");
assert.match(appSource,/rosterImportRequest\(candidate,lang\),reset_generation:resetGenerationValue/,
  "roster writes must carry the verified generation");
assert.match(appSource,/pullServerState\(staleInMemory,\{fastRestore:true\}\)/,"a stale write must reread the server epoch before retry");
assert.match(stateApi,/resetGenerationRequestMatches\(req\.body\?\.reset_generation,reset_generation\)/);
assert.match(syncApi,/resetGenerationRequestMatches\(req\.body\?\.reset_generation,reset_generation\)/);
assert.match(identityHandler,/resetGenerationRequestMatches\(req\.body\?\.reset_generation,reset_generation\)/);
assert.match(appSource,/resetGenerationVerifiedFor\(userId\)/,"client may not write before epoch verification");

class MemoryStorage{
  values=new Map();
  getItem(key){return this.values.has(key)?this.values.get(key):null}
  setItem(key,value){this.values.set(key,String(value))}
  removeItem(key){this.values.delete(key)}
}
const storage=new MemoryStorage();
const accountA={player_id:USER_A,player:{name:"A"},squads:[{power:1}]};
const accountB={player_id:USER_B,player:{name:"B"},squads:[{power:2}]};
storage.setItem("game",JSON.stringify(accountA));
storage.setItem("backup",JSON.stringify({state:accountA}));
storage.setItem(`account:${USER_A}`,JSON.stringify(accountA));
storage.setItem(`account:${USER_B}`,JSON.stringify(accountB));
storage.setItem("language","fr");
storage.setItem("auth-token","not-a-real-token");
const moved=quarantineOwnedAccountCaches(storage,{userId:USER_A,serverGeneration:1,
  keys:{store:"game",backup:"backup",accountPrefix:"account:",quarantinePrefix:"quarantine:"}});
assert.deepEqual(moved,{ok:true,captured:3});
assert.equal(storage.getItem("game"),null);
assert.equal(storage.getItem("backup"),null);
assert.equal(storage.getItem(`account:${USER_A}`),null);
assert.ok(storage.getItem(`account:${USER_B}`));
assert.equal(storage.getItem("language"),"fr");
assert.equal(storage.getItem("auth-token"),"not-a-real-token");
const foreignStorage=new MemoryStorage();
foreignStorage.setItem("game",JSON.stringify(accountB));
const preserved=preserveForeignCacheBeforeReplace(foreignStorage,{key:"game",userId:USER_A,archiveKey:"archive"});
assert.deepEqual(preserved,{ok:true,archived:true});
assert.deepEqual(JSON.parse(foreignStorage.getItem("archive")).entries[0].raw,JSON.stringify(accountB));
const quarantine=JSON.parse(storage.getItem(`quarantine:${USER_A}:1`));
assert.equal(quarantine.entries.length,3);
assert.equal(quarantine.user_id,USER_A);

const db=new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table public.wb1_profiles(player_id text primary key,state jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now());
  create table public.wb1_snapshots(id bigint generated always as identity primary key,player_id text not null,state jsonb not null,source text not null default 'warboost',captured_at timestamptz not null default now());
  create table public.wb1_alliance_members(alliance_id text,player_id text,role text);
  create table public.fake_auth_users(id text primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  insert into public.wb1_profiles(player_id,state) values
    ('${USER_A}','{"player":{"name":"A"}}'),('${USER_B}','{"player":{"name":"B"}}');
  insert into public.wb1_snapshots(player_id,state,source) values
    ('${USER_A}','{"player":{"name":"A"}}','before-reset'),
    ('${USER_B}','{"player":{"name":"B"}}','keep');
  insert into public.wb1_alliance_members(alliance_id,player_id,role) values('alliance-1','${USER_A}','R4');
  insert into public.fake_auth_users(id) values('${USER_A}'),('${USER_B}');
  alter table public.wb1_profiles enable row level security;
  alter table public.wb1_snapshots enable row level security;
  create policy own_profile_read on public.wb1_profiles for select to authenticated using(player_id=auth.uid()::text);
  create policy own_snapshot_read on public.wb1_snapshots for select to authenticated using(player_id=auth.uid()::text);
  create policy own_profile_update on public.wb1_profiles for update to authenticated using(player_id=auth.uid()::text) with check(player_id=auth.uid()::text);
  create policy own_snapshot_write on public.wb1_snapshots for insert to authenticated with check(player_id=auth.uid()::text);
  grant select,insert,update,delete on public.wb1_profiles,public.wb1_snapshots to authenticated;
`);
await db.exec(migration);
await db.exec(`grant all on public.wb1_profiles,public.wb1_snapshots to service_role;
  grant select on public.wb1_alliance_members,public.fake_auth_users to service_role;`);
const rls=await db.query(`select relrowsecurity from pg_class where oid='public.warboost_account_reset_generations'::regclass`);
assert.equal(rls.rows[0].relrowsecurity,true);
const functionSecurity=await db.query(`select p.proname,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_exec,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('wb1_get_own_reset_generation','wb1_enforce_reset_generation','wb1_advance_account_reset_generation')`);
assert.equal(functionSecurity.rows.length,3);
for(const row of functionSecurity.rows){
  assert.equal(row.prosecdef,true,`${row.proname} is SECURITY DEFINER`);
  assert.deepEqual(row.proconfig,["search_path=pg_catalog"],`${row.proname} has pinned search_path`);
  assert.equal(row.anon_exec,false,`${row.proname} is not executable by anon`);
  assert.equal(row.authenticated_exec,row.proname==="wb1_get_own_reset_generation",
    `${row.proname} has minimal authenticated access`);
  assert.equal(row.service_exec,true,`${row.proname} is executable by service_role`);
}
await db.exec(`set request.jwt.claim.sub='${USER_A}'`);
await db.exec(`set role authenticated`);
const current=await db.query(`select public.wb1_get_own_reset_generation() as generation`);
assert.equal(Number(current.rows[0].generation),0);
const ownProfile=await db.query(`select player_id from public.wb1_profiles order by player_id`);
assert.deepEqual(ownProfile.rows,[{player_id:USER_A}]);
await db.query(`update public.wb1_profiles set state=state where player_id=$1`,[USER_A]);
await db.query(`insert into public.wb1_snapshots(player_id,state,source,reset_generation) values($1,'{}','authenticated-current-generation',0)`,[USER_A]);
await assert.rejects(db.query(`select * from public.warboost_account_reset_generations`),/permission denied/);
await db.exec(`reset role`);
await db.exec(`set role service_role`);
const advanced=await db.query(`select public.wb1_advance_account_reset_generation($1) as generation`,[USER_A]);
assert.equal(Number(advanced.rows[0].generation),1);
const afterReset=await db.query(`select player_id from public.wb1_profiles order by player_id`);
assert.deepEqual(afterReset.rows.map(row=>row.player_id),[USER_B]);
const remainingSnapshots=await db.query(`select player_id,source from public.wb1_snapshots`);
assert.deepEqual(remainingSnapshots.rows,[{player_id:USER_B,source:"keep"}]);
const memberships=await db.query(`select player_id,role from public.wb1_alliance_members`);
assert.deepEqual(memberships.rows,[{player_id:USER_A,role:"R4"}]);
const authUsers=await db.query(`select id from public.fake_auth_users order by id`);
assert.equal(authUsers.rows.length,2);
await assert.rejects(
  db.query(`insert into public.wb1_profiles(player_id,state,reset_generation) values($1,'{}',0)`,[USER_A]),
  /reset_required/
);
await db.query(`insert into public.wb1_profiles(player_id,state,reset_generation) values($1,'{\"player\":{\"name\":\"new scan\"}}',1)`,[USER_A]);
await db.query(`insert into public.wb1_snapshots(player_id,state,source,reset_generation) values($1,'{}','new-scan',1)`,[USER_A]);
const newData=await db.query(`select p.state->'player'->>'name' as name,p.reset_generation,s.source from public.wb1_profiles p join public.wb1_snapshots s using(player_id) where p.player_id=$1`,[USER_A]);
assert.deepEqual(newData.rows,[{name:"new scan",reset_generation:1,source:"new-scan"}]);
const oldSnapshot=await db.query(`select count(*)::int as count from public.wb1_snapshots where player_id=$1 and reset_generation=0`,[USER_A]);
assert.equal(oldSnapshot.rows[0].count,0);
const reconnect=await db.query(`select p.state->'player'->>'name' as name,p.reset_generation from public.wb1_profiles p where p.player_id=$1`,[USER_A]);
assert.deepEqual(reconnect.rows,[{name:"new scan",reset_generation:1}]);
const accountBStillPresent=await db.query(`select p.state->'player'->>'name' as name,p.reset_generation from public.wb1_profiles p where p.player_id=$1`,[USER_B]);
assert.deepEqual(accountBStillPresent.rows,[{name:"B",reset_generation:0}]);

// Simulate a legacy/stale writer that bypassed the trigger before a migration rerun.
// Reapplying the migration must preserve generation 0 rather than promote stale rows.
await db.exec(`reset role;
  alter table public.wb1_profiles disable trigger wb1_profiles_reset_generation;
  alter table public.wb1_snapshots disable trigger wb1_snapshots_reset_generation;
  update public.wb1_profiles set state='{"player":{"name":"stale legacy"}}',reset_generation=0 where player_id='${USER_A}';
  update public.wb1_snapshots set state='{}',reset_generation=0 where player_id='${USER_A}'`);
await db.exec(`alter table public.wb1_profiles enable trigger wb1_profiles_reset_generation;
  alter table public.wb1_snapshots enable trigger wb1_snapshots_reset_generation`);
await db.exec(migration);
const generationAfterRerun=await db.query(`select generation from public.warboost_account_reset_generations where player_id=$1`,[USER_A]);
assert.equal(Number(generationAfterRerun.rows[0].generation),1,"migration rerun preserves the active epoch");
const staleAfterRerun=await db.query(`select reset_generation from public.wb1_profiles where player_id=$1`,[USER_A]);
assert.equal(Number(staleAfterRerun.rows[0].reset_generation),0,"migration rerun does not promote the stale profile");
const staleSnapshotAfterRerun=await db.query(`select reset_generation from public.wb1_snapshots where player_id=$1`,[USER_A]);
assert.equal(Number(staleSnapshotAfterRerun.rows[0].reset_generation),0,"migration rerun does not promote the stale snapshot");
await assert.rejects(
  db.query(`update public.wb1_profiles set state='{"player":{"name":"old cache write"}}' where player_id=$1`,[USER_A]),
  /reset_required/
);

console.log("PASS reset-generation: initial/repeated migration, pinned SECURITY DEFINER, least-privilege grants, RLS, stale write rejection, account isolation, and new-generation persistence");
await db.close();
