import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWarBoostSupabaseAuthClient} from '../lib/browser-auth.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),auth=read('lib/browser-auth.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js'),pkg=JSON.parse(read('package.json'));
const block=app.slice(app.indexOf('async function applySession(session){'),app.indexOf('function cloudAuthFailureMessage(){'));
assert.match(app,/const RELEASE_LABEL="HF8\.6\.15"/);
assert.match(block,/renderAuth\(\);renderBeta\(\);/);
assert.doesNotMatch(block,/await movePendingScans\(/);
assert.match(block,/void movePendingScans\(previousPendingOwner,nextPendingOwner\)/);
assert.match(app,/fetchSessionCritical\("\/api\/state",requestInit,12000\)/);
assert.match(app,/keepalive\?await fetch\("\/api\/state",requestInit\):await fetchSessionCritical/);
assert.match(auth,/requestTimeoutMs=15000/);
assert.match(auth,/auth_request_timeout/);
assert.match(app,/code==="auth_network_unavailable"\|\|code==="auth_request_timeout"/);
assert.match(html,/HF8\.6\.15/);
assert.match(sw,/hf8-6-15-player-presentation-reliability/);
assert.match(health,/ui_revision_player_presentation_reliability:"hf8\.6\.15-player-presentation-reliability"/);
assert.match(health,/auth_requests_bounded:true/);
assert.match(health,/foreground_cloud_writes_bounded:true/);
assert.match(pkg.description,/HF8\.6\.15/);

const hangingFetch=(_url,init={})=>new Promise((_,reject)=>{
  const signal=init.signal;
  if(!signal)return;
  if(signal.aborted){const e=new Error('aborted');e.name='AbortError';reject(e);return;}
  signal.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e)},{once:true});
});
const client=createWarBoostSupabaseAuthClient({url:'https://project.supabase.co',key:'publishable',storage:null,fetchImpl:hangingFetch,requestTimeoutMs:3000});
const started=Date.now();
const result=await client.auth.signInWithPassword({email:'player@example.com',password:'secret'});
assert.equal(result.error?.code,'auth_request_timeout');
assert.ok(Date.now()-started < 4500,'bounded auth request exceeded safety window');
console.log('WarBoost V2.5.28 HF8.6.15 Player Presentation Reliability verification: PASS');
