import assert from "node:assert/strict";
import {buildSeason7Guidance} from "../lib/season7-guidance.js";
import {buildPlayerAnalysis,buildShopAdvice,buildAllianceAdvice,buildSeasonAdvice,buildSevenDayPlan} from "../api/advice.js";
import {buildTechnologyAdvice} from "../lib/technology-advisor.js";

let checks=0;
const test=(name,fn)=>{fn();checks++;console.log("PASS",name)};
const now=Date.now(),stamp=new Date(now).toISOString();
const active={
  season:{number:7,lifecycle:"active",lifecycle_source:"manual",updated_at:stamp,day:4,resistance:0,profession:"Engineer"},
  player:{role:"R4"},
  player_context:{objective:"vs"},
  shop:{store_type:"Season Shop",currency:"Gold Dust",currency_balance:25,offers:[{name:"sample"}],updated_at:stamp}
};

test("fresh explicit S7 state enables guidance without changing input",()=>{
  const before=JSON.stringify(active),out=buildSeason7Guidance(active,"fr-FR",now);
  assert.equal(out.status,"active_confirmed");
  assert.equal(out.active,true);
  assert.equal(out.domains.length,6);
  assert.equal(JSON.stringify(active),before);
});
test("saved zero resistance stays zero and is not labeled in-game verified",()=>{
  const row=buildSeason7Guidance(active,"fr-FR",now).domains[0];
  assert.deepEqual(row.observed,{resistance:0});
  assert.equal(row.evidence,"saved_account_field_not_independently_verified");
  assert.equal(row.status,"account_value_recorded");
  assert.equal(row.reference_status,"community_estimate");
});
test("S7 with no lifecycle source requires confirmation",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,lifecycle_source:null}},"en",now);
  assert.equal(out.status,"refresh_required");
  assert.equal(out.refresh_required,true);
  assert.deepEqual(out.domains,[]);
});
test("arbitrary lifecycle tags do not count as owner confirmation",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,lifecycle_source:"inferred"}},"en",now);
  assert.equal(out.status,"refresh_required");
});
test("day alone never activates S7",()=>{
  const out=buildSeason7Guidance({season:{number:7,day:4,updated_at:stamp}},"en",now);
  assert.equal(out.active,false);
});
test("missing timestamp blocks numeric S7 advice",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,updated_at:null}},"en",now);
  assert.equal(out.status,"refresh_required");
  assert.equal(out.numeric_upgrade_advice,false);
});
test("stale S7 state requires refresh and reveals no domain recommendations",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,updated_at:new Date(now-73*3600000).toISOString()}},"en",now);
  assert.equal(out.status,"refresh_required");
  assert.equal(out.domains.length,0);
});
test("future-dated S7 state is rejected",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,updated_at:new Date(now+10*60000).toISOString()}},"en",now);
  assert.equal(out.status,"refresh_required");
});
test("S6 remains outside S7 guidance",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,number:6}},"en",now);
  assert.equal(out.status,"not_s7");
  assert.equal(out.refresh_required,false);
  assert.deepEqual(out.domains,[]);
});
test("ended S7 does not receive active-season guidance",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,lifecycle:"ended"}},"en",now);
  assert.equal(out.status,"not_s7");
  assert.equal(out.active,false);
});
test("unknown season asks for confirmation without S7 numbers",()=>{
  const out=buildSeason7Guidance({season:{lifecycle:"unknown"}},"fr",now);
  assert.equal(out.status,"season_unconfirmed");
  assert.equal(out.refresh_required,true);
  assert.deepEqual(out.domains,[]);
  assert.match(out.summary,/actualise/i);
});
test("unknown active season number never claims S7",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,number:null}},"en",now);
  assert.equal(out.status,"season_unconfirmed");
  assert.equal(out.season_number,null);
});
test("another confirmed season receives no S7 content",()=>{
  const out=buildSeason7Guidance({...active,season:{...active.season,number:8}},"en",now);
  assert.equal(out.status,"not_s7");
  assert.equal(out.summary,null);
});
test("confirmed objective is carried only into combat-plan context",()=>{
  const vs=buildSeason7Guidance(active,"en",now).domains.find(row=>row.id==="combat_plans");
  assert.equal(vs.objective,"vs");
  assert.equal(buildSeason7Guidance({...active,player_context:{objective:"pve"}},"en",now).domains[1].objective,"pve");
  assert.equal(buildSeason7Guidance({...active,player_context:{objective:"auto"}},"en",now).domains[1].objective,"unknown");
});
test("only R4/R5 get leader-context status",()=>{
  assert.equal(buildSeason7Guidance(active,"en",now,{canonicalRoleVerified:true}).domains[2].status,"leader_context_confirmed");
  assert.equal(buildSeason7Guidance({...active,player:{role:"R3"}},"en",now,{canonicalRoleVerified:true}).domains[2].status,"server_rules_need_review");
  assert.equal(buildSeason7Guidance(active,"en",now).domains[2].status,"server_rules_need_review","client profile role is not alliance authorization");
});
test("resource evidence requires a recognized source and numeric nonnegative field",()=>{
  const withResources={...active,resources:{source:"confirmed_scan",updated_at:stamp,mithril:500,sacred_water:0,gold_dust:20}};
  assert.equal(buildSeason7Guidance(withResources,"en",now).domains[3].status,"account_resources_recorded");
  assert.equal(buildSeason7Guidance({...active,resources:{source:"confirmed_scan",updated_at:stamp,mithril:500}},"en",now).domains[3].status,"account_resources_recorded");
  assert.equal(buildSeason7Guidance({...active,resources:{source:"confirmed_scan",updated_at:stamp,mithril:null}},"en",now).domains[3].status,"cost_and_stock_unknown");
  assert.equal(buildSeason7Guidance({...active,resources:{source:"confirmed_scan",updated_at:new Date(now-73*3600000).toISOString(),mithril:500}},"en",now).domains[3].status,"cost_and_stock_unknown");
});
test("profession presence does not imply unlocked skill evidence",()=>{
  const row=buildSeason7Guidance(active,"en",now).domains[4];
  assert.equal(row.status,"profession_recorded_not_skill_verified");
  assert.match(row.guidance,/visibly unlocked/i);
  assert.equal(buildSeason7Guidance({...active,season:{...active.season,profession:""}},"en",now).domains[4].status,"profession_unknown");
});
test("shop is current only with a fresh timestamp, currency, balance, and offers list",()=>{
  assert.equal(buildSeason7Guidance(active,"en",now).domains[5].status,"fresh_observed_shop");
  const stale={...active,shop:{...active.shop,updated_at:new Date(now-13*3600000).toISOString()}};
  assert.equal(buildSeason7Guidance(stale,"en",now).domains[5].status,"offer_currency_or_balance_unknown");
  assert.equal(buildSeason7Guidance({...active,shop:{...active.shop,currency_balance:null}},"en",now).domains[5].status,"offer_currency_or_balance_unknown");
});
test("shop and resource guidance never recommend purchase or claim ROI",()=>{
  const out=buildSeason7Guidance(active,"en",now);
  assert.equal(out.purchase_recommended,false);
  assert.equal(out.guaranteed_power_gain,false);
  assert.equal(out.numeric_upgrade_advice,false);
  assert.match(out.domains[5].guidance,/discount.*alone never suggests a purchase/i);
  assert.match(out.domains[3].guidance,/no ROI is calculated/i);
});
test("sources retain official and community evidence distinctions and review dates",()=>{
  const out=buildSeason7Guidance(active,"en",now);
  assert.ok(out.sources.some(source=>source.kind==="official"&&source.url.includes("wiki.lastwar.com")));
  assert.ok(out.sources.some(source=>source.kind==="community_updated"&&source.reviewed_on==="2026-11-26"));
  assert.ok(out.domains.find(row=>row.id==="combat_plans").reference_status==="confirmed_official_reference");
  assert.ok(out.domains.find(row=>row.id==="resources").reference_status==="community_estimate");
});
test("no static building costs, production rates, temple schedule, or unlock levels are emitted",()=>{
  const out=buildSeason7Guidance(active,"en",now);
  const serialized=JSON.stringify(out);
  for(const token of ["production_per_hour","unlock_level","temple_day","upgrade_cost","roi_score"])assert.ok(!serialized.includes(token));
});
test("French and English guidance are localized and have all six domains",()=>{
  const fr=buildSeason7Guidance(active,"fr-FR",now),en=buildSeason7Guidance(active,"en-GB",now);
  assert.match(fr.summary,/S7 active confirmée/i);
  assert.match(en.summary,/S7 is active/i);
  assert.equal(fr.domains.length,6);
  assert.equal(en.domains.length,6);
});
test("all supported locale values keep a safe guidance shape",()=>{
  for(const locale of ["en","fr","es","de","it","pt","nl","zh","ja","ru","ar","pl","tr","ko","vi","th","id","uk","ro","el","cs","sv"]){
    const out=buildSeason7Guidance(active,locale,now);
    assert.equal(out.domains.length,6);
    assert.ok(out.summary);
  }
});
test("player analysis keeps S7 separate from TOP priorities",()=>{
  const out=buildPlayerAnalysis({...active,squads:[]},"fr-FR");
  assert.equal(out.season7_guidance.status,"active_confirmed");
  assert.deepEqual(out.priorities,[]);
});
test("season advice appends conditional S7 guidance and retains source metadata",()=>{
  const out=buildSeasonAdvice(active,"fr-FR");
  assert.equal(out.season7_guidance.status,"active_confirmed");
  assert.match(out.advice,/Curse Research Lab/i);
  assert.equal(out.season7_guidance.domains.length,6);
});
test("other supported locales keep their existing advice language instead of English S7 paragraphs",()=>{
  const out=buildSeasonAdvice(active,"es-ES");
  assert.equal(out.season7_guidance.status,"active_confirmed");
  assert.equal(out.season7_guidance.copy_locale,"generic");
  assert.doesNotMatch(out.advice,/Curse Research Lab|Blessing Fountain/i);
});
test("season advice for S6 does not append S7 recommendations",()=>{
  const out=buildSeasonAdvice({...active,season:{...active.season,number:6}},"fr-FR");
  assert.equal(out.season7_guidance.status,"not_s7");
  assert.doesNotMatch(out.advice,/Curse Research Lab|Blessing Fountain/i);
});
test("season advice for stale S7 asks refresh without listing S7 actions",()=>{
  const out=buildSeasonAdvice({...active,season:{...active.season,updated_at:"2026-11-20T00:00:00.000Z"}},"en-GB");
  assert.equal(out.season7_guidance.status,"refresh_required");
  assert.match(out.advice,/confirm or refresh/i);
  assert.doesNotMatch(out.advice,/Blessing Fountain|Gold Dust/i);
});
test("season advice never uses day-only inferred S7 as active",()=>{
  const inferred={season:{number:7,day:3,total_days:40,updated_at:stamp},squads:[]};
  const out=buildSeasonAdvice(inferred,"en-GB");
  assert.equal(out.lifecycle,"unknown");
  assert.equal(out.day,null);
  assert.equal(out.season_active,false);
  assert.match(out.advice,/confirm whether a season is active/i);
});
test("seven-day plan keeps quantities unpinned and uses S7 review only when active",()=>{
  const activePlan=buildSevenDayPlan(active,{focus_squad:1,priorities:[],composition:{complete:true},season7_guidance:buildSeason7Guidance(active,"en",now)});
  assert.equal(activePlan.days[5].target,"S7");
  assert.equal(activePlan.days[5].rule_key,"verify_s7_screen_before_spend");
  assert.equal(activePlan.exact_quantities,false);
  const oldPlan=buildSevenDayPlan({...active,season:{...active.season,number:6}},{focus_squad:1,priorities:[],composition:{complete:true}});
  assert.equal(oldPlan.days[5].target,null);
});
test("technology advisor receives S7 guidance without changing branch rankings",()=>{
  const state={...active,technology:{branches:{special_forces:{state:"percent",percent:0,source:"confirmed_scan",updated_at:stamp}}}};
  const out=buildTechnologyAdvice(state,{mainType:null,locale:"fr-FR",now:new Date(now)});
  assert.equal(out.season7_guidance.status,"active_confirmed");
  assert.equal(out.season7_guidance.domains[1].id,"combat_plans");
});
test("shop summary stays conditional and keeps existing purchase decisions untouched",()=>{
  const out=buildShopAdvice(active,"fr-FR",{priorities:[],focus_squad:null});
  assert.match(out.summary,/capture récente|offre/i);
  assert.equal(out.recommendations.some(row=>row.auto_buy===true),false);
});
test("R4 alliance advice gets S7 map caution but does not mutate the roster",()=>{
  const state={...active,alliance:{members:[{canonical_member_key:"m1",name:"Leader",role:"R4",power_m:10,
    updated_at:stamp,last_active_at:stamp,delta_m:1}]}};
  const before=JSON.stringify(state),out=buildAllianceAdvice(state,"fr-FR",{canonicalRoleVerified:true});
  assert.match(out.advice,/carte.*bonus.*calendrier/i);
  assert.equal(out.season7_guidance.status,"active_confirmed");
  assert.equal(JSON.stringify(state),before);
});
test("non-leader alliance advice does not claim R4/R5 authority",()=>{
  const state={...active,player:{role:"R3"},alliance:{members:[{canonical_member_key:"m1",name:"Member",role:"R3",power_m:10,
    updated_at:stamp,last_active_at:stamp,delta_m:1}]}};
  const out=buildAllianceAdvice(state,"en-GB",{canonicalRoleVerified:true});
  assert.doesNotMatch(out.advice,/For R4\/R5, verify the map/);
  assert.equal(out.season7_guidance.domains[2].status,"server_rules_need_review");
});

console.log(`Season 7 guidance: ${checks} checks passed.`);
