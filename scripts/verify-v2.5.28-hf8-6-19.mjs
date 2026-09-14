import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithTimeout} from '../lib/http-timeout.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),stateApi=read('api/state.js'),auth=read('lib/auth.js'),beta=read('lib/beta-access.js'),supabase=read('lib/supabase.js'),support=read('api/support.js'),scan=read('api/scan.js'),commercial=read('lib/commercial-pro.js'),i18n=read('i18n.js'),sw=read('sw.js'),manifest=JSON.parse(read('manifest.webmanifest')),pkg=JSON.parse(read('package.json'));

// Release identity and cache invalidation must be unambiguous on player devices.
assert.match(app,/const RELEASE_LABEL="HF8\.6\.19"/);
assert.match(html,/WarBoost V2\.5\.28 HF8\.6\.19/);
assert.match(html,/\/app\.js\?v=hf8619/);
assert.match(html,/\/publisher-ui\.js\?v=hf8619/);
assert.match(sw,/warboost-v2-5-28-hf8-6-19-public-beta-full-reliability/);
assert.match(manifest.name,/HF8\.6\.19/);
assert.match(pkg.description,/HF8\.6\.19/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.19/);

// Server outbound network calls are bounded. Raw fetch is allowed only inside the timeout helper.
for(const f of ['lib/auth.js','lib/beta-access.js','lib/supabase.js','lib/commercial-pro.js','api/support.js','api/scan.js']){
  const src=read(f);assert.match(src,/fetchWithTimeout/);assert.doesNotMatch(src,/\bfetch\s*\(/,`${f} has an unbounded raw fetch`);
}
assert.match(auth,/AUTH_UPSTREAM_TIMEOUT/);
assert.match(beta,/BETA_INVITES_TIMEOUT/);
assert.match(beta,/BETA_ACCEPT/);
assert.match(beta,/1800/,'pending invite acceptance must never block first login for long');
assert.match(supabase,/fetchWithTimeout/);
assert.match(commercial,/10000/);
assert.match(support,/15000/);
assert.match(scan,/50000/);

// Browser player-facing traffic is bounded except the intentionally best-effort pagehide keepalive.
const runtimeRawFetch=app.split(/\n/).filter(line=>line.includes('fetch(')&&!line.trim().startsWith('//')&&!line.includes('return await fetch(input')&&!line.includes('keepalive?await fetch("/api/state"'));
assert.deepEqual(runtimeRawFetch,[],`unexpected raw fetch lines: ${runtimeRawFetch.join(' | ')}`);
assert.match(app,/function fetchJsonBounded/);
assert.match(app,/stateTimeout=fastRestore\?20000:25000/);

// Precise restore diagnostics: browser + server report each login-critical stage.
for(const stage of ['STATE_API','BETA_CHECK','DIRECT_PROFILE','PROFILE_HYDRATE'])assert.match(app,new RegExp(`"${stage}"`));
for(const stage of ['AUTH_USER','BETA_INVITE','PROFILE_READ'])assert.match(stateApi+beta,new RegExp(`"${stage}"`));
assert.match(stateApi,/restore_trace:restoreTrace/);
assert.match(app,/appendServerRestoreTrace/);
assert.match(app,/bootstrap:compactBootstrapDiagnostics\(\)/);
assert.match(html,/id="betaRestoreRetryBtn"/);
assert.match(app,/retryCloudProfileRestore/);

// Fast server clock must return before any database/invite probes.
const clockIdx=health.indexOf('if(clockOnly)return');
const probeIdx=health.indexOf('const serviceDb=configured()');
assert.ok(clockIdx>0&&probeIdx>clockIdx,'clock-only health path must precede database probes');
assert.match(health,/release:"HF8\.6\.19"/);
for(const flag of ['public_beta_server_fetch_timeouts','public_beta_bootstrap_stage_tracing','public_beta_fast_clock_endpoint','public_beta_profile_save_guard','public_beta_pending_join_persistence'])assert.match(health,new RegExp(`${flag}:true`));

// New-player onboarding: identity validation, durable local save, explicit cloud status, pending alliance join retention.
assert.match(app,/PENDING_JOIN_CODE_KEY="warboost_pending_join_code"/);
assert.match(app,/function rememberPendingJoinCode/);
assert.match(app,/function clearPendingJoinCode/);
assert.match(app,/pendingJoinCode\(\)/);
assert.match(html,/id="profileSaveStatus"/);
assert.match(app,/\^\\d\{1,6\}\$/);
assert.match(app,/\^R\[1-5\]\$/);
assert.match(app,/hq<1\|\|hq>200/);
assert.match(app,/profile_saved_pending/);
assert.match(app,/profile_saved_cloud/);
assert.match(app,/const saved=await pushServerState\(\);if\(!saved\?\.ok\)/);
assert.doesNotMatch(app,/localStorage\.clear\s*\(/);

// Returning-player safety: private data only reveals after verified cloud restore or own account-scoped local data.
assert.match(app,/function betaPrivateDataVisible\(\)\{[^\n]*cloudProfileVerified\|\|trustedLocal/);
assert.match(app,/rememberAccountState/);
assert.match(app,/readAccountState/);
assert.match(app,/empty_state_guard/);

// Player, Alliance R4/R5, VS, Season, PRO, Scan and support remain wired in the production UI.
for(const target of ['player','alliance','vs','season'])assert.match(html,new RegExp(`data-open="${target}"`));
assert.match(html,/id="homeProBtn"/);assert.match(html,/id="supportBtn"/);assert.match(html,/id="scanDrawer"/);
assert.match(app,/\["R4","R5"\]\.includes/);
assert.match(app,/renderAllianceAccess/);assert.match(app,/renderVsAccess/);assert.match(app,/renderSeasonAccess/);
assert.match(app,/vsDecisionEngine/);assert.match(app,/seasonLifecycle/);assert.match(app,/buildDesertStormPlan/);assert.match(app,/applyAllianceRankChanges/);
assert.match(health,/vs_available_all_invited_roles:true/);assert.match(health,/season_available_all_invited_roles:true/);
assert.match(health,/alliance_rank_manager_r5_protected:true/);assert.match(health,/safe_launch_payments_runtime_disabled/);assert.match(health,/safe_launch_no_gameplay_automation:true/);

// All explicit languages must have the new reliability/onboarding messages.
const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
for(const [code] of explicit){const tr=translator(code);for(const key of ['beta_restore_retry','beta_restore_failed','profile_required','profile_role_invalid','profile_saved_cloud','profile_saved_pending'])assert.notEqual(tr(key),key,`${code} missing ${key}`)}

// Service worker shell must reference files that really exist.
const shellMatch=sw.match(/const SHELL=(\[[^;]+\]);/);assert.ok(shellMatch,'service-worker shell missing');
const shell=JSON.parse(shellMatch[1]);
for(const url of shell){if(url==='/')continue;const file=url.replace(/^\//,'');assert.ok(fs.existsSync(path.join(root,file)),`missing service-worker shell asset ${url}`)}

// Vercel Hobby budget and route inventory stay stable.
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).sort();
assert.equal(apiFiles.length,12,`expected 12 API functions, got ${apiFiles.length}: ${apiFiles.join(', ')}`);
for(const required of ['state.js','sync.js','scan.js','advice.js','alliance-role.js','invite.js','join.js','health.js','pro.js','support.js'])assert.ok(apiFiles.includes(required),`missing API ${required}`);

// Timeout helper must actually abort a hanging upstream request and return a classified 504.
{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,{signal}={})=>await new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(Object.assign(new Error('aborted'),{name:'AbortError'}));
    signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
  });
  const started=Date.now();
  await assert.rejects(fetchWithTimeout('https://example.invalid',{},10,{code:'TEST_TIMEOUT',message:'test timeout'}),e=>e?.status===504&&e?.code==='TEST_TIMEOUT'&&e?.timeout===true);
  assert.ok(Date.now()-started<1300,'timeout helper did not bound a hanging request');
  globalThis.fetch=originalFetch;
}

// Simulate the exact returning-player and first-time-player fast restore path with mocked Supabase.
{
  const savedEnv={...process.env};
  Object.assign(process.env,{SUPABASE_URL:'https://unit.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key',SUPABASE_PUBLISHABLE_KEY:'public-key'});
  const originalFetch=globalThis.fetch;
  let inviteStatus='accepted',profileRows=[{state:{player:{name:'ReturningPlayer',server_id:'884',hq_level:30,role:'R4'},alliance:{tag:'ALL4',role:'R4',members:[]},squads:[],drone:{}},updated_at:'2026-09-13T18:00:00Z'}];
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    const u=String(url),method=String(init.method||'GET').toUpperCase();calls.push(`${method} ${u}`);
    if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'user-123',email:'player@example.com'}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/rest/v1/wb1_beta_invites?')&&method==='GET')return new Response(JSON.stringify([{id:'invite-1',email:'player@example.com',status:inviteStatus,accepted_at:null,accepted_user_id:null}]),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/rest/v1/wb1_beta_invites?')&&method==='PATCH')return new Response('',{status:204});
    if(u.includes('/rest/v1/wb1_profiles?')&&method==='GET')return new Response(JSON.stringify(profileRows),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch ${method} ${u}`);
  };
  const stateHandler=(await import(`../api/state.js?hf8619=${Date.now()}`)).default;
  const makeRes=()=>({statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(v){this.body=v;return this}});
  const baseReq={method:'GET',url:'/api/state?restore=1',query:{restore:'1'},headers:{authorization:'Bearer user-token','x-warboost-beta-consent':'2026-09-05-safe-launch-v2'}};
  let res=makeRes();await stateHandler(baseReq,res);
  assert.equal(res.statusCode,200);assert.equal(res.body.restore_mode,'fast-profile');assert.equal(res.body.state.player.name,'ReturningPlayer');
  assert.deepEqual(res.body.restore_trace.map(x=>x.stage),['AUTH_USER','BETA_INVITE','PROFILE_READ']);
  assert.ok(res.body.restore_trace.every(x=>Number.isFinite(x.ms)&&x.ms>=0));

  // First-time invited player: pending invitation can be accepted but an empty cloud profile is a valid onboarding state.
  inviteStatus='pending';profileRows=[];calls.length=0;res=makeRes();await stateHandler(baseReq,res);
  assert.equal(res.statusCode,200);assert.equal(res.body.state,null);assert.equal(res.body.restore_mode,'fast-profile');
  assert.deepEqual(res.body.restore_trace.map(x=>x.stage),['AUTH_USER','BETA_INVITE','BETA_ACCEPT','PROFILE_READ']);
  assert.ok(calls.some(x=>x.startsWith('PATCH ')&&x.includes('wb1_beta_invites')),'pending invitation was not accepted');

  globalThis.fetch=originalFetch;
  for(const k of Object.keys(process.env))if(!(k in savedEnv))delete process.env[k];
  Object.assign(process.env,savedEnv);
}

// Fast clock endpoint is independently usable without any database request.
{
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('clock path must not fetch upstream')};
  const healthHandler=(await import(`../api/health.js?hf8619clock=${Date.now()}`)).default;
  const res={statusCode:200,body:null,setHeader(){},status(c){this.statusCode=c;return this},json(v){this.body=v;return this}};
  await healthHandler({url:'/api/health?clock=1',query:{clock:'1'}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.clock_only,true);assert.match(String(res.body.release),/^HF8\.6\.(19|20|21|22)$/);
  globalThis.fetch=originalFetch;
}

// New verifier is part of both syntax checking and the complete regression suite.
assert.ok(pkg.scripts.check.includes('node --check lib/http-timeout.js'));
assert.ok(pkg.scripts.check.includes('node --check scripts/verify-v2.5.28-hf8-6-19.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-18.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-19.mjs'));

console.log('WarBoost V2.5.28 HF8.6.19 Public Beta Full Reliability verification: PASS');
