import assert from "node:assert/strict";
import fs from "node:fs";
import {LANGUAGES,translator} from "../i18n.js";
import {PUBLISHER_PRESENTATION_LABELS} from "../lib/publisher-presentation-labels.js";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../publisher-ui.js",import.meta.url),"utf8");
const hooks=[...html.matchAll(/data-i18n(?:-aria|-placeholder|-alt)?="([^"]+)"/g)].map(match=>match[1]);
const sharedTerms=new Set([
  "alliance","alliance_r5r4","drone","hq","local","profession","server",
  "season_state_active","server_profile_mature","read_label","understand_label","recommend_label",
  "objective_auto","objective_pvp","objective_pve","objective_vs","vs","pro","scan_title","scan_source"
]);
const sharedDynamicTerms=new Set([
  ...sharedTerms,"minutes","hours","days","scan_drone","scan_vs","server_ok",
  "season_unknown_note","exclusive_short","conditional_recommendation","meta_source_count",
  "meta_source_community","plan_b","free","beta_pro_title","beta_pro_short","beta_badge",
  "squad","week","level","hero","shop_relevance","pro_data_quality"
]);
const dynamicKeys=[...new Set([...app.matchAll(/\bt\("([a-z0-9_]+)"/g)].map(match=>match[1]))];
assert.ok(hooks.length>100,"The publisher demo must expose its screen copy for translation");
assert.match(html,/<html lang="en-GB">/);
for(const key of ["publisher_badge","publisher_eyebrow","publisher_request_subject","publisher_language_label","publisher_status_label","publisher_brief_label","publisher_scan_preview_alt","publisher_hero_confirm_title","publisher_sandbox_label","publisher_roster_placeholder","publisher_pro_title","publisher_reset_label"]){
  assert.ok(hooks.includes(key),`Missing localized screen element: ${key}`);
}
assert.match(app,/document\.title=t\("publisher_page_title"\)/);
assert.match(app,/document\.documentElement\.dir=dirFor\(lang\)/);
assert.match(app,/setAttribute\('aria-label',t\("publisher_close"\)\)/);
assert.match(app,/setAttribute\('alt',t\(el\.dataset\.i18nAlt\)\)/);
assert.match(app,/dispatchEvent\(new Event\("warboost:languagechange"\)\)/);
assert.match(ui,/translator\(document\.documentElement\.lang\)/);
assert.match(ui,/warboost:languagechange/);
for(const [code] of LANGUAGES.filter(([code])=>code!=="auto")){
  const t=translator(code);
  assert.ok(PUBLISHER_PRESENTATION_LABELS[code],`Missing presentation language: ${code}`);
  for(const key of hooks)assert.notEqual(t(key),key,`Untranslated screen key: ${code}:${key}`);
  for(const [key,value] of Object.entries(PUBLISHER_PRESENTATION_LABELS[code])){
    assert.equal(t(key),value,`Presentation copy not applied: ${code}:${key}`);
  }
  if(code!=="en-GB"&&code!=="en-US"){
    for(const key of hooks){
      assert.ok(t(key)!==translator("en-GB")(key)||sharedTerms.has(key),
        `English screen text still shown in ${code}: ${key}`);
    }
    for(const key of dynamicKeys){
      assert.ok(t(key)!==translator("en-GB")(key)||sharedDynamicTerms.has(key),
        `English dynamic text still shown in ${code}: ${key}`);
    }
  }
  assert.ok(t("publisher_visual_alt",{name:"DVA"}).includes("DVA"));
}
console.log("Private publisher demo presentation: all 23 languages and screen hooks PASS");