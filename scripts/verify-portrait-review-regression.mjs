import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as review from "../lib/squad-scan-review.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {portraitConflictCandidates} from "../lib/portrait-diagnostics.js";
import {translator,LANGUAGES} from "../i18n.js";

const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
function productionFunction(name,next){
  return source.slice(source.indexOf(`function ${name}(`),source.indexOf(`function ${next}(`));
}
const pending=[1,4,5].flatMap((slot,i)=>[
  {slot,field:"name",reason:"uncertain"},
  {slot,field:"name",reason:"uncertain",value:["Murphy","Marshall","Stetmann"][i]}
]);
const normalize=items=>review.uniqueSquadPending?review.uniqueSquadPending(items):items;
const evidence=(full,zoom)=>({requires_confirmation:true,tier:"low",portrait:{diagnostic:{
  zoom_evidence:{derived_from_same_capture:true,selection:"conflict",
    full_capture:{candidate_name:full,confidence:full==="DVA"?0.90:0.94},zoom:{candidate_name:zoom,confidence:0.99}}
}}});
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const translate=(key,params={})=>({
  scan_review_identity_conflict:`Image entière : ${params.full} ; portrait agrandi : ${params.zoom} — propositions contradictoires. Choisis le bon héros puis confirme.`,
  scan_review_portrait_diagnostic:"Diagnostic du portrait"
}[key]||key);

test("Scan status and reloaded Player list show three warnings, preserving source history",()=>{
  for(const items of [pending,JSON.parse(JSON.stringify(pending))]){
    assert.equal(normalize(items).length,3);
    assert.deepEqual(normalize(items).map(x=>x.value),["Murphy","Marshall","Stetmann"]);
  }
  assert.equal(pending.length,6);
  const status={dataset:{},replaceChildren(node){this.textContent=node}};
  const ctx={uniqueSquadPending:normalize,squadPendingDescription:review.squadPendingDescription,
    document:{createTextNode:x=>x},t:x=>x,lang:"fr"};
  vm.createContext(ctx);
  vm.runInContext(productionFunction("showSquadScanStatus","filterReviewedSquadWeapons"),ctx);
  ctx.showSquadScanStatus(status,pending);
  for(const slot of [1,4,5])assert.equal(status.textContent.split(`Héros ${slot}`).length-1,1);
  assert.match(source,/uniqueSquadPending\(pending\)\.map/);
});

test("both real contradictions are explained outside advanced JSON, without choosing a winner",()=>{
  const groups=[["Richard","Williams"],["DVA","Kimberly"]].map(([full,zoom],i)=>({
    kind:"hero",number:i+2,rows:[{kind:"text",field:"name",path:["squads",1,"heroes",i+1,"name"],
      status:"missing",value:"",evidence:evidence(full,zoom)}]
  }));
  const {html}=renderScanReviewMarkup(groups,translate,esc);
  const visible=html.replace(/<details[\s\S]*?<\/details>/g,"");
  assert.match(visible,/Image entière : Richard ; portrait agrandi : Williams/);
  assert.match(visible,/Image entière : DVA ; portrait agrandi : Kimberly/);
  assert.equal((visible.match(/data-scan-review-identity-ack/g)||[]).length,2);
  assert.doesNotMatch(html,/<option value="(?:Williams|Kimberly)" selected/);
});

test("different reasons and conflicting nonempty values remain separate",()=>{
  const items=[
    {slot:2,field:"name",reason:"uncertain"},
    {slot:2,field:"name",reason:"uncertain",value:"Williams"},
    {slot:2,field:"name",reason:"uncertain",value:"Richard"},
    {slot:2,field:"name",reason:"duplicate",value:"Williams"},
    {slot:2,field:"name",reason:"unlinked",value:"Williams"},
    {slot:3,field:"name",reason:"uncertain",value:"Williams"}
  ];
  assert.equal(normalize(items).length,5);
  assert.deepEqual(normalize(normalize(items)),normalize(items));
  assert.equal(items.length,6);
});

test("actual Player pending notice uses same nonmutating presentation after cloud/reload",()=>{
  const begin=source.indexOf("    const pending=sq.composition_conflict?.scan_pending;");
  const end=source.indexOf("\n    }",begin)+6;
  const code=source.slice(begin,end);
  assert.ok(begin>0&&code.includes("notice.textContent"));
  const sq={composition_conflict:{scan_pending:JSON.parse(JSON.stringify(pending))}};
  const original=JSON.stringify(sq);
  let notice;
  const ctx={sq,lang:"fr",uniqueSquadPending:normalize,squadPendingDescription:review.squadPendingDescription,
    document:{createElement:()=>({})},shell:{querySelector:()=>({prepend(node){notice=node}})}};
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  assert.ok(notice);
  for(const slot of [1,4,5])assert.equal(notice.textContent.split(`Héros ${slot}`).length-1,1);
  assert.equal(JSON.stringify(sq),original);
});

test("another player's different squad/order shows only that slot's supplied alternatives",()=>{
  const groups=[{kind:"hero",number:5,rows:[{kind:"text",field:"name",
    path:["squads",3,"heroes",4,"name"],status:"missing",value:"",
    evidence:evidence("DVA","Kimberly")}]}];
  const {html,rows}=renderScanReviewMarkup(groups,translate,esc);
  assert.deepEqual(rows[0].path,["squads",3,"heroes",4,"name"]);
  assert.match(html,/Image entière : DVA ; portrait agrandi : Kimberly/);
  assert.doesNotMatch(html,/Image entière : Richard/);
  assert.doesNotMatch(html,/<option value="Kimberly" selected/);
});

test("real form handler requires checkbox even after dropdown correction; slots independent",()=>{
  for(const acknowledged of [false,true]){
    const rows=["Murphy","","","Marshall","Stetmann"].map((value,index)=>({
      field:"name",kind:"text",path:["squads",1,"heroes",index,"name"],
      value,evidence:{requires_confirmation:true}
    }));
    const chosen=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
    const ctx={$:()=>({querySelector(selector){
      const id=Number(selector.match(/="(\d+)"/)?.[1]);
      return selector.includes("identity-ack")?{checked:acknowledged&&[1,2].includes(id)}:{value:chosen[id]};
    }}),canonicalStoredHeroName:x=>x};
    vm.createContext(ctx);
    vm.runInContext(productionFunction("scanReviewFormEdits","updateScanReviewRaritySummary"),ctx);
    const form=ctx.scanReviewFormEdits({displayRows:rows,type:"squad2"});
    assert.deepEqual(Array.from(form.edits,x=>x.value),acknowledged?["","Williams","Kimberly","",""]:["","","","",""]);
    assert.equal(form.issues.length,acknowledged?3:5);
  }
});

test("actual change handler clears only the acknowledgement of the edited hero",()=>{
  const acks=Array.from({length:5},()=>({checked:true}));
  const ctx={pendingScanReview:{displayRows:Array.from({length:5},(_,slot)=>({
    field:"name",path:["squads",2,"heroes",slot,"name"],evidence:{requires_confirmation:true}
  }))}};
  vm.createContext(ctx);
  vm.runInContext(productionFunction("handleScanReviewChange","translateOpenScanReview"),ctx);
  ctx.handleScanReviewChange({target:{closest:selector=>selector==="[data-scan-review-id]"?{dataset:{scanReviewId:"2"}}:null},
    currentTarget:{querySelector:selector=>acks[Number(selector.match(/="(\d+)"/)[1])]}});
  assert.deepEqual(acks.map(x=>x.checked),[true,true,false,true,true]);
});

for(const squadId of [1,2,3,4])test(`review preserves four squads and 20 pieces, no invented power, target ${squadId}`,()=>{
  const names=["Murphy","Williams","Kimberly","Marshall","Stetmann"];
  const gear="slot=0;count=1;level=40|slot=1;count=1;level=40|slot=2;count=1;level=40|slot=3;count=1;level=40";
  const state={squads:Array.from({length:4},(_,i)=>({id:i+1,power:35.66,
    confirmed_composition:names,composition_source:"explicit_confirmation",composition_confirmed_at:"2026-10-20T12:00:00Z",
    heroes:names.map(name=>({name,level:155,gear,stars:null,power:null}))}))};
  const before=JSON.stringify(state);
  const result=review.applyReviewedSquad(state,{squadId,updatedAt:"2026-10-21T12:00:00Z",
    heroes:names.map((name,i)=>({name:[1,2].includes(i)?name:"",level:155,gear})),
    issues:[0,3,4].map(i=>({slot:i+1,field:"name",reason:"uncertain"})),
    evidence:names.map(name=>({identity:{candidate:name}})),identityReviewConfirmed:true,powerConfirmed:true});
  assert.equal(JSON.stringify(state),before);
  assert.equal(result.state.squads.length,4);
  for(const squad of result.state.squads){
    assert.deepEqual(squad.heroes.map(h=>h.name),names);
    assert.deepEqual(squad.heroes.map(h=>h.level),[155,155,155,155,155]);
    assert.equal(squad.heroes.reduce((n,h)=>n+(h.gear?.match(/level=40/g)||[]).length,0),20);
    assert.ok(squad.heroes.every(h=>!h.power&&!h.stars));
  }
  const normalized=normalize(result.pending).filter(x=>x.field==="name");
  assert.equal(normalized.length,3);
  assert.equal(normalize(JSON.parse(JSON.stringify(result.state)).squads[squadId-1].composition_conflict.scan_pending).filter(x=>x.field==="name").length,3);
});

test("alternatives are catalogue-only, never inferred, no same-pixel auto acceptance",()=>{
  assert.deepEqual(portraitConflictCandidates(evidence("Richard","Williams")),{full:"Richard",zoom:"Williams"});
  for(const pair of [["Richard","not a hero"],["Kimberly","Kimberly"]])assert.equal(portraitConflictCandidates(evidence(...pair)),null);
  const proof=evidence("Richard","Williams");
  proof.portrait.diagnostic.zoom_evidence.selection="agreement";
  assert.equal(portraitConflictCandidates(proof),null);
  assert.ok(!/\.checked\s*=\s*true/.test(source.slice(source.indexOf("function renderScanReview("),source.indexOf("function scanReviewFormEdits("))));
});

test("all supported locales have a readable translated or English fallback",()=>{
  // The app's locale list, not a claim of human translation review.
  for(const lang of LANGUAGES){
    const code=Array.isArray(lang)?lang[0]:typeof lang==="string"?lang:lang.code;
    if(code==="auto")continue;
    const text=translator(code)("scan_review_identity_conflict",{full:"Richard",zoom:"Williams"});
    assert.ok(text.includes("Richard")&&text.includes("Williams"));
    assert.notEqual(text,"scan_review_identity_conflict");
    assert.notEqual(translator(code)("scan_review_portrait_diagnostic"),"scan_review_portrait_diagnostic");
  }
});
