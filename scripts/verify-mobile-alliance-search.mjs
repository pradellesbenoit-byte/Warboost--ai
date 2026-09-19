import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {unlockDesertStormSearchInput} from "../lib/desert-storm-search.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const app=read("app.js"),html=read("index.html");

assert.match(html,/<input id="rankManagerSearch" type="search"/);
assert.match(html,/<input id="desertStormSearch" name="member-filter" type="search" autocomplete="new-password" readonly/);
assert.match(html,/label for="desertStormSearch"/);
assert.doesNotMatch(html,/id="rankManagerSearch"[^>]*(?:disabled|readonly)/i);
const plannerHtml=html.slice(html.indexOf('id="desertStormPlanner"'),html.indexOf('id="desertStormRosterPicker"'));
assert.doesNotMatch(plannerHtml,/<form\b/i);
assert.match(html,/id="authEmail" type="email" autocomplete="email"/);
assert.match(html,/id="authPassword" type="password" autocomplete="current-password"/);
assert.match(app,/function unlockDesertStormSearch\(event\)/);
assert.match(app,/desertStormSearchInput\?\.addEventListener\("pointerdown",unlockDesertStormSearch\)/);
assert.match(app,/desertStormSearchInput\?\.addEventListener\("keydown",unlockDesertStormSearch\)/);
assert.match(app,/desertStormSearchInput\?\.addEventListener\("focus",unlockDesertStormSearch\)/);
const searchInput={readOnly:true,removed:null,removeAttribute(name){this.removed=name}};
unlockDesertStormSearchInput(searchInput);
assert.equal(searchInput.readOnly,false);
assert.equal(searchInput.removed,"readonly");

assert.match(app,/function preserveSearchInput\(input,value\)/);
assert.match(app,/function restoreSearchSelection\(input,selection\)/);
assert.match(app,/function scheduleAllianceRankSearchRender\(\)/);
assert.match(app,/function scheduleDesertStormSearchRender\(\)/);
assert.match(app,/\$\("#rankManagerSearch"\)\?\.addEventListener\("input",e=>\{rankManagerSearchTerm=String\(e\.target\.value\|\|"\"\);scheduleAllianceRankSearchRender\(\)\}\)/);
assert.match(app,/desertStormSearchInput\?\.addEventListener\("input",e=>\{desertStormSearchTerm=String\(e\.target\.value\|\|"\"\);scheduleDesertStormSearchRender\(\)\}\)/);

const rankRender=app.slice(app.indexOf("function renderAllianceRankManager()"),app.indexOf("async function updateRankPermissionTransition"));
const desertRender=app.slice(app.indexOf("function renderDesertStormPicker()"),app.indexOf("function renderDesertStormPlan()"));
assert.match(rankRender,/list\.innerHTML=/);
assert.doesNotMatch(rankRender,/rankManagerSection[^;]*innerHTML/);
assert.match(desertRender,/box\.innerHTML=/);
assert.doesNotMatch(desertRender,/desertStormPlanner[^;]*innerHTML/);
assert.match(app,/rankManagerSearchRenderGeneration/);
assert.match(app,/desertStormSearchRenderGeneration/);

console.log("Mobile Alliance search safety verification: PASS");