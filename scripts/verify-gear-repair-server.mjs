import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createGearRepairHandler,equipmentValueHash} from "../lib/gear-repair-server.js";
import {GEAR_REPAIR_RELEASE_APPROVED} from "../lib/gear-repair-contract.js";
import {createGearRepairPreview} from "../lib/gear-repair-preview.js";
import {projectSquads} from "../lib/squad-comparison.js";
import {fixtureProfile,clone,at} from "./fixtures/squad-comparison.mjs";
const full=Array.from({length:4},(_,slot)=>`slot=${slot};count=1;level=${slot?40:0};rarity=orange`).join("|");
const owner="11111111-1111-4111-8111-111111111111",consent="synthetic-consent",key="synthetic-signing-key-not-for-production-123";
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
let groups=0;
const test=async(name,fn)=>{await fn();groups++;console.log("PASS "+name);};
function harness({enabled=true,requireUser,rpc,readForUser}={}){
  const local=fixtureProfile();local.player_id=owner;local.squads.forEach(q=>q.heroes.forEach(h=>h.gear=full.slice(0,120)));
  let row={squads:local.squads,updated_at:at},clock=Date.parse(at),writes=0,reads=0,capCalls=0,archive=new Map();
  const state={owner,token:"synthetic-token",readFails:false,ackBad:false,readChanged:false,cap:{contract:"gear-field-v1",enabled:true}};
  const handler=createGearRepairHandler({enabled,consentVersion:consent,signingKey:()=>key,now:()=>clock,
    requireUser:requireUser||async function(req){
      if(!req.headers.authorization||req.headers.authorization==="Bearer fake-jwt")throw {status:401,code:"AUTH_INVALID"};
      return {id:state.owner};
    },
    readForUser:readForUser||async function(id,token){
      reads++;assert.equal(id,state.owner);assert.equal(token,state.token);
      if(state.readFails)throw {code:"REQUEST_TIMEOUT"};
      const result=clone(row);
      if(state.readChanged)result.updated_at="2026-10-15T08:44:00.000Z";
      return result;
    },
    rpc:rpc||async function(token,name,args){
      assert.equal(token,state.token);
      if(name==="wb1_gear_repair_capability"){capCalls++;return state.cap;}
      if(name==="wb1_gear_repair_receipt")return archive.get(args.p_id)||null;
      const c=args.p_command;
      assert.equal(c.confirmed,true);
      assert.equal(c.attestation,c.mode==="repair"?"four_pieces_verified_in_last_war":"restore_archived_equipment");
      if(c.expected_revision!==row.updated_at||archive.has(c.operation_id))
        throw {status:400,body:{code:"P0001",message:"gear_repair_conflict"}};
      const q=row.squads.find(q=>q.id===c.squad),hero=q.heroes[c.slot-1],old=hero.gear;
      if(equipmentValueHash(old)!==c.old_hash)throw {body:{message:"gear_repair_conflict"}};
      hero.gear=c.new_gear;row.updated_at="2026-10-15T08:43:38.123456+00:00";writes++;
      const receipt={operation_id:c.operation_id,squad:c.squad,slot:c.slot,hero:hero.name,old_gear:old,
        old_hash:c.old_hash,new_hash:c.new_hash,revision:row.updated_at};
      archive.set(c.operation_id,receipt);if(state.ackBad)return {ok:true};
      return receipt;
    }});
  async function invoke(action,body={},extra={}){
    const r=response();await handler({method:action==="gear_repair_status"||action==="gear_repair_receipt"?"GET":"POST",
      query:{action},headers:{authorization:"Bearer "+state.token,"x-warboost-beta-consent":consent,"content-type":"application/json"},body,...extra},r);
    return r;
  }
  const prepare=()=>invoke("gear_repair_prepare",{mode:"repair",squad:1,slot:1,new_gear:full});
  const confirmed=ticket=>({ticket,four_pieces_verified:true,confirmed_at:new Date(clock+1).toISOString()});
  return {state,invoke,prepare,confirmed,get row(){return row;},set row(x){row=x;},set clock(x){clock=x;},
    get writes(){return writes;},get reads(){return reads;},get capCalls(){return capCalls;}};
}
await test("release flag is hard OFF; default readiness makes no database or profile calls",async()=>{
  assert.equal(GEAR_REPAIR_RELEASE_APPROVED,false);const h=harness({enabled:false});
  const r=await h.invoke("gear_repair_status");assert.equal(r.statusCode,200);assert.equal(r.body.writes_enabled,false);
  assert.equal(r.body.migration,"not_checked");assert.equal(h.reads+h.capCalls+h.writes,0);
  for(const action of ["gear_repair_prepare","gear_repair_apply"]){
    assert.equal((await h.invoke(action)).statusCode,423);
  }
  assert.equal(h.reads+h.capCalls+h.writes,0);
});
await test("401 fake JWT and 428 missing consent fail before even capability lookup",async()=>{
  for(const headers of [{authorization:"Bearer fake-jwt","x-warboost-beta-consent":consent},{authorization:"Bearer synthetic-token"}]){
    const h=harness();const r=await h.invoke("gear_repair_status",{}, {headers});
    assert.ok([401,428].includes(r.statusCode));assert.equal(h.reads+h.capCalls+h.writes,0);
  }
});
await test("owner override and unsupported methods are rejected before DB access",async()=>{
  const h=harness();assert.equal((await h.invoke("gear_repair_prepare",{}, {query:{action:"gear_repair_prepare",player_id:"other"}})).statusCode,400);
  assert.equal((await h.invoke("gear_repair_apply",{}, {method:"GET"})).statusCode,405);assert.equal(h.capCalls,0);
});
await test("migration absent disabled or wrong contract never allows writing",async()=>{
  for(const cap of [null,{contract:"old",enabled:true},{contract:"gear-field-v1",enabled:false}]){
    const h=harness();h.state.cap=cap;const r=await h.prepare();assert.equal(r.statusCode,503);assert.equal(h.writes+h.reads,0);
  }
});
await test("preparation signs exact target versions/hashes without mutation",async()=>{
  const h=harness(),before=clone(h.row);const r=await h.prepare();
  assert.equal(r.statusCode,200);assert.equal(r.body.read_only,true);assert.equal(r.body.write_state,"not_attempted");
  assert.equal(r.body.requires_explicit_confirmation,true);assert.deepEqual(h.row,before);assert.equal(h.writes,0);
});
await test("arbitrary profile or extra fields are never accepted as repair input",async()=>{
  const h=harness();const r=await h.invoke("gear_repair_prepare",{mode:"repair",squad:1,slot:1,new_gear:full,state:{alliance:{}}});
  assert.equal(r.statusCode,400);assert.equal(h.reads+h.writes,0);
});
await test("incomplete grouped absent raw zero and unknown candidates are refused",async()=>{
  for(const gear of [null,0,"0","Non détecté","count=4;level=40;rarity=orange",full.slice(0,120)]){
    const h=harness();const r=await h.invoke("gear_repair_prepare",{mode:"repair",squad:1,slot:1,new_gear:gear});
    assert.ok([400,409].includes(r.statusCode));assert.equal(h.writes,0);
  }
});
await test("a valid-looking noncanonical cut is not auto-repaired",async()=>{
  const h=harness();h.row.squads[0].heroes[0].gear=full;
  assert.equal((await h.prepare()).statusCode,409);assert.equal(h.writes,0);
});
await test("a readable terminal prefix disagreement is rejected during non-writing preparation",async()=>{
  const h=harness();h.row.squads[0].heroes[0].gear=full.split("|").slice(0,3).join("|")+"|slot=3;count=1;level=99;rarity=oran";
  assert.equal((await h.prepare()).statusCode,409);assert.equal(h.writes,0);
});
await test("missing composition proof and wrong slot association remain blocked",async()=>{
  const h=harness();h.row.squads[0].composition_source="legacy_backfill";
  assert.equal((await h.prepare()).statusCode,409);assert.equal(h.writes,0);
});
await test("preparation is not confirmation; apply requires an explicit current attestation",async()=>{
  const h=harness(),p=await h.prepare();
  for(const body of [{ticket:p.body.ticket,confirmed_at:at},{...h.confirmed(p.body.ticket),four_pieces_verified:false}]){
    const r=await h.invoke("gear_repair_apply",body);assert.equal(r.statusCode,400);assert.equal(h.writes,0);
  }
});
await test("tampered signed target is rejected without calling mutation",async()=>{
  const h=harness(),p=await h.prepare();const [data,sig]=p.body.ticket.split(".");
  const payload=JSON.parse(Buffer.from(data,"base64url"));payload.command.slot=2;
  const ticket=Buffer.from(JSON.stringify(payload)).toString("base64url")+"."+sig;
  assert.equal((await h.invoke("gear_repair_apply",h.confirmed(ticket))).statusCode,403);assert.equal(h.writes,0);
});
await test("account change and session renewal invalidate prior human review ticket",async()=>{
  for(const field of ["owner","token"]){
    const h=harness(),p=await h.prepare();h.state[field]="different";
    assert.equal((await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket))).statusCode,403);assert.equal(h.writes,0);
  }
});
await test("expired or backdated attestation does not write",async()=>{
  const h=harness(),p=await h.prepare();h.clock=Date.parse(at)+400000;
  assert.equal((await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket))).statusCode,409);assert.equal(h.writes,0);
});
await test("valid apply preserves every other squad/profile input and confirms only after readback",async()=>{
  const h=harness(),p=await h.prepare(),before=clone(h.row.squads);
  const r=await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  assert.equal(r.statusCode,200);assert.equal(r.body.verified,true);assert.equal(h.writes,1);
  before[0].heroes[0].gear=full;assert.deepEqual(h.row.squads,before);assert.equal(h.reads,2);
  assert.equal(r.body.state,undefined);assert.equal(r.body.retry_write,false);
});
await test("concurrent revision conflict and replay never overwrite the new version",async()=>{
  const h=harness(),p=await h.prepare();h.row.updated_at="2026-10-15T09:00:00Z";
  const refused=await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  assert.equal(refused.statusCode,409);assert.equal(refused.body.write_state,"not_attempted");assert.equal(h.writes,0);
  const next=harness(),ticket=await next.prepare();await next.invoke("gear_repair_apply",next.confirmed(ticket.body.ticket));
  assert.equal((await next.invoke("gear_repair_apply",next.confirmed(ticket.body.ticket))).statusCode,409);assert.equal(next.writes,1);
});
await test("HTTP 200 RPC without a verified receipt is unknown, never a success",async()=>{
  const h=harness(),p=await h.prepare();h.state.ackBad=true;
  const r=await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  assert.equal(r.statusCode,503);assert.equal(r.body.write_state,"unknown");assert.equal(r.body.retry_write,false);
});
await test("post-write read timeout returns verification pending and forbids retry-write",async()=>{
  const h=harness(),p=await h.prepare();h.state.readFails=true;
  const r=await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  assert.equal(r.statusCode,202);assert.equal(r.body.write_state,"confirmed");assert.equal(r.body.verified,false);assert.equal(h.writes,1);
  assert.equal(r.body.retry_write,false);
});
await test("a newer readback revision never proves current equipment success",async()=>{
  const h=harness(),p=await h.prepare();h.state.readChanged=true;
  const r=await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  assert.equal(r.statusCode,202);assert.equal(r.body.verified,false);
});
await test("receipt reading is owner scoped and contains no old gear hero or private data",async()=>{
  const h=harness(),p=await h.prepare();await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  const r=await h.invoke("gear_repair_receipt",{}, {query:{action:"gear_repair_receipt",operation_id:p.body.operation_id}});
  assert.equal(r.statusCode,200);assert.equal(r.body.found,true);assert.equal(r.body.read_only,true);
  assert.doesNotMatch(JSON.stringify(r.body),/Murphy|old_gear|new_hash|slot=|11111111/);
});
await test("rollback preparation is owner/version bound and requires its own human approval",async()=>{
  const h=harness(),p=await h.prepare();await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  const undo=await h.invoke("gear_repair_prepare",{mode:"rollback",squad:1,slot:1,rollback_of:p.body.operation_id});
  assert.equal(undo.statusCode,200);assert.equal(undo.body.new_gear,full.slice(0,120));
  assert.equal((await h.invoke("gear_repair_apply",h.confirmed(undo.body.ticket))).statusCode,400);
  const applied=await h.invoke("gear_repair_apply",{ticket:undo.body.ticket,rollback_confirmed:true,confirmed_at:new Date(Date.parse(at)+1).toISOString()});
  assert.equal(applied.statusCode,200);assert.equal(h.row.squads[0].heroes[0].gear,full.slice(0,120));
});
await test("42501 401 403 409 server errors and RPC timeout are expurgated, never retried",async()=>{
  for(const error of [{status:401},{status:403},{code:"database_permissions_missing",body:{code:"42501",message:"PRIVATE SQL"}},
    {status:409,body:{message:"gear_repair_conflict"}},{status:500},{status:503},{status:504},{code:"SUPABASE_USER_TIMEOUT"}]){
    let calls=0;const h=harness({rpc:async()=>{calls++;throw error;}});
    const r=await h.prepare();assert.ok(r.statusCode>=400);assert.equal(calls,1);assert.equal(h.writes,0);
    assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE SQL|token|email|42501/);
  }
});
await test("loss of RPC response after commit is unknown; receipt lookup not blind apply is prescribed",async()=>{
  let calls=0;const h=harness({rpc:async(_token,name)=>{
    if(name==="wb1_gear_repair_capability")return {contract:"gear-field-v1",enabled:true};
    calls++;throw {code:"SUPABASE_USER_TIMEOUT"};
  }});
  const p=await h.prepare(),r=await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
  assert.equal(r.statusCode,504);assert.equal(r.body.write_state,"unknown");assert.equal(r.body.retry_write,false);assert.equal(calls,1);
  assert.equal(typeof r.body.operation_id,"string");
});
await test("transaction SQL refusals after submission are rolled-back conflicts, not successes",async()=>{
  for(const code of ["40001","40P01","55P03","23505","42501"]){
    const h=harness({rpc:async(_token,name)=>{
      if(name==="wb1_gear_repair_capability")return {contract:"gear-field-v1",enabled:true};
      throw {body:{code,message:"private database details"}};
    }});
    const p=await h.prepare(),r=await h.invoke("gear_repair_apply",h.confirmed(p.body.ticket));
    assert.equal(r.statusCode,code==="42501"?403:409);assert.equal(r.body.write_state,"not_attempted");
    assert.equal(r.body.retry_write,false);assert.doesNotMatch(JSON.stringify(r.body),/private database/);
  }
});
await test("readonly receipt recovery remains available after feature shutdown",async()=>{
  let calls=0;
  const h=harness({enabled:false,rpc:async(_token,name)=>{calls++;assert.equal(name,"wb1_gear_repair_receipt");return null;}});
  const r=await h.invoke("gear_repair_receipt",{}, {query:{action:"gear_repair_receipt",operation_id:"11111111-1111-4111-8111-111111111111"}});
  assert.equal(r.statusCode,200);assert.equal(r.body.found,false);assert.equal(calls,1);assert.equal(h.writes,0);
});
await test("preview readiness GET cannot enable saving or implicitly prepare/write",async()=>{
  const p=fixtureProfile(),ctx={allowed:true,owner:p.player_id,session:"s",revision:at,local:p};
  let status=0,read=0;
  const controller=createGearRepairPreview({context:()=>ctx,
    requestReadiness:async()=>{status++;return {response:{ok:true},json:{read_only:true,backend_prepared:true,
      release_approved:true,migration:"verified",writes_enabled:true}};},
    request:async()=>{read++;return {response:{ok:true},json:{ok:true,read_only:true,profile_present:true,
      checked_at:at,revision:at,squads:projectSquads(p.squads)}};}});
  await controller.prepare();assert.equal(status,1);assert.equal(read,1);assert.equal(controller.view().readiness.writes_enabled,false);
  assert.equal(controller.save,undefined);assert.equal(controller.apply,undefined);
});
await test("server dispatch precedes all profile/roster recovery and no client handler is wired",async()=>{
  const source=await readFile(new URL("../api/state.js",import.meta.url),"utf8");
  assert.ok(source.indexOf('startsWith("gear_repair_")')<source.indexOf('if(req.query?.action==="squad_compare")'));
  const view=await readFile(new URL("../lib/gear-repair-preview-view.js",import.meta.url),"utf8");
  assert.match(view,/<button type="button" class="btn" disabled>/);assert.doesNotMatch(view,/data-gear-repair-save/);
  const code=await readFile(new URL("../lib/gear-repair-server.js",import.meta.url),"utf8");
  assert.doesNotMatch(code,/console\.|saveProfile|saveState\(|upsertProfile|canonicalizeAlliance|listSnapshots/);
});
console.log(`PASS equipment repair backend: ${groups} groups; mocked auth/DB/transports; no real account writes.`);
