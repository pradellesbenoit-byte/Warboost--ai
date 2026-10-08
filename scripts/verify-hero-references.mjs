import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {HERO_DEFINITIONS,catalogHeroName} from "../lib/heroes.js";
import {HERO_REFERENCE_INDEX} from "../lib/hero-reference-index.js";
import {loadHeroReferenceImages,heroReferenceRequestContent} from "../api/_hero-reference-images.js";
import {recognizeHeroIdentity} from "../lib/hero-recognition.js";
import {squadEvidence} from "../lib/squad-scan-evidence.js";
import {sanitize,visionRequestContent} from "../api/scan.js";

const manifest=JSON.parse(await readFile("research/hero-references/manifest.json","utf8"));
const bank=await loadHeroReferenceImages();
let checks=0;
const test=(label,fn)=>{fn();checks++;console.log(`PASS ${label}`)};
const visual=(ref,score=.95)=>({portrait:{candidate_name:ref.canonicalName,variant:ref.variant,
  reference_id:ref.id,confidence:score,visible_features:["visible distinctive hair/helmet","visible distinctive facial detail"]}});
test("58 actual local references and four complete, private, hash-checked atlases",()=>{
  assert.equal(bank.available,true);assert.equal(bank.references.length,58);assert.equal(bank.atlases.length,4);
  assert.deepEqual(new Set(bank.references.map(r=>r.id)),new Set(HERO_REFERENCE_INDEX.map(r=>r.id)));
  assert.ok(bank.atlases.every(a=>a.imageUrl.startsWith("data:image/jpeg;base64,")));
});
const hashes=new Map();
for(const hero of HERO_DEFINITIONS){
  test(`${hero.displayName||hero.name}: actual game thumbnail, named source, canonical alias and mandatory confirmation`,()=>{
    const refs=manifest.references.filter(r=>r.canonicalName===hero.name);
    const thumb=refs.find(r=>r.id.endsWith(".fandom"));assert.ok(thumb);
    assert.equal(catalogHeroName(thumb.sourceName),hero.name);
    assert.ok(thumb.width>=70&&thumb.height>=70);
    for(const ref of refs){
      const host=new URL(ref.sourceImage).hostname;
       assert.ok(["www.lastwar.com","lastwar.wiki","static.wikia.nocookie.net","cpt-hedge.com"].includes(host));
       assert.equal(ref.status,"verified");
      if(hashes.has(ref.sha256))assert.equal(hashes.get(ref.sha256),hero.name);
      hashes.set(ref.sha256,hero.name);
      const found=recognizeHeroIdentity(visual(ref),bank.references);
      assert.equal(found.name,hero.name);assert.equal(found.evidence.tier,"medium");
      assert.equal(found.evidence.requires_confirmation,true);
      assert.equal(found.evidence.portrait.reference_verified,true);
      assert.equal(found.evidence.portrait.match_verified,false);
    }
  });
}
test("only three pending UR promotions; EW equipment is not a missing visual variant",()=>{
  assert.equal(manifest.unverifiedVariants.length,3);
  assert.ok(manifest.unverifiedVariants.every(r=>r.status==="unverified"&&r.file===null));
  assert.equal(manifest.unverifiedVariants.filter(r=>r.variant==="awakening").length,0);
  assert.equal(manifest.unverifiedVariants.filter(r=>r.variant==="ssr_to_ur").length,3);
  assert.equal(manifest.unverifiedVariants.filter(r=>r.variant==="exclusive_weapon").length,0);
  assert.deepEqual(manifest.unverifiedVariants.map(r=>r.name).sort(),["Mason","Scarlett","Violet"]);
  assert.equal(manifest.equipmentAudit.length,15);
  assert.equal(new Set(manifest.equipmentAudit.map(r=>r.name)).size,15);
  assert.ok(manifest.equipmentAudit.every(r=>r.weaponType==="exclusive_weapon"&&r.visualChangeStatus==="not_established"&&r.file===null));
  assert.ok(!bank.references.some(r=>r.variant==="exclusive_weapon"));
  assert.ok(manifest.unverifiedVariants.every(r=>!bank.references.some(x=>x.canonicalName===r.name&&x.variant===r.variant)));
});
for(const ref of manifest.references.filter(r=>r.variant!=="normal")){
  test(`${ref.canonicalName} ${ref.variant}: real cropped variant maps to the same hero, never to a new identity`,()=>{
    assert.ok(ref.variantEvidence&&ref.visualChange&&ref.comparisonSource);
    assert.match(ref.sourceSha256,/^[a-f0-9]{64}$/);
    assert.equal(ref.transformation.type,"unaltered_rectangular_crop");
    assert.equal(ref.width,ref.transformation.width);assert.equal(ref.height,ref.transformation.height);
    const observation=recognizeHeroIdentity(visual(ref),bank.references);
    assert.equal(observation.name,ref.canonicalName);
    assert.equal(observation.evidence.portrait.variant,ref.variant);
    assert.equal(observation.evidence.portrait.reference_verified,true);
    assert.equal(observation.evidence.portrait.match_verified,false);
    assert.equal(observation.evidence.requires_confirmation,true);
    assert.equal(recognizeHeroIdentity(visual(ref,.4),bank.references).name,null);
    const changed={...visual(ref).portrait,variant:"normal"};
    assert.equal(recognizeHeroIdentity({portrait:changed},bank.references).evidence.portrait.reference_verified,false);
    const conflicting=recognizeHeroIdentity({...visual(ref),name_text:"Murphy",name_evidence:"visible_text",name_confidence:.99},bank.references);
    assert.equal(conflicting.name,null);
    const saved=sanitize({squads:[{heroes:[visual(ref)]}]},"2026-10-07T00:00:00Z","squad1",[],bank.references);
    assert.equal(saved.squads[0].heroes[0].name,ref.canonicalName);
    assert.equal(saved.squads[0].heroes[0].scan_evidence.identity.requires_confirmation,true);
  });
}
test("provider flags, unknown IDs, cross-hero IDs and mismatched variants never grant reference verification",()=>{
  const ref=bank.references.find(r=>r.canonicalName==="DVA");
  assert.equal(recognizeHeroIdentity({...visual(ref),reference_verified:true}).evidence.portrait.reference_verified,false);
  for(const override of [{reference_id:"fake"},{candidate_name:"Tesla"},{variant:"awakening"}]){
    const raw={portrait:{...visual(ref).portrait,...override,reference_verified:true}};
    assert.equal(recognizeHeroIdentity(raw,bank.references).evidence.portrait.reference_verified,false);
  }
  assert.equal(recognizeHeroIdentity(visual(ref,.4),bank.references).name,null);
});
test("reliable OCR conflicting with a portrait stays unresolved; source proof never verifies the match",()=>{
  const ref=bank.references.find(r=>r.canonicalName==="DVA");
  const result=recognizeHeroIdentity({...visual(ref),name_text:"Tesla",name_evidence:"visible_text",name_confidence:.99},bank.references);
  assert.equal(result.name,null);assert.equal(result.evidence.method,"conflicting_identity");
  const agreeing=recognizeHeroIdentity({...visual(ref),name_text:"DVA",name_evidence:"visible_text",name_confidence:.99},bank.references);
  assert.equal(agreeing.evidence.tier,"strong");assert.equal(agreeing.evidence.requires_confirmation,true);
});
test("44.43 M partial scan remains partial and does not acquire old names or another squad identity",()=>{
  const input={squads:[{id:2,power_m:44.43,heroes:[]}],reference_verified:true};
  const out=sanitize(input,"2026-10-07T00:00:00Z","squad1",["Mason","Murphy","Violet","Kimberly","Monica"],bank.references);
  assert.equal(out.squads[0].id,1);assert.equal(out.squads[0].power,44.43);
  assert.equal(out.squads[1],null);assert.ok(out.squads[0].heroes.every(h=>!h.name));
  const ref=bank.references.find(r=>r.canonicalName==="DVA");
  assert.equal(squadEvidence({...visual(ref),power_text:"8,45 M",power_confidence:.96},[],bank.references).power,8450000);
});
const content=heroReferenceRequestContent(bank);
test("actual reference bytes are attached and labels cannot be used as capture OCR or gameplay values",()=>{
  assert.equal(content.filter(x=>x.type==="input_image").length,4);
  assert.match(content[0].text,/not a player capture/);assert.match(content[0].text,/Never extract power/);
  assert.match(content[0].text,/NEVER infer that the scanned player owns Awakening/);
  assert.match(content[0].text,/new_appearance_preview/);assert.match(content[0].text,/promotion_preview/);
  for(const hero of HERO_DEFINITIONS)assert.ok(content[0].text.includes(hero.name));
  assert.deepEqual(heroReferenceRequestContent({available:false}),[]);
});
for(const corruption of ["source-image","atlas","path","status","canonical","duplicate-atlas"]){
  const corruptRead=async(url,encoding)=>{
    const data=await readFile(url,encoding);
    if(corruption==="source-image"&&String(url).includes("/images/"))return Buffer.from("wrong source bytes");
    if(corruption==="atlas"&&String(url).includes("/atlases/"))return Buffer.from("wrong atlas bytes");
    if(String(url).endsWith("/manifest.json")){
      const modified=JSON.parse(data);
      if(corruption==="path")modified.references[0].file="../package.json";
      if(corruption==="status")modified.references[0].status="unverified";
      if(corruption==="canonical")modified.references[0].canonicalName="Tesla";
      if(corruption==="duplicate-atlas")modified.atlases[1]=modified.atlases[0];
      return JSON.stringify(modified);
    }return data;
  };
  assert.equal((await loadHeroReferenceImages({read:corruptRead})).available,false);
  checks++;console.log(`PASS fail-closed ${corruption}`);
}
// Test the exact builder used by the production request, without credentials,
// network calls, paid inference or a pretend accuracy benchmark.
test("existing OpenAI route builds player capture plus four real atlas images in a single request",()=>{
  const content=visionRequestContent({image:"data:image/png;base64,VEVTVA==",scanType:"squad1",locale:"fr",referenceBank:bank});
  const images=content.filter(c=>c.type==="input_image");
  assert.equal(images.length,5);assert.equal(images[0].image_url,"data:image/png;base64,VEVTVA==");
  assert.ok(images.slice(1).every(c=>c.image_url.startsWith("data:image/jpeg;base64,")));
  const other=visionRequestContent({image:"data:image/png;base64,VEVTVA==",scanType:"drone",locale:"fr",referenceBank:bank});
  assert.equal(other.filter(c=>c.type==="input_image").length,1);
});
const vercel=JSON.parse(await readFile("vercel.json","utf8"));
test("Vercel packages private reference files only for the scan function",()=>{
  assert.equal(vercel.functions["api/scan.js"].includeFiles,"research/hero-references/**");
  assert.equal(vercel.outputDirectory,"web-dist");
});
console.log(`PASS ${checks} hero-reference checks (source identity/integration, NOT real-capture accuracy)`);
