import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import {realpath} from "node:fs/promises";
import {mergeSharedAllianceRoster} from "../lib/shared-alliance-roster.js";
import {createAccountDeletionHandler,deletionChallenge,verifyDeletionChallenge} from "../lib/account-deletion.js";
import {clearDeletedAccountLocalData} from "../lib/account-deletion-ui.js";
import supportHandler from "../api/support.js";
const realHandler=(req,res)=>supportHandler({...req,body:{...req.body,action:req.body.action==="prepare"?"account_delete_prepare":"account_delete_confirm"}},res);
const alice="50000000-0000-4000-8000-000000000001",bob="50000000-0000-4000-8000-000000000002",secret="synthetic-test-secret";
const headers={authorization:"Bearer synthetic-alice"};
let mutations=[],prepares=[];
const handler=createAccountDeletionHandler({
  requireUser:async req=>{if(!req.headers?.authorization)throw Object.assign(new Error("auth"),{code:"AUTH_REQUIRED",status:401});return {id:req.headers.authorization.endsWith("bob")?bob:alice}},
  prepare:async id=>prepares.push(id),remove:async id=>mutations.push(id),secret:()=>secret
});
async function call(body,extra={},target=handler){
  let status=200,result;const res={setHeader(){},status(n){status=n;return this},json(value){result=value}};
  await target({method:"POST",body,headers,query:{},...extra},res);
  return {status,result};
}
assert.equal((await call({action:"prepare",understood:true},{headers:{}})).status,401);
// Real production entrypoint, no token => no network, no database.
assert.equal((await call({action:"delete",understood:true},{headers:{}},realHandler)).status,401);
for(const body of [{action:"prepare"},{action:"delete",understood:true},{action:"delete",understood:true,confirmation:"SUPPRIMER",challenge:"forged"}]){
  assert.equal((await call(body)).status,400);
}
for(const field of ["user_id","player_id","email","target","p_user_id","attachments"]){
  assert.equal((await call({action:"prepare",understood:true,[field]:bob})).result.error,"TARGET_NOT_ALLOWED");
}
assert.equal((await call({action:"prepare",understood:true},{query:{user_id:bob}})).status,400);
assert.equal((await call({}, {method:"GET"})).status,405);
const prepared=await call({action:"prepare",understood:true});
assert.equal(prepared.status,200);assert.deepEqual(prepares,[alice]);
const body={action:"delete",understood:true,confirmation:"SUPPRIMER",challenge:prepared.result.challenge};
assert.equal((await call({...body,confirmation:"supprimer"})).status,400);
assert.equal((await call(body,{headers:{authorization:"Bearer synthetic-bob"}})).status,400);
assert.equal((await call(body,{headers:{authorization:"Bearer synthetic-alice-other-session"}})).status,400);
assert.equal(mutations.length,0);
assert.equal((await call(body)).result.deleted,true);
assert.deepEqual(mutations,[alice]);
const old=deletionChallenge(alice,{headers},secret,1000);
assert.throws(()=>verifyDeletionChallenge(old,alice,{headers},secret,302000),/CONFIRMATION_EXPIRED/);
assert.throws(()=>deletionChallenge(alice,{headers},""),/DELETION_NOT_CONFIGURED/);
const fail=createAccountDeletionHandler({requireUser:async()=>({id:alice}),prepare:async()=>{throw Object.assign(new Error("migration"),{code:"DELETION_MIGRATION_REQUIRED",status:503})},remove:async()=>assert.fail("No mutation before preparation"),secret:()=>secret});
assert.equal((await call({action:"prepare",understood:true},{},fail)).result.error,"DELETION_MIGRATION_REQUIRED");
const unavailable=createAccountDeletionHandler({requireUser:async()=>({id:alice}),prepare:async()=>{},remove:async()=>{throw new Error("secret internal failure")},secret:()=>secret});
assert.equal((await call(body,{},unavailable)).result.deleted,undefined);
assert.equal((await call(body,{},unavailable)).result.error,"DELETION_UNAVAILABLE");
const data=new Map([
  [`warboost_account_state:${alice}`,JSON.stringify({player_id:alice})],
  [`warboost_account_state:${bob}`,JSON.stringify({player_id:bob})],
  ["warboost_v1_core_state",JSON.stringify({player_id:alice})],
  ["warboost_last_good_state",JSON.stringify({state:{player_id:alice}})]
]);
await clearDeletedAccountLocalData(alice,{getItem:k=>data.get(k),removeItem:k=>data.delete(k)});
assert.equal(data.has(`warboost_account_state:${alice}`),false);
assert.equal(data.has("warboost_last_good_state"),false);
assert.equal(data.has(`warboost_account_state:${bob}`),true);
const unlinked=mergeSharedAllianceRoster(
  [{name:"Alice",server_id:"884",alliance_tag:"TEST",identity_basis:"account-deleted",warboost_linked:false}],
  [{name:"Alice",server_id:"884",alliance_tag:"TEST",player_id:alice,warboost_linked:true,identity_linked_at:"2026-10-01",power_m:10}]
)[0];
assert.equal(unlinked.player_id,null);assert.equal(unlinked.warboost_linked,false);assert.equal(unlinked.power_m,10);
for(const path of ["security.html","privacy.html","delete-account.html"]){
  const source=fs.readFileSync(path,"utf8");assert.match(source,/<h1>/);assert.match(source,/Last War/);assert.doesNotMatch(source,/requireBetaUser|requireProductUser/);
}
const html=fs.readFileSync("index.html","utf8");
assert.match(html,/href="\/security.html"/);assert.match(html,/id="deleteAccountBtn"/);
assert.match(html,/accountDeletionUnderstood/);assert.match(html,/accountDeletionWord/);
// Actual server resolver: synthetic files only, including internal and external symlink targets.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"wb-public-files-"));
try{
  const root=path.join(dir,"public");fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,"security.html"),"fixture");
  fs.writeFileSync(path.join(root,".env"),"SYNTHETIC-NOT-A-SECRET");
  fs.writeFileSync(path.join(dir,"outside.html"),"fixture");
  fs.symlinkSync(path.join(dir,"outside.html"),path.join(root,"escape.html"));
  fs.symlinkSync(path.join(root,".env"),path.join(root,"hidden.js"));
  const source=fs.readFileSync("server.mjs","utf8");
  const start=source.indexOf("async function publicFilePath("),end=source.indexOf("\nfunction securityHeaders",start);
  const context=vm.createContext({ROOT:root,path,realpath});
  vm.runInContext(source.slice(start,end),context);
  assert.equal(await context.publicFilePath("/security.html"),path.join(root,"security.html"));
  assert.equal(await context.publicFilePath("/../outside.html"),null);
  assert.equal(await context.publicFilePath("/escape.html"),null);
  assert.equal(await context.publicFilePath("/hidden.js"),null);
  assert.equal(await context.publicFilePath("/.env"),null);
}finally{fs.rmSync(dir,{recursive:true,force:true})}
// Exercise the actual auth + Supabase + Storage helpers with synthetic, never-real upstreams.
Object.assign(process.env,{SUPABASE_URL:"https://deletion-fixture.invalid",SUPABASE_ANON_KEY:"fixture-public",SUPABASE_SERVICE_ROLE_KEY:"fixture-service",SESSION_SECRET:secret});
const originalFetch=globalThis.fetch,upstreams=[];
let storageAvailable=true,migrationAvailable=true;
globalThis.fetch=async(url,options={})=>{
  assert.ok(String(url).startsWith("https://deletion-fixture.invalid/"),"No real network allowed");
  const body=options.body?JSON.parse(options.body):{};
  upstreams.push({url:String(url),body,method:options.method||"GET"});
  if(String(url).endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:alice,email:"fixture@example.test"}),{status:200});
  if(String(url).includes("/rpc/")){
    assert.equal(body.p_user_id,alice,"Real helper target comes only from real requireUser response");
    if(!migrationAvailable)return new Response(JSON.stringify({code:"PGRST202",message:"Could not find the function"}),{status:404});
    if(String(url).endsWith("/wb1_prepare_account_deletion"))return new Response(JSON.stringify({blocked:false,attachments:["WB-20261006-AAAAAA/1791234567000-aaaaaaaa.jpg"]}),{status:200});
    if(String(url).endsWith("/wb1_delete_account_data"))return new Response(JSON.stringify({deleted:true}),{status:200});
  }
  if(String(url).endsWith("/storage/v1/object/warboost-support")){
    assert.deepEqual(body.prefixes,["WB-20261006-AAAAAA/1791234567000-aaaaaaaa.jpg"]);
    return new Response(JSON.stringify(storageAvailable?{}:{message:"synthetic failure"}),{status:storageAvailable?200:503});
  }
  assert.fail("Unexpected upstream");
};
try{
  // Node IncomingMessage headers/method may be inherited getters; delegation must preserve them.
  const inherited=Object.create({headers,method:"POST"});
  inherited.query={};inherited.body={action:"account_delete_prepare",understood:true};
  let inheritedStatus=200,inheritedBody;
  await supportHandler(inherited,{setHeader(){},status(n){inheritedStatus=n;return this},json(value){inheritedBody=value}});
  assert.equal(inheritedStatus,200);assert.ok(inheritedBody.challenge);
  const actual=await call({action:"prepare",understood:true},{},realHandler);
  assert.equal(actual.status,200);
  const confirm={action:"delete",understood:true,confirmation:"SUPPRIMER",challenge:actual.result.challenge};
  const start=upstreams.length;
  assert.equal((await call(confirm,{},realHandler)).result.deleted,true);
  assert.deepEqual(upstreams.slice(start).map(x=>x.url.split("/").pop()),["user","wb1_prepare_account_deletion","warboost-support","wb1_delete_account_data"]);
  storageAvailable=false;
  const before=upstreams.filter(x=>x.url.endsWith("/wb1_delete_account_data")).length;
  assert.equal((await call(confirm,{},realHandler)).status,503);
  assert.equal(upstreams.filter(x=>x.url.endsWith("/wb1_delete_account_data")).length,before,"Storage failure cannot delete the identity");
  migrationAvailable=false;
  assert.equal((await call({action:"prepare",understood:true},{},realHandler)).result.error,"DELETION_MIGRATION_REQUIRED");
  const writes=upstreams.length;
  assert.equal((await call({...confirm,p_user_id:bob},{},realHandler)).status,400);
  assert.equal(upstreams.length,writes+1,"Forged target performs authentication only, no deletion RPC");
}finally{globalThis.fetch=originalFetch}
console.log("PASS deletion security: real unauthenticated entrypoint, self-only identity, two confirmations, session/user/expiry/tamper checks, fail-closed RPC, local account isolation and public pages.");
