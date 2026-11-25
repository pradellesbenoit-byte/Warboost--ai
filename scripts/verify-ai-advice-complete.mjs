import assert from "node:assert/strict";
import fs from "node:fs";
import {buildAllianceAdvice,buildPlayerAnalysis,buildShopAdvice} from "../api/advice.js";
import {refreshKnowledgeSnapshot} from "../api/_knowledge.js";
import {buildKnowledgeGuidance} from "../lib/knowledge-guidance.js";

let checks=0;
function test(name,fn){fn();checks++;console.log("PASS",name)}
const now=Date.now(),stamp=new Date(now).toISOString();
const names=["Murphy","Kimberly","Williams","Marshall","Stetmann"];
function member(i,{availability=null,role=null,stale=false}={}){
  return {canonical_member_key:`member-${i}`,name:`Player ${String(i).padStart(3,"0")}`,
    role:role||["R5","R4","R3","R2","R1"][i%5],power_m:90-i/10,
    squad_power_m:50-i/20,squad_power_updated_at:stale?"2026-10-01T00:00:00Z":stamp,
    updated_at:stale?"2026-10-01T00:00:00Z":stamp,
    last_active_at:stale?"2026-10-01T00:00:00Z":stamp,delta_m:stale?0:1,
    ...(availability?{event_availability:[availability]}:{})};
}
function availability(i,status,event_type="desert_storm",extra={}){
  return {canonical_member_key:`member-${i}`,event_type,event_instance:"current",status,
    source:"player_self_report",updated_at:stamp,...extra};
}
function shopState({price=100,balance=10000,currency="campaign_points",store="Campaign Store",offer={}}={}){
  return {player:{hq_level:31},player_context:{objective:"vs",updated_at:stamp},
    squads:[{id:1,power:45,updated_at:stamp,heroes:names.map((name,index)=>({
      name,level:150-index*3,stars:5,exclusive:index===0?10:20,
      gear:"count=4;levels=40,40,40,40;rarity=gold"
    }))},{id:2,heroes:[]},{id:3,heroes:[]},{id:4,heroes:[]}],
    vs:{day:4,updated_at:stamp},
    shop:{store_type:store,currency,currency_balance:balance,updated_at:stamp,
      offers:[{item_name:"Universal Exclusive Weapon Shards",category:"exclusive",price,currency,
        quantity:10,stock_remaining:20,cost_gain_verified:true,...offer}]}};
}
const getOffer=state=>buildShopAdvice(state,"en-GB",buildPlayerAnalysis(state,"en-GB")).recommendations
  .find(row=>row.item==="Universal Exclusive Weapon Shards");

test("missing price, amount, stock or wallet evidence never becomes a purchase instruction",()=>{
  const missingPrice=getOffer(shopState({offer:{price:null}}));
  assert.equal(missingPrice.verdict_key,"unknown");
  assert.match(missingPrice.reason,/Missing purchase evidence.*price/i);
  const missingQuantity=getOffer(shopState({offer:{quantity:undefined,contents_verified:false}}));
  assert.equal(missingQuantity.verdict_key,"unknown");
  assert.match(missingQuantity.reason,/quantity or contents/i);
  const missingStock=getOffer(shopState({offer:{stock_remaining:undefined,available:undefined}}));
  assert.equal(missingStock.verdict_key,"unknown");
  assert.match(missingStock.reason,/stock\/limit/i);
  const missingWallet=getOffer(shopState({balance:null}));
  assert.equal(missingWallet.verdict_key,"unknown");
  assert.match(missingWallet.reason,/currency balance/i);
});
test("a currency mismatch and an unaffordable offer do not recommend spending",()=>{
  const mismatch=getOffer(shopState({currency:"honor_medals",offer:{currency:"campaign_points"}}));
  assert.equal(mismatch.verdict_key,"unknown");
  assert.match(mismatch.reason,/currency/i);
  const unaffordable=getOffer(shopState({balance:10}));
  assert.equal(unaffordable.verdict_key,"skip");
  assert.match(unaffordable.reason,/does not cover/i);
});
test("a diamond purchase below the dated reserve is deferred, not marked buy now",()=>{
  const state=shopState({currency:"diamonds",store:"VIP Shop",price:500,balance:7000,
    offer:{item_name:"Stamina",category:"stamina",currency:"diamonds"}});
  const offer=buildShopAdvice(state,"en-GB",buildPlayerAnalysis(state,"en-GB")).recommendations
    .find(row=>row.item==="Stamina");
  assert.equal(offer.verdict_key,"consider");
  assert.match(offer.reason,/Wait or save/i);
});
test("real-money packs remain blocked until contents and cost/gain evidence are reviewed",()=>{
  const state=shopState({currency:"EUR",store:"Paid shop",price:4.99,
    offer:{item_name:"Universal Exclusive Weapon Shards",category:"exclusive",currency:"EUR",quantity:1,stock_remaining:5,cost_gain_verified:false}});
  const offer=getOffer(state);
  assert.equal(offer.verdict_key,"verify_paid");
  assert.equal(offer.paid_guard.strong_recommendation_allowed,false);
  assert.equal(offer.current_contents_verified,false);
  assert.equal(offer.cost_gain_verified,false);
});
test("a visible, affordable in-game offer is still only a consideration without verified cost/gain",()=>{
  const state=shopState();
  state.shop.offers[0].cost_gain_verified=false;
  const offer=getOffer(state);
  assert.equal(offer.verdict_key,"consider");
  assert.match(offer.reason,/cost\/gain is not verified/i);
});
test("discount percentage cannot improve the underlying offer score",()=>{
  const state=shopState();
  const plain=buildPlayerAnalysis(state,"en-GB");
  const a=buildShopAdvice(state,"en-GB",plain).recommendations.find(row=>row.item==="Universal Exclusive Weapon Shards");
  const discounted=structuredClone(state);discounted.shop.offers[0].discount_pct=99;
  const b=buildShopAdvice(discounted,"en-GB",buildPlayerAnalysis(discounted,"en-GB")).recommendations
    .find(row=>row.item==="Universal Exclusive Weapon Shards");
  assert.equal(a.score,b.score);
});
test("multiple visible stores keep their own names, currency and prices",()=>{
  const state=shopState();
  state.shop={snapshots:[
    {store_type:"Campaign Store",currency:"campaign_points",currency_balance:1000,updated_at:stamp,
      offers:[{item_name:"Universal Exclusive Weapon Shards",category:"exclusive",price:100,currency:"campaign_points",quantity:10,stock_remaining:5}]},
    {store_type:"Alliance Store",currency:"alliance_coins",currency_balance:500,updated_at:stamp,
      offers:[{item_name:"Drone Parts",category:"drone",price:40,currency:"alliance_coins",quantity:5,stock_remaining:3}]}
  ]};
  const rows=buildShopAdvice(state,"en-GB",buildPlayerAnalysis(state,"en-GB")).recommendations;
  assert.ok(rows.some(row=>row.currency==="campaign_points"&&row.price_label.includes("Campaign points")));
  assert.ok(rows.some(row=>row.currency==="alliance_coins"&&row.price_label.includes("Alliance coins")));
  assert.notEqual(rows.find(row=>row.currency==="campaign_points").store,rows.find(row=>row.currency==="alliance_coins").store);
});
test("Alliance, VIP/diamonds, Honor, Season and event stores retain separate currencies and never auto-buy",()=>{
  const stores=[
    ["Alliance Store","alliance_coins","Alliance Store offer"],
    ["VIP Shop","diamonds","VIP Shop offer"],
    ["Honor Store","honor_medals","Honor Store offer"],
    ["Season Store","season_tokens","Season Store offer"],
    ["Season Event Store","event_tokens","Season Event offer"]
  ];
  const state=shopState({currency:"alliance_coins",balance:10000});
  state.shop={snapshots:stores.map(([store,currency,item],i)=>({
    store_type:store,currency,currency_balance:10000,updated_at:stamp,
    offers:[{item_name:item,category:i===1?"stamina":"exclusive",price:100+i,currency,quantity:5,stock_remaining:10}]
  }))};
  const rows=buildShopAdvice(state,"en-GB",buildPlayerAnalysis(state,"en-GB")).recommendations;
  for(const [store,currency,item] of stores){
    const row=rows.find(candidate=>candidate.item===item);
    assert.ok(row,`missing visible offer from ${store}`);
    assert.equal(row.currency,currency);
    assert.notEqual(row.verdict_key,"buy_now","unverified cost/gain must not create an automatic purchase instruction");
    assert.ok(row.store);
  }
});

test("100-member roster distinguishes explicit present/substitute from unknown and preserves R3 as roster, not manager",()=>{
  const members=Array.from({length:100},(_,i)=>member(i));
  const eventRows=[
    ...Array.from({length:20},(_,i)=>availability(i,"present")),
    ...Array.from({length:10},(_,i)=>availability(i+20,"substitute")),
    ...Array.from({length:3},(_,i)=>availability(i+30,"registered")),
  ];
  const state={alliance:{members,event_availability:eventRows}};
  const before=JSON.stringify(state),result=buildAllianceAdvice(state,"fr-FR");
  assert.equal(result.roles.R3,20);
  assert.match(result.advice,/Desert Storm · 20 disponibilités explicites/);
  assert.match(result.advice,/10 remplaçants explicitement déclarés, 70 à confirmer/);
  assert.match(result.advice,/inscription seule n’est pas une présence confirmée/i);
  assert.ok(result.advice.includes("Player 000"));
  assert.ok(!result.advice.includes("Player 099 · R3"));
  assert.equal(JSON.stringify(state),before,"advice must not mutate the roster or availability");
});
test("registration-only or missing event availability never turns the full roster into attendees",()=>{
  const registered=Array.from({length:100},(_,i)=>member(i));
  const registrationRows=registered.map((_,i)=>availability(i,"registered"));
  const plan=buildAllianceAdvice({alliance:{members:registered,event_availability:registrationRows}},"en-GB");
  assert.match(plan.advice,/0 explicit availability records used for a draft, 0 explicitly declared substitutes, 100 to confirm/);
  assert.match(plan.advice,/No event assignment without recent explicit availability/);
  const noAvailability=buildAllianceAdvice({alliance:{members:registered}},"en-GB");
  assert.match(noAvailability.advice,/Before Desert Storm, Canyon, or VS/);
  assert.doesNotMatch(noAvailability.advice,/Desert Storm · \d+ explicit availability records/);
});
test("stale event availability is not used for event assignments",()=>{
  const members=Array.from({length:25},(_,i)=>member(i));
  const staleRows=members.map((_,i)=>({...availability(i,i<20?"present":"substitute"),
    updated_at:"2026-10-01T00:00:00Z"}));
  const result=buildAllianceAdvice({alliance:{members,event_availability:staleRows}},"en-GB");
  assert.match(result.advice,/Before Desert Storm, Canyon, or VS/);
});
test("VS assignments require current VS day; season-war attendance is not inferred from generic seasonal state",()=>{
  const members=Array.from({length:25},(_,i)=>member(i));
  const rows=[
    ...Array.from({length:20},(_,i)=>availability(i,"present","vs")),
    ...Array.from({length:5},(_,i)=>availability(i+20,"substitute","season"))
  ];
  const current=buildAllianceAdvice({alliance:{members,event_availability:rows},vs:{day:4,updated_at:stamp},
    season:{lifecycle:"active",updated_at:stamp}},"en-GB");
  assert.match(current.advice,/VS · 20 explicit availability records/);
  assert.doesNotMatch(current.advice,/SEASON ·/);
  const staleVs=buildAllianceAdvice({alliance:{members,event_availability:rows},vs:{day:4,updated_at:"2026-11-10T00:00:00Z"},
    season:{lifecycle:"active",updated_at:stamp}},"en-GB");
  assert.doesNotMatch(staleVs.advice,/VS · 20 explicit availability records/);
  const closed=buildAllianceAdvice({alliance:{members,event_availability:rows},vs:{day:null,updated_at:stamp},
    season:{lifecycle:"finished",updated_at:stamp}},"en-GB");
  assert.doesNotMatch(closed.advice,/VS · 20 explicit availability records/);
  assert.doesNotMatch(closed.advice,/SEASON ·/);
});

test("official Season 7 references are dated and pending review, not auto-applied gameplay rules",async()=>{
  const asset=JSON.parse(fs.readFileSync(new URL("../assets/last-war-knowledge.json",import.meta.url),"utf8"));
  const expected=[
    ["official-s7-alliance-skills","2026-11-17","https://wiki.lastwar.com/en/show/635"],
    ["official-s7-desert-storm-update","2026-10-27","https://wiki.lastwar.com/en/show/624"],
    ["official-s7-awakening-preview","2026-08-03","https://wiki.lastwar.com/fr/show/575"]
  ];
  for(const [id,date,url] of expected){
    const source=asset.sources.find(row=>row.id===id),discovery=asset.discoveries.find(row=>row.source_id===id);
    assert.equal(source.url,url);assert.equal(source.published_at,date);assert.equal(source.editorial,"mixed");
    assert.equal(discovery.review_status,"requires_article_review");assert.equal(discovery.author_verified,false);
  }
  assert.equal(asset.facts.length,0,"the source pages are not used as approved gameplay facts");
  const captured=[];
  const refreshed=await refreshKnowledgeSnapshot(asset,{now:stamp,fetchImpl:async url=>{
    captured.push(String(url));
    if(String(url).endsWith("/robots.txt"))return new Response("User-agent: *\nAllow: /",{status:200});
    const source=asset.sources.find(row=>row.url===String(url));
    return new Response(`<h1>${source?.id||"Last War public notice"}</h1><p>Public source content fixture for dated review only. In-game event details take precedence over this page.</p>`,{status:200,headers:{"content-type":"text/html"}});
  }});
  assert.equal(refreshed.facts.length,0);
  assert.ok(refreshed.sources.filter(row=>expected.some(([id])=>id===row.id)).every(row=>row.status==="verified"));
  assert.equal(captured.some(url=>url.includes("player")||url.includes("profile")),false);
  const state={player:{},squads:[{id:1,heroes:[]},{id:2,heroes:[]},{id:3,heroes:[]},{id:4,heroes:[]}]};
  const guide=buildKnowledgeGuidance(state,refreshed,1,{now});
  assert.equal(guide.official_rules_available,false);
  assert.equal(guide.applicable_facts.length,0);
});
test("alliance advice uses server-canonical authorization and replaces client roster data",()=>{
  const source=fs.readFileSync(new URL("../api/advice.js",import.meta.url),"utf8");
  assert.match(source,/export async function resolveAuthorizedAllianceAdviceContext/);
  assert.match(source,/resolveAuthorizedAllianceAdviceContext\(betaUser\?\.id,allianceServices\)/);
  assert.match(source,/members:authorized\.roster/);
  assert.match(source,/canonicalAllianceAuthorization/);
  assert.doesNotMatch(source,/player_declared_last_war_rank/);
  assert.doesNotMatch(source,/normalizeAllianceRole\(s\?\.player\?\.role\)/);
});
test("shop and alliance advice do not mutate the source profile",()=>{
  const state=shopState(),alliance={members:[member(0)],event_availability:[]};
  const before=JSON.stringify({state,alliance});
  buildShopAdvice(state,"fr-FR",buildPlayerAnalysis(state,"fr-FR"));
  buildAllianceAdvice(alliance,"fr-FR");
  assert.equal(JSON.stringify({state,alliance}),before);
});

console.log(`PASS AI advice completeness: ${checks} synthetic regression groups; no network, payments, database writes or profile changes.`);
