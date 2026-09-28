import assert from "node:assert/strict";
import {createEndgameCoachReport} from "../lib/endgame-coach.js";
import {vsDecisionEngine} from "../lib/vs-live.js";
import {season6TechPriorities} from "../lib/season6-awakening.js";
import {buildCrossDomain,buildPlayerAnalysis,buildSeasonAdvice,buildShopAdvice,buildVsAdvice} from "../api/advice.js";

const names=["Farhad","Gump","Kimberly","Loki","Marshall"];
function coachState(){
  return {
    player:{hq_level:35},
    squads:[{
      id:1,composition_confirmed_at:"2026-09-28T10:00:00.000Z",
      confirmed_composition:[...names],
      heroes:names.map((name,index)=>({name,level:180,stars:5,gear:{level:40},skills:{one:10},combat_role:index<2?"frontline":"dps"}))
    }],
    hero_profiles:[],
    exclusive_weapons:names.map(hero_name=>({hero_name,level:20,power:1000})),
    drone:{level:180,power_m:25,components:{core:4},chips:{one:3}},
    technology:{type_mastery_pct:60,mastery_by_type:{tank:60}},
    season:{name:"S6",number:6,day:12,total_days:30,profession:"Engineer",progress_pct:40,resistance:20,focus:"tech",lifecycle:"active"},
    endgame:{
      armament_institute_t11:{status:"unknown"},
      decorations:{level:5},overlord:{level:12},
      rare_resources:[{name:"Crystal",stock:120,usage_known:true,current_use:true,next_use:{cost:100,expected_gain:500,gain_source:"confirmed screen"}}]
    }
  };
}

const unknownT11=createEndgameCoachReport(coachState());
assert.ok(unknownT11.missing_data.some(item=>item.id==="t11"),"unknown T11 status remains missing");
assert.deepEqual(unknownT11.decorations_overlord_season.t11,[],"unknown T11 status is not rendered as a fact");
const knownT11State=coachState();
knownT11State.endgame.armament_institute_t11={unlocked:true,level:1};
const knownT11=createEndgameCoachReport(knownT11State);
assert.ok(!knownT11.missing_data.some(item=>item.id==="t11"),"explicit T11 progress remains recognized");
assert.ok(knownT11.decorations_overlord_season.t11.length>0);

const partial=coachState();
partial.squads[0].confirmed_composition=["Farhad","Gump","Kimberly","",""];
partial.squads[0].heroes[3]={name:"DVA",level:1,stars:1,gear:{level:1},skills:{one:1}};
partial.squads[0].heroes[4]={name:"Lucius",level:1,stars:1,gear:{level:1},skills:{one:1}};
const partialReport=createEndgameCoachReport(partial);
assert.equal(partialReport.squad1.known_hero_count,3,"confirmed blank slots cannot be filled by stale raw hero names");
assert.equal(partialReport.squad1.main_type,"tank","main type comes only from confirmed composition");
assert.ok(!partialReport.squad1.heroes.some(hero=>["DVA","Lucius"].includes(hero.name)));

const staleUnknown={day:4,week:40,our_score:null,their_score:null,time_remaining_seconds:0,updated_at:"2026-09-27T10:00:00.000Z"};
const now=new Date("2026-09-28T10:00:00.000Z");
const staleDecision=vsDecisionEngine(staleUnknown,{now});
assert.equal(staleDecision.stale,true,"an old timestamp is stale even when both scores are unknown");
assert.equal(staleDecision.known,false);
assert.equal(staleDecision.decision,"scan");
assert.equal(staleDecision.time_remaining_seconds,null,"stale timer cannot imply event end or spending");
const staleAdvice=buildVsAdvice({vs:staleUnknown,updated_at:now.toISOString()},"en-GB",{now});
assert.equal(staleAdvice.live_decision.stale,true);
assert.equal(staleAdvice.live_decision.decision_key,"scan");
assert.equal(staleAdvice.score_gap,null);
assert.equal(staleAdvice.time_remaining_seconds,null);
assert.equal(staleAdvice.trend,null);
assert.match(staleAdvice.advice,/stale|old scan|scan today's VS/i);
assert.match(staleAdvice.priorities[0].text,/Do not use resources|old scan/i);
const staleSpendState=coachState();
staleSpendState.updated_at=now.toISOString();
staleSpendState.squads[0].updated_at=now.toISOString();
staleSpendState.squads[0].heroes[4].level=120;
staleSpendState.vs=staleUnknown;
const staleSpendAnalysis=buildPlayerAnalysis(staleSpendState,"en-GB");
assert.ok(staleSpendAnalysis.priorities.length>0);
assert.notEqual(staleSpendAnalysis.priorities[0].timing_window?.status,"spend_now","stale VS timing cannot say spend now");
assert.equal(buildCrossDomain(staleSpendState,"en-GB",staleSpendAnalysis).spend_decision,"refresh_before_spend");

const untypedTech=season6TechPriorities({type_mastery_pct:40,hero_tech_pct:70},{offense:true});
assert.ok(!untypedTech.priorities.some(item=>item.key==="type_mastery"),"generic type mastery cannot create a typed priority without a confirmed main type");
assert.ok(untypedTech.priorities.some(item=>item.key==="hero_tech"));
const typedTech=season6TechPriorities({type_mastery_pct:40},{mainType:"tank"});
assert.ok(typedTech.priorities.some(item=>item.key==="type_mastery"),"valid confirmed-type cases retain the mastery priority");
const noEvidenceSeason=buildSeasonAdvice({season:{name:"S6",number:6,day:12,total_days:30,profession:"Engineer",resistance:50,lifecycle:"active"}},"en-GB");
assert.equal(noEvidenceSeason.season_active,false,"unknown season freshness hard-stops current seasonal advice");
assert.equal(noEvidenceSeason.day,null);
assert.match(noEvidenceSeason.advice,/timestamp|stale|rescan/i);
const freshSeasonState={season:{name:"S6",number:6,day:12,total_days:30,profession:"Engineer",progress_pct:40,resistance:20,lifecycle:"active",updated_at:now.toISOString()}};
const freshSeason=buildSeasonAdvice(freshSeasonState,"en-GB");
assert.equal(freshSeason.season_active,true,"fresh active season retains current advice");
assert.equal(freshSeason.day,12);
assert.equal(freshSeason.progress_pct,40);
const staleSeason=buildSeasonAdvice({season:{name:"S6",number:6,day:29,total_days:30,profession:"Engineer",progress_pct:95,resistance:70,lifecycle:"active",updated_at:"2026-09-20T10:00:00.000Z"}},"en-GB");
assert.equal(staleSeason.season_active,false);
assert.equal(staleSeason.lifecycle,"unknown");
assert.equal(staleSeason.day,null);
assert.equal(staleSeason.progress_pct,null);
assert.equal(staleSeason.resistance,null);
assert.equal(staleSeason.profession,null);
assert.equal(staleSeason.last_known_season.profession,"Engineer","stale season identity remains available only as last-known data");
assert.deepEqual(staleSeason.priorities.map(item=>item.kind),["refresh"]);
assert.match(staleSeason.advice,/stale|last-known|rescan/i);

const apiSquad=coachState();
apiSquad.squads[0].confirmed_composition=["Farhad","Gump","Kimberly","",""];
apiSquad.squads[0].heroes[3]={name:"DVA",level:1,stars:1,exclusive:"0",gear:"1",power:1};
apiSquad.squads[0].heroes[4]={name:"Lucius",level:1,stars:1,exclusive:"0",gear:"1",power:1};
const apiAnalysis=buildPlayerAnalysis(apiSquad,"en-GB");
assert.equal(apiAnalysis.composition.main_type,"tank");
assert.ok(!apiAnalysis.priorities.some(item=>item.hero==="DVA"||item.hero==="Lucius"),"stale out-of-composition hero data cannot produce recommendations");
assert.ok(!apiAnalysis.all_hero_value_model.heroes.some(item=>item.hero==="DVA"||item.hero==="Lucius"),"out-of-composition raw slot names are excluded from the focused squad model");

const untypedSquad={
  player:{hq_level:35},
  squads:[{id:1,power:1000000,heroes:[
    {name:"Farhad"},{name:"Gump"},{name:"Carlie"},{name:"DVA"},{name:"Tesla"}
  ]}],
  technology:{type_mastery_pct:40},
  season:{name:"S6",number:6,day:12,total_days:30,lifecycle:"active"}
};
const apiUntyped=buildPlayerAnalysis(untypedSquad,"en-GB");
assert.equal(apiUntyped.composition.main_type,null);
assert.ok(!apiUntyped.priorities.some(item=>item.kind==="technology"),"generic mastery cannot force an API technology priority without a confirmed troop type");
assert.ok(!apiUntyped.season6_awakening.tech_priorities.priorities.some(item=>item.key==="type_mastery"));

const droneMissing=coachState();
delete droneMissing.drone.components;
delete droneMissing.drone.chips;
const droneMissingAnalysis=buildPlayerAnalysis(droneMissing,"en-GB");
assert.match(droneMissingAnalysis.summary,/Drone components/);
assert.match(droneMissingAnalysis.summary,/Combat Boost/);
assert.match(droneMissingAnalysis.summary,/Skill Chips/);
assert.match(droneMissingAnalysis.summary,/check them in game/i);
assert.match(droneMissingAnalysis.summary,/OCR has not been confirmed/i);
const droneRecordedAnalysis=buildPlayerAnalysis(coachState(),"en-GB");
assert.doesNotMatch(droneRecordedAnalysis.summary,/Drone components|Skill Chips/,"recorded components/chips are not mislabeled missing");
assert.match(droneRecordedAnalysis.summary,/Combat Boost.*not represented/i,"unsupported Combat Boost remains explicitly unknown");

function campaignOfferState(exclusiveLevel){
  const state=coachState();
  delete state.exclusive_weapons;
  state.squads[0].heroes.forEach(hero=>{hero.exclusive=exclusiveLevel});
  state.shop={store_type:"Campaign Store",currency:"campaign_points",currency_balance:10000,updated_at:new Date().toISOString(),offers:[{item_name:"Universal Exclusive Weapon Shards",category:"exclusive",price:100,currency:"campaign_points"}]};
  return state;
}
const campaignUnknown=campaignOfferState(0);
const unknownCampaignAdvice=buildShopAdvice(campaignUnknown,"en-GB",buildPlayerAnalysis(campaignUnknown,"en-GB"));
const unknownCampaignOffer=unknownCampaignAdvice.recommendations.find(item=>item.category==="exclusive");
assert.ok(unknownCampaignOffer,"observed Campaign offer is evaluated");
assert.equal(unknownCampaignOffer.score,0,"unlocked-upgrade context is required before ranking universal exclusive fragments");
assert.equal(unknownCampaignOffer.verdict_key,"skip");
assert.match(unknownCampaignOffer.reason,/not confirmed|initial unlock/i);
const campaignNoOffer=coachState();
delete campaignNoOffer.exclusive_weapons;
campaignNoOffer.squads[0].heroes.forEach(hero=>{hero.exclusive=10});
const noOfferRecommendations=buildShopAdvice(campaignNoOffer,"en-GB",buildPlayerAnalysis(campaignNoOffer,"en-GB")).recommendations;
assert.ok(!noOfferRecommendations.some(item=>item.category==="exclusive"&&/Campaign/i.test(item.store)),"unobserved Campaign universal fragments are not suggested as a purchase");
const campaignUpgrade=campaignOfferState(10);
const knownCampaignAdvice=buildShopAdvice(campaignUpgrade,"en-GB",buildPlayerAnalysis(campaignUpgrade,"en-GB"));
const knownCampaignOffer=knownCampaignAdvice.recommendations.find(item=>item.category==="exclusive");
assert.ok(knownCampaignOffer);
assert.equal(knownCampaignOffer.verdict_key,"buy_now","fresh observed Campaign offer remains actionable for a known EX upgrade");
assert.match(knownCampaignOffer.reason,/already-unlocked Exclusive Weapon/i);
assert.doesNotMatch(knownCampaignOffer.target,/EX0/,"universal fragments are never targeted at an initial unlock");

console.log("Public beta safe-launch regression checks passed.");