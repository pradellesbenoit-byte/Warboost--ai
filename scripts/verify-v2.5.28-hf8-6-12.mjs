import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasMeaningfulCoreState,hydrateCloudState,canUseKeepaliveBody,utf8ByteLength} from '../lib/cloud-state-recovery.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js'),manifest=read('manifest.webmanifest'),pkg=JSON.parse(read('package.json'));

// 1) A blank login placeholder is never considered a real player state.
const blank={player:{name:'',server_id:'',hq_level:null,power_m:null},squads:[],drone:{},alliance:{members:[]},activity_events:[]};
assert.equal(hasMeaningfulCoreState(blank),false);

// 2) Structural server hydration restores a realistic established player without rescanning.
const remote={
  version:'2.5.28',player_id:'cloud-user',updated_at:'2026-09-13T15:49:52.101Z',
  player:{name:'les gladiateurs81',role:'R4',power_m:219,hq_level:30,server_id:'884'},
  drone:{level:157,power_m:8.842578},
  squads:[
    {id:1,power:42.47,heroes:[{name:'Carlie',level:150,stars:5},{name:'Lucius',level:150,stars:5},{name:'Morrison',level:150,stars:5},{name:'DVA',level:150,stars:5},{name:'Skyler',level:150,stars:5}]},
    {id:2,power:34.17,heroes:[{name:'Murphy'},{name:'Williams'},{name:'Kimberly'},{name:'Marshall'},{name:'Stetmann'}]},
    {id:3,power:29.23,heroes:[{name:'Adam'},{name:'Violet'},{name:'Tesla'},{name:'Sarah'},{name:'Mason'}]}
  ],
  alliance:{tag:'ALL4',role:'R4',members:Array.from({length:92},(_,i)=>({name:`M${i+1}`,role:i<10?'R4':'R3'}))},
  activity_events:[{id:'2026-09-12:vs',event_type:'vs',event_date:'2026-09-12',participation_status:'participated'}],
  shop:{snapshots:[{store_type:'vip',offers:[]}]},sync:{status:'ok',sources:{scan:true,alliance:true}}
};
const defaults={player:{name:'',role:'R1',power_m:null,hq_level:null,server_id:''},player_context:{},drone:{level:null,power_m:null},technology:{},season:{},shop:{offers:[],snapshots:[]},alliance:{members:[],roster_review:[],former_members:[],unlinked_accounts:[],desert_storm:{}},vs:{snapshots:[],leaderboard:[]},sync:{sources:{},capabilities:[]},squads:Array.from({length:4},(_,i)=>({id:i+1,name:`Squad ${i+1}`,heroes:Array.from({length:5},()=>({}))})),activity_events:[],exclusive_weapons:[],hero_progression:[],hero_profiles:[],progression_snapshots:[]};
const hydrated=hydrateCloudState(remote,defaults,'cloud-user');
assert.equal(hasMeaningfulCoreState(hydrated),true);
assert.equal(hydrated.player.name,'les gladiateurs81');
assert.equal(hydrated.player.role,'R4');
assert.equal(hydrated.player.power_m,219);
assert.equal(hydrated.drone.level,157);
assert.equal(hydrated.squads[0].power,42.47);
assert.deepEqual(hydrated.squads[0].heroes.map(x=>x.name),['Carlie','Lucius','Morrison','DVA','Skyler']);
assert.equal(hydrated.alliance.tag,'ALL4');
assert.equal(hydrated.alliance.members.length,92);
assert.equal(hydrated.player_id,'cloud-user');

// 3) Mobile keepalive guard: a mature player state over the small browser quota is deferred.
const mature={...remote,alliance:{...remote.alliance,members:Array.from({length:120},(_,i)=>({name:`AlliancePlayer${i}`,role:'R3',history:'x'.repeat(650)}))}};
const matureBody=JSON.stringify({state:mature});
assert.ok(utf8ByteLength(matureBody)>64*1024,'fixture must exceed 64 KiB');
assert.equal(canUseKeepaliveBody(matureBody),false);
assert.equal(canUseKeepaliveBody(JSON.stringify({state:{player:{name:'NewPlayer',server_id:'884',hq_level:30}}})),true);

// 4) Login must not persist an empty placeholder before the authenticated cloud pull.
assert.match(app,/async function applySession\(session\)/);
assert.match(app,/Critical HF8\.6\.12 guard/);
const apply=app.match(/async function applySession\(session\)\{[\s\S]*?\n\}\nfunction cloudAuthFailureMessage/)?.[0]||'';
assert.ok(apply,'applySession block missing');
const blankBranch=apply.match(/else\{\n\s*\/\/ Critical HF8\.6\.12 guard[\s\S]*?\n\s*\}/)?.[0]||'';
assert.ok(blankBranch,'blank-login guard branch missing');
assert.doesNotMatch(blankBranch,/safeLocalSet\(STORE_KEY/,'blank placeholder must never overwrite local storage before cloud pull');
assert.match(apply,/state=loginSeed\?mergeState\(initialState\(\),loginSeed\):initialState\(\)/);
assert.match(apply,/const pulled=await pullServerState\(loginSeed\)/);
assert.match(apply,/scheduleCloudPullRetry\(\)/);

// 5) Blank state can never be POSTed over a valid cloud profile.
const push=app.match(/async function pushServerState\(\{keepalive=false\}=\{\}\)\{[\s\S]*?\n\}\nasync function pullServerState/)?.[0]||'';
assert.ok(push,'pushServerState block missing');
assert.match(push,/if\(!hasMeaningfulCore\(state\)\)return \{skipped:true,reason:"empty_state_guard"\}/);
assert.match(push,/if\(keepalive&&!canUseKeepaliveBody\(body\)\)/);
assert.match(push,/keepalive_payload_too_large/);
assert.match(push,/outbound\.sync=\{[\s\S]*?last_error:null,pending_cloud_save:false/);

// 6) Cloud pull has a direct recovery path that does not depend on legacy merge helpers.
const pull=app.match(/async function pullServerState\(loginSeed=null\)\{[\s\S]*?\n\}\n\nasync function refreshServerTime/)?.[0]||'';
assert.ok(pull,'pullServerState block missing');
assert.match(pull,/const remote=hydrateCloudState\(j\.state,initialState\(\),userId\)/);
assert.match(pull,/if\(!hasMeaningfulCore\(state\)&&hasMeaningfulCore\(remote\)\)merged=remote/);
assert.match(pull,/catch\{merged=hasMeaningfulCore\(remote\)\?remote/);
assert.match(pull,/rememberLastGoodState\(state,"cloud-pull"\)/);
assert.match(app,/function scheduleCloudPullRetry\(delay=2500\)/);

// 7) Sync/foreground lifecycle first restores cloud state when this device is blank.
const sync=app.match(/async function syncAll\(\)\{[^\n]+\}/)?.[0]||'';
assert.match(sync,/if\(!hasMeaningfulCore\(state\)&&cloudSession\?\.access_token\)\{const recovered=await pullServerState/);
assert.match(app,/visibilityState==="visible"\)\{if\(!hasMeaningfulCore\(state\).*pullServerState/);
assert.match(app,/pagehide.*pushServerState\(\{keepalive:true\}\)/);

// 8) Service worker ships the new recovery helper and forces a fresh cache generation.
assert.match(sw,/warboost-v2-5-28-hf8-6-12-cloud-restore-guard/);
assert.match(sw,/warboost-v2-5-28-hf8-6-11-future-player-reliability/); // legacy regression marker
assert.match(sw,/\/lib\/cloud-state-recovery\.js/);

// 9) Release / health markers advertise the exact safeguards.
assert.match(html,/HF8\.6\.12/);assert.match(html,/HF8\.6\.11/);
assert.match(manifest,/HF8\.6\.12/);
assert.match(health,/ui_revision_final:"hf8\.6\.12-cloud-restore-guard"/);
assert.match(health,/previous_future_player_revision:"hf8\.6\.11-future-player-reliability"/);
for(const flag of ['cloud_state_blank_overwrite_guard','cloud_state_direct_server_hydration','cloud_state_pull_retry','large_mobile_keepalive_guard','transient_sync_error_not_persisted','server_cloud_restore_before_sync'])assert.match(health,new RegExp(`${flag}:true`));

// 10) Full verification suite keeps all previous regression gates and adds this one.
assert.ok(pkg.scripts.check.includes('node --check lib/cloud-state-recovery.js'));
assert.ok(pkg.scripts.check.includes('node --check scripts/verify-v2.5.28-hf8-6-12.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-11.mjs'));
assert.ok(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-12.mjs'));

console.log('WarBoost V2.5.28 HF8.6.12 Cloud Restore Guard verification: PASS');
