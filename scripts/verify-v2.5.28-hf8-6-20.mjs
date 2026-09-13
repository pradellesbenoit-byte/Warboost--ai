import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),stateApi=read('api/state.js'),beta=read('lib/beta-access.js'),supabase=read('lib/supabase.js'),health=read('api/health.js'),sw=read('sw.js'),i18n=read('i18n.js'),manifest=JSON.parse(read('manifest.webmanifest')),pkg=JSON.parse(read('package.json'));

// Release identity and mobile cache invalidation.
assert.match(app,/const RELEASE_LABEL="HF8\.6\.20"/);
assert.match(html,/WarBoost V2\.5\.28 HF8\.6\.20/);
assert.match(html,/\/app\.js\?v=hf8620/);
assert.match(html,/\/publisher-ui\.js\?v=hf8620/);
assert.match(sw,/warboost-v2-5-28-hf8-6-20-verified-login-isolation/);
assert.match(manifest.name,/HF8\.6\.20/);
assert.match(pkg.description,/HF8\.6\.20/);
assert.match(i18n,/target\.tagline=`V2\.5\.28 HF8\.6\.20/);

// Privacy boundary: old local squads/profile must never be rendered while invitation verification is still checking.
assert.match(app,/function betaPrivateDataVisible\(\)\{[^\n]*checking=betaState\?\.access_status==="checking"[^\n]*!checking[^\n]*cloudProfileVerified\|\|trustedLocal/);
assert.match(app,/const locked=Boolean\(checking\|\|!cloudSession\?\.user/);
assert.match(app,/const squadList=\$\("#squadList"\);if\(squadList\)squadList\.innerHTML=""/);

// Fast login restore is a dedicated server path: authenticate once, then invitation + profile read in parallel.
assert.match(stateApi,/fastRestoreRequested/);
assert.match(stateApi,/const \[beta,row\]=await Promise\.all\(\[betaPromise,profilePromise\]\)/);
assert.match(stateApi,/inviteTimeoutMs:3500,acceptTimeoutMs:900/);
assert.match(stateApi,/getProfile\(playerId,\{timeoutMs:4000\}\)/);
assert.match(stateApi,/restore_strategy:"parallel"/);
assert.match(stateApi,/orderedRestoreTrace/);
assert.match(beta,/betaAccessForUserAsync\(user,\{trace,inviteTimeoutMs=4500,acceptTimeoutMs=1800\}=\{\}\)/);
assert.match(supabase,/getProfile\(playerId,\{timeoutMs=6000\}=\{\}\)/);
assert.match(supabase,/getProfileForUser\(playerId,accessToken,\{timeoutMs=6000\}=\{\}\)/);

// Browser keeps enough budget for a cold-start server response and exposes stage tracing instead of an endless spinner.
assert.match(app,/stateTimeout=fastRestore\?20000:25000/);
for(const stage of ['STATE_API','BETA_CHECK','DIRECT_PROFILE','PROFILE_HYDRATE'])assert.match(app,new RegExp(`"${stage}"`));
for(const stage of ['AUTH_USER','BETA_INVITE','PROFILE_READ'])assert.match(stateApi+beta,new RegExp(`"${stage}"`));
assert.match(html,/id="betaRestoreRetryBtn"/);

// Health advertises the exact hardening that players rely on.
assert.match(health,/ui_revision_verified_login_isolation:"hf8\.6\.20-verified-login-isolation"/);
assert.match(health,/fast_restore_parallel_auth_invite_profile:true/);
assert.match(health,/private_data_hidden_while_beta_checking:true/);
assert.match(health,/fast_restore_browser_timeout_ms:14000|fast_restore_browser_timeout_ms:20000/);

// Simulate returning + brand-new player. Verify invite/profile network calls begin concurrently after auth.
{
  const savedEnv={...process.env};
  Object.assign(process.env,{SUPABASE_URL:'https://unit.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key',SUPABASE_PUBLISHABLE_KEY:'public-key'});
  const originalFetch=globalThis.fetch;
  let inviteStatus='accepted',profileRows=[{state:{player:{name:'ReturningPlayer',server_id:'884',hq_level:30,role:'R4'},alliance:{tag:'ALL4',role:'R4',members:[]},squads:[{id:1,name:'Squad 1',power:42.47,heroes:[]}],drone:{level:157,power_m:8.84}},updated_at:'2026-09-13T18:00:00Z'}];
  const starts={};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  globalThis.fetch=async(url,init={})=>{
    const u=String(url),method=String(init.method||'GET').toUpperCase();
    if(u.includes('/auth/v1/user')){starts.auth=Date.now();await delay(70);return new Response(JSON.stringify({id:'user-123',email:'player@example.com'}),{status:200,headers:{'content-type':'application/json'}})}
    if(u.includes('/rest/v1/wb1_beta_invites?')&&method==='GET'){starts.invite=Date.now();await delay(90);return new Response(JSON.stringify([{id:'invite-1',email:'player@example.com',status:inviteStatus,accepted_at:null,accepted_user_id:null}]),{status:200,headers:{'content-type':'application/json'}})}
    if(u.includes('/rest/v1/wb1_beta_invites?')&&method==='PATCH'){starts.accept=Date.now();await delay(20);return new Response('',{status:204})}
    if(u.includes('/rest/v1/wb1_profiles?')&&method==='GET'){starts.profile=Date.now();await delay(90);return new Response(JSON.stringify(profileRows),{status:200,headers:{'content-type':'application/json'}})}
    throw new Error(`unexpected fetch ${method} ${u}`);
  };
  const stateHandler=(await import(`../api/state.js?hf8620=${Date.now()}`)).default;
  const makeRes=()=>({statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(v){this.body=v;return this}});
  const req={method:'GET',url:'/api/state?restore=1',query:{restore:'1'},headers:{authorization:'Bearer user-token','x-warboost-beta-consent':'2026-09-05-safe-launch-v2'}};
  let res=makeRes();await stateHandler(req,res);
  assert.equal(res.statusCode,200);assert.equal(res.body.restore_mode,'fast-profile');assert.equal(res.body.restore_strategy,'parallel');assert.equal(res.body.state.player.name,'ReturningPlayer');
  assert.deepEqual(res.body.restore_trace.map(x=>x.stage),['AUTH_USER','BETA_INVITE','PROFILE_READ']);
  assert.ok(Math.abs(starts.invite-starts.profile)<35,`invite/profile did not start in parallel: ${starts.invite} vs ${starts.profile}`);

  // New invited player has no profile: onboarding must start cleanly; no previous player's state can come from the API.
  inviteStatus='pending';profileRows=[];for(const k of Object.keys(starts))delete starts[k];res=makeRes();await stateHandler(req,res);
  assert.equal(res.statusCode,200);assert.equal(res.body.state,null);assert.equal(res.body.restore_strategy,'parallel');
  assert.deepEqual(res.body.restore_trace.map(x=>x.stage),['AUTH_USER','BETA_INVITE','BETA_ACCEPT','PROFILE_READ']);

  globalThis.fetch=originalFetch;
  for(const k of Object.keys(process.env))if(!(k in savedEnv))delete process.env[k];
  Object.assign(process.env,savedEnv);
}

assert.ok(pkg.scripts.check.includes('verify-v2.5.28-hf8-6-20.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-20.mjs'));
console.log('WarBoost V2.5.28 HF8.6.20 Verified Login Isolation verification: PASS');
