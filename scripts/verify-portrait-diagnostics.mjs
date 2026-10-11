import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {sanitizeFormationBatch} from "../api/scan.js";
import {loadHeroReferenceImages,heroReferenceRequestContent} from "../api/_hero-reference-images.js";
import {recognizeHeroIdentity} from "../lib/hero-recognition.js";
import {portraitDiagnosticLabel} from "../lib/portrait-diagnostics.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {formationBatchPrompt} from "../lib/formation-batch.js";

const bank=await loadHeroReferenceImages();
assert.equal(bank.available,true);
assert.equal(new Set(bank.references.map(ref=>ref.canonicalName)).size,31);
const dva=bank.references.filter(ref=>ref.canonicalName==="DVA");
assert.equal(dva.length,4);
const base=dva.find(ref=>ref.id==="dva.normal.fandom");
const other=bank.references.find(ref=>ref.canonicalName==="Kimberly"&&ref.variant==="normal");
const portrait=(changes={})=>({candidate_name:"DVA",confidence:.96,variant:"normal",
  reference_id:base.id,visible_features:["curly hair","black jacket"],...changes});
const raw=changes=>({captures:[{image_index:0,screen_type:"formation_details",exclusive_weapons:[],squads:[{
  power:"44,43 M",power_confidence:.99,heroes:Array.from({length:5},(_,index)=>({
    name_text:null,name_evidence:"unreadable",name_confidence:null,name_image_index:0,
    level:155,level_confidence:.99,stars:5,stars_confidence:.99,portrait:index===0?portrait(changes):null
  }))
}]},{image_index:1,screen_type:"exclusive_weapon_detail",squads:[],exclusive_weapons:[{
  hero_name:"D.V.A",name_text:"DVA",name_evidence:"visible_text",name_confidence:.99,
  visible_title:"Lame de Frappe — DVA",weapon_name:"Lame de Frappe",level:28,level_confidence:.99,
  power:7619132,hero_power:7619132
}]}]});
const parse=changes=>sanitizeFormationBatch(raw(changes),{count:2,now:"2026-10-09T12:00:00Z",scanType:"squad1",references:bank.references});
const first=result=>result.state.squads[0].heroes[0];
let checks=0;
function test(label,fn){fn();checks++;console.log(`PASS ${label}`)}

test("strong DVA portrait + actual reference is accepted and enriched, still requiring confirmation",()=>{
  const hero=first(parse());
  assert.equal(hero.name,"DVA");assert.equal(hero.exclusive,"28");
  const identity=hero.scan_evidence.identity,diagnostic=identity.portrait.diagnostic;
  assert.equal(identity.tier,"strong");assert.equal(identity.requires_confirmation,true);
  assert.equal(diagnostic.raw_confidence,.96);assert.equal(diagnostic.tier,"strong");
  assert.equal(diagnostic.accepted,true);assert.equal(diagnostic.validated_reference_id,base.id);
  assert.equal(diagnostic.reported_reference_id,base.id);
  assert.equal(diagnostic.reason,"compatible_weapon_corroboration");
  assert.equal(hero.power,undefined);assert.equal(parse().state.squads[0].power,44.43);
});
test("medium DVA is prefilled to confirm, not invented or forced strong by weapon title",()=>{
  const identity=first(parse({confidence:.75})).scan_evidence.identity;
  assert.equal(identity.candidate,"DVA");assert.equal(identity.tier,"medium");
  assert.equal(identity.portrait.diagnostic.tier,"medium");
  assert.match(portraitDiagnosticLabel(identity),/DVA proposée — confiance moyenne — à confirmer/);
});
for(const [changes,reason] of [
  [{candidate_name:null},"no_candidate"],
  [{candidate_name:"DVA / Kimberly"},"ambiguous_candidates"],
  [{confidence:.69},"confidence_below_threshold"],
  [{confidence:null},"invalid_confidence"],
  [{visible_features:["curly hair"]},"insufficient_visual_details"],
  [{reference_id:null},"missing_reference_id"],
  [{reference_id:"unknown.dva"},"reference_not_found"],
  [{reference_id:other.id},"hero_mismatch"],
  [{variant:"Awakening"},"variant_mismatch"],
  [{variant:"invented_skin"},"unsupported_variant"]
]){
  test(`${reason}: rejected slot retains evidence and named DVA weapon cannot fill it`,()=>{
    const result=parse(changes),hero=first(result),identity=hero.scan_evidence.identity;
    assert.ok(!hero.name);assert.ok(!hero.exclusive);
    assert.equal(identity.tier,"low");
    assert.equal(identity.portrait.diagnostic.reason,reason);
    assert.equal(identity.portrait.diagnostic.accepted,false);
    assert.ok(result.complementary_evidence.pending.some(proof=>proof.hero_name==="DVA"));
    assert.match(portraitDiagnosticLabel(identity),/Identité non retenue/);
  });
}
test("a known non-DVA formation identity does not receive DVA weapon",()=>{
  const hero=first(parse({candidate_name:"Kimberly",reference_id:other.id}));
  assert.equal(hero.name,"Kimberly");assert.ok(!hero.exclusive);
});
test("aliases and harmless reference formatting resolve to the exact same registered ID",()=>{
  for(const name of ["DVA","D.V.A","D V A"]){
    const hero=first(parse({candidate_name:name,reference_id:` ${base.id.toUpperCase()} `,variant:" Standard "}));
    assert.equal(hero.name,"DVA");
    assert.equal(hero.scan_evidence.identity.portrait.diagnostic.validated_reference_id,base.id);
  }
  assert.ok(!first(parse({reference_id:`https://example.org/${base.id}`})).name);
  assert.ok(!first(parse({reference_id:base.id.replaceAll(".","-")})).name);
});
test("power, levels and stars are discarded as identifying details, with trace",()=>{
  const hero=first(parse({visible_features:["level 155","5 stars","power 44.43M","curly hair"]}));
  assert.ok(!hero.name);
  const diagnostic=hero.scan_evidence.identity.portrait.diagnostic;
  assert.equal(diagnostic.reason,"insufficient_visual_details");
  assert.deepEqual(diagnostic.visible_details,["curly hair"]);
  assert.equal(diagnostic.discarded_details.length,3);
});
test("conflicting visible name and portrait preserve the rejection reason",()=>{
  const identity=recognizeHeroIdentity({name_text:"Kimberly",name_evidence:"visible_text",name_confidence:.99,portrait:portrait()},bank.references);
  assert.equal(identity.name,null);
  assert.equal(identity.evidence.portrait.diagnostic.reason,"conflicting_identity");
});
test("formation-only scan does not need an exclusive weapon to propose a verified portrait",()=>{
  const input=raw();input.captures.pop();
  const result=sanitizeFormationBatch(input,{count:1,now:"2026-10-09T12:00:00Z",scanType:"squad1",references:bank.references});
  assert.equal(first(result).name,"DVA");
  assert.equal(first(result).scan_evidence.identity.portrait.diagnostic.reason,"verified_reference_proposal");
});
test("prompt excludes drone placeholders and makes the five hero-detail rows authoritative for order",()=>{
  const prompt=formationBatchPrompt(6);
  assert.match(prompt,/SIX tiles: a drone tile followed by FIVE heroes/);
  assert.match(prompt,/must NEVER produce even a null placeholder/);
  assert.match(prompt,/row 1 -> heroes\[0\]/);
  assert.match(prompt,/gear icons to its right are NOT portraits/);
  assert.match(prompt,/never infer identity from order/);
});
test("review displays a readable rejection and escaped, expandable technical evidence",()=>{
  const result=parse({reference_id:'<script>alert(1)</script>'});
  const groups=buildScanReviewGroups("squad1",result.state,result.state.squads[0].heroes.map(hero=>hero.scan_evidence));
  const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  const {html}=renderScanReviewMarkup(groups,key=>key,escape);
  assert.match(html,/référence visuelle introuvable/);
  assert.match(html,/<details[^>]*>.*?<summary>Diagnostic du portrait<\/summary>/s);
  assert.ok(!html.includes("<script>alert(1)</script>"));
});
for(const ref of dva){
  const manifest=JSON.parse(await readFile(new URL("../research/hero-references/manifest.json",import.meta.url)));
  const metadata=manifest.references.find(row=>row.id===ref.id);
  test(`${ref.id}: canonical/variant, source crop and atlas membership verified`,()=>{
    assert.equal(metadata.canonicalName,"DVA");
    assert.equal(metadata.variant,ref.variant);
    assert.ok(bank.atlases.some(atlas=>atlas.referenceIds.includes(ref.id)));
    assert.ok(heroReferenceRequestContent(bank)[0].text.includes(ref.id));
    if(ref.variant==="awakening")assert.equal(metadata.transformation.type,"unaltered_rectangular_crop");
    const hero=first(parse({reference_id:ref.id,variant:ref.variant}));
    assert.equal(hero.name,"DVA");
  });
}
console.log(`PASS portrait diagnostics: ${checks} checks (synthetic OCR + actual verified bank; no live Vision call)`);
