import assert from "node:assert/strict";
import fs from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import handler from "../api/state.js";
import {normalizeState} from "../lib/normalize.js";
import {BETA_CONSENT_VERSION} from "../lib/beta-access.js";

// Ephemeral PostgreSQL and invented fixtures only. No environment credentials read.
const db=new PGlite(),run=sql=>db.exec(sql),rows=async sql=>(await db.query(sql)).rows;
let passed=0;
async function test(name,body){await body();passed++;console.log("PASS "+name)}
const apply=fs.readFileSync("supabase/migration_profile_roster_trigger_isolation.sql","utf8");
const rollback=fs.readFileSync("supabase/rollback_profile_roster_trigger_isolation.sql","utf8");
const actors=["R1","R2","R4","R5"].map((role,i)=>({role,id:`80000000-0000-4000-8000-00000000000${i+1}`,name:"Fixture"+role}));
const extra="80000000-0000-4000-8000-000000000005",other="80000000-0000-4000-8000-000000000006";
const allianceId="90000000-0000-4000-8000-000000000001",stamp="2026-10-14T18:50:00.000Z";
const roster=actors.map(a=>({name:a.name,player_id:a.id,warboost_linked:true,role:a.role,server_id:"884",alliance_tag:"TEST",hq_level:35,power_m:200}));
const compositions=[["Murphy","Kimberly","Marshall","Williams","Stetmann"],["DVA","Carlie","Morrison","Lucius","Schuyler"],
  ["Tesla","Adam","McGregor","Fiona","Swift"],["Mason","Violet","Scarlett","Monica","Richard"]];
const profiles=actors.map(a=>normalizeState({player_id:a.id,player:{name:a.name,server_id:"884",hq_level:35,role:a.role},
  alliance:{id:allianceId,tag:"TEST",members:roster},squads:[1,2,3,4].map(id=>({id,power:40+id,
    confirmed_composition:compositions[id-1],composition_confirmed_at:stamp,composition_source:"explicit_confirmation",
    heroes:compositions[id-1].map(name=>({name,level:150+id,gear:`slot=0;count=1;level=0|slot=1;count=1;level=${10+id}`}))})),updated_at:stamp}));
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'";
async function as(actor,sql){
  await run(`set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);`);
  try{return await rows(sql)}finally{await run("reset role;")}
}
async function denied(body){
  await assert.rejects(body,error=>{assert.equal(error.code,"42501");return true});
}
async function failedMigration(sql,reason){
  try{await assert.rejects(run(sql),new RegExp(reason))}finally{await run("rollback;reset role;")}
}
try{
  await run(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated;
    create table public.wb1_profiles(player_id text primary key,state jsonb not null,updated_at timestamptz not null default now());
    create table public.wb1_alliances(id uuid primary key,roster jsonb not null);
    create table public.wb1_alliance_members(alliance_id uuid,player_id text,role text);
    alter table wb1_profiles enable row level security;
    alter table wb1_alliances enable row level security;
    alter table wb1_alliance_members enable row level security;
    grant select,insert,update on wb1_profiles to authenticated;
    grant all on wb1_profiles,wb1_alliances,wb1_alliance_members to service_role;
    create policy own_read on wb1_profiles for select to authenticated using(player_id=auth.uid()::text);
    create policy own_insert on wb1_profiles for insert to authenticated with check(player_id=auth.uid()::text);
    create policy own_update on wb1_profiles for update to authenticated using(player_id=auth.uid()::text) with check(player_id=auth.uid()::text);
    insert into auth.users values ${[...actors.map(a=>a.id),extra,other].map(id=>`('${id}')`).join(",")};
    insert into wb1_alliances values('${allianceId}',${literal(roster)});
    insert into wb1_alliance_members values ${actors.map(a=>`('${allianceId}','${a.id}','${a.role}')`).join(",")};
    insert into wb1_profiles(player_id,state) values ${profiles.map(p=>`('${p.player_id}',${literal(p)})`).join(",")};
    create function public.wb1_require_existing_account() returns trigger language plpgsql security definer
      set search_path=pg_catalog,public,pg_temp as $$
      begin perform 1 from auth.users where id::text=new.player_id for key share;
      if not found then raise exception 'account_not_found';end if;return new;end $$;
    create trigger wb1_account_exists before insert or update on wb1_profiles for each row execute function wb1_require_existing_account();
    revoke all on function public.wb1_require_existing_account() from public,authenticated,anon;
    -- Synthetic representation of the reported behavior, NOT the deployed source.
    create function public.wb1_capture_profile_roster_deletions() returns trigger language plpgsql security invoker as $$
    declare item jsonb;
    begin
      perform 1 from public.wb1_alliances;
      for item in select value from jsonb_array_elements(coalesce(new.state#>'{alliance,former_members}','[]')) loop
        update public.wb1_alliances set roster=(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(roster) r where r->>'player_id'<>item->>'player_id')
          where id=(new.state#>>'{alliance,id}')::uuid;
        delete from public.wb1_alliance_members where alliance_id=(new.state#>>'{alliance,id}')::uuid and player_id=item->>'player_id';
      end loop;return new;
    end $$;
    create trigger wb1_capture_profile_roster_deletions_trg before insert or update of state on public.wb1_profiles
      for each row execute function public.wb1_capture_profile_roster_deletions();`);
  const before=JSON.stringify(await rows("select * from wb1_alliances order by id"))+JSON.stringify(await rows("select * from wb1_alliance_members order by player_id"));
  const originalFunction=(await rows("select pg_get_functiondef('public.wb1_capture_profile_roster_deletions()'::regprocedure) as body"))[0].body;
  await test("real SQL reproduces 42501 despite profile owner RLS and grants",async()=>{
    await denied(()=>as(actors[0].id,"update wb1_profiles set state=state where player_id=auth.uid()::text"));
  });
  await failedMigration(apply,"profile_roster_function_definition_review_required");
  await test("migration refuses an unreviewed deployed function before disabling anything",async()=>{
    assert.equal((await rows("select tgenabled from pg_trigger where tgname='wb1_capture_profile_roster_deletions_trg'"))[0].tgenabled,"O");
  });
  await run(`select set_config('warboost.reviewed_profile_roster_function_sha256',
    encode(sha256(convert_to(pg_get_functiondef('public.wb1_capture_profile_roster_deletions()'::regprocedure),'UTF8')),'hex'),false);`);
  await run(apply);
  await test("only offending trigger disabled; function remains invoker; account guard remains enabled",async()=>{
    const triggers=await rows("select tgname,tgenabled from pg_trigger where tgrelid='wb1_profiles'::regclass order by tgname");
    assert.equal(triggers.find(t=>t.tgname==="wb1_account_exists").tgenabled,"O");
    assert.equal(triggers.find(t=>t.tgname==="wb1_capture_profile_roster_deletions_trg").tgenabled,"D");
    assert.equal((await rows("select prosecdef from pg_proc where oid='wb1_capture_profile_roster_deletions()'::regprocedure"))[0].prosecdef,false);
  });
  await test("backup captures complete catalog DDL, not a fabricated production function",async()=>{
    const b=(await rows("select * from wb1_migration_private.profile_roster_trigger_isolation"))[0];
    assert.equal(b.function_definition,originalFunction);assert.equal(b.original_enabled,"O");
    assert.match(b.trigger_definition,/UPDATE OF state/);
  });
  const firstBackup=JSON.stringify(await rows("select * from wb1_migration_private.profile_roster_trigger_isolation"));
  await run(apply);
  await test("repeat migration does not alter original backup",async()=>assert.equal(JSON.stringify(await rows("select * from wb1_migration_private.profile_roster_trigger_isolation")),firstBackup));
  for(const actor of actors){
    await test(actor.role+" own profile edit succeeds without changing any canonical roster",async()=>{
      const previous=(await rows(`select state from wb1_profiles where player_id='${actor.id}'`))[0].state;
      const edited={...previous,player:{...previous.player,hq_level:36},alliance:{...previous.alliance,former_members:[{player_id:actors[3].id,role:"R5"}]}};
      const result=await as(actor.id,`update wb1_profiles set state=${literal(edited)},updated_at=now() where player_id=auth.uid()::text returning state`);
      assert.equal(result[0].state.player.hq_level,36);
      assert.deepEqual(result[0].state.squads,previous.squads);
      assert.equal(JSON.stringify(await rows("select * from wb1_alliances order by id"))+JSON.stringify(await rows("select * from wb1_alliance_members order by player_id")),before);
      await denied(()=>as(actor.id,"select * from wb1_alliances"));
      await denied(()=>as(actor.id,"update wb1_alliances set roster='[]'"));
      await denied(()=>as(actor.id,"delete from wb1_alliance_members"));
    });
  }
  await test("own legacy profile insert retains four squads and real equipment zero",async()=>{
    const legacy={wb10_profile:{heroName1:"Mason"},squads:profiles[0].squads};
    const result=await as(extra,`insert into wb1_profiles(player_id,state) values(auth.uid()::text,${literal(legacy)}) returning state`);
    assert.deepEqual(result[0].state,legacy);
    assert.match(result[0].state.squads[0].heroes[0].gear,/slot=0;count=1;level=0/);
  });
  await test("owner RLS blocks foreign insert, update, and read",async()=>{
    await denied(()=>as(actors[0].id,`insert into wb1_profiles(player_id,state) values('${other}','{}')`));
    assert.equal((await as(actors[0].id,`update wb1_profiles set state='{}' where player_id='${actors[1].id}' returning player_id`)).length,0);
    assert.equal((await as(actors[0].id,`select player_id from wb1_profiles where player_id='${actors[1].id}'`)).length,0);
  });
  await test("metadata backup is inaccessible to clients and service role",async()=>{
    await denied(()=>as(actors[0].id,"select * from wb1_migration_private.profile_roster_trigger_isolation"));
    await run("set role service_role;");
    try{await denied(()=>rows("select * from wb1_migration_private.profile_roster_trigger_isolation"))}finally{await run("reset role;")}
  });
  await test("no alliance grants or RLS policies are added",async()=>{
    const privileges=await rows("select has_table_privilege('authenticated','wb1_alliances','SELECT,UPDATE,DELETE') a,has_table_privilege('authenticated','wb1_alliance_members','SELECT,UPDATE,DELETE') m");
    assert.deepEqual(privileges,[{a:false,m:false}]);
    assert.equal((await rows("select * from pg_policies where tablename in ('wb1_alliances','wb1_alliance_members')")).length,0);
  });
  await run(rollback);await run(rollback);
  await test("rollback is exact/idempotent, changes no data and restores the reported refusal",async()=>{
    assert.equal((await rows("select pg_get_functiondef('wb1_capture_profile_roster_deletions()'::regprocedure) as body"))[0].body,originalFunction);
    await denied(()=>as(actors[0].id,"update wb1_profiles set state=state where player_id=auth.uid()::text"));
    assert.equal(JSON.stringify(await rows("select * from wb1_alliances order by id"))+JSON.stringify(await rows("select * from wb1_alliance_members order by player_id")),before);
  });
  await run("alter table wb1_profiles disable trigger wb1_capture_profile_roster_deletions_trg;");
  await failedMigration(apply,"initial_trigger_not_normally_enabled");
  await test("pre-disabled trigger is never assumed owned by migration",async()=>{
    assert.equal((await rows("select tgenabled from pg_trigger where tgname='wb1_capture_profile_roster_deletions_trg'"))[0].tgenabled,"D");
  });
  await run("alter table wb1_profiles enable trigger wb1_capture_profile_roster_deletions_trg;");
  await run(apply);
  await run("alter function wb1_capture_profile_roster_deletions() security definer;");
  await failedMigration(rollback,"rollback_trigger_drift");
  await test("rollback refuses function drift instead of enabling privileged deletion",async()=>{
    assert.equal((await rows("select tgenabled from pg_trigger where tgname='wb1_capture_profile_roster_deletions_trg'"))[0].tgenabled,"D");
  });
  await run("alter function wb1_capture_profile_roster_deletions() security invoker;");
  await run(rollback);
  await run("alter function wb1_capture_profile_roster_deletions() security definer;");
  await failedMigration(apply,"profile_roster_trigger_shape_changed");
  await test("migration refuses an unexpected definer function",async()=>assert.equal((await rows("select tgenabled from pg_trigger where tgname='wb1_capture_profile_roster_deletions_trg'"))[0].tgenabled,"O"));
  await run("create table wb1_migration_private.unrelated_metadata(value text);insert into wb1_migration_private.unrelated_metadata values('fixture');");
  await failedMigration(apply,"migration_backup_schema_not_exclusive");
  await test("reserved backup schema collision aborts without altering unrelated objects",async()=>{
    assert.deepEqual(await rows("select * from wb1_migration_private.unrelated_metadata"),[{value:"fixture"}]);
  });
}finally{await db.close()}

// Actual backend handler with strictly synthetic network, never actual Supabase.
Object.assign(process.env,{SUPABASE_URL:"https://profile-isolation-fixture.invalid",
  SUPABASE_ANON_KEY:"fixture-public",SUPABASE_SERVICE_ROLE_KEY:"fixture-service"});
const originalFetch=globalThis.fetch;
let actor=actors[0],forged=false,calls=[],failProfileGets=0;
const sessionOwner=new Map(),savedProfiles=new Map();
globalThis.fetch=async(url,options={})=>{
  const u=new URL(String(url));assert.equal(u.origin,"https://profile-isolation-fixture.invalid");
  const method=options.method||"GET",token=String(options.headers?.authorization||"").replace(/^Bearer\s+/i,"");
  const owner=sessionOwner.get(token)||actor.id;calls.push({table:u.pathname.split("/").at(-1),method,owner});
  if(u.pathname==="/auth/v1/user")return new Response(JSON.stringify(forged?{}:{
    id:owner,email:`${owner}@example.test`,email_confirmed_at:"2026-11-01T00:00:00.000Z"
  }),{status:forged?401:200});
  if(u.pathname==="/rest/v1/wb1_profiles"){
    if(method==="PATCH"){
      const state=JSON.parse(options.body).state;
      savedProfiles.set(owner,{state,updated_at:stamp});
      return new Response(JSON.stringify([{state,updated_at:stamp}]));
    }
    if(failProfileGets>0){failProfileGets--;return new Response(JSON.stringify({message:"synthetic network failure"}),{status:503})}
    const filter=u.searchParams.get("player_id")||"";
    if(filter.startsWith("in."))return new Response(JSON.stringify(profiles.map(p=>({player_id:p.player_id,state:p,updated_at:stamp}))));
    const requested=filter.match(/^eq\.(.+)$/)?.[1]||owner;
    const saved=savedProfiles.get(requested),profile=profiles.find(p=>p.player_id===requested);
    return new Response(JSON.stringify([saved||{state:profile,updated_at:stamp}]));
  }
  if(u.pathname==="/rest/v1/wb1_alliances")return new Response(JSON.stringify([{id:allianceId,tag:"TEST",server_id:"884",
    name:"Fixture alliance",owner_player_id:actors[3].id,roster,roster_updated_at:stamp,updated_at:stamp}]));
  if(u.pathname==="/rest/v1/wb1_alliance_members")return new Response(JSON.stringify(u.searchParams.has("player_id")?
    [{alliance_id:allianceId,player_id:actor.id,role:actor.role,updated_at:stamp}]:
    actors.map(a=>({alliance_id:allianceId,player_id:a.id,role:a.role,updated_at:stamp}))));
  return new Response("[]");
};
try{
  for(actor of actors){
    sessionOwner.set("synthetic-session",actor.id);
    await test(actor.role+" actual POST saves only owner profile/snapshot, not roster/link/rank",async()=>{
      let status=200,reply;calls=[];
      const state=JSON.parse(JSON.stringify(profiles[actors.indexOf(actor)]));
      state.alliance.former_members=[{player_id:actors[3].id}];
      for(const member of state.alliance.members){member.role="R5";member.rank_confirmed_source="r5_r4_manual_rank_management";member.rank_confirmed_at="2026-10-15T00:00:00Z";}
      await handler({method:"POST",query:{},headers:{authorization:"Bearer synthetic-session","content-type":"application/json",
        "x-warboost-beta-consent":BETA_CONSENT_VERSION},body:{state,base_updated_at:stamp}},
      {setHeader(){},status(s){status=s;return this},json(j){reply=j;return this}});
      assert.equal(status,200);assert.equal(reply.write_confirmed,true);
      assert.equal(reply.state.player_id,actor.id);
      assert.equal(reply.state.squads.length,4);
      for(let i=0;i<4;i++){
        const expected=profiles[actors.indexOf(actor)].squads[i],actual=reply.state.squads[i];
        assert.equal(actual.id,expected.id);assert.equal(actual.power,expected.power);
        assert.deepEqual(actual.confirmed_composition,expected.confirmed_composition);
        assert.deepEqual(actual.heroes.map(h=>[h.name,h.level,h.gear]),expected.heroes.map(h=>[h.name,h.level,h.gear]));
      }
      assert.ok(calls.some(c=>c.table==="wb1_profiles"&&c.method==="PATCH"));
      assert.ok(calls.filter(c=>c.method!=="GET").every(c=>["wb1_profiles","wb1_snapshots"].includes(c.table)),JSON.stringify(calls));
    });
  }
  const stateRequest=async(token,method="GET",body=null)=>{
    let status=200,reply;
    await handler({method,query:{},headers:{authorization:`Bearer ${token}`,"content-type":"application/json",
      "x-warboost-beta-consent":BETA_CONSENT_VERSION},...(body?{body}:{})},
      {setHeader(){},status(s){status=s;return this},json(j){reply=j;return this}});
    return {status,reply};
  };
  actor=actors[0];sessionOwner.set("device-a-session",actors[0].id);sessionOwner.set("device-b-session",actors[0].id);
  sessionOwner.set("second-account-session",actors[1].id);
  await test("two device sessions restore the same confirmed squads and persist updates for the same owner",async()=>{
    const deviceA=await stateRequest("device-a-session");
    assert.equal(deviceA.status,200);assert.equal(deviceA.reply.state.player_id,actors[0].id);
    assert.deepEqual(deviceA.reply.state.squads[0].confirmed_composition,compositions[0]);
    const updated={...deviceA.reply.state,player:{...deviceA.reply.state.player,hq_level:37}};
    const saved=await stateRequest("device-a-session","POST",{state:updated,base_updated_at:deviceA.reply.updated_at||stamp});
    assert.equal(saved.status,200);assert.equal(saved.reply.write_confirmed,true);
    const deviceB=await stateRequest("device-b-session");
    assert.equal(deviceB.status,200);assert.equal(deviceB.reply.state.player.hq_level,37);
    assert.deepEqual(deviceB.reply.state.squads[0].confirmed_composition,compositions[0]);
    assert.deepEqual(deviceB.reply.state.squads[0].heroes.map(hero=>hero.name),compositions[0]);
  });
  await test("a separate account cannot see another device's saved profile; transient read failure can be retried",async()=>{
    const other=await stateRequest("second-account-session");
    assert.equal(other.status,200);assert.equal(other.reply.state.player_id,actors[1].id);
    assert.notEqual(other.reply.state.player.hq_level,37);
    failProfileGets=1;
    const failed=await stateRequest("device-b-session");
    assert.notEqual(failed.status,200);
    const retry=await stateRequest("device-b-session");
    assert.equal(retry.status,200);assert.equal(retry.reply.state.player.hq_level,37);
  });
  forged=true;
  await test("fake JWT is refused before profile, alliance or snapshot access",async()=>{
    let status,reply;calls=[];
    await handler({method:"POST",query:{},headers:{authorization:"Bearer forged-fixture","content-type":"application/json",
      "x-warboost-beta-consent":BETA_CONSENT_VERSION},body:{state:profiles[0],base_updated_at:stamp}},
      {setHeader(){},status(s){status=s;return this},json(j){reply=j;return this}});
    assert.equal(status,401);assert.equal(reply.diagnostic.write_state,"not_attempted");
    assert.deepEqual(calls,[{table:"user",method:"GET",owner:actors[0].id}]);
  });
}finally{globalThis.fetch=originalFetch}
console.log(`PASS profile-roster isolation: ${passed} groups; actual in-memory PostgreSQL and backend; synthetic identities only; zero external DB calls`);
