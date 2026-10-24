import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFile,execFileSync} from "node:child_process";
import {promisify} from "node:util";
import {createHash} from "node:crypto";
import vm from "node:vm";
import support from "../api/support.js";
import pro from "../api/pro.js";
import {betaAccessForUserAsync} from "../lib/beta-access.js";
import {betaCodeVisible,betaActivationSucceeded,betaActivationErrorKey} from "../lib/beta-activation-ui.js";
import {LANGUAGES,translator} from "../i18n.js";

// Isolated Unix-socket-only PostgreSQL. No network, production credentials or real users.
const run=promisify(execFile),dir=fs.mkdtempSync(path.join(os.tmpdir(),"wb-beta-atomic-"));
const data=path.join(dir,"data"),port="55439",sqlArgs=["-h",dir,"-p",port,"-U","wb_audit","-d","postgres","-Atq","-v","ON_ERROR_STOP=1"];
let started=false;
function cleanup(){if(started){execFileSync("pg_ctl",["-D",data,"-m","immediate","stop"],{stdio:"ignore"});started=false}fs.rmSync(dir,{recursive:true,force:true})}
const quote=x=>`'${String(x).replaceAll("'","''")}'`;
async function sql(text){return (await run("psql",[...sqlArgs,"-c",text],{maxBuffer:200000})).stdout.trim()}
async function rows(text){return JSON.parse(await sql(`select coalesce(json_agg(r),'[]'::json) from (${text}) r`))}
const uuid=n=>`50000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const ids=[uuid(1),uuid(2),uuid(3)],source="beta-code-hf8.6.5";
const validCode="SYNTHETIC-ATOMIC-AUDIT";
Object.assign(process.env,{
  SUPABASE_URL:"https://beta-fixture.invalid",SUPABASE_ANON_KEY:"fixture",SUPABASE_SERVICE_ROLE_KEY:"fixture",
  WARBOOST_COMMERCIAL_MODE:"off",WARBOOST_BETA_EMAILS:"",WARBOOST_SUPPORT_ADMINS:"",
  WARBOOST_BETA_CODE_HASH:createHash("sha256").update(validCode.replaceAll("-","")).digest("hex")
});
let missingRpc=false,protectedGrant=null;
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
globalThis.fetch=async(input,options={})=>{
  const u=new URL(String(input));assert.equal(u.hostname,"beta-fixture.invalid","External network forbidden");
  if(u.pathname==="/auth/v1/user"){
    const id=String(options.headers.authorization||options.headers.Authorization).replace("Bearer fixture-","");
    return reply((await rows(`select id,email from auth.users where id=${quote(id)}::uuid`))[0]);
  }
  if(u.pathname.endsWith("/rpc/wb1_activate_beta_invitation")){
    if(missingRpc)return reply({code:"PGRST202"},404);
    const b=JSON.parse(options.body);assert.deepEqual(Object.keys(b).sort(),["p_code_verified","p_user_id"]);
    return reply(JSON.parse(await sql(`set role service_role;select public.wb1_activate_beta_invitation(${quote(b.p_user_id)}::uuid,${b.p_code_verified===true})`)));
  }
  if(u.pathname.includes("/warboost_")){
    if(protectedGrant){
      assert.ok(!options.method||options.method==="GET","An existing persistent grant must never be rewritten");
      const owner=u.searchParams.get("user_id")?.slice(3);
      return reply(u.pathname.endsWith("/warboost_pro_grants")&&owner===protectedGrant.user_id?[protectedGrant]:[]);
    }
    return reply({code:"42P01"},404);
  }
  assert.ok(u.pathname.endsWith("/wb1_beta_invites"),"Unexpected endpoint");
  if(options.method==="PATCH"){
    assert.equal(u.searchParams.get("accepted_user_id"),"is.null");assert.ok(u.searchParams.get("or")?.includes("expires_at.gt."));
    const b=JSON.parse(options.body),id=u.searchParams.get("id").slice(3);
    return reply(JSON.parse(await sql(`with updated as (
      update public.wb1_beta_invites set status='accepted',accepted_user_id=${quote(b.accepted_user_id)},
      accepted_at=${quote(b.accepted_at)}::timestamptz,updated_at=${quote(b.updated_at)}::timestamptz
      where id=${quote(id)}::uuid and accepted_user_id is null and status in ('pending','accepted')
      and (expires_at is null or expires_at>now()) returning *) select coalesce(json_agg(updated),'[]'::json) from updated`)));
  }
  assert.ok(!options.method||options.method==="GET","A direct count/INSERT fallback is forbidden");
  const filters=[];
  for(const key of ["email","accepted_user_id"]){
    const value=u.searchParams.get(key);if(value){assert.ok(value.startsWith("eq."));filters.push(`${key}=${quote(value.slice(3))}`)}
  }
  return reply(await rows(`select * from wb1_beta_invites${filters.length?" where "+filters.join(" and "):""}`));
};
async function request(handler,id,body){
  let output;
  await handler({method:body?"POST":"GET",query:{},headers:{authorization:`Bearer fixture-${id}`},body},
    {setHeader(){},status(n){this.code=n;return this},json(json){output={status:this.code||200,json};return this}});
  return output;
}
const activate=(id=ids[0],code=validCode)=>request(support,id,{action:"beta_code_activate",code,email:"untrusted@example.test",user_id:ids[2],nickname:"Untrusted"});
const count=()=>sql(`select count(*) from wb1_beta_invites where invited_by_user_id=${quote(source)} and status in ('pending','accepted')`);
async function reset(){await sql("delete from wb1_beta_invites;update wb1_beta_signup_policy set accept_until='2026-10-31T23:59:59Z'");}
async function seed({status="accepted",owner=null,expired=false,email="player1@example.test"}={}){
  await sql(`insert into wb1_beta_invites(email,status,accepted_user_id,invited_by_user_id,expires_at)
    values(${quote(email)},${quote(status)},${owner?quote(owner):"null"},${quote(source)},${expired?"now()-interval '1 day'":"null"})`);
}
try{
  execFileSync("initdb",["-D",data,"-U","wb_audit","--auth=trust","--no-locale","-E","UTF8"],{stdio:"ignore"});
  execFileSync("pg_ctl",["-D",data,"-l",path.join(dir,"postgres.log"),"-o",`-k ${dir} -p ${port} -c listen_addresses=''`,"-w","start"],{stdio:"ignore"});started=true;
  await sql("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique);");
  await sql(fs.readFileSync("supabase/migration_v2_5_26_beta_invites.sql","utf8"));
  const migration=fs.readFileSync("supabase/migration_v2_5_32_beta_activation_atomic.sql","utf8");
  await sql(migration);await sql(migration); // idempotent
  for(let i=0;i<ids.length;i++)await sql(`insert into auth.users values(${quote(ids[i])}::uuid,'player${i+1}@example.test')`);
  const current=fs.readFileSync("api/support.js","utf8");
  assert.match(current,/const DEFAULT_BETA_CODE_HASH="[a-f0-9]{64}";/);
  assert.ok(current.includes(`const BETA_CODE_SOURCE="${source}";`));
  assert.match(current,/const BETA_CODE_MAX_USERS=25;/);
  assert.equal(Number(await sql("select extract(epoch from accept_until)*1000 from wb1_beta_signup_policy")),
    Date.parse(current.match(/const BETA_CODE_ACCEPT_UNTIL=Date.parse\("([^"]+)"\)/)[1]));
  assert.equal(await sql("select max_users from wb1_beta_signup_policy"),"25");
  for(const role of ["anon","authenticated"]){
    await assert.rejects(sql(`set role ${role};select public.wb1_activate_beta_invitation(${quote(ids[0])},true)`),/permission denied/);
  }
  console.log("PASS migration idempotent, server-only RPC, original code/policy unchanged");
  let p=await request(pro,ids[0]);assert.equal(p.json.allowed,true);assert.equal(p.json.alliance_beta_allowed,false);
  assert.equal(betaCodeVisible(p.json,{logged:true}),true);assert.equal(p.json.entitlement.source,"free");
  assert.equal(betaCodeVisible(p.json,{logged:false}),false);assert.equal(betaCodeVisible(p.json,{logged:true,betaGranted:true}),false);
  let r=await activate(ids[0],"WRONG");assert.equal(r.json.error,"BETA_CODE_INVALID");assert.equal(await count(),"0");
  missingRpc=true;r=await activate();assert.equal(r.status,503);assert.equal(r.json.error,"BETA_ACTIVATION_SCHEMA_MISSING");assert.equal(await count(),"0");missingRpc=false;
  r=await activate();assert.equal(r.status,200);assert.equal(r.json.allowed,true);assert.equal(await count(),"1");
  const first=(await rows("select * from wb1_beta_invites"))[0];assert.equal(first.email,"player1@example.test");assert.equal(first.accepted_user_id,ids[0]);
  r=await activate(ids[0],"WRONG");assert.equal(r.json.already_allowed,true);assert.equal(await count(),"1");
  p=await request(pro,ids[0]);assert.equal(p.json.alliance_beta_allowed,true);assert.equal(p.json.entitlement.source,"beta");
  assert.equal(betaCodeVisible(p.json,{logged:true}),false);
  assert.equal((await request(pro,ids[1])).json.alliance_beta_allowed,false);
  assert.equal((await request(pro,ids[0])).json.alliance_beta_allowed,true); // reopened/repeated request
  console.log("PASS visible FREE code field, invalid code, missing migration fail-closed, activation, idempotency, persistence and account isolation");
  await sql(`update auth.users set email='renamed@example.test' where id=${quote(ids[0])}::uuid`);
  assert.equal((await request(pro,ids[0])).json.alliance_beta_allowed,true);assert.equal((await activate()).json.already_allowed,true);
  await sql(`update auth.users set email='player1@example.test' where id=${quote(ids[0])}::uuid`);
  await reset();await seed({owner:ids[1]});const prior=await sql("select row_to_json(r) from wb1_beta_invites r");
  r=await activate();assert.equal(r.json.error,"BETA_INVITE_OWNER_MISMATCH");assert.equal(prior,await sql("select row_to_json(r) from wb1_beta_invites r"));
  assert.equal(JSON.parse(await sql(`set role service_role;select wb1_activate_beta_invitation(${quote(ids[0])},true)`)).error,"BETA_INVITE_OWNER_MISMATCH");
  await reset();await seed({status:"pending"});r=await activate();assert.equal(r.json.already_allowed,true);assert.equal(await count(),"1");
  assert.equal((await rows("select accepted_user_id from wb1_beta_invites"))[0].accepted_user_id,ids[0]);
  await reset();await seed({status:"revoked",owner:ids[0]});r=await activate();assert.equal(r.json.error,"BETA_ACCESS_REVOKED");assert.equal(await count(),"0");
  p=await request(pro,ids[0]);assert.equal(p.json.allowed,true);assert.equal(betaCodeVisible(p.json,{logged:true}),false);
  console.log("PASS stable auth identity, foreign owner refusal without mutation, CAS acceptance and revoked behavior");
  for(const status of ["pending","accepted"]){
    await reset();await seed({status,owner:status==="accepted"?ids[0]:null,expired:true});
    const snapshot=await sql("select row_to_json(r) from wb1_beta_invites r");
    r=await activate();assert.equal(r.json.error,"BETA_INVITE_EXPIRED");assert.equal(snapshot,await sql("select row_to_json(r) from wb1_beta_invites r"));
    assert.equal(JSON.parse(await sql(`set role service_role;select wb1_activate_beta_invitation(${quote(ids[0])},true)`)).error,"BETA_INVITE_EXPIRED");
    p=await request(pro,ids[0]);assert.equal(betaCodeVisible(p.json,{logged:true}),false);
    if(status==="accepted"){
      protectedGrant={user_id:ids[0],grant_type:"beta",starts_at:"2026-01-01T00:00:00Z",expires_at:null,revoked_at:null};
      const grantSnapshot=JSON.stringify(protectedGrant);
      p=await request(pro,ids[0]);assert.equal(p.json.entitlement.source,"beta");assert.equal(p.json.active,true);
      r=await activate();assert.equal(r.json.error,"BETA_INVITE_EXPIRED");assert.equal(JSON.stringify(protectedGrant),grantSnapshot);
      protectedGrant=null;
    }
  }
  await reset();await sql("update wb1_beta_signup_policy set accept_until=now()-interval '1 day'");
  r=await activate();assert.equal(r.json.error,"BETA_CODE_EXPIRED");assert.equal(await count(),"0");
  await seed({owner:ids[0]});r=await activate();assert.equal(r.json.already_allowed,true);
  console.log("PASS expired invitation/code refused without partial writes; previously accepted access survives code deadline");
  await reset();
  await sql(`insert into wb1_beta_invites(email,status,invited_by_user_id)
    select 'seed'||n||'@example.test','accepted',${quote(source)} from generate_series(1,24) n`);
  // Two different psql processes/sessions, held at the same policy lock before release.
  const blocker=sql("begin;select * from wb1_beta_signup_policy where singleton for update;select pg_sleep(0.8);commit");
  await new Promise(resolve=>setTimeout(resolve,150));
  const concurrent=await Promise.all([activate(ids[0]),activate(ids[1])]);await blocker;
  assert.equal(concurrent.filter(x=>x.status===200).length,1);
  assert.equal(concurrent.filter(x=>x.json.error==="BETA_CODE_FULL").length,1);assert.equal(await count(),"25");
  const winner=concurrent[0].status===200?ids[0]:ids[1];
  assert.equal((await activate(winner)).json.already_allowed,true);assert.equal(await count(),"25");
  await assert.rejects(seed({email:"overflow@example.test"}),/BETA_CODE_FULL/);
  await sql(`update wb1_beta_invites set status='revoked' where accepted_user_id=${quote(winner)}`);
  assert.equal(await count(),"24");await activate(ids[2]);assert.equal(await count(),"25");
  await assert.rejects(sql(`update wb1_beta_invites set status='accepted' where accepted_user_id=${quote(winner)}`),/BETA_CODE_FULL/);
  console.log("PASS two concurrent PostgreSQL sessions: one last-slot success, one clear refusal; direct writes/restores also bounded; revoked frees capacity");
  assert.equal(betaActivationSucceeded({ok:true},{ok:true,allowed:false}),false);
  assert.equal(betaActivationSucceeded({ok:false},{ok:true,allowed:true}),false);
  assert.equal(betaActivationErrorKey("BETA_INVITE_EXPIRED"),"beta_access_expired");
  // Execute the actual app functions with a delayed A response and a FREE B session.
  // An already-invited B browser fixture alone would not detect accidental authorization.
  const app=fs.readFileSync("app.js","utf8"),nodes=new Map();
  for(const id of ["#betaAccessCode","#betaCodeStatus","#betaCodeActivateBtn"])
    nodes.set(id,{value:validCode,textContent:"",classList:{add(){},remove(){}}});
  let finishPost,finishGet,paints=0;
  const context=vm.createContext({
    cloudSession:{user:{id:ids[0]},access_token:"a"},betaState:{},proState:{},
    $:selector=>nodes.get(selector),t:key=>key,authHeaders:()=>({}),
    fetchJsonBounded:()=>new Promise(resolve=>{finishPost=resolve}),
    fetchSessionCritical:()=>new Promise(resolve=>{finishGet=resolve}),
    betaActivationSucceeded,betaActivationErrorKey,
    renderBeta:()=>{paints++},render:()=>{paints++},renderPro:()=>{paints++}
  });
  const activationStart=app.indexOf("async function activateBetaCode()");
  const keyStart=app.indexOf("function sessionApplyKey(",activationStart);
  const keyEnd=app.indexOf("\n",keyStart);
  const refreshStart=app.indexOf("async function refreshBeta()");
  vm.runInContext(app.slice(activationStart,keyStart)+app.slice(keyStart,keyEnd)+app.slice(refreshStart,activationStart),context);
  const pendingPost=context.activateBetaCode();
  context.cloudSession={user:{id:ids[1]},access_token:"b"};
  context.betaState={alliance_beta_allowed:false,beta_code_eligible:true,beta_access_status:"invite-required"};
  context.proState={beta:false,active:false,entitlement:{source:"free"}};
  finishPost({response:{ok:true},json:{ok:true,allowed:true}});
  await pendingPost;
  assert.equal(context.betaState.alliance_beta_allowed,false);assert.equal(context.proState.active,false);assert.equal(paints,0);
  context.cloudSession={user:{id:ids[0]},access_token:"a"};
  const pendingGet=context.refreshBeta();
  context.cloudSession={user:{id:ids[1]},access_token:"b"};
  finishGet(reply({ok:true,allowed:true,alliance_beta_allowed:true,beta_code_eligible:false,beta:true,active:true}));
  await pendingGet;
  assert.equal(context.betaState.alliance_beta_allowed,false);assert.equal(context.proState.beta,false);assert.equal(paints,0);
  console.log("PASS actual app activation/status functions ignore delayed A replies while B remains FREE");
  for(const [language] of LANGUAGES.filter(x=>x[0]!=="auto"))
    for(const key of ["beta_invitation_other_account","beta_access_expired","beta_code_invalid","beta_code_full"])
      assert.notEqual(translator(language)(key),key);
  console.log("PASS UI success requires explicit server approval; all supported languages have refusal messages");
}finally{cleanup();}