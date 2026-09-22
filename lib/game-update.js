import {LAST_WAR_RULES_VERSION,LAST_WAR_RULES,LAST_WAR_RULES_SOURCE,lastWarRuleContext} from "./last-war-rules.js";

export const REVIEWED_GAME_UPDATE={
  version:"1.0.362",
  released_on:"2026-09-09",
  reviewed_on:"2026-09-09",
  source_kind:"public-store-release-notes",
  changes:["Silver Brick redemption confirmation and remaining-quantity display observed in some App Store regions"],
  regional_notes_vary:true,
  meta_impact:"informational-only",
  confirmed_hero_meta_change:false,
  season7_status:"not-activated-from-rumors",
  recent_rules_reviewed_on:LAST_WAR_RULES_VERSION,
  recent_rules_source_kind:LAST_WAR_RULES_SOURCE,
  recent_rules:Object.fromEntries(Object.entries(LAST_WAR_RULES).map(([key,rule])=>[key,{id:rule.id,source_kind:rule.source.source_kind,confidence:rule.source.confidence}])),
  rule_context:lastWarRuleContext()
};
