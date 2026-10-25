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
  const deadline=setTimeout(()=>child.kill("SIGKILL"),15000);
  child.on("error",error=>{clearTimeout(deadline);reject(error)});
  // exit can precede the final stdout data event: only close proves pipes drained.
  child.on("close",code=>{clearTimeout(deadline);code?reject(Error(error||"local SQL timeout")):resolve(output.trim())});child.stdin.end(text);
})}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
// Non-UUID legacy player keys exercise TEXT end to end; business IDs stay UUID.
const A="synthetic-player-a",B="synthetic-player-b",R5="synthetic-owner-a",OtherR5="synthetic-owner-b",R4="synthetic-r4",R3="synthetic-r3",one=id(10),two=id(11);
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
  `);
  sql(fs.readFileSync(new URL("./fixtures/free-access-real-schema.sql",import.meta.url),"utf8"));
  const legacyShape=()=>sql(`select jsonb_agg(x order by name) from (
    select c.oid::regclass::text as name,
      (select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid) as keys,
      (select jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod)) order by attnum)
       from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped) as columns
    from pg_class c where c.oid in ('wb1_profiles'::regclass,'wb1_alliances'::regclass,'wb1_alliance_members'::regclass)
  ) x`);
  const baseShape=legacyShape();
  group("observed TEXT/UUID/composite PK fixture reproduces all three original incompatibilities",()=>{
    denied("begin;create table bad_free_fk(user_id uuid references wb1_profiles(player_id));rollback;",/incompatible types/);
    denied("select 1 from wb1_profiles where player_id='00000000-0000-4000-8000-000000000001'::uuid",/operator does not exist: text = uuid/);
    denied(`insert into wb1_alliance_members values('synthetic','${one}','R1',now()) on conflict(player_id) do update set role='R1'`,/no unique or exclusion constraint/);
    assert.equal(sql(`select count(*) from pg_constraint where conrelid='wb1_alliance_members'::regclass and contype='u'`),"0");
  });
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
    sql(`update wb1_profiles set state=jsonb_set(state,'{alliance,tag}','"OTHER"') where player_id='${A}'`);
    denied(review(R4),/ALLIANCE_REQUEST_IDENTITY_CHANGED/);
    sql(`update wb1_profiles set state=jsonb_set(state,'{alliance,tag}','"ONE"') where player_id='${A}'`);
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
    sql(`delete from wb1_alliance_members where player_id='${A}'`);
    denied(review(R4),/ALLIANCE_REJOIN_REVIEW_REQUIRED/);
    sql(`insert into wb1_alliance_members values('${A}','${one}','R1',now())`);
    const bRequest=sql(`select id from wb1_alliance_access_requests where player_id='${B}'`);
    sql(`select public.wb1_review_alliance_access('${OtherR5}','${bRequest}',false)`);
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${A}'`),"1");
    assert.equal(sql(`select status from wb1_alliance_access_requests where id='${bRequest}'`),"rejected");
  });
  const approvalRace=await Promise.all([
    concurrent(`begin;set role service_role;select wb1_alliance_access_request('${A}','request');select pg_sleep(0.1);commit;`),
    concurrent(`set role service_role;select wb1_alliance_access_request('${A}','request');`)
  ]);
  group("concurrent requests and approvals use TEXT keys and the real composite membership PK",()=>{
    assert.equal(approvalRace.length,2);
    assert.equal(sql(`select count(*) from wb1_alliance_access_requests where player_id='${A}'`),"1");
  });
  const reviewedRace=await Promise.all([concurrent(review(R4)),concurrent(review(R5))]);
  group("two managers replay approval without duplicating or moving membership",()=>{
    assert.equal(reviewedRace.every(r=>JSON.parse(r).already_reviewed),true);
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${A}'`),"1");
    sql(`insert into wb1_alliance_members values('${A}','${two}','R1',now())`);
    denied(review(R4),/ALLIANCE_SWITCH_REVIEW_REQUIRED/);
    // Our RPC must refuse ambiguous legacy membership, not delete/move either row.
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${A}'`),"2");
    sql(`delete from wb1_alliance_members where player_id='${A}' and alliance_id='${two}'`);
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
    sql(`do $$declare u text;begin for i in 1..35 loop u:='synthetic-budget-'||i::text;insert into wb1_profiles(player_id,state) values(u,'{}');perform public.wb1_reserve_free_scan(u,('00000000-0000-4000-8000-'||lpad((2000+i)::text,12,'0'))::uuid);end loop;end$$`);
    assert.equal(sql("select count(*) from wb1_free_scan_usage"),"30");
  });
  group("account deletion removes private requests/usage, but does not reset global quota",()=>{
    sql(`delete from wb1_profiles where player_id='${A}'`);
    assert.equal(sql(`select count(*) from wb1_free_scan_usage where user_id='${A}'`),"0");
    assert.equal(sql(`select count(*) from wb1_alliance_access_requests where player_id='${A}'`),"0");
    assert.equal(sql("select reserved from wb1_free_scan_daily"),"30");
  });
  const founder="synthetic-founder",secondFounder="synthetic-founder-two",otherScope="synthetic-other-scope";
  sql(`insert into wb1_profiles(player_id,state) values
    ('${founder}','{"player":{"name":"Founder I","server_id":"900","role":"R5"},"alliance":{"tag":"NEW"}}'),
    ('${secondFounder}','{"player":{"name":"Other","server_id":"900","role":"R4"},"alliance":{"tag":"NEW"}}'),
    ('${otherScope}','{"player":{"name":"Other","server_id":"901"},"alliance":{"tag":"DIFF"}}')`);
  const founderCall=(who,action,roster=null,revision=null)=>`set role service_role;select public.wb1_founder_space('${who}','${action}',${roster===null?"null":`'${JSON.stringify(roster)}'::jsonb`},${revision??"null"})`;
  group("founder is provisional, cannot seize existing scope or claim verified R5",()=>{
    const result=JSON.parse(sql(founderCall(founder,"create")));
    assert.equal(result.provisional,true);assert.equal(result.game_role_verified,false);assert.equal(result.membership_granted,false);
    assert.equal(sql(`select count(*) from wb1_alliances where server_id='900'`),"0");
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${founder}'`),"0");
    assert.equal(JSON.parse(sql(founderCall(B,"create"))).request_membership,true);
    assert.equal(sql(`select count(*) from wb1_alliance_founder_spaces where founder_id='${B}'`),"0");
    assert.equal(sql(`select wb1_access_manager('${founder}','${one}')`),"f");
  });
  group("founder drafts are isolated even for same scope; cannot reserve global scope",()=>{
    for(const who of [secondFounder,otherScope])sql(founderCall(who,"create"));
    sql(founderCall(founder,"save_draft",[{name:"Player I",declared_game_role:"R5"},{name:"Player l",declared_game_role:null}],0));
    for(const who of [secondFounder,otherScope])assert.deepEqual(JSON.parse(sql(founderCall(who,"mine"))).roster_draft,[]);
    assert.equal(sql(`select count(*) from wb1_alliance_founder_spaces`),"3");
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${founder}'`),"0");
  });
  group("founder refuses identity changes, account links, invalid role and extra properties",()=>{
    for(const row of [{name:"X",player_id:B},{name:"X",role:"R5"},{name:"X",declared_game_role:"owner"},{name:"X",warboost_linked:true}])
      denied(founderCall(founder,"save_draft",[row],1),/ALLIANCE_DRAFT_INVALID/);
    denied(founderCall(founder,"save_draft",Array.from({length:101},(_,i)=>({name:`P${i}`})),1),/ALLIANCE_DRAFT_LIMIT/);
    denied(founderCall(founder,"save_draft",[{name:"X"},{name:"x"}],1),/ALLIANCE_DRAFT_DUPLICATE/);
    sql(`update wb1_profiles set state=jsonb_set(state,'{player,server_id}','"902"') where player_id='${founder}'`);
    denied(founderCall(founder,"mine"),/ALLIANCE_DRAFT_IDENTITY_CHANGED/);
    sql(`update wb1_profiles set state=jsonb_set(state,'{player,server_id}','"900"') where player_id='${founder}'`);
  });
  const writers=await Promise.allSettled([1,2].map(i=>concurrent(founderCall(founder,"save_draft",[{name:`Concurrent${i}`}],1))));
  assert.equal(writers.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(writers.filter(r=>r.status==="rejected"&&/ALLIANCE_DRAFT_CONFLICT/.test(r.reason.message)).length,1);
  groups++;console.log("PASS two concurrent founder updates: one CAS acknowledgement, no lost update");
  group("migration is idempotent with populated tables; audit and ACL fail closed",()=>{
    const before=sql("select jsonb_agg(t order by founder_id) from wb1_alliance_founder_spaces t");
    sql("set role policy_owner;\n"+fs.readFileSync(new URL("../supabase/migration_free_access_preparation.sql",import.meta.url),"utf8"));
    assert.equal(sql("select jsonb_agg(t order by founder_id) from wb1_alliance_founder_spaces t"),before);
    assert.equal(sql("select reserved from wb1_free_scan_daily"),"30");
    sql(fs.readFileSync(new URL("../supabase/audit_free_access_preparation.sql",import.meta.url),"utf8"));
    for(const role of ["anon","authenticated"]){
      denied(`set role ${role};select public.wb1_founder_space('${founder}','mine')`,/permission denied/);
      denied(`set role ${role};select * from wb1_alliance_founder_spaces`,/permission denied/);
    }
    denied(`set role service_role;select * from wb1_alliance_founder_spaces`,/permission denied/);
    denied("begin;grant execute on function wb1_founder_space(text,text,jsonb,integer) to authenticated;select wb1_assert_free_access_contract();commit;",/FREE_ACCESS_FUNCTION_CONTRACT/);
    denied("begin;alter table wb1_alliance_members drop constraint wb1_alliance_members_pkey;select wb1_assert_free_access_contract();commit;",/FREE_BASE_KEY_CONTRACT/);
    denied("begin;alter table wb1_alliances alter column owner_player_id type uuid using null::uuid;select wb1_assert_free_access_contract();commit;",/FREE_BASE_COLUMN_CONTRACT/);
    denied("begin;grant execute on function wb1_assert_free_base_contract() to service_role;select wb1_assert_free_access_contract();commit;",/FREE_ACCESS_SERVICE_CONTRACT/);
    denied("begin;alter table wb1_profiles disable row level security;select wb1_assert_free_access_contract();commit;",/FREE_BASE_RLS_CONTRACT/);
    denied("begin;create function wb1_founder_space(uuid,text,jsonb,integer) returns void language sql as $$select$$;select wb1_assert_free_access_contract();commit;",/FREE_ACCESS_OVERLOAD_CONTRACT/);
    denied("begin;alter table wb1_alliance_founder_spaces alter column revision drop not null;select wb1_assert_free_access_contract();commit;",/FREE_ACCESS_TABLE_CONTRACT/);
    denied("begin;alter table wb1_alliance_founder_spaces drop constraint wb1_alliance_founder_spaces_founder_id_fkey;select wb1_assert_free_access_contract();commit;",/FREE_ACCESS_CONSTRAINT_CONTRACT/);
    sql("select wb1_assert_free_access_contract()");
    sql(`delete from wb1_profiles where player_id='${founder}'`);
    assert.equal(sql(`select count(*) from wb1_alliance_founder_spaces where founder_id='${founder}'`),"0");
    assert.equal(sql(`select count(*) from wb1_alliance_founder_spaces`),"2");
  });
  const additive=fs.readFileSync(new URL("../supabase/migration_free_workspace_budget.sql",import.meta.url),"utf8");
  sql("set role policy_owner;\n"+additive);
  const owner="workspace-owner-a",memberA="workspace-member-a",ownerB="workspace-owner-b",memberB="workspace-member-b",impostor="workspace-other",ownerC="workspace-owner-c";
  for(const [who,name,server,tag] of [[owner,"Owner A","1200","OPEN"],[memberA,"Member I","1200","OPEN"],
    [ownerB,"Owner B","1201","OPEN"],[memberB,"Member I","1201","OPEN"],[impostor,"Other","1200","OPEN"],[ownerC,"Owner C","1200","OTHER"],[id(706),"Existing","884","ONE"]]){
    sql(`insert into wb1_profiles values('${who}','${JSON.stringify({player:{name,server_id:server},alliance:{tag}})}',now())`);
  }
  const work=(who,action,target=null)=>`set role service_role;select wb1_workspace_access('${who}','${action}',${target?`'${target}'`:"null"});`;
  const createDraft=(who)=>sql(founderCall(who,"create"));
  for(const who of [owner,ownerB,ownerC]){createDraft(who);sql(founderCall(who,"save_draft",[{name:"Member I",declared_game_role:"R5"}],0))}
  group("independent spaces: founder governance is not a canonical R4/R5 or PRO grant",()=>{
    for(const who of [owner,ownerB,ownerC]){
      const r=JSON.parse(sql(work(who,"open_space")));assert.equal(r.warboost_owner,true);assert.equal(r.game_role_verified,false);
      assert.equal(sql(`select count(*) from wb1_alliances where owner_player_id='${who}'`),"0");
      assert.equal(sql(`select count(*) from wb1_alliance_members where player_id='${who}'`),"0");
    }
    sql(work(owner,"open_space")); // idempotent
    assert.equal(sql("select count(*) from wb1_autonomous_spaces"),"3");
    denied(work(id(706),"open_space"),/EXISTING_CANONICAL_SPACE/);
    createDraft(impostor);denied(work(impostor,"open_space"),/WORKSPACE_EXISTS_REQUEST_MEMBERSHIP/);
  });
  group("pending users cannot read; exact server/tag and owner approval isolate two alliances",()=>{
    for(const who of [memberA,memberB]){
      assert.equal(JSON.parse(sql(work(who,"request_space"))).status,"pending");
      denied(work(who,"view_space"),/WORKSPACE_APPROVAL_REQUIRED/);
    }
    denied(work(ownerB,"approve_space",memberA),/WORKSPACE_REQUEST_NOT_FOUND/);
    denied(work(memberA,"approve_space",memberA),/WORKSPACE_OWNER_REQUIRED/);
    sql(work(owner,"approve_space",memberA));sql(work(ownerB,"approve_space",memberB));
    sql(work(owner,"approve_space",memberA)); // idempotent, not a second linked account
    assert.equal(JSON.parse(sql(work(memberA,"view_space"))).roster_draft[0].name,"Member I");
    assert.equal(sql(`select count(*) from wb1_alliance_members where player_id in ('${memberA}','${memberB}')`),"0");
    denied(work(impostor,"view_space"),/WORKSPACE_APPROVAL_REQUIRED/);
  });
  group("identity edits, I/l substitution, foreign requests and silent roster loss are refused",()=>{
    sql(`update wb1_profiles set state=jsonb_set(state,'{player,name}','"Member l"') where player_id='${memberA}'`);
    denied(work(owner,"approve_space",memberA),/WORKSPACE_IDENTITY_CHANGED/);
    denied(work(memberA,"view_space"),/WORKSPACE_APPROVAL_REQUIRED/);
    sql(`update wb1_profiles set state=jsonb_set(state,'{player,name}','"Member I"') where player_id='${memberA}'`);
    denied(founderCall(owner,"save_draft",[],1),/WORKSPACE_ACCEPTED_MEMBER_REVIEW_REQUIRED/);
    sql(work(owner,"reject_space",memberA));denied(work(memberA,"view_space"),/WORKSPACE_APPROVAL_REQUIRED/);
    sql(founderCall(owner,"save_draft",[{name:"Member I"}],1));
    sql(work(owner,"approve_space",memberA));
    sql(work(impostor,"request_space"));denied(work(owner,"approve_space",impostor),/WORKSPACE_ROSTER_IDENTITY_REQUIRED/);
  });
  group("direct table/client RPC access denied; new audit detects ACL drift",()=>{
    for(const role of ["anon","authenticated","service_role"]){
      denied(`set role ${role};select * from wb1_autonomous_members`,/permission denied/);
      denied(`set role ${role};update wb1_free_budget_policy set global_daily=1000`,/permission denied/);
    }
    denied(`set role authenticated;select wb1_workspace_access('${owner}','view_space')`,/permission denied/);
    denied("begin;grant select on wb1_autonomous_spaces to authenticated;select wb1_assert_workspace_budget_contract();commit;",/WORKSPACE_TABLE_CONTRACT/);
    denied("begin;alter table wb1_autonomous_members drop constraint wb1_autonomous_members_space_id_fkey;select wb1_assert_workspace_budget_contract();commit;",/WORKSPACE_CONSTRAINT_CONTRACT/);
    denied("begin;alter table wb1_free_budget_policy alter column global_daily drop not null;select wb1_assert_workspace_budget_contract();commit;",/WORKSPACE_COLUMN_CONTRACT/);
    denied("begin;create function wb1_workspace_access(uuid,text,uuid) returns void language sql as $$select$$;select wb1_assert_workspace_budget_contract();commit;",/WORKSPACE_OVERLOAD_CONTRACT/);
    sql(fs.readFileSync(new URL("../supabase/audit_free_workspace_budget.sql",import.meta.url),"utf8"));
  });
  const ip="a".repeat(64),ipOther="b".repeat(64);
  const reserve=(who,req,network=ip)=>`set role service_role;select wb1_reserve_free_scan_v2('${who}','${req}','${network}');`;
  group("FREE budget configurable without deployment; consumed counters and old signature cannot bypass",()=>{
    assert.equal(JSON.parse(sql(`set role service_role;select wb1_reserve_free_scan('${owner}','${id(800)}')`)).reserved,false);
    // Previous 30 reservations still consumed. Raising the cap does not reset them.
    assert.equal(JSON.parse(sql(reserve(owner,id(801)))).reason,"FREE_GLOBAL_BUDGET_REACHED");
    sql("update wb1_free_budget_policy set global_daily=100,per_ip=2");
    assert.equal(JSON.parse(sql(reserve(owner,id(802)))).reserved,true);
    assert.equal(JSON.parse(sql(reserve(memberA,id(803)))).reserved,true);
    assert.equal(JSON.parse(sql(reserve(ownerB,id(804)))).reason,"FREE_NETWORK_LIMIT_REACHED");
    assert.equal(JSON.parse(sql(reserve(ownerB,id(805),ipOther))).reserved,true);
    sql("update wb1_free_budget_policy set enabled=false");
    assert.equal(JSON.parse(sql(reserve(ownerC,id(806),ipOther))).reason,"FREE_BUDGET_DISABLED");
    sql("update wb1_free_budget_policy set enabled=true,per_ip=100");
    assert.equal(JSON.parse(sql(reserve(owner,id(807)))).reserved,true);
    assert.equal(JSON.parse(sql(reserve(owner,id(808)))).reserved,true);
    assert.equal(JSON.parse(sql(reserve(owner,id(809)))).reason,"FREE_ACCOUNT_LIMIT_REACHED");
    denied(reserve(owner,id(808)),/SCAN_REQUEST_ALREADY_USED/);
    denied(reserve(owner,id(810),"invalid"),/TRUSTED_IP_REQUIRED/);
  });
  sql("update wb1_free_budget_policy set global_daily=(select reserved+1 from wb1_free_scan_daily)");
  const budgetRace=await Promise.all([concurrent(reserve(ownerB,id(820),ipOther)),concurrent(reserve(ownerC,id(821),ipOther))]);
  assert.equal(budgetRace.filter(r=>JSON.parse(r).reserved).length,1);
  groups++;console.log("PASS native two-connection budget race: exactly one remaining slot");
  const revision=Number(sql(`select revision from wb1_alliance_founder_spaces where founder_id='${owner}'`));
  const draftRace=await Promise.allSettled([
    concurrent(founderCall(owner,"save_draft",[{name:"Member I"},{name:"Extra"}],revision)),
    concurrent(work(owner,"approve_space",memberA))
  ]);
  assert.equal(draftRace.filter(r=>r.status==="fulfilled").length,2);
  groups++;console.log("PASS native two-connection roster edit/approval lock order without deadlock");
  group("additive migration preserves members, history and adjusted budget when reapplied",()=>{
    const before=sql("select jsonb_agg(t order by player_id) from wb1_autonomous_members t");
    sql("set role policy_owner;\n"+additive);
    assert.equal(sql("select jsonb_agg(t order by player_id) from wb1_autonomous_members t"),before);
    assert.notEqual(sql("select global_daily from wb1_free_budget_policy"),"30");
    sql("select wb1_assert_workspace_budget_contract()");
  });
  group("complete migration chain replay preserves policy, memberships and quota counters",()=>{
    const before=sql(`select jsonb_build_array(
      (select jsonb_agg(t order by player_id) from wb1_autonomous_members t),
      (select jsonb_agg(t order by alliance_id,player_id) from wb1_alliance_members t),
      (select jsonb_agg(t order by usage_day) from wb1_free_scan_daily t),
      (select row_to_json(t) from wb1_free_budget_policy t))`);
    sql("set role policy_owner;\n"+fs.readFileSync(new URL("../supabase/migration_free_access_preparation.sql",import.meta.url),"utf8"));
    sql("set role policy_owner;\n"+additive);
    assert.equal(sql(`select jsonb_build_array(
      (select jsonb_agg(t order by player_id) from wb1_autonomous_members t),
      (select jsonb_agg(t order by alliance_id,player_id) from wb1_alliance_members t),
      (select jsonb_agg(t order by usage_day) from wb1_free_scan_daily t),
      (select row_to_json(t) from wb1_free_budget_policy t))`),before);
    assert.equal(JSON.parse(sql(`select wb1_reserve_free_scan('${owner}','${id(999)}')`)).reserved,false);
  });
  group("both administrator audits pass after ordered migrations; legacy keys and columns unchanged",()=>{
    sql(fs.readFileSync(new URL("../supabase/audit_free_access_preparation.sql",import.meta.url),"utf8"));
    sql(fs.readFileSync(new URL("../supabase/audit_free_workspace_budget.sql",import.meta.url),"utf8"));
    assert.equal(legacyShape(),baseShape);
    assert.equal(sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
      ('wb1_reserve_free_scan','wb1_reserve_free_scan_v2','wb1_access_manager','wb1_alliance_access_request',
       'wb1_review_alliance_access','wb1_founder_space','wb1_workspace_access') and proargtypes[0]='uuid'::regtype`),"0");
  });
  console.log(JSON.stringify({native_postgresql:true,groups,pass:groups,fail:0,external_calls:0}));
}finally{
  if(started)run("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
  fs.rmSync(root,{recursive:true,force:true});
}
