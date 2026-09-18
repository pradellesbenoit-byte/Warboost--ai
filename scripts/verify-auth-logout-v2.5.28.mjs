import assert from "node:assert/strict";
import fs from "node:fs";
import {createWarBoostSupabaseAuthClient} from "../lib/browser-auth.js";
import {PENDING_AUTH_EMAIL_KEY,clearSignedOutAuthUi} from "../lib/auth-ui.js";

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const coreStart=app.indexOf("async function applySessionCore(session)");
const coreEnd=app.indexOf("function cloudAuthFailureMessage()",coreStart);
assert.ok(coreStart>=0&&coreEnd>coreStart,"applySessionCore must exist");
const core=app.slice(coreStart,coreEnd);
const signedInStart=core.indexOf("if(cloudSession?.user?.id)");
const signedOutStart=core.indexOf("}else{",signedInStart);
assert.ok(signedInStart>=0&&signedOutStart>signedInStart,"session branches must remain explicit");
assert.doesNotMatch(core.slice(signedInStart,signedOutStart),/clearSignedOutAuthUi\(\)/,"valid sessions must not clear auth UI");
assert.match(core.slice(signedOutStart),/clearSignedOutAuthUi\(\)/,"session-absent branch must clear auth UI");
assert.match(app,/logoutBtn[\s\S]*?cloud\.auth\.signOut\(\);clearSignedOutAuthUi\(\)/,"manual logout must clear auth UI after Supabase signOut");
assert.doesNotMatch(app,/localStorage\.clear\(\)/,"logout must not clear all WarBoost local data");

const values=new Map([
  [PENDING_AUTH_EMAIL_KEY,"benoitpradelles@orange.fr"],
  ["warboost_v1_client_id","device-123"],
  ["warboost_v2_state",JSON.stringify({player_id:"u1",scans:["scan-1"]})],
  ["warboost_v1_language","fr"]
]);
const storage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
};
const classes=new Set(["visible"]);
const fields=new Map(["authEmail","authPassword","authOtp"].map(id=>[id,{value:id==="authEmail"?"benoitpradelles@orange.fr":"secret"}]));
const documentRef={getElementById:id=>id==="otpBox"?{classList:{add:name=>classes.add(name)}}:fields.get(id)||null};
clearSignedOutAuthUi({storage,documentRef});
assert.equal(storage.getItem(PENDING_AUTH_EMAIL_KEY),null);
assert.deepEqual([...fields.values()].map(field=>field.value),["","",""]);
assert.ok(classes.has("hidden"));
assert.equal(storage.getItem("warboost_v1_client_id"),"device-123");
assert.deepEqual(JSON.parse(storage.getItem("warboost_v2_state")),{player_id:"u1",scans:["scan-1"]});
assert.equal(storage.getItem("warboost_v1_language"),"fr");

const authStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
};
const authFetch=async(url)=>{
  if(String(url).includes("grant_type=password"))return {ok:true,status:200,json:async()=>({access_token:"access-1",refresh_token:"refresh-1",expires_in:3600,user:{id:"u1",email:"tester@example.com"}})};
  if(String(url).endsWith("/logout"))return {ok:true,status:204,json:async()=>({})};
  throw new Error(`Unexpected auth request: ${url}`);
};
const client=createWarBoostSupabaseAuthClient({url:"https://abc123.supabase.co",key:"publishable",storage:authStorage,fetchImpl:authFetch});
let signedOutEventCleanup=false;
client.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"&&!session){
    signedOutEventCleanup=true;
    clearSignedOutAuthUi({storage:authStorage,documentRef});
  }
});
const signed=await client.auth.signInWithPassword({email:"tester@example.com",password:"secret"});
assert.equal(signed.error,null);
assert.ok(authStorage.getItem("sb-abc123-auth-token"));
await client.auth.signOut();
assert.equal(authStorage.getItem("sb-abc123-auth-token"),null,"Supabase local session must be removed");
assert.equal(signedOutEventCleanup,true,"SIGNED_OUT must run the signed-out cleanup path");
assert.equal(authStorage.getItem(PENDING_AUTH_EMAIL_KEY),null);
assert.equal(authStorage.getItem("warboost_v1_client_id"),"device-123");
assert.deepEqual(JSON.parse(authStorage.getItem("warboost_v2_state")),{player_id:"u1",scans:["scan-1"]});

const expiredStorage=new Map([
  ["sb-abc123-auth-token",JSON.stringify({access_token:"expired-access",refresh_token:"expired-refresh",expires_in:1,expires_at:1})],
  [PENDING_AUTH_EMAIL_KEY,"expired@example.com"],
  ["warboost_v1_client_id","device-123"]
]);
const expiredFetch=async()=>{throw Object.assign(new Error("refresh unavailable"),{code:"auth_network_unavailable"})};
const expiredClient=createWarBoostSupabaseAuthClient({
  url:"https://abc123.supabase.co",
  key:"publishable",
  storage:{getItem:key=>expiredStorage.has(key)?expiredStorage.get(key):null,setItem:(key,value)=>expiredStorage.set(key,String(value)),removeItem:key=>expiredStorage.delete(key)},
  fetchImpl:expiredFetch
});
const expired=await expiredClient.auth.getSession();
assert.equal(expired.data.session,null,"expired sessions must become signed out");
assert.equal(expiredStorage.get("sb-abc123-auth-token"),undefined,"expired Supabase session must be removed locally");
clearSignedOutAuthUi({
  storage:{removeItem:key=>expiredStorage.delete(key)},
  documentRef
});
assert.equal(expiredStorage.get(PENDING_AUTH_EMAIL_KEY),undefined);
assert.equal(expiredStorage.get("warboost_v1_client_id"),"device-123");

console.log("WarBoost auth logout cleanup: PASS");