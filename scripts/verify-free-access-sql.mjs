// Disposable native PostgreSQL, Unix socket only. No Supabase or external HTTP.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync,spawn} from "node:child_process";
import assert from "node:assert/strict";
const root=fs.mkdtempSync(path.join(os.tmpdir(),"wb-free-policy-")),data=path.join(root,"db");
fs.chmodSync(root,0o700);
const env={PATH:process.env.PATH,HOME:root,LANG:"C",PGHOST:root,PGPORT:"57421",PGDATABASE:"postgres"};
function run(binary,args,input){
  const r=spawnSync(binary,args,{env,input,encoding:"utf8",timeout:30000});
  if(r.status!==0)throw Error(r.stderr||`${binary} failed`);
  return r.stdout.trim();
}
const sql=text=>run("psql",["-X","-qAt","-v","ON_ERROR_STOP=1"],text);
function concurrent(text){return new Promise((resolve,reject)=>{
  const child=spawn("psql",["-X","-qAt","-v","ON_ERROR_STOP=1"],{env,stdio:["pipe","pipe","pipe"]});
  let output="",error="";child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>error+=b);
  child.on("error",reject);child.on("exit",code=>code?reject(Error(error)):resolve(output.trim()));child.stdin.end(text);
})}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const A=id(1),B=id(2),R5=id(3),OtherR5=id(4),R4=id(5),R3=id(6),one=id(10),two=id(11);
let groups=0,started=false;
function group(name,check){check();groups++;console.log(`PASS ${name}`)}
function denied(text,pattern){assert.throws(()=>sql(text),pattern)}
try{
  run("initdb",["-D",data,"-A","trust","--no-locale","-E","UTF8"]);
  run("pg_ctl",["-D",data,"-l",path.join(root,"server.log"),"-o",`-k ${root} -h '' -p 57421`,"-w","start"]);started=true;
  sql(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin nosuperuser;
    create role policy_owner nologin nosuperuser nocreaterole;
    grant usage,create on schema public to policy_owner;
    create table public.wb1_profiles(player_id uuid primary key,state jsonb,updated_at timestamptz default now());
    create table public.wb1_alliances(id uuid primary key,tag text,server_id text,owner_player_id uuid,roster jsonb,roster_updated_at timestamptz,updated_at timestamptz default now());
    create table public.wb1_alliance_members(player_id uuid primary key,alliance_id uuid,role text,updated_at timestamptz default now());
    alter table public.wb1_profiles owner to policy_owner;
    alter table public.wb1_alliances owner to policy_owner;
    alter table public.wb1_alliance_members owner to policy_owner;
    grant select,update,insert on public.wb1_profiles,public.wb1_alliances,public.wb1_alliance_members to policy_owner;
  `);
  sql("set role policy_owner;\n"+fs.readFileSync(new URL("../supabase/migration_free_access_preparation.sql",import.meta.url),"utf8"));
  const roster=(server,manager)=>[
    {name:"Player I",server_id:server,alliance_tag:"ONE",role:"R1"},
    {name:"Manager",server_id:server,alliance_tag:"ONE",role:"R4",player_id:manager,warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"}
  ];
  sql(`
    insert into wb1_alliances(id,tag,server_id,owner_player_id,roster) values
      ('${one}','ONE','884','${R5}','${JSON.stringify(roster("884",R4))}'),
      ('${two}','ONE','885','${OtherR5}','${JSON.stringify(roster("885",OtherR5))}');
    insert into wb1_profiles values
      ('${A}','{"player":{"name":"Player I","server_id":"884","role":"R5"},"alliance":{"tag":"ONE"}}',now()),
      ('${B}','{"player":{"name":"Player I","server_id":"885"},"alliance":{"tag":"ONE"}}',now());
    insert into wb1_alliance_members values('${R4}','${one}','R4',now()),('${R3}','${one}','R3',now());
  `);
  group("functions owned by a non-superuser; authenticated/anon cannot call privileged policies",()=>{
    assert.equal(sql("select r.rolsuper from pg_proc p join pg_roles r on r.oid=p.proowner where p.proname='wb1_review_alliance_access'"),"f");
    for(const role of ["anon","authenticated"]){
      denied(`set role ${role}; select public.wb1_alliance_access_request('${A}','mine');`,/permission denied/);
      denied(`set role ${role}; select * from public.wb1_alliance_access_requests;`,/permission denied/);
      denied(`set role ${role}; select public.wb1_reserve_free_scan('${A}','${id(100)}');`,/permission denied/);
    }
  });
  group("two same-tag alliances on different servers remain independent, no auto-membership",()=>{
    for(const player of [A,B])sql(`set role service_role; select public.wb1_alliance_access_request('${player}','request')`);
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id in ('${A}','${B}')`),"0");
    assert.equal(sql(`select jsonb_array_length(public.wb1_alliance_access_request('${R5}','list')->'requests')`),"1");
    assert.equal(sql(`select jsonb_array_length(public.wb1_alliance_access_request('${OtherR5}','list')->'requests')`),"1");
    assert.equal(sql(`select jsonb_array_length(public.wb1_alliance_access_request('${R3}','list')->'requests')`),"0");
  });
  const request=sql(`select id from wb1_alliance_access_requests where player_id='${A}'`);
  const review=(actor,accept=true)=>`set role service_role;select public.wb1_review_alliance_access('${actor}','${request}',${accept})`;
  group("R3, forged R5 and foreign-alliance manager cannot approve",()=>{
    for(const actor of [R3,A,OtherR5])denied(review(actor),/ALLIANCE_MANAGER_REQUIRED/);
    assert.equal(sql(`select status from wb1_alliance_access_requests where id='${request}'`),"pending");
  });
  group("changed name / I versus l versus 1 / changed server refuse adoption",()=>{
    for(const name of ["Player l","Player 1"]){
      sql(`update wb1_profiles set state=jsonb_set(state,'{player,name}','"${name}"') where player_id='${A}'`);
      denied(review(R4),/ALLIANCE_REQUEST_IDENTITY_CHANGED/);
    }
    sql(`update wb1_profiles set state=jsonb_set(state,'{player,name}','"Player I"') where player_id='${A}'`);
    sql(`update wb1_profiles set state=jsonb_set(state,'{player,server_id}','"885"') where player_id='${A}'`);
    denied(review(R4),/ALLIANCE_REQUEST_IDENTITY_CHANGED/);
    sql(`update wb1_profiles set state=jsonb_set(state,'{player,server_id}','"884"') where player_id='${A}'`);
  });
  group("already linked canonical identity cannot be stolen",()=>{
    sql(`update wb1_alliances set roster=jsonb_set(roster,'{0,player_id}','"${B}"') where id='${one}'`);
    denied(review(R4),/ALLIANCE_IDENTITY_ALREADY_LINKED/);
    sql(`update wb1_alliances set roster=roster#-'{0,player_id}' where id='${one}'`);
  });
  group("unknown canonical rank and tombstone cannot be converted into a membership",()=>{
    sql(`update wb1_alliances set roster=roster#-'{0,role}' where id='${one}'`);
    denied(review(R4),/ALLIANCE_RANK_CONFIRMATION_REQUIRED/);
    sql(`update wb1_alliances set roster=jsonb_set(roster,'{0,role}','"R1"') where id='${one}'`);
    sql(`update wb1_alliances set roster=jsonb_set(roster,'{0,__warboost_type}','"roster_removal_tombstone"') where id='${one}'`);
    denied(review(R4),/ALLIANCE_CANONICAL_IDENTITY_REQUIRED/);
    sql(`update wb1_alliances set roster=roster#-'{0,__warboost_type}' where id='${one}'`);
  });
  group("R4 approval uses canonical R1, preserves other members and advances roster CAS",()=>{
    const before=sql(`select roster->1 from wb1_alliances where id='${one}'`);
    const result=JSON.parse(sql(review(R4)));assert.equal(result.status,"approved");
    assert.equal(sql(`select role from wb1_alliance_members where player_id='${A}'`),"R1");
    assert.equal(sql(`select roster->1 from wb1_alliances where id='${one}'`),before);
    assert.equal(sql(`select roster_updated_at is not null from wb1_alliances where id='${one}'`),"t");
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${B}'`),"0");
  });
  group("duplicate approval is idempotent; second server owner can reject without touching first",()=>{
    assert.equal(JSON.parse(sql(review(R4))).already_reviewed,true);
    const bRequest=sql(`select id from wb1_alliance_access_requests where player_id='${B}'`);
    sql(`select public.wb1_review_alliance_access('${OtherR5}','${bRequest}',false)`);
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${A}'`),"1");
    assert.equal(sql(`select status from wb1_alliance_access_requests where id='${bRequest}'`),"rejected");
  });
  group("quota: three accepted, fourth denied; repeat request cannot re-run provider",()=>{
    for(let i=0;i<3;i++)assert.equal(JSON.parse(sql(`set role service_role;select public.wb1_reserve_free_scan('${A}','${id(100+i)}')`)).reserved,true);
    assert.equal(JSON.parse(sql(`select public.wb1_reserve_free_scan('${A}','${id(103)}')`)).reserved,false);
    denied(`select public.wb1_reserve_free_scan('${A}','${id(100)}')`,/SCAN_REQUEST_ALREADY_USED/);
  });
  sql("truncate wb1_free_scan_usage,wb1_free_scan_daily");
  const concurrentResults=await Promise.all([1,2].map(i=>concurrent(`begin;set role service_role;select public.wb1_reserve_free_scan('${A}','${id(200+i)}');select pg_sleep(0.15);commit;`)));
  assert.equal(concurrentResults.every(value=>value.includes('"reserved": true')),true);
  assert.equal(sql(`select count(*) from wb1_free_scan_usage where user_id='${A}'`),"2");
  groups++;console.log("PASS concurrent quota transactions on two native PostgreSQL connections");
  group("deployment-wide FREE quota remains bounded across many fake accounts",()=>{
    sql(`do $$declare u uuid;begin for i in 1..35 loop u:=('00000000-0000-4000-8000-'||lpad((1000+i)::text,12,'0'))::uuid;insert into wb1_profiles(player_id,state) values(u,'{}');perform public.wb1_reserve_free_scan(u,('00000000-0000-4000-8000-'||lpad((2000+i)::text,12,'0'))::uuid);end loop;end$$`);
    assert.equal(sql("select count(*) from wb1_free_scan_usage"),"30");
  });
  group("account deletion removes private requests/usage, but does not reset global quota",()=>{
    sql(`delete from wb1_profiles where player_id='${A}'`);
    assert.equal(sql(`select count(*) from wb1_free_scan_usage where user_id='${A}'`),"0");
    assert.equal(sql(`select count(*) from wb1_alliance_access_requests where player_id='${A}'`),"0");
    assert.equal(sql("select reserved from wb1_free_scan_daily"),"30");
  });
  console.log(JSON.stringify({native_postgresql:true,groups,pass:groups,fail:0,external_calls:0}));
}finally{
  if(started)run("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
  fs.rmSync(root,{recursive:true,force:true});
}
