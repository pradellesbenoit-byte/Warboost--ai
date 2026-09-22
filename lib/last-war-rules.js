/*
 * Current Last War rule notes used by WarBoost recommendations.
 * These are rule facts, not live game access. The source_kind is intentionally
 * explicit so community or user-confirmed observations cannot masquerade as
 * official game data.
 */
export const LAST_WAR_RULES_VERSION="2026-09-22";
export const LAST_WAR_RULES_SOURCE="user_confirmed_recent_update";

const source=(id,kind,confidence,title,url=null)=>Object.freeze({id,source_kind:kind,confidence,title,url});

export const LAST_WAR_RULES=Object.freeze({
  crystal_event:{
    id:"crystal_event_permanent_from_preseason1",
    topic:"crystal_event",
    status:"permanent_from_preseason_1_for_eligible_accounts",
    source:source("crystal-event-guide-2026-08-18","community_verified_in_game","high","Last War Vault Crystal Event guide","https://lastwarvault.com/guides/general/crystal-event-guide"),
    user_confirmation:true,
    recommendation:"upgrade_factory_early"
  },
  crystal_boss:{
    id:"crystal_boss_three_attacks_daily",
    topic:"crystal_boss",
    attacks_per_day:3,
    daily_reward:{resource:"amethyst",amount:1500,after_attacks:3},
    recall_supported:false,
    rally_supported:false,
    standard_troop_counter:false,
    source:source("crystal-boss-guide-2026-08-18","community_verified_in_game","high","Last War Vault Crystal Boss guide","https://lastwarvault.com/guides/general/crystal-event-guide"),
    user_confirmation:true
  },
  crystal_shop:{
    id:"crystal_shop_pass_options",
    new_pass_options:true,
    silver_bricks_monthly_cap:20,
    source:source("crystal-shop-recent-update","user_confirmed_recent_update","high","Recent Crystal Shop update",null),
    user_confirmation:true
  },
  battle_pass:{
    id:"battle_pass_unclaimed_rewards_reissued",
    unclaimed_rewards_reissued_automatically:true,
    source:source("battle-pass-current-behavior","user_confirmed_recent_update","high","Current Battle Pass behavior",null),
    user_confirmation:true
  },
  alliance_star_party:{
    id:"alliance_star_party_reward_recovery",
    reward_recovery_optimized:true,
    source:source("alliance-star-party-current-behavior","user_confirmed_recent_update","high","Current Alliance Star Party behavior",null),
    user_confirmation:true
  },
  shop_value:{
    id:"shop_discount_is_not_value_evidence",
    discount_is_not_value_proof:true,
    require_need_content_cost:true,
    super_monthly_pass_new_presentation:true,
    source:source("shop-value-policy-current","user_confirmed_recent_update","high","Current shop value policy",null),
    user_confirmation:true
  },
  preserved_corrections:{
    id:"warboost_preserved_recommendation_corrections",
    transferable_account_gear_pool:true,
    boss_rampage_type_bonus_cannot_overrule_development:true,
    s6_tactical_cards_separate_pvp_global_expedition:true,
    vs_uses_detected_active_theme_and_day:true,
    zombie_siege:{guard_hours:48,attack_teleport:true,early_departure:true},
    armament_institute_t11_resource_saving:true,
    profession_advice_is_not_fixed_rule:true,
    source:source("warboost-corrections-history","user_confirmed_recent_update","high","Previously confirmed WarBoost corrections",null),
    user_confirmation:true
  }
});

export const SHOP_RULE_CATEGORIES=Object.freeze({
  crystal_pass:"crystal_pass",
  crystal_shop_pass:"crystal_shop_pass",
  crystal_boss:"crystal_boss",
  silver_brick:"silver_brick",
  battle_pass:"battle_pass",
  alliance_star_party:"alliance_star_party",
  super_monthly_pass:"super_monthly_pass"
});

export function ruleProvenance(rule){
  const sourceInfo=rule?.source||{};
  return {
    id:rule?.id||null,
    source_kind:sourceInfo.source_kind||"unknown",
    confidence:sourceInfo.confidence||"unknown",
    title:sourceInfo.title||null,
    url:sourceInfo.url||null,
    user_confirmation:rule?.user_confirmation===true
  };
}

export function lastWarRuleContext(){
  return {
    knowledge_date:LAST_WAR_RULES_VERSION,
    source_policy:"official_or_verified_in_game_when available; community and user-confirmed rules remain explicitly labelled",
    rules:Object.fromEntries(Object.entries(LAST_WAR_RULES).map(([key,rule])=>[key,{id:rule.id,provenance:ruleProvenance(rule)}]))
  };
}

export function crystalEventEligibility(state={}){
  const explicit=state?.season?.crystal_event_eligible;
  if(explicit===true||explicit===false)return {eligible:explicit,known:true,basis:"explicit_account_or_scan_data"};
  return {eligible:null,known:false,basis:"account_eligibility_not_confirmed"};
}

export function crystalBossGuidance(locale="en"){
  const fr=String(locale).toLowerCase().startsWith("fr");
  const r=LAST_WAR_RULES.crystal_boss;
  return fr
    ? `Crystal Boss : ${r.attacks_per_day} attaques individuelles par jour, récompense quotidienne ${r.daily_reward.amount} Amethyst après ${r.daily_reward.after_attacks} attaques. Les troupes envoyées ne sont pas rappelables, les rallyes et le contre de type standard ne s’appliquent pas.`
    : `Crystal Boss: ${r.attacks_per_day} individual attacks per day, ${r.daily_reward.amount} daily Amethyst after ${r.daily_reward.after_attacks} attacks. Sent troops cannot be recalled; rallies and standard type counters do not apply.`;
}

export function shopRuleGuidance(locale="en"){
  const fr=String(locale).toLowerCase().startsWith("fr");
  return fr
    ? "Les pourcentages de remise affichés ne prouvent pas la valeur. WarBoost compare d’abord le besoin réel du compte, le contenu confirmé et le coût confirmé. Le nouveau Super Monthly Pass est reconnu comme une présentation de pass mensuel, sans être acheté automatiquement."
    : "Displayed discount percentages do not prove value. WarBoost first compares the account need, confirmed contents and confirmed cost. The new Super Monthly Pass presentation is recognized as a monthly-pass offer, not bought automatically.";
}