import assert from "node:assert/strict";
import {projectComparisonGear as gear} from "../lib/squad-comparison-gear.js";
import {parseGear} from "../lib/gear.js";
import {projectSquads,compareSquadProjections} from "../lib/squad-comparison.js";
import {cleanGearString,normalizeState as normalize} from "../lib/normalize.js";
import {squadComparisonCopy} from "../lib/squad-comparison-copy.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";
import {translator} from "../i18n.js";
import {confirmedSquad,clone} from "./fixtures/squad-comparison.mjs";
let groups=0,localized=0;
const test=(name,fn)=>{fn();groups++;console.log("PASS "+name)};
const full=Array.from({length:4},(_,slot)=>`slot=${slot};count=1;level=40;rarity=orange`).join("|");
const partial=full.slice(0,120);
const compare=(left,right)=>compareSquadProjections(projectSquads(left),projectSquads(right));
const field=(row,slot=1)=>row.fields.find(f=>f.category==="gear"&&f.slot===slot);
test("null undefined and empty are absent, not zero or unreadable",()=>{
  for(const x of [null,undefined,"","  "])assert.equal(gear(x).kind,"missing");
  for(const x of [0,"0",{},[],false])assert.notEqual(gear(x).kind,"missing");
});
test("explicit level zero is recognized in historical and bounded structured forms",()=>{
  for(const x of ["level=0","Lv.0",{level:0},JSON.stringify({level:0})]){
    assert.equal(gear(x).value.levelOnly,0);assert.equal(gear(x).kind,"value");
  }
  assert.equal(gear(0).reason,"gear_number_ambiguous");
});
test("known historic formats compare to canonical values without schema guessing",()=>{
  for(const x of ["4 gear items, Lv. 40, orange rarity","count=4;level=40;rarity=orange"]){
    assert.deepEqual(gear(x).value,gear("count=4;level=40;rarity=orange").value);
    assert.equal(gear(x).diagnostic.format,"legacy_known");
  }
});
test("parseGear stable output object and encoded JSON are accepted exactly",()=>{
  const obj=parseGear(full);
  for(const x of [obj,JSON.stringify(obj)])assert.deepEqual(gear(x).value,gear(full).value);
  assert.equal(gear(obj).diagnostic.format,"object_compatible");
  assert.equal(gear(JSON.stringify(obj)).diagnostic.format,"json_compatible");
});
test("arrays and unknown equipment objects are never assigned positional meaning",()=>{
  for(const x of [[0,40,40,40],{weapon:2,armor:2},{pieces:[{slot:0,level:40}]},{slots:[40,40,40,40]}]){
    assert.equal(gear(x).reason,"gear_format_unsupported");
    assert.equal(gear(JSON.stringify(x)).reason,"gear_format_unsupported");
  }
});
test("structured legacy level is a level only, never four pieces",()=>{
  assert.equal(gear({level:40}).layout,"level_only");
  assert.equal(gear({level:40}).value.segments.length,0);
  for(const x of [{level:"0"},{level:null},{level:-1},{level:40,unknown:1}])
    assert.equal(gear(x).kind,"unreadable");
});
test("invalid JSON and unreadable statuses have distinct stable reasons",()=>{
  assert.equal(gear('{"level":').reason,"gear_json_invalid");
  for(const x of ["Non détecté","unknown","?"])assert.equal(gear(x).reason,"value_unreadable");
  assert.equal(gear(full,"unreadable").reason,"value_unreadable");
});
test("invalid canonical segments are not silently discarded",()=>{
  for(const x of ["count=1;level=40|count=0;level=40","count=1;level=40|count=1;level=999",
    "count=4;levels=40,40","count=1;level=40;rarity=invented","4 gear items, Lv. 40, invented rarity","count=4;levels=40,nope",
    "slot=0;count=1;level=40|count=1;level=40"]){
    assert.equal(gear(x).kind,"unreadable",x);
  }
});
test("complete four-piece encoding exceeds 120 and truncated prefix stays incomplete",()=>{
  assert.ok(full.length>120);assert.equal(gear(full).value.segments.length,4);
  const x=gear(partial);assert.equal(x.incomplete,true);
  assert.equal(x.value.segments.length,3);assert.equal(x.diagnostic.format,"text_partial");
});
test("a malformed inner piece or duplicate slot blocks safe partial extraction",()=>{
  for(const x of ["slot=0;count=1;level=40|broken|slot=2;count=1",
    "slot=0;count=1;level=40|slot=0;lev","junk|slot=1;level"]){
    assert.equal(gear(x).kind,"unreadable");
  }
});
test("complete pieces remain comparable but partial equipment is not globally identical",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[0].gear=full;b[0].heroes[0].gear=partial;
  const r=compare(a,b)[0],f=field(r);
  assert.equal(f.state,"unknown");assert.equal(f.confirmed,false);assert.equal(f.pieces.length,6);
  assert.ok(f.pieces.every(p=>p.state==="same"));assert.notEqual(r.kind,"same");
  assert.ok(r.issues.some(x=>x.reason==="gear_text_partial"&&x.side==="cloud"&&x.slot===1));
});
test("a certain difference on a readable piece coexists with unknown remaining equipment",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[0].gear=full;
  b[0].heroes[0].gear=partial.replace("level=40","level=0");
  const r=compare(a,b)[0],f=field(r);assert.equal(f.state,"different");
  assert.equal(f.confirmed,false);assert.ok(f.pieces.some(p=>p.piece===1&&p.state==="different"));
  assert.ok(r.issues.some(x=>x.reason==="gear_text_partial"));
});
test("missing piece attributes do not become level zero or fabricated rarity",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[0].gear="slot=0;count=1|slot=1;lev";
  b[0].heroes[0].gear=full;assert.equal(field(compare(a,b)[0]).pieces.length,0);
});
test("all four squads and five heroes retain independent shape diagnostics",()=>{
  const a=[1,2,3,4].map(confirmedSquad),b=clone(a);
  b[0].heroes.forEach(h=>h.gear={level:40});b[1].heroes[2].gear=0;
  b[2].heroes[4].gear={unknown:true};b[3].heroes[1].gear=partial;
  const before=JSON.stringify([a,b]),r=compare(a,b);
  assert.equal(field(r[0]).formats.cloud.inputType,"object");
  assert.ok(r[1].issues.some(x=>x.slot===3&&x.reason==="gear_number_ambiguous"));
  assert.ok(r[2].issues.some(x=>x.slot===5&&x.reason==="gear_format_unsupported"));
  assert.ok(r[3].issues.some(x=>x.slot===2&&x.reason==="gear_text_partial"));
  assert.equal(JSON.stringify([a,b]),before);
});
test("power and weapons equality never creates missing confirmation proof",()=>{
  const a=[confirmedSquad()];for(const h of a[0].heroes){
    delete h.field_source.power;delete h.field_updated_at.power;
    delete h.field_source.exclusive;delete h.field_updated_at.exclusive;
  }
  const r=compare(a,a)[0];
  for(const f of r.fields.filter(f=>f.slot&&["power","weapons"].includes(f.category))){
    assert.equal(f.state,"same");assert.equal(f.confirmed,false);
  }
});
test("diagnostics and partial result never expose equipment values or names",()=>{
  const a=[confirmedSquad()],b=clone(a);b[0].heroes[0].gear=partial;
  const result=JSON.stringify(compare(a,b));assert.doesNotMatch(result,/orange|Murphy|Kimberly|level=40/);
});
test("complete encodings survive bounded future normalization without serialization changes",()=>{
  assert.equal(cleanGearString(full),full);
  for(const old of ["level=0","count=4;level=40;rarity=orange",partial,"Non détecté","old"]){
    assert.equal(cleanGearString(old),String(old).trim().slice(0,120)||null);
  }
});
test("payload remains bounded for unsupported data, objects and oversized strings",()=>{
  for(const raw of ["x".repeat(3000),full.repeat(100),{value:"x".repeat(3000)}])
    assert.ok((cleanGearString(raw)||"").length<=120);
  assert.equal(gear("x".repeat(2049)).kind,"unreadable");
});
test("normalization retains new gear for all four squads and hero profiles",()=>{
  const input={squads:[1,2,3,4].map(confirmedSquad),hero_profiles:[{hero_name:"Murphy",gear:full}]};
  input.squads.forEach(q=>q.heroes.forEach(h=>h.gear=full));
  const before=JSON.stringify(input),out=normalize(input);
  for(const q of out.squads)for(const h of q.heroes)assert.equal(h.gear,full);
  assert.equal(out.hero_profiles[0].gear,full);
  assert.equal(JSON.stringify(input),before);
});
test("22 languages and 23 locales resolve new gear labels with real translator",()=>{
  for(const code of Object.keys(ACCOUNT_SYNC_COPY)){
    const t=translator(code),copy=squadComparisonCopy(code==="enUS"||code==="enGB"?"en":code);
    for(const key of ["format","piece","partial"]){
      const name="squad_compare_gear_"+key;
      assert.ok(copy[name]);assert.notEqual(t(name,{piece:2}),name);
      assert.doesNotMatch(t(name,{piece:2}),/\{piece\}/);localized++;
    }
  }
});
console.log(`PASS equipment comparison: ${groups} groups; ${localized} localized labels; synthetic data only, no requests or writes.`);
