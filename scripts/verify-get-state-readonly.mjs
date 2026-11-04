import assert from "node:assert/strict";
import {after, test} from "node:test";
import {BETA_CONSENT_VERSION} from "../lib/beta-access.js";
import {normalizeState} from "../lib/normalize.js";
import {reconcileConfirmedSquad} from "../lib/squad-identity.js";

const host="https://warboost-state-readonly.invalid";
const owner="fixture-readonly-owner";
const revision="2026-11-03T12:00:00.000Z";
const token="fixture-readonly-session";
const clone=value=>JSON.parse(JSON.stringify(value));
const baseState=normalizeState({
  player_id:owner,
  player:{name:"Fixture Player",server_id:"884",role:"R4"},
  alliance:{id:"fixture-alliance",tag:"ALL4",name:"Fixture Alliance",role:"R4"},
  updated_at:revision,
  squads:[1,2,3,4].map(id=>({id,heroes:[]})),
  hero_profiles:[],
  technology:{branches:{}},
  player_availability:[]
});
const names=["Carlie","Lucius","Morrison","DVA","Skyler"];
const profileState=normalizeState(reconcileConfirmedSquad(baseState,{
  squadId:1,names,updatedAt:revision,
  incomingHeroes:names.map(name=>({name,exclusive:name==="DVA"?"Lame de Frappe DVA Nv.29":null}))
}).state);
const oldEnv={
  SUPABASE_URL:process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY
};
Object.assign(process.env,{
  SUPABASE_URL:host,
  SUPABASE_ANON_KEY:"fixture-anon-key",
  SUPABASE_SERVICE_ROLE_KEY:"fixture-service-key"
});

const writes=[];
const reads=[];
let forceCasConflict=false;
const alliance={
  id:"fixture-alliance",tag:"ALL4",name:"Fixture Alliance",server_id:"884",
  owner_player_id:"fixture-other-owner",invite_code:"fixture-only",
  updated_at:revision,roster_updated_at:revision,
  roster:[{name:"Fixture Player",server_id:"884",alliance_tag:"ALL4",role:"R4",updated_at:revision}]
};
const membership={player_id:owner,alliance_id:alliance.id,role:"R4",updated_at:revision};
const snapshotState=clone(profileState);
snapshotState.squads[0].heroes[0].power=123;
snapshotState.hero_profiles=[{hero_name:"Carlie",power:123,updated_at:revision,
  field_updated_at:{power:revision},field_source:{power:"confirmed_scan"}}];
const snapshots=[{state:snapshotState,source:"fixture-history",captured_at:"2026-11-02T12:00:00.000Z"}];

function jsonResponse(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
}

const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  const url=new URL(typeof input==="string"?input:input.url);
  assert.equal(url.origin,host,"all route transport must stay on the synthetic host");
  const method=String(init.method||"GET").toUpperCase();
  reads.push({path:url.pathname,method});
  if(method!=="GET"){
    writes.push({path:url.pathname,method});
    if(method==="PATCH"&&forceCasConflict)return jsonResponse([]);
    return jsonResponse({message:"unexpected_write_blocked_by_fixture"},405);
  }
  if(url.pathname==="/auth/v1/user"){
    const authorization=new Headers(init.headers||{}).get("authorization");
    assert.equal(authorization,`Bearer ${token}`);
    return jsonResponse({id:owner,email:"fixture@example.invalid",email_confirmed_at:revision});
  }
  if(url.pathname==="/rest/v1/wb1_profiles"){
    const playerFilter=url.searchParams.get("player_id")||"";
    if(playerFilter===`eq.${owner}`)return jsonResponse([{player_id:owner,state:clone(profileState),updated_at:revision}]);
    if(playerFilter.startsWith("in."))return jsonResponse([{player_id:owner,state:clone(profileState),updated_at:revision}]);
    return jsonResponse([]);
  }
  if(url.pathname==="/rest/v1/wb1_snapshots")return jsonResponse(clone(snapshots));
  if(url.pathname==="/rest/v1/wb1_alliance_members"){
    if(url.searchParams.get("player_id")===`eq.${owner}`)return jsonResponse([clone(membership)]);
    if(url.searchParams.get("alliance_id")===`eq.${alliance.id}`)return jsonResponse([clone(membership)]);
    return jsonResponse([]);
  }
  if(url.pathname==="/rest/v1/wb1_alliances"){
    const scoped=url.searchParams.get("server_id")===`eq.${alliance.server_id}`&&url.searchParams.get("tag")===`eq.${alliance.tag}`;
    const byId=url.searchParams.get("id")===`eq.${alliance.id}`;
    return jsonResponse(scoped||byId?[clone(alliance)]:[]);
  }
  throw new Error(`unexpected_synthetic_route:${url.pathname}`);
};

const {default:handler}=await import("../api/state.js");
after(()=>{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(oldEnv)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
});

async function getState({restore=false,headers={}}={}){
  let status=200,body=null;
  const requestHeaders={
    authorization:`Bearer ${token}`,
    "x-warboost-beta-consent":BETA_CONSENT_VERSION,
    ...headers
  };
  for(const [key,value] of Object.entries(requestHeaders))if(value===null)delete requestHeaders[key];
  const req={
    method:"GET",
    url:restore?"/api/state?restore=1":"/api/state",
    query:restore?{restore:"1"}:{},
    headers:requestHeaders
  };
  await handler(req,{
    setHeader(){return this},
    status(value){status=value;return this},
    json(value){body=value;return this}
  });
  return {status,body};
}
async function postState({headers={},baseUpdatedAt=revision}={}){
  let status=200,body=null;
  await handler({
    method:"POST",url:"/api/state",query:{},
    headers:{
      authorization:`Bearer ${token}`,
      "x-warboost-beta-consent":BETA_CONSENT_VERSION,
      "content-type":"application/json",
      ...headers
    },
    body:{state:clone(profileState),base_updated_at:baseUpdatedAt}
  },{
    setHeader(){return this},
    status(value){status=value;return this},
    json(value){body=value;return this}
  });
  return {status,body};
}

test("real GET routes require authentication and consent before reading profile data",async()=>{
  reads.length=0;writes.length=0;
  const signedOut=await getState({restore:true,headers:{authorization:null}});
  assert.equal(signedOut.status,401);
  assert.deepEqual(reads,[],"unauthenticated request never reaches profile or alliance reads");

  reads.length=0;
  const noConsent=await getState({headers:{"x-warboost-beta-consent":null}});
  assert.equal(noConsent.status,428);
  assert.deepEqual(reads.map(call=>call.path),["/auth/v1/user"]);
  assert.equal(writes.length,0);
});

test("real GET /api/state?restore=1 returns verified state without profile or alliance writes",async()=>{
  reads.length=0;writes.length=0;
  const result=await getState({restore:true});
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal(result.body.updated_at,revision,"timestamp remains the revision actually read");
  assert.deepEqual(result.body.state.squads[0].heroes.map(hero=>hero.name),["Carlie","Lucius","Morrison","DVA","Skyler"]);
  assert.equal(result.body.state.alliance.management_verified,false,"an exact but unpersisted identity match does not grant manager authority");
  assert.equal(writes.length,0,`no write methods allowed: ${JSON.stringify(writes)}`);
  assert.ok(reads.length>0&&reads.every(call=>call.method==="GET"));
});

test("real general GET returns in-memory repairs as pending and never persists them",async()=>{
  reads.length=0;writes.length=0;
  const result=await getState();
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal(result.body.updated_at,revision,"GET does not invent a newer saved revision");
  assert.equal(result.body.restore_repair_pending,true,"recovered/canonicalized response changes are disclosed as not persisted");
  assert.equal(result.body.state.squads[0].heroes[0].power,123,"recovered history data remains available in the response");
  assert.equal(result.body.alliance_roster_repair.changed,true,"fixture exercises canonical roster reconciliation");
  assert.equal(result.body.state.alliance.management_verified,false,"an unpersisted identity link does not unlock R4/R5 controls");
  assert.equal(writes.length,0,`no profile save or alliance mutation allowed: ${JSON.stringify(writes)}`);
  assert.ok(reads.length>0&&reads.every(call=>call.method==="GET"));
});

test("explicit POST keeps CAS 409 handling after a simulated concurrent cloud change",async()=>{
  reads.length=0;writes.length=0;forceCasConflict=true;
  try{
    const result=await postState();
    assert.equal(result.status,409);
    assert.equal(result.body.error,"profile_write_conflict");
    assert.equal(result.body.updated_at,revision);
    assert.deepEqual(result.body.state.squads[0].confirmed_composition,names);
    assert.equal(writes.length,1);
    assert.equal(writes[0].method,"PATCH","POST reached only its explicit CAS profile write");
  }finally{
    forceCasConflict=false;
  }
});
