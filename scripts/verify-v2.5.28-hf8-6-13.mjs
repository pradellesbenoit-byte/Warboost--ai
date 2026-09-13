import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {betaStateAfterVerifiedStateRead} from '../lib/cloud-state-recovery.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js');

// Server-authorized state read is sufficient proof to reveal data.
let beta=betaStateAfterVerifiedStateRead({allowed:false,enforced:true,configured:true,access_status:'checking'},{ok:true,status:200,consentVersion:'v'});
assert.equal(beta.allowed,true);assert.equal(beta.access_status,'accepted');assert.equal(beta.pro_included,true);
// Definitive revocation stays fail-closed.
beta=betaStateAfterVerifiedStateRead({allowed:true,enforced:true,configured:true,access_status:'accepted'},{ok:false,status:403,error:'BETA_INVITE_REVOKED'});
assert.equal(beta.allowed,false);assert.equal(beta.access_status,'revoked');
// Transient failures never turn a previously verified user into a fake locked/empty UI.
beta=betaStateAfterVerifiedStateRead({allowed:true,enforced:true,configured:true,access_status:'accepted'},{ok:false,status:503,error:'TEMP'});
assert.equal(beta.allowed,true);

assert.match(app,/if\(betaConsentAccepted\(\)\)\{\n\s+(?:const|let) pulled=await pullServerState\(loginSeed\)/);
assert.doesNotMatch(app,/if\(betaAccessAllowed\(\)&&betaConsentAccepted\(\)\)\{\n\s+const pulled=await pullServerState\(loginSeed\)/);
assert.match(app,/betaState=betaStateAfterVerifiedStateRead\(betaState,\{ok:true,status:r\.status/);
const retry=app.match(/function scheduleCloudPullRetry\(delay=2500\)\{[^\n]+\}/)?.[0]||'';
assert.ok(retry);assert.match(retry,/!betaConsentAccepted\(\)/);assert.match(retry,/cloudProfileVerified/);assert.doesNotMatch(retry,/hasMeaningfulCore\(state\)/);assert.doesNotMatch(retry,/!betaAccessAllowed\(\)/);
assert.match(app,/const previouslyVerified=betaState\?\.allowed===true/);
assert.match(app,/allowed:definitive\?false:previouslyVerified/);
assert.match(html,/HF8\.6\.13/);assert.match(sw,/hf8-6-13-verified-cloud-access-restore/);assert.match(health,/ui_revision_verified_access_restore:"hf8\.6\.13-verified-cloud-access-restore"/);
assert.match(health,/verified_state_read_unlocks_private_data:true/);
console.log('WarBoost V2.5.28 HF8.6.13 Verified Cloud Access Restore verification: PASS');
