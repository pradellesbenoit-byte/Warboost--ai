import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {parseRosterImport} from "../lib/roster-import.js";

const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
test("text roster import never invents R1 for missing or malformed grades",()=>{
  for(const grade of ["","R6","unknown"]){
    const rows=parseRosterImport(`Synthetic Commander;${grade};35;304.3M`);
    assert.equal(rows.length,1);
    assert.equal(rows[0].role,null);
    assert.equal(rows[0].hq_level,35);
  }
  for(const grade of ["R1","R2","R3","R4","R5"])
    assert.equal(parseRosterImport(`Synthetic Commander;${grade};35;304.3M`)[0].role,grade);
});
test("rank-first text rows never interpret digits in a nickname as HQ",()=>{
  const [row]=parseRosterImport("R3;Synthetic 12;39;304.3M");
  assert.equal(row.name,"Synthetic 12");
  assert.equal(row.hq_level,39);
  assert.equal(row.power_m,304.3);
});
test("actual text import handler keeps text and never saves a member without an explicit rank",async()=>{
  const start=app.indexOf('$("#rosterImportBtn")?.addEventListener');
  const source=app.slice(start,app.indexOf("\n});",start)+4);
  let handler,calls=0;
  const nodes={rosterImportBtn:{addEventListener:(_kind,fn)=>handler=fn},
    rosterImportStatus:{},rosterImportText:{value:"Synthetic Commander;;35;304.3M"},
    rosterFullSnapshot:{checked:false}};
  const c=vm.createContext({$:s=>nodes[s.slice(1)],hasDeclaredAllianceCommandRole:()=>true,
    showAllianceRoleGuard:()=>{},state:{player:{server_id:"884"},alliance:{tag:"TEST"}},
    parseRosterImport,t:k=>k,applyRosterRows:async()=>{calls++;return {synced:true}}});
  vm.runInContext(source,c);
  await handler();
  assert.equal(calls,0);
  assert.equal(nodes.rosterImportText.value,"Synthetic Commander;;35;304.3M");
  assert.equal(nodes.rosterImportStatus.textContent,"roster_rank_required");
});
test("loading target must not be selected inside any hidden ancestor",()=>{
  const start=app.indexOf("function firstLoadingTarget(");
  const source=app.slice(start,app.indexOf("\n",start));
  const hidden={hidden:false,classList:{contains:()=>false},closest:selector=>
    selector.includes("[hidden]")||selector.includes(".hidden")?{}:null};
  const visible={hidden:false,classList:{contains:()=>false},closest:()=>null};
  const c=vm.createContext({$:s=>s==="#hidden-button"?hidden:visible});
  vm.runInContext(source,c);
  assert.equal(c.firstLoadingTarget(["hidden-button","visible-button"]),visible);
});
