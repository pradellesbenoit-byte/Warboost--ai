import assert from "node:assert/strict";
import {LAST_WAR_RULES,lastWarRuleContext,ammoBonanzaGuidance,shopRuleGuidance} from "../lib/last-war-rules.js";
import {REVIEWED_GAME_UPDATE} from "../lib/game-update.js";
import {sanitize,usefulState} from "../api/scan.js";
import {createScanReviewDraft,scanReviewEntries} from "../lib/scan-review.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {itemCategory,currencyKey,scoreVisibleOffer} from "../api/advice.js";
import {LANGUAGES,translator} from "../i18n.js";

assert.equal(LAST_WAR_RULES.ammo_bonanza.current_task,"dispatch_trade_truck");
assert.equal(LAST_WAR_RULES.ammo_bonanza.maximum_ammo_per_event,160);
assert.equal(LAST_WAR_RULES.ammo_bonanza.silver_brick_pack_is_in_game_currency,true);
assert.equal(LAST_WAR_RULES.crystal_shop.silver_bricks_monthly_cap,20);
assert.equal(LAST_WAR_RULES.crystal_shop.one_hour_speedups_currency,"crystal_ore");
assert.equal(LAST_WAR_RULES.crystal_shop.legacy_mobilization_coupon_current,false);
assert.equal(LAST_WAR_RULES.preserved_corrections.s6_tactical_cards_separate_pvp_global_expedition,true);
assert.match(ammoBonanzaGuidance("fr"),/Trade Truck.*160/);
assert.match(shopRuleGuidance("en"),/Super Monthly Pass.*never bought automatically/);

assert.equal(REVIEWED_GAME_UPDATE.version,"1.0.364");
assert.equal(REVIEWED_GAME_UPDATE.released_on,null,"Do not invent a release date from an aggregator listing.");
assert.equal(REVIEWED_GAME_UPDATE.source_kind,"third-party-store-metadata-aggregator");
assert.equal(REVIEWED_GAME_UPDATE.confirmed_hero_meta_change,false);
const context=lastWarRuleContext();
assert.equal(context.rules.ammo_bonanza.facts.maximum_ammo_per_event,160);
assert.equal(context.rules.secret_mobile_squad_tasks.provenance.confidence,"medium");
assert.equal(context.rules.secret_mobile_squad_tasks.provenance.user_confirmation,false);
for(const [locale] of LANGUAGES.filter(([code])=>code!=="auto")){
  const t=translator(locale);
  assert.match(t("scan_secret_mobile_squad_help"),/\S/);
  assert.match(t("scan_secret_mobile_squad_saved_title"),/\S/);
  assert.match(t("game_update_title"),/1\.0\.364/);
  assert.match(t("game_update_note"),/1\.0\.364/);
  assert.doesNotMatch(t("game_update_note"),/1\.0\.362/);
}

const now="2026-09-30T12:00:00.000Z";
const modernScan=sanitize({
  special_supplementary_tasks:[
    {label:"Dispatch a Trade Truck",label_evidence:"visible_text"},
    {label:"Unfamiliar event wording",label_evidence:"visible_text"},
    {label:"Inferred from icon",label_evidence:"icon"}
  ]
},now,"secret_mobile_squad");
const modernTasks=modernScan.special_events.secret_mobile_squad.tasks;
assert.deepEqual(modernTasks.map(task=>task.label),["Dispatch a Trade Truck","Unfamiliar event wording"]);
assert.equal(usefulState("secret_mobile_squad",modernScan),true);
assert.equal(usefulState("secret_mobile_squad",sanitize({},now,"secret_mobile_squad")),false);
const legacyScan=sanitize({tasks:[{text:"Legacy screen's visible task label"}]},now,"secret_mobile_squad");
assert.equal(legacyScan.special_events.secret_mobile_squad.tasks[0].label,"Legacy screen's visible task label");
const review=createScanReviewDraft("secret_mobile_squad",modernScan);
assert.ok(scanReviewEntries(review).some(entry=>entry.value==="Unfamiliar event wording"));

const untouched=normalizeState({player:{name:"Existing player",server_id:"884"},squads:[{name:"Squad 1"}]});
assert.equal(Object.hasOwn(untouched,"special_events"),false,"Existing profiles gain no empty event fields.");
assert.equal(untouched.player.name,"Existing player");
const withEvent=normalizeState({...untouched,special_events:{secret_mobile_squad:{updated_at:now,source:"owner_confirmed_scan",tasks:[{label:"Latest task",mapping_status:"unmapped",review_state:"owner_confirmed",label_evidence:"visible_text"}]}}});
const merged=mergeNewest(withEvent,{special_events:{secret_mobile_squad:{updated_at:"2026-09-29T12:00:00.000Z",tasks:[{label:"Stale task"}]}}});
assert.equal(merged.special_events.secret_mobile_squad.tasks[0].label,"Latest task");
assert.equal(merged.special_events.secret_mobile_squad.tasks[0].review_state,"owner_confirmed");
const partial=mergeNewest(withEvent,{special_events:{secret_mobile_squad:{updated_at:"2026-10-01T12:00:00.000Z",tasks:[{label:"New partial-screen task",mapping_status:"unmapped",review_state:"owner_confirmed",confirmed_at:"2026-10-01T12:00:00.000Z"}]}}});
assert.deepEqual(partial.special_events.secret_mobile_squad.tasks.map(task=>task.label),["New partial-screen task","Latest task"],"A partial newer scan must not erase an earlier owner-confirmed label.");

assert.equal(itemCategory("Loot Special Ammo Pack II","event_pack","Crystal Shop"),"event_ammo");
assert.equal(itemCategory("Advanced Battle Pass Voucher"),"pass_voucher");
assert.equal(itemCategory("Mobilization Coupon","battle_pass"),"legacy_mobilization_coupon");
assert.equal(currencyKey("Silver Bricks"),"silver_bricks");
assert.equal(currencyKey("Crystal Ore"),"crystal_ore");
const needs={needStars:false,needExclusive:false,needGear:false,needLevel:false,exTargets:[],starTargets:[],heroes:[],gearUrgency:0,exclusiveUrgency:0,starsUrgency:0,droneUrgency:0,droneKnown:false};
const cashAmmo=scoreVisibleOffer({item_name:"Loot Special Ammo Pack II",category:"event_pack",store_type:"Crystal Shop",currency:"USD",price:1},needs,{_locale:"en",shop:{currency:"USD",currency_balance:100}});
assert.equal(cashAmmo.score,0,"Ammo purchases in real money must never be recommended.");
const affordableBricks=scoreVisibleOffer({item_name:"Loot Special Ammo Pack II",category:"event_pack",store_type:"Crystal Shop",currency:"Silver Bricks",price:5000},needs,{_locale:"en",shop:{currency:"Silver Bricks",currency_balance:5000}});
assert.ok(affordableBricks.score>0,"A scanned Silver Brick price is recognized as in-game currency.");
const insufficientBricks=scoreVisibleOffer({item_name:"Loot Special Ammo Pack II",category:"event_pack",store_type:"Crystal Shop",currency:"Silver Bricks",price:5000},needs,{_locale:"en",shop:{currency:"Silver Bricks",currency_balance:4999}});
assert.equal(insufficientBricks.score,0,"A scanned in-game balance below the price makes the offer unaffordable.");

console.log("current Last War update verification passed");