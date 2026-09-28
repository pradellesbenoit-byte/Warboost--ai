import assert from "node:assert/strict";
import fs from "node:fs";
import {LANGUAGES,dirFor,translator} from "../i18n.js";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const requiredKeys=[
  "availability_title","availability_intro","availability_event","availability_status",
  "availability_date","availability_slot","availability_note","availability_note_placeholder",
  "availability_save","event_desert","event_canyon","event_vs","event_season","event_other",
  "availability_unknown","availability_present","availability_absent","availability_substitute",
  "ds_advanced_title","canyon_advanced_title","canyon_title","canyon_tab_preparation",
  "canyon_tab_objectives","canyon_tab_skills","canyon_tab_plan","canyon_status_preparation",
  "canyon_status_battle","canyon_status_completed","canyon_date_time","canyon_faction",
  "canyon_unknown","canyon_instigators","canyon_scouts","canyon_adjudicator",
  "canyon_absence_guard","canyon_roster_availability","canyon_search","canyon_generate",
  "canyon_validate","availability_saved","availability_event_generic","close","scan_preview_alt",
  "support_error","support_status_received","support_status_in_progress","support_status_waiting_player",
  "support_status_resolved"
];
const scanReviewKeys=[
  "scan_review_squad_heading","scan_review_hero_heading","scan_review_offer_heading","scan_review_member_heading","scan_review_progress_heading",
  "scan_review_group_player","scan_review_group_alliance","scan_review_group_drone","scan_review_group_shop","scan_review_group_vs","scan_review_group_season","scan_review_group_technology","scan_review_group_progress","scan_review_group_other",
  "scan_review_label_level","scan_review_label_stars","scan_review_label_power","scan_review_label_exclusive","scan_review_label_gear","scan_review_label_gear_count","scan_review_label_gear_levels","scan_review_label_gear_rarity","scan_review_label_name","scan_review_label_tag","scan_review_label_rank","scan_review_label_score","scan_review_label_price","scan_review_label_quantity","scan_review_label_currency","scan_review_label_balance","scan_review_label_discount","scan_review_label_time","scan_review_label_focus","scan_review_label_percent","scan_review_label_item","scan_review_label_unknown",
  "scan_review_status_confirmed","scan_review_status_pending","scan_review_status_missing","scan_review_exclusive_not_visible","scan_review_gear_one","scan_review_gear_many","scan_review_gear_levels_summary","scan_review_gear_level_summary","scan_review_gear_invalid","scan_review_gear_edit_help",
  "scan_review_rarity_red","scan_review_rarity_orange","scan_review_rarity_gold","scan_review_rarity_purple","scan_review_rarity_blue","scan_review_rarity_green"
];
const scanReviewDetailKeys=[
  "scan_review_label_coordinates","scan_review_label_store_type","scan_review_label_vip_days","scan_review_label_offer_limit","scan_review_label_category","scan_review_label_rarity","scan_review_label_contents","scan_review_label_offer_kind","scan_review_label_sold","scan_review_label_content_verified","scan_review_label_contents_verified","scan_review_label_cost_gain_verified","scan_review_label_price_confidence","scan_review_label_currency_confidence","scan_review_label_our_score","scan_review_label_their_score","scan_review_label_our_percent","scan_review_label_their_percent","scan_review_label_personal_score","scan_review_label_time_remaining","scan_review_label_lifecycle","scan_review_label_season_number","scan_review_label_total_days","scan_review_label_resistance","scan_review_label_crystal_event_eligible","scan_review_label_hero_hp_bonus","scan_review_label_hero_atk_bonus","scan_review_label_hero_def_bonus","scan_review_label_all_damage_resistance_pct","scan_review_label_max_skill_level","scan_review_label_power_raw","scan_review_label_unlocked","scan_review_label_skill_level","scan_review_label_named_shards","scan_review_label_universal_shards","scan_review_label_trial_complete","scan_review_label_in_base","scan_review_label_reshape_stage","scan_review_label_reshape_value","scan_review_label_type_mastery_pct","scan_review_label_hero_tech_pct","scan_review_label_siege_to_seize_pct","scan_review_label_defensive_fortification_pct","scan_review_label_tactical_weapon_pct","scan_review_label_our_alliance","scan_review_label_opponent","scan_review_lifecycle_active","scan_review_lifecycle_ended","scan_review_lifecycle_interseason"
];
const scanReviewPlaceholders={
  scan_review_squad_heading:["number"],scan_review_hero_heading:["number"],scan_review_offer_heading:["number"],scan_review_member_heading:["number"],scan_review_progress_heading:["number"],
  scan_review_gear_one:["count"],scan_review_gear_many:["count"],scan_review_gear_levels_summary:["levels"],scan_review_gear_level_summary:["level"]
};

for(const [code] of LANGUAGES.filter(([code])=>code!=="auto")){
  const t=translator(code);
  for(const key of requiredKeys)assert.notEqual(t(key),key,`${code} is missing ${key}`);
  for(const key of scanReviewKeys){
    const value=t(key);
    assert.notEqual(value,key,`${code} is missing ${key}`);
    const placeholders=[...value.matchAll(/\{([^}]+)\}/g)].map((match)=>match[1]).sort();
    assert.deepEqual(placeholders,(scanReviewPlaceholders[key]||[]).slice().sort(),`${code} has incorrect placeholders for ${key}`);
  }
  for(const key of scanReviewDetailKeys){
    const value=t(key);
    assert.notEqual(value,key,`${code} is missing ${key}`);
    assert.doesNotMatch(value,/scan_review_(?:label|lifecycle)_[a-z_]+/i,`${code} exposes an internal identifier for ${key}`);
  }
  if(code!=="en-GB"&&code!=="en-US"){
    for(const key of ["availability_title","availability_save","event_desert","canyon_title","canyon_tab_preparation","canyon_generate","availability_saved","support_error"])
      assert.notEqual(t(key),translator("en-GB")(key),`${code} is using English fallback for ${key}`);
  }
}
assert.equal(LANGUAGES.length-1,23,"all supported language choices must be covered");
assert.equal(dirFor("ar"),"rtl","Arabic must render right-to-left");
assert.equal(dirFor("fr"),"ltr");
for(const key of ["availability_title","availability_intro","availability_save","event_desert","event_canyon","ds_advanced_title","canyon_advanced_title","canyon_title","canyon_tab_preparation","canyon_generate","canyon_validate"])
  assert.ok(html.includes(`data-i18n="${key}"`),`HTML is missing translation binding ${key}`);
assert.ok(html.includes('data-i18n-placeholder="availability_note_placeholder"'));
assert.ok(html.includes('data-i18n-placeholder="canyon_search"'));
assert.match(html,/id="supportStatus"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(html,/id="playerAvailabilityStatusMessage"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(app,/\$\$\('\[data-i18n-aria\]'\)/);
assert.match(app,/\$\$\('\[data-i18n-alt\]'\)/);
assert.match(app,/function supportMessage\([^]*?aria-live","polite"/);
assert.doesNotMatch(app,/supportMessage\(e\.message/,"raw support errors must not leak API diagnostics");
assert.match(html,/data-i18n-aria="close"/);
assert.match(html,/data-i18n-alt="scan_preview_alt"/);
assert.match(css,/max-height:min\(92dvh,calc\(100dvh - env\(safe-area-inset-top\) - 8px\)\)/);
assert.match(css,/\.dsRosterPicker\{max-height:none;overflow:visible\}/);
assert.match(css,/\.canyonAvailabilityList\{max-height:none;overflow:visible\}/);

console.log(`Safe-launch i18n/ARIA verification: PASS (${LANGUAGES.length-1} language locales; Arabic RTL)`);