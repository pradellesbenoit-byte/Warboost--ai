import test from "node:test";
import assert from "node:assert/strict";
import {freeScanNetworkDigest} from "../lib/free-scan-network.js";
import {requirePersonalScanUser} from "../lib/personal-scan-access.js";
import {createFounderSpaceHandler} from "../lib/alliance-access-service.js";
const secret="synthetic-only-never-a-runtime-secret-0000",now=Date.UTC(2026,9,25);
test("network digest ignores spoofed forwarding/body addresses; daily keyed pseudonym",()=>{
 const req={socket:{remoteAddress:"192.0.2.1"},headers:{"x-forwarded-for":"198.51.100.2"},body:{ip:"203.0.113.1"}};
 const a=freeScanNetworkDigest(req,{secret,now,vercel:false});
 assert.match(a,/^[a-f0-9]{64}$/);
 assert.equal(a,freeScanNetworkDigest({...req,headers:{}},{secret,now,vercel:false}));
 assert.notEqual(a,freeScanNetworkDigest(req,{secret,now:now+86400000,vercel:false}));
 assert.notEqual(a,freeScanNetworkDigest(req,{secret:secret+"other",now,vercel:false}));
});
test("trusted hosting header is mandatory on Vercel; malformed or multiple IPs fail closed",()=>{
 for(const address of ["","192.0.2.1,198.51.100.2","not-an-ip"]){
  assert.throws(()=>freeScanNetworkDigest({headers:{"x-vercel-forwarded-for":address}},{secret,now,vercel:true}),{code:"FREE_NETWORK_GUARD_REQUIRED"});
 }
 assert.match(freeScanNetworkDigest({headers:{"x-vercel-forwarded-for":"2001:db8::1"}},{secret,now,vercel:true}),/^[a-f0-9]{64}$/);
 assert.throws(()=>freeScanNetworkDigest({socket:{remoteAddress:"192.0.2.1"}},{secret:"",vercel:false}),{code:"FREE_NETWORK_GUARD_REQUIRED"});
});
test("missing network guard blocks FREE before any reservation; historic PRO unchanged",async()=>{
 let calls=0;const deps={authorize:async()=>({user:{id:"synthetic"}}),consume:async()=>{calls++;return {reserved:true}},
 entitlement:async()=>({active:false}),networkDigest:()=>{throw Object.assign(Error("unavailable"),{code:"FREE_NETWORK_GUARD_REQUIRED"})}};
 await assert.rejects(requirePersonalScanUser({body:{}},deps),{code:"FREE_NETWORK_GUARD_REQUIRED"});
 assert.equal(calls,0);
 await requirePersonalScanUser({body:{}},{...deps,entitlement:async()=>({active:true,source:"beta"})});
 assert.equal(calls,0);
});
for(const action of ["open_space","request_space","list_space","view_space","approve_space","reject_space"]){
 test(`${action}: verified actor only, no declared game role or arbitrary scope`,async()=>{
  const actor="00000000-0000-4000-8000-000000000001",target="00000000-0000-4000-8000-000000000002";
  let called=0;const res={setHeader(){},status(n){this.code=n;return this},json(body){this.body=body}};
  const handler=createFounderSpaceHandler({authorize:async()=>({user:{id:actor}}),rpc:async(name,body)=>{
   called++;assert.equal(name,"wb1_workspace_access");assert.equal(body.p_user_id,actor);
   assert.equal(body.p_target,["approve_space","reject_space"].includes(action)?target:null);
   assert.deepEqual(Object.keys(body).sort(),["p_action","p_target","p_user_id"]);return {game_role_verified:false};
  }});
  await handler({method:"POST",body:{action,request_id:target,user_id:"foreign",role:"R5",server_id:"999"}},res);
  assert.equal(called,1);assert.equal(res.code,200);assert.equal(res.body.game_role_verified,false);
 });
}
test("workspace approval malformed target and unauthenticated access cannot reach SQL",async()=>{
 for(const authorize of [async()=>({user:{id:"synthetic"}}),async()=>{throw Object.assign(Error("private"),{status:403})}]){
  const res={setHeader(){},status(n){this.code=n;return this},json(body){this.body=body}};
  await createFounderSpaceHandler({authorize,rpc:async()=>{throw Error("must not reach")}})({method:"POST",body:{action:"approve_space",request_id:"invalid"}},res);
  assert.ok([400,403].includes(res.code));assert.equal(JSON.stringify(res.body).includes("private"),false);
 }
});
