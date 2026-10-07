import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {confirmedSquadHints,squadEvidence,squadExtractionPrompt,mergeScanEvidence} from "../lib/squad-scan-evidence.js";
import {sanitize,usefulState} from "../api/scan.js";
import {createScanReviewDraft,applyScanReviewEdits} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {mergePlayerScanBatch} from "../lib/player-scan-batch.js";
import {applyReviewedSquad,squadPendingDescription} from "../lib/squad-scan-review.js";
import {normalizeState} from "../lib/normalize.js";
import {translator} from "../i18n.js";

const names=["Kimberly","Murphy","Marshall","DVA","Stetmann"],at="2026-10-07T00:00:00Z";
const base={player_id:"fixture-a",squads:[{power:42,power_sync_status:"confirmed",confirmed_composition:names,composition_confirmed_at:at,
  heroes:names.map(name=>({name,level:150,stars:5,power:5000000,updated_at:at,source:"confirmed_manual"}))}]};
let count=0;const test=(name,run)=>{run();count++;console.log(`PASS ${name}`)};
test("only owner-bound explicitly confirmed composition supplies hints",()=>{
  assert.deepEqual(confirmedSquadHints(base,1,"fixture-a"),names);
  assert.deepEqual(confirmedSquadHints(base,1,"other-account"),[]);
  assert.deepEqual(confirmedSquadHints({...base,squads:[{heroes:base.squads[0].heroes}]},1,"fixture-a"),[]);
});
test("visible unique fragment can use confirmed profile, never portrait/slot alone",()=>{
  const raw={name_text:"Kimber",name_evidence:"visible_fragment",name_confidence:0.96};
  assert.equal(squadEvidence(raw,names).name,"Kimberly");
  assert.equal(squadEvidence(raw,[]).name,null);
  assert.equal(squadEvidence({...raw,name_evidence:"portrait"},names).name,null);
  assert.equal(squadEvidence({...raw,name_text:null,name:"Kimberly",name_evidence:"portrait"},names).name,null);
  assert.equal(squadEvidence({...raw,name_text:"Mar"},names).name,null);
  assert.equal(squadEvidence({...raw,name_confidence:0.4},names).name,null);
  assert.equal(squadEvidence({...raw,name_text:"Morr",name_confidence:0.99},["Morrison","Morrisson"]).name,"Morrison");
  assert.equal(squadEvidence({...raw,name_text:"Murp"},["Murphy","Kimberly"]).name,"Murphy");
  assert.equal(squadEvidence({...raw,name_text:"Cart"},["Carter","Cartoon"]).name,null);
  assert.equal(squadEvidence({...raw,name_text:"Kimber",name:"Tesla"},names).name,null);
});
test("full readable name requires explicit compatible evidence and finite confidence",()=>{
  assert.equal(squadEvidence({name:"DVA",name_evidence:"visible_text",name_confidence:.95}).name,"DVA");
  assert.equal(squadEvidence({name:"DVA",name_evidence:"visible_text",name_confidence:1.5}).name,null);
  assert.equal(squadEvidence({name:"DVA",name_text:"Murphy",name_evidence:"visible_text",name_confidence:.95}).name,null);
  assert.equal(squadEvidence({name:"DVA"}).name,null);
});
test("individual powers use visible units, confidence and contradiction guards",()=>{
  const raw={power_text:"5,65 M",power_confidence:.97};
  assert.equal(squadEvidence(raw).power,5650000);
  assert.equal(squadEvidence({...raw,power:5.65}).power,5650000);
  assert.equal(squadEvidence({...raw,power_confidence:.5}).power,null);
  assert.equal(squadEvidence({...raw,power_confidence:1.5}).power,null);
  assert.equal(squadEvidence({...raw,power:9000000}).power,null);
  assert.equal(squadEvidence({...raw,power_text:"illisible"}).power,null);
  assert.equal(squadEvidence({power:0}).power,null);
  assert.equal(squadEvidence({power:5000000}).evidence.power.confidence,null,"legacy missing confidence must not be invented");
});
test("44.43M formation fixture remains partial without inventing five identities or powers",()=>{
  // Synthetic representative payload, not a claim of live Vision accuracy.
  const extracted={screen_type:"formation_details",squads:[{power:"44,43M",heroes:Array.from({length:5},()=>({
    name_text:null,name_evidence:"unreadable",name_confidence:null,power_text:null,power_confidence:null,level:150,stars:5
  }))}]};
  const result=sanitize(extracted,at,"squad1",names);
  assert.equal(result.squads[0].power,44.43);
  assert.ok(result.squads[0].heroes.every(hero=>!hero.name&&!hero.power));
  const batch=mergePlayerScanBatch("squad1",[{state:result}]),draft=createScanReviewDraft("squad1",batch.state,{includeHeroNames:true});
  const evidence=result.squads[0].heroes.map(h=>h.scan_evidence);
  assert.ok(!JSON.stringify(draft).includes("scan_evidence"),"metadata cannot become editable facts");
  const applied=applyReviewedSquad({...base,squads:[{...base.squads[0],power:44.43}]},{squadId:1,heroes:draft.squads[0].heroes,updatedAt:at,powerConfirmed:true,evidence});
  assert.deepEqual(applied.state.squads[0].heroes,base.squads[0].heroes);
  assert.equal(applied.pending.filter(item=>item.field==="name").length,5);
  assert.equal(applied.pending.filter(item=>item.field==="power").length,5);
  assert.equal(normalizeState(applied.state).squads[0].composition_conflict.scan_evidence.heroes.length,5);
  assert.deepEqual(applyScanReviewEdits(draft,[]).errors,[]);
});
test("low-confidence powers never overwrite confirmed hero values; readable unlinked power remains pending",()=>{
  const result=sanitize({squads:[{power:44.43,heroes:[{name:"Kimberly",name_evidence:"visible_text",name_confidence:.96,power_text:"9,00M",power_confidence:.1}]}]},at,"squad1",names);
  const applied=applyReviewedSquad(base,{squadId:1,heroes:result.squads[0].heroes,updatedAt:at,powerConfirmed:true,evidence:result.squads[0].heroes.map(h=>h.scan_evidence)});
  assert.equal(applied.state.squads[0].heroes[0].power,5000000);
  assert.ok(applied.pending.some(item=>item.field==="power"&&item.reason==="low_confidence"));
  const unlinked=applyReviewedSquad(base,{squadId:1,heroes:[{power:5650000}],updatedAt:at,powerConfirmed:true});
  assert.ok(unlinked.pending.some(item=>item.field==="power"&&item.reason==="unlinked"));
});
test("complete five-hero extraction preserves individual M/K units and has no remaining pending fields",()=>{
  const visible=["5,65 M","5,50 M","5,40 M","5,30 M","950 K"];
  const heroes=names.map((name,i)=>({name,name_text:name,name_evidence:"visible_text",name_confidence:.96,power_text:visible[i],power_confidence:.95,level:150,stars:5}));
  const result=sanitize({squads:[{power:"44,43M",heroes}]},at,"squad1",names);
  const evidence=result.squads[0].heroes.map(h=>h.scan_evidence);
  const applied=applyReviewedSquad(base,{squadId:1,heroes:result.squads[0].heroes,updatedAt:"2026-10-08T00:00:00Z",powerConfirmed:true,evidence});
  assert.equal(applied.pending.length,0);assert.equal(applied.complete,true);
  assert.deepEqual(applied.state.squads[0].heroes.map(h=>h.power),[5650000,5500000,5400000,5300000,950000]);
});
test("metadata alone is not useful data and later unreadable captures do not erase strong evidence",()=>{
  assert.equal(usefulState("squad1",sanitize({squads:[{heroes:[{name_evidence:"portrait",name:"DVA"}]}]},at,"squad1")),false);
  const strong=squadEvidence({name:"Kimberly",name_evidence:"visible_text",name_confidence:.96,power_text:"5M",power_confidence:.97}).evidence;
  const weak=squadEvidence({}).evidence;
  assert.deepEqual(mergeScanEvidence(strong,weak),strong);
  const next=squadEvidence({power_text:"6M",power_confidence:.91}).evidence;
  assert.equal(mergeScanEvidence(strong,next).power.text,"6M","changed accepted power retains its own evidence");
  const batch=mergePlayerScanBatch("squad1",[{state:{squads:[{heroes:[{name:"Kimberly",power:5000000,scan_evidence:strong}]}]}},{state:{squads:[{heroes:[{scan_evidence:weak}]}]}}]);
  assert.equal(batch.state.squads[0].heroes[0].scan_evidence.identity.confidence,.96);
});
test("review displays explicit confidence and escaped visible text, never raw metadata inputs",()=>{
  const evidence=[{identity:{text:'<script>alert(1)</script>',confidence:.96,method:"visible_fragment_and_confirmed_profile"}}];
  const patch=createScanReviewDraft("squad1",{squads:[{power:44.43,heroes:[{name:"Kimberly"}]}]},{includeHeroNames:true});
  const escape=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const markup=renderScanReviewMarkup(buildScanReviewGroups("squad1",patch,evidence),translator("fr"),escape);
  assert.match(markup.html,/Confiance OCR/);assert.match(markup.html,/96 %/);
  assert.match(markup.html,/aria-label="Nom"/);
  assert.doesNotMatch(markup.html,/scan_review_group_hero/);
  assert.doesNotMatch(markup.html,/<script>/);
  assert.ok(markup.rows.every(row=>!row.path.includes("scan_evidence")));
});
test("production status renders partial without Confirmed badge, complete only with no pending fields",()=>{
  const app=fs.readFileSync("app.js","utf8"),fn=app.slice(app.indexOf("function showSquadScanStatus("),app.indexOf("function confirmScanReview(){"));
  const status={dataset:{},textContent:"",replaceChildren(...nodes){this.textContent=nodes.map(n=>n.textContent).join("")}};
  let confirmed=0;
  const ctx=vm.createContext({lang:"fr",t:translator("fr"),squadPendingDescription,status,showConfirmedScanStatus:()=>{confirmed++},document:{createTextNode:textContent=>({textContent})}});
  vm.runInContext(fn,ctx);
  ctx.pending=Array.from({length:5},(_,i)=>({slot:i+1,field:"name",reason:"missing"}));
  vm.runInContext("showSquadScanStatus(status,pending)",ctx);
  assert.match(status.textContent,/Scan partiellement enregistré/);assert.doesNotMatch(status.textContent,/Confirmé|fusionné/i);assert.equal(confirmed,0);
  assert.match(status.textContent,/Héros 5/);
  ctx.lang="en-GB";ctx.t=translator("en-GB");
  vm.runInContext("showSquadScanStatus(status,JSON.parse(status.dataset.squadPending))",ctx);
  assert.match(status.textContent,/Scan partially saved/);assert.equal(confirmed,0);
  vm.runInContext("showSquadScanStatus(status,[])",ctx);assert.equal(confirmed,1);
});
test("single provider pass prompt requires row-by-row visible evidence and forbids portrait/profile copying",()=>{
  const prompt=squadExtractionPrompt(names);
  for(const marker of ["five visible","power_text","power_confidence","never divide","disambiguation hints ONLY","Do not copy","visible_fragment","No extra provider pass"])assert.ok(prompt.includes(marker));
  const api=fs.readFileSync("api/scan.js","utf8");
  assert.match(api,/getProfileForUser\(user\.id,token/);
  assert.match(api,/getProfile\(user\.id/);
  assert.doesNotMatch(api,/confirmedSquadHints\(currentState/);
});
console.log(`PASS ${count} squad evidence/status checks`);
