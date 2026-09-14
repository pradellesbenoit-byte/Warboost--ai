import fs from 'node:fs';
import assert from 'node:assert/strict';
import {canRevealOwnedPrivateState} from '../lib/session-bootstrap.js';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

const user='5984c9a5-5e04-48ee-aedc-d34d55b45ec2';

// Exact regression represented by the player's screenshots: auth/invite/consent are valid,
// state already belongs to the same user, but cloudProfileVerified may still be false or transient.
assert.equal(canRevealOwnedPrivateState({
  userId:user,stateOwnerId:user,betaAllowed:true,consentAccepted:true,betaAccessStatus:'accepted'
}),true,'owned invited state must render independently of cloud restore completion');

assert.equal(canRevealOwnedPrivateState({
  userId:user,stateOwnerId:'other-user',betaAllowed:true,consentAccepted:true,betaAccessStatus:'accepted'
}),false,'another account state must never render');
assert.equal(canRevealOwnedPrivateState({
  userId:user,stateOwnerId:user,betaAllowed:true,consentAccepted:true,betaAccessStatus:'checking'
}),false,'checking access remains fail-closed');
assert.equal(canRevealOwnedPrivateState({
  userId:user,stateOwnerId:user,betaAllowed:false,consentAccepted:true,betaAccessStatus:'invite-required'
}),false,'uninvited access remains hidden');
assert.equal(canRevealOwnedPrivateState({
  userId:user,stateOwnerId:user,betaAllowed:true,consentAccepted:false,betaAccessStatus:'accepted'
}),false,'consent remains required');

assert.match(app,/const RELEASE_LABEL="HF8\.6\.24"/);
assert.match(app,/canRevealOwnedPrivateState\(\{userId,stateOwnerId,betaAllowed:betaAccessAllowed\(\),consentAccepted:betaConsentAccepted\(\),betaAccessStatus:betaState\?\.access_status\}\)/);
assert.match(app,/function betaPrivateDataVisible\(\)\{const userId=.*canRevealOwnedPrivateState/);
assert.match(app,/ALLIANCE_OPEN_CORE/);
assert.match(app,/ALLIANCE_OPEN_MEMBERS/);
assert.match(app,/logged&&invited&&consented/);
assert.match(index,/WarBoost V2\.5\.28 HF8\.6\.24/);
assert.match(index,/app\.js\?v=hf8624/);
assert.match(sw,/warboost-v2-5-28-hf8-6-24-owned-state-visibility-reliability/);

console.log('HF8.6.24 Owned State Visibility Reliability: PASS');
