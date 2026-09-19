import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const app=read("app.js"),html=read("index.html");

assert.match(html,/<input id="rankManagerSearch" type="search"/);
assert.match(html,/<input id="desertStormSearch" type="search"/);
assert.doesNotMatch(html,/id="rankManagerSearch"[^>]*(?:disabled|readonly)/i);
assert.doesNotMatch(html,/id="desertStormSearch"[^>]*(?:disabled|readonly)/i);

assert.match(app,/function preserveSearchInput\(input,value\)/);
assert.match(app,/function restoreSearchSelection\(input,selection\)/);
assert.match(app,/function scheduleAllianceRankSearchRender\(\)/);
assert.match(app,/function scheduleDesertStormSearchRender\(\)/);
assert.match(app,/\$\("#rankManagerSearch"\)\?\.addEventListener\("input",e=>\{rankManagerSearchTerm=String\(e\.target\.value\|\|"\"\);scheduleAllianceRankSearchRender\(\)\}\)/);
assert.match(app,/\$\("#desertStormSearch"\)\?\.addEventListener\("input",e=>\{desertStormSearchTerm=String\(e\.target\.value\|\|"\"\);scheduleDesertStormSearchRender\(\)\}\)/);

const rankRender=app.slice(app.indexOf("function renderAllianceRankManager()"),app.indexOf("async function updateRankPermissionTransition"));
const desertRender=app.slice(app.indexOf("function renderDesertStormPicker()"),app.indexOf("function renderDesertStormPlan()"));
assert.match(rankRender,/list\.innerHTML=/);
assert.doesNotMatch(rankRender,/rankManagerSection[^;]*innerHTML/);
assert.match(desertRender,/box\.innerHTML=/);
assert.doesNotMatch(desertRender,/desertStormPlanner[^;]*innerHTML/);
assert.match(app,/rankManagerSearchRenderGeneration/);
assert.match(app,/desertStormSearchRenderGeneration/);

console.log("Mobile Alliance search safety verification: PASS");