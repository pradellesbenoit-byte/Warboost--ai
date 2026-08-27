import {configured,userConfigured} from "../lib/supabase.js";
import {providerConfig} from "../lib/provider.js";
import {HERO_CATALOG} from "../lib/heroes.js";
import {shopReferenceStats} from "../lib/shop-catalog.js";

function isoWeek(d){
  const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
  const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return Math.ceil((((x-y)/86400000)+1)/7)
}

export default function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const providers=providerConfig(),serviceDb=configured(),userDb=userConfigured(),shopRef=shopReferenceStats();
  const now=new Date(),dow=now.getUTCDay();

  res.status(200).json({
    ok:true,
    app:"WarBoost",
    version:"2.4.2",
    mode:"approval-first-api-ready",

    // Heure serveur + VS : fusion de l'ancien /api/time
    now:now.toISOString(),
    unix_ms:now.getTime(),
    timezone:"UTC",
    iso_week:isoWeek(now),
    vs_day:dow===0?6:dow,
    weekday_utc:dow,

    database:(serviceDb||userDb)?"ready":"local-fallback",
    database_access:serviceDb?"service+user-rls":userDb?"user-rls":"local-only",
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
      localized_scan_rendering:true,
      exclusive_breakpoints_10_20_30:true,
      exclusive_ui_ex_only:true,
      partial_shop_catalog_disclosure:true,
      no_unknown_offer_recommendation:true,
      multi_shop_scan_accumulation:true,
      dated_shop_reference_catalog:true,
      reference_catalog_never_claims_live_availability:true,
      diagnostic_shop_priority_alignment:true,
      shop_alignment_labels_22_languages:true,
      opaque_container_direct_resource_guard:true
    },
    hero_catalog_count:HERO_CATALOG.length,
    shop_reference_catalog:shopRef,
    hero_catalog_identity_source:"shared-single-source",
    serverless_functions:12
  })
}
