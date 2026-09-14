import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {shouldPreserveVerifiedSessionAccess,betaStateForSessionBootstrap,preserveAllowedAfterTransient,restoreAttemptSucceeded} from '../lib/session-bootstrap.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js'),i18n=read('i18n.js'),manifest=JSON.parse(read('manifest.webmanifest')),pkg=JSON.parse(read('package.json'));

// Exact field bug: same account already verified, then Supabase rotates the token.
assert.equal(shouldPreserveVerifiedSessionAccess({previousUserId:'u1',nextUserId:'u1',cloudProfileVerified:true,betaAllowed:true,betaAccessStatus:'accepted'}),true);
const preserved=betaStateForSessionBootstrap({allowed:true,access_status:'accepted',enforced:true},{preserveVerified:true});
assert.equal(preserved.allowed,true);
assert.equal(preserved.access_status,'accepted');

// Security boundaries remain strict for a new/different/revoked account.
assert.equal(shouldPreserveVerifiedSessionAccess({previousUserId:'u1',nextUserId:'u2',cloudProfileVerified:true,betaAllowed:true,betaAccessStatus:'accepted'}),false);
assert.equal(shouldPreserveVerifiedSessionAccess({previousUserId:'u1',nextUserId:'u1',cloudProfileVerified:true,betaAllowed:true,betaAccessStatus:'revoked'}),false);
const fresh=betaStateForSessionBootstrap({allowed:true,access_status:'accepted'},{preserveVerified:false});
assert.equal(fresh.allowed,false);
assert.equal(fresh.access_status,'checking');

// A late transient /api/pro failure must not overwrite a successful /api/state verification.
assert.equal(preserveAllowedAfterTransient({previouslyVerified:false,currentAllowed:true}),true);
assert.equal(preserveAllowedAfterTransient({previouslyVerified:false,currentAllowed:false}),false);

// Stale cloudProfileVerified from a previous token is no longer accepted as this restore attempt's success.
assert.equal(restoreAttemptSucceeded({ok:false,cloud_empty:false}),false);
assert.equal(restoreAttemptSucceeded({ok:true}),true);
assert.equal(restoreAttemptSucceeded({cloud_empty:true}),true);

assert.match(app,/const RELEASE_LABEL="HF8\.6\.23"/);
assert.match(app,/shouldPreserveVerifiedSessionAccess\(\{previousUserId,nextUserId:userId,cloudProfileVerified,betaAllowed:betaState\?\.allowed===true/);
assert.match(app,/betaState=betaStateForSessionBootstrap\(betaState,\{preserveVerified:preserveVerifiedAccess\}\)/);
assert.match(app,/const betaCheckPromise=runBootstrapStage\("BETA_CHECK_PARALLEL",\(\)=>refreshBeta\(\)\)\.catch\(\(\)=>null\)/);
assert.match(app,/await betaCheckPromise/);
assert.match(app,/const success=restoreAttemptSucceeded\(pulled\)/);
assert.doesNotMatch(app,/const success=Boolean\([^\n;]*cloudProfileVerified/);
assert.match(app,/preserveAllowedAfterTransient\(\{previouslyVerified,currentAllowed:betaState\?\.allowed===true\}\)/);
assert.match(app,/renderBeta\(\);render\(\);return betaState/);
assert.match(app,/const needsRecovery=Boolean\(!cloudProfileVerified\|\|betaState\?\.restore_error\)/);
assert.match(app,/lastAppliedSessionKey===key[\s\S]{0,260}betaState\?\.allowed===true[\s\S]{0,220}access_status!==\"checking\"/);
assert.match(sw,/\"\/lib\/session-bootstrap\.js\"/);

assert.match(html,/WarBoost V2\.5\.28 HF8\.6\.23/);
assert.match(html,/\/app\.js\?v=hf8623/);
assert.match(html,/\/publisher-ui\.js\?v=hf8623/);
assert.match(sw,/warboost-v2-5-28-hf8-6-23-session-state-machine-reliability/);
assert.match(manifest.name,/HF8\.6\.23/);
assert.match(pkg.description,/HF8\.6\.23/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.23/);
assert.match(health,/release:"HF8\.6\.23"/);
assert.match(health,/ui_revision_session_state_machine_reliability:"hf8\.6\.23-session-state-machine-reliability"/);
assert.match(health,/same_user_token_refresh_preserves_verified_access:true/);
assert.match(health,/stale_profile_verified_flag_cannot_fake_restore_success:true/);
assert.match(health,/beta_access_check_parallel_to_profile_restore:true/);
assert.match(health,/transient_beta_race_preserves_current_verified_access:true/);
assert.match(health,/verified_session_retry_not_suppressed_by_stale_flag:true/);
assert.match(health,/session_reuse_requires_consistent_verified_access:true/);
assert.ok(pkg.scripts.check.includes('lib/session-bootstrap.js'));
assert.ok(pkg.scripts.check.includes('verify-v2.5.28-hf8-6-23.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-23.mjs'));

console.log('WarBoost V2.5.28 HF8.6.23 Session State Machine Reliability verification: PASS');
