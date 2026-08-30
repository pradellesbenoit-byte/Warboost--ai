import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import adviceHandler from '../api/advice.js';
import {parseRosterImport,mergeRosterMembers} from '../lib/roster-import.js';
import {mergeCloudRosterPreservingManual} from '../lib/alliance-roster-merge.js';
import {HERO_CATALOG,isGenericHeroName} from '../lib/heroes.js';
import {normalizeState,mergeNewest} from '../lib/normalize.js';
import {getProfileForUser} from '../lib/supabase.js';
import {LANGUAGES,translator} from '../i18n.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const log=(name)=>console.log(`✓ ${name}`);

function callAdvice(scope,state,locale='fr-FR'){
  let statusCode=200,payload=null;
  const req={method:'POST',body:{scope,state,locale}};
  const res={
    status(code){statusCode=code;return this},
    json(body){payload=body;return body}
  };
  adviceHandler(req,res);
  return {status:statusCode,body:payload};
}
function hero(name,level=150,stars=5,power=8,exclusive='20',gear='4 équipements niv.40'){
  return {name,level,stars,power,exclusive,gear};
}
const now=new Date().toISOString();
const stale=new Date(Date.now()-10*24*3600*1000).toISOString();
const baseState={
  version:'2.5.6',updated_at:now,
  player:{name:'Testeur',role:'R5',hq_level:30,power_m:120},
  player_context:{objective:'balanced'},
  drone:{level:120,power_m:8,updated_at:now},
  technology:{updated_at:now},
  shop:{offers:[],snapshots:[],updated_at:null},
  sync:{last_sync:now,sources:{scan:true,alliance:true},capabilities:[]},
  squads:[
    {id:1,name:'Squad 1',power:60,updated_at:now,needs_rescan:false,heroes:[hero('DVA'),hero('Lucius'),hero('Carlie'),hero('Morrison'),hero('Skyler')]},
    {id:2,name:'Squad 2',power:72,updated_at:now,needs_rescan:false,heroes:[hero('Kimberly'),hero('Murphy'),hero('Williams'),hero('Marshall'),hero('Stetmann')]},
    {id:3,name:'Squad 3',power:45,updated_at:now,needs_rescan:false,heroes:[hero('Tesla'),hero('Swift'),hero('Fiona'),hero('McGregor'),hero('Kane')]},
    {id:4,name:'Squad 4',power:null,updated_at:null,needs_rescan:false,heroes:[]}
  ],
  hero_profiles:[],hero_progression:[],exclusive_weapons:[],
  vs:{day:3,week:35,opponent:'TEST',our_score:120,their_score:110,updated_at:now},
  season:{number:6,name:'S6',day:20,total_days:35,progress_pct:58,profession:'Engineer',resistance:5500,updated_at:now},
  alliance:{role:'R5',tag:'TST',members:[]}
};

// V2.5.2 reliability must survive V2.5.6: Squad 1 is the selected main squad.
{
  const {status,body}=callAdvice('player',baseState,'fr-FR');
  assert.equal(status,200);
  assert.equal(body.ok,true);
  assert.equal(body.analysis.focus_squad,1,'Squad 2 is stronger, but Squad 1 must remain the selected main squad');
  assert.equal(body.analysis.strongest_squad.id,2);
  assert.equal(body.analysis.strongest_squad.is_focus,false);
  assert.match(body.analysis.engine,/2\.5\.6/);
  const plan=body.analysis.seven_day_plan;
  assert.ok(plan);
  assert.equal(plan.days.length,7);
  assert.equal(plan.exact_quantities,false);
  assert.equal(plan.policy,'relative-priority-only');
  assert.ok(plan.days.every(x=>x.no_exact_quantity===true));
  assert.deepEqual(plan.days.map(x=>x.day),[1,2,3,4,5,6,7]);
  assert.deepEqual(plan.days.map(x=>x.action_key),['top_priority','checkpoint_top','secondary_priority','measure_progress','shop_resources','vs_season_timing','weekly_review']);
  assert.equal(plan.days[3].target,null,'Refresh day must not misleadingly repeat the top hero');
  assert.equal(plan.days[4].target,null,'Shop/resources day must be account-wide, not pinned to the top hero');
  assert.equal(plan.days[4].kind,null,'Shop/resources day must not imply a hero/resource kind that was not explicitly selected');
  assert.equal(plan.days[5].target,null,'VS/Season timing day must be account-wide, not pinned to the top hero');
  assert.equal(plan.days[5].kind,null,'VS/Season timing day must not imply a hero kind');
  assert.equal(plan.days[6].target,null,'Weekly review must be account-wide, not pinned to one hero');
  assert.deepEqual(plan.days.filter(x=>x.target).map(x=>x.day),[1,2,3],'Only genuine hero-priority/checkpoint days may carry a hero target');
  log('Player AI keeps Squad 1 priority and returns a 7-day no-invented-quantity plan');
}

// R5/R4 alliance AI: structured immediate groups + Plan B; R1 is blocked.
{
  const members=[
    ['Alpha','R5',90],['Bravo','R4',82],['Charlie','R3',75],['Delta','R3',70],['Echo','R2',64],['Foxtrot','R2',58]
  ].map(([name,role,power_m])=>({name,role,power_m,updated_at:now,last_active_at:now,delta_m:1}));
  members.push({name:'Golf',role:'R1',power_m:52,updated_at:stale,last_active_at:stale,delta_m:0,vs_points:0});
  const state={...baseState,alliance:{...baseState.alliance,role:'R5',members}};
  const {status,body}=callAdvice('alliance',state,'fr-FR');
  assert.equal(status,200);
  assert.equal(body.ok,true);
  assert.match(body.engine,/2\.5\.6/);
  assert.equal(body.immediate_actions.length,4);
  assert.deepEqual(body.immediate_actions.map(x=>x.kind),['rally','defense','mobile','reserve']);
  assert.ok(Array.isArray(body.plan_b)&&body.plan_b.length>=1);
  assert.ok(body.plan_b.some(x=>x.kind==='refresh'));
  assert.match(body.policy,/No member is removed/i);
  const denied=callAdvice('alliance',{...state,alliance:{...state.alliance,role:'R1'}},'fr-FR');
  assert.equal(denied.status,403);
  assert.equal(denied.body.error,'manager_role_required');
  log('Alliance AI enforces R5/R4 access and returns immediate groups plus Plan B');
}

// VS and Season structured endpoints still work.
{
  const vs=callAdvice('vs',baseState,'fr-FR');
  assert.equal(vs.status,200);assert.equal(vs.body.ok,true);assert.equal(vs.body.day,3);assert.match(vs.body.engine,/2\.5\.6/);
  assert.ok(Array.isArray(vs.body.priorities)&&vs.body.priorities.length>=2);
  const season=callAdvice('season',baseState,'fr-FR');
  assert.equal(season.status,200);assert.equal(season.body.ok,true);assert.equal(season.body.day,20);assert.equal(season.body.total_days,35);assert.match(season.body.engine,/2\.5\.6/);
  assert.ok(Array.isArray(season.body.priorities)&&season.body.priorities.length>=1);
  log('VS and Season advice remain operational on the V2.5.6 engine');
}


// Legacy/partial state normalization and merge must preserve known player/squad data.
{
  const legacy={version:'1.4',player_id:'legacy-player',player:{name:'Legacy',hq_level:29,power_m:100,role:'R3'},squads:[{power:55,updated_at:'2026-08-20T00:00:00.000Z',heroes:[hero('DVA',145,5,7,'19','Lv.39')]}],alliance:{members:[{name:'Manual Legacy',role:'R2',power_m:40}]}};
  const normalized=normalizeState(legacy);
  assert.equal(normalized.version,'2.5.6');
  assert.equal(normalized.player.name,'Legacy');
  assert.equal(normalized.squads[0].heroes[0].name,'DVA');
  assert.equal(normalized.squads[0].heroes[0].level,145);
  const merged=mergeNewest(normalized,{updated_at:'2026-08-29T00:00:00.000Z',player:{power_m:111}});
  assert.equal(merged.player.name,'Legacy');
  assert.equal(merged.player.power_m,111);
  assert.equal(merged.squads[0].heroes[0].name,'DVA');
  assert.equal(merged.squads[0].heroes[0].level,145);
  log('Legacy/partial state normalization keeps known player and hero data through V2.5.6');
}

// Missing Supabase wb1_* schema must be surfaced explicitly, not as a destructive/generic sync failure.
{
  const oldUrl=process.env.SUPABASE_URL,oldAnon=process.env.SUPABASE_ANON_KEY,oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_ANON_KEY='test-anon';
  globalThis.fetch=async()=>({ok:false,status:404,text:async()=>JSON.stringify({code:'42P01',message:'relation public.wb1_profiles does not exist'})});
  let caught=null;
  try{await getProfileForUser('player','access-token')}catch(e){caught=e}
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldAnon===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=oldAnon;
  assert.ok(caught);assert.equal(caught.code,'database_schema_missing');assert.equal(caught.status,503);
  log('Missing Supabase schema is detected explicitly as database_schema_missing');
}

// Missing service-role grants must be surfaced explicitly so production cannot silently degrade.
{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY,oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';
  globalThis.fetch=async()=>({ok:false,status:403,text:async()=>JSON.stringify({code:'42501',message:'permission denied for table wb1_profiles'})});
  const {probeServiceAccess}=await import('../lib/supabase.js');
  const probe=await probeServiceAccess();
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  assert.equal(probe.ok,false);assert.equal(probe.code,'database_permissions_missing');
  log('Service-role permission loss is detected explicitly as database_permissions_missing');
}

// Manual roster import must add/update without deleting cloud identities.
{
  const imported=parseRosterImport('Nom,Grade,QG,Puissance\nAlpha,R5,30,80.5\nNouveau,R2,28,61.2',{now:'2026-08-29T00:00:00.000Z'});
  assert.equal(imported.length,2);
  assert.equal(imported[0].name,'Alpha');assert.equal(imported[0].role,'R5');assert.equal(imported[0].hq_level,30);assert.equal(imported[0].power_m,80.5);
  const existing=[
    {name:'Alpha',role:'R4',player_id:'cloud-alpha',power_m:77,source:'cloud'},
    {name:'Ancien',role:'R3',player_id:'cloud-old',power_m:70,source:'cloud'}
  ];
  const merged=mergeRosterMembers(existing,imported);
  assert.equal(merged.length,3);
  assert.equal(merged.find(x=>x.name==='Alpha').player_id,'cloud-alpha');
  assert.equal(merged.find(x=>x.name==='Alpha').role,'R5');
  assert.ok(merged.some(x=>x.name==='Ancien'),'Unmatched existing cloud member must not be deleted by manual import');
  assert.ok(merged.some(x=>x.name==='Nouveau'),'Imported manual member must be added');
  log('Roster import preserves cloud identities and never removes unmatched existing members');
}

// Cloud roster refresh must preserve manual-only rows.
{
  const existing=[
    {name:'Cloud One',player_id:'p1',power_m:60,source:'cloud'},
    {name:'Manuel',role:'R2',power_m:44,source:'manual_import'}
  ];
  const cloud=[{name:'Cloud One',player_id:'p1',power_m:63,role:'R3'}];
  const merged=mergeCloudRosterPreservingManual(existing,cloud);
  assert.equal(merged.length,2);
  assert.equal(merged.find(x=>x.player_id==='p1').delta_m,3);
  assert.ok(merged.some(x=>x.name==='Manuel'&&!x.player_id));
  log('Cloud roster refresh preserves manual-only members');
}

// 22 requested language families + separate US English variant = 23 explicit choices, plus Auto.
{
  const explicit=LANGUAGES.filter(([code])=>code!=='auto');
  assert.equal(explicit.length,23);
  const structuredKeys=['seven_day_plan','immediate_actions','plan_b','voice_settings','import_roster','ai_kind_scan','alliance_group_rally','vs_hold_rule','season_structured_priority','activity_active_confirmed','activity_reliability_note','roster_hint','unit_type_aircraft','unit_type_tank','unit_type_missile','plan7_shop_resources','plan7_timing'];
  for(const [code] of explicit){
    const t=translator(code);
    for(const key of structuredKeys)assert.notEqual(t(key),key,`${code} is missing ${key}`);
  }
  const nonEnglish=explicit.map(x=>x[0]).filter(code=>!code.startsWith('en'));
  for(const code of nonEnglish){
    const t=translator(code),en=translator('en-GB');
    assert.notEqual(t('activity_reliability_note'),en('activity_reliability_note'),`${code} still inherits English activity reliability copy`);
    assert.notEqual(t('vs_hold_rule'),en('vs_hold_rule'),`${code} still inherits English structured VS hold copy`);
  }
  log('All 23 explicit language choices resolve V2.5.6 structured Player/Alliance/VS/Season/voice labels');
}

// Hero identity source stays canonical and contains no generic placeholders.
{
  assert.equal(HERO_CATALOG.length,31);
  assert.equal(new Set(HERO_CATALOG.map(x=>x.toLowerCase())).size,HERO_CATALOG.length);
  assert.ok(HERO_CATALOG.every(x=>!isGenericHeroName(x)));
  assert.ok(HERO_CATALOG.includes('Skyler'));
  log('Shared hero catalog remains canonical (31 heroes, no generic placeholder identities)');
}

// Static application safeguards.
{
  const app=read('app.js'),html=read('index.html'),pkg=JSON.parse(read('package.json')),sync=read('api/sync.js'),roleApi=read('api/alliance-role.js'),health=read('api/health.js'),migration=read('supabase/migration_v2_5_4.sql'),manifest=JSON.parse(read('manifest.webmanifest')),sw=read('sw.js');
  assert.match(app,/APP_VERSION\s*=\s*["']2\.5\.6["']/);
  assert.match(app,/BACKUP_KEY\s*=\s*["']warboost_last_good_state["']/);
  assert.match(app,/function\s+rememberLastGoodState/);
  assert.match(app,/function\s+readLastGoodState/);
  assert.match(app,/mergeAllianceMembersProtected/);
  assert.match(app,/database_schema_missing/);
  assert.match(app,/AI_NATIVE_LANGS/);
  assert.match(app,/structuredPriorityTitle/);
  assert.match(app,/structuredAdviceText/);
  assert.match(app,/function\s+planTargetLabel/);
  assert.match(app,/native&&x\.target/);
  assert.match(app,/renderPlayer7DayPlan/);
  assert.match(app,/speakGreeting/);
  assert.match(app,/\/(?:api\/)?alliance-role|\/api\/alliance-role/);
  assert.doesNotMatch(app,/warboost_v254_/);
  for(const id of ['player7DayPlan','allianceImmediate','alliancePlanB','rosterImportText','rosterImportBtn','voiceEnabled','voiceSelect','voiceTestBtn'])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(sync,/mergeCloudRosterPreservingManual/);
  assert.match(roleApi,/r5_required/);assert.match(roleApi,/owner_required_for_r5/);assert.match(roleApi,/owner_must_remain_r5/);
  assert.match(health,/pending-approval/);assert.match(health,/database_service_probe/);assert.match(health,/probeServiceAccess/);
  assert.match(health,/unauthorized_source_default\s*:\s*false/);
  assert.equal(manifest.name.includes('V2.5.6'),true);
  assert.match(sw,/warboost-v2-5-6-plan-logic-reliability/);
  assert.match(migration,/create table if not exists public\.wb1_profiles/i);
  assert.match(migration,/create table if not exists public\.wb1_snapshots/i);
  assert.match(migration,/create table if not exists public\.wb1_alliances/i);
  assert.match(migration,/create table if not exists public\.wb1_alliance_members/i);
  assert.doesNotMatch(migration,/\bdrop\s+table\b/i);
  assert.doesNotMatch(migration,/\btruncate\b/i);
  assert.doesNotMatch(migration,/\bdelete\s+from\b/i);
  assert.match(migration,/grant select, insert, update on table public\.wb1_profiles to service_role/i);
  assert.match(migration,/grant select, insert on table public\.wb1_snapshots to service_role/i);
  assert.match(migration,/grant select, insert, update on table public\.wb1_alliances to service_role/i);
  assert.match(migration,/grant select, insert, update on table public\.wb1_alliance_members to service_role/i);
  assert.match(migration,/revoke all privileges on table public\.wb1_alliances from authenticated/i);
  assert.match(migration,/\(select auth\.uid\(\)\)::text/i);
  assert.equal(pkg.version,'2.5.6');
  log('Static persistence, language fallback, voice, roster, migration and authorization guards are present');
}

// Every API function is included in npm syntax checking.
{
  const pkg=JSON.parse(read('package.json'));
  const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).sort();
  assert.equal(apiFiles.length,12);
  for(const file of apiFiles)assert.ok(pkg.scripts.check.includes(`node --check api/${file}`),`api/${file} is missing from npm run check`);
  assert.ok(pkg.scripts.check.includes('node --check lib/roster-import.js'));
  assert.ok(pkg.scripts.check.includes('node --check lib/alliance-roster-merge.js'));
  log('npm run check covers all 12 serverless API functions and the new reliability modules');
}


{
  const app=read('app.js'),css=read('styles.css'),i18n=read('i18n.js');
  assert.match(app,/plan7Policy/);
  assert.doesNotMatch(app,/row\.no_exact_quantity\?t\("condition_refresh"\)/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.doesNotMatch(css,/\.plan7Rule[^\n]*white-space:nowrap/);
  assert.match(i18n,/PLAN55_LABELS/);
  assert.match(i18n,/PLAN56_LABELS/);
  assert.match(app,/plan7_shop_resources/);
  assert.match(app,/plan7_timing/);
  for(const code of LANGUAGES.map(x=>x[0]).filter(x=>x!=='auto')){const tr=translator(code);assert.notEqual(tr('plan7_checkpoint'),'plan7_checkpoint');assert.notEqual(tr('plan7_policy'),'plan7_policy');assert.notEqual(tr('plan7_shop_resources'),'plan7_shop_resources');assert.notEqual(tr('plan7_timing'),'plan7_timing')}
  const fr=translator('fr');assert.equal(fr('plan7_shop_resources'),'Boutique / ressources');assert.equal(fr('plan7_timing'),'Timing VS / Saison');
  log('7-day Player plan keeps hero binding only on relevant days, uses account-wide shop/timing actions, 23-language labels and mobile-safe rendering');
}

console.log('\nWarBoost V2.5.6 verification: PASS');
