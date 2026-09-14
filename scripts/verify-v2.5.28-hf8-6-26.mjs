import fs from 'node:fs';
import assert from 'node:assert/strict';
import {deriveRuntimeAccessState} from '../lib/session-bootstrap.js';
import {LANGUAGES,translator} from '../i18n.js';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../i18n.js',import.meta.url),'utf8');
const health=fs.readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8');

assert.match(app,/const RELEASE_LABEL="HF8\.6\.26"/);
assert.match(index,/WarBoost V2\.5\.28 HF8\.6\.26/);
assert.match(index,/app\.js\?v=hf8626/);
assert.match(sw,/hf8-6-26-cross-module-state-integrity/);
assert.match(health,/release:"HF8\.6\.26"/);
assert.match(manifest,/HF8\.6\.26/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.26/);
assert.doesNotMatch(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.24/);

const ready=deriveRuntimeAccessState({userId:'u1',stateOwnerId:'u1',betaAllowed:true,consentAccepted:true,betaAccessStatus:'accepted'});
assert.equal(ready.phase,'ready');assert.equal(ready.privateVisible,true);
const signedOut=deriveRuntimeAccessState({stateOwnerId:'u1',betaAllowed:true,consentAccepted:true,betaAccessStatus:'accepted'});
assert.equal(signedOut.phase,'signed-out');assert.equal(signedOut.privateVisible,false);
const consent=deriveRuntimeAccessState({userId:'u1',stateOwnerId:'u1',betaAllowed:true,consentAccepted:false,betaAccessStatus:'accepted'});
assert.equal(consent.phase,'consent-required');assert.equal(consent.privateVisible,false);
const mismatch=deriveRuntimeAccessState({userId:'u1',stateOwnerId:'u2',betaAllowed:true,consentAccepted:true,betaAccessStatus:'accepted'});
assert.equal(mismatch.phase,'syncing');assert.equal(mismatch.privateVisible,false);
const checking=deriveRuntimeAccessState({userId:'u1',stateOwnerId:'u1',betaAllowed:true,consentAccepted:true,betaAccessStatus:'checking'});
assert.equal(checking.phase,'syncing');assert.equal(checking.privateVisible,false);
const denied=deriveRuntimeAccessState({userId:'u1',stateOwnerId:'u1',betaAllowed:false,consentAccepted:true,betaAccessStatus:'revoked'});
assert.equal(denied.phase,'access-denied');assert.equal(denied.privateVisible,false);
const staleAllowedRevoked=deriveRuntimeAccessState({userId:'u1',stateOwnerId:'u1',betaAllowed:true,consentAccepted:true,betaAccessStatus:'revoked'});
assert.equal(staleAllowedRevoked.phase,'access-denied');assert.equal(staleAllowedRevoked.privateVisible,false);

// One state contract powers every screen that previously contradicted Account.
assert.match(app,/function runtimeAccessState\(\)/);
assert.match(app,/function betaPrivateDataVisible\(\)\{return runtimeAccessState\(\)\.privateVisible\}/);
assert.match(app,/function renderAdvice\(\)\{const access=runtimeAccessState\(\)/);
assert.match(app,/function renderProvider\(\)[\s\S]*access=runtimeAccessState\(\)/);
assert.match(app,/function renderDesertStormPlanner\(\)[\s\S]*access=runtimeAccessState\(\)/);
assert.match(app,/ALLIANCE_OPEN_DESERT_STORM/);
assert.match(app,/box\.textContent=reveal\?\(s\.pending_cloud_save\?t\("offline_keep"\):t\("safe_sync_note"\)\):betaAccessMessage\(\)/);
assert.match(app,/desertStormRosterPicker[\s\S]*betaAccessMessage\(\)/);
assert.match(app,/function renderPlayerActivity\(\)[\s\S]*betaAccessMessage\(\)/);

// Audit fixes from the real screenshots.
assert.match(app,/rosterIntegrityWarning/);
assert.match(app,/summary\.roleCounts\.R5/);
assert.match(app,/vsUsScore"\)\.textContent=liveKnown/);
assert.match(app,/vsContextWarning=vsObjective&&!vsFresh\.current/);
assert.match(app,/function renderSeasonAccess\(\)[\s\S]*confirmed=life===\"active\"\|\|life===\"ended\"\|\|life===\"interseason\"[\s\S]*confirmed\?\" hidden\"/);
assert.match(index,/id="supportBuildPill"[^>]*>V2\.5\.28 · HF8\.6\.26/);
assert.match(app,/supportBuildPill/);
assert.match(i18n,/Les données validées issues du scan restent enregistrées/);

// Static UI integrity: no duplicate DOM ids and every declared i18n key resolves.
const ids=[...index.matchAll(/\bid=\"([^\"]+)\"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'duplicate HTML id detected');
const staticI18nKeys=new Set([
  ...[...index.matchAll(/data-i18n=\"([^\"]+)\"/g)].map(m=>m[1]),
  ...[...index.matchAll(/data-i18n-placeholder=\"([^\"]+)\"/g)].map(m=>m[1])
]);
const en=translator('en-GB');
for(const key of staticI18nKeys)assert.notEqual(en(key),key,`missing English/fallback i18n key: ${key}`);
assert.ok(LANGUAGES.length>=24,'auto + 23 locale choices must remain available');
for(const entry of LANGUAGES){if(entry.code==='auto')continue;const tx=translator(entry.code);for(const key of staticI18nKeys)assert.notEqual(tx(key),key,`unresolved i18n key ${key} for ${entry.code}`)}

console.log('HF8.6.26 Cross-Module State Integrity: PASS');
