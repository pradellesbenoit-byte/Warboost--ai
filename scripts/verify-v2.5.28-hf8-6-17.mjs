import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readOwnProfileDirect} from '../lib/cloud-profile-direct.js';
import {hydrateCloudState,hasMeaningfulCoreState,betaStateAfterVerifiedStateRead} from '../lib/cloud-state-recovery.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),i18n=read('i18n.js'),health=read('api/health.js'),sw=read('sw.js'),manifest=read('manifest.webmanifest'),pkg=JSON.parse(read('package.json'));

// Release identity must be trustworthy on the actual player device.
assert.match(app,/const RELEASE_LABEL="HF8\.6\.(?:17|18)"/);
assert.match(html,/HF8\.6\.(?:17|18)/);
assert.match(html,/\/app\.js\?v=hf861(?:7|8)/);
assert.match(html,/\/publisher-ui\.js\?v=hf861(?:7|8)/);
assert.match(sw,/(?:warboost-v2-5-28-hf8-6-17-cloud-profile-restore-reliability|warboost-v2-5-28-hf8-6-18-fast-login-restore)/);
assert.match(sw,/"\/lib\/cloud-profile-direct\.js"/);
assert.match(manifest,/HF8\.6\.(?:17|18)/);
assert.match(pkg.description,/HF8\.6\.(?:17|18)/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.(?:17|18)/);
assert.doesNotMatch(i18n.slice(i18n.lastIndexOf('V2528_HF8_6_11_PLAYER_RELIABILITY')),/target\.tagline=`V2\.5\.28 HF8\.6\.11/);

// The exact current bug: a meaningful local fallback must never stop an authenticated cloud retry.
const retryBlock=app.slice(app.indexOf('function scheduleCloudPullRetry'),app.indexOf('function markLargeKeepaliveDeferred'));
assert.match(retryBlock,/cloudProfileVerified/);
assert.doesNotMatch(retryBlock,/hasMeaningfulCore\(state\)/);
const sessionBlock=app.slice(app.indexOf('async function applySession(session)'),app.indexOf('function cloudAuthFailureMessage'));
assert.match(sessionBlock,/scheduleCloudPullRetry\(\);/);
assert.match(sessionBlock,/same token|cloudProfileVerified/);
assert.match(app,/lastAppliedSessionKey===key[\s\S]{0,180}cloudProfileVerified/);
assert.match(app,/await applySession\(session\);/);
assert.match(app,/if\(betaConsentAccepted\(\)&&!cloudProfileVerified\)\{[\s\S]{0,500}await pullServerState\(seed(?:,\{fastRestore:true\})?\)/);
assert.match(sessionBlock,/catch\(error\)\{[\s\S]{0,700}scheduleCloudPullRetry\(1500\)/);
assert.match(app,/if\(!cloudProfileVerified&&cloudSession\?\.access_token&&betaConsentAccepted\(\)\)pullServerState/);

// Consent activation must attempt the authoritative state route even if betaState was not yet hydrated.
const consentLine=app.match(/\$\("#betaConsent"\)\?\.addEventListener\("change",async e=>\{[^\n]+/s)?.[0]||'';
assert.match(consentLine,/await pullServerState\(safeClone\(state\)(?:,\{fastRestore:true\})?\)/);
assert.doesNotMatch(consentLine,/if\(cloudSession\?\.access_token&&betaAccessAllowed\(\)\)/);

// While the invite lookup is running, never display the legacy "not configured" fail-open state.
assert.match(sessionBlock,/enforced:true,configured:true,allowed:false,access_status:"checking"/);
assert.match(app,/betaState\.access_status==="checking"\)return t\("syncing"\)/);

// Fallback is strictly a read of the authenticated user's own row and only after invite verification.
assert.match(app,/async function pullDirectOwnProfile/);
assert.match(app,/betaState\.allowed!==true/);
assert.match(app,/readOwnProfileDirect/);
assert.match(health,/auth_session_bootstrap_single_flight:true/);
assert.match(health,/cloud_pull_retry_even_with_local_fallback:true/);
assert.match(health,/direct_own_profile_rls_read_fallback_after_beta_verification:true/);
assert.match(health,/displayed_release_label_not_overridden_by_legacy_i18n:true/);
assert.match(health,/cloud_profile_restore_server_ready:Boolean\(serviceProbe\.ok&&beta\.database_invites_available\)/);
assert.match(health,/database_invites_available:Boolean\(beta\.database_invites_available\)/);
for(const flag of ['same_session_degraded_bootstrap_retries','cloud_retry_on_online_even_with_local_fallback','consent_activation_authoritative_state_pull','beta_checking_never_shows_unconfigured'])assert.match(health,new RegExp(`${flag}:true`));

// Dynamic direct-profile contract: correct user filter, bearer token, publishable key, full profile returned.
const fixture={
  player:{name:'les gladiateurs81',server_id:'884',hq_level:30,role:'R4'},
  alliance:{tag:'ALL4',members:Array.from({length:92},(_,i)=>({name:`Member ${i+1}`}))},
  squads:Array.from({length:4},(_,i)=>({id:i+1,name:`Squad ${i+1}`,power:40+i,heroes:Array.from({length:5},(_,j)=>({name:`Hero ${i+1}-${j+1}`,level:150}))})),
  drone:{level:150,power_m:8.1},progression_snapshots:[{at:'2026-09-13T00:00:00Z'}]
};
let seenUrl='',seenInit=null;
const fakeFetch=async(url,init)=>{seenUrl=String(url);seenInit=init;return {ok:true,status:200,async text(){return JSON.stringify([{state:fixture,updated_at:'2026-09-13T18:00:00Z'}])}}};
const direct=await readOwnProfileDirect({url:'https://project.supabase.co/',key:'publishable-key',accessToken:'user-token',userId:'user-123',fetchImpl:fakeFetch,timeoutMs:3000});
assert.equal(direct.ok,true);
assert.equal(direct.state.player.name,'les gladiateurs81');
assert.equal(direct.state.alliance.members.length,92);
assert.match(seenUrl,/\/rest\/v1\/wb1_profiles\?player_id=eq\.user-123/);
assert.equal(seenInit.headers.apikey,'publishable-key');
assert.equal(seenInit.headers.authorization,'Bearer user-token');

const denied=await readOwnProfileDirect({url:'https://project.supabase.co',key:'publishable-key',accessToken:'bad-token',userId:'user-123',fetchImpl:async()=>({ok:false,status:401,async text(){return JSON.stringify({message:'JWT expired'})}})});
assert.equal(denied.ok,false);
assert.equal(denied.status,401);

// Structural hydration must preserve the real shape that was present in the cloud profile.
const defaults={player:{},alliance:{members:[]},squads:[],drone:{},shop:{},season:{},technology:{},player_context:{},vs:{},sync:{}};
const hydrated=hydrateCloudState(fixture,defaults,'user-123');
assert.equal(hydrated.player_id,'user-123');
assert.equal(hydrated.player.name,'les gladiateurs81');
assert.equal(hydrated.player.server_id,'884');
assert.equal(hydrated.player.hq_level,30);
assert.equal(hydrated.alliance.tag,'ALL4');
assert.equal(hydrated.alliance.members.length,92);
assert.equal(hydrated.squads.length,4);
assert.ok(hasMeaningfulCoreState(hydrated));

const verified=betaStateAfterVerifiedStateRead({allowed:false,enforced:true},{ok:true,status:200,consentVersion:'2026-09-05-safe-launch-v2'});
assert.equal(verified.allowed,true);
assert.equal(verified.access_status,'accepted');

console.log('WarBoost V2.5.28 HF8.6.17 Cloud Profile Restore Reliability verification: PASS');
