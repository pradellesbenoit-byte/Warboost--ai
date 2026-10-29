import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {TECHNOLOGY_KEYS,applyManualTechnology,technologyFingerprint,technologyEntry} from "../lib/technology-manual.js";
import {technologyManualCopy,TECHNOLOGY_MANUAL_LOCALES} from "../lib/technology-manual-copy.js";
import {createTechnologyManualUI,technologyDisplayDate} from "../lib/technology-manual-ui.js";
import {normalizeTechnologyBranches,mergeTechnologyBranches} from "../lib/technology-scan.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {hasMeaningfulCoreState,hydrateCloudState} from "../lib/cloud-state-recovery.js";

const at="2026-10-27T10:00:00.000Z",later="2026-10-27T11:00:00.000Z";
const fixture=()=>({player_id:"synthetic-A",technology:{branches:{}},
 squads:[1,2,3,4].map(slot=>({slot,heroes:[{name:"DVA",level:90,gear:{weapon:30}}]})),
 drone:{level:80,power_m:1},exclusive_weapons:[{hero:"DVA",level:2}]});
const edit=(state,key,status,extra={})=>applyManualTechnology(state,{owner:state.player_id,key,state:status,
 baseline:technologyFingerprint(technologyEntry(state,key)),now:at,...extra});

for(const key of TECHNOLOGY_KEYS)test(`manual ${key}: zero, real 100, max, locked, unknown durable`,()=>{
 let state=fixture();const original=structuredClone(state);
 for(const [status,extra] of [["percent",{percent:0}],["percent",{percent:100}],["max",{}],["locked",{prerequisite:"HQ condition"}],["unknown",{}]]){
   state=edit(state,key,status,extra);
   const entry=state.technology.branches[key];
   assert.equal(entry.state,status);
   assert.equal(entry.source,"manual");
   assert.equal(entry.confirmed_at,entry.updated_at);
   if(status==="percent")assert.equal(entry.percent,extra.percent);
   else assert.ok(!("percent" in entry));
   if(status==="locked")assert.equal(entry.prerequisite,"HQ condition");
   const reload=normalizeState(JSON.parse(JSON.stringify(state)));
   assert.deepEqual(reload.technology.branches[key],entry);
 }
 assert.deepEqual(state.squads,original.squads);
 assert.deepEqual(state.drone,original.drone);
 assert.deepEqual(state.exclusive_weapons,original.exclusive_weapons);
});

test("validation, ownership and concurrent edit refuse without mutation",()=>{
 const original=fixture(),snapshot=JSON.stringify(original);
 for(const value of ["",null,undefined,-1,101,NaN,Infinity,"text"])
   assert.throws(()=>edit(original,"heroes","percent",{percent:value}),/invalid/);
 assert.throws(()=>edit(original,"invented","max"),/invalid/);
 assert.throws(()=>edit(original,"heroes","max",{owner:"synthetic-B"}),/owner/);
 const stale=technologyFingerprint(undefined),newer=edit(original,"heroes","percent",{percent:94});
 assert.throws(()=>edit(newer,"heroes","max",{baseline:stale}),/conflict/);
 assert.equal(JSON.stringify(original),snapshot);
});

test("old cloud snapshot cannot resurrect explicit unknown; other categories merge",()=>{
 const older=edit(fixture(),"heroes","percent",{percent:94});
 const cleared=edit(older,"heroes","unknown",{now:later});
 const remote=edit(older,"economy","percent",{percent:0});
 const combined=mergeNewest(cleared,remote);
 assert.equal(combined.technology.branches.heroes.state,"unknown");
 assert.equal(combined.technology.branches.economy.percent,0);
 assert.equal(combined.technology.branches.heroes.source,"manual");
 assert.deepEqual(mergeTechnologyBranches(combined.technology.branches,older.technology.branches),combined.technology.branches);
 assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(combined))).technology.branches,combined.technology.branches);
});

test("legacy saved values display without inventing a branch for ambiguous mastery",()=>{
 const state={...fixture(),technology:{hero_tech_pct:0,tactical_weapon_pct:55,type_mastery_pct:80,updated_at:at}};
 assert.equal(technologyEntry(state,"heroes").percent,0);
 assert.equal(technologyEntry(state,"tactical_weapon").percent,55);
 assert.equal(technologyEntry(state,"tank_specialization"),undefined);
 assert.equal(technologyEntry(state,"economy"),undefined);
 const cleared=edit(state,"heroes","unknown");
 assert.equal(technologyEntry(cleared,"heroes").state,"unknown");
 assert.deepEqual(normalizeTechnologyBranches({heroes:{name:"Héros",state:"unknown"}}),{});
});

// Minimal event DOM: actual delegated controller, no reimplementation of handlers.
function harness(sharedStorage=new Map()){
 let state=fixture(),locale="fr",cloud="pending",saveOk=true,saves=0;
 const listeners={},status={textContent:""},details={open:true};
 const browserListeners={};
 const storage={getItem:key=>sharedStorage.get(key)||null,setItem:(key,value)=>sharedStorage.set(key,value),removeItem:key=>sharedStorage.delete(key)};
 const root={innerHTML:"",ownerDocument:{activeElement:null,defaultView:{sessionStorage:storage,addEventListener:(event,fn)=>browserListeners[event]=fn}},contains:el=>Boolean(el)&&el===root.active,
   setAttribute(){},querySelector:selector=>selector==="details"?details:status,
   addEventListener:(event,fn)=>listeners[event]=fn};
 const ui=createTechnologyManualUI({root,getState:()=>state,getLocale:()=>locale,getCloudStatus:()=>cloud,
   save:(next,owner)=>{assert.equal(owner,state.player_id);saves++;if(!saveOk)return false;state=next;return true;}});
 ui.render();
 function event(kind,key,field,value){
   const row={dataset:{techKey:key}},action=kind==="click"?field:null;
   const target={value,dataset:action?{techAction:action}:{techField:field},blur(){root.active=null;root.ownerDocument.activeElement=null;},
     closest:selector=>selector==="[data-tech-key]"?row:action?{dataset:{techAction:action}}:null};
   listeners[kind]({target});
 }
 return {root,status,ui,event,details,browserListeners,get state(){return state},set state(v){state=v},set locale(v){locale=v},set cloud(v){cloud=v},set saveOk(v){saveOk=v},get saves(){return saves}};
}

for(const locale of TECHNOLOGY_MANUAL_LOCALES)test(`localized mobile form: ${locale}`,()=>{
 const copy=technologyManualCopy(locale),h=harness();h.locale=locale;h.ui.render();
 assert.equal(copy.text.length,14);assert.equal(copy.names.length,18);
 assert.ok([...copy.text,...copy.names].every(value=>value.trim()));
 assert.equal((h.root.innerHTML.match(/data-tech-key=/g)||[]).length,18);
 assert.ok(h.root.innerHTML.includes(copy.text[0]));
 assert.ok(h.root.innerHTML.includes(`dir="${locale==="ar"?"rtl":"ltr"}"`));
 assert.ok(!h.root.innerHTML.includes('value="0"'));
 assert.equal(h.status.textContent,"");
});

test("real UI events save, cancel, invalid input, reload, cloud acknowledgment, local failure",()=>{
 const h=harness();
 h.event("change","heroes","state","percent");h.event("input","heroes","percent","94");
 h.event("click","heroes","cancel");
 assert.deepEqual(h.state.technology.branches,{});assert.equal(h.saves,0);
 h.event("change","heroes","state","percent");h.event("input","heroes","percent","");
 h.event("click","heroes","save");assert.equal(h.saves,0);
 assert.equal(h.status.textContent,technologyManualCopy("fr").text[11]);
 h.event("input","heroes","percent","0");h.event("click","heroes","save");
 assert.equal(h.state.technology.branches.heroes.percent,0);
 assert.ok(h.status.textContent.includes(technologyManualCopy("fr").text[8]));
 assert.ok(!h.status.textContent.includes(technologyManualCopy("fr").text[9]));
 h.cloud="confirmed";h.ui.render();assert.equal(h.status.textContent,technologyManualCopy("fr").text[9]);
 h.state=JSON.parse(JSON.stringify(h.state));h.ui.render();assert.match(h.root.innerHTML,/>0 %</);
 h.event("click","heroes","toggle");assert.match(h.root.innerHTML,/value="0"/);
 h.saveOk=false;h.event("change","heroes","state","max");h.event("click","heroes","save");
 assert.equal(h.state.technology.branches.heroes.state,"percent");
 assert.equal(h.status.textContent,technologyManualCopy("fr").text[13]);
 assert.match(h.root.innerHTML,/<option value="max" selected/);
});

test("compact list: 18 rows, no editor initially, exactly one on explicit touch; saved values not drafts in summary",()=>{
 const h=harness();
 assert.equal((h.root.innerHTML.match(/data-tech-action="toggle"/g)||[]).length,18);
 assert.equal((h.root.innerHTML.match(/<fieldset/g)||[]).length,0);
 assert.ok(!h.root.innerHTML.includes('data-tech-action="save"'));
 for(const key of TECHNOLOGY_KEYS){
   h.event("click",key,"toggle");
   assert.equal((h.root.innerHTML.match(/<fieldset/g)||[]).length,1);
   assert.equal((h.root.innerHTML.match(/aria-expanded="true"/g)||[]).length,1);
 }
 h.event("click","heroes","toggle");h.event("change","heroes","state","percent");
 h.event("input","heroes","percent","94");h.event("click","economy","toggle");
 assert.ok(h.root.innerHTML.includes(technologyManualCopy("fr").draft));
 assert.ok(!h.root.innerHTML.includes(">94 %<"));assert.equal(h.saves,0);
 h.event("click","heroes","toggle");assert.match(h.root.innerHTML,/value="94"/);
 h.event("click","heroes","cancel");assert.equal((h.root.innerHTML.match(/<fieldset/g)||[]).length,0);
});

test("draft survives section close, repaint and tab refresh; account switch/reset erase it without saving",()=>{
 const storage=new Map(),h=harness(storage);
 h.event("click","heroes","toggle");h.event("change","heroes","state","percent");h.event("input","heroes","percent","94");
 h.details.open=false;h.ui.render();h.details.open=true;h.ui.render();assert.match(h.root.innerHTML,/value="94"/);
 let warned=false;h.browserListeners.beforeunload({preventDefault(){warned=true;}});assert.equal(warned,true);
 const refreshed=harness(storage);assert.match(refreshed.root.innerHTML,/value="94"/);assert.equal(refreshed.saves,0);
 refreshed.state={...fixture(),player_id:"synthetic-B"};refreshed.ui.render();
 assert.ok(!refreshed.root.innerHTML.includes('value="94"'));assert.equal(storage.size,0);
 refreshed.event("change","economy","state","max");refreshed.ui.reset();assert.equal(storage.size,0);
});

test("all saved states, valid dates and known sources display without changing the stored state",()=>{
 const h=harness();
 h.state.technology.branches={
   heroes:{state:"percent",percent:94,source:"manual",updated_at:"2026-10-28T05:48:13.076Z"},
   economy:{state:"percent",percent:0,source:"scan",updated_at:at},
   units:{state:"max",updated_at:"invalid"},development:{state:"locked",prerequisite:"HQ"},
   team_1:{state:"percent",percent:100}
 };
 const before=JSON.stringify(h.state);h.ui.render();
 for(const text of ["94 %","0 %","100 %","Niveau Max","Verrouillée","Non renseigné","Saisie manuelle","Scan"])
   assert.ok(h.root.innerHTML.includes(text),text);
 assert.ok(!h.root.innerHTML.includes("2026-10-28T05:48"));assert.equal(JSON.stringify(h.state),before);
 assert.equal(technologyDisplayDate({updated_at:"2026-10-28T05:48:13.076Z"},"fr","Europe/Paris"),"28/10/2026 à 06:48");
 for(const locale of TECHNOLOGY_MANUAL_LOCALES){
   const copy=technologyManualCopy(locale);assert.ok(copy.draft&&copy.scan);
   const date=technologyDisplayDate({updated_at:at},locale,"UTC");assert.ok(date&&!date.includes("T10:"));
   h.locale=locale;h.ui.render();assert.equal((h.root.innerHTML.match(/data-tech-action="toggle"/g)||[]).length,18);
 }
 for(const value of [undefined,null,"","bad-date"])
   assert.equal(technologyDisplayDate({updated_at:value},"fr"),"");
 assert.ok(technologyDisplayDate({confirmed_at:at},"en-GB","UTC"));
 assert.ok(technologyDisplayDate({updated_at:"invalid",confirmed_at:at},"fr","UTC"));
});

test("restored draft still rejects a newer cloud value; no autosave or account transfer",()=>{
 const storage=new Map(),h=harness(storage);
 h.event("change","heroes","state","percent");h.event("input","heroes","percent","94");
 const restored=harness(storage);restored.state=edit(restored.state,"heroes","max");restored.ui.render();
 restored.event("click","heroes","save");assert.equal(restored.saves,0);
 assert.equal(restored.status.textContent,technologyManualCopy("fr").text[12]);
 assert.equal(restored.state.technology.branches.heroes.state,"max");
 restored.event("click","heroes","cancel");assert.equal(storage.size,0);
});

test("real UI refuses stale concurrent edits and does not leak drafts across accounts",()=>{
 const h=harness();
 h.event("change","heroes","state","percent");h.event("input","heroes","percent","94");
 h.state=edit(h.state,"heroes","max");h.event("click","heroes","save");
 assert.equal(h.saves,0);assert.equal(h.state.technology.branches.heroes.state,"max");
 assert.equal(h.status.textContent,technologyManualCopy("fr").text[12]);
 h.state={...fixture(),player_id:"synthetic-B"};h.ui.render();
 assert.ok(!h.root.innerHTML.includes('value="94"'));
 assert.deepEqual(h.state.technology.branches,{});
 h.event("change","economy","state","locked");h.event("input","economy","prerequisite","<script>secret</script>");
 h.locale="ar";h.ui.render();assert.match(h.root.innerHTML,/dir="rtl"/);
 assert.ok(!h.root.innerHTML.includes("<script>"));assert.match(h.root.innerHTML,/&lt;script&gt;/);
 h.event("click","economy","cancel");assert.ok(!h.root.innerHTML.includes("secret"));
});

test("background refresh keeps focus and refuses stale rendered baseline",()=>{
 const h=harness(),before=h.root.innerHTML;
 h.root.active={};h.root.ownerDocument.activeElement=h.root.active;
 h.state=edit(h.state,"heroes","max");h.ui.render();assert.equal(h.root.innerHTML,before);
 h.event("input","heroes","percent","55");
 h.event("input","heroes","state","percent");
 h.event("click","heroes","save");
 assert.equal(h.saves,0);assert.equal(h.status.textContent,technologyManualCopy("fr").text[12]);
});

test("UI integration is in Player, has no AI route, and privacy masks it",()=>{
 const html=fs.readFileSync("index.html","utf8"),app=fs.readFileSync("app.js","utf8"),css=fs.readFileSync("styles.css","utf8");
 const player=html.slice(html.indexOf('id="playerDrawer"'),html.indexOf('id="allianceDrawer"'));
 assert.ok(player.includes('id="playerTechnologyManual"'));
 assert.match(app,/safeRenderStep\("TECHNOLOGY_MANUAL",renderTechnologyManual\)/);
 assert.match(app,/technologyRoot\.textContent=""/);
 const module=fs.readFileSync("lib/technology-manual-ui.js","utf8");
 assert.ok(!/\b(fetch|openai|scanType|supabase)\b/i.test(module));
 assert.match(css,/\.technologyManual \[hidden\]/);
 assert.match(css,/min-height:44px/);
 const sw=fs.readFileSync("sw.js","utf8");
 for(const module of ["technology-manual.js","technology-manual-copy.js","technology-manual-ui.js"])
   assert.ok(sw.includes(`/lib/${module}`));
 assert.equal(technologyManualCopy("en-GB").text[0],"Technology");
 assert.equal(technologyManualCopy("unknown").text[0],"Technology");
});

test("technology alone including explicit clearing qualifies for account recovery and save",()=>{
 const empty={player_id:"synthetic-A",technology:{branches:{}}};
 assert.equal(hasMeaningfulCoreState(empty),false);
 for(const status of ["percent","max","locked","unknown"]){
   const saved=edit(empty,"heroes",status,{percent:0});
   assert.equal(hasMeaningfulCoreState(saved),true);
   assert.deepEqual(hydrateCloudState(JSON.parse(JSON.stringify(saved)),empty,"synthetic-A").technology,saved.technology);
 }
});

test("actual app integration saves only technology, fails owner mismatch and distinguishes cloud status",()=>{
 const app=fs.readFileSync("app.js","utf8");
 const code=app.slice(app.indexOf("let technologyManualUI=null;"),app.indexOf("function renderPlayerProgression("));
 let options,calls=0,ok=true;
 const context={state:fixture(),locale:"fr",cloudDirty:false,cloudProfileVerified:true,cloudSession:{user:{id:"synthetic-A"}},
   $:()=>({}),createTechnologyManualUI:config=>{options=config;return {render(){}}},
   saveState:args=>{assert.equal(args.renderUi,false);calls++;return ok}};
 vm.runInNewContext(code,context);context.renderTechnologyManual();
 assert.equal(options.getCloudStatus(),"pending");
 const original=structuredClone(context.state);
 const next=edit(context.state,"heroes","percent",{percent:0});
 assert.equal(options.save(next,"synthetic-A"),true);assert.equal(calls,1);
 assert.equal(context.cloudDirty,true);
 assert.equal(context.state.sync.pending_cloud_save,true);
 assert.equal(options.getCloudStatus(),"pending");
 assert.deepEqual(context.state.drone,original.drone);
 assert.deepEqual(context.state.exclusive_weapons,original.exclusive_weapons);
 assert.deepEqual(context.state.squads,original.squads);
 const before=JSON.stringify(context.state.technology);ok=false;
 assert.equal(options.save(edit(context.state,"heroes","max"),"synthetic-A"),false);
 assert.equal(JSON.stringify(context.state.technology),before);
 context.cloudSession.user.id="synthetic-B";
 assert.equal(options.save(next,"synthetic-A"),false);assert.equal(calls,2);
 assert.equal(options.getCloudStatus(),"pending");
 context.cloudSession.user.id="synthetic-A";
 context.cloudDirty=false;context.state.sync={status:"ok",last_sync:at};assert.equal(options.getCloudStatus(),"confirmed");
 context.cloudDirty=true;assert.equal(options.getCloudStatus(),"pending");
});
