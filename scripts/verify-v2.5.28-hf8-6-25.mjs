import fs from 'node:fs';
import assert from 'node:assert/strict';
import {LANGUAGES} from '../i18n.js';
import {canRevealOwnedPrivateState} from '../lib/session-bootstrap.js';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const health=fs.readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8');
const standard=fs.readFileSync(new URL('../WARBOOST_V2_5_28_HF8_6_25_PLAYER_LAUNCH_INTEGRITY.md',import.meta.url),'utf8');

assert.match(app,/const RELEASE_LABEL="HF8\.6\.(?:25|2[6-9]|[3-9]\d*)"/);
assert.match(index,/WarBoost V2\.5\.28 HF8\.6\.(?:25|2[6-9]|[3-9]\d*)/);
assert.match(index,/app\.js\?v=hf8625/);
assert.match(sw,/hf8-6-(?:25-player-launch-integrity|2[6-9]-|[3-9]\d*-)/);
assert.match(health,/release:"HF8\.6\.(?:25|2[6-9]|[3-9]\d*)"/);
assert.match(manifest,/HF8\.6\.25/);

// Exact security boundary: only current authenticated owner + invite + consent can render private data.
const user='player-a';
assert.equal(canRevealOwnedPrivateState({userId:user,stateOwnerId:user,betaAllowed:true,consentAccepted:true,betaAccessStatus:'accepted'}),true);
assert.equal(canRevealOwnedPrivateState({userId:user,stateOwnerId:'player-b',betaAllowed:true,consentAccepted:true,betaAccessStatus:'accepted'}),false);
assert.equal(canRevealOwnedPrivateState({userId:user,stateOwnerId:user,betaAllowed:false,consentAccepted:true,betaAccessStatus:'invite-required'}),false);
assert.equal(canRevealOwnedPrivateState({userId:user,stateOwnerId:user,betaAllowed:true,consentAccepted:false,betaAccessStatus:'accepted'}),false);

// One restore/reconciliation path for retries and mobile lifecycle events.
assert.match(app,/async function reconcileAuthenticatedRuntime\(reason="runtime"/);
assert.match(app,/scheduleCloudPullRetry[\s\S]*restoreAuthenticatedProfile\(readAccountState/);
assert.match(app,/window\.addEventListener\("online",\(\)=>\{void reconcileAuthenticatedRuntime\("online",\{force:true\}\)\}\)/);
assert.match(app,/visibilitychange[\s\S]*reconcileAuthenticatedRuntime\("visible"\)/);
assert.match(app,/pageshow[\s\S]*reconcileAuthenticatedRuntime/);
assert.match(app,/reconcileAuthenticatedRuntime\("manual-sync",\{force:true\}\)/);

// Account-safe persistence and cloud-write ownership.
assert.match(app,/last_error:"account_owner_mismatch"/);
assert.match(app,/if\(!userId\|\|ownerId!==userId\)return \{skipped:true,reason:"account_owner_mismatch"\}/);
assert.match(app,/cloudHydrationPending&&betaConsentAccepted\(\)&&!betaPrivateDataVisible\(\)/);

// Launch-critical product capability gate.
for(const marker of [
  'renderPlayer7DayPlan','priorities:[]','resource_efficiency','avoid_now','shopGroupRows',
  'renderAllianceRankManager','renderDesertStormPlanner','warPlanBtn','allianceParticipationOverview',
  'vsDecisionEngine','renderVsLive','seasonLifecycle','renderSeasonCoreSummary',
  'savePendingSingleScan','movePendingScans','renderPlayerProgression','renderExclusiveWeapons',
  'supportAttachment','betaFeedbackReport','playerOnboardingStatus'
]) assert.ok(app.includes(marker),`missing launch capability marker: ${marker}`);

assert.ok(LANGUAGES.length>=24,'auto + 23 selectable locale entries must remain available');
assert.match(standard,/totally new invited account/i);
assert.match(standard,/zero cross-account leakage/i);
assert.match(standard,/Missing data must reduce confidence/i);

console.log('HF8.6.25 Player Launch Integrity: PASS');
