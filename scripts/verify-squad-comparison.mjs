import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {projectSquads,compareSquadProjections,createSquadComparison,SQUAD_COMPARE_CATEGORIES} from "../lib/squad-comparison.js";
import {squadComparisonHtml} from "../lib/squad-comparison-view.js";
import {squadComparisonCopy} from "../lib/squad-comparison-copy.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";
import {translator} from "../i18n.js";
import api from "../api/state.js";

let groups=0,labels=0;
const test=async(name,run)=>{await run();groups++;console.log("PASS "+name)};
const clone=value=>JSON.parse(JSON.stringify(value)),at="2026-10-15T08:43:37.000Z";
const marker={status:"needs_verification",reason:"squad_freshness_ambiguous"};
const names=[
  ["Murphy","Kimberly","Williams","Marshall","Stetmann"],
  ["DVA","Morrison","Carlie","Lucius","Schuyler"],
  ["Tesla","Adam","McGregor","Fiona","Swift"]
];
const squads=()=>names.map((row,index)=>({id:index+1,power:44.43-index,
  field_source:{power:"confirmed_scan"},field_updated_at:{power:at},
  composition_source:"explicit_confirmation",composition_confirmed_at:at,confirmed_composition:[...row],
  heroes:row.map(name=>({name,level:155,stars:5,power:6.5,exclusive:16,
    field_source:Object.fromEntries(["level","stars","power","exclusive","gear","awakening"].map(key=>[key,"confirmed_scan"])),
    field_updated_at:Object.fromEntries(["level","stars","power","exclusive","gear","awakening"].map(key=>[key,at])),
    gear:"slot=0;count=1;level=0;rarity=orange;slot=1;count=1;level=40;rarity=red",
    awakening:{level:1}}))}));
const profile=()=>({player_id:"fixture-owner",squads:squads(),sync:{pending_cloud_save:true,
  last_error:"squad_freshness_ambiguous",last_confirmed_write_at:at},alliance:{role:"R5",members:[]}});
const freeze=value=>{if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const compare=(a,b)=>compareSquadProjections(projectSquads(a),projectSquads(b));
await test("three stale markers with identical saved squads and empty four are identified without clearing them",()=>{
  const local=profile(),remote=profile();local.squads.forEach(s=>s.composition_conflict=clone(marker));
  const before=JSON.stringify(local);assert.deepEqual(compare(local.squads,remote.squads).map(x=>x.kind),["marker","marker","marker","empty"]);
  assert.equal(JSON.stringify(local),before);assert.equal(local.sync.pending_cloud_save,true);
});
await test("each of the eight categories is compared independently",()=>{
  const changes={
    composition:s=>{[s.heroes[0],s.heroes[1]]=[s.heroes[1],s.heroes[0]];
      s.confirmed_composition=s.heroes.map(hero=>hero.name)},
    confirmation:s=>{s.composition_confirmed_at="2026-10-15T09:00:00.000Z"},
    levels:s=>{s.heroes[0].level=154},stars:s=>{s.heroes[0].stars=4},
    power:s=>{s.power=43},gear:s=>{s.heroes[0].gear="slot=0;count=1;level=1;rarity=orange;slot=1;count=1;level=40;rarity=red"},
    weapons:s=>{s.heroes[0].exclusive=17},awakening:s=>{s.heroes[0].awakening={level:2}}
  };
  for(const category of SQUAD_COMPARE_CATEGORIES){
    const local=squads(),remote=squads();changes[category](remote[1]);
    const result=compare(local,remote);assert.equal(result[1].kind,"different",category);
    assert.ok(result[1].categories.includes(category));assert.equal(result[0].kind,"same");assert.equal(result[2].kind,"same");
  }
});
await test("stable squad IDs and explicit gear slots survive reordered arrays",()=>{
  const left=squads(),right=clone(left).reverse();
  right[2].heroes[0].gear="slot=1;count=1;level=40;rarity=red;slot=0;count=1;level=0;rarity=orange";
  assert.deepEqual(compare(left,right).map(x=>x.kind),["same","same","same","empty"]);
});
await test("hero slot order is never sorted or reassigned",()=>{
  const left=squads(),right=squads();right[0].heroes.reverse();right[0].confirmed_composition.reverse();
  assert.ok(compare(left,right)[0].categories.includes("composition"));
});
await test("Skyler/Schuyler and DVA/D.V.A aliases do not become false identity differences",()=>{
  const left=squads(),right=squads();right[1].heroes[0].name="D.V.A";right[1].heroes[4].name="Skyler";
  right[1].confirmed_composition[0]="D.V.A";right[1].confirmed_composition[4]="Skyler";
  assert.equal(compare(left,right)[1].kind,"same");
});
await test("a normalized total and its explicit millions representation compare equally",()=>{
  const left=squads(),right=squads();right[0].power="44,43 M";
  assert.equal(compare(left,right)[0].kind,"same");
});
await test("explicit zero and missing are different, including gear level zero",()=>{
  const left=squads(),right=squads();left[0].heroes[0].exclusive=0;right[0].heroes[0].exclusive=null;
  assert.deepEqual(compare(left,right)[0].categories,["weapons"]);
  right[0].heroes[0].exclusive=0;assert.equal(compare(left,right)[0].kind,"same");
  right[0].heroes[0].gear="slot=0;count=1;rarity=orange;slot=1;count=1;level=40;rarity=red";
  assert.deepEqual(compare(left,right)[0].categories,["gear"]);
});
await test("unreadable differs from missing and zero without inventing a value",()=>{
  const local=squads(),remote=squads();local[0].heroes[0].exclusive="illisible";remote[0].heroes[0].exclusive=0;
  assert.equal(compare(local,remote)[0].kind,"partial");
  local[0].heroes[0].gear=null;remote[0].heroes[0].gear=null;local[0].heroes[0].exclusive=null;
  assert.equal(compare(local,remote)[0].kind,"different");
});
await test("explicit unreadable field status prevents a false equality",()=>{
  const local=squads(),remote=squads();local[0].heroes[0].field_status={level:"unreadable"};
  assert.equal(compare(local,remote)[0].kind,"partial");
});
await test("known differences remain visible alongside indeterminate categories",()=>{
  const local=squads(),remote=squads();local[0].heroes[0].name="not-a-hero";remote[0].power=42;
  const row=compare(local,remote)[0];assert.equal(row.kind,"different");assert.equal(row.incomplete,true);
  assert.deepEqual(row.categories,["power"]);
});
await test("duplicate IDs, excessive slots, missing projection and unknown object shapes are indeterminate",()=>{
  const left=squads(),right=squads();right.push(clone(right[0]));
  assert.equal(compare(left,right)[0].kind,"unknown");
  const bad=squads();bad[0].heroes.push({name:"Mason"});assert.equal(compare(left,bad)[0].kind,"partial");
  assert.equal(compare(left,null)[0].kind,"unknown");
  bad[0].heroes.pop();bad[0].heroes[0].awakening={capture:"private"};assert.equal(compare(left,bad)[0].kind,"partial");
});
await test("unassignable IDs and malformed hero records never compare as empty",()=>{
  for(const [right,reason] of [[[{id:5,heroes:[{name:"Murphy"}]}],"invalid_squad_id"],[[{id:1,heroes:["bad"]}],"legacy_shape_unsupported"]]){
    assert.ok(compare([],right)[0].issues.some(issue=>issue.reason===reason));
  }
});
await test("contradictory identity confirmation and an explicitly unreadable name remain indeterminate",()=>{
  const local=squads(),remote=squads();local[0].heroes[0].name="Mason";
  assert.equal(compare(local,remote)[0].kind,"partial");
  local[0].heroes[0].name="Murphy";local[0].heroes[0].field_status={name:"unreadable"};
  assert.equal(compare(local,remote)[0].kind,"partial");
});
await test("dates unrelated to confirmation and stored conflict history do not create gameplay differences",()=>{
  const left=squads(),right=squads();right[0].updated_at="2026-10-15T10:00:00.000Z";
  left[0].composition_conflict={...marker,identity_history:[{heroes:[{name:"old-hero"}]}]};
  assert.equal(compare(left,right)[0].kind,"marker");
});
await test("legacy composition is never promoted or used to populate an empty slot",()=>{
  const left=squads(),right=squads();left[0].composition_source="legacy_backfill";right[0].composition_source="legacy_backfill";
  left[0].heroes[0].name="";right[0].heroes[0].name="";
  const projected=projectSquads(left);assert.equal(projected.rows[0].categories.confirmation.composition.kind,"missing");
  assert.equal(projected.rows[0].categories.composition[0].kind,"missing");assert.equal(compare(left,right)[0].kind,"partial");
});
await test("explicit clearing is compared as evidence, not executed",()=>{
  const left=[{id:4,composition_source:"explicit_swap_empty",composition_changed_at:at,heroes:[]}];
  const original=JSON.stringify(left);
  assert.equal(compare(left,[])[3].kind,"different");assert.equal(JSON.stringify(left),original);
});
await test("projection is side-effect-free and excludes private history, captures and profile fields",()=>{
  const local=profile();local.squads[0].heroes[0].capture="PRIVATE_CAPTURE";
  local.squads[0].composition_conflict={...marker,identity_history:[{name:"PRIVATE_HISTORY"}]};
  local.email="PRIVATE_EMAIL";const before=JSON.stringify(local);freeze(local);
  const projected=projectSquads(local.squads),summary=compareSquadProjections(projected,projected);
  assert.equal(JSON.stringify(local),before);
  assert.doesNotMatch(JSON.stringify(projected),/PRIVATE_|player_id|email|capture|identity_history/);
  assert.doesNotMatch(JSON.stringify(summary),/Murphy|Kimberly|155|44.43|fixture-owner/);
});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const reply=(raw=squads())=>({response:{ok:true,status:200},json:{ok:true,read_only:true,
  profile_present:true,revision:at,checked_at:at,squads:projectSquads(raw)}});
function fixture(request){
  let ctx={owner:"fixture-owner",session:"session-a",revision:at,allowed:true,local:profile()},calls=0,changes=0;
  const controller=createSquadComparison({context:()=>ctx,request:()=>{calls++;return request()},onChange:()=>{changes++}});
  return {controller,get ctx(){return ctx},set ctx(value){ctx=value},get calls(){return calls},get changes(){return changes}};
}
await test("constructing and rendering comparison state never starts a request",()=>{
  const f=fixture(()=>Promise.resolve(reply()));f.controller.view();f.controller.view();assert.equal(f.calls,0);
});
await test("one explicit click is one read, including double click while pending",async()=>{
  const d=deferred(),f=fixture(()=>d.promise),before=JSON.stringify(f.ctx);
  const running=f.controller.run();assert.equal(f.controller.view().kind,"busy");await f.controller.run();assert.equal(f.calls,1);
  d.resolve(reply());await running;assert.equal(f.controller.view().kind,"result");assert.equal(JSON.stringify(f.ctx),before);
});
for(const change of ["session","owner","revision","local","allowed"]){
  await test(`change of ${change} during the request invalidates the result`,async()=>{
    const d=deferred(),f=fixture(()=>d.promise),running=f.controller.run();
    if(change==="local")f.ctx.local.squads[0].heroes[0].level=154;
    else f.ctx={...f.ctx,[change]:change==="allowed"?false:"changed"};
    d.resolve(reply());await running;assert.equal(f.controller.view().kind,"stale");
  });
}
await test("a later local change invalidates an already displayed result",async()=>{
  const f=fixture(()=>Promise.resolve(reply()));await f.controller.run();f.ctx.local.sync.pending_cloud_save=false;
  assert.equal(f.controller.view().kind,"stale");
});
await test("an old session reply cannot replace a later comparison in reverse response order",async()=>{
  const first=deferred(),second=deferred();let n=0;const f=fixture(()=>++n===1?first.promise:second.promise);
  const a=f.controller.run();f.ctx={...f.ctx,session:"session-b"};const b=f.controller.run();
  second.resolve(reply());await b;const view=clone(f.controller.view());first.resolve(reply([]));await a;
  assert.deepEqual(f.controller.view(),view);
});
await test("cross-account local data never starts a cloud comparison",async()=>{
  const f=fixture(()=>Promise.resolve(reply()));f.ctx.local.player_id="another-owner";await f.controller.run();assert.equal(f.calls,0);
});
for(const [status,error,reason] of [[401,"AUTH_INVALID","auth"],[428,"BETA_CONSENT_REQUIRED","consent"],
  [403,"database_permissions_missing","forbidden"],[409,"profile_write_conflict","conflict"],
  [503,"database_permissions_missing","forbidden"],[503,"unknown","server"],[504,"squad_compare_timeout","timeout"]]){
  await test(`HTTP ${status}/${error} remains a safe comparison error, not a save`,async()=>{
    const f=fixture(()=>Promise.resolve({response:{ok:false,status},json:{error,message:"PRIVATE_SQL"}}));
    const before=JSON.stringify(f.ctx.local);await f.controller.run();
    assert.equal(f.controller.view().reason,reason);assert.equal(JSON.stringify(f.ctx.local),before);
    assert.doesNotMatch(JSON.stringify(f.controller.view()),/PRIVATE_SQL/);
  });
}
await test("network failure, timeout and invalid response are non-mutating and retryable by explicit click",async()=>{
  for(const error of [Object.assign(new Error("PRIVATE"),{name:"AbortError"}),new TypeError("PRIVATE")]){
    const f=fixture(()=>Promise.reject(error));await f.controller.run();
    assert.ok(["timeout","network"].includes(f.controller.view().reason));
  }
  const f=fixture(()=>Promise.resolve({response:{ok:true},json:{state:"PRIVATE"}}));await f.controller.run();
  assert.equal(f.controller.view().reason,"unconfirmed");
});
await test("no readable cloud row is indeterminate for all four, never assumed empty",async()=>{
  const r=reply();r.json.profile_present=false;r.json.revision=null;
  const f=fixture(()=>Promise.resolve(r));await f.controller.run();
  assert.deepEqual(f.controller.view().rows.map(row=>row.kind),["unknown","unknown","unknown","unknown"]);
});
await test("all 22 languages and 23 locales resolve every comparison label and category",()=>{
  for(const code of Object.keys(ACCOUNT_SYNC_COPY)){
    const copy=squadComparisonCopy(code.startsWith("en-")?"en":code),t=translator(code);
    assert.equal(Object.keys(copy).length,51);
    for(const [key,value] of Object.entries(copy)){
      const params={date:"DATE",categories:"CATEGORIES",reason:"REASON",count:2,same:3,different:1,unknown:4,slot:2,piece:2};
      assert.ok(value?.trim());assert.equal(t(key,params),
        value.replace(/\{(\w+)\}/g,(match,token)=>params[token]??match));labels++;
    }
  }
});
await test("localized output shows only numbers, safe categories and a read timestamp",()=>{
  const t=translator("fr"),rows=compare(squads(),[]);
  const html=squadComparisonHtml({kind:"result",at,rows},t,()=>"DATE");
  assert.match(html,/DATE.*aucune sauvegarde/);assert.match(html,/Escouade 4/);
  assert.doesNotMatch(html,/Murphy|155|44.43|fixture-owner/);
  assert.match(squadComparisonHtml({kind:"stale"},t),/périmé/);
});

// Actual API + actual Supabase getter, fixture-only transport. These assignments
// affect this test process only; no workspace secret is read or changed.
Object.assign(process.env,{SUPABASE_URL:"https://squad-compare-fixture.invalid",
  SUPABASE_ANON_KEY:"fixture-anon",SUPABASE_SERVICE_ROLE_KEY:"fixture-service"});
let scenario={},requests=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input)),method=init.method||"GET";
  assert.equal(url.origin,"https://squad-compare-fixture.invalid");assert.equal(method,"GET","absolutely no write method allowed");
  requests.push({path:url.pathname,query:url.searchParams,headers:init.headers});
  if(url.pathname==="/auth/v1/user")return new Response(JSON.stringify(scenario.auth?{}:{id:"fixture-owner"}),{status:scenario.auth||200});
  assert.equal(url.pathname,"/rest/v1/wb1_profiles","no invitation, snapshot, RPC, roster or other access");
  assert.equal(url.searchParams.get("select"),"squads:state->squads,updated_at");
  assert.equal(url.searchParams.get("player_id"),"eq.fixture-owner");
  assert.equal(init.headers.authorization,"Bearer fixture-user-jwt","user token required, never service-role fallback");
  if(scenario.sql)return new Response(JSON.stringify({code:scenario.sql,message:"PRIVATE_SQL_DETAIL"}),{status:403});
  return new Response(JSON.stringify(scenario.absent?[]:[{squads:squads(),updated_at:at}]),{status:200});
};
function response(){
  return {headers:{},statusCode:200,setHeader(key,value){this.headers[key]=value},
    status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
}
async function invoke(extra={}){
  requests=[];const res=response();
  await api({method:"GET",query:{action:"squad_compare"},headers:{authorization:"Bearer fixture-user-jwt",
    "x-warboost-beta-consent":"2026-09-23-v1"},...extra},res);return res;
}
// Use the actual public consent constant, not a guessed version.
const {BETA_CONSENT_VERSION}=await import("../lib/beta-access.js");
const consentHeaders={authorization:"Bearer fixture-user-jwt","x-warboost-beta-consent":BETA_CONSENT_VERSION};
try{
  await test("actual API dispatch performs exactly auth GET + one own-row RLS SELECT",async()=>{
    scenario={};const res=await invoke({headers:consentHeaders});
    assert.equal(res.statusCode,200);assert.equal(res.body.read_only,true);assert.equal(requests.length,2);
    assert.equal(res.headers["Cache-Control"],"no-store");assert.equal(res.headers.Vary,"Authorization");
    assert.equal(res.body.squads.rows.length,4);assert.equal(res.body.revision,at);
    assert.doesNotMatch(JSON.stringify(res.body),/fixture-owner|fixture-user-jwt/);
  });
  await test("missing session and a rejected fake JWT cannot read a profile",async()=>{
    const missing=await invoke({headers:{}});assert.equal(missing.statusCode,401);assert.equal(requests.length,0);
    scenario={auth:401};const invalid=await invoke({headers:consentHeaders});assert.equal(invalid.statusCode,401);assert.equal(requests.length,1);
  });
  await test("missing consent refuses before the profile SELECT",async()=>{
    scenario={};const res=await invoke({headers:{authorization:consentHeaders.authorization}});
    assert.equal(res.statusCode,428);assert.equal(requests.length,1);
  });
  await test("POST and account/restore override parameters are rejected without upstream calls",async()=>{
    scenario={};for(const extra of [{method:"POST"},{query:{action:"squad_compare",player_id:"other"}},
      {query:{action:"squad_compare",identity:"1"}},{query:{action:"squad_compare",restore:"1"}}]){
      const res=await invoke(extra);assert.ok([400,405].includes(res.statusCode));assert.equal(requests.length,0);
    }
  });
  await test("actual SQL 42501 remains forbidden without public SQL detail or retries",async()=>{
    scenario={sql:"42501"};const res=await invoke({headers:consentHeaders});
    assert.equal(res.statusCode,403);assert.equal(res.body.error,"database_permissions_missing");
    assert.doesNotMatch(JSON.stringify(res.body),/PRIVATE/);assert.equal(requests.length,2);
  });
  await test("a row hidden by RLS or absent remains unknown without fallback or insertion",async()=>{
    scenario={absent:true};const res=await invoke({headers:consentHeaders});
    assert.equal(res.body.profile_present,false);assert.equal(res.body.revision,null);assert.equal(requests.length,2);
  });
}finally{globalThis.fetch=originalFetch;}

await test("real button wiring and API dispatch contain no implicit restoration, persistence or render-triggered request",()=>{
  const app=fs.readFileSync("app.js","utf8"),source=fs.readFileSync("api/state.js","utf8");
  const controller=app.slice(app.indexOf("const squadReadContext="),app.indexOf("async function checkAccountCloudStatus"));
  assert.match(controller,/action=squad_compare/);assert.match(controller,/method:"GET",cache:"no-store"/);
  assert.match(controller,/button\.addEventListener\("click",\(\)=>\{gearRepairPreview\.close\(\);return squadComparison\.run\(\);\}\)/);
  assert.match(controller,/context:squadReadContext,request:readOwnSquadsForPreview/);
  assert.doesNotMatch(controller,/saveState\(|pushServerState\(|applyServerState|reconcileCloudSquads|cloudRevision\s*=/);
  const branch=source.indexOf('if(req.query?.action==="squad_compare")');
  assert.ok(branch>0&&branch<source.indexOf('if(String(req.query?.identity'));
  assert.match(app,/analysisIndicator.has\("sync:compare"\)\?\[\]/,"network loader does not duplicate the button W");
});
await test("mobile button wraps, uses a live result region and shares the inline W lifecycle",()=>{
  const app=fs.readFileSync("app.js","utf8"),css=fs.readFileSync("squad-review-status.css","utf8");
  assert.match(css,/#squadCompareBtn\{[^}]*width:100%[^}]*white-space:normal/);
  assert.match(app,/result.setAttribute\("aria-live","polite"\)/);
  assert.match(app,/kind:"sync:compare"/);assert.match(app,/squadCompareLoading.finish\(\)/);
});
await test("actual UI click disables immediately, starts one inline loader and renders a safe result without saving",async()=>{
  const app=fs.readFileSync("app.js","utf8"),start=app.indexOf("function renderSquadComparisonControls(");
  const source=app.slice(start,app.indexOf("\nfunction renderAccountSquadReviewDiagnostic",start));
  const nodes=new Map();let loads=0,finishes=0,network=0,d=deferred();
  const element=()=>({attrs:{},listeners:{},setAttribute(key,value){this.attrs[key]=value},
    addEventListener(key,fn){this.listeners[key]=fn},
    append(...children){children.forEach(child=>nodes.set(child.id,child))}});
  nodes.set("squadCompareControls",element());
  let own={owner:"fixture-owner",session:"fixture-session",revision:at,allowed:true,local:profile()};
  let context;
  const controller=createSquadComparison({context:()=>own,request:()=>{network++;return d.promise},
    onChange:()=>context.renderSquadComparisonControls()});
  context=vm.createContext({squadCompareLoading:null,squadComparison:controller,
    gearRepairPreview:{close(){}},renderGearRepairControls(){},
    $:id=>nodes.get(id.slice(1)),document:{createElement:element},locale:"fr",t:translator("fr"),
    squadComparisonHtml,analysisIndicator:{},beginLoadingButton:(_indicator,button,options)=>{
      loads++;button.textContent=options.label();return ()=>{finishes++;button.textContent=options.idleLabel()};
    }});
  vm.runInContext(source,context);context.renderSquadComparisonControls();
  assert.equal(network,0);const button=nodes.get("squadCompareBtn");
  const before=JSON.stringify(own.local),running=button.listeners.click();
  assert.equal(button.disabled,true);assert.equal(loads,1);assert.match(button.textContent,/cours/);
  await button.listeners.click();assert.equal(network,1);
  d.resolve(reply());await running;
  assert.equal(button.disabled,false);assert.equal(finishes,1);
  const result=nodes.get("squadCompareResult");assert.equal(result.attrs["aria-live"],"polite");
  assert.match(result.innerHTML,/aucune sauvegarde/);assert.equal(JSON.stringify(own.local),before);
  d=deferred();const retry=button.listeners.click();d.reject(Object.assign(new Error("timeout"),{name:"AbortError"}));await retry;
  assert.equal(button.disabled,false);assert.equal(loads,2);assert.equal(finishes,2);assert.match(result.innerHTML,/Comparaison impossible/);
  own={...own,revision:"changed"};context.renderSquadComparisonControls();assert.match(result.innerHTML,/périmé/);
});
await test("raw confirmation names outside the roster remain unknown rather than being shipped as valid evidence",()=>{
  const data=squads();data[0].confirmed_composition=["PRIVATE_A","PRIVATE_B","PRIVATE_C","PRIVATE_D","PRIVATE_E"];
  const projection=projectSquads(data);
  assert.doesNotMatch(JSON.stringify(projection),/PRIVATE_/);
  assert.equal(compareSquadProjections(projection,projection)[0].kind,"partial");
});
console.log(`PASS squad comparison: ${groups} groups, ${labels} localized entries; actual API/RLS transport mocked, no real cloud, no writes.`);
