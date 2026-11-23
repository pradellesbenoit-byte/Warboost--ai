import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {captureOpenSquadIds,restoreOpenSquadIds} from "../lib/squad-open-state.js";

let checks=0;
function test(name,fn){fn();checks++;console.log("PASS",name)}
const selector="details.squad[data-squad-id]";
const boxFor=rows=>({querySelectorAll(value){assert.equal(value,selector);return rows}});

test("re-render restores only the squads that were open",()=>{
  const before=[1,2,3,4].map(id=>({dataset:{squadId:String(id)},open:id===2||id===4}));
  const open=captureOpenSquadIds(boxFor(before));
  const after=[1,2,3,4].map(id=>({dataset:{squadId:String(id)},open:false}));
  restoreOpenSquadIds(boxFor(after),open);
  assert.deepEqual(after.map(row=>row.open),[false,true,false,true]);
});
test("collapse-all remains collapsed after a later render",()=>{
  const collapsed=[1,2,3,4].map(id=>({dataset:{squadId:String(id)},open:false}));
  const open=captureOpenSquadIds(boxFor(collapsed));
  const after=[1,2,3,4].map(id=>({dataset:{squadId:String(id)},open:true}));
  restoreOpenSquadIds(boxFor(after),open);
  assert.deepEqual(after.map(row=>row.open),[false,false,false,false]);
});
test("unknown squad IDs are neither captured nor changed",()=>{
  const rows=[{dataset:{squadId:"5"},open:true}];
  const open=captureOpenSquadIds(boxFor(rows));
  restoreOpenSquadIds(boxFor(rows),open);
  assert.equal(open.size,0);
  assert.equal(rows[0].open,true);
});
test("renderer captures before clearing and restores after rebuilding",()=>{
  const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
  const start=source.indexOf("function renderSquads(){");
  const end=source.indexOf("\nfunction ",start+1);
  const render=start>=0&&end>start?source.slice(start,end):"";
  const capture=render.indexOf("captureOpenSquadIds(box)");
  const clear=render.indexOf('box.innerHTML=""');
  const append=render.lastIndexOf("box.appendChild(shell)");
  const restore=render.indexOf("restoreOpenSquadIds(box,openSquadIds)");
  assert.ok(capture>=0&&clear>capture,"capture must precede DOM replacement");
  assert.ok(append>=0&&restore>append,"restore must follow squad rebuilding");
  assert.match(render,/data-squad-id=/);
});
console.log(`PASS squad open state: ${checks} checks; DOM-only, no state persistence.`);
