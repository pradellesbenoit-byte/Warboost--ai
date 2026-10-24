/*
 * Curated knowledge, not a live game feed.
 * Dates below describe evidence, not a certified current game build.
 * Keep old claims with superseded_by when revising them.
 */
export const EVENT_KNOWLEDGE_VERSION="2026-10-02";
export const EVENT_DEFINITIONS=Object.freeze({
  desert_storm:{capacity:20,substitutes:10,mode:"battlefield"},
  canyon_storm:{capacity:20,substitutes:10,mode:"battlefield"},
  vs:{capacity:null,substitutes:0,mode:"scoring"},
  season:{capacity:null,substitutes:0,mode:"season"},
  other:{capacity:null,substitutes:0,mode:"coordination"}
});
export const EVENT_SOURCES=Object.freeze({
  desert_observation:{kind:"in_game_observed",title:"Règles en jeu fournies au projet",url:null,published_at:"2026-09-11",access:"project_observation"},
  canyon_observation:{kind:"in_game_observed",title:"Observations Canyon conservées par le projet",url:null,published_at:"2026-09-22",access:"project_observation"},
  desert_tutorial:{kind:"community",title:"Last War Tutorial — Desert Storm",url:"https://www.lastwartutorial.com/desert-storm",published_at:null,access:"full_page"},
  desert_ldshop:{kind:"community",title:"LDShop — Desert Storm",url:"https://www.ldshop.gg/blog/last-war-survival/desert-storm.html",published_at:"2025-08-27",access:"full_page"},
  canyon_support:{kind:"official",title:"Last War Support — Canyon battlefield report",url:"https://firstfungroup.zendesk.com/hc/en-us/articles/45789138558995-Last-War-Survival-The-Symbol-of-Strategy-and-Unity-Canyon-Storm-Battlefield-Report",published_at:null,access:"search_snippet_only"},
  canyon_launch:{kind:"official",title:"Last War Support — 2V1 Battlefield Discussion",url:"https://firstfungroup.zendesk.com/hc/en-us/articles/43519832528019--2V1-Battlefield-Discussion",published_at:null,updated_at:"2026-03-30",access:"search_snippet_only"},
  canyon_handbook:{kind:"community",title:"Last War Handbook — Canyon Storm",url:"https://lastwarhandbook.com/guides/canyon-storm-battlefield-guide",published_at:null,updated_at:"2026-05",access:"full_page"},
  vs_guide:{kind:"community",title:"LastWarGame — Alliance Duel",url:"https://www.lastwargame.online/en/game-alliance-duel",published_at:null,access:"full_page"},
  vs_vault:{kind:"community",title:"Last War Vault — VS Guide",url:"https://lastwarvault.com/guides/general/vs-guide",published_at:null,access:"search_snippet_only"},
  season_guide:{kind:"community",title:"LastWarHub — Seasons",url:"https://lastwarhub.com/en/seasons",published_at:null,access:"full_page"},
  official_regional:{kind:"official",title:"Last War — regional website",url:"https://id.lastwar.com/",published_at:null,access:"search_snippet_only"}
});
const claim=(id,event_type,topic,sources,confidence,status="reported",extra={})=>({
  id,event_type,topic,sources,confidence,status,
  verified_at:EVENT_KNOWLEDGE_VERSION,game_version:null,season:null,server_scope:"not_established",
  superseded_by:null,review_after_days:60,...extra
});
export const EVENT_RULES=Object.freeze([
  claim("desert-capacity-observed","desert_storm","capacity",["desert_observation","desert_tutorial","desert_ldshop"],"medium","observed",{observed_at:"2026-09-11",value:{starters:20,substitutes:10},review_after_days:90}),
  claim("desert-objective-control","desert_storm","objective_control",["desert_observation","desert_tutorial","desert_ldshop"],"medium","observed"),
  claim("desert-oil-unlock-conflict","desert_storm","exact_timers",["desert_tutorial","desert_ldshop"],"low","disputed",{planning_allowed:false,alternatives:["13 minutes","20 minutes"]}),
  claim("canyon-capacity-observed","canyon_storm","capacity",["canyon_observation","canyon_handbook"],"medium","observed",{observed_at:"2026-09-22",value:{starters:20,substitutes:10},review_after_days:90}),
  claim("canyon-asymmetric-format","canyon_storm","asymmetric_format",["canyon_launch","canyon_handbook"],"medium"),
  claim("canyon-central-priority","canyon_storm","objective_priority",["canyon_support","canyon_handbook"],"medium"),
  claim("canyon-exact-values-review","canyon_storm","exact_values",["canyon_observation","canyon_handbook"],"low","needs_confirmation",{planning_allowed:false}),
  claim("vs-daily-activities","vs","visible_daily_tasks",["vs_guide","vs_vault"],"medium"),
  claim("vs-win-weights-conflict","vs","victory_weights",["vs_guide","vs_vault"],"low","disputed",{planning_allowed:false}),
  claim("season-server-specific","season","season_cycle",["season_guide"],"low","needs_confirmation",{planning_allowed:false}),
  claim("new-event-promotion-only","other","recent_events",["official_regional"],"low","mention_only",{planning_allowed:false,mentions:["Goldvein War","Season 6"],launch_date:null})
]);
export const EVENT_KNOWLEDGE_CHANGELOG=Object.freeze([
  {version:EVENT_KNOWLEDGE_VERSION,date:"2026-10-02",change:"Initial curated event registry; preserve dated project observations, quarantine disputed numbers and distinguish official snippets from full rules.",supersedes:null}
]);
export function eventDefinition(type){
  return {id:EVENT_DEFINITIONS[type]?type:"other",...(EVENT_DEFINITIONS[type]||EVENT_DEFINITIONS.other)};
}
export function eventKnowledge(type,{nowMs=Date.now()}={}){
  const rules=EVENT_RULES.filter(r=>r.event_type===eventDefinition(type).id&&!r.superseded_by).map(rule=>{
    const observed=rule.observed_at||rule.verified_at,age=Math.max(0,(nowMs-Date.parse(observed))/864e5);
    const stale=!Number.isFinite(age)||age>rule.review_after_days;
    return {...rule,stale,age_days:Number.isFinite(age)?Math.floor(age):null,
      planning_allowed:rule.planning_allowed!==false&&!stale,
      provenance:rule.sources.map(id=>({id,...EVENT_SOURCES[id]}))};
  });
  return {version:EVENT_KNOWLEDGE_VERSION,verified_at:EVENT_KNOWLEDGE_VERSION,game_version:null,
    live:false,update_mode:"curated_manual_review",rules,
    limitations:["No public official live event-rules API verified.","Official support article contents were inaccessible; snippets support limited claims only.","Unknown game build/server scope. Check current in-game rules before validating a plan."],
    change_log:EVENT_KNOWLEDGE_CHANGELOG};
}