// Disposable PostgreSQL, Unix socket only. No Supabase, credentials or HTTP.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
const root=fs.mkdtempSync(path.join(os.tmpdir(),"wb-vision-")),data=path.join(root,"db");
fs.chmodSync(root,0o700);
const env={PATH:process.env.PATH,HOME:root,LANG:"C",PGHOST:root,PGPORT:"57425",PGUSER:"postgres",PGDATABASE:"postgres"};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const campaign=id(1),digest="a".repeat(64),types=["squad1","drone","technology","exclusive"];
const migration=fs.readFileSync(new URL("../supabase/migration_controlled_vision_test.sql",import.meta.url),"utf8");
const rollback=fs.readFileSync(new URL("../supabase/rollback_controlled_vision_test.sql",import.meta.url),"utf8");
function run(bin,args,input){
  const r=spawnSync(bin,args,{env,input,encoding:"utf8",timeout:30000});
  if(r.status!==0)throw Error(r.stderr||"Local PostgreSQL failed");
  return r.stdout.trim();
}
const sql=text=>run("psql",["-X","-qAt","-v","ON_ERROR_STOP=1"],text);
const call=(action,n,type="drone",success="null",d=digest,c=campaign)=>
  `select public.wb1_vision_test_control('${action}','${c}','${d}','${id(n)}','${type}',${success});`;
const invoke=(...args)=>JSON.parse(sql(`set role service_role;${call(...args)}`));
const approved=`set warboost.approved_project_ref='zaioadmbhqzeihkvdjsd';`;
let started=false,groups=0;
function group(label,fn){fn();groups++;console.log(`PASS ${label}`)}
function seed(){sql(`truncate public.wb1_vision_test_attempt,public.wb1_vision_test_campaign;
 insert into public.wb1_vision_test_campaign(campaign_id,tester_digest,expires_at)
 values('${campaign}','${digest}',now()+interval '1 hour');`)}
let concurrentChild;
try{
  run("initdb",["-D",data,"-U","postgres","-A","trust","--no-locale","-E","UTF8"]);
  run("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-k ${root} -h '' -p 57425`,"-w","start"]);started=true;
  sql("create role anon nologin;create role authenticated nologin;create role service_role nologin nosuperuser bypassrls;");
  group("project approval absent or wrong: migration refuses transactionally",()=>{
    assert.throws(()=>sql(migration),/vision_test_project_approval_required/);
    assert.equal(sql("select to_regclass('public.wb1_vision_test_campaign') is null"),"t");
    assert.throws(()=>sql(`set warboost.approved_project_ref='wrong';${migration}`),/vision_test_project_approval_required/);
  });
  sql(approved+migration);
  group("installation empty, RLS enabled, service direct access and public RPC denied",()=>{
    assert.equal(sql("select count(*) from public.wb1_vision_test_campaign"),"0");
    assert.equal(sql(`select bool_and(relrowsecurity) from pg_class where oid in
     ('public.wb1_vision_test_campaign'::regclass,'public.wb1_vision_test_attempt'::regclass)`),"t");
    for(const role of ["anon","authenticated","service_role"]){
      assert.throws(()=>sql(`set role ${role};select * from public.wb1_vision_test_campaign`),/permission denied/);
    }
    for(const role of ["anon","authenticated"]){
      assert.throws(()=>sql(`set role ${role};${call("reserve",2)}`),/permission denied/);
    }
    sql(fs.readFileSync(new URL("../supabase/audit_controlled_vision_test.sql",import.meta.url),"utf8"));
  });
  group("SECURITY DEFINER owner and fixed pg_catalog path, explicit timeouts",()=>{
    const props=JSON.parse(sql(`select json_build_object('definer',prosecdef,
      'owner',pg_get_userbyid(proowner),'config',proconfig) from pg_proc
      where oid='public.wb1_vision_test_control(text,uuid,text,uuid,text,boolean)'::regprocedure`));
    assert.equal(props.definer,true);assert.equal(props.owner,"postgres");
    assert.deepEqual(props.config,["search_path=pg_catalog","lock_timeout=2s","statement_timeout=4s"]);
  });
  group("missing campaign, wrong digest, wrong campaign, bad type and expired/disabled reject",()=>{
    assert.throws(()=>invoke("reserve",2),/vision_test_contract_required/);
    seed();
    assert.equal(invoke("reserve",2).reserved,false);
    assert.throws(()=>invoke("reserve",2,"drone","null","b".repeat(64)),/vision_test_contract_required/);
    assert.throws(()=>invoke("reserve",2,"drone","null",digest,id(99)),/vision_test_contract_required/);
    assert.throws(()=>invoke("reserve",2,"alliance_roster"),/vision_test_contract_required/);
    sql("update public.wb1_vision_test_campaign set enabled=true,expires_at=now()-interval '1 second'");
    assert.equal(invoke("reserve",2).reserved,false);
    sql("update public.wb1_vision_test_campaign set expires_at=now()+interval '1 hour'");
  });
  // Connection A reserves under an open transaction. Connection B starts only
  // after A emits LOCKED and must wait for the row lock, then observe busy.
  const child=spawn("psql",["-X","-qAt","-v","ON_ERROR_STOP=1"],{env,stdio:["pipe","pipe","pipe"]});
  concurrentChild=child;
  let output="",errors="",readyResolve;
  const ready=new Promise(resolve=>readyResolve=resolve);
  const done=new Promise((resolve,reject)=>{
    child.stdout.on("data",b=>{output+=b;if(output.includes("LOCKED"))readyResolve()});
    child.stderr.on("data",b=>errors+=b);
    child.on("error",reject);child.on("close",code=>code?reject(Error(errors)):resolve(output));
  });
  const timer=setTimeout(()=>child.kill("SIGKILL"),10000);
  child.stdin.end(`begin;set role service_role;${call("reserve",10,"squad1")}
\\echo LOCKED
select pg_sleep(0.6);commit;`);
  await ready;
  const other=invoke("reserve",11,"drone");
  await done;clearTimeout(timer);concurrentChild=null;
  group("two real PostgreSQL connections serialize concurrent attempts without double debit",()=>{
    assert.equal(other.reserved,false);
    assert.equal(sql("select used from public.wb1_vision_test_campaign"),"1");
    assert.equal(sql("select count(*) from public.wb1_vision_test_attempt"),"1");
  });
  group("wrong completion / identity cannot clear lease",()=>{
    assert.throws(()=>invoke("finish",99,"squad1","true"),/vision_test_lease_mismatch/);
    assert.throws(()=>invoke("finish",10,"drone","true"),/vision_test_attempt_mismatch/);
    assert.equal(sql("select busy_request is not null from public.wb1_vision_test_campaign"),"t");
  });
  group("four attempts in total, no fifth or type replay, finish idempotent without refund",()=>{
    assert.equal(invoke("finish",10,"squad1","true").finished,true);
    assert.equal(invoke("finish",10,"squad1","true").finished,true);
    for(let i=1;i<4;i++){
      assert.equal(invoke("reserve",10+i,types[i]).reserved,true);
      assert.equal(invoke("finish",10+i,types[i],"true").finished,true);
    }
    assert.equal(invoke("reserve",50,"drone").reserved,false);
    assert.equal(sql("select used from public.wb1_vision_test_campaign"),"4");
  });
  group("migration replay does not reset counters/history or reactivate configuration",()=>{
    sql(approved+migration);
    assert.equal(sql("select used from public.wb1_vision_test_campaign"),"4");
    assert.equal(sql("select count(*) from public.wb1_vision_test_attempt"),"4");
  });
  group("rollback shuts down atomically, keeps accounting and cleanup function",()=>{
    sql(approved+rollback);
    assert.equal(sql("select enabled from public.wb1_vision_test_campaign"),"f");
    assert.equal(sql("select used from public.wb1_vision_test_campaign"),"4");
    assert.equal(invoke("finish",13,"exclusive","true").finished,true);
  });
  group("provider failure is not refunded, busy lease survives and blocks next request",()=>{
    seed();sql("update public.wb1_vision_test_campaign set enabled=true");
    assert.equal(invoke("reserve",60,"drone").reserved,true);
    assert.equal(invoke("finish",60,"drone","false").finished,true);
    assert.equal(invoke("finish",60,"drone","false").finished,true);
    assert.equal(invoke("reserve",61,"technology").reserved,false);
    assert.equal(sql("select used from public.wb1_vision_test_campaign"),"1");
    assert.equal(sql("select busy_request is not null from public.wb1_vision_test_campaign"),"t");
    sql(approved+rollback);
    assert.equal(sql("select busy_request is not null from public.wb1_vision_test_campaign"),"t");
  });
  console.log(`PASS ${groups} native PostgreSQL groups; 0 failures; two real connections; Unix socket only.`);
}finally{
  concurrentChild?.kill("SIGKILL");
  if(started)run("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
  fs.rmSync(root,{recursive:true,force:true});
}
