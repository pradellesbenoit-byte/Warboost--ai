import assert from "node:assert/strict";
import {after, test} from "node:test";
import {readFile} from "node:fs/promises";
import {normalizeState} from "../lib/normalize.js";
import {reconcileConfirmedSquad} from "../lib/squad-identity.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";

// This test uses the real Supabase CAS/read helpers against an in-memory
// fetch transport. Any host other than the synthetic host is rejected.
// It does not exercise GET /api/state: that restore route can write repaired
// profile/alliance data and must not be described as read-only.
const host="https://warboost-memory.invalid";
const owner="fixture-player-a";
const names=["Carlie","Lucius","Morrison","DVA","Skyler"];
const oldAt="2026-11-03T10:00:00.000Z";
const confirmedAt="2026-11-03T11:00:00.000Z";
const originalFetch=globalThis.fetch;
const originalEnv={
  SUPABASE_URL:process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY
};
process.env.SUPABASE_URL=host;
process.env.SUPABASE_ANON_KEY="in-memory-anon-fixture";

const clone=value=>JSON.parse(JSON.stringify(value));
const emptyState=playerId=>normalizeState({
  player_id:playerId,
  updated_at:oldAt,
  squads:Array.from({length:4},(_,index)=>({id:index+1,heroes:[]})),
  technology:{branches:{}}
});

function confirmedFixture(playerId=owner,at=confirmedAt){
  const state=emptyState(playerId);
  const incomingHeroes=names.map(name=>({name,level:155}));
  incomingHeroes[3]={name:"DVA",level:155,exclusive:"Lame de Frappe DVA Nv.29"};
  const confirmed=reconcileConfirmedSquad(state,{
    squadId:1,names,incomingHeroes,updatedAt:at
  }).state;
  confirmed.updated_at=at;
  confirmed.squads[0].power=45.6;
  confirmed.technology.branches={
    development:{name:"Développement",state:"percent",percent:0,updated_at:at},
    team_1:{name:"Équipe 1",state:"max",updated_at:at},
    alliance_duel:{name:"Duel d’Alliances",state:"locked",prerequisite:"Fixture",updated_at:at}
  };
  return normalizeState(confirmed);
}

function response(body,status=200){
  return new Response(JSON.stringify(body),{
    status,headers:{"content-type":"application/json"}
  });
}

function createMemoryBackend(){
  const rows=new Map();
  const tokenOwners=new Map([
    ["fixture-token-a-device-1",owner],
    ["fixture-token-a-device-2",owner],
    ["fixture-token-account-b","fixture-player-b"]
  ]);
  const writes=[];
  let revisionCounter=0;
  const nextRevision=()=>`2026-11-03T12:00:${String(++revisionCounter).padStart(2,"0")}.000Z`;

  async function fetch(input,init={}){
    const url=new URL(typeof input==="string"?input:input.url);
    if(url.origin!==host)throw new Error(`external_network_blocked:${url.origin}`);
    if(url.pathname!=="/rest/v1/wb1_profiles")throw new Error(`unexpected_memory_route:${url.pathname}`);
    const method=String(init.method||"GET").toUpperCase();
    const token=new Headers(init.headers||{}).get("authorization")?.replace(/^Bearer\s+/i,"")||"";
    const tokenOwner=tokenOwners.get(token);
    if(!tokenOwner)return response({message:"fixture_auth_required"},401);
    const requestedId=String(url.searchParams.get("player_id")||"").replace(/^eq\./,"");
    if(method==="GET"){
      if(!requestedId||requestedId!==tokenOwner)return response([]);
      const row=rows.get(requestedId);
      return response(row?[clone(row)]:[]);
    }
    if(method!=="PATCH")throw new Error(`unexpected_memory_method:${method}`);
    if(!requestedId||requestedId!==tokenOwner)return response({message:"fixture_owner_forbidden"},403);
    const row=rows.get(requestedId);
    const expected=String(url.searchParams.get("updated_at")||"").replace(/^eq\./,"");
    if(!row||row.updated_at!==expected)return response([]);
    const payload=JSON.parse(String(init.body||"{}"));
    if(payload.state?.player_id!==tokenOwner)return response({message:"fixture_state_owner_mismatch"},403);
    const saved={player_id:requestedId,state:clone(payload.state),updated_at:nextRevision()};
    rows.set(requestedId,saved);
    writes.push({method,playerId:requestedId,updated_at:saved.updated_at});
    return response([clone(saved)]);
  }

  return {
    fetch,
    writes,
    seed(playerId,state,updatedAt=oldAt){
      rows.set(playerId,{player_id:playerId,state:clone(state),updated_at:updatedAt});
    },
    row(playerId){return clone(rows.get(playerId)||null);}
  };
}

const backend=createMemoryBackend();
globalThis.fetch=backend.fetch;
const {getProfileForUser,saveProfileForUserIfUnchanged}=await import("../lib/supabase.js");
after(()=>{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(originalEnv)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
});

test("device A saves a confirmed squad and device B restores heroes, weapon, power and technology",async()=>{
  const state=confirmedFixture();
  const initial=backend.row(owner);
  assert.equal(initial,null);
  backend.seed(owner,emptyState(owner),oldAt);
  const saved=await saveProfileForUserIfUnchanged(
    owner,state,"fixture-token-a-device-1",oldAt
  );
  assert.equal(saved.player_id,owner);
  assert.ok(saved.updated_at,"the in-memory transport returns a write receipt");
  assert.equal(backend.writes.length,1);

  const fetched=await getProfileForUser(owner,"fixture-token-a-device-2");
  assert.equal(fetched.player_id,owner);
  const deviceBLocal=emptyState(owner);
  const restored=reconcileCloudSquads(deviceBLocal,normalizeState(fetched.state),normalizeState(fetched.state));
  const stateB=restored.state;
  assert.deepEqual(stateB.squads[0].confirmed_composition,names);
  assert.deepEqual(stateB.squads[0].heroes.map(hero=>hero.name),names);
  assert.equal(stateB.squads[0].heroes[3].exclusive,"Lame de Frappe DVA Nv.29");
  assert.equal(stateB.squads[0].power,45.6);
  assert.equal(stateB.technology.branches.development.percent,0);
  assert.equal(stateB.technology.branches.team_1.state,"max");
  assert.equal(stateB.technology.branches.alliance_duel.state,"locked");
});

test("two devices using the same profile revision cannot overwrite the first accepted write",async()=>{
  const base=confirmedFixture(owner,oldAt);
  backend.seed(owner,base,oldAt);
  const [deviceA,deviceB]=await Promise.all([
    getProfileForUser(owner,"fixture-token-a-device-1"),
    getProfileForUser(owner,"fixture-token-a-device-2")
  ]);
  assert.equal(deviceA.updated_at,deviceB.updated_at);

  const nextA=normalizeState(clone(deviceA.state));
  nextA.player.power_m=72;
  const nextB=normalizeState(clone(deviceB.state));
  nextB.player.power_m=91;
  const accepted=await saveProfileForUserIfUnchanged(owner,nextA,"fixture-token-a-device-1",deviceA.updated_at);
  assert.equal(accepted.state.player.power_m,72);
  await assert.rejects(
    saveProfileForUserIfUnchanged(owner,nextB,"fixture-token-a-device-2",deviceB.updated_at),
    error=>error?.status===409&&error?.code==="profile_write_conflict"
  );
  const final=backend.row(owner);
  assert.equal(final.state.player.power_m,72,"the stale second writer did not replace device A's accepted state");
  assert.deepEqual(final.state.squads[0].confirmed_composition,names);
});

test("an older Cloud confirmation does not replace a newer local confirmation",()=>{
  const oldCloud=confirmedFixture(owner,oldAt);
  oldCloud.squads[0].power=44.1;
  const local=reconcileConfirmedSquad(oldCloud,{
    squadId:1,names,updatedAt:confirmedAt,
    incomingHeroes:names.map(name=>({name}))
  }).state;
  local.squads[0].power=45.6;
  const cloud=normalizeState(oldCloud);
  const merged=reconcileCloudSquads(local,cloud,cloud);
  assert.deepEqual(merged.state.squads[0].confirmed_composition,names);
  assert.equal(merged.state.squads[0].power,45.6);
  assert.deepEqual(merged.conflicts,[]);
});

test("authenticated reads are isolated by account and cause no writes",async()=>{
  backend.seed(owner,confirmedFixture(owner),oldAt);
  backend.seed("fixture-player-b",confirmedFixture("fixture-player-b"),oldAt);
  const writesBefore=backend.writes.length;
  const own=await getProfileForUser(owner,"fixture-token-a-device-1");
  const foreign=await getProfileForUser(owner,"fixture-token-account-b");
  assert.equal(own.player_id,owner);
  assert.equal(foreign,null,"account B cannot read account A through the user-scoped helper");
  assert.equal(backend.writes.length,writesBefore,"GET reads did not issue POST/PATCH writes");
  assert.ok(backend.writes.every(write=>write.method==="PATCH"));
});

test("GET /api/state restore routes are read-only and disclose pending repairs",async()=>{
  const source=await readFile(new URL("../api/state.js",import.meta.url),"utf8");
  const statusStart=source.indexOf('if(req.method==="GET"&&req.query?.action==="sync_status")');
  const statusEnd=source.indexOf("// HF8.6.20 login-critical path",statusStart);
  const syncStatusBranch=source.slice(statusStart,statusEnd);
  const fastStart=source.indexOf("if(fastRestore){",statusEnd);
  const fastEnd=source.indexOf("const {user}=await requireProductUser",fastStart);
  const fastRestoreBranch=source.slice(fastStart,fastEnd);
  const generalStart=source.indexOf('if(req.method==="GET"){',statusEnd);
  const generalEnd=source.indexOf('if(req.method==="POST"){',generalStart);
  const generalGetBranch=source.slice(generalStart,generalEnd);

  assert.ok(statusStart>=0&&statusEnd>statusStart,"sync_status branch is present");
  assert.doesNotMatch(syncStatusBranch,/saveOwn\s*\(|saveProfile(?:ForUser)?IfUnchanged\s*\(/,
    "sync_status branch must not invoke profile writes");
  assert.ok(fastStart>=0&&fastEnd>fastStart,"fast restore branch is present");
  assert.match(source,/async function canonicalizeAllianceState\(input,playerId,\{allowWrites=false\}=\{\}\)/,
    "canonicalization is read-only by default");
  assert.match(fastRestoreBranch,/canonicalizeAllianceState\(current,playerId\)/,
    "fast restore uses the non-mutating default");
  assert.doesNotMatch(fastRestoreBranch,/saveOwn\s*\(|updateAllianceScopeRoster\s*\(|joinAlliance\s*\(/,
    "fast restore branch has no direct write call");
  assert.ok(generalStart>=0&&generalEnd>generalStart,"general GET branch is present");
  assert.match(generalGetBranch,/restore_repair_pending:restoreRepairPending/,
    "general GET explicitly marks in-memory repairs as pending");
  assert.doesNotMatch(generalGetBranch,/saveOwn\s*\(|saveProfile(?:ForUser)?IfUnchanged\s*\(|updateAllianceScopeRoster\s*\(|joinAlliance\s*\(/,
    "general GET cannot persist profile or alliance repairs");
});
