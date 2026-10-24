import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync("app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const worker = fs.readFileSync("sw.js", "utf8");

// The legacy drawers/accordions remain the live navigation destinations.
for (const id of [
  "playerDrawer", "allianceDrawer", "vsDrawer", "seasonDrawer",
  "squadList", "memberList", "membersAccordion", "rankManagerAccordion",
  "allianceEventAccordion", "allianceEventCards", "allianceEventDetail",
  "activitySummary", "allianceParticipationTable", "technologyScanHelp",
]) {
  assert.equal([...html.matchAll(new RegExp(`id="${id}"`, "g"))].length, 1,
    `${id}: legacy destination exists exactly once`);
}
for (const destination of ["player", "alliance", "vs", "season"]) {
  assert.match(html, new RegExp(`data-open="${destination}"`),
    `${destination}: original home action still exists`);
}
assert.doesNotMatch(html, /allianceScreenEnvelope|companionMenuPanel|companionNav|warboost-theme\.css/);
assert.doesNotMatch(app, /bindCompanionNavigation|companionDestination|companionSection/);
assert.match(html, /ui=legacy-layout-restored-r1/);
assert.match(worker, /ui=legacy-layout-restored-r1/);
assert.doesNotMatch(worker, /warboost-theme\.css|lib\/companion-navigation\.js/);

const start = app.indexOf("function openDrawer(");
const end = app.indexOf("function closeDrawers(", start);
assert.ok(start >= 0 && end > start, "actual drawer handler can be exercised");
const calls = [];
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    classList: { add: name => calls.push(`${id}:${name}`) },
    setAttribute: (key, value) => calls.push(`${id}:${key}=${value}`),
  });
  return elements.get(id);
};
let privateVisible = false;
const context = vm.createContext({
  $: element,
  safeRenderStep: (name, callback) => { calls.push(name); callback(); },
  closeDrawers: options => {
    assert.equal(options.preserveReturn, true);
    calls.push("close");
  },
  returnViewController: { remember: name => calls.push(`remember:${name}`) },
  betaPrivateDataVisible: () => privateVisible,
  state: { player: {}, drone: {}, alliance: {}, season: {} },
  setTimeout: () => {},
  speakGreeting: () => {},
});
for (const name of [
  "render", "renderAccountFields", "renderAuth", "renderBeta", "renderPro",
  "renderPlayerCoreSummary", "renderAllianceCoreSummary", "renderMembers",
  "renderAllianceAccess", "renderDesertStormPlanner", "renderCanyonPlanner",
  "bindAllianceAccordions", "resetAllianceAccordions", "renderVsLive",
  "renderSeasonAccess", "renderSeasonCoreSummary", "renderEndgameCoachDrawer",
]) context[name] = () => calls.push(name);
vm.runInContext(app.slice(start, end), context);

for (const destination of ["player", "alliance", "vs", "season"]) {
  calls.length = 0;
  context.openDrawer(destination);
  assert.ok(calls.includes(`#${destination}Drawer:open`));
  assert.ok(calls.includes(`#${destination}Drawer:aria-hidden=false`));
  assert.ok(calls.includes(`remember:${destination}`));
  assert.ok(!calls.some(call => /^(PLAYER|ALLIANCE|VS|SEASON)_OPEN_/.test(call)),
    "private sections do not render before access is verified");
}

privateVisible = true;
context.openDrawer("alliance");
for (const name of ["renderMembers", "renderAllianceAccess", "bindAllianceAccordions", "resetAllianceAccordions"])
  assert.ok(calls.includes(name), `${name}: original Alliance handler still runs`);
context.openDrawer("player");
assert.ok(calls.includes("renderPlayerCoreSummary"));
context.openDrawer("vs");
assert.ok(calls.includes("renderVsLive"));
context.openDrawer("season");
assert.ok(calls.includes("renderSeasonCoreSummary"));
context.openDrawer("account");
for (const name of ["renderAccountFields", "renderAuth", "renderBeta", "renderPro"])
  assert.ok(calls.includes(name), `${name}: account controls remain reachable`);

console.log("PASS legacy drawer navigation: original destinations, real handler, private-access boundary, Alliance accordions, VS/Season/account and fresh PWA assets.");
