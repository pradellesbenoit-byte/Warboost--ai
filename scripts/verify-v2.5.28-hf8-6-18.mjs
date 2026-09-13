import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),stateApi=read('api/state.js'),health=read('api/health.js'),html=read('index.html'),i18n=read('i18n.js'),sw=read('sw.js'),manifest=read('manifest.webmanifest'),pkg=JSON.parse(read('package.json'));

assert.match(app,/const RELEASE_LABEL="HF8\.6\.18"/);
assert.match(html,/HF8\.6\.18/);
assert.match(html,/\/app\.js\?v=hf8618/);
assert.match(html,/\/publisher-ui\.js\?v=hf8618/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.18/);
assert.match(sw,/warboost-v2-5-28-hf8-6-18-fast-login-restore/);
assert.match(manifest,/HF8\.6\.18/);
assert.match(pkg.description,/HF8\.6\.18/);

// Login-critical recovery must use the lightweight authenticated state route.
assert.match(app,/pullServerState\(loginSeed,\{fastRestore:true\}\)/);
assert.match(app,/pullServerState\(seed,\{fastRestore:true\}\)/);
assert.match(app,/async function pullServerState\(loginSeed=null,\{fastRestore=false\}=\{\}\)/);
assert.match(app,/fastRestore\?"\/api\/state\?restore=1":"\/api\/state"/);
assert.match(app,/stateTimeout=fastRestore\?6500:12000/);
assert.match(app,/scheduleCloudPullRetry[\s\S]{0,700}pullServerState\(seed,\{fastRestore:true\}\)/);

// Server fast restore returns the player's own profile before history/roster work.
const getBlock=stateApi.slice(stateApi.indexOf('if(req.method==="GET")'),stateApi.indexOf('if(req.method==="POST")'));
assert.match(getBlock,/fastRestore/);
assert.match(getBlock,/restore_mode:"fast-profile"/);
assert.match(getBlock,/status:"deferred_fast_restore"/);
const fastIdx=getBlock.indexOf('if(fastRestore)return');
const historyIdx=getBlock.indexOf('historyOwn(100)');
const rosterIdx=getBlock.indexOf('canonicalizeAllianceState');
assert.ok(fastIdx>0&&historyIdx>fastIdx&&rosterIdx>fastIdx,'fast restore must return before history/roster reconciliation');

assert.match(health,/ui_revision_fast_login_restore:"hf8\.6\.18-fast-login-restore"/);
assert.match(health,/auth_fast_profile_restore_endpoint:true/);
assert.match(health,/auth_fast_restore_skips_heavy_history_and_roster_repair:true/);

// Regression: normal state GET and POST still keep history + canonical alliance behavior.
assert.match(getBlock,/historyOwn\(100\)/);
assert.match(getBlock,/canonicalizeAllianceState\(finalState,playerId\)/);
assert.match(stateApi,/if\(req.method==="POST"\)[\s\S]*canonicalizeAllianceState\(incoming,playerId\)/);

console.log('WarBoost V2.5.28 HF8.6.18 Fast Login Restore verification: PASS');
