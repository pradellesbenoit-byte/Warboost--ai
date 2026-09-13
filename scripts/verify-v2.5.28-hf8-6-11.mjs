import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeCloudRosterWithIdentity} from '../lib/alliance-roster-merge.js';
import {mergeCanonicalRoster,replaceCanonicalRosterFromCompleteSnapshot} from '../lib/alliance-scope.js';
import {resolveRosterScanRows} from '../lib/roster-identity-resolution.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js'),pro=read('api/pro.js'),advice=read('api/advice.js'),pkg=JSON.parse(read('package.json'));

// 1) Future-player onboarding must not require account power after a valid profile scan.
assert.match(app,/function playerOnboardingStatus\(\)/);
assert.match(app,/profileReady=Boolean\(String\(state\?\.player\?\.name/);
const onboardingBlock=app.match(/function playerOnboardingStatus\(\)\{[\s\S]*?\n\}/)?.[0]||'';
assert.ok(onboardingBlock,'onboarding status helper missing');
const profileLine=onboardingBlock.split('\n').find(x=>x.includes('profileReady'))||'';assert.doesNotMatch(profileLine,/power_m/,'account power must remain optional for profile readiness');
assert.match(onboardingBlock,/next_type=!profileReady\?"profile":!mainReady\?"squad1":!droneReady\?"drone":null/);
for(const id of ['playerOnboardingSteps','playerOnboardingScanBtn','quickProfileScanBtn','quickSquadScanBtn','quickDroneScanBtn'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(app,/onboarding_need_squad/);

// 2) Safe Launch beta PRO is entitlement-by-invite+consent, never transient /api/pro network state.
assert.match(app,/function safeLaunchBetaMode\(\)/);assert.match(app,/betaState\?\.allowed===true/);assert.match(app,/function safeLaunchBetaProIncluded\(\)/);
const requirePro=app.match(/function requirePro\(\)\{[^\n]+\}/)?.[0]||'';
assert.ok(requirePro);
assert.match(requirePro,/if\(safeLaunchBetaMode\(\)\).*requireBetaAccess\(\).*requireBetaConsent\(\).*return true/);
assert.doesNotMatch(requirePro,/if\(proState\.active\)return true;openDrawer\("account"\).*beta_invite_required/);
assert.match(pro,/pro_included:Boolean\(beta\.allowed\)/);
assert.match(pro,/payments_enabled:false/);

// 3) Server-canonical state must come back into the phone after save/pull.
const push=app.match(/async function pushServerState[\s\S]*?\n\}/)?.[0]||'';
assert.match(push,/if\(j\?\.state\)/);
assert.match(push,/mergeStateProtected\(state,j\.state,\{preferBase:false\}\)/);
assert.match(app,/alliance_roster_repair\?\.status==="canonical_roster_applied"/);
assert.match(app,/mergeStateProtected\(state,j\.state,\{preferBase:false\}\)\.state|mergeStateProtected\(state,j\.state,\{preferBase:false\}\)/);

// 4) Empty scan/sync fields must not erase previously known data.
assert.match(app,/mergeStateProtected\(state,j\.state,\{preferBase:false\}\)/);

// 5) Alliance: ordinary players receive a clear role gate; management remains R4/R5 only.
assert.match(html,/id="allianceAccessNotice"/);
assert.ok((html.match(/allianceManagerOnly/g)||[]).length>=7,'manager-only alliance sections not fully marked');
assert.match(app,/function renderAllianceAccess\(\)/);
assert.match(app,/\["R4","R5"\]\.includes\(role\)/);
assert.match(advice,/scope==="alliance"[\s\S]*?\["R4","R5"\]\.includes\(declaredRole\)/);
assert.match(advice,/scope==="vs"\)return res\.status\(200\)/);
assert.match(advice,/scope==="season"\)return res\.status\(200\)/);

// 6) VS / Season remain role-independent for invited testers and expose obvious scan paths.
assert.match(html,/id="vsAccessNotice"/);
assert.match(html,/id="scanVsBtn"/);
assert.match(html,/id="seasonAccessNotice"/);
assert.match(html,/id="scanSeasonBtn"/);
assert.match(app,/openQuickScan\("vs"\)/);
assert.match(app,/openQuickScan\("season"\)/);
assert.match(app,/if\(proFeatureAllowed\(\)\)\{const live=await requestAdvice\("vs"\)/);

// 7) Private modules require both accepted beta access and consent before opening.
assert.match(app,/\$\$\('\[data-open\]'\).*requireBetaAccess\(\)\|\|!requireBetaConsent\(\)/);

// 8) HF8.6.10 roster integrity remains part of this consolidated patch.
const canonical=[{name:'ToyN',role:'R4',power_m:231,hq_level:35,server_id:'884',alliance_tag:'ALL4'}];
let cloud=[{player_id:'p-toyn',name:'[ALL4]ToyN',role:'R5',management_role:'R5',power_m:null,hq_level:null,server_id:'884',alliance_tag:'ALL4'}];
let merged=mergeCloudRosterWithIdentity(canonical,cloud,{serverId:'884',allianceTag:'ALL4'}).roster[0];
assert.equal(merged.role,'R4');
assert.equal(merged.power_m,231);
assert.equal(merged.hq_level,35);
assert.equal(merged.delta_m,null);
cloud=[{player_id:'p-toyn',name:'ToyN',role:'R5',management_role:'R5',power_m:240,hq_level:35,server_id:'884',alliance_tag:'ALL4'}];
merged=mergeCloudRosterWithIdentity(canonical,cloud,{serverId:'884',allianceTag:'ALL4'}).roster[0];
assert.equal(merged.role,'R4');assert.equal(merged.power_m,240);assert.equal(merged.delta_m,9);
let canon=mergeCanonicalRoster(canonical,[{name:'ToyN',role:'R4',power_m:null,hq_level:null,server_id:'884',alliance_tag:'ALL4'}],{serverId:'884',allianceTag:'ALL4'});
assert.equal(canon[0].power_m,231);assert.equal(canon[0].hq_level,35);
canon=replaceCanonicalRosterFromCompleteSnapshot(canonical,[{name:'ToyN',role:'R4',server_id:'884',alliance_tag:'ALL4'}],{serverId:'884',allianceTag:'ALL4'});
assert.equal(canon[0].power_m,231);assert.equal(canon[0].hq_level,35);
const scan=resolveRosterScanRows([{name:'ToyN',role:'R4',power_m:231,hq_level:35}],{members:[{name:'ToyN',role:'R4',power_m:null,hq_level:null,server_id:'884',alliance_tag:'ALL4'}],review:[],former:[]},{server_id:'884',alliance_tag:'ALL4'})[0];
assert.equal(scan.previous_power_m,undefined);assert.equal(scan.previous_hq_level,undefined);

// 9) New UX copy resolves for every language choice instead of exposing raw keys.
const keys=['onboarding_title','onboarding_intro','onboarding_need_squad','alliance_manager_reserved_detail','vs_start_notice','season_start_notice','season_scan_now'];
for(const [code] of LANGUAGES){if(code==='auto')continue;const t=translator(code);for(const key of keys)assert.notEqual(t(key,{role:'R3'}),key,`${code}:${key} missing`)}

// 10) Release/cache/health/package markers and old regression compatibility.
assert.match(html,/HF8\.6\.11/);assert.match(health,/hf8\.6\.11-future-player-reliability/);assert.match(sw,/hf8-6-11-future-player-reliability/);
assert.match(health,/profile_power_optional_for_onboarding:true/);assert.match(health,/beta_pro_network_fallback_entitlement:true/);assert.match(health,/vs_available_all_invited_roles:true/);assert.match(health,/season_available_all_invited_roles:true/);
assert.ok(pkg.scripts.verify.includes('verify-hf8-6-10.mjs'));assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-11.mjs'));

console.log('WarBoost V2.5.28 HF8.6.11 Future Player Reliability verification: PASS');
