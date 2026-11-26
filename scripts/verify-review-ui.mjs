import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const helperStart=source.indexOf("function squadReviewEscape(");
const helperEnd=source.indexOf("\nasync function submitSquadConflictResolution(",helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,"review UI helpers exist");
const helpers=source.slice(helperStart,helperEnd);
const submitStart=source.indexOf("async function submitSquadConflictResolution(");
const submitEnd=source.indexOf("\nfunction requireBetaAccess",submitStart);
assert.ok(submitStart>=0&&submitEnd>submitStart,"review submit handler exists");
const submit=source.slice(submitStart,submitEnd);

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[char]));
const projectionRow=(heroes,values,total=46.91)=>{
  const composition=heroes.map(name=>({kind:"value",value:name}));
  return {categories:{
    composition,
    power:{total:{kind:"value",value:total},heroes:values.map(value=>({kind:"value",value}))},
    weapons:values.map((_,index)=>index===2?{kind:"value",value:{level:7}}:{kind:"missing"})
  }};
};
const field=(category,slot)=>({category,slot,state:"same",confirmed:false});
const makeView=(id=1,fields=Array.from({length:5},(_,i)=>field("power",i+1)),overrides={})=>{
  const heroes=Array.from({length:5},(_,i)=>`Hero ${i+1}`);
  const powers=Array.from({length:5},(_,i)=>i+1);
  const local=projectionRow(heroes,powers),cloud=projectionRow(heroes,powers);
  const localRows=Array(4).fill(null),cloudRows=Array(4).fill(null);
  localRows[id-1]=local;cloudRows[id-1]=cloud;
  return {kind:"result",at:"2026-11-26T19:00:00.000Z",cloudRevision:"2026-11-26T18:00:00.000Z",
    localProjection:{rows:localRows},cloudProjection:{rows:cloudRows},
    rows:[{id,marker:true,counts:{different:0,unknown:0},
      issues:fields.length?[{reason:"field_confirmation_missing"}]:[],fields}],...overrides};
};
const renderedHtml=view=>{
  const context=vm.createContext({lang:"fr",locale:"fr-FR",esc:escapeHtml,view,
    squadReviewPending:false,squadReviewMessage:""});
  vm.runInContext(helpers,context);
  return vm.runInContext("squadConflictResolutionHtml(view)",context);
};

test("review panel displays both compositions, both equal values, read time and an unchecked acknowledgement",()=>{
  const view=makeView();
  const html=renderedHtml(view);
  assert.match(html,/Composition locale: Héros 1: Hero 1/);
  assert.match(html,/Composition cloud: Héros 1: Hero 1/);
  assert.match(html,/local <strong>1<\/strong> · cloud <strong>1<\/strong>/);
  assert.match(html,/valeurs identiques; preuve actuelle non confirmée/);
  assert.match(html,/Puissance totale locale: 46,91 M · cloud: 46,91 M/);
  assert.match(html,/26\/11\/2026/);
  assert.match(html,/data-squad-review-ack="1"/);
  assert.doesNotMatch(html,/<input[^>]*checked/);
  assert.match(html,/data-squad-review-submit="1" disabled/);
  assert.match(html,/role="status" aria-live="polite"/);
});

test("manual proof is limited to the two selected Squad 2 fields",()=>{
  const view=makeView(2,[field("power",3),field("weapons",3)]);
  const html=renderedHtml(view);
  assert.match(html,/puissance du héros 3/);
  assert.match(html,/arme exclusive du héros 3/);
  assert.doesNotMatch(html,/puissance du héros 1/);
});

test("marker-only Squad 3 asks to review the marker without inventing field proof",()=>{
  const html=renderedHtml(makeView(3,[]));
  assert.match(html,/Aucune preuve de champ ne sera ajoutée/);
  assert.match(html,/retirer uniquement l'ancien marqueur/);
  assert.doesNotMatch(html,/field_source|confirmed_scan|confirmed_manual/);
});

test("different or unknown values never receive a review confirmation control",()=>{
  const different=makeView(1,undefined,{rows:[{id:1,marker:true,counts:{different:1,unknown:0},issues:[],fields:[]}]});
  const unknown=makeView(1,undefined,{rows:[{id:1,marker:true,counts:{different:0,unknown:1},issues:[],fields:[]}]});
  assert.equal(renderedHtml(different),"");
  assert.equal(renderedHtml(unknown),"");
});

test("submit requires a checked acknowledgement in the click wiring and a confirmed server receipt",async()=>{
  const stateApi=fs.readFileSync(new URL("../api/state.js",import.meta.url),"utf8");
  const resolveModule=fs.readFileSync(new URL("../lib/squad-review-resolve-handler.js",import.meta.url),"utf8");
  assert.match(stateApi,/createSquadReviewResolveHandler\(\{requireProductUser,\s*readForUser:getProfileForUser,saveForUser:saveProfileForUserIfUnchanged,consentVersion:BETA_CONSENT_VERSION\}\)/);
  assert.match(stateApi,/req\.query\?\.action==="squad_review_resolve"\)return squadReviewResolveHandler\(req,res\)/);
  assert.match(resolveModule,/requireProductUser\(req,\{consent:true\}\)/);
  assert.match(resolveModule,/readForUser\(owner,bearer/);
  assert.match(resolveModule,/saveForUser\(owner,plan\.candidate,bearer,current\.updated_at\)/);
  assert.match(resolveModule,/isReviewReceiptValid\(/);
  const renderStart=source.indexOf("function renderSquadComparisonControls(");
  const renderEnd=source.indexOf("\nfunction renderAccountSquadReviewDiagnostic",renderStart);
  const renderCode=source.slice(renderStart,renderEnd);
  assert.match(renderCode,/if\(!pane\?\.querySelector\("\[data-squad-review-ack\]"\)\?\.checked\)return;/);
  assert.match(renderCode,/submit\.disabled=!cb\.checked\|\|squadReviewPending/);

  const exercise=async reply=>{
    const original=makeView(),localSquads=Array.from({length:4},(_,i)=>({id:i+1,power:i===0?46.91:i}));
    const state={player_id:"owner",squads:structuredClone(localSquads),sync:{}};
    const calls=[];let writes=0,rendered=0;
    const ctx=vm.createContext({
      squadComparison:{view:()=>original,run:async()=>{}},
      squadReadContext:()=>({allowed:true,owner:"owner",session:"session",revision:"old",local:state}),
      state,cloudRevision:"old",cloudDirty:false,squadReviewPending:false,squadReviewMessage:"",
      STORE_KEY:"synthetic-state",
      fetchSessionCritical:async(...args)=>{calls.push(args);return reply},
      authHeaders:()=>({authorization:"Bearer synthetic"}),
      safeLocalSet:()=>{writes++;return true},rememberLastGoodState(){},rememberAccountState(){},
      render(){rendered++},renderSquadComparisonControls(){},
      JSON,Date
    });
    vm.runInContext(submit,ctx);
    await vm.runInContext("submitSquadConflictResolution(1)",ctx);
    return {ctx,state,localSquads,calls,writes,rendered};
  };
  const noReceipt=await exercise({ok:true,status:200,json:async()=>({ok:true,squad_id:1,
    updated_at:"2026-11-26T20:00:00.000Z",squad:{id:1,power:46.91}})});
  assert.equal(noReceipt.writes,0);
  assert.deepEqual(noReceipt.state.squads,noReceipt.localSquads);
  assert.match(noReceipt.ctx.squadReviewMessage,/non confirmée/);

  const acknowledgedSquad={id:1,power:46.91,composition_conflict:null};
  const success=await exercise({ok:true,status:200,json:async()=>({ok:true,write_confirmed:true,squad_id:1,
    updated_at:"2026-11-26T20:00:00.000Z",squad:acknowledgedSquad})});
  assert.equal(success.writes,1,success.ctx.squadReviewMessage);
  assert.deepEqual(success.state.squads[0],acknowledgedSquad);
  assert.deepEqual(success.state.squads.slice(1),success.localSquads.slice(1));
  assert.match(success.ctx.squadReviewMessage,/confirmée par le cloud/);
  assert.equal(success.rendered,1);

  const conflict=await exercise({ok:false,status:409,json:async()=>({error:"review_revision_changed"})});
  assert.equal(conflict.writes,0);
  assert.match(conflict.ctx.squadReviewMessage,/évolué/);
});
