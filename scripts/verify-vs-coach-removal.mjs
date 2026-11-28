import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const html = read("index.html");
const app = read("app.js");
const scan = read("api/scan.js");
const advice = read("api/advice.js");
const loadingTargets = read("lib/loading-targets.js");

assert.doesNotMatch(html, /data-open="vs"|id="vsDrawer"|id="vsAccessNotice"|id="scanVsBtn"|id="vsPlanBtn"/,
  "personal VS Coach card, drawer and controls are removed");
assert.match(html, /<option value="vs"/, "VS remains selectable in the generic scan form");

const openDrawerStart = app.indexOf("function openDrawer(name){");
const openDrawerEnd = app.indexOf("\nfunction closeDrawers(", openDrawerStart);
assert.ok(openDrawerStart >= 0 && openDrawerEnd > openDrawerStart, "drawer handler remains available");
const openDrawer = app.slice(openDrawerStart, openDrawerEnd);
assert.match(openDrawer, /const d=\$\("#"\+name\+"Drawer"\);if\(!d\)return;/,
  "opening a removed drawer safely does nothing");
assert.doesNotMatch(openDrawer, /name==="vs"|renderVsLive|VS_OPEN_CORE/);

const confirmStart = app.indexOf("function confirmScanReview()");
const confirmEnd = app.indexOf('$("#confirmScanReviewBtn")', confirmStart);
assert.ok(confirmStart >= 0 && confirmEnd > confirmStart, "scan confirmation handler remains");
const confirmation = app.slice(confirmStart, confirmEnd);
assert.match(confirmation, /if\(type==="vs"\)render\(\)/,
  "confirmed VS scan still refreshes app state");
assert.doesNotMatch(confirmation, /openDrawer\("vs"\)|requestAdvice\("vs"\)|vsPlanText/,
  "confirmation does not reopen or invoke the personal coach");

assert.match(scan, /\bvs\b/, "scan API retains VS scan handling");
assert.match(app, /mergeVsState/, "client retains VS state merging");
assert.match(app, /function savePlayerAvailability/);
assert.match(app, /event_availability/, "alliance event availability remains");
assert.match(advice, /scope==="alliance"/);
assert.match(advice, /scope==="vs"/, "shared VS advice API remains available to non-player surfaces");
assert.match(advice, /eventStrategyFromState/, "shared event strategy remains");
assert.match(loadingTargets, /if\(kind==="advice:vs"\)return \[\]/,
  "removed coach has no stale button loading targets");

console.log("PASS VS Coach removal: personal UI/auto-open absent; generic scan, VS state and alliance/event APIs retained.");
