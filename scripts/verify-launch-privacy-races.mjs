import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app=fs.readFileSync("app.js","utf8");
const begin=app.indexOf('$("#logoutBtn")?.addEventListener("click",');
const end=app.indexOf("\nmountAccountDeletion(",begin);
assert.ok(begin>0&&end>begin);
const source=app.slice(begin,end);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function setup(){
  const pending=deferred(),remembered=[],nodes=new Map();
  function node(id){
    if(!nodes.has(id))nodes.set(id,{textContent:"synthetic-private",innerHTML:"synthetic-private",disabled:false,
      classList:{add(){},remove(){},toggle(){}},addEventListener(_event,cb){this.callback=cb}});
    return nodes.get(id);
  }
  const state={player_id:"fixture-a",player:{name:"Fixture A",hq_level:9,role:"R4"},
    alliance:{tag:"TEST_A"},squads:[1,2,3,4].map(id=>({id,confirmed_composition:["A","B","C","D","E"],power:id}))};
  const ctx={state,cloudSession:{user:{id:"fixture-a"},access_token:"synthetic"},cloudRevision:"revision-a",
    cloud:{auth:{signOut:()=>pending.promise}},proState:{active:true},betaState:{allowed:true},
    $:selector=>node(selector),t:key=>key,
    rememberAccountState:(id,value)=>remembered.push({id,state:JSON.parse(JSON.stringify(value))}),
    clearSignedOutAuthUi(){},renderAuth(){},renderBeta(){},
    render(){ctx.maskHomePrivateMeta();ctx.maskPlayerPrivateSummary();ctx.maskAlliancePrivateSummary()}};
  vm.createContext(ctx);
  for(const name of ["maskHomePrivateMeta","maskPlayerPrivateSummary","maskAlliancePrivateSummary"]){
    const line=app.split("\n").find(line=>line.startsWith(`function ${name}(`));assert.ok(line);
    vm.runInContext(line,ctx);
  }
  vm.runInContext(source,ctx);
  return {ctx,pending,nodes,remembered,click:()=>node("#logoutBtn").callback()};
}
test("logout masks private DOM before the remote request completes",async()=>{
  const f=setup(),work=f.click();
  try{
    assert.equal(f.ctx.cloudSession,null);
    for(const id of ["#playerMeta","#allianceMeta","#pName","#pHq","#pPower","#aTag","#aRole"])
      assert.notEqual(f.ctx.$(id).textContent,"synthetic-private",id);
    assert.equal(f.ctx.$("#squadList").innerHTML,"");
  }finally{f.pending.resolve({error:null});await work}
});
test("late logout completion cannot clear a newly connected account",async()=>{
  const f=setup(),work=f.click();
  const next={user:{id:"fixture-b"},access_token:"synthetic-b"};
  f.ctx.cloudSession=next;f.ctx.cloudRevision="revision-b";
  f.ctx.betaState={allowed:true};f.ctx.proState={active:true};
  f.pending.resolve({error:null});await work;
  assert.equal(f.ctx.cloudSession,next);assert.equal(f.ctx.cloudRevision,"revision-b");
  assert.equal(f.ctx.betaState.allowed,true);assert.equal(f.ctx.proState.active,true);
});
test("remote logout rejection does not prevent local signout",async()=>{
  const f=setup(),work=f.click();
  f.pending.reject(new Error("synthetic network unavailable"));
  await assert.doesNotReject(work);assert.equal(f.ctx.cloudSession,null);
});
test("logout archives only the current owner's data and preserves four confirmed squads",async()=>{
  const f=setup(),before=JSON.stringify(f.ctx.state),work=f.click();
  f.pending.resolve({error:null});await work;
  assert.equal(f.remembered.length,1);assert.equal(f.remembered[0].id,"fixture-a");
  assert.equal(JSON.stringify(f.remembered[0].state),before);assert.equal(JSON.stringify(f.ctx.state),before);
  assert.equal(f.ctx.state.squads.length,4);
});
test("a mismatched local owner is never archived under the connected account",async()=>{
  const f=setup();f.ctx.state.player_id="fixture-other";
  const work=f.click();f.pending.resolve({error:null});await work;
  assert.equal(f.remembered.length,0);
});
test("Auth's synchronous signout notification can still observe the previous owner",async()=>{
  const f=setup();let observed="";
  f.ctx.cloud.auth.signOut=()=>{observed=f.ctx.cloudSession?.user?.id;return f.pending.promise};
  const work=f.click();assert.equal(observed,"fixture-a");
  f.pending.resolve({error:null});await work;assert.equal(f.ctx.cloudSession,null);
});
test("synchronous adapter failure still masks the DOM and retains the owner's archive",async()=>{
  const f=setup();f.ctx.cloud.auth.signOut=()=>{throw new Error("synthetic adapter failure")};
  await assert.doesNotReject(f.click());assert.equal(f.ctx.cloudSession,null);
  assert.equal(f.ctx.$("#pHq").textContent,"—");assert.equal(f.remembered.length,1);
});
