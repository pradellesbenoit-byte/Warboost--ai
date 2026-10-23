import assert from "node:assert/strict";
import fs from "node:fs";
import {projectSquads,compareSquadProjections,SQUAD_COMPARE_SCHEMA} from "../lib/squad-comparison.js";
import {COMPARISON_REASONS} from "../lib/squad-comparison-project.js";
import {squadComparisonHtml} from "../lib/squad-comparison-view.js";
import {squadComparisonCopy} from "../lib/squad-comparison-copy.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";
import {HERO_CATALOG} from "../lib/heroes.js";
import {translator} from "../i18n.js";
import {at,clone,confirmedSquad,fixtureProfile} from "./fixtures/squad-comparison.mjs";
let groups=0,localized=0;
const test=(label,fn)=>{fn();groups++;console.log("PASS "+label)};
const compare=(a,b=a)=>compareSquadProjections(projectSquads(a),projectSquads(b));
const row=(a,b=a)=>compare(a,b)[0];
const field=(result,category,slot)=>result.fields.find(item=>item.category===category&&item.slot===slot);
const reason=(result,code,category,slot,side)=>result.issues.some(item=>item.reason===code&&
  (category===undefined||item.category===category)&&(slot===undefined||item.slot===slot)&&(side===undefined||item.side===side));
const freeze=value=>{if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
test("three real-report-like partial squads preserve useful fields and explicitly empty four",()=>{
  const a=[1,2,3].map(confirmedSquad);
  a[0].heroes[1].gear="Non détecté";a[1].heroes[1].awakening={legacy_shape:true};a[2].heroes[1].name="Non détecté";
  const results=compare(a);assert.deepEqual(results.map(item=>item.kind),["partial","partial","partial","empty"]);
  assert.ok(results.every((item,i)=>i===3||item.counts.confirmedSame>0));
  assert.ok(reason(results[0],"value_unreadable","gear",2));
  assert.ok(reason(results[1],"legacy_shape_unsupported","awakening",2));
  assert.ok(reason(results[2],"value_unreadable","composition",2));
});
test("one unreadable equipment field no longer hides other confirmed comparisons",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].gear="Non détecté";const result=row(a);
  assert.equal(result.counts.confirmedSame,36);assert.equal(result.counts.unknown,1);assert.equal(result.counts.different,0);
  assert.equal(field(result,"levels",2).state,"same");assert.equal(field(result,"levels",2).confirmed,true);
});
test("non-parseable legacy equipment has a stable format reason and retains total power comparison",()=>{
  for(const gear of ["ancien équipement sans syntaxe",{slots:[40,40,40,40]},0]){
    const a=[confirmedSquad()];a[0].heroes[1].gear=gear;
    assert.ok(reason(row(a),typeof gear==="number"?"gear_number_ambiguous":
      typeof gear==="string"?"gear_text_invalid":"gear_format_unsupported","gear",2));
    assert.equal(field(row(a),"power",null).state,"same");
  }
});
test("supported legacy equipment and canonical equivalent normalize only in temporary copies",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[0].gear="4 gear items, Lv. 40, orange rarity";
  b[0].heroes[0].gear="count=4;level=40;rarity=orange";const before=JSON.stringify(a);
  assert.equal(field(row(a,b),"gear",1).state,"same");assert.equal(JSON.stringify(a),before);
});
test("grouped and slotted equipment cannot create a false definite difference",()=>{
  const a=[confirmedSquad()],b=clone(a);b[0].heroes[1].gear="count=4;level=40;rarity=orange";
  const result=row(a,b);assert.equal(field(result,"gear",2).state,"unknown");
  assert.ok(reason(result,"gear_layout_mismatch","gear",2));assert.equal(result.counts.different,0);
});
test("incompatible Awakening object blocks only that hero field",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].awakening={version_old:1,reshape:[]};
  const result=row(a);assert.equal(result.kind,"partial");assert.equal(result.counts.unknown,1);
  assert.ok(reason(result,"legacy_shape_unsupported","awakening",2));
});
test("nested unreadable weapon bonus retains a specific category and hero slot",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].exclusive={level:16,bonuses:{hp:"illisible"}};
  assert.ok(reason(row(a),"value_unreadable","weapons",2));assert.equal(row(a).kind,"partial");
});
test("explicit numeric zero and false survive comparison as values",()=>{
  const a=[confirmedSquad()];for(const name of ["level","stars","power","exclusive"])a[0].heroes[1][name]=0;
  const result=row(a);for(const category of ["levels","stars","power","weapons"])assert.equal(field(result,category,2).state,"same");
  assert.equal(field(result,"awakening",2).state,"same");
});
test("known power unit formats compare without altering their stored representations",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[1].power="6,5 M";b[0].heroes[1].power=6_500_000;
  const original=JSON.stringify(a);assert.equal(field(row(a,b),"power",2).state,"same");
  assert.equal(JSON.stringify(a),original);
});
test("unsupported numeric field text is a format issue, not a definite value difference",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[1].level={legacy_level:155};
  const result=row(a,b);assert.equal(field(result,"levels",2).state,"unknown");
  assert.ok(reason(result,"legacy_shape_unsupported","levels",2,"local"));assert.equal(result.counts.different,0);
});
test("explicit zero versus absent is a stored difference, never unreadable or invented",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[1].exclusive=0;b[0].heroes[1].exclusive=null;
  const result=row(a,b);assert.equal(field(result,"weapons",2).state,"different");
  assert.ok(reason(result,"value_absent","weapons",2,"cloud"));assert.equal(result.kind,"different");
});
test("missing on both sides is not counted as a confirmed equal value",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].exclusive=null;
  const result=row(a);assert.equal(field(result,"weapons",2).state,"absent");assert.equal(field(result,"weapons",2).confirmed,false);
  assert.equal(result.counts.confirmedSame,36);assert.equal(result.counts.absent,1);
});
test("unreadable versus absent is indeterminate, not a definite difference",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[1].gear="Non détecté";b[0].heroes[1].gear=null;
  assert.equal(field(row(a,b),"gear",2).state,"unknown");assert.equal(row(a,b).counts.different,0);
});
test("unconfirmed legacy composition never certifies hero field associations",()=>{
  const a=[confirmedSquad()];a[0].composition_source="legacy_backfill";
  const result=row(a);assert.equal(result.kind,"partial");assert.ok(reason(result,"confirmation_missing"));
  assert.equal(field(result,"levels",2).state,"same");assert.equal(field(result,"levels",2).confirmed,false);
  assert.equal(projectSquads(a).rows[0].categories.confirmation.composition.kind,"missing");
});
test("envelope dates and source labels alone cannot promote a field to confirmed",()=>{
  const a=[confirmedSquad()];delete a[0].heroes[1].field_updated_at.level;
  a[0].heroes[1].updated_at=at;a[0].heroes[1].source="confirmed_scan";
  const result=row(a);assert.equal(field(result,"levels",2).confirmed,false);
  assert.ok(reason(result,"field_confirmation_missing","levels",2));assert.equal(result.kind,"partial");
});
test("pending field status cannot be hidden by older positive provenance",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].field_status={level:"needs_confirmation"};
  assert.equal(field(row(a),"levels",2).confirmed,false);
});
test("pending or composition-stale total power is comparable but not certified current",()=>{
  for(const change of [s=>s.power_sync_status="pending",s=>s.composition_changed_at="2026-10-15T10:00:00.000Z"]){
    const a=[confirmedSquad()];change(a[0]);const result=row(a);
    assert.equal(field(result,"power",null).state,"same");assert.equal(field(result,"power",null).confirmed,false);
  }
});
test("explicit old manual labels remain unverified without erasing their values",()=>{
  const a=[confirmedSquad()];a[0].composition_source="manual_confirmation";
  a[0].heroes[1].field_source.level="legacy";
  assert.equal(row(a).kind,"partial");assert.equal(field(row(a),"levels",2).state,"same");
});
test("conflicting saved identity blocks only the affected slot, not the whole squad",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].name="Mason";const result=row(a);
  assert.ok(reason(result,"confirmation_identity_mismatch","composition",2));
  assert.ok(reason(result,"confirmation_identity_mismatch","gear",2));
  assert.equal(field(result,"composition",2).state,"unknown");
  assert.equal(field(result,"levels",1).confirmed,true);assert.equal(result.kind,"partial");
});
test("duplicate hero identities including aliases are reported at both slots",()=>{
  const a=[confirmedSquad(2)];a[0].id=1;a[0].heroes[0].name="Skyler";a[0].heroes[1].name="Schuyler";
  const result=row(a);assert.ok(reason(result,"duplicate_hero","composition",1));
  assert.ok(reason(result,"duplicate_hero","composition",2));assert.equal(field(result,"levels",2).state,"unknown");
});
test("different known heroes do not turn per-hero statistics into false definite differences",()=>{
  const a=[confirmedSquad()],b=clone(a);b[0].heroes[1].name="Mason";b[0].confirmed_composition[1]="Mason";b[0].heroes[1].level=100;
  const result=row(a,b);assert.equal(field(result,"composition",2).state,"different");
  assert.equal(field(result,"levels",2).state,"unknown");assert.ok(reason(result,"hero_identity_mismatch","levels",2));
});
test("malformed hero array preserves the independently comparable total",()=>{
  const a=[confirmedSquad()];a[0].heroes={legacy:true};const result=row(a);
  assert.equal(result.kind,"partial");assert.equal(field(result,"power",null).confirmed,true);
  assert.ok(reason(result,"heroes_structure_unsupported","levels",2));
});
test("a malformed individual legacy hero does not contaminate other slots",()=>{
  const a=[confirmedSquad()];a[0].heroes[1]="PRIVATE_LEGACY_STRING";const result=row(a);
  assert.ok(reason(result,"legacy_shape_unsupported","composition",2));
  assert.equal(field(result,"gear",1).state,"same");assert.doesNotMatch(JSON.stringify(projectSquads(a)),/PRIVATE/);
});
test("duplicate squad IDs refuse comparison for that number without choosing a winner",()=>{
  const a=[1,2,3].map(confirmedSquad);a.push(clone(a[0]));const results=compare(a);
  assert.equal(results[0].kind,"unknown");assert.ok(reason(results[0],"duplicate_squad_id"));
  assert.equal(results[1].kind,"same");assert.equal(results[2].kind,"same");
});
test("a fifth record duplicating one of four explicit squads does not hide the other three",()=>{
  const a=[1,2,3,4].map(confirmedSquad);a.push(clone(a[0]));
  const results=compare(a);assert.deepEqual(results.map(item=>item.kind),["unknown","same","same","same"]);
  assert.ok(reason(results[0],"duplicate_squad_id"));
});
test("malformed explicit confirmation is distinguishable from absent confirmation",()=>{
  for(const mutate of [s=>s.composition_confirmed_at="not-a-date",
    s=>s.confirmed_composition[1]=s.confirmed_composition[0]]){
    const a=[confirmedSquad()];mutate(a[0]);const result=row(a);
    assert.equal(result.kind,"partial");assert.ok(reason(result,"confirmation_invalid","confirmation"));
    assert.ok(!reason(result,"confirmation_missing","confirmation"));
  }
});
test("legacy positional numbering is explicitly unvalidated, never silently migrated",()=>{
  const a=[1,2,3].map(confirmedSquad);a.forEach(s=>delete s.id);const before=JSON.stringify(a);
  assert.deepEqual(compare(a).map(item=>item.kind),["partial","partial","partial","empty"]);
  assert.ok(reason(row(a),"legacy_squad_number"));assert.equal(JSON.stringify(a),before);
});
test("mixed unnumbered and numbered entries cannot be arbitrarily assigned to an empty slot",()=>{
  const a=[confirmedSquad(2),{heroes:[{name:"Murphy"}]}];assert.equal(compare(a)[0].kind,"unknown");
  assert.ok(reason(compare(a)[0],"invalid_squad_id"));assert.notEqual(compare(a)[3].kind,"empty");
});
test("historical markers remain intact alongside partial evidence",()=>{
  const a=[confirmedSquad()];a[0].composition_conflict={reason:"squad_freshness_ambiguous",status:"needs_verification"};
  a[0].heroes[1].gear="Non détecté";const before=JSON.stringify(a),result=row(a);
  assert.equal(result.kind,"partial");assert.equal(result.marker,true);assert.equal(JSON.stringify(a),before);
});
test("a marker with all useful values proven equal is reported but never cleared",()=>{
  const a=[confirmedSquad()];a[0].composition_conflict={reason:"squad_freshness_ambiguous"};
  assert.equal(row(a).kind,"marker");assert.equal(a[0].composition_conflict.reason,"squad_freshness_ambiguous");
});
test("fourth empty squad and default empty hero containers never imply a saved formation",()=>{
  const a=[1,2,3].map(confirmedSquad),b=clone(a);
  b.push({id:4,heroes:Array.from({length:5},()=>({name:"",gear:null,awakening:{},exclusive:null}))});
  const fourth=compare(a,b)[3];assert.equal(fourth.kind,"empty");assert.equal(fourth.counts.same,0);
  assert.match(squadComparisonHtml({kind:"result",at,rows:[fourth]},translator("fr"),()=>"DATE"),/Aucune donnée des deux côtés/);
});
test("a valid explicit swap-to-empty on both sides is not a malformed identity proof",()=>{
  const a=[{id:1,heroes:[],composition_source:"explicit_swap",confirmed_composition:[],
    explicit_empty:true,empty_confirmed_at:at}];
  const result=row(a);assert.equal(result.kind,"empty");assert.equal(result.issues.length,0);
});
test("missing squad payload or cloud row is not evidence of an empty squad",()=>{
  assert.equal(compare([],null)[3].kind,"unknown");
  const p=projectSquads([]),r=compareSquadProjections(p,p,{available:false});
  assert.ok(reason(r[3],"cloud_data_unavailable"));assert.equal(r[3].kind,"unknown");
});
test("a real difference remains visible alongside an equipment format failure",()=>{
  const a=[confirmedSquad()],b=clone(a);a[0].heroes[1].gear="old format";b[0].heroes[2].level=154;
  const result=row(a,b);assert.equal(result.kind,"different");assert.deepEqual(result.categories,["levels"]);
  assert.equal(field(result,"levels",3).confirmed,true);assert.equal(result.incomplete,true);
  assert.ok(reason(result,"gear_text_invalid","gear",2,"local"));
});
test("old and new comparison protocol versions fail safely without implying equality",()=>{
  const p=projectSquads([confirmedSquad()]);const r=compareSquadProjections(p,{...p,schema:SQUAD_COMPARE_SCHEMA-1});
  assert.ok(r.every(item=>item.kind==="unknown"&&reason(item,"schema_unsupported")));
});
test("all 31 roster heroes stay eligible without giving any priority",()=>{
  for(const hero of HERO_CATALOG){
    const a=[confirmedSquad()],others=HERO_CATALOG.filter(name=>name!==hero).slice(0,4);
    a[0].confirmed_composition=[hero,...others];a[0].heroes.forEach((item,i)=>item.name=a[0].confirmed_composition[i]);
    assert.equal(row(a).kind,"same",hero);
  }
});
test("proof differences do not manufacture gameplay value differences",()=>{
  const a=[confirmedSquad()],b=clone(a);b[0].heroes[1].field_source.level="legacy";
  const result=row(a,b);assert.equal(result.counts.different,0);assert.equal(result.kind,"partial");
  assert.equal(field(result,"levels",2).state,"same");assert.equal(field(result,"levels",2).confirmed,false);
});
test("all projected result details are safe enums, counts and slot numbers",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].gear={capture:"PRIVATE_CAPTURE"};
  a[0].heroes[1].awakening={private_account:"PRIVATE_ID"};const result=row(a);
  assert.doesNotMatch(JSON.stringify(result),/Murphy|Kimberly|44.43|155|PRIVATE_|confirmed_scan/);
  for(const issue of result.issues){
    assert.ok(COMPARISON_REASONS.has(issue.reason));assert.ok(["local","cloud","both"].includes(issue.side));
    assert.ok(issue.slot===null||Number.isInteger(issue.slot)&&issue.slot>=1&&issue.slot<=5);
  }
});
test("frozen profiles, receipts, four squads, alliance and provenance remain byte-identical",()=>{
  const local=fixtureProfile(),cloud=clone(local);local.squads[0].heroes[1].gear="Non détecté";
  const beforeLocal=JSON.stringify(local),beforeCloud=JSON.stringify(cloud);freeze(local);freeze(cloud);
  compare(local.squads,cloud.squads);
  assert.equal(JSON.stringify(local),beforeLocal);assert.equal(JSON.stringify(cloud),beforeCloud);
});
test("localized partial details explain category, hero slot, side and stable reason without values",()=>{
  const a=[confirmedSquad()];a[0].heroes[1].gear="Non détecté";const rows=compare(a);
  for(const locale of Object.keys(ACCOUNT_SYNC_COPY)){
    const t=translator(locale),copy=squadComparisonCopy(locale.startsWith("en-")?"en":locale);
    const html=squadComparisonHtml({kind:"result",at,rows},t,()=>"DATE");
    assert.doesNotMatch(html,/squad_compare_|\{(?:count|slot|same|different|unknown)\}|Murphy|Kimberly|44.43|155|undefined/);
    assert.ok(html.includes(copy.squad_compare_partial));assert.ok(html.includes(copy.squad_compare_empty));
    assert.ok(html.includes("value_unreadable"));assert.ok(html.includes(t("squad_compare_slot",{slot:2})));
    localized+=Object.keys(copy).length;
  }
});
test("UI never says other values are confirmed when confirmation evidence is absent",()=>{
  const a=[confirmedSquad()];a[0].composition_source="legacy_backfill";delete a[0].field_source.power;
  const result=row(a);assert.equal(result.counts.confirmedSame,0);
  const html=squadComparisonHtml({kind:"result",at,rows:[result]},translator("fr"),()=>"DATE");
  assert.doesNotMatch(html,/Champs avec preuve de confirmation identiques/);
  assert.match(html,/sans confirmation attestée/);
});
test("partial comparison modules never import transport, writes, restore, or invoke a logger",()=>{
  for(const path of ["lib/squad-comparison-project.js","lib/squad-comparison-results.js","lib/squad-comparison-view.js"]){
    const code=fs.readFileSync(path,"utf8");
    assert.doesNotMatch(code,/\b(fetch|saveState|applyServerState|reconcileCloudSquads|pushServerState|setItem)\s*\(|console\./,path);
  }
  const app=fs.readFileSync("app.js","utf8"),start=app.indexOf("const squadReadContext=");
  const button=app.slice(start,app.indexOf("async function checkAccountCloudStatus",start));
  assert.match(button,/method:"GET",cache:"no-store",redirect:"error"/);
  assert.doesNotMatch(button,/cloudRevision\s*=|saveState\(|recordAccountSyncResult|pushServerState/);
});
console.log(`PASS partial squad comparison: ${groups} groups, ${localized} localized entries; synthetic legacy formats, no live data, no requests or writes.`);
