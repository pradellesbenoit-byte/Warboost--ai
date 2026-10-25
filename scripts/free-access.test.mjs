import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {freeAccountAllowed,assertFreeAccount,freeAccessCopy} from "../lib/free-access.js";
import {validPlayerIdentity} from "../lib/identity-onboarding.js";
import {createIdentityOnboardingService} from "../lib/identity-onboarding-service.js";
import {requirePersonalScanUser} from "../lib/personal-scan-access.js";
import {createAllianceAccessHandler} from "../lib/alliance-access-service.js";
import {entitlementForUser,requireProductUser} from "../lib/pro-access.js";
import {getAllianceRoster} from "../lib/supabase.js";
const verified={id:"synthetic-a",email:"a@example.invalid",email_confirmed_at:"2026-01-01T00:00:00Z"};
const authorize=async()=>({user:verified});
const basic={authorize,entitlement:async()=>({active:false}),consume:async()=>({reserved:true})};
test("FREE is not a beta invitation or a manager declaration",()=>{
  assert.equal(freeAccountAllowed(verified),true);
  assert.equal(freeAccountAllowed({...verified,role:"R5",email_confirmed_at:null}),false);
  assert.equal(freeAccountAllowed({...verified,email_confirmed_at:"invalid"}),false);
  assert.throws(()=>assertFreeAccount(null),{code:"EMAIL_CONFIRMATION_REQUIRED"});
});
test("no-alliance onboarding and two servers are accepted",()=>{
  for(const server_id of ["884","885"])assert.equal(validPlayerIdentity({name:"Player",server_id,alliance_tag:""}),true);
  assert.equal(validPlayerIdentity({name:"Player",server_id:"0",alliance_tag:""}),false);
});
for(const type of ["profile","squad1","squad2","squad3","squad4","technology","drone","exclusive"]){
  test(`FREE personal ${type} reserves a persistent quota`,async()=>{
    let count=0;
    const result=await requirePersonalScanUser({body:{scan_type:type}},{...basic,consume:async(name,body)=>{
      assert.equal(name,"wb1_reserve_free_scan");assert.equal(body.p_user_id,verified.id);count++;return {reserved:true};
    }});
    assert.equal(result.user.id,verified.id);assert.equal(count,1);
  });
}
test("quota failure/missing migration stops before any provider call",async()=>{
  await assert.rejects(requirePersonalScanUser({body:{}},{...basic,consume:async()=>({reserved:false})}),{code:"FREE_SCAN_QUOTA_EXCEEDED"});
  await assert.rejects(requirePersonalScanUser({body:{}},{...basic,consume:async()=>{throw new Error("schema unavailable")}}),/schema unavailable/);
});
test("legacy PRO bypasses FREE quota without granting a rank",async()=>{
  const result=await requirePersonalScanUser({body:{scan_type:"squad1"}},{...basic,entitlement:async()=>({active:true,source:"beta"}),consume:async()=>{throw Error("not FREE")}});
  assert.equal(result.user.id,verified.id);assert.equal(result.user.role,undefined);
});
test("roster scans remain PRO despite forged body entitlement",async()=>{
  await assert.rejects(requirePersonalScanUser({body:{scan_type:"alliance_roster",active:true,role:"R5"}},basic),{code:"PRO_REQUIRED"});
});
function response(){return {setHeader(){},status(value){this.code=value;return this},json(value){this.body=value;return this}}}
test("join handler ignores browser actor, role, scope and invite code",async()=>{
  const calls=[],handler=createAllianceAccessHandler({authorize,rpc:async(...args)=>{calls.push(args);return {request:{status:"pending"}}}});
  const res=response();
  await handler({method:"POST",body:{action:"request",user_id:"foreign",role:"R5",alliance_id:"foreign",invite_code:"ignored"}},res);
  assert.equal(res.code,200);assert.deepEqual(calls,[["wb1_alliance_access_request",{p_user_id:verified.id,p_action:"request"}]]);
});
for(const action of ["mine","list","approve","reject"]){
  test(`join ${action} uses authenticated actor only`,async()=>{
    const calls=[],handler=createAllianceAccessHandler({authorize,rpc:async(...args)=>{calls.push(args);return {status:"approved"}}}),res=response();
    await handler({method:"POST",body:{action,request_id:"00000000-0000-4000-8000-000000000001",p_user_id:"foreign"}},res);
    assert.equal(res.code,200);assert.equal(calls[0][1].p_user_id,verified.id);
  });
}
test("no authentication, malformed action, bad id and old codes never approve",async()=>{
  let calls=0;
  const rpc=async()=>{calls++;throw Error("never")};
  for(const body of [{invite_code:"old-code"},{action:"approve",request_id:"bad"},{action:"delete"}]){
    const res=response();await createAllianceAccessHandler({authorize,rpc})({method:"POST",body},res);
    assert.equal(res.code,400);
  }
  const res=response();
  await createAllianceAccessHandler({authorize:async()=>{throw Object.assign(Error("private details"),{status:401})},rpc})({method:"POST",body:{action:"request"}},res);
  assert.equal(res.code,401);assert.equal(JSON.stringify(res.body).includes("private details"),false);assert.equal(calls,0);
});
test("SQL refusal is never returned as a successful join",async()=>{
  const handler=createAllianceAccessHandler({authorize,rpc:async()=>{throw Object.assign(Error("private SQL body"),{status:403})}}),res=response();
  await handler({method:"POST",body:{action:"approve",request_id:"00000000-0000-4000-8000-000000000001"}},res);
  assert.equal(res.code,403);assert.equal(res.body.ok,false);assert.equal(JSON.stringify(res.body).includes("private SQL"),false);
});
test("same browser handlers expose FREE but never fabricate PRO from beta=true",()=>{
  const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
  const names=["betaAccessAllowed","safeLaunchBetaMode","safeLaunchBetaProIncluded","proFeatureAllowed"];
  const context={freeAccountAllowed,cloudSession:{user:verified},proState:{active:false,beta:true},betaConsentAccepted:()=>true};
  vm.createContext(context);
  for(const name of names){
    const line=source.split("\n").find(line=>line.startsWith(`function ${name}(`));assert.ok(line,name);vm.runInContext(line,context);
  }
  assert.equal(vm.runInContext("betaAccessAllowed()",context),true);
  assert.equal(vm.runInContext("proFeatureAllowed()",context),false);
  context.proState={active:true,entitlement:{source:"beta"}};
  assert.equal(vm.runInContext("proFeatureAllowed()",context),true);
  context.cloudSession=null;
  assert.equal(vm.runInContext("proFeatureAllowed()",context),false);
});
test("code field gone, privacy retained and alliance optional in DOM template",()=>{
  const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.equal(html.includes('id="betaAccessCode"'),false);
  assert.ok(html.includes('id="betaConsent"'));assert.ok(html.includes('id="freeAllianceRequestBtn"'));
  const template=fs.readFileSync(new URL("../lib/identity-onboarding-ui.js",import.meta.url),"utf8");
  assert.doesNotMatch(template,/id="identityOnboardingAlliance"[^>]*\brequired\b/);
  for(const locale of ["fr","en","pt","ja","uk"])assert.ok(freeAccessCopy(locale).request);
});
test("identity service saves A/B without an alliance and keeps squads",async()=>{
  const profiles=new Map(),deps={
    getProfile:async id=>profiles.get(id),getAllianceRoster:async()=>null,getOwnedAlliance:async()=>null,
    findAllianceByScope:async()=>[],findProfilesByIdentityScope:async()=>[],
    saveProfileIfUnchanged:async(id,state)=>{const value={state,updated_at:new Date().toISOString()};profiles.set(id,value);return value}
  };
  const service=createIdentityOnboardingService(deps);
  for(const id of ["A","B"]){
    const squads=[1,2,3,4].map(squad_id=>({squad_id,heroes:[{name:id+"-hero"}]}));
    profiles.set(id,{state:{player_id:id,squads,player:{},alliance:{}},updated_at:null});
    await service.complete(id,{name:id,server_id:id==="A"?"884":"885",alliance_tag:""},null);
    assert.deepEqual(profiles.get(id).state.squads,squads);
  }
  assert.notEqual(profiles.get("A").state.player.name,profiles.get("B").state.player.name);
});
test("server entitlement: FREE is not beta; historical grant remains active",async()=>{
  const oldFetch=globalThis.fetch;let granted=false;
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;
    const body=path.endsWith("/warboost_pro_grants")?(granted?[{grant_type:"beta",starts_at:"2020-01-01T00:00:00Z",revoked_at:null}]:[]):[];
    return new Response(JSON.stringify(body),{status:200});
  };
  try{
    assert.equal((await entitlementForUser(verified)).tier,"FREE");
    granted=true;assert.equal((await entitlementForUser(verified)).tier,"BETA_FREE");
  }finally{globalThis.fetch=oldFetch}
});
test("product API requires confirmed server identity and privacy, not invitation",async()=>{
  const oldFetch=globalThis.fetch;let confirmed=false;
  globalThis.fetch=async()=>new Response(JSON.stringify({...verified,email_confirmed_at:confirmed?verified.email_confirmed_at:null}),{status:200});
  try{
    const req={headers:{authorization:"Bearer synthetic-session","x-warboost-beta-consent":"2026-09-05-safe-launch-v2"}};
    await assert.rejects(requireProductUser(req,{consent:true}),{code:"EMAIL_CONFIRMATION_REQUIRED"});
    confirmed=true;assert.equal((await requireProductUser(req,{consent:true})).user.id,verified.id);
    await assert.rejects(requireProductUser({headers:{authorization:"Bearer synthetic-session"}},{consent:true}),{code:"BETA_CONSENT_REQUIRED"});
  }finally{globalThis.fetch=oldFetch}
});
test("a profile scope alone cannot retrieve another alliance roster or player profiles",async()=>{
  const oldFetch=globalThis.fetch;let privateFetches=0;
  globalThis.fetch=async url=>{
    const u=new URL(url);let data=[];
    if(u.pathname.endsWith("/wb1_alliances"))data=[{id:"scope-1",owner_player_id:"different-owner",roster:[{name:"Private",player_id:"different-member"}],tag:"ONE",server_id:"884"}];
    if(u.pathname.endsWith("/wb1_profiles"))privateFetches++;
    return new Response(JSON.stringify(data),{status:200});
  };
  try{assert.equal(await getAllianceRoster(verified.id,{serverId:"884",allianceTag:"ONE"}),null);assert.equal(privateFetches,0)}
  finally{globalThis.fetch=oldFetch}
});
