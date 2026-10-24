import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {scopedDiagnosticState,buildKnowledgeGuidance,applicableOfficialFacts} from "../lib/knowledge-guidance.js";
import {refreshKnowledgeSnapshot,approvedSource,robotsAllowed,visibleText,discoverPublicNotices} from "../server/_knowledge.js";
import {renderKnowledgeGuidance} from "../lib/knowledge-guidance-ui.js";
import {knowledgeCopy,KNOWLEDGE_LOCALES} from "../lib/knowledge-copy.js";
import {playerAdviceInputSignature} from "../lib/player-advice-signature.js";
import {resolveDiagnosticState,buildGlobalDiagnostic} from "../lib/player-global-diagnostic.js";
import adviceHandler,{buildPlayerAnalysis} from "../api/advice.js";

let checks=0;
function test(name,fn){fn();checks++;console.log("PASS",name)}
const at="2026-10-11T10:00:00Z",now=Date.parse(at),old="2026-10-08T10:00:00Z";
const lineups=[
  ["Murphy","Kimberly","Williams","Marshall","Stetmann"],
  ["Carlie","Lucius","DVA","Morrison","Schuyler"],
  ["Adam","McGregor","Tesla","Fiona","Swift"],
  ["Mason","Violet","Scarlett","Monica","Richard"]];
const confirmed=values=>({...values,source:"confirmed_scan",updated_at:at,
  field_source:Object.fromEntries(Object.keys(values).map(key=>[key,"confirmed_scan"])),
  field_updated_at:Object.fromEntries(Object.keys(values).map(key=>[key,at]))});
const state={player:confirmed({hq_level:30}),squads:lineups.map((names,index)=>({
  ...confirmed({power:44.43+index}),id:index+1,composition_source:"explicit_confirmation",
  composition_confirmed_at:at,confirmed_composition:names,last_confirmed_scan_at:at,
  heroes:names.map((name,slot)=>confirmed({name,level:150+slot,stars:3+slot%3,exclusive:1+slot,
    gear:slot===0?"count=4;levels=0,10,20,30;rarity=gold":"count=4;level=30;rarity=gold"}))})),
  hero_profiles:[confirmed({hero_name:"DVA",level:999})],
  exclusive_weapons:[confirmed({hero_name:"Murphy",level:99})]};
const original=JSON.stringify(state);
for(let id=1;id<=4;id++){
  test(`squad ${id} exact slots, isolation and latest confirmed scan`,()=>{
    const scoped=scopedDiagnosticState(state,id),guide=buildKnowledgeGuidance(state,{},id,{now});
    assert.equal(guide.squad_id,id);assert.equal(guide.last_scan_used,at);
    assert.equal(scoped.state.squads.filter(row=>row.heroes.length).length,1);
    assert.equal(scoped.state.hero_profiles.length,0);assert.equal(scoped.state.exclusive_weapons.length,0);
    assert.equal(scoped.squad.heroes[0].name,lineups[id-1][0]);
    assert.ok(guide.recommendations.every(row=>!row.target||lineups[id-1].includes(row.target)));
    const resolved=resolveDiagnosticState(scoped.state),analysis=buildPlayerAnalysis(resolved,"fr");
    assert.ok(analysis);assert.ok(buildGlobalDiagnostic(resolved,analysis,"fr"));
  });
}
test("no persisted data or profile mutations",()=>assert.equal(JSON.stringify(state),original));
test("invalid squad rejected, never redirected to Squad 1",()=>assert.throws(()=>scopedDiagnosticState(state,5),/invalid/));
test("legacy composition never becomes advice identity",()=>{
  const legacy=structuredClone(state);legacy.squads[0].composition_source="legacy_backfill";
  const guide=buildKnowledgeGuidance(legacy,{},1,{now});
  assert.equal(guide.composition.length,0);assert.ok(guide.missing.includes("formation_identity"));
});
test("uncertain level cannot rank as confirmed",()=>{
  const uncertain=structuredClone(state);uncertain.squads[0].heroes[0].field_source.level="ocr";
  assert.equal(scopedDiagnosticState(uncertain,1).squad.heroes[0].level,null);
});
test("latest partial identity warning cannot promote the older composition to current",()=>{
  const partial=structuredClone(state);
  partial.squads[0].composition_conflict={scan_pending:[{slot:2,field:"name",reason:"unlinked"}]};
  const guide=buildKnowledgeGuidance(partial,{},1,{now});
  assert.equal(guide.composition.length,0);assert.ok(guide.missing.includes("formation_identity"));
  assert.deepEqual(partial.squads[0].confirmed_composition,lineups[0]);
});
test("official hero alias remains one compatible identity",()=>{
  const air=buildKnowledgeGuidance(state,{...snapshotForAlias()},2,{now});
  function snapshotForAlias(){return {sources:[{id:"alias",kind:"official",editorial:"publisher",status:"verified",
    url:"https://wiki.lastwar.com/notice",content_hash:"f".repeat(64),verified_at:at}],facts:[{
      id:"alias-fact",source_id:"alias",source_url:"https://wiki.lastwar.com/notice",approved_source_hash:"f".repeat(64),
      statement:"Synthetic explicit alias notice for testing only.",hero:"Skyler",topic:"exclusive",scope:{kind:"global"},
      review_status:"approved",confidence:"confirmed",evidence_verified:true,published_at:old,reviewed_at:at,verified_at:at}]}}
  assert.equal(air.applicable_facts.length,1);
});
test("equipment 0 is known, individual levels and partial gaps survive",()=>{
  const guide=buildKnowledgeGuidance(state,{},1,{now});
  assert.ok(guide.recommendations.find(row=>row.topic==="gear"&&row.target==="Murphy"));
  assert.match(guide.recommendations.find(row=>row.topic==="gear").used_data[0].value,/0,10,20,30/);
});
test("new scan replaces previous values, JSON reload preserves target",()=>{
  const next=structuredClone(state);next.diagnostic_squad_id=2;
  next.squads[1].heroes[0]=confirmed({...next.squads[1].heroes[0],level:155});
  next.squads[1].last_confirmed_scan_at=old;
  assert.notEqual(playerAdviceInputSignature(next),playerAdviceInputSignature(state));
  const restored=JSON.parse(JSON.stringify(next));
  assert.equal(buildKnowledgeGuidance(restored,{},undefined,{now}).squad_id,2);
  assert.equal(scopedDiagnosticState(restored,2).squad.heroes[0].level,155);
  assert.equal(restored.squads[0].heroes[0].level,150);
});
const quote="Official fixture announcement: equipment adjustments apply to this region and season only; check the game before spending resources.";
const hash=createHash("sha256").update(quote).digest("hex");
const source={id:"notice",url:"https://wiki.lastwar.com/public-fixture-notice",kind:"official",
  editorial:"publisher",enabled:true,status:"verified",verified_at:at,content_hash:hash};
const fact={id:"fixture-only-never-shipped",source_id:"notice",source_url:source.url,
  topic:"gear",statement:quote,evidence_quote:quote,approved_source_hash:hash,
  published_at:old,reviewed_at:at,verified_at:at,review_status:"approved",confidence:"confirmed",
  evidence_verified:true,scope:{kind:"global"}};
const snapshot={revision:"test",sources:[source],facts:[fact]};
test("dated approved official fact applies and recomputes recommendations",()=>{
  const noNews=buildKnowledgeGuidance(state,{sources:[source],facts:[]},1,{now});
  const changed=buildKnowledgeGuidance(state,snapshot,1,{now});
  assert.equal(noNews.official_rules_available,false);assert.equal(changed.applicable_facts.length,1);
  assert.equal(changed.recommendations.find(row=>row.topic==="gear").source_confidence,"high");
  assert.equal(changed.recommendations.find(row=>row.topic==="gear").confidence,"medium");
  assert.equal(noNews.recommendations.find(row=>row.topic==="gear").confidence,"medium");
  assert.equal(changed.purchase_recommended,false);assert.equal(changed.seven_day_plan.length,7);
});
for(const [name,patch] of [
  ["community source",{sources:[{...source,kind:"community"}]}],
  ["mixed editorial homepage",{sources:[{...source,editorial:"mixed"}]}],
  ["unavailable source",{sources:[{...source,status:"unavailable"}]}],
  ["not reviewed",{facts:[{...fact,review_status:"pending"}]}],
  ["stale verification",{facts:[{...fact,verified_at:"2026-09-01T00:00:00Z"}]}],
  ["unknown publication",{facts:[{...fact,published_at:null}]}],
  ["unknown region",{facts:[{...fact,scope:{kind:"region",region:"EU"}}]}],
  ["unknown HQ",{facts:[{...fact,scope:{kind:"global",hq_min:30}}]}],
  ["wrong season",{facts:[{...fact,scope:{kind:"global",season:6}}]}],
  ["wrong server",{facts:[{...fact,scope:{kind:"global",server:"999"}}]}],
  ["wrong version",{facts:[{...fact,scope:{kind:"global",version:"future"}}]}],
  ["wrong hero",{facts:[{...fact,hero:"DVA"}]}],
  ["future publication",{facts:[{...fact,published_at:"2030-01-01"}]}]
])test(`${name} cannot masquerade as applicable official gameplay`,()=>{
  assert.equal(applicableOfficialFacts({...snapshot,...patch},{heroes:lineups[0]},now).length,0);
});
test("squad-scoped eligibility, region and season must all match",()=>{
  assert.equal(applicableOfficialFacts({...snapshot,facts:[{...fact,scope:{kind:"region",region:"EU",season:6,squad_type:"tank"}}]},
    {region:"EU",season:6,squad_type:"aircraft"},now).length,0);
});
test("source allowlist blocks SSRF, credentials, alternate ports",()=>{
  for(const url of ["http://wiki.lastwar.com/","https://localhost/","https://127.0.0.1/","https://wiki.lastwar.com:444/","https://user:pass@wiki.lastwar.com/","https://wiki.lastwar.com/api/player"])
    assert.equal(approvedSource({...source,url}),false);
});
test("public notice discovery creates pending evidence, not confirmed gameplay",()=>{
  const notices=discoverPublicNotices('<a href="/notice/patch">New season update</a><a href="https://evil.example/">New hero update</a>',source,at);
  assert.equal(notices.length,1);assert.equal(notices[0].published_at,null);
  assert.equal(notices[0].review_status,"requires_article_review");assert.equal(notices[0].author_verified,false);
});
test("robots rules including specific agent, wildcard and end anchors",()=>{
  assert.equal(robotsAllowed("User-agent: *\nDisallow: /", "/"),false);
  assert.equal(robotsAllowed("User-agent: *\nDisallow: /private\nAllow: /private/public","/private/public"),true);
  assert.equal(robotsAllowed("User-agent: WarBoost-Public-Knowledge-Check\nDisallow: /","/news"),false);
  assert.equal(robotsAllowed("User-agent: *\nDisallow: /*.png$","/image.png"),false);
});
const fetchFixture=async url=>new Response(String(url).endsWith("robots.txt")?"User-agent: *\nAllow: /":quote,{status:200});
const refreshed=await refreshKnowledgeSnapshot(snapshot,{fetchImpl:fetchFixture,now:at});
test("actual refresh pipeline with controlled HTTP responses validates exact reviewed quote and digest",()=>{
  assert.equal(refreshed.facts[0].evidence_verified,true);assert.equal(refreshed.sources[0].status,"verified");
  assert.equal(refreshed.sources[0].text,undefined);
});
const altered=await refreshKnowledgeSnapshot(snapshot,{fetchImpl:async url=>new Response(String(url).endsWith("robots.txt")?"User-agent: *\nAllow: /":quote+" Changed rule.",{status:200}),now:at});
test("changed page invalidates approval, no auto-promoted gameplay",()=>assert.equal(altered.facts[0].evidence_verified,false));
const failed=await refreshKnowledgeSnapshot(snapshot,{fetchImpl:async()=>new Response("",{status:503}),now:at});
test("source failure preserves dated provenance but blocks applicability",()=>{
  assert.equal(failed.facts[0].evidence_verified,false);assert.equal(failed.facts[0].verified_at,at);
  assert.equal(applicableOfficialFacts(failed,{},now).length,0);
});
test("22 actual locale renderers, no untranslated tokens, safe source and player content",()=>{
  assert.equal(KNOWLEDGE_LOCALES.length,22);
  for(const locale of KNOWLEDGE_LOCALES){
    const copy=knowledgeCopy(locale),html=renderKnowledgeGuidance(buildKnowledgeGuidance(state,snapshot,1,{now}),{locale});
    assert.ok(Object.values(copy).every(value=>value.trim()));assert.ok(html.includes(copy.title));
    assert.ok(!html.includes("undefined"));assert.ok(html.includes("data-diagnostic-squad"));
  }
  const guide=buildKnowledgeGuidance(state,{},1,{now});guide.missing=["gear:<img onerror=alert(1)>"];
  assert.ok(!renderKnowledgeGuidance(guide).includes("<img"));
  assert.equal(visibleText("<script>secret</script><h1>Public</h1>"),"Public");
});
for(const action of ["knowledge_refresh","knowledge_status"]){
  let code=0;
  const res={status(status){code=status;return this},json(value){return value},setHeader(){}};
  await adviceHandler({method:"POST",headers:{},query:{action},body:{}},res);
  test(`${action} requires authenticated product access before any public fetch`,()=>assert.equal(code,401));
}
console.log(`PASS knowledge guidance: ${checks} checks; fixtures are synthetic, no Vision call, no player images.`);
