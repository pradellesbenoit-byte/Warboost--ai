import assert from "node:assert/strict";
import fs from "node:fs";
import {PGlite} from "@electric-sql/pglite";
// Ephemeral in-memory PostgreSQL only. Never reads environment credentials or connects to Supabase.
const db=new PGlite();
const run=sql=>db.exec(sql),rows=async sql=>(await db.query(sql)).rows;
const alice="50000000-0000-4000-8000-000000000001",bob="50000000-0000-4000-8000-000000000002";
const migrate=async name=>run(fs.readFileSync(`supabase/${name}`,"utf8").replace(/create extension if not exists pgcrypto;/gi,""));
try{
  await run(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
    create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
    insert into auth.users(id,email) values('${alice}','alice@example.test'),('${bob}','bob@example.test');`);
  for(const name of ["schema.sql","migration_v2_5_26_beta_invites.sql","migration_v2_5_28_hf8_6_28_integrity.sql","migration_v2_5_28_hf8_commercial_readiness.sql","migration_v2_5_32_stripe_test_01.sql","migration_v2_5_32_stripe_test_02_beta_cohort.sql","migration_v2_5_32_beta_activation_atomic.sql"]){
    await migrate(name);
  }
  for(let i=0;i<2;i++){await migrate("migration_security_account_deletion.sql");await migrate("migration_security_function_hardening.sql")}
  await migrate("audit_security_rls.sql");
  const functions=await rows(`select oid::regprocedure::text signature,proconfig,prosecdef,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') member,has_function_privilege('service_role',oid,'EXECUTE') server from pg_proc where pronamespace='public'::regnamespace and prosecdef`);
  assert.ok(functions.length>=15);
  for(const f of functions){assert.equal(f.anon,false,f.signature);assert.equal(f.member,false,f.signature);assert.ok(f.proconfig.some(p=>p==="search_path=pg_catalog, public, pg_temp"),f.signature)}
  await assert.rejects(run(`set role authenticated;select public.wb1_delete_account_data('${bob}');`),/permission denied/);
  await run("reset role;rollback;");
  await run(`insert into auth.sessions(user_id) values('${alice}'),('${bob}');
    insert into wb1_profiles(player_id,state) values('${alice}','{"player":{"name":"Alice"}}'),('${bob}','{"player":{"name":"Bob"}}');
    insert into wb1_snapshots(player_id,state) values('${alice}','{}'),('${bob}','{}');
    insert into wb1_alliances(id,tag,server_id,invite_code,owner_player_id,roster) values('60000000-0000-4000-8000-000000000001','TEST','884','isolated-invite','${alice}','[{"name":"Alice","role":"R5","player_id":"${alice}","warboost_linked":true},{"name":"Bob","role":"R4","player_id":"${bob}"}]');
    insert into wb1_alliance_members(alliance_id,player_id,role) values('60000000-0000-4000-8000-000000000001','${alice}','R5'),('60000000-0000-4000-8000-000000000001','${bob}','R4');
    insert into wb1_beta_invites(email,status,accepted_user_id) values('alice@example.test','accepted','${alice}'),('bob@example.test','accepted','${bob}');
    insert into warboost_pro_grants(user_id,grant_type,source) values('${alice}','beta','fixture'),('${bob}','beta','fixture');
    insert into wb1_support_tickets(id,ticket_no,player_id,subject,description,attachment_path) values('70000000-0000-4000-8000-000000000001','WB-20261006-AAAAAA','${alice}','Request','fixture','WB-20261006-AAAAAA/1791234567000-aaaaaaaa.jpg');
    insert into wb1_support_tickets(id,ticket_no,player_id,subject,description) values('70000000-0000-4000-8000-000000000002','WB-20261006-BBBBBB','${bob}','Other request','keep');
    insert into wb1_support_messages(ticket_id,author_player_id,body) values('70000000-0000-4000-8000-000000000001','${alice}','fixture'),('70000000-0000-4000-8000-000000000002','${bob}','keep');
    insert into storage.objects values('warboost-support','WB-20261006-AAAAAA/1791234567000-aaaaaaaa.jpg');`);
  const before=JSON.stringify(await rows(`select player_id,state from wb1_profiles where player_id='${bob}'`));
  assert.equal((await rows(`select public.wb1_prepare_account_deletion('${alice}') result`))[0].result.attachments.length,1);
  await assert.rejects(run(`select public.wb1_delete_account_data('${alice}')`),/attachments_remaining/);
  assert.equal((await rows(`select count(*)::int n from auth.users where id='${alice}'`))[0].n,1,"failed transaction keeps identity");
  await run(`delete from storage.objects where name='WB-20261006-AAAAAA/1791234567000-aaaaaaaa.jpg';
    insert into warboost_billing_accounts(user_id,stripe_customer_id) values('${alice}','cus_fixture');`);
  assert.equal((await rows(`select public.wb1_prepare_account_deletion('${alice}') result`))[0].result.blocked,true);
  await assert.rejects(run(`select public.wb1_delete_account_data('${alice}')`),/support_required/);
  await run(`delete from warboost_billing_accounts where user_id='${alice}';set role service_role;`);
  assert.equal((await rows(`select public.wb1_delete_account_data('${alice}') result`))[0].result.deleted,true);
  await run("reset role;");
  assert.equal((await rows(`select count(*)::int n from auth.users where id='${alice}'`))[0].n,0);
  for(const table of ["wb1_profiles","wb1_snapshots","wb1_alliance_members","wb1_support_tickets","wb1_support_messages"]){
    const field=table==="wb1_support_messages"?"author_player_id":"player_id";
    assert.equal((await rows(`select count(*)::int n from ${table} where ${field}='${alice}'`))[0].n,0,table);
    assert.equal((await rows(`select count(*)::int n from ${table} where ${field}='${bob}'`))[0].n,1,`${table}: other account preserved`);
  }
  assert.equal(JSON.stringify(await rows(`select player_id,state from wb1_profiles where player_id='${bob}'`)),before);
  assert.equal((await rows(`select role from wb1_alliance_members where player_id='${bob}'`))[0].role,"R4");
  assert.equal((await rows(`select count(*)::int n from warboost_pro_grants where user_id='${bob}'`))[0].n,1);
  assert.equal((await rows(`select count(*)::int n from wb1_beta_invites where accepted_user_id='${bob}'`))[0].n,1);
  const alliance=(await rows("select * from wb1_alliances"))[0];
  assert.equal(alliance.roster.length,2);assert.equal(alliance.roster[0].role,"R5");
  assert.equal(alliance.roster[0].player_id,undefined);assert.equal(alliance.roster[1].player_id,bob);
  assert.equal(alliance.roster[0].identity_basis,"account-deleted");
  assert.equal(alliance.owner_player_id,"");
  await assert.rejects(run(`insert into wb1_profiles(player_id,state) values('${alice}','{}')`),/account_not_found/);
  await assert.rejects(run(`insert into wb1_support_tickets(ticket_no,player_id,subject,description) values('orphan','${alice}','x','x')`),/account_not_found/);
  console.log("PASS isolated PostgreSQL migrations: SQL execution/idempotence, fixed search_path, anon/authenticated RPC denial, RLS audit, service-role deletion, Storage fail-closed, Stripe block, rollback, session/profile/ticket purge, other users/ranks/PRO/invitations preserved and orphan writes rejected.");
}finally{await db.close()}
