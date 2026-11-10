import assert from "node:assert/strict";
import fs from "node:fs";
import {createWarBoostSupabaseAuthClient} from "../lib/browser-auth.js";
import {PENDING_AUTH_EMAIL_KEY,clearSignedOutAuthUi} from "../lib/auth-ui.js";

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
// SDK session/logout and account-scoped storage are exercised below.
assert.match(app,/logoutBtn[\s\S]*?signOutPending=signOutClient\.auth\.signOut\(\)[\s\S]*?clearSignedOutAuthUi\(\);cloudSession=null;cloudRevision=null/,
  "manual logout must clear auth UI after Supabase signOut");
assert.doesNotMatch(app,/localStorage\.clear\(\)/,"logout must not clear all WarBoost local data");

const values=new Map([
  [PENDING_AUTH_EMAIL_KEY,"player@example.invalid"],
  ["warboost_v1_client_id","device-123"],
  ["warboost_v2_state",JSON.stringify({player_id:"fixture-user",scans:["scan-1"]})],
  ["warboost_v1_language","fr"]
]);
const storage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
};
const classes=new Set(["visible"]);
const fields=new Map(["authEmail","authPassword","authOtp"].map(id=>[id,{value:id==="authEmail"?"player@example.invalid":"synthetic-password"}]));
const documentRef={getElementById:id=>id==="otpBox"?{classList:{add:name=>classes.add(name)}}:fields.get(id)||null};
clearSignedOutAuthUi({storage,documentRef});
assert.equal(storage.getItem(PENDING_AUTH_EMAIL_KEY),null);
assert.deepEqual([...fields.values()].map(field=>field.value),["","",""]);
assert.ok(classes.has("hidden"));
assert.equal(storage.getItem("warboost_v1_client_id"),"device-123");
assert.deepEqual(JSON.parse(storage.getItem("warboost_v2_state")),{player_id:"fixture-user",scans:["scan-1"]});
assert.equal(storage.getItem("warboost_v1_language"),"fr");

const authStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
};
const authFetch=async(url)=>{
  if(String(url).includes("grant_type=password"))return {ok:true,status:200,json:async()=>({access_token:"access-fixture",refresh_token:"refresh-fixture",expires_in:3600,user:{id:"fixture-user",email:"player@example.invalid"}})};
  if(String(url).endsWith("/logout"))return {ok:true,status:204,json:async()=>({})};
  throw new Error(`Unexpected auth request: ${url}`);
};
const client=createWarBoostSupabaseAuthClient({url:"https://auth-fixture.invalid",key:"publishable-fixture",storage:authStorage,fetchImpl:authFetch});
let signedOutEventCleanup=false;
client.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"&&!session){
    signedOutEventCleanup=true;
    clearSignedOutAuthUi({storage:authStorage,documentRef});
  }
});
authStorage.setItem(PENDING_AUTH_EMAIL_KEY,"player@example.invalid");
for(const [id,field] of fields)field.value=id==="authEmail"?"player@example.invalid":"synthetic-password";
classes.delete("hidden");
const signed=await client.auth.signInWithPassword({email:"player@example.invalid",password:"synthetic-password"});
assert.equal(signed.error,null);
assert.ok(authStorage.getItem("sb-auth-fixture-auth-token"));
await client.auth.signOut();
assert.equal(authStorage.getItem("sb-auth-fixture-auth-token"),null,"Supabase local session must be removed");
assert.equal(signedOutEventCleanup,true,"SIGNED_OUT must run the signed-out cleanup path");
assert.equal(authStorage.getItem(PENDING_AUTH_EMAIL_KEY),null);
assert.deepEqual([...fields.values()].map(field=>field.value),["","",""]);
assert.ok(classes.has("hidden"));
assert.equal(authStorage.getItem("warboost_v1_client_id"),"device-123");
assert.deepEqual(JSON.parse(authStorage.getItem("warboost_v2_state")),{player_id:"fixture-user",scans:["scan-1"]});

const expiredStorage=new Map([
  ["sb-auth-fixture-auth-token",JSON.stringify({access_token:"expired-access",refresh_token:"expired-refresh",expires_in:1,expires_at:1})],
  [PENDING_AUTH_EMAIL_KEY,"expired@example.invalid"],
  ["warboost_v1_client_id","device-123"]
]);
// Transient network failure preserves a restorable session; rejected refresh signs out.
const transientClient=createWarBoostSupabaseAuthClient({
  url:"https://auth-fixture.invalid",key:"publishable-fixture",
  storage:{getItem:key=>expiredStorage.get(key)||null,setItem:(key,value)=>expiredStorage.set(key,String(value)),removeItem:key=>expiredStorage.delete(key)},
  fetchImpl:async()=>{throw new Error("Synthetic offline")}
});
assert.ok((await transientClient.auth.getSession()).data.session,"temporary offline must not erase a stored session");
const expiredFetch=async()=>new Response(JSON.stringify({error_code:"refresh_token_not_found",msg:"Synthetic rejected refresh"}),{status:400});
const expiredClient=createWarBoostSupabaseAuthClient({
  url:"https://auth-fixture.invalid",
  key:"publishable-fixture",
  storage:{getItem:key=>expiredStorage.has(key)?expiredStorage.get(key):null,setItem:(key,value)=>expiredStorage.set(key,String(value)),removeItem:key=>expiredStorage.delete(key)},
  fetchImpl:expiredFetch
});
const expired=await expiredClient.auth.getSession();
assert.equal(expired.data.session,null,"expired sessions must become signed out");
assert.equal(expiredStorage.get("sb-auth-fixture-auth-token"),undefined,"expired Supabase session must be removed locally");
for(const [id,field] of fields)field.value=id==="authEmail"?"expired@example.invalid":"synthetic-password";
classes.delete("hidden");
clearSignedOutAuthUi({
  storage:{removeItem:key=>expiredStorage.delete(key)},
  documentRef
});
assert.equal(expiredStorage.get(PENDING_AUTH_EMAIL_KEY),undefined);
assert.deepEqual([...fields.values()].map(field=>field.value),["","",""]);
assert.ok(classes.has("hidden"));
assert.equal(expiredStorage.get("warboost_v1_client_id"),"device-123");

console.log("WarBoost auth logout cleanup: PASS (synthetic fixtures only)");
