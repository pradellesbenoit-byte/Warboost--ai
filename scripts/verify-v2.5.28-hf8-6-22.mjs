import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js'),i18n=read('i18n.js'),manifest=JSON.parse(read('manifest.webmanifest')),pkg=JSON.parse(read('package.json'));

assert.match(app,/const RELEASE_LABEL="HF8\.6\.22"/);
assert.match(html,/WarBoost V2\.5\.28 HF8\.6\.22/);
assert.match(html,/\/app\.js\?v=hf8622/);
assert.match(html,/\/publisher-ui\.js\?v=hf8622/);
assert.match(sw,/warboost-v2-5-28-hf8-6-22-full-module-render-isolation/);
assert.match(manifest.name,/HF8\.6\.22/);
assert.match(pkg.description,/HF8\.6\.22/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.22/);
assert.match(health,/release:"HF8\.6\.22"/);
assert.match(health,/ui_revision_full_module_render_isolation:"hf8\.6\.22-full-module-render-isolation"/);
assert.match(health,/all_visible_surfaces_isolated:true/);
assert.match(health,/drawer_refresh_before_open:true/);

const start=app.indexOf('function render(){');
const end=app.indexOf('\nfunction squadHasSavedData',start);
assert.ok(start>=0&&end>start,'render() missing');
const body=app.slice(start,end);

// Every visible surface that appeared inconsistent in the field report has its own catch boundary.
for(const marker of ['HOME_PLAYER','HOME_ALLIANCE','HOME_VS','PLAYER_SUMMARY','ACCOUNT_FIELDS','ALLIANCE_SUMMARY','ALLIANCE_MEMBERS','VS_LIVE','SEASON_SUMMARY','ADVICE','PROVIDER']){
  assert.match(body,new RegExp(`safeRenderStep\\("${marker}"`),`missing isolated render ${marker}`);
}
// Privacy masks are isolated as well, so stale authenticated metadata cannot survive a failed cleanup.
for(const marker of ['MASK_HOME','MASK_PLAYER','MASK_ALLIANCE'])assert.match(body,new RegExp(`safeRenderStep\\("${marker}"`));

// The regression seen on device was: home ALL4/R4 updated while Alliance drawer stayed — / 0 / —.
// The drawer must force a fresh, fully isolated render immediately before opening.
assert.match(app,/\["account","player","alliance","vs","season"\]\.includes[\s\S]*?DRAWER_REFRESH_/);
assert.match(app,/function renderAllianceCoreSummary\(p,a\)[\s\S]*?#aTag[\s\S]*?#aCount[\s\S]*?#aRole/);
assert.match(body,/safeRenderStep\("ALLIANCE_SUMMARY",\(\)=>renderAllianceCoreSummary\(p,a\)\)/);

// Core summary writes are not left as unprotected direct writes inside render().
assert.doesNotMatch(body,/\$\("#aTag"\)\.textContent=a\.tag/);
assert.doesNotMatch(body,/\$\("#pName"\)\.textContent=p\.name/);
assert.doesNotMatch(body,/const homeVsSituation=/);

// Account isolation from HF8.6.21 remains intact.
assert.match(app,/if\(name==="account"\)\{safeRenderStep\("ACCOUNT_OPEN_FIELDS",renderAccountFields\)/);
assert.match(app,/function safeRenderStep\(stage,fn\)\{[\s\S]*?catch\(error\)[\s\S]*?RENDER_/);

// Canonical DOM ids remain unique.
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const seen=new Set();
for(const id of ids){assert.ok(!seen.has(id),`duplicate DOM id ${id}`);seen.add(id)}
for(const id of ['playerMeta','allianceMeta','vsMeta','pName','aTag','aCount','aRole','adviceTitle','fName'])assert.ok(seen.has(id),`missing ${id}`);

assert.ok(pkg.scripts.check.includes('verify-v2.5.28-hf8-6-22.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-22.mjs'));
console.log('WarBoost V2.5.28 HF8.6.22 Full Module Render Isolation verification: PASS');
