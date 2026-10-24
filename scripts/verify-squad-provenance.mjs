import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as identity from "../lib/squad-identity.js";
import {applyReviewedSquad} from "../lib/squad-scan-review.js";
import {confirmedSquadHints,squadEvidence} from "../lib/squad-scan-evidence.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {hydrateCloudState} from "../lib/cloud-state-recovery.js";
import {reconcileCloudSquads} from "../lib/squad-freshness.js";
import {mergeFreshRecord} from "../lib/field-freshness.js";
import {canonicalHeroName} from "../lib/heroes.js";
import {confirmedHeroPower,heroPowerIsConfirmed} from "../lib/hero-power.js";
import {canonicalPowerMillions} from "../lib/power-units.js";

const old="2026-09-01T00:00:00Z",now="2026-10-07T00:00:00Z",names=["Mason","Murphy","Violet","Kimberly","Monica"];
const real=["DVA","Carlie","Lucius","Morrison","Skyler"];
const clone=x=>JSON.parse(JSON.stringify(x));
const blank=id=>({id,heroes:Array.from({length:5},()=>({name:""}))});
const profile=squad=>({player_id:"fixture-owner",player:{name:"Fixture",role:"R5",hq_level:31},
  alliance:{role:"R5",members:[]},drone:{},vs:{},season:{},sync:{sources:{},pending_cloud_save:true},
  squads:[squad,blank(2),blank(3),blank(4)],hero_profiles:[],beta_grant:"preserved",pro_grant:"preserved"});
const legacy=profile({id:1,power:44.43,updated_at:old,heroes:names.map((name,i)=>({name,level:150,power:5000000+i,gear:"count=4;level=40"}))});
const trusted=profile({id:1,power:44.43,updated_at:old,composition_source:"explicit_confirmation",
  composition_confirmed_at:old,confirmed_composition:real,heroes:real.map(name=>({name,level:150,power:5000000}))});
let checks=0;
const test=(label,run)=>{run();checks++;console.log(`PASS ${label}`)};
const emptyNames=squad=>assert.ok(squad.heroes.every(h=>h.name===""));
const history=squad=>squad.composition_conflict?.identity_history||[];

test("Mason/Murphy/Violet/Kimberly/Monica are archived, not promoted by a partial scan",()=>{
  const before=JSON.stringify(legacy),result=applyReviewedSquad(legacy,{squadId:1,heroes:[{},{},{},{},{}],updatedAt:now,powerConfirmed:true});
  emptyNames(result.state.squads[0]);
  assert.equal(result.complete,false);assert.equal(result.pending.filter(p=>p.field==="name").length,5);
  assert.equal(result.state.squads[0].power,44.43);
  assert.equal(result.state.squads[0].composition_confirmed_at,null);
  assert.equal(identity.confirmedCompositionForSquad(result.state.squads[0]),null);
  assert.deepEqual(history(result.state.squads[0])[0].heroes,legacy.squads[0].heroes);
  assert.equal(JSON.stringify(legacy),before);
  for(const key of ["player","beta_grant","pro_grant","sync"])assert.deepEqual(result.state[key],legacy[key]);
});
test("legacy/backfill/migration/old OCR and inferred manual label never constitute proof",()=>{
  for(const source of [null,"legacy_backfill","wb10_profile","migration","history_scan","confirmed_scan","manual_confirmation"]){
    const squad={...legacy.squads[0],composition_source:source,composition_confirmed_at:old,confirmed_composition:names};
    const normalized=identity.normalizeSquadSlots(squad,1,{inferLegacy:true});
    emptyNames(normalized);assert.equal(normalized.composition_confirmed_at,null);
    assert.equal(identity.confirmedCompositionForSquad(squad),null);
    assert.deepEqual(confirmedSquadHints(profile(squad),1,"fixture-owner"),[]);
    assert.ok(history(normalized).length);
  }
});
test("generic updated_at, incomplete composition and invalid date cannot forge confirmation",()=>{
  for(const patch of [{composition_confirmed_at:null},{composition_confirmed_at:"invalid"},{confirmed_composition:real.slice(0,4)}]){
    const normalized=identity.normalizeSquadSlots({...trusted.squads[0],...patch},1);
    emptyNames(normalized);assert.equal(identity.confirmedCompositionForSquad(normalized),null);
  }
});
test("explicit composition survives partial scan and sparse-slot restoration",()=>{
  const result=applyReviewedSquad(trusted,{squadId:1,heroes:[{}],updatedAt:now,powerConfirmed:true}).state;
  assert.deepEqual(result.squads[0].heroes.map(h=>h.name),real);
  assert.equal(result.squads[0].composition_confirmed_at,old);
  const sparse=identity.normalizeSquadSlots({...trusted.squads[0],heroes:[trusted.squads[0].heroes[0]]},1);
  assert.deepEqual(sparse.heroes.map(h=>h.name),real);
});
test("Vision hints require explicit provenance, correct owner and correct stable slot",()=>{
  assert.deepEqual(confirmedSquadHints(trusted,1,"fixture-owner"),real);
  assert.deepEqual(confirmedSquadHints(trusted,1,"other-owner"),[]);
  assert.equal(squadEvidence({name_evidence:"unreadable"},real).name,null);
  const second={...trusted.squads[0],id:2};
  const state={...trusted,squads:[second]};
  assert.deepEqual(confirmedSquadHints(state,1,"fixture-owner"),[]);
  assert.deepEqual(confirmedSquadHints(state,2,"fixture-owner"),real);
});
test("migration is idempotent, serializable and never restores historical names",()=>{
  const migrated=identity.repairLegacySquadIdentity(legacy,{now}).state;
  const again=identity.repairLegacySquadIdentity(clone(migrated),{now}).state;
  assert.deepEqual(clone(again),clone(migrated));emptyNames(normalizeState(again).squads[0]);
  assert.equal(history(again.squads[0]).length,1);
});
test("newer untrusted cloud snapshot cannot override an explicitly confirmed composition",()=>{
  const remote=clone(legacy);remote.squads[0].updated_at=now;
  remote.squads[0].composition_source="legacy_backfill";remote.squads[0].confirmed_composition=names;remote.squads[0].composition_confirmed_at=now;
  for(const [path,state] of [["merge",mergeNewest(trusted,remote)],["hydrate",hydrateCloudState(remote,trusted,"fixture-owner")],
    ["freshness",reconcileCloudSquads(trusted,remote,mergeNewest(trusted,remote)).state]]){
    assert.deepEqual(state.squads[0].heroes.map(h=>h.name),real,path);
    assert.equal(state.squads[0].heroes[0].power,5000000,path);
    assert.equal(state.squads[0].composition_source,"explicit_confirmation");
    assert.equal(state.squads[0].composition_confirmed_at,old);
    assert.ok(history(state.squads[0]).some(h=>h.heroes.some(hero=>hero.name==="Mason")));
  }
});
test("misordered/singleton Squad 2 cannot become Squad 1 in normalization/cloud restore",()=>{
  const wrongOrder={...trusted,squads:[{...trusted.squads[0],id:2}]};
  for(const state of [normalizeState(wrongOrder),identity.repairLegacySquadIdentity(wrongOrder).state,
    hydrateCloudState(wrongOrder,profile(blank(1)),"fixture-owner")]){
    emptyNames(state.squads[0]);assert.deepEqual(state.squads[1].heroes.map(h=>h.name),real);
  }
});
test("explicit re-confirmation preserves archived records and becomes eligible for Vision",()=>{
  const migrated=identity.repairLegacySquadIdentity(legacy).state;
  const result=identity.reconcileConfirmedSquad(migrated,{squadId:1,names:real,updatedAt:now}).state;
  assert.deepEqual(confirmedSquadHints(result,1,"fixture-owner"),real);
  assert.deepEqual(history(result.squads[0])[0].heroes,legacy.squads[0].heroes);
});
test("swapping historical data cannot manufacture explicit identity; real/empty swaps remain valid",()=>{
  const swapped=identity.swapSquads(legacy,{fromSquadId:1,toSquadId:2,updatedAt:now}).state;
  emptyNames(swapped.squads[1]);assert.deepEqual(confirmedSquadHints(swapped,2,"fixture-owner"),[]);
  const valid=identity.swapSquads(trusted,{fromSquadId:1,toSquadId:2,updatedAt:now}).state;
  assert.deepEqual(confirmedSquadHints(valid,2,"fixture-owner"),real);
  assert.equal(identity.repairLegacySquadIdentity(valid).state.squads[0].composition_source,"explicit_swap_empty");
});

const app=fs.readFileSync("app.js","utf8");
function source(name){const start=app.indexOf(`function ${name}(`);assert.ok(start>=0);const end=app.indexOf("\nfunction ",start+9);return app.slice(start,end<0?app.length:end)}
const carry=(a,b)=>b??a??[];
const ctx=vm.createContext({...identity,canonicalPowerMillions,confirmedHeroPower,heroPowerIsConfirmed,mergeFreshRecord,
  canonicalStoredHeroName:canonicalHeroName,APP_VERSION:"fixture",initialState:()=>profile(blank(1)),
  LEGACY_DATA_KEYS:["wb10_profile"],localStorage:{getItem:key=>key==="wb10_profile"?"fixture":null},
  readLegacyJson:key=>key==="wb10_profile"?Object.fromEntries(names.map((name,i)=>[`heroName${i+1}`,name])):null,
  legacyRole:()=>null,legacyMembers:()=>[],mergeShopState:carry,mergeActivityEvents:carry,
  mergeEventAvailabilities:carry,mergeAvailabilityHistory:carry,mergeAllianceMembersProtected:carry,
  reconcileCanonicalAlliance:(a,b,out)=>out,normalizeUnlinkedAccounts:()=>[],
  normalizeRosterRemovalTombstones:()=>[],mergeDesertStormState:carry,mergeCanyonState:carry,
  mergeVsState:carry,mergeTechnologyBranches:carry,mergeExclusiveWeapons:carry,
  mergeHeroProgression:carry,mergeHeroProfiles:carry,mergeProgressionSnapshots:carry});
vm.runInContext(["emptyHero","emptySquad","mergeHeroSlotIdentitySafe","mergeSquadComposition","mergeSquadPayload","mergeState","migrateLegacyLocalState"].map(source).join("\n"),ctx);
test("actual app migration archives wb10 names without populating slots; repeated import is safe",()=>{
  const once=ctx.migrateLegacyLocalState(profile(blank(1))).state;
  emptyNames(once.squads[0]);assert.equal(history(once.squads[0])[0].composition_source,"wb10_profile");
  const twice=ctx.migrateLegacyLocalState(once).state;
  assert.equal(history(twice.squads[0]).length,1);
  const confirmed=ctx.migrateLegacyLocalState(trusted).state;
  assert.deepEqual(Array.from(confirmed.squads[0].heroes,h=>h.name),real);
});
test("actual app merge preserves explicit identity atomically and aligns Squad 2 by id",()=>{
  const result=ctx.mergeState(trusted,legacy);
  assert.deepEqual(Array.from(result.squads[0].heroes,h=>h.name),real);
  assert.equal(result.squads[0].composition_source,"explicit_confirmation");
  assert.equal(result.squads[0].composition_confirmed_at,old);
  const second=ctx.mergeState(profile(blank(1)),{...trusted,squads:[{...trusted.squads[0],id:2}]});
  emptyNames(second.squads[0]);assert.deepEqual(Array.from(second.squads[1].heroes,h=>h.name),real);
});
console.log(`PASS ${checks} squad identity provenance scenarios`);
