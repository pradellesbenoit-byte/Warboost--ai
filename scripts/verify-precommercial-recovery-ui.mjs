import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {translator} from "../i18n.js";

// Execute the actual page controller with a fictitious DOM and transport.
const source=fs.readFileSync(new URL("../reset-password.js",import.meta.url),"utf8")
  .replace(/^import .*;\s*$/gm,"")
  .replace(/\binit\(\);\s*$/,"globalThis.initialization=init();");
function element(hidden=false){
  const classes=new Set(hidden?["hidden"]:[]);
  return {value:"",textContent:"",disabled:false,events:{},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),
      toggle(c,on){if(on)classes.add(c);else classes.delete(c)}},
    addEventListener(name,fn){this.events[name]=fn},focus(){}};
}
async function setup({mode="valid"}={}){
  const ids=["recoveryLoading","recoveryForm","recoveryStatus","newPassword","confirmPassword","savePasswordBtn","backToWarBoost"];
  const nodes=Object.fromEntries(ids.map(id=>[id,element(["recoveryForm","recoveryStatus"].includes(id))]));
  const data=new Map();let updates=0,signouts=0,authCreated=0;
  const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const context={
    document:{querySelector:key=>nodes[key.slice(1)],querySelectorAll:()=>[],documentElement:{}},
    localStorage:storage,sessionStorage:storage,resolveLanguage:()=>"fr",dirFor:()=>"ltr",translator,
    isNativeWarBoost:false,configureMobileAuth(){},AbortController,setTimeout,clearTimeout,URL,
    location:{href:"https://fiction.invalid/reset-password.html",origin:"https://fiction.invalid",assign(){}},
    fetch:async url=>{
      assert.equal(url,"/api/cloud-config");
      if(mode==="offline")throw new TypeError("Synthetic offline");
      return {ok:true,json:async()=>({configured:mode!=="unconfigured",url:"https://fiction.supabase.invalid",key:"synthetic-only"})};
    },
    createWarBoostSupabaseAuthClient(){
      authCreated++;
      return {auth:{
        consumeRecoverySessionFromUrl:async()=>mode==="expired"?{error:{code:"otp_expired"}}:{
          data:mode==="missing"?{event:null,session:null}:{event:"PASSWORD_RECOVERY",session:{access_token:"synthetic-only"}}
        },
        getSession:async()=>{throw new Error("No historical-session recovery permitted in fixture")},
        updateUser:async()=>{updates++;return {error:null}},
        signOut:async()=>{signouts++;return {error:null}}
      }};
    }
  };
  vm.runInNewContext(source,context,{filename:"reset-password.js"});
  await context.initialization;
  return {nodes,counts:()=>({updates,signouts,authCreated})};
}
for(const mode of ["missing","expired","offline","unconfigured"]){
  test(`recovery ${mode}: error finishes loading and keeps password fields hidden`,async()=>{
    const {nodes,counts}=await setup({mode});
    assert.equal(nodes.recoveryLoading.classList.contains("hidden"),true);
    assert.equal(nodes.recoveryForm.classList.contains("hidden"),true);
    assert.equal(nodes.recoveryStatus.classList.contains("hidden"),false);
    assert.ok(nodes.recoveryStatus.textContent);assert.equal(counts().updates,0);
  });
}
test("valid synthetic recovery reveals password controls without an update",async()=>{
  const {nodes,counts}=await setup();
  assert.equal(nodes.recoveryLoading.classList.contains("hidden"),true);
  assert.equal(nodes.recoveryForm.classList.contains("hidden"),false);
  assert.equal(counts().updates,0);
});
test("short or mismatching passwords are rejected before the Auth transport",async()=>{
  const {nodes,counts}=await setup();
  for(const [a,b] of [["short","short"],["synthetic-long","different-long"]]){
    nodes.newPassword.value=a;nodes.confirmPassword.value=b;
    await nodes.savePasswordBtn.events.click();assert.equal(counts().updates,0);
    assert.ok(nodes.recoveryStatus.textContent);assert.equal(nodes.savePasswordBtn.disabled,false);
  }
});
test("synthetic successful update signs out and hides the completed form",async()=>{
  const {nodes,counts}=await setup();
  nodes.newPassword.value=nodes.confirmPassword.value="synthetic-long-password";
  await nodes.savePasswordBtn.events.click();
  assert.equal(counts().updates,1);assert.equal(counts().signouts,1);
  assert.equal(nodes.recoveryForm.classList.contains("hidden"),true);
  assert.equal(nodes.savePasswordBtn.disabled,false);
  assert.equal(nodes.recoveryStatus.textContent,translator("fr")("password_updated_success"));
});
