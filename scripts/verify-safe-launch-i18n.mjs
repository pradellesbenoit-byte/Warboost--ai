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

for(const [code] of LANGUAGES.filter(([code])=>code!=="auto")){
  const t=translator(code);
  for(const key of requiredKeys)assert.notEqual(t(key),key,`${code} is missing ${key}`);
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