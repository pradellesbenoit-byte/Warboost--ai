import assert from "node:assert/strict";
import fs from "node:fs";
import {createAdviceHandler,buildPlayerAnalysis,buildShopAdvice} from "../api/advice.js";

let passed=0,failed=0;
const pendingTests=[];
function test(name,fn){
  const pending=Promise.resolve().then(fn).then(()=>{
    passed++;console.log("PASS",name);
  },error=>{
    failed++;console.error("FAIL",name,error?.stack||String(error));
  });
  pendingTests.push(pending);
}
const playerId="authenticated-user-1";
const stamp=new Date().toISOString();
function selfRow({role="R5",player_id=playerId,name="Commander",server_id="100",alliance_tag="ABC",identity_basis="lastwar_nickname_server_alliance"}={}){
  return {player_id,name,server_id,alliance_tag,role,management_role:role,warboost_linked:true,identity_basis,canonical_member_key:"self|100|ABC",updated_at:stamp};
}
function environment({membershipRole="R5",rosterRole=membershipRole,serverId="100",allianceTag="ABC",allianceId="alliance-1",ownerId="other-owner",profile=true,linked=true,duplicateLinked=false,secondMembershipRole=membershipRole,secondMembershipAllianceId=allianceId,secondMembershipUpdatedAt=stamp,profileFailure=null,rosterFailure=null,membershipFailure=null,configured=true,rosterSize=1}={}){
  const profileRow=profile?{state:{player:{name:"Commander",server_id:serverId,role:"R1"},alliance:{tag:allianceTag}},updated_at:stamp}:null;
  const roster=linked?[selfRow({role:rosterRole})]:[];
  if(duplicateLinked)roster.push({...selfRow({role:rosterRole}),canonical_member_key:"duplicate|100|ABC"});
  for(let i=roster.length;i<rosterSize;i++)roster.push({
    player_id:`member-${i}`,name:`Member ${i}`,server_id:serverId,alliance_tag:allianceTag,
    role:["R1","R2","R3","R4","R5"][i%5],management_role:["R1","R2","R3","R4","R5"][i%5],
    canonical_member_key:`member-${i}|${serverId}|${allianceTag}`,updated_at:stamp
  });
  const membership={player_id:playerId,alliance_id:allianceId,role:membershipRole,updated_at:stamp};
  const contextMembership={alliance_id:secondMembershipAllianceId,role:secondMembershipRole,updated_at:secondMembershipUpdatedAt};
  const alliance={id:allianceId,tag:allianceTag,name:"Canonical Alliance",server_id:serverId,owner_player_id:ownerId,roster,updated_at:stamp};
  const calls=[];
  return {
    calls,profileRow,membership,contextMembership,alliance,roster,
    services:{
      configured:()=>configured,
      getProfile:async id=>{calls.push(["profile",id]);if(profileFailure)throw profileFailure;return profileRow},
      getAllianceMembership:async id=>{calls.push(["membership",id]);if(membershipFailure)throw membershipFailure;return membership},
      getAllianceRoster:async(id,scope)=>{calls.push(["roster",id,scope]);if(rosterFailure)throw rosterFailure;return {alliance,membership:contextMembership,roster}}
    }
  };
}
function response(){
  return {statusCode:null,body:null,headers:{},setHeader(name,value){this.headers[name]=value;return this},status(code){this.statusCode=code;return this},json(body){this.body=body;return body}};
}
async function request(env,{clientRole="R1",clientMembers=[{name:"CLIENT-ROSTER-SECRET",role:"R5",power_m:999}],clientOwnerId="client-owner",authenticate=async()=>({user:{id:playerId},entitlement:{active:true}})}={}){
  const res=response(),handler=createAdviceHandler({authenticate,allianceServices:env.services});
  const req={method:"POST",query:{},headers:{},body:{scope:"alliance",locale:"en-GB",state:{player:{id:"forged-user",role:clientRole},alliance:{owner_player_id:clientOwnerId,members:clientMembers}}}};
  await handler(req,res);
  return {res,req};
}

const valid=environment();
test("canonical linked R4 and R5 are accepted; client rank is not the authority",async()=>{
  for(const role of ["R4","R5"]){
    const env=environment({membershipRole:role,rosterRole:role});
    const {res}=await request(env,{clientRole:"R1"});
    assert.equal(res.statusCode,200);
    assert.equal(res.body.access_basis,"canonical_cloud_alliance_membership");
    assert.equal(res.body.declared_role,role);
  }
});
test("canonical owner is accepted only from cloud owner_player_id",async()=>{
  const env=environment({ownerId:playerId});
  const {res}=await request(env,{clientOwnerId:"not-the-cloud-owner",clientRole:"R1"});
  assert.equal(res.statusCode,200);
  const spoof=environment({membershipRole:"R3",rosterRole:"R3",ownerId:"another-user"});
  const denied=await request(spoof,{clientOwnerId:playerId,clientRole:"R5"});
  assert.equal(denied.res.statusCode,403);
});
test("canonical R1, R2 and R3 are refused even when the browser declares R5",async()=>{
  for(const role of ["R1","R2","R3"]){
    const env=environment({membershipRole:role,rosterRole:role});
    const {res}=await request(env,{clientRole:"R5"});
    assert.equal(res.statusCode,403,`${role} must be refused`);
  }
});
test("revoked or inconsistent membership and canonical roster roles fail closed",async()=>{
  const membershipRevoked=environment({membershipRole:"R3",rosterRole:"R5"});
  assert.equal((await request(membershipRevoked,{clientRole:"R5"})).res.statusCode,403);
  const rosterRevoked=environment({membershipRole:"R5",rosterRole:"R3"});
  assert.equal((await request(rosterRevoked,{clientRole:"R5"})).res.statusCode,403);
  const inconsistentReads=environment({membershipRole:"R5",secondMembershipRole:"R4"});
  assert.equal((await request(inconsistentReads,{clientRole:"R5"})).res.statusCode,409);
  const staleMembership=environment({secondMembershipUpdatedAt:"2000-01-01T00:00:00.000Z"});
  assert.equal((await request(staleMembership)).res.statusCode,409);
});
test("missing profile, membership, link or ambiguous canonical identity is refused",async()=>{
  assert.equal((await request(environment({profile:false}))).res.statusCode,409);
  const noMembership=environment();noMembership.services.getAllianceMembership=async()=>null;
  assert.equal((await request(noMembership)).res.statusCode,403);
  assert.equal((await request(environment({linked:false}))).res.statusCode,409);
  assert.equal((await request(environment({duplicateLinked:true}))).res.statusCode,409);
});
test("another alliance or server and a mismatched cloud identity are refused",async()=>{
  const otherMembership=environment();
  otherMembership.membership.alliance_id="other-alliance";
  assert.equal((await request(otherMembership)).res.statusCode,409,"independent membership reads must agree");
  const otherAlliance=environment();
  otherAlliance.alliance.id="other-alliance";
  assert.equal((await request(otherAlliance)).res.statusCode,409,"membership cannot authorize a different alliance row");
  const wrongServer=environment();wrongServer.alliance.server_id="200";
  assert.equal((await request(wrongServer)).res.statusCode,409);
  const wrongProfileServer=environment();wrongProfileServer.profileRow.state.player.server_id="200";
  assert.equal((await request(wrongProfileServer)).res.statusCode,409);
  const tag=environment();tag.alliance.tag="XYZ";
  assert.equal((await request(tag)).res.statusCode,409);
});
test("configuration and database failures return generic errors with no roster or exception details",async()=>{
  for(const env of [
    environment({configured:false}),
    environment({profileFailure:new Error("DATABASE_SECRET roster private row")}),
    environment({membershipFailure:new Error("DATABASE_SECRET roster private row")}),
    environment({rosterFailure:new Error("DATABASE_SECRET roster private row")})
  ]){
    const {res}=await request(env);
    assert.equal(res.statusCode,503);
    assert.deepEqual(Object.keys(res.body).sort(),["error","ok"]);
    assert.doesNotMatch(JSON.stringify(res.body),/DATABASE_SECRET|CLIENT-ROSTER-SECRET|Canonical Alliance/);
  }
});
test("the route requires the authenticated server user before any alliance data read",async()=>{
  const env=environment();let authCalls=0;
  const {res}=await request(env,{authenticate:async()=>{authCalls++;throw Object.assign(new Error("denied"),{status:401,code:"AUTH_REQUIRED"})}});
  assert.equal(authCalls,1);assert.equal(res.statusCode,401);
  assert.equal(env.calls.length,0);
});
test("100 cloud members are used while client-supplied roster rows are discarded",async()=>{
  const env=environment({rosterSize:100});
  const before=JSON.stringify(env.roster);
  const {res}=await request(env,{clientRole:"R5",clientMembers:[{name:"CLIENT-ROSTER-SECRET",role:"R5",power_m:9999}]});
  assert.equal(res.statusCode,200);
  assert.equal(Object.values(res.body.roles).reduce((sum,n)=>sum+n,0),100);
  assert.equal(JSON.stringify(env.roster),before);
  assert.doesNotMatch(JSON.stringify(res.body),/CLIENT-ROSTER-SECRET|9999/);
  assert.ok(env.calls.some(call=>call[0]==="profile"&&call[1]===playerId));
  assert.ok(env.calls.some(call=>call[0]==="membership"&&call[1]===playerId));
  assert.ok(env.calls.some(call=>call[0]==="roster"&&call[1]===playerId&&call[2].serverId==="100"&&call[2].allianceTag==="ABC"));
});
test("decision-trace JSON keeps nullable compatibility fields in FR and EN",()=>{
  const heroes=["Kimberly","Murphy","Williams","Marshall","Stetmann"].map((name,index)=>({
    name,level:150-index*3,stars:index===0?3:5,exclusive:index===0?0:10,
    gear:"count=4;levels=40,40,40,40;rarity=gold"
  }));
  const state={player:{hq_level:31},squads:[{id:1,power:45,heroes},{id:2,heroes:[]},{id:3,heroes:[]},{id:4,heroes:[]}],vs:{},season:{}};
  for(const locale of ["fr-FR","en-GB"]){
    const analysis=buildPlayerAnalysis(state,locale);
    assert.ok(Array.isArray(analysis.decision_trace)&&analysis.decision_trace.length>0);
    for(const row of analysis.decision_trace){
      for(const key of ["hero","next_target","timing_window","data_freshness"])assert.ok(Object.hasOwn(row,key),`${locale}: ${key}`);
      assert.ok(row.hero===null||typeof row.hero==="string");
      assert.ok(row.next_target===null||typeof row.next_target==="string"||typeof row.next_target==="number");
      assert.ok(row.timing_window&&typeof row.timing_window==="object");
      assert.ok(Object.hasOwn(row.timing_window,"best_day"));
      assert.ok(row.timing_window.best_day===null||Number.isFinite(row.timing_window.best_day));
      assert.ok(row.data_freshness===null||typeof row.data_freshness==="object");
    }
  }
});
test("unknown shop price or stock remains non-purchasable",()=>{
  const state={player:{hq_level:31},squads:[],shop:{store_type:"Campaign Store",currency:"campaign_points",currency_balance:10000,updated_at:stamp,offers:[
    {item_name:"Universal Exclusive Weapon Shards",category:"exclusive",price:null,currency:"campaign_points",quantity:10,stock_remaining:5},
    {item_name:"Drone Parts",category:"drone",price:40,currency:"campaign_points",quantity:5}
  ]}};
  const rows=buildShopAdvice(state,"en-GB",{priorities:[]}).recommendations;
  assert.ok(rows.every(row=>row.verdict_key!=="buy_now"));
  assert.ok(rows.some(row=>row.verdict_key==="unknown"));
});

const source=fs.readFileSync(new URL("../api/advice.js",import.meta.url),"utf8");
test("the exported server route wires authenticated user id and never authorizes from request-body role",()=>{
  assert.match(source,/resolveAuthorizedAllianceAdviceContext\(betaUser\?\.id,allianceServices\)/);
  assert.match(source,/access_basis:"canonical_cloud_alliance_membership"/);
  assert.doesNotMatch(source,/player_declared_last_war_rank/);
  assert.doesNotMatch(source,/normalizeAllianceRole\(s\?\.player\?\.role\)/);
});

await Promise.all(pendingTests);
console.log(`AI security and response contract: ${passed} PASS, ${failed} FAIL, ${pendingTests.length} groups; mocked authentication/DB only, no network, persistent writes, payments or real sessions.`);
if(failed)process.exitCode=1;
