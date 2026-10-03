import assert from "node:assert/strict";
import fs from "node:fs";
import {renderEventStrategy,toggleEventStrategyGroup} from "../lib/event-strategy-ui.js";

const assignments=Array.from({length:12},(_,i)=>({member_key:`fold-${i}`,name:`Joueur ${i}`,role:"objective_defense",attendance_status:"present"}));
const substitute_assignments=Array.from({length:5},(_,i)=>({member_key:`reserve-${i}`,name:`Réserve ${i}`,
  role:"reinforce_defense",attendance_status:"substitute",priority:i+1,
  task:{kind:"cover_starter",target_name:`Joueur ${i}`,role:"objective_defense",trigger:"starter_absent"}}));
const plan={event_type:"fold_test",assignments,substitute_assignments,capacity:{substitutes:10}};
const before=JSON.stringify(plan);
const control=m=>`<select data-alliance-event-status="${m.member_key}"><option>${m.attendance_status}</option></select>`;
const render=()=>renderEventStrategy(plan,{locale:"fr",renderMemberControl:control});
const initial=render();
assert.match(initial,/Titulaires · <span class="eventStrategyGroupCount">12<\/span>/);
assert.match(initial,/Remplaçants · <span class="eventStrategyGroupCount">5<\/span>/);
assert.equal((initial.match(/aria-expanded="false"/g)||[]).length,2);
assert.equal((initial.match(/class="eventStrategyGroupBody" hidden/g)||[]).length,2);
assert.equal((initial.match(/data-alliance-event-status=/g)||[]).length,17,"all original status controls remain");
assert.equal((initial.match(/class="eventStrategyReserveEntry"/g)||[]).length,5,"reserve tasks/priorities remain");
assert.doesNotMatch(initial,/<details/,"no nested native accordions");

const stored=new Map(),previous=Object.getOwnPropertyDescriptor(globalThis,"sessionStorage");
Object.defineProperty(globalThis,"sessionStorage",{configurable:true,value:{
  getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)
}});
function button(key){
  let expanded="false";
  const body={hidden:true};
  return {dataset:{eventRosterToggle:key},body,
    getAttribute:()=>expanded,setAttribute:(_,value)=>expanded=value,
    closest:()=>({querySelector:()=>body})};
}
try{
  const starter=button("fold_test:starters"),reserve=button("fold_test:reserves");
  assert.equal(toggleEventStrategyGroup(starter),true);assert.equal(starter.body.hidden,false);
  assert.equal(starter.getAttribute("aria-expanded"),"true");
  assert.equal(reserve.body.hidden,true,"opening starters does not open reserves");
  assert.match(render(),/data-event-roster-toggle="fold_test:starters" aria-expanded="true"/,"rerender preserves expanded state");
  toggleEventStrategyGroup(starter);
  assert.equal(starter.body.hidden,true);assert.equal(starter.getAttribute("aria-expanded"),"false");
  toggleEventStrategyGroup(reserve);assert.equal(reserve.body.hidden,false);
  assert.match(render(),/data-event-roster-toggle="fold_test:reserves" aria-expanded="true"/);
  toggleEventStrategyGroup(reserve);assert.equal(reserve.body.hidden,true);
  assert.equal(stored.get("warboost:event-roster-ui:fold_test:reserves"),"closed");
  const freshUi=await import("../lib/event-strategy-ui.js?fold-session-reload");
  stored.set("warboost:event-roster-ui:fold_test:starters","open");
  assert.match(freshUi.renderEventStrategy(plan),/fold_test:starters" aria-expanded="true"/,"session storage survives module reload");
  Object.defineProperty(globalThis,"sessionStorage",{configurable:true,get(){throw new Error("storage blocked")}});
  assert.doesNotThrow(()=>toggleEventStrategyGroup(starter),"storage restrictions do not break toggling");
  assert.doesNotThrow(()=>render());
}finally{
  if(previous)Object.defineProperty(globalThis,"sessionStorage",previous);
  else delete globalThis.sessionStorage;
}
assert.equal(JSON.stringify(plan),before,"folding does not modify roles, statuses, tasks or plan calculations");
const app=fs.readFileSync("app.js","utf8"),css=fs.readFileSync("styles.css","utf8");
assert.ok(app.includes("toggleEventStrategyGroup(disclosure)"));
assert.match(css,/\.eventStrategyGroupBody\[hidden\]\{display:none!important\}/);
assert.match(css,/prefers-reduced-motion:reduce/);
console.log("Compact event disclosures: counts, independent one-tap toggle, session state, control isolation and unchanged plan data: PASS");