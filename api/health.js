import {configured,userConfigured,probeServiceAccess} from "../lib/supabase.js";
import {providerConfig} from "../lib/provider.js";
import {HERO_CATALOG} from "../lib/heroes.js";
import {shopReferenceStats} from "../lib/shop-catalog.js";

export function lastWarServerClock(d){return new Date(d.getTime()-2*60*60*1000)}
export function lastWarVsDay(d){const day=lastWarServerClock(d).getUTCDay();return day===0?0:day}

function isoWeek(d){
  const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
  const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return Math.ceil((((x-y)/86400000)+1)/7)
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const providers=providerConfig(),serviceDb=configured(),userDb=userConfigured(),shopRef=shopReferenceStats();
  const serviceProbe=serviceDb?await probeServiceAccess():{ok:false,code:"SUPABASE_NOT_CONFIGURED"};
  const now=new Date(),serverClock=lastWarServerClock(now),dow=lastWarVsDay(now);

  res.status(200).json({
    ok:true,
    app:"WarBoost",
    version:"2.5.10",
    mode:"approval-first-api-ready",

    // Heure serveur + VS : fusion de l'ancien /api/time
    now:now.toISOString(),
    unix_ms:now.getTime(),
    timezone:"UTC",
    lastwar_server_timezone:"UTC-02:00",
    lastwar_server_time:serverClock.toISOString().replace("Z","-02:00"),
    iso_week:isoWeek(serverClock),
    vs_day:dow,
    vs_phase:dow===0?"prep":"scoring",
    weekday_utc:now.getUTCDay(),
    weekday_lastwar_server:dow,

    database:serviceProbe.ok?"ready":(serviceDb||userDb)?"degraded":"local-fallback",
    database_access:serviceProbe.ok?"service+user-rls":userDb?"user-rls":"local-only",
    database_service_probe:serviceProbe.code,
    lastwar_official_access:providers.official?"configured":providers.approved?"approved-connector":"pending-approval",
    legacy_provider:providers.legacy?"explicitly-enabled":"disabled",
    vision:Boolean(process.env.OPENAI_API_KEY||process.env.WARBOOST_VISION_ENDPOINT)?"configured":"optional",
    languages:["fr","en-GB","en-US","es","it","de","pt","nl","zh","ja","ru","ar","pl","tr","ko","vi","th","id","uk","ro","el","cs","sv"],
    safeguards:{
      read_only:true,
      player_consent:true,
      unauthorized_source_default:false,
      user_scoped_cloud:true,
      no_placeholder_hero_names:true,
      hero_identity_confirmation:true,
      double_pass_portrait_verification:true,
      hero_asset_identity_binding:true,
      diagnostic_single_portrait_render:true,
      canonical_hero_aliases:true,
      hero_names_staged_until_confirmation:true,
      hero_attributes_bound_to_identity:true,
      squad1_player_selected_main_priority:true,
      stronger_secondary_never_silently_becomes_main:true,
      diagnostic_reads_hero_profile_registry:true,
      hero_history_snapshot_recovery:true,
      hero_history_identity_only_recovery:true,
      prewrite_hero_snapshot:true,
      adaptive_candidate_pool_preserved:true,
      missing_exclusive_data_blocks_false_drone_priority:true,
      nonhero_mobile_card_reliability:true,
      cross_squad_duplicate_guard:true,
      legacy_positional_merge_repair:true,
      localized_scan_rendering:true,
      exclusive_breakpoints_10_20_30:true,
      exclusive_ui_ex_only:true,
      partial_shop_catalog_disclosure:true,
      no_unknown_offer_recommendation:true,
      multi_shop_scan_accumulation:true,
      dated_shop_reference_catalog:true,
      reference_catalog_never_claims_live_availability:true,
      shop_relevance_score_not_certainty:true,
      shop_data_confidence_separate_from_relevance:true,
      shop_availability_separate_from_relevance:true,
      dated_reference_prices_require_in_game_check:true,
      vip30_reference_cross_checked_not_live:true,
      diagnostic_shop_priority_alignment:true,
      shop_alignment_labels_23_languages:true,
      opaque_container_direct_resource_guard:true,
      situational_utility_priority_guard:true,
      shop_offer_deduplication:true,
      store_currency_integrity:true,
      sold_offer_exclusion:true,
      ambiguous_price_suppression:true,
      season6_awakening_readiness:true,
      season6_awakening_dynamic_value:true,
      season6_mono_type_formation_bonus:true,
      season6_hybrid_synergy_guard:true,
      season_lifecycle_active_ended_interseason_unknown:true,
      missing_season_progress_never_zero:true,
      ended_season_disables_s6_advice:true,
      interseason_historical_profession_only:true,
      season_unknown_blocks_numeric_advice:true,
      season_manual_lifecycle_override:true,

      awakening_swap_safety:true,
      no_exact_reshape_power_without_source:true,
      awakening_labels_23_languages:true,
      adaptive_player_context:true,
      contextual_marginal_value_scoring:true,
      conditional_dated_recommendations:true,
      certainty_tiers:true,
      no_invented_server_or_account_age:true,
      protected_local_last_good_backup:true,
      cloud_schema_missing_is_explicit:true,
      safe_idempotent_cloud_migration:true,
      cloud_service_role_grant_guard:true,
      live_cloud_permission_probe:true,
      multilingual_structured_ai_23_choices:true,
      player_seven_day_plan:true,
      seven_day_plan_no_invented_quantities:true,
      seven_day_plan_distinct_actions:true,
      seven_day_plan_mobile_wrap:true,
      seven_day_plan_hero_binding_only_when_relevant:true,
      seven_day_plan_shop_timing_account_wide:true,
      alliance_manual_roster_import_preserved:true,
      alliance_single_cloud_membership:true,
      alliance_confirmed_activity_only_tactical_roles:true,
      alliance_stale_roster_never_assigned_tactical_role:true,
      alliance_compact_mobile_action_lists:true,
      alliance_invite_owner_takeover_guard:true,
      alliance_owner_switch_guard:true,
      alliance_share_requires_server_invite:true,
      vs_sunday_prep_not_day6:true,
      vs_server_reset_utc_minus_2:true,
      alliance_immediate_actions_and_plan_b:true,
      rank_aware_voice_greeting:true
    },
    hero_catalog_count:HERO_CATALOG.length,
    shop_reference_catalog:shopRef,
    hero_catalog_identity_source:"shared-single-source",
    serverless_functions:12
  })
}
