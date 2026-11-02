import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const apiUrl=new URL("../api/sync.js",import.meta.url);
const source=await readFile(apiUrl,"utf8"),imports={};
for(const [,names,path] of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];/gm)){
  const module=await import(new URL(path,apiUrl));
  for(const name of names.split(",").map(value=>value.trim()))imports[name]=module[name];
}

const owner="synthetic-free-player";
const revision="2026-10-31T10:00:00.000Z";
const nextRevision="2026-10-31T10:05:00.000Z";
const clone=value=>JSON.parse(JSON.stringify(value));
const localState=()=>{
  const state=imports.normalizeState({
    player_id:owner,
    player:{name:"Player A",server_id:"123",hq_level:31},
    alliance:{tag:"",server_id:"",members:[]},
    squads:[{id:1,power:45.6,heroes:["Carlie","Lucius","Morrison","DVA","Skyler"]}],
    technology:{branches:{
      team_3:{name:"Équipe 3",state:"percent",percent:0},
      heroes:{name:"Héros",state:"max"}
    }},
    exclusive_weapons:[{hero_name:"DVA",level:30,specializations:{attack:{level:0}}}]
  });
  // This flag belongs to the unsent client runtime, not the persisted profile schema.
  state.sync.pending_cloud_save=true;
  return state;
};

function makeHarness({beta="denied",lookupError=false,writeReply="valid",cloudRevision=revision}={}){
  const cloud=localState(),written=[],calls={beta:0,serviceWrite:0,userWrite:0,allianceRead:0,allianceWrite:0};
  const context=vm.createContext({...imports,console,URL,
    configured:()=>true,
    userConfigured:()=>true,
    requireProductUser:async(_req,options)=>{
      assert.equal(options.consent,true);
      return {user:{id:owner,email:"player@example.test"}};
    },
    betaAccessForUserAsync:async user=>{
      calls.beta++;
      assert.equal(user.id,owner);
      if(lookupError)throw Object.assign(new Error("synthetic invite lookup failure"),{code:"BETA_INVITES_DATABASE_UNREACHABLE"});
      return {allowed:beta==="allowed"};
    },
    getProfile:async id=>{
      assert.equal(id,owner);
      return {state:clone(cloud),updated_at:cloudRevision};
    },
    getProfileForUser:async(id,token)=>{
      assert.equal(id,owner);assert.equal(token,"synthetic-bearer");
      return {state:clone(cloud),updated_at:cloudRevision};
    },
    getAllianceRoster:async()=>{calls.allianceRead++;throw new Error("must not read alliance without beta authorization")},
    updateAllianceScopeRoster:async()=>{calls.allianceWrite++;throw new Error("must not write alliance without canonical authorization")},
    saveProfileIfUnchanged:async()=>{calls.serviceWrite++;throw new Error("personal FREE sync must use user-scoped RLS")},
    saveProfileForUserIfUnchanged:async(id,state,token,expected)=>{
      calls.userWrite++;
      assert.equal(id,owner);assert.equal(token,"synthetic-bearer");assert.equal(expected,revision);
      const saved=clone(state);
      written.push(saved);
      if(writeReply==="wrong-owner")return {player_id:"another-account",state:{...saved,player_id:"another-account"},updated_at:nextRevision};
      if(writeReply==="invalid-revision")return {player_id:owner,state:saved,updated_at:"not-a-date"};
      return {player_id:owner,state:saved,updated_at:nextRevision};
    },
    insertSnapshot:async()=>{throw new Error("unexpected service snapshot write")},
    insertSnapshotForUser:async(id,state)=>{assert.equal(id,owner);assert.equal(state.player_id,owner)}
  });
  vm.runInContext(source.replace(/^import .*$/gm,"").replace(/^export function /gm,"function ")
    .replace("export default async function handler","async function handler"),context);
  const state=localState();
  async function send({baseUpdatedAt=revision,requestState=state}={}){
    const response={statusCode:200,headers:{},setHeader(key,value){this.headers[key]=value},
      status(code){this.statusCode=code;return this},json(body){this.body=clone(body);return this}};
    await context.handler({method:"POST",url:"/api/sync",headers:{authorization:"Bearer synthetic-bearer",
      "x-warboost-beta-consent":"2026-09-05-safe-launch-v2"},
      body:{operation:"player_sync",state:requestState,base_updated_at:baseUpdatedAt}},response);
    return response;
  }
  return {send,calls,written,state,cloud};
}

let passed=0;
async function test(name,fn){await fn();passed++;console.log("PASS",name)}

await test("configured backend with no alliance scope saves FREE profile through authenticated RLS without invitation lookup",async()=>{
  const h=makeHarness(),result=await h.send();
  assert.equal(result.statusCode,200,JSON.stringify(result.body));
  assert.equal(result.body.write_confirmed,true);
  assert.equal(result.body.state.player_id,owner);
  assert.equal(h.calls.beta,0);
  assert.equal(h.calls.userWrite,1);
  assert.equal(h.calls.serviceWrite,0);
  assert.equal(h.calls.allianceRead,0);
});

await test("configured backend with uninvited player saves own profile but does not read or write alliance data",async()=>{
  const h=makeHarness({beta:"denied"}),state=localState();
  state.player.server_id="123";state.alliance.tag="ALLY";
  const result=await h.send({requestState:state});
  assert.equal(result.statusCode,200);
  assert.equal(result.body.write_confirmed,true);
  assert.equal(h.calls.beta,1);
  assert.equal(h.calls.userWrite,1);
  assert.equal(h.calls.serviceWrite,0);
  assert.equal(h.calls.allianceRead,0);
  assert.equal(h.calls.allianceWrite,0);
});

await test("invitation lookup failure fails closed for alliance enrichment but does not block own profile write",async()=>{
  const h=makeHarness({lookupError:true}),state=localState();
  state.player.server_id="123";state.alliance.tag="ALLY";
  const result=await h.send({requestState:state});
  assert.equal(result.statusCode,200);
  assert.equal(result.body.write_confirmed,true);
  assert.equal(h.calls.userWrite,1);
  assert.equal(h.calls.serviceWrite,0);
  assert.equal(h.calls.allianceRead,0);
  assert.equal(h.calls.allianceWrite,0);
});

await test("RLS profile write preserves player, squad, technology zero/max and exclusive-weapon fields",async()=>{
  const h=makeHarness(),result=await h.send(),saved=h.written[0];
  assert.equal(result.body.write_confirmed,true);
  assert.equal(saved.player_id,owner);
  assert.equal(saved.squads[0].power,45.6);
  assert.deepEqual(Object.entries(saved.technology.branches).map(([key,row])=>[key,row.state]),
    [["team_3","percent"],["heroes","max"]]);
  assert.equal(saved.technology.branches.team_3.percent,0);
  assert.equal(saved.exclusive_weapons[0].level,30);
  assert.equal(h.state.sync.pending_cloud_save,true);
  assert.equal(saved.sync.pending_cloud_save,undefined);
});

await test("stale profile revision remains a 409 and performs no write",async()=>{
  const h=makeHarness({beta:"denied"}),result=await h.send({baseUpdatedAt:"2026-10-31T09:00:00.000Z"});
  assert.equal(result.statusCode,409);
  assert.equal(result.body.error,"profile_write_conflict");
  assert.equal(result.body.write_confirmed,undefined);
  assert.equal(h.calls.userWrite,0);
  assert.equal(h.calls.serviceWrite,0);
});

await test("wrong-owner or invalid write receipt never reports a confirmed cloud save",async()=>{
  for(const writeReply of ["wrong-owner","invalid-revision"]){
    const h=makeHarness({beta:"denied",writeReply}),result=await h.send();
    assert.equal(result.statusCode,200);
    assert.equal(result.body.write_confirmed,false);
    assert.equal(result.body.state.player_id,owner);
    assert.equal(h.calls.userWrite,1);
  }
});

console.log(`PASS personal FREE sync handler: ${passed} scenarios; real api/sync handler with synthetic auth/storage, no network.`);
