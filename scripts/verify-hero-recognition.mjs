import assert from "node:assert/strict";
import fs from "node:fs";
import {HERO_CATALOG,catalogHeroName,heroDisplayName,canonicalHeroName} from "../lib/heroes.js";
import {HERO_RECOGNITION_LIBRARY,HERO_APPEARANCE_CONTEXTS,recognitionHeroName,recognizeHeroIdentity,heroRecognitionPrompt} from "../lib/hero-recognition.js";
import {squadEvidence,confirmedSquadHints} from "../lib/squad-scan-evidence.js";
import {sanitize,promptFor} from "../api/scan.js";
import {applyReviewedSquad} from "../lib/squad-scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {applyOwnedScanReview} from "../lib/scan-review.js";

const expected={
  tank:["Kimberly","Marshall","Williams","Murphy","Stetmann","Mason","Violet","Scarlett","Monica","Richard","Farhad","Gump","Loki"],
  aircraft:["DVA","Morrison","Carlie","Lucius","Schuyler","Sarah","Cage","Ambolt","Maxwell"],
  missile:["Tesla","Fiona","Swift","Adam","McGregor","Venom","Elsa","Kane","Braz"]
};
const at="2026-10-07T00:00:00Z";
const text=(name,score=.96)=>({name,name_text:name,name_evidence:"visible_text",name_confidence:score});
const visual=(name,variant="normal",score=.95)=>({portrait:{candidate_name:name,confidence:score,variant,
  visible_features:["distinct facial detail visible in capture","distinct outfit detail visible in capture"]}});
let checks=0;
function test(label,run){run();checks++;console.log(`PASS ${label}`)}
test("exact 31-hero roster, correct classes, unique stable identities and no priorities",()=>{
  assert.equal(HERO_RECOGNITION_LIBRARY.length,31);assert.equal(new Set(HERO_CATALOG).size,31);
  for(const [type,names] of Object.entries(expected))
    assert.deepEqual(HERO_RECOGNITION_LIBRARY.filter(h=>h.type===type).map(h=>h.displayName).sort(),[...names].sort());
  assert.ok(HERO_RECOGNITION_LIBRARY.every(h=>!Object.hasOwn(h,"priority")));
  assert.equal(catalogHeroName("Schuyler"),"Skyler");
  assert.equal(heroDisplayName("Skyler"),"Schuyler");
});
for(const hero of HERO_RECOGNITION_LIBRARY){
  test(`${hero.displayName}: identical strong/medium/low policy and all aliases`,()=>{
    for(const name of [hero.canonicalName,hero.displayName,...hero.aliases]){
      assert.equal(squadEvidence(text(name)).name,hero.canonicalName);
      assert.equal(squadEvidence(text(name,.75)).evidence.identity.tier,"medium");
      assert.equal(squadEvidence(text(name,.4)).name,null);
    }
    for(const context of HERO_APPEARANCE_CONTEXTS){
      assert.equal(recognitionHeroName(`${hero.displayName} ${context.id}`),hero.canonicalName);
      assert.equal(recognitionHeroName(`${context.id} ${hero.displayName}`),hero.canonicalName);
      const portrait=squadEvidence(visual(hero.displayName,context.id));
      assert.equal(portrait.name,hero.canonicalName);
      assert.equal(portrait.evidence.identity.tier,"medium");
      assert.equal(portrait.evidence.identity.requires_confirmation,true);
      assert.equal(portrait.evidence.identity.portrait.reference_verified,false);
      const combined=squadEvidence({...text(hero.displayName),...visual(hero.displayName,context.id)});
      assert.equal(combined.name,hero.canonicalName);assert.equal(combined.evidence.identity.tier,"strong");
    }
    assert.ok(hero.appearances.find(a=>a.id==="normal").references.length>0);
    assert.ok(hero.appearances.filter(a=>a.id!=="normal").every(a=>a.availability==="unverified"&&!a.references.length));
  });
}
test("entire-roster OCR fragments do not depend on old or confirmed profile names",()=>{
  for(const hints of [[],["Mason","Murphy"],["Maxwell"]]){
    assert.equal(squadEvidence({name_text:"Maxw",name_evidence:"visible_fragment",name_confidence:.95},hints).name,"Maxwell");
    assert.equal(squadEvidence({name_text:"Mar",name_evidence:"visible_fragment",name_confidence:.99},hints).name,null);
  }
});
test("invalid/low visual scores, unsupported contexts and insufficient features remain blank",()=>{
  for(const score of [null,NaN,1.5,-.1,.4,true,[.95],{}])assert.equal(squadEvidence(visual("DVA","normal",score)).name,null);
  assert.equal(squadEvidence(visual("Not a roster hero")).name,null);
  assert.equal(squadEvidence(visual("DVA","invented_skin")).name,null);
  assert.equal(squadEvidence({portrait:{...visual("DVA").portrait,visible_features:["one detail"]}}).name,null);
  assert.equal(squadEvidence({name:"DVA",name_evidence:"portrait",name_confidence:.99}).name,null);
  assert.equal(squadEvidence({portrait:{...visual("DVA").portrait,reference_verified:true}}).evidence.identity.portrait.reference_verified,false);
});
test("contradictory OCR/name/portrait never selects one identity automatically",()=>{
  assert.equal(squadEvidence({...text("DVA"),name:"Mason"}).name,null);
  const clash=squadEvidence({...text("DVA"),...visual("Mason")});
  assert.equal(clash.name,null);assert.equal(clash.evidence.identity.method,"conflicting_identity");
  assert.equal(clash.evidence.identity.tier,"low");
  assert.equal(squadEvidence({name_text:"Mar",name_evidence:"visible_fragment",name_confidence:.96,...visual("Mason")}).name,null);
});
test("31 names are present in prompts; old shortlist does not constrain recognition",()=>{
  const prompt=heroRecognitionPrompt();
  for(const names of Object.values(expected))for(const name of names)assert.ok(prompt.includes(name));
  assert.match(prompt,/No priority/);assert.match(prompt,/no verified portrait reference library/i);
  assert.match(promptFor("squad1","fr",""),/Separate visual proposals/);
});
test("selected squad stays isolated, individual units are parsed and duplicates remain unresolved",()=>{
  const extracted={squads:[{id:2,power:"44,43M",heroes:[
    {...text("DVA"),power_text:"5,65M",power_confidence:.96},
    {...text("DVA Awakening"),power_text:"5M",power_confidence:.96}
  ]}]};
  const patch=sanitize(extracted,at,"squad1");
  assert.equal(patch.squads[0].id,1);assert.equal(patch.squads[1],null);
  assert.equal(patch.squads[0].heroes[0].power,5650000);
  assert.equal(patch.squads[0].heroes[1].name,"DVA");
  const result=applyReviewedSquad({squads:[]},{squadId:1,heroes:patch.squads[0].heroes,updatedAt:at,identityReviewConfirmed:true});
  assert.equal(result.complete,false);
  assert.equal(result.pending.filter(p=>p.reason==="duplicate").length,2);
});
test("medium proposals cannot become confirmed without explicit review; player can correct all five",()=>{
  const names=["Kimberly","Murphy","Marshall","DVA","Stetmann"];
  const patch=sanitize({squads:[{power:"44,43M",heroes:names.map(name=>({...visual(name),level:150,stars:5,power_text:"5M",power_confidence:.96}))}]},at,"squad1");
  const evidence=patch.squads[0].heroes.map(h=>h.scan_evidence);
  const input={player_id:"owner",squads:[],beta_grant:"unchanged",pro_grant:"unchanged"};
  const args={squadId:1,heroes:patch.squads[0].heroes,evidence,updatedAt:at,powerConfirmed:true};
  const unreviewed=applyReviewedSquad(input,args);
  assert.equal(unreviewed.complete,false);assert.ok(unreviewed.state.squads[0].heroes.every(h=>!h.name));
  assert.deepEqual(confirmedSquadHints(unreviewed.state,1,"owner"),[]);
  const corrected=args.heroes.map((h,i)=>({...h,name:i===0?"Williams":h.name}));
  const reviewed=applyReviewedSquad(input,{...args,heroes:corrected,identityReviewConfirmed:true});
  assert.equal(reviewed.complete,true);assert.equal(reviewed.state.squads[0].heroes[0].name,"Williams");
  assert.equal(reviewed.state.beta_grant,"unchanged");assert.equal(reviewed.state.pro_grant,"unchanged");
});
test("uncertain detections cannot overwrite an existing explicitly confirmed composition",()=>{
  const names=["Kimberly","Murphy","Marshall","DVA","Stetmann"];
  const input={player_id:"owner",squads:[{id:1,confirmed_composition:names,composition_source:"explicit_confirmation",
    composition_confirmed_at:at,heroes:names.map(name=>({name,power:5000000}))}]};
  const medium=HERO_CATALOG.slice(0,5).map(name=>squadEvidence(visual(name)));
  const result=applyReviewedSquad(input,{squadId:1,heroes:medium.map(x=>({name:x.name,power:9000000})),
    evidence:medium.map(x=>x.evidence),updatedAt:at});
  assert.deepEqual(result.state.squads[0].heroes.map(h=>h.name),names);
  assert.ok(result.state.squads[0].heroes.every(h=>h.power===5000000));
});
test("five editable 31-hero selectors exist even for a completely unreadable formation",()=>{
  const patch={squads:[{power:44.43,heroes:Array.from({length:5},()=>({}))}]};
  const groups=buildScanReviewGroups("squad1",patch);
  const names=groups.flatMap(g=>g.rows).filter(r=>r.field==="name");
  assert.equal(names.length,5);
  const html=renderScanReviewMarkup(groups,key=>key,String).html;
  assert.equal((html.match(/<select /g)||[]).length,5);
  for(const name of HERO_CATALOG)assert.equal(html.split(`value="${name}"`).length-1,5);
});
test("review shows medium state, unverified portrait provenance and escapes visual observations",()=>{
  const observation=squadEvidence(visual("DVA"));
  observation.evidence.identity.portrait.visible_features=["<script>bad</script>","second visible detail"];
  const groups=buildScanReviewGroups("squad1",{squads:[{heroes:[{name:"DVA"}]}]},[observation.evidence]);
  const esc=x=>String(x).replaceAll("<","&lt;").replaceAll(">","&gt;");
  const html=renderScanReviewMarkup(groups,key=>key,esc).html;
  assert.match(html,/scan_review_identity_medium/);assert.match(html,/scan_review_identity_visual_unverified/);
  assert.match(html,/data-scan-review-identity-ack=/);
  assert.doesNotMatch(html,/data-scan-review-identity-ack="[^"]+" checked/);
  assert.doesNotMatch(html,/<script>/);
  const app=fs.readFileSync("app.js","utf8");
  assert.match(app,/applyReviewedSquad\([^;]+identityReviewConfirmed:true/);
});
test("actual form collector excludes unchecked proposals but accepts individual acknowledgement/correction",()=>{
  const names=["Kimberly","Murphy","Marshall","DVA","Stetmann"];
  const observations=names.map(name=>squadEvidence(visual(name)));
  const patch={squads:[{power:44.43,heroes:observations.map(x=>({name:x.name,level:150,stars:5,power:5000000}))}]};
  const evidence=observations.map(x=>x.evidence);
  const groups=buildScanReviewGroups("squad1",patch,evidence).map(g=>({...g,rows:g.rows.filter(r=>r.field==="name")}));
  const markup=renderScanReviewMarkup(groups,x=>x,String);
  const inputs=markup.rows.map(row=>({value:row.value,validity:{badInput:false}}));
  const acknowledgements=inputs.map(()=>({checked:false}));
  const container={querySelector(selector){
    const id=Number(selector.match(/="(\d+)"/)?.[1]);
    return selector.includes("identity-ack")?acknowledgements[id]:inputs[id];
  }};
  const app=fs.readFileSync("app.js","utf8"),start=app.indexOf("function scanReviewFormEdits(draft){");
  assert.ok(start>=0);
  const code=app.slice(start,app.indexOf("\nfunction ",start+1));
  const collect=Function("$","canonicalStoredHeroName",`return (${code});`)(()=>container,canonicalHeroName);
  const draft={owner:"owner",type:"squad1",patch,displayRows:markup.rows};
  let form=collect(draft);
  assert.ok(form.edits.every(edit=>edit.value===""));
  assert.equal(form.issues.length,5);
  let owned=applyOwnedScanReview(draft,"owner",form.edits);
  let applied=applyReviewedSquad({},{
    squadId:1,heroes:owned.patch.squads[0].heroes,evidence,identityReviewConfirmed:true,updatedAt:at
  });
  assert.equal(applied.complete,false);assert.deepEqual(confirmedSquadHints(applied.state,1,"owner"),[]);
  assert.equal(owned.patch.squads[0].power,44.43);
  inputs[0].value="Williams";acknowledgements.slice(1).forEach(ack=>{ack.checked=true});
  form=collect(draft);
  assert.equal(form.issues.length,0);
  owned=applyOwnedScanReview(draft,"owner",form.edits);
  applied=applyReviewedSquad({player_id:"owner"},{
    squadId:1,heroes:owned.patch.squads[0].heroes,evidence,identityReviewConfirmed:true,updatedAt:at
  });
  assert.equal(applied.complete,true);
  assert.deepEqual(confirmedSquadHints(applied.state,1,"owner"),["Williams",...names.slice(1)]);
  assert.equal(applyOwnedScanReview(draft,"another-owner",form.edits),null);
});
test("low confidence does not expose an unsupported visual identity as a name suggestion",()=>{
  const observation=squadEvidence(visual("Kimberly","normal",.4));
  const groups=buildScanReviewGroups("squad1",{squads:[{heroes:[{}]}]},[observation.evidence]);
  const html=renderScanReviewMarkup(groups,x=>x,String).html;
  assert.match(html,/scan_review_identity_low/);
  assert.doesNotMatch(html,/scan_review_identity_visual_unverified/);
  assert.doesNotMatch(html,/value="Kimberly" selected/);
});
console.log(`PASS ${checks} whole-roster recognition scenarios (31 heroes × all appearance contexts); synthetic evidence, not a live Vision accuracy benchmark`);
