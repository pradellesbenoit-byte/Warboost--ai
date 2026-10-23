import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {squadReviewStatus,squadReviewHeader,squadReviewRowHtml,accountSquadReviewHtml} from "../lib/squad-review-status.js";
import {squadReviewStatusCopy} from "../lib/squad-review-status-copy.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";
import {accountSyncView,confirmedWriteReceipt} from "../lib/account-sync-feedback.js";
import {translator} from "../i18n.js";

let groups=0,messages=0;
const test=(label,run)=>{run();groups++;console.log("PASS "+label)};
const clone=value=>JSON.parse(JSON.stringify(value));
const names=["Murphy","Kimberly","Williams","Marshall","Stetmann"],at="2026-10-15T08:43:37.000Z";
const squad=(id,extra={})=>({id,power:44.43,heroes:names.map(name=>({name,level:155})),...extra});
const confirmed=(id,extra={})=>squad(id,{composition_source:"explicit_confirmation",
  composition_confirmed_at:at,confirmed_composition:[...names],...extra});
const marker={status:"needs_verification",reason:"squad_freshness_ambiguous"};
const t=translator("fr");
function freeze(value){if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
test("unconfirmed names do not become a local/cloud conflict",()=>{
  const result=squadReviewStatus({squads:[squad(1)]});
  assert.deepEqual(result.namesToConfirmIds,[1]);assert.deepEqual(result.recordedIds,[]);
  assert.deepEqual(result.rows[0].codes,["names"]);assert.equal(result.cloudValidation,"not_performed");
});
test("explicitly confirmed names without a marker do not require confirmation",()=>{
  assert.deepEqual(squadReviewStatus({squads:[confirmed(1)]}).rows[0].codes,["clear"]);
});
test("an exact cloud freshness marker identifies its squad but is never currently revalidated",()=>{
  const result=squadReviewStatus({squads:[confirmed(2,{composition_conflict:marker})]});
  assert.deepEqual(result.recordedIds,[2]);assert.deepEqual(result.rows[1].codes,["cloud_marker"]);
  assert.equal(result.rows[1].cloudValidation,"not_revalidated");
  assert.match(squadReviewHeader(result.rows[1],t),/enregistré — non revalidé/);
});
test("names, duplicate identities and recorded cloud conflict can coexist",()=>{
  const conflict={...marker,heroes:[{hero:"private-hero",positions:[{squad:1,slot:1},{squad:2,slot:2}]}]};
  const row=squadReviewStatus({squads:[squad(1,{composition_conflict:conflict})]}).rows[0];
  assert.deepEqual(row.codes,["cloud_marker","names","duplicate"]);
  const html=squadReviewRowHtml(row,t);assert.match(html,/Noms non confirmés/);assert.match(html,/plusieurs emplacements/);
  assert.doesNotMatch(html,/private-hero/);
});
test("generic review status alone is not a cloud freshness conflict",()=>{
  const row=squadReviewStatus({squads:[confirmed(3,{composition_conflict:{status:"needs_verification"}})]}).rows[2];
  assert.deepEqual(row.codes,["review"]);assert.equal(row.recordedCloudConflict,false);
});
test("empty squad four does not assert a Last War lock or PRO restriction",()=>{
  const result=squadReviewStatus({squads:[confirmed(1),confirmed(2),confirmed(3),{id:4,heroes:[],updated_at:at}]});
  assert.deepEqual(result.emptyIds,[4]);assert.deepEqual(result.rows[3].codes,["empty"]);
  assert.match(squadReviewHeader(result.rows[3],t),/Aucune donnée enregistrée/);
  assert.match(squadReviewHeader(result.rows[3],t),/inconnu/);
  assert.doesNotMatch(squadReviewHeader(result.rows[3],t),/à débloquer|PRO/);
  const emptyHeroes=Array.from({length:5},()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null}));
  assert.equal(squadReviewStatus({squads:[{id:4,heroes:emptyHeroes}]}).rows[3].hasData,false);
});
test("malformed legacy hero/history containers do not crash a read-only empty diagnostic",()=>{
  assert.doesNotThrow(()=>squadReviewStatus({squads:[{id:4,heroes:{},composition_conflict:{identity_history:"legacy"}}]}));
  assert.deepEqual(squadReviewStatus({squads:[{id:4,heroes:{},composition_conflict:{identity_history:"legacy"}}]}).rows[3].codes,["empty"]);
});
test("old marker and a later squad timestamp do not establish a current cloud conflict",()=>{
  const row=squadReviewStatus({squads:[confirmed(1,{updated_at:"2026-10-15T11:50:00.000Z",
    composition_conflict:{...marker,detected_at:"2026-10-04T08:00:00.000Z"}})]}).rows[0];
  assert.equal(row.cloudValidation,"not_revalidated");assert.deepEqual(row.codes,["cloud_marker"]);
});
test("a new-looking detection date also cannot prove current owner/session cloud comparison",()=>{
  const row=squadReviewStatus({squads:[confirmed(1,{composition_conflict:{...marker,detected_at:at}})],
    sync:{last_sync:at,last_check:{kind:"verified"}}}).rows[0];
  assert.equal(row.cloudValidation,"not_revalidated");
});
test("a global stale marker with no squad number stays unassigned",()=>{
  const result=squadReviewStatus({squads:[confirmed(1)],sync:{last_error:"squad_freshness_ambiguous"}});
  assert.equal(result.unassignedMarker,true);assert.deepEqual(result.recordedIds,[]);
  assert.match(accountSquadReviewHtml(result,t),/sans numéro identifiable/);
});
test("historical identity records never populate current slots or create confirmations",()=>{
  const profile={squads:[{id:4,heroes:[],composition_conflict:{identity_history:[{heroes:[{name:"private-history"}]}]}}]};
  assert.deepEqual(squadReviewStatus(profile).rows[3].codes,["empty","history"]);
  assert.doesNotMatch(accountSquadReviewHtml(squadReviewStatus(profile),t),/private-history/);
});
test("an explicit empty operation remains empty even if an old total survives",()=>{
  assert.deepEqual(squadReviewStatus({squads:[confirmed(4,{composition_source:"explicit_swap_empty"})]}).rows[3].codes,["empty"]);
});
test("stable IDs survive shuffled arrays without contamination between squads",()=>{
  const result=squadReviewStatus({squads:[confirmed(3),confirmed(1,{composition_conflict:marker}),confirmed(2)]});
  assert.deepEqual(result.recordedIds,[1]);assert.equal(result.rows[2].recordedCloudConflict,false);
});
test("duplicate slot IDs are not arbitrarily assigned to a current squad",()=>{
  const result=squadReviewStatus({squads:[confirmed(2),confirmed(2)]});
  assert.ok(result.rows[1].codes.includes("review"));assert.deepEqual(result.recordedIds,[]);
});
test("missing legacy IDs use their own position only",()=>{
  const legacy=squad(1,{composition_conflict:marker});delete legacy.id;
  assert.deepEqual(squadReviewStatus({squads:[legacy]}).recordedIds,[1]);
});
test("diagnosis and both presentations leave all input, history and receipts byte-identical",()=>{
  const profile=freeze({player_id:"private-owner",squads:[squad(1,{composition_conflict:marker}),confirmed(2),confirmed(3)],
    sync:{last_confirmed_write_at:at,last_error:"squad_freshness_ambiguous"},alliance:{role:"R5"}});
  const before=JSON.stringify(profile);
  for(let i=0;i<3;i++){const result=squadReviewStatus(profile);accountSquadReviewHtml(result,t);result.rows.forEach(row=>squadReviewRowHtml(row,t))}
  assert.equal(JSON.stringify(profile),before);
});
test("support projection and markup contain no names, owner, powers, captures or raw reason",()=>{
  const profile={player_id:"private-owner",nickname:"private-nickname",capture:"private-photo",
    squads:[squad(1,{composition_conflict:{status:"needs_verification",reason:"private-error-detail"}})]};
  const result=squadReviewStatus(profile),output=JSON.stringify(result)+accountSquadReviewHtml(result,t);
  for(const value of [...names,"private-owner","private-nickname","private-photo","private-error-detail","44.43","155"])
    assert.ok(!output.includes(value),value);
});
test("read-only presentation has no repair control, form, click handler or request",()=>{
  const html=accountSquadReviewHtml(squadReviewStatus({squads:[squad(1,{composition_conflict:marker})]}),t);
  assert.doesNotMatch(html,/<(?:button|form|input|select)\b|\bonclick=|\bdata-action=/);
  assert.match(html,/Lecture seule/);assert.match(html,/Aucun conflit n’est levé/);
});
test("rendered translations are escaped",()=>{
  const html=accountSquadReviewHtml(squadReviewStatus({}),()=>'<img src=x onerror="bad()">');
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
const receipt=confirmedWriteReceipt({revision:at,at,diagnostic:{stage:"response",http_status:200,code:"save_confirmed",
  at,write_state:"confirmed",correlation_id:"00000000-0000-4000-8000-000000000001"}});
test("diagnosis does not erase a verified receipt or rewrite its date",()=>{
  const profile={squads:[confirmed(1,{composition_conflict:marker})],
    sync:{last_confirmed_write_receipt:receipt,pending_cloud_save:true,last_error:"squad_freshness_ambiguous"}};
  const before=accountSyncView({sync:profile.sync});
  squadReviewStatus(profile);
  assert.deepEqual(accountSyncView({sync:profile.sync}),before);assert.equal(before.lastConfirmedAt,at);
});
test("all 22 languages / 23 locales resolve fifteen diagnostic labels and the cloud/local labels",()=>{
  for(const code of Object.keys(ACCOUNT_SYNC_COPY)){
    const lang=code.startsWith("en-")?"en":code,copy=squadReviewStatusCopy(lang),translate=translator(code);
    assert.equal(Object.keys(copy).length,18);
    for(const [key,value] of Object.entries(copy)){
      assert.ok(value?.trim(),`${code}:${key}`);
      const actual=translate(key,{squads:"1, 3"});
      assert.equal(actual,value.replace("{squads}","1, 3"));assert.doesNotMatch(actual,/\{squads\}/);messages++;
    }
  }
});
const app=fs.readFileSync("app.js","utf8");
const start=app.indexOf("function renderAccountSquadReviewDiagnostic(");
const end=app.indexOf("\nasync function checkAccountCloudStatus",start);
const elements=new Map(),anchor={insertAdjacentElement(_position,node){elements.set(node.id,node)}};
const context=vm.createContext({state:{player_id:"owner",squads:[confirmed(2,{composition_conflict:marker})]},
  cloudSession:{user:{id:"owner"}},runtimeAccessState:()=>({phase:"ready"}),t,squadReviewStatus,accountSquadReviewHtml,
  $:id=>id==="#betaAccessStatus"?anchor:elements.get(id.slice(1)),
  renderSquadComparisonControls:()=>{},
  document:{createElement:()=>({open:false,remove(){elements.delete(this.id)}})}});
vm.runInContext(app.slice(start,end),context);
test("actual account render is side-effect-free, owner-gated and keeps its disclosure open",()=>{
  const before=JSON.stringify(context.state);
  context.renderAccountSquadReviewDiagnostic();
  const node=elements.get("accountSquadReviewDiagnostic");assert.ok(node);
  assert.match(node.innerHTML,/escouades 2/);node.open=true;context.renderAccountSquadReviewDiagnostic();assert.equal(node.open,true);
  assert.equal(JSON.stringify(context.state),before);
  context.cloudSession={user:{id:"another-owner"}};context.renderAccountSquadReviewDiagnostic();
  assert.equal(elements.has("accountSquadReviewDiagnostic"),false);
});
test("signed-out or access-not-ready account cannot show diagnostic metadata",()=>{
  context.cloudSession=null;context.renderAccountSquadReviewDiagnostic();assert.equal(elements.size,0);
  context.cloudSession={user:{id:"owner"}};context.runtimeAccessState=()=>({phase:"checking"});
  context.renderAccountSquadReviewDiagnostic();assert.equal(elements.size,0);
});
test("player and account hooks use the same diagnostic without changing squad save handlers",()=>{
  assert.match(app,/const review=squadReviewStatus\(state\)/);
  assert.match(app,/freshness=squadReviewHeader\(row,t\)/);
  assert.match(app,/needsHeroConfirm=row\.hasData&&/,"an empty squad does not demand five name confirmations");
  assert.match(app,/insertAdjacentHTML\("afterbegin",squadReviewRowHtml\(row,t\)\)/);
  assert.match(app,/renderAccountSquadReviewDiagnostic\(\);/);
});
test("mobile styles wrap diagnostics without hiding text or introducing a new overlay",()=>{
  const css=fs.readFileSync("squad-review-status.css","utf8");
  assert.match(css,/white-space:normal/);assert.match(css,/overflow-wrap:anywhere/);
  assert.doesNotMatch(css,/position:\s*fixed|overflow:\s*hidden|text-overflow:\s*ellipsis/);
});
console.log(`PASS squad read-only diagnosis: ${groups} groups, ${messages} localized entries; frozen/synthetic profiles, real account renderer, no requests or writes.`);
