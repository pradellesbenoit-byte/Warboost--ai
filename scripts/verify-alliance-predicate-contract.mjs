import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";

// Contract model only: these definitions are NOT the uninspected live functions.
// No external connection, migration file, real JWT or player data is used.
const db=new PGlite();let passed=0;
const allianceA="10000000-0000-4000-8000-000000000001",allianceB="10000000-0000-4000-8000-000000000002";
const actors=Array.from({length:6},(_,i)=>`20000000-0000-4000-8000-00000000000${i+1}`);
const check=async(name,body)=>{await body();passed++;console.log("PASS "+name)};
async function as(id,sql,role="authenticated"){
  await db.exec(`set role ${role};select set_config('request.jwt.claim.sub','${id||""}',false);`);
  try{return (await db.query(sql)).rows}finally{await db.exec("reset role")}
}
const query=id=>`select public.is_alliance_member('${id}') as member,public.is_alliance_manager('${id}') as manager`;
try{
  await db.exec(`create role authenticated;create role anon;create schema auth;
    revoke create on schema public from public;grant usage on schema public to authenticated,anon;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.wb1_alliance_members(alliance_id uuid,player_id uuid,role text);
    alter table public.wb1_alliance_members enable row level security;
    insert into public.wb1_alliance_members values
      ('${allianceA}','${actors[0]}','R1'),('${allianceA}','${actors[1]}','R2'),
      ('${allianceA}','${actors[2]}','R4'),('${allianceA}','${actors[3]}','R5'),
      ('${allianceB}','${actors[4]}','R4');
    create function public.is_alliance_member(target_alliance uuid) returns boolean
      language sql stable security definer set search_path=pg_catalog,public,pg_temp as
      $$select exists(select 1 from public.wb1_alliance_members m where
        m.alliance_id=target_alliance and m.player_id=auth.uid())$$;
    create function public.is_alliance_manager(target_alliance uuid) returns boolean
      language sql stable security definer set search_path=pg_catalog,public,pg_temp as
      $$select exists(select 1 from public.wb1_alliance_members m where
        m.alliance_id=target_alliance and m.player_id=auth.uid() and m.role in ('R4','R5'))$$;
    revoke all on function public.is_alliance_member(uuid),public.is_alliance_manager(uuid) from public,anon;
    grant execute on function public.is_alliance_member(uuid),public.is_alliance_manager(uuid) to authenticated;`);
  await check("direct table access stays forbidden despite executable predicates",async()=>{
    await assert.rejects(()=>as(actors[2],"select * from public.wb1_alliance_members"),e=>e.code==="42501");
  });
  await check("anonymous role cannot execute the privileged contract",async()=>{
    await assert.rejects(()=>as("",query(allianceA),"anon"),e=>e.code==="42501");
  });
  await check("missing identity and nonmember are false, not alliance existence evidence",async()=>{
    for(const id of ["",actors[5]])assert.deepEqual(await as(id,query(allianceA)),[{member:false,manager:false}]);
  });
  await check("R1 and R2 are members but cannot become managers",async()=>{
    for(const id of actors.slice(0,2))assert.deepEqual(await as(id,query(allianceA)),[{member:true,manager:false}]);
  });
  await check("R4 and R5 manage only their exact alliance",async()=>{
    for(const id of actors.slice(2,4)){
      assert.deepEqual(await as(id,query(allianceA)),[{member:true,manager:true}]);
      assert.deepEqual(await as(id,query(allianceB)),[{member:false,manager:false}]);
    }
  });
  await check("B manager cannot inspect A through a positive authorization result",async()=>{
    assert.deepEqual(await as(actors[4],query(allianceB)),[{member:true,manager:true}]);
    assert.deepEqual(await as(actors[4],query(allianceA)),[{member:false,manager:false}]);
  });
  await check("NULL and nonexistent alliance identifiers return false",async()=>{
    assert.deepEqual(await as(actors[2],query("30000000-0000-4000-8000-000000000001")),[{member:false,manager:false}]);
    assert.deepEqual(await as(actors[2],"select is_alliance_member(null) as member,is_alliance_manager(null) as manager"),[{member:false,manager:false}]);
  });
  await check("client-provided manager metadata does not override canonical membership",async()=>{
    await db.exec(`select set_config('request.jwt.claims','{"user_metadata":{"role":"R5"}}',false)`);
    assert.deepEqual(await as(actors[0],query(allianceA)),[{member:true,manager:false}]);
  });
  await check("predicates perform no mutation and expose boolean columns only",async()=>{
    const before=JSON.stringify((await db.query("select * from wb1_alliance_members order by player_id")).rows);
    await as(actors[2],query(allianceA));await as(actors[4],query(allianceA));
    assert.equal(JSON.stringify((await db.query("select * from wb1_alliance_members order by player_id")).rows),before);
  });
  console.log(`PASS ${passed} PostgreSQL predicate contract groups; synthetic definitions, NOT live RPC validation`);
}finally{await db.close()}
