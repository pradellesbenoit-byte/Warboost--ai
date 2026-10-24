import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPlayerAnalysis,buildShopAdvice,buildAllianceAdvice,buildVsAdvice,buildSeasonAdvice,buildSevenDayPlan,buildCrossDomain} from '../api/advice.js';
import inviteHandler from '../api/invite.js';
import joinHandler from '../api/join.js';
import proHandler from '../api/pro.js';
import {lastWarVsDay} from '../api/health.js';
import {parseRosterImport,mergeRosterMembers} from '../lib/roster-import.js';
import {mergeCloudRosterPreservingManual} from '../lib/alliance-roster-merge.js';
import {HERO_CATALOG,isGenericHeroName} from '../lib/heroes.js';
import {normalizeState,mergeNewest} from '../lib/normalize.js';
import {seasonLifecycle,seasonIsActive,activeSeasonProgress,repairSeasonState} from '../lib/season-lifecycle.js';
import {buildAdaptiveContext} from '../lib/adaptive-context.js';
import {getProfileForUser} from '../lib/supabase.js';
import {LANGUAGES,translator} from '../i18n.js';
import {BETA_CONSENT_VERSION,betaConfig,betaAccessForUser,requireBetaUser} from '../lib/beta-access.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const log=(name)=>console.log(`✓ ${name}`);

function callAdvice(scope,state,locale='fr-FR'){
  if(scope==='player'){
    const analysis=buildPlayerAnalysis(state,locale);
    analysis.shop=buildShopAdvice(state,locale,analysis);
    analysis.seven_day_plan=buildSevenDayPlan(state,analysis);
    analysis.cross_context=buildCrossDomain(state,locale,analysis);
    analysis.engine='warboost-ai-core-v2.5.12';
    return {status:200,body:{ok:true,engine:analysis.engine,advice:analysis.summary,analysis}};
  }
  if(scope==='alliance'){
    const role=String(state?.alliance?.role||state?.player?.role||'R1').toUpperCase();
    if(!['R4','R5'].includes(role))return {status:403,body:{ok:false,error:'manager_role_required'}};
    const a=buildAllianceAdvice(state,locale);
    return {status:200,body:{ok:true,engine:'warboost-alliance-ai-v2.5.12',...a}};
  }
  if(scope==='vs')return {status:200,body:{ok:true,...buildVsAdvice(state,locale)}};
  if(scope==='season')return {status:200,body:{ok:true,...buildSeasonAdvice(state,locale)}};
  return {status:400,body:{error:'unknown_scope'}};
}
function hero(name,level=150,stars=5,power=8,exclusive='20',gear='4 équipements niv.40'){
  return {name,level,stars,power,exclusive,gear};
}
const now=new Date().toISOString();
const stale=new Date(Date.now()-10*24*3600*1000).toISOString();
const baseState={
  version:'2.5.12',updated_at:now,
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
  season:{number:6,name:'S6',day:20,total_days:35,progress_pct:58,profession:'Engineer',resistance:5500,lifecycle:'active',lifecycle_source:'scan',updated_at:now},
  alliance:{role:'R5',tag:'TST',members:[]}
};

// V2.5.2 reliability must survive V2.5.12: Squad 1 is the selected main squad.
{
  const {status,body}=callAdvice('player',baseState,'fr-FR');
  assert.equal(status,200);
  assert.equal(body.ok,true);
  assert.equal(body.analysis.focus_squad,1,'Squad 2 is stronger, but Squad 1 must remain the selected main squad');
  assert.equal(body.analysis.strongest_squad.id,2);
  assert.equal(body.analysis.strongest_squad.is_focus,false);
  assert.match(body.analysis.engine,/2\.5\.12/);
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
  assert.match(body.engine,/2\.5\.12/);
  assert.ok(body.immediate_actions.length>=1&&body.immediate_actions.length<=4);
  assert.deepEqual(body.immediate_actions.map(x=>x.kind),['rally','defense']);
  assert.ok(body.immediate_actions.flatMap(x=>x.members||[]).every(name=>name!=='Golf'));
  assert.ok(Array.isArray(body.plan_b)&&body.plan_b.length>=1);
  assert.ok(body.plan_b.some(x=>x.kind==='refresh'&&x.count===1));
  assert.match(body.policy,/No member is removed/i);
  const denied=callAdvice('alliance',{...state,alliance:{...state.alliance,role:'R1'}},'fr-FR');
  assert.equal(denied.status,403);
  assert.equal(denied.body.error,'manager_role_required');
  log('Alliance AI enforces R5/R4 access and returns immediate groups plus Plan B');
}


// V2.5.12 regression: stale/unknown members must NEVER be assigned to tactical groups.
{
  const staleOnly=Array.from({length:12},(_,i)=>({
    name:`Stale${i+1}`,role:i<2?'R4':'R3',power_m:90-i,
    updated_at:stale,last_active_at:stale,delta_m:0,vs_points:0
  }));
  const state={...baseState,alliance:{...baseState.alliance,role:'R5',members:staleOnly}};
  const {status,body}=callAdvice('alliance',state,'fr-FR');
  assert.equal(status,200);
  assert.equal(body.activity.active,0);
  assert.equal(body.activity.refresh,12);
  assert.equal(body.immediate_actions.length,0,'Stale-only roster must not receive tactical assignments');
  assert.deepEqual(body.plan_b.map(x=>x.kind),['refresh'],'Stale-only roster must ask for refresh only');
  assert.equal(body.plan_b[0].count,12);
  log('Stale-only alliance roster produces refresh-only Plan B and zero invented tactical roles');
}

// V2.5.12 regression: mixed roster assigns ONLY confirmed-active members.
{
  const activeMembers=Array.from({length:7},(_,i)=>({
    name:`Active${i+1}`,role:i<2?'R4':'R3',power_m:100-i,
    updated_at:now,last_active_at:now,delta_m:1
  }));
  const staleMembers=Array.from({length:8},(_,i)=>({
    name:`Old${i+1}`,role:'R2',power_m:80-i,
    updated_at:stale,last_active_at:stale,delta_m:0,vs_points:0
  }));
  const state={...baseState,alliance:{...baseState.alliance,role:'R5',members:[...activeMembers,...staleMembers]}};
  const {body}=callAdvice('alliance',state,'fr-FR');
  const assigned=body.immediate_actions.flatMap(x=>x.members||[]);
  assert.ok(assigned.length>0);
  assert.ok(assigned.every(name=>name.startsWith('Active')),'Only confirmed-active members may appear in tactical groups');
  assert.ok(body.plan_b.some(x=>x.kind==='refresh'&&x.count===8));
  log('Mixed alliance roster keeps stale members out of tactical groups');
}

// Mobile rendering and neutral import example guards.
{
  const app=read('app.js'),css=read('styles.css'),html=read('index.html');
  assert.match(app,/memberNames\(items,limit=6\)/);
  assert.match(app,/\+\$\{more\}/);
  assert.match(css,/\.warPlanStructured>\.warPlanAction/);
  assert.doesNotMatch(html,/placeholder="Benoit,/i);
  assert.match(html,/placeholder="Joueur01,R4,30,65\.2"/);
  log('Alliance action rendering is compact on mobile and import example is neutral');
}

// VS and Season structured endpoints still work.
{
  const vs=callAdvice('vs',baseState,'fr-FR');
  assert.equal(vs.status,200);assert.equal(vs.body.ok,true);assert.equal(vs.body.day,3);assert.match(vs.body.engine,/2\.5\.12/);
  assert.ok(Array.isArray(vs.body.priorities)&&vs.body.priorities.length>=2);
  const season=callAdvice('season',baseState,'fr-FR');
  assert.equal(season.status,200);assert.equal(season.body.ok,true);assert.equal(season.body.day,20);assert.equal(season.body.total_days,35);assert.match(season.body.engine,/2\.5\.12/);
  assert.ok(Array.isArray(season.body.priorities)&&season.body.priorities.length>=1);
  log('VS and Season advice remain operational on the V2.5.12 engine');
}


// Legacy/partial state normalization and merge must preserve known player/squad data.
{
  const legacy={version:'1.4',player_id:'legacy-player',player:{name:'Legacy',hq_level:29,power_m:100,role:'R3'},squads:[{power:55,updated_at:'2026-08-20T00:00:00.000Z',heroes:[hero('DVA',145,5,7,'19','Lv.39')]}],alliance:{members:[{name:'Manual Legacy',role:'R2',power_m:40}]}};
  const normalized=normalizeState(legacy);
  assert.equal(normalized.version,'2.5.12');
  assert.equal(normalized.player.name,'Legacy');
  assert.equal(normalized.squads[0].heroes[0].name,'DVA');
  assert.equal(normalized.squads[0].heroes[0].level,145);
  const merged=mergeNewest(normalized,{updated_at:'2026-08-29T00:00:00.000Z',player:{power_m:111}});
  assert.equal(merged.player.name,'Legacy');
  assert.equal(merged.player.power_m,111);
  assert.equal(merged.squads[0].heroes[0].name,'DVA');
  assert.equal(merged.squads[0].heroes[0].level,145);
  log('Legacy/partial state normalization keeps known player and hero data through V2.5.12');
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
  const structuredKeys=['seven_day_plan','immediate_actions','plan_b','voice_settings','import_roster','ai_kind_scan','alliance_group_rally','vs_hold_rule','season_structured_priority','activity_active_confirmed','activity_reliability_note','roster_hint','unit_type_aircraft','unit_type_tank','unit_type_missile','plan7_shop_resources','plan7_timing','alliance_invite_connect','alliance_invite_ready','alliance_joined','alliance_owner_switch_blocked','vs_prep_day','vs_prep_focus','vs_prep_hold_rule','shop_relevance','shop_data_confidence','shop_availability','shop_availability_observed','shop_availability_unverified','shop_availability_official','season_state','season_state_auto','season_state_active','season_state_ended','season_state_interseason','season_unknown','season_ended_short','season_interseason','season_last_profession','season_wait_next','season_no_old_advice','season_confirm_state','season_interseason_note','season_ended_note','season_last_profession_short','beta_badge','beta_access_title','beta_consent_text','beta_consent_note','beta_signin_required','beta_invite_required','beta_allowlist_setup','beta_invited','beta_consent_required','beta_pro_included','beta_pro_free','beta_payment_disabled','beta_feedback_button','beta_feedback_title','beta_feedback_privacy','beta_feedback_share'];
  for(const [code] of explicit){
    const t=translator(code);
    for(const key of structuredKeys)assert.notEqual(t(key),key,`${code} is missing ${key}`);
  }
  const nonEnglish=explicit.map(x=>x[0]).filter(code=>!code.startsWith('en'));
  for(const code of nonEnglish){
    const t=translator(code),en=translator('en-GB');
    assert.notEqual(t('activity_reliability_note'),en('activity_reliability_note'),`${code} still inherits English activity reliability copy`);
    assert.notEqual(t('vs_hold_rule'),en('vs_hold_rule'),`${code} still inherits English structured VS hold copy`);
    assert.notEqual(t('beta_access_title'),en('beta_access_title'),`${code} still inherits English private-beta access copy`);
  }
  log('All 23 explicit language choices resolve V2.5.12 structured Player/Alliance/VS/Season/voice labels');
}

// V2.5.12 private beta: invitation allowlist, free PRO, consent and payment lock are enforced by design.
{
  const oldEmails=process.env.WARBOOST_BETA_EMAILS;
  delete process.env.WARBOOST_BETA_EMAILS;
  let cfg=betaConfig();
  assert.equal(cfg.release,true);assert.equal(cfg.enforced,false);assert.equal(cfg.payments_enabled,false);assert.equal(cfg.pro_included,true);
  assert.equal(cfg.consent_version,BETA_CONSENT_VERSION);
  let access=betaAccessForUser({email:'tester@example.com'});
  assert.equal(access.allowed,true);assert.equal(access.access_status,'preview-open');
  process.env.WARBOOST_BETA_EMAILS='One@example.com; TWO@example.com; one@example.com';
  cfg=betaConfig();assert.equal(cfg.enforced,true);assert.equal(cfg.invited_count,2);
  access=betaAccessForUser({email:'ONE@example.com'});assert.equal(access.allowed,true);assert.equal(access.access_status,'invited');
  access=betaAccessForUser({email:'outsider@example.com'});assert.equal(access.allowed,false);assert.equal(access.access_status,'invite-required');
  if(oldEmails===undefined)delete process.env.WARBOOST_BETA_EMAILS;else process.env.WARBOOST_BETA_EMAILS=oldEmails;
  const app=read('app.js'),html=read('index.html'),pro=read('api/pro.js'),health=read('api/health.js');
  assert.match(app,/BETA_CONSENT_KEY/);assert.match(app,/x-warboost-beta-consent/);assert.match(app,/requireBetaAccess/);assert.match(app,/requireBetaConsent/);assert.match(app,/betaFeedbackReport/);
  assert.match(app,/function betaConsentStorageKey/);assert.match(app,/localStorage\.setItem\(key,"1"\)/);assert.doesNotMatch(app,/browser=\$\{navigator\.userAgent\}/);
  assert.match(app,/openScanBtn.*requireBetaAccess/s);assert.match(app,/shareInviteBtn.*requireBetaAccess\(\).*requireBetaConsent\(\)/s);
  assert.match(html,/id="betaHeaderBadge"/);assert.match(html,/id="betaAccessSection"/);assert.match(html,/id="betaConsent"/);assert.match(html,/id="betaFeedbackBtn"/);assert.match(html,/id="feedbackDrawer"/);
  assert.match(html,/data-i18n="beta_pro_title"/);assert.match(html,/data-i18n="beta_pro_included"[^>]*disabled/);assert.doesNotMatch(html,/>Passer PRO<|>Go PRO</);
  assert.match(pro,/BETA_PAYMENT_DISABLED/);assert.match(pro,/payments_enabled:false/);assert.match(pro,/beta_configured:beta\.configured/);assert.match(pro,/allowed:beta\.allowed/);assert.match(app,/fetch\(\"\/api\/pro\"/);assert.doesNotMatch(app,/fetch\(\"\/api\/beta\"/);
  assert.ok(pro.indexOf('const user=await requireUser(req)')<pro.indexOf('String(req.query?.debug||"")==="1"'),'Payment diagnostics must authenticate before any debug response');
  for(const flag of ['private_beta_badge','beta_email_invitation_allowlist','beta_access_enforced_when_allowlist_configured','beta_pro_free_for_invited_testers','beta_payments_disabled','beta_consent_required_before_cloud_ai_writes','beta_consent_revocable_on_device','beta_consent_account_scoped','beta_feedback_device_share_no_auto_personal_data','beta_feedback_no_full_user_agent','beta_existing_player_data_preserved','beta_status_reuses_pro_endpoint']) assert.match(health,new RegExp(flag+':true'));
  assert.equal(fs.existsSync(path.join(root,'supabase','migration_v2_5_12.sql')),false,'Private beta must not introduce an unnecessary database migration');
  assert.equal(fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).length,12,'V2.5.12 must stay within the Vercel Hobby 12-function deployment limit');
  const readme=read('README.md'),guide=read('UPLOAD_GUIDE_V2_5_12.txt');assert.match(readme,/WARBOOST_BETA_EMAILS/);assert.match(guide,/beta\.access_enforced = true/);
  log('Private beta access, consent, free PRO, feedback privacy and payment lock safeguards are present');
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
  assert.match(app,/APP_VERSION\s*=\s*["']2\.5\.12["']/);
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
  assert.equal(manifest.name.includes('V2.5.12'),true);
  assert.match(sw,/warboost-v2-5-12-private-beta-reliability/);
  assert.match(migration,/create table if not exists public\.wb1_profiles/i);
  assert.match(migration,/create table if not exists public\.wb1_snapshots/i);
  assert.match(migration,/create table if not exists public\.wb1_alliances/i);
  assert.match(migration,/create table if not exists public\.wb1_alliance_members/i);
  assert.doesNotMatch(migration,/\bdrop\s+table\b/i);
  assert.doesNotMatch(migration,/\btruncate\b/i);
  assert.doesNotMatch(migration,/\bdelete\s+from\b/i);
  const migration57=read('supabase/migration_v2_5_7.sql'),schema=read('supabase/schema.sql'),inviteApi=read('api/invite.js'),joinApi=read('api/join.js'),supabaseLib=read('lib/supabase.js');
  assert.match(migration57,/create unique index if not exists wb1_alliance_members_player_unique_idx/i);
  assert.match(migration57,/on public\.wb1_alliance_members\(player_id\)/i);
  assert.doesNotMatch(migration57,/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
  assert.match(schema,/wb1_alliance_members_player_unique_idx/);
  assert.match(supabaseLib,/on_conflict=player_id/);
  assert.doesNotMatch(supabaseLib,/on_conflict=invite_code/);
  assert.match(inviteApi,/randomBytes/);
  assert.match(inviteApi,/getOwnedAlliance/);
  assert.match(inviteApi,/manager_role_required/);
  assert.doesNotMatch(inviteApi,/req\.body\?\.invite_code/);
  assert.match(joinApi,/alliance_owner_switch_blocked/);
  assert.match(joinApi,/already_member/);
  assert.match(migration,/grant select, insert, update on table public\.wb1_profiles to service_role/i);
  assert.match(migration,/grant select, insert on table public\.wb1_snapshots to service_role/i);
  assert.match(migration,/grant select, insert, update on table public\.wb1_alliances to service_role/i);
  assert.match(migration,/grant select, insert, update on table public\.wb1_alliance_members to service_role/i);
  assert.match(migration,/revoke all privileges on table public\.wb1_alliances from authenticated/i);
  assert.match(migration,/\(select auth\.uid\(\)\)::text/i);
  assert.equal(pkg.version,'2.5.12');
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



function jsonResponse(body,status=200){
  return {ok:status>=200&&status<300,status,async json(){return body},async text(){return JSON.stringify(body)}};
}
async function callAsync(handler,body={}){
  let statusCode=200,payload=null,headers={};
  const req={method:'POST',headers:{authorization:'Bearer user-token','x-warboost-beta-consent':BETA_CONSENT_VERSION},body};
  const res={setHeader(k,v){headers[k]=v},status(c){statusCode=c;return this},json(v){payload=v;return v}};
  await handler(req,res);return {status:statusCode,body:payload,headers};
}
async function withMockSupabase(routes,fn){
  const old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,anon:process.env.SUPABASE_ANON_KEY,fetch:globalThis.fetch};
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';process.env.SUPABASE_ANON_KEY='test-anon';
  const calls=[];
  globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),options});for(const route of routes){if(route.match(String(url),options,calls))return jsonResponse(route.body,route.status||200)}return jsonResponse({message:'unmatched mock route',url:String(url)},500)};
  try{return await fn(calls)}finally{globalThis.fetch=old.fetch;for(const [k,v] of [['SUPABASE_URL',old.url],['SUPABASE_SERVICE_ROLE_KEY',old.key],['SUPABASE_ANON_KEY',old.anon]]){if(v===undefined)delete process.env[k];else process.env[k]=v}}
}

// Private-beta server gate: invitation and per-account consent are enforced server-side; payments stay disabled.
{
  const oldEmails=process.env.WARBOOST_BETA_EMAILS;
  process.env.WARBOOST_BETA_EMAILS='invited@example.com';
  await withMockSupabase([
    {match:u=>u.endsWith('/auth/v1/user'),body:{id:'outside',email:'outside@example.com'}}
  ],async()=>{
    let err=null;try{await requireBetaUser({headers:{authorization:'Bearer user-token','x-warboost-beta-consent':BETA_CONSENT_VERSION}},{consent:true})}catch(e){err=e}
    assert.equal(err?.code,'BETA_INVITE_REQUIRED');assert.equal(err?.status,403);
  });
  await withMockSupabase([
    {match:u=>u.endsWith('/auth/v1/user'),body:{id:'invited',email:'invited@example.com'}}
  ],async()=>{
    let err=null;try{await requireBetaUser({headers:{authorization:'Bearer user-token'}},{consent:true})}catch(e){err=e}
    assert.equal(err?.code,'BETA_CONSENT_REQUIRED');assert.equal(err?.status,428);
    const ok=await requireBetaUser({headers:{authorization:'Bearer user-token','x-warboost-beta-consent':BETA_CONSENT_VERSION}},{consent:true});assert.equal(ok.user.id,'invited');assert.equal(ok.beta.allowed,true);
    const pay=await callAsync(proHandler,{action:'checkout'});assert.equal(pay.status,403);assert.equal(pay.body.error,'BETA_PAYMENT_DISABLED');
  });
  if(oldEmails===undefined)delete process.env.WARBOOST_BETA_EMAILS;else process.env.WARBOOST_BETA_EMAILS=oldEmails;
  log('Private beta rejects outsiders, requires consent for data APIs and blocks payment checkout server-side');
}

// Alliance invitation: an existing R1 member must not be able to share the manager invite code.
await withMockSupabase([
  {match:u=>u.endsWith('/auth/v1/user'),body:{id:'u1'}},
  {match:u=>u.includes('wb1_alliance_members?player_id=eq.u1'),body:[{alliance_id:'a1',player_id:'u1',role:'R1',updated_at:now}]},
  {match:u=>u.includes('wb1_alliances?id=eq.a1'),body:[{id:'a1',tag:'AAA',invite_code:'AAA-SECRET',owner_player_id:'owner'}]}
],async calls=>{const r=await callAsync(inviteHandler,{tag:'AAA'});assert.equal(r.status,403);assert.equal(r.body.error,'manager_role_required');assert.equal(calls.filter(c=>c.options?.method==='POST'&&c.url.includes('/rest/v1/wb1_alliances')).length,0)});
log('Alliance invite sharing is restricted to R5/R4 for an existing cloud alliance');

// Alliance invitation: recover an owned alliance if creation previously succeeded but membership insertion was interrupted.
await withMockSupabase([
  {match:u=>u.endsWith('/auth/v1/user'),body:{id:'owner1'}},
  {match:u=>u.includes('wb1_alliance_members?player_id=eq.owner1'),body:[]},
  {match:u=>u.includes('wb1_alliances?owner_player_id=eq.owner1'),body:[{id:'a-owned',tag:'OWN',invite_code:'OWN-REAL',owner_player_id:'owner1'}]},
  {match:(u,o)=>u.includes('wb1_alliance_members?on_conflict=player_id')&&o.method==='POST',body:[{alliance_id:'a-owned',player_id:'owner1',role:'R5'}]}
],async calls=>{const r=await callAsync(inviteHandler,{tag:'OWN'});assert.equal(r.status,200);assert.equal(r.body.recovered,true);assert.equal(r.body.invite_code,'OWN-REAL');assert.equal(calls.filter(c=>c.options?.method==='POST'&&/\/rest\/v1\/wb1_alliances$/.test(c.url)).length,0)});
log('Interrupted alliance creation recovers the existing owner alliance instead of creating duplicates');

// Alliance switch: owners are blocked from silently abandoning an owned alliance.
await withMockSupabase([
  {match:u=>u.endsWith('/auth/v1/user'),body:{id:'owner2'}},
  {match:u=>u.includes('wb1_alliances?invite_code=eq.NEW-CODE'),body:[{id:'new-a',tag:'NEW',invite_code:'NEW-CODE',owner_player_id:'other'}]},
  {match:u=>u.includes('wb1_alliance_members?player_id=eq.owner2'),body:[{alliance_id:'old-a',player_id:'owner2',role:'R5',updated_at:now}]},
  {match:u=>u.includes('wb1_alliances?id=eq.old-a'),body:[{id:'old-a',tag:'OLD',invite_code:'OLD-CODE',owner_player_id:'owner2'}]}
],async calls=>{const r=await callAsync(joinHandler,{invite_code:'NEW-CODE'});assert.equal(r.status,409);assert.equal(r.body.error,'alliance_owner_switch_blocked');assert.equal(calls.filter(c=>c.options?.method==='POST'&&c.url.includes('wb1_alliance_members?on_conflict=player_id')).length,0)});
log('Alliance owners cannot silently switch alliances and orphan their current alliance');

// Alliance switch: a non-owner moves atomically via the player_id unique membership guard.
await withMockSupabase([
  {match:u=>u.endsWith('/auth/v1/user'),body:{id:'member1'}},
  {match:u=>u.includes('wb1_alliances?invite_code=eq.NEW-CODE'),body:[{id:'new-a',tag:'NEW',invite_code:'NEW-CODE',owner_player_id:'other'}]},
  {match:u=>u.includes('wb1_alliance_members?player_id=eq.member1'),body:[{alliance_id:'old-a',player_id:'member1',role:'R2',updated_at:now}]},
  {match:u=>u.includes('wb1_alliances?id=eq.old-a'),body:[{id:'old-a',tag:'OLD',invite_code:'OLD-CODE',owner_player_id:'owner-old'}]},
  {match:(u,o)=>u.includes('wb1_alliance_members?on_conflict=player_id')&&o.method==='POST',body:[{alliance_id:'new-a',player_id:'member1',role:'R1'}]}
],async calls=>{const r=await callAsync(joinHandler,{invite_code:'NEW-CODE'});assert.equal(r.status,200);assert.equal(r.body.switched,true);const post=calls.find(c=>c.options?.method==='POST'&&c.url.includes('wb1_alliance_members?on_conflict=player_id'));assert.ok(post);assert.equal(JSON.parse(post.options.body).role,'R1')});
log('Non-owner alliance switching uses one player_id-scoped membership row');

// Boutique IA: a fresh visible scan is partial, excludes sold offers, and never fabricates full-catalogue availability.
{
  const shopState=structuredClone(baseState);shopState.shop={store_type:'Campaign Store',currency:'campaign',currency_balance:50000,updated_at:now,offers:[
    {item_name:'Universal Exclusive Weapon Shards',category:'exclusive',price:1000,currency:'campaign',sold:false,updated_at:now},
    {item_name:'Generic Resource Chest',category:'resources',price:100,currency:'campaign',sold:false,updated_at:now},
    {item_name:'Sold Hero Shards',category:'hero',price:500,currency:'campaign',sold:true,updated_at:now}
  ]};
  const r=callAdvice('player',shopState,'fr-FR');const sh=r.body.analysis.shop;
  assert.equal(sh.scan_based,true);assert.equal(sh.catalog_complete,false);assert.equal(sh.catalog_status,'partial');assert.equal(sh.sold_observed_offer_count,1);assert.ok(sh.recommendations.length>=1);assert.ok(sh.recommendations.every(x=>x.item!=='Sold Hero Shards'));assert.ok(sh.recommendations.every(x=>x.verdict));
  log('Boutique IA ranks only fresh visible offers, excludes sold items and keeps a partial-catalogue disclaimer');
}

// V2.5.12: relevance, data confidence and availability are independent dimensions.
{
  const referenceState=structuredClone(baseState);
  referenceState.shop={store_type:'',currency:'diamonds',currency_balance:25000,offers:[],snapshots:[],updated_at:null};
  const ref=callAdvice('player',referenceState,'fr-FR').body.analysis.shop;
  assert.equal(ref.catalog_status,'reference');
  assert.ok(ref.recommendations.length>=1);
  assert.ok(ref.recommendations.every(x=>x.relevance_score===x.score));
  assert.ok(ref.recommendations.every(x=>String(x.relevance_label||'').startsWith('Pertinence ')));
  assert.ok(ref.recommendations.every(x=>x.evidence_confidence<=68));
  assert.ok(ref.recommendations.every(x=>x.availability_status==='reference_unverified'));
  assert.ok(ref.recommendations.every(x=>x.availability_live_verified===false));
  assert.ok(ref.recommendations.filter(x=>x.price_label).every(x=>/réf\. 26\/08\/2026 ·/.test(x.price_label)));
  assert.equal(ref.budget.reserve_diamonds,10000);
  assert.equal(ref.budget.reserve_checked_at,'2026-08-30');
  assert.equal(ref.budget.reserve_live_verified,false);
  assert.equal(ref.budget.reserve_requires_in_game_check,true);
  assert.match(ref.summary,/Référence croisée au 30\/08\/2026/);
  assert.match(ref.summary,/Vérifie le coût actuel dans Last War/);
  assert.match(ref.confidence_label,/Confiance données/);
  log('Reference shop advice separates relevance, data confidence and unverified availability, with dated exact-price evidence');
}

// V2.5.12: recent user scan can raise evidence confidence but is still an observation, not official live availability.
{
  const scanState=structuredClone(baseState);scanState.shop={store_type:'Campaign Store',currency:'campaign',currency_balance:50000,updated_at:now,offers:[
    {item_name:'Universal Exclusive Weapon Shards',category:'exclusive',price:1000,currency:'campaign',sold:false,updated_at:now}
  ]};
  const sh=callAdvice('player',scanState,'fr-FR').body.analysis.shop,rec=sh.recommendations[0];
  assert.equal(rec.availability_status,'observed_scan');
  assert.equal(rec.availability_live_verified,false);
  assert.equal(rec.availability_observed,true);
  assert.ok(rec.evidence_confidence>=80);
  assert.match(rec.relevance_label,/Pertinence/);
  log('Recent shop scan is clearly marked as observed evidence, not official live availability');
}

// UI must never render a bare /100 score without the relevance label.
{
  const app=read('app.js'),css=read('styles.css');
  assert.match(app,/shop_relevance/);
  assert.match(app,/shop_data_confidence/);
  assert.match(app,/shop_availability_unverified/);
  assert.match(css,/\.shopMetrics/);
  assert.doesNotMatch(app,/shopScore">\$\{esc\(String\(Math\.round\(Number\(x\.score\)\)\)\)\}\/100/);
  log('Shop UI labels 100/100 as relevance and shows separate evidence confidence / availability');
}

// VS: Sunday is preparation, not Day 6; Saturday remains Day 6.
{
  const sunday=structuredClone(baseState);sunday.vs={...sunday.vs,day:0,updated_at:now};const r0=callAdvice('vs',sunday,'fr-FR');assert.equal(r0.status,200);assert.equal(r0.body.day,0);assert.equal(r0.body.prep_day,true);assert.equal(r0.body.score_gap,null);assert.match(r0.body.advice,/Dimanche.*(?:pas|n’est pas).*score|Sunday.*not.*scor/i);
  const saturday=structuredClone(baseState);saturday.vs={...saturday.vs,day:6,updated_at:now};const r6=callAdvice('vs',saturday,'fr-FR');assert.equal(r6.body.day,6);assert.notEqual(r6.body.prep_day,true);
  assert.equal(lastWarVsDay(new Date('2026-08-30T01:00:00Z')),6,'01:00 UTC Sunday is still Saturday in Last War server time (UTC-2)');
  assert.equal(lastWarVsDay(new Date('2026-08-30T02:00:00Z')),0,'02:00 UTC Sunday begins Sunday prep at Last War reset');
  assert.equal(lastWarVsDay(new Date('2026-08-31T01:00:00Z')),0,'01:00 UTC Monday is still Sunday prep in Last War server time');
  assert.equal(lastWarVsDay(new Date('2026-08-31T02:00:00Z')),1,'02:00 UTC Monday begins VS Day 1');
  log('Last War VS day boundaries follow the UTC-2 server reset');
}

// V2.5.12 Season lifecycle: unknown is not 0%, active keeps real 0%, ended/interseason disables S6 advice.
{
  const empty=structuredClone(baseState);empty.season={};const e=callAdvice('season',empty,'fr-FR');assert.equal(e.body.data_quality,'low');assert.equal(e.body.progress_pct,null);assert.equal(e.body.lifecycle,'unknown');
  const legacy=normalizeState({...baseState,version:'2.5.9',season:{name:'Saison 6',number:6,day:null,total_days:null,profession:'Chef de guerre',progress_pct:0,updated_at:stale}});
  assert.equal(legacy.season.progress_pct,null,'Legacy missing progress must not survive as factual 0%');
  assert.equal(legacy.season.lifecycle,'unknown');
  const realZero=normalizeState({...baseState,season:{name:'S7',number:7,day:1,total_days:35,profession:'Engineer',progress_pct:0,lifecycle:'active',updated_at:now}});
  assert.equal(realZero.season.progress_pct,0,'A visibly active season may legitimately have 0% progress');
  assert.equal(activeSeasonProgress(realZero.season),0);
  const ended=structuredClone(baseState);ended.season={name:'Saison 6',number:6,day:null,total_days:null,profession:'Chef de guerre',progress_pct:0,lifecycle:'interseason',lifecycle_source:'user_confirmed',ended_at:now,updated_at:stale};
  const sEnd=callAdvice('season',ended,'fr-FR');
  assert.equal(sEnd.body.lifecycle,'interseason');assert.equal(sEnd.body.season_active,false);assert.equal(sEnd.body.progress_pct,null);assert.equal(sEnd.body.last_known_profession,'Chef de guerre');assert.equal(sEnd.body.season6_awakening,null);
  assert.doesNotMatch(sEnd.body.advice,/Progression 0|Éveil \/ Reshape|\+20% PV\/ATQ\/DEF/i);
  assert.match(sEnd.body.advice,/entre-saisons|terminée/i);
  const playerEnd=callAdvice('player',ended,'fr-FR');assert.equal(playerEnd.body.analysis.season6_awakening.active,false);assert.equal(playerEnd.body.analysis.season6_awakening.hero_value_model.length,0);assert.ok(playerEnd.body.analysis.priorities.every(x=>x.kind!=='awakening'));
  const ctx=buildAdaptiveContext({...ended,vs:{day:null,week:null,opponent:null}},{mainType:'aircraft',formationBonusPct:20,locale:'fr-FR'});assert.equal(ctx.season.lifecycle,'interseason');assert.equal(ctx.season.phase,'interseason');assert.notEqual(ctx.objective,'season','Historical season/profession must not force a season objective');
  const s6=callAdvice('season',baseState,'fr-FR');assert.equal(s6.body.day,20);assert.equal(s6.body.total_days,35);assert.equal(s6.body.lifecycle,'active');assert.equal(s6.body.season6_awakening.exact_power_projection,false);
  log('Season lifecycle separates active, ended/interseason and unknown without inventing 0% progress');
}

// V2.5.12 structured labels must exist in every explicit language.
{
  const keys=['alliance_invite_connect','alliance_invite_ready','alliance_invite_failed','alliance_invite_not_found','alliance_joined','alliance_already_joined','alliance_join_failed','alliance_owner_switch_blocked','vs_prep_day','vs_prep_focus','vs_prep_hold_rule','shop_relevance','shop_data_confidence','shop_availability','shop_availability_observed','shop_availability_unverified','shop_availability_official','season_state','season_state_auto','season_state_active','season_state_ended','season_state_interseason','season_unknown','season_ended_short','season_interseason','season_last_profession','season_wait_next','season_no_old_advice','season_confirm_state','season_interseason_note','season_ended_note','season_last_profession_short','beta_badge','beta_access_title','beta_consent_text','beta_consent_note','beta_signin_required','beta_invite_required','beta_allowlist_setup','beta_invited','beta_consent_required','beta_pro_included','beta_pro_free','beta_payment_disabled','beta_feedback_button','beta_feedback_title','beta_feedback_privacy','beta_feedback_share'];
  for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')){const tr=translator(code);for(const k of keys)assert.notEqual(tr(k),k,`${code} missing ${k}`)}
  log('All 23 explicit languages include V2.5.12 alliance and Sunday-prep labels');
}


// V2.5.12 source guards: no missing progress coercion, lifecycle UI and health flags are present.
{
  const app=read('app.js'),normal=read('lib/normalize.js'),health=read('api/health.js'),scan=read('api/scan.js'),idx=read('index.html');
  assert.doesNotMatch(normal,/progress_pct:clamp\(season\.progress_pct\|\|0/);
  assert.doesNotMatch(app,/Number\(s\.progress_pct\|\|0\)/);
  assert.match(idx,/seasonLifecycleSelect/);assert.match(scan,/lifecycle/);
  for(const flag of ['season_lifecycle_active_ended_interseason_unknown','missing_season_progress_never_zero','ended_season_disables_s6_advice','interseason_historical_profession_only','season_unknown_blocks_numeric_advice','season_manual_lifecycle_override'])assert.match(health,new RegExp(flag+':true'));
  log('Season lifecycle UI, scan contract and server health guards are present');
}

// V2.5.12 Season UI: historical labels are dynamic and localized; lifecycle engine remains V2.5.10-compatible.
{
  const app=read('app.js'),idx=read('index.html'),health=read('api/health.js');
  assert.match(idx,/id=\"seasonProfessionLabel\"/);
  assert.match(idx,/id=\"seasonSectionTitle\"/);
  assert.match(app,/seasonHistorical=\(seasonLife===\"ended\"\|\|seasonLife===\"interseason\"\)/);
  assert.match(app,/seasonHistorical\?t\(\"season_last_profession_short\"\):t\(\"profession\"\)/);
  assert.match(app,/seasonHistorical\?t\(\"season_state\"\):t\(\"season_progress\"\)/);
  const explicit=LANGUAGES.filter(([c])=>c!=='auto'),enLabel=translator('en-GB')('season_last_profession_short');
  for(const [code] of explicit){
    const label=translator(code)('season_last_profession_short');
    assert.notEqual(label,'season_last_profession_short',`${code} missing V2.5.12 historical profession label`);
    if(!code.startsWith('en')) assert.notEqual(label,enLabel,`${code} historical profession label is still English`);
  }
  assert.match(app,/function applyLanguage\(\).*render\(\)/s,'Language change must rerender dynamic Season labels');
  for(const flag of ['season_ui_historical_profession_label','season_ui_state_title_when_progress_not_applicable','season_ui_labels_23_languages']) assert.match(health,new RegExp(flag+':true'));
  log('Season UI switches Profession/Progress to historical profession/Season state for ended/inter-season in all 23 explicit languages');
}

console.log('\nWarBoost V2.5.12 verification: PASS');
