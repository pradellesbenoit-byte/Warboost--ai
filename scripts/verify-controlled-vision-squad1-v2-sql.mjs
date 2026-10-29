// Disposable PostgreSQL over a private Unix socket only. No remote database/API.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"wb-vision-v2-")),data=path.join(root,"db");
fs.chmodSync(root,0o700);
const port=String(57000+Math.floor(Math.random()*900));
const env={PATH:process.env.PATH,HOME:root,LANG:"C",PGHOST:root,PGPORT:port,PGUSER:"postgres",PGDATABASE:"postgres"};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const oldCampaign=id(1),campaign=id(2),digest="a".repeat(64);
const oldMigration=fs.readFileSync(new URL("../supabase/migration_controlled_vision_test.sql",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../supabase/migration_controlled_vision_squad1_v2.sql",import.meta.url),"utf8");
const audit=fs.readFileSync(new URL("../supabase/audit_controlled_vision_squad1_v2.sql",import.meta.url),"utf8");
const stop=fs.readFileSync(new URL("../supabase/stop_controlled_vision_squad1_v2.sql",import.meta.url),"utf8");
function run(bin,args,input){
  const result=spawnSync(bin,args,{env,input,encoding:"utf8",timeout:30000});
  if(result.status!==0)throw Error(result.stderr||"Local PostgreSQL command failed");
  return result.stdout.trim();
}
const sql=text=>run("psql",["-X","-qAt","-v","ON_ERROR_STOP=1"],text);
const call=(action,n,type="squad1",success="null",d=digest,c=campaign)=>
  `select public.wb1_vision_test_control_v2('${action}','${c}','${d}','${id(n)}','${type}',${success});`;
const invoke=(...args)=>JSON.parse(sql(`set request.jwt.claim.role='service_role';set role service_role;${call(...args)}`));
const approved=`set warboost.approved_project_ref='zaioadmbhqzeihkvdjsd';`;
const groups=[];
async function group(label,fn){await fn();groups.push(label);console.log(`PASS ${label}`)}
function seed(enabled=false){
  sql(`truncate public.wb1_vision_test_attempt_v2,public.wb1_vision_test_campaign_v2;
    insert into public.wb1_vision_test_campaign_v2(campaign_id,tester_digest,enabled,expires_at)
    values('${campaign}','${digest}',${enabled},now()+interval '1 hour');`);
}
let started=false,concurrentChild;
try{
  run("initdb",["-D",data,"-U","postgres","-A","trust","--no-locale","-E","UTF8"]);
  run("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-k ${root} -h '' -p ${port}`,"-w","start"]);started=true;
  sql("create role anon nologin;create role authenticated nologin;create role service_role nologin nosuperuser bypassrls;");
  sql(approved+oldMigration);
  sql(`insert into public.wb1_vision_test_campaign(campaign_id,tester_digest,enabled,expires_at,used)
    values('${oldCampaign}','${digest}',false,now()-interval '1 day',4);
    insert into public.wb1_vision_test_attempt(request_id,campaign_id,scan_type,outcome) values
      ('${id(101)}','${oldCampaign}','squad1','failed'),
      ('${id(102)}','${oldCampaign}','drone','failed'),
      ('${id(103)}','${oldCampaign}','technology','failed'),
      ('${id(104)}','${oldCampaign}','exclusive','failed');`);

  await group("project GUC guard refuses wrong target before creating v2 objects",()=>{
    assert.throws(()=>sql(migration),/vision_test_project_approval_required/);
    assert.equal(sql("select to_regclass('public.wb1_vision_test_campaign_v2') is null"),"t");
    assert.throws(()=>sql(`set warboost.approved_project_ref='wrong';${migration}`),/vision_test_project_approval_required/);
    assert.equal(sql("select to_regclass('public.wb1_vision_test_campaign_v2') is null"),"t");
  });
  sql(approved+migration);
  await group("additive install is empty/off and preserves expired v1 4/4 history",()=>{
    assert.equal(sql("select count(*) from public.wb1_vision_test_campaign_v2"),"0");
    assert.equal(sql("select count(*) from public.wb1_vision_test_attempt_v2"),"0");
    assert.equal(sql("select used from public.wb1_vision_test_campaign"),"4");
    assert.equal(sql("select count(*) from public.wb1_vision_test_attempt"),"4");
  });
  await group("RLS, no direct access, service-only RPC and fixed security contract",()=>{
    const props=JSON.parse(sql(`select json_build_object('definer',prosecdef,'owner',pg_get_userbyid(proowner),
      'config',proconfig) from pg_proc where oid=
      'public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)'::regprocedure`));
    assert.equal(props.definer,true);assert.equal(props.owner,"postgres");
    assert.deepEqual(props.config,["search_path=pg_catalog","lock_timeout=2s","statement_timeout=4s"]);
    assert.equal(sql(`select bool_and(relrowsecurity) from pg_class where oid in
      ('public.wb1_vision_test_campaign_v2'::regclass,'public.wb1_vision_test_attempt_v2'::regclass)`),"t");
    for(const role of ["anon","authenticated","service_role"])
      assert.throws(()=>sql(`set role ${role};select * from public.wb1_vision_test_campaign_v2`),/permission denied/);
    for(const role of ["anon","authenticated"])
      assert.throws(()=>sql(`set role ${role};set request.jwt.claim.role='${role}';${call("reserve",3)}`),/permission denied/);
    const result=sql(audit).split("|");
    assert.deepEqual(result.slice(0,10),["0","0","t","t","t","t","t","f","f","f"]);
    assert.equal(result[10],"t");
  });
  await group("no campaign row means no reservation; role, ID, digest, type and status are fail-closed",()=>{
    assert.throws(()=>invoke("reserve",3),/vision_test_contract_required/);
    seed(false);
    assert.equal(invoke("reserve",3).reserved,false);
    assert.throws(()=>invoke("reserve",3,"squad1","null","b".repeat(64)),/vision_test_contract_required/);
    assert.throws(()=>invoke("reserve",3,"drone"),/vision_test_contract_required/);
    assert.throws(()=>invoke("reserve",3,"squad1","null",digest,id(99)),/vision_test_contract_required/);
    sql("update public.wb1_vision_test_campaign_v2 set enabled=true,expires_at=now()-interval '1 second'");
    assert.equal(invoke("reserve",3).reserved,false);
    sql("update public.wb1_vision_test_campaign_v2 set expires_at=now()+interval '1 hour'");
  });
  await group("one singleton row and one attempt per campaign",()=>{
    assert.throws(()=>sql(`insert into public.wb1_vision_test_campaign_v2(campaign_id,tester_digest,expires_at)
      values('${id(3)}','${digest}',now()+interval '1 hour')`),/duplicate key/);
    sql(`update public.wb1_vision_test_campaign_v2 set enabled=true;
      insert into public.wb1_vision_test_attempt_v2(request_id,campaign_id,scan_type,outcome)
      values('${id(199)}','${campaign}','squad1','failed');`);
    assert.throws(()=>sql(`insert into public.wb1_vision_test_attempt_v2(request_id,campaign_id,scan_type)
      values('${id(200)}','${campaign}','squad1')`),/duplicate key/);
    seed(true);
  });
  await group("two PostgreSQL connections serialize a race; only one attempt is reserved",async()=>{
    const child=spawn("psql",["-X","-qAt","-v","ON_ERROR_STOP=1"],{env,stdio:["pipe","pipe","pipe"]});
    concurrentChild=child;
    let output="",errors="",readyResolve;
    const ready=new Promise(resolve=>readyResolve=resolve);
    const done=new Promise((resolve,reject)=>{
      child.stdout.on("data",chunk=>{output+=chunk;if(output.includes("LOCKED"))readyResolve()});
      child.stderr.on("data",chunk=>errors+=chunk);
      child.on("error",reject);child.on("close",code=>code?reject(Error(errors)):resolve(output));
    });
    const timer=setTimeout(()=>child.kill("SIGKILL"),10000);
    child.stdin.end(`begin;set request.jwt.claim.role='service_role';set role service_role;${call("reserve",10)}
\\echo LOCKED
select pg_sleep(0.6);commit;`);
    await ready;
    const competing=invoke("reserve",11);
    await done;clearTimeout(timer);concurrentChild=null;
    assert.equal(competing.reserved,false);
    assert.equal(sql("select used from public.wb1_vision_test_campaign_v2"),"1");
    assert.equal(sql("select count(*) from public.wb1_vision_test_attempt_v2"),"1");
    assert.match(output,/"reserved":\s*true/);
  });
  await group("successful completion is idempotent and never refunds the sole attempt",()=>{
    assert.equal(invoke("finish",10,"squad1","true").finished,true);
    assert.equal(invoke("finish",10,"squad1","true").finished,true);
    assert.equal(sql("select used from public.wb1_vision_test_campaign_v2"),"1");
    assert.equal(sql("select busy_request is null from public.wb1_vision_test_campaign_v2"),"t");
    assert.equal(invoke("reserve",12).reserved,false);
  });
  await group("failure or lost provider response consumes the attempt and keeps the lease",()=>{
    seed(true);
    assert.equal(invoke("reserve",20).reserved,true);
    assert.equal(invoke("finish",20,"squad1","false").finished,true);
    assert.equal(invoke("finish",20,"squad1","false").finished,true);
    assert.equal(sql("select used from public.wb1_vision_test_campaign_v2"),"1");
    assert.equal(sql("select busy_request is not null from public.wb1_vision_test_campaign_v2"),"t");
    assert.equal(invoke("reserve",21).reserved,false);
  });
  await group("migration replay leaves the one-use ledger unchanged",()=>{
    sql(approved+migration);
    assert.equal(sql("select count(*) from public.wb1_vision_test_campaign_v2"),"1");
    assert.equal(sql("select count(*) from public.wb1_vision_test_attempt_v2"),"1");
    assert.equal(sql("select used from public.wb1_vision_test_campaign_v2"),"1");
    assert.equal(sql("select enabled from public.wb1_vision_test_campaign_v2"),"t");
  });
  await group("OFF-only stop preserves the count, busy lease and both histories",()=>{
    sql(approved+stop);
    assert.equal(sql("select enabled from public.wb1_vision_test_campaign_v2"),"f");
    assert.equal(sql("select used from public.wb1_vision_test_campaign_v2"),"1");
    assert.equal(sql("select busy_request is not null from public.wb1_vision_test_campaign_v2"),"t");
    assert.equal(sql("select count(*) from public.wb1_vision_test_attempt"),"4");
    assert.equal(sql("select used from public.wb1_vision_test_campaign"),"4");
  });
  console.log(`PASS ${groups.length} native PostgreSQL groups; 0 failures; two concurrent Unix-socket sessions; no external network.`);
}finally{
  concurrentChild?.kill("SIGKILL");
  if(started)run("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
  fs.rmSync(root,{recursive:true,force:true});
}
