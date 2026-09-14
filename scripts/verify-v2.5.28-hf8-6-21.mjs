import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js'),i18n=read('i18n.js'),manifest=JSON.parse(read('manifest.webmanifest')),pkg=JSON.parse(read('package.json'));

// Release/cache identity.
assert.match(app,/const RELEASE_LABEL="HF8\.6\.21"/);
assert.match(html,/WarBoost V2\.5\.28 HF8\.6\.(21|22)/);
assert.match(html,/\/app\.js\?v=hf862(1|2)/);
assert.match(html,/\/publisher-ui\.js\?v=hf862(1|2)/);
assert.match(sw,/warboost-v2-5-28-hf8-6-21-render-boundary-reliability/);
assert.match(manifest.name,/HF8\.6\.21/);
assert.match(pkg.description,/HF8\.6\.21/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.(21|22)/);

// Exact regression: account binding must happen before heavy Player/Alliance/VS/Season rendering.
const renderStart=app.indexOf('function render(){');
const renderEnd=app.indexOf('\nfunction squadHasSavedData',renderStart);
assert.ok(renderStart>=0&&renderEnd>renderStart,'render() not found');
const renderBody=app.slice(renderStart,renderEnd);
const accountPos=renderBody.indexOf('safeRenderStep("ACCOUNT_FIELDS",renderAccountFields)');
const squadsPos=renderBody.indexOf('safeRenderStep("SQUADS",renderSquads)');
const alliancePos=renderBody.indexOf('safeRenderStep("ALLIANCE_MEMBERS",renderMembers)');
const vsPos=renderBody.indexOf('safeRenderStep("VS_LIVE",renderVsLive)');
assert.ok(accountPos>=0&&squadsPos>accountPos&&alliancePos>accountPos&&vsPos>accountPos,'account binding is not first');

// A module render exception must not abort the remaining UI pipeline.
assert.match(app,/function safeRenderStep\(stage,fn\)\{[\s\S]*?catch\(error\)[\s\S]*?pushBootstrapStage\(`RENDER_/);
for(const marker of ['PLAYER_ONBOARDING','SQUADS','PLAYER_PROGRESSION','EXCLUSIVE_WEAPONS','PLAYER_ACTIVITY','ALLIANCE_ACCESS','VS_ACCESS','SEASON_ACCESS','ALLIANCE_MEMBERS','DESERT_STORM','VS_LIVE','VS_TIMELINE','ADVICE','PROVIDER']){
  assert.match(renderBody,new RegExp(`safeRenderStep\\("${marker}"`),`missing isolated render ${marker}`);
}

// Opening Account always rebinds from current state even if a previous cross-module render failed.
assert.match(app,/if\(name==="account"\)\{safeRenderStep\("ACCOUNT_OPEN_FIELDS",renderAccountFields\)/);

// The account form has exactly one canonical target for each identity field.
for(const id of ['fName','fServer','fHq','fAlliance','fRole']){
  const n=(html.match(new RegExp(`id="${id}"`,'g'))||[]).length;
  assert.equal(n,1,`${id} must exist exactly once`);
}

// renderAccountFields must map the same state used by the Player drawer.
assert.match(app,/\$\("#fName"\)\.value=p\.name\|\|""/);
assert.match(app,/\$\("#fServer"\)\.value=p\.server_id\|\|""/);
assert.match(app,/\$\("#fHq"\)\.value=p\.hq_level\|\|""/);
assert.match(app,/\$\("#fAlliance"\)\.value=state\.alliance\.tag\|\|""/);
assert.match(app,/\$\("#fRole"\)\.value=p\.role\|\|"R1"/);
assert.match(app,/function renderPlayerCoreSummary\(p,d\)[\s\S]*?#pName/);

// Health makes this specific runtime hardening observable.
assert.match(health,/release:"HF8\.6\.(21|22)"/);
assert.match(health,/ui_revision_render_boundary_reliability:"hf8\.6\.21-render-boundary-reliability"/);
assert.match(health,/account_form_render_isolated:true/);
assert.match(health,/module_render_failures_non_blocking:true/);

// Guard against obvious DOM drift: every simple #id selector referenced by app.js must exist in index.html,
// except selectors that are intentionally generated dynamically.
const htmlIds=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const referenced=[...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map(m=>m[1]);
const dynamicAllowed=new Set(['exclusiveWeaponCount','betaFeedbackBtn','exclusiveWeaponList','vsStartScanBtn','shopAdviceBtn','betaFeedbackKind','betaFeedbackText','betaFeedbackDiagnostics','betaFeedbackShareBtn','betaFeedbackStatus']); // optional/dynamically injected controls
const missing=[...new Set(referenced.filter(id=>!htmlIds.has(id)&&!dynamicAllowed.has(id)))];
assert.deepEqual(missing,[],`missing DOM ids: ${missing.join(', ')}`);

assert.ok(pkg.scripts.check.includes('verify-v2.5.28-hf8-6-21.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-21.mjs'));
console.log('WarBoost V2.5.28 HF8.6.21 Render Boundary Reliability verification: PASS');
