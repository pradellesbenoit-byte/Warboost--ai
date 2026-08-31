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
import {createWarBoostSupabaseAuthClient} from '../lib/browser-auth.js';
import {metaContext} from '../lib/meta-intel.js';

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
    analysis.engine='warboost-ai-core-v2.5.19';
    return {status:200,body:{ok:true,engine:analysis.engine,advice:analysis.summary,analysis}};
  }
  if(scope==='alliance'){
    const role=String(state?.alliance?.role||state?.player?.role||'R1').toUpperCase();
    if(!['R4','R5'].includes(role))return {status:403,body:{ok:false,error:'manager_role_required'}};
    const a=buildAllianceAdvice(state,locale);
    return {status:200,body:{ok:true,engine:'warboost-alliance-ai-v2.5.19',...a}};
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
  version:'2.5.19',updated_at:now,
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

// V2.5.2 reliability must survive V2.5.19: Squad 1 is the selected main squad.
{
  const {status,body}=callAdvice('player',baseState,'fr-FR');
  assert.equal(status,200);
  assert.equal(body.ok,true);
  assert.equal(body.analysis.focus_squad,1,'Squad 2 is stronger, but Squad 1 must remain the selected main squad');
  assert.equal(body.analysis.strongest_squad.id,2);
  assert.equal(body.analysis.strongest_squad.is_focus,false);
  assert.match(body.analysis.engine,/2\.5\.19/);
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
  assert.match(body.engine,/2\.5\.19/);
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


// V2.5.19 regression: stale/unknown members must NEVER be assigned to tactical groups.
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

// V2.5.19 regression: mixed roster assigns ONLY confirmed-active members.
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
  assert.equal(vs.status,200);assert.equal(vs.body.ok,true);assert.equal(vs.body.day,3);assert.match(vs.body.engine,/2\.5\.19/);
  assert.ok(Array.isArray(vs.body.priorities)&&vs.body.priorities.length>=2);
  const season=callAdvice('season',baseState,'fr-FR');
  assert.equal(season.status,200);assert.equal(season.body.ok,true);assert.equal(season.body.day,20);assert.equal(season.body.total_days,35);assert.match(season.body.engine,/2\.5\.19/);
  assert.ok(Array.isArray(season.body.priorities)&&season.body.priorities.length>=1);
  log('VS and Season advice remain operational on the V2.5.19 engine');
}


// Legacy/partial state normalization and merge must preserve known player/squad data.
{
  const legacy={version:'1.4',player_id:'legacy-player',player:{name:'Legacy',hq_level:29,power_m:100,role:'R3'},squads:[{power:55,updated_at:'2026-08-20T00:00:00.000Z',heroes:[hero('DVA',145,5,7,'19','Lv.39')]}],alliance:{members:[{name:'Manual Legacy',role:'R2',power_m:40}]}};
  const normalized=normalizeState(legacy);
  assert.equal(normalized.version,'2.5.19');
  assert.equal(normalized.player.name,'Legacy');
  assert.equal(normalized.squads[0].heroes[0].name,'DVA');
  assert.equal(normalized.squads[0].heroes[0].level,145);
  const merged=mergeNewest(normalized,{updated_at:'2026-08-29T00:00:00.000Z',player:{power_m:111}});
  assert.equal(merged.player.name,'Legacy');
  assert.equal(merged.player.power_m,111);
  assert.equal(merged.squads[0].heroes[0].name,'DVA');
  assert.equal(merged.squads[0].heroes[0].level,145);
  log('Legacy/partial state normalization keeps known player and hero data through V2.5.19');
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
  const structuredKeys=['seven_day_plan','immediate_actions','plan_b','voice_settings','import_roster','ai_kind_scan','alliance_group_rally','vs_hold_rule','season_structured_priority','activity_active_confirmed','activity_reliability_note','roster_hint','unit_type_aircraft','unit_type_tank','unit_type_missile','plan7_shop_resources','plan7_timing','alliance_invite_connect','alliance_invite_ready','alliance_joined','alliance_owner_switch_blocked','vs_prep_day','vs_prep_focus','vs_prep_hold_rule','shop_relevance','shop_data_confidence','shop_availability','shop_availability_observed','shop_availability_unverified','shop_availability_official','season_state','season_state_auto','season_state_active','season_state_ended','season_state_interseason','season_unknown','season_ended_short','season_interseason','season_last_profession','season_wait_next','season_no_old_advice','season_confirm_state','season_interseason_note','season_ended_note','season_last_profession_short','beta_badge','beta_access_title','beta_consent_text','beta_consent_note','beta_signin_required','beta_invite_required','beta_allowlist_setup','beta_invited','beta_consent_required','beta_pro_included','beta_pro_free','beta_payment_disabled','beta_feedback_button','beta_feedback_title','beta_feedback_privacy','beta_feedback_share','vs_next_day1','auth_cloud_config_unreachable','auth_client_unavailable','auth_cloud_unreachable'];
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
  log('All 23 explicit language choices resolve V2.5.19 structured Player/Alliance/VS/Season/voice labels');
}

// V2.5.19 private beta: invitation allowlist, free PRO, consent and payment lock are enforced by design.
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
  assert.equal(fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).length,12,'V2.5.19 must stay within the Vercel Hobby 12-function deployment limit');
  const readme=read('README.md'),guide=read('UPLOAD_GUIDE_V2_5_15.txt');assert.match(readme,/WARBOOST_BETA_EMAILS/);assert.match(guide,/beta\.access_enforced = true/);
  log('Private beta access, consent, free PRO, feedback privacy and payment lock safeguards are present');
}

// V2.5.19 browser auth: no third-party CDN dependency, compatible Supabase session storage,
// direct password login/refresh/logout transport, and explicit network failure codes.
{
  const index=read('index.html'),app=read('app.js'),browserAuth=read('lib/browser-auth.js'),health=read('api/health.js');
  assert.doesNotMatch(index,/cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|@supabase\/supabase-js/i,'Browser authentication must not depend on an external Supabase CDN script');
  assert.match(app,/createWarBoostSupabaseAuthClient/);
  assert.doesNotMatch(app,/window\.supabase/);
  assert.match(app,/status:"config-unreachable"/);assert.match(app,/status:"config-missing"/);assert.match(app,/status:"client-error"/);assert.match(app,/status:"auth-unreachable"/);
  assert.match(app,/function renderAuth\(\)/,'renderAuth must exist in the deployed source');
  assert.match(browserAuth,/direct-supabase-auth-api/);
  for(const flag of ['browser_auth_direct_supabase_transport','browser_auth_no_external_cdn','cloud_config_error_distinguished','auth_network_error_distinguished','auth_client_start_error_distinguished','legacy_supabase_session_storage_compatible'])assert.match(health,new RegExp(flag+':true'));

  const mem=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),dump:()=>m}};
  const storage=mem();
  const calls=[];
  const authFetch=async(url,opts={})=>{
    calls.push({url:String(url),opts});
    if(String(url).includes('grant_type=password'))return {ok:true,status:200,json:async()=>({access_token:'access-1',refresh_token:'refresh-1',expires_in:3600,user:{id:'u1',email:'tester@example.com'}})};
    if(String(url).endsWith('/logout'))return {ok:true,status:204,json:async()=>({})};
    throw new Error('unexpected request');
  };
  const client=createWarBoostSupabaseAuthClient({url:'https://abc123.supabase.co',key:'publishable',storage,fetchImpl:authFetch});
  assert.equal(client.diagnostics.external_cdn,false);assert.equal(client.diagnostics.storage_key,'sb-abc123-auth-token');
  let event=null;client.auth.onAuthStateChange((name,session)=>{event={name,session}});
  const signed=await client.auth.signInWithPassword({email:'Tester@Example.com',password:'secret'});
  assert.equal(signed.error,null);assert.equal(signed.data.session.user.id,'u1');assert.equal(event.name,'SIGNED_IN');
  assert.ok(storage.getItem('sb-abc123-auth-token'),'Session must use the same project-scoped storage key as supabase-js');
  const restored=await client.auth.getSession();assert.equal(restored.data.session.access_token,'access-1');
  await client.auth.signOut();assert.equal(storage.getItem('sb-abc123-auth-token'),null);assert.equal(event.name,'SIGNED_OUT');
  assert.ok(calls.some(x=>x.url.includes('/auth/v1/token?grant_type=password')));assert.ok(calls.some(x=>x.url.endsWith('/auth/v1/logout')));

  const expiredStorage=mem();expiredStorage.setItem('sb-abc123-auth-token',JSON.stringify({access_token:'old-access',refresh_token:'old-refresh',expires_in:3600,expires_at:1,user:{id:'u1'}}));
  const refreshClient=createWarBoostSupabaseAuthClient({
    url:'https://abc123.supabase.co',key:'publishable',storage:expiredStorage,
    fetchImpl:async(url)=>{
      assert.ok(String(url).includes('grant_type=refresh_token'));
      return {ok:true,status:200,json:async()=>({access_token:'fresh-access',refresh_token:'fresh-refresh',expires_in:3600,user:{id:'u1'}})};
    }
  });
  const refreshed=await refreshClient.auth.getSession();assert.equal(refreshed.data.session.access_token,'fresh-access','Expired legacy-compatible session must refresh instead of being discarded');

  const signupStorage=mem();let verifyCalls=0;
  const signupClient=createWarBoostSupabaseAuthClient({url:'https://abc123.supabase.co',key:'publishable',storage:signupStorage,fetchImpl:async(url)=>{
    if(String(url).endsWith('/signup'))return {ok:true,status:200,json:async()=>({user:{id:'u2',email:'new@example.com'}})};
    if(String(url).endsWith('/verify')){verifyCalls++;return {ok:true,status:200,json:async()=>({access_token:'verified-access',refresh_token:'verified-refresh',expires_in:3600,user:{id:'u2',email:'new@example.com'}})}};
    throw new Error('unexpected request');
  }});
  const signedUp=await signupClient.auth.signUp({email:'new@example.com',password:'secret'});assert.equal(signedUp.error,null);assert.equal(signedUp.data.user.id,'u2');assert.equal(signedUp.data.session,null,'Email-confirmation signup must not invent a session');
  const verified=await signupClient.auth.verifyOtp({email:'new@example.com',token:'123456',type:'email'});assert.equal(verified.error,null);assert.equal(verified.data.session.access_token,'verified-access');assert.equal(verifyCalls,1);

  const offline=createWarBoostSupabaseAuthClient({url:'https://abc123.supabase.co',key:'publishable',storage:mem(),fetchImpl:async()=>{throw new Error('offline')}});
  const failed=await offline.auth.signInWithPassword({email:'x@y.z',password:'secret'});assert.equal(failed.error.code,'auth_network_unavailable');
  log('Browser authentication is CDN-independent, session-compatible, refresh-capable and distinguishes network failures');
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
  assert.match(app,/APP_VERSION\s*=\s*["']2\.5\.19["']/);
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
  assert.equal(manifest.name.includes('V2.5.19'),true);
  assert.match(sw,/warboost-v2-5-19-private-beta-player-safety/);
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
  assert.equal(pkg.version,'2.5.19');
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
  assert.ok(pkg.scripts.check.includes('node --check lib/browser-auth.js'));
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

// V2.5.19: relevance, data confidence and availability are independent dimensions.
{
  const referenceState=structuredClone(baseState);
  referenceState.shop={store_type:'',currency:'diamonds',currency_balance:25000,offers:[],snapshots:[],updated_at:null};
  const ref=callAdvice('player',referenceState,'fr-FR').body.analysis.shop;
  assert.equal(ref.catalog_status,'reference');
  assert.ok(ref.recommendations.length>=1);
  const currentEligible=ref.recommendations.filter(x=>!x.historical_reference_paid);
  assert.ok(currentEligible.every(x=>x.relevance_score===x.score));
  assert.ok(currentEligible.every(x=>String(x.relevance_label||'').startsWith('Pertinence ')));
  assert.ok(ref.recommendations.filter(x=>x.historical_reference_paid).every(x=>x.score===null&&x.relevance_score===null&&x.ranking_eligible===false));
  assert.ok(ref.recommendations.every(x=>x.evidence_confidence<=68));
  assert.ok(ref.recommendations.every(x=>x.availability_status==='reference_unverified'));
  assert.ok(ref.recommendations.every(x=>x.availability_live_verified===false));
  assert.ok(ref.recommendations.filter(x=>x.price_label&&x.purchase_type!=='real_money').every(x=>/réf\. 26\/08\/2026 ·/.test(x.price_label)));
  assert.equal(ref.recommendation_groups.real_money.length,0);
  assert.ok(ref.recommendation_groups.historical_paid.length>=1);
  assert.ok(ref.recommendation_groups.historical_paid.every(x=>/Prix observé le 26\/08\/2026/.test(x.price_label)&&/prix actuel non vérifié/i.test(x.price_label)));
  assert.equal(ref.budget.reserve_diamonds,10000);
  assert.equal(ref.budget.reserve_checked_at,'2026-08-30');
  assert.equal(ref.budget.reserve_live_verified,false);
  assert.equal(ref.budget.reserve_requires_in_game_check,true);
  assert.match(ref.summary,/Référence croisée au 30\/08\/2026/);
  assert.match(ref.summary,/Vérifie le coût actuel dans Last War/);
  assert.match(ref.confidence_label,/Confiance données/);
  log('Reference shop advice separates relevance, data confidence and unverified availability, with dated exact-price evidence');
}

// V2.5.19: recent user scan can raise evidence confidence but is still an observation, not official live availability.
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

// V2.5.19 Season lifecycle: unknown is not 0%, active keeps real 0%, ended/interseason disables S6 advice.
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

// V2.5.19 structured labels must exist in every explicit language.
{
  const keys=['alliance_invite_connect','alliance_invite_ready','alliance_invite_failed','alliance_invite_not_found','alliance_joined','alliance_already_joined','alliance_join_failed','alliance_owner_switch_blocked','vs_prep_day','vs_prep_focus','vs_prep_hold_rule','shop_relevance','shop_data_confidence','shop_availability','shop_availability_observed','shop_availability_unverified','shop_availability_official','season_state','season_state_auto','season_state_active','season_state_ended','season_state_interseason','season_unknown','season_ended_short','season_interseason','season_last_profession','season_wait_next','season_no_old_advice','season_confirm_state','season_interseason_note','season_ended_note','season_last_profession_short','beta_badge','beta_access_title','beta_consent_text','beta_consent_note','beta_signin_required','beta_invite_required','beta_allowlist_setup','beta_invited','beta_consent_required','beta_pro_included','beta_pro_free','beta_payment_disabled','beta_feedback_button','beta_feedback_title','beta_feedback_privacy','beta_feedback_share','vs_next_day1','auth_cloud_config_unreachable','auth_client_unavailable','auth_cloud_unreachable'];
  for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')){const tr=translator(code);for(const k of keys)assert.notEqual(tr(k),k,`${code} missing ${k}`)}
  log('All 23 explicit languages include V2.5.19 alliance and Sunday-prep labels');
}


// V2.5.19 source guards: no missing progress coercion, lifecycle UI and health flags are present.
{
  const app=read('app.js'),normal=read('lib/normalize.js'),health=read('api/health.js'),scan=read('api/scan.js'),idx=read('index.html');
  assert.doesNotMatch(normal,/progress_pct:clamp\(season\.progress_pct\|\|0/);
  assert.doesNotMatch(app,/Number\(s\.progress_pct\|\|0\)/);
  assert.match(idx,/seasonLifecycleSelect/);assert.match(scan,/lifecycle/);
  for(const flag of ['season_lifecycle_active_ended_interseason_unknown','missing_season_progress_never_zero','ended_season_disables_s6_advice','interseason_historical_profession_only','season_unknown_blocks_numeric_advice','season_manual_lifecycle_override'])assert.match(health,new RegExp(flag+':true'));
  log('Season lifecycle UI, scan contract and server health guards are present');
}

// V2.5.19 Season UI: historical labels are dynamic and localized; lifecycle engine remains V2.5.10-compatible.
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
    assert.notEqual(label,'season_last_profession_short',`${code} missing V2.5.19 historical profession label`);
    if(!code.startsWith('en')) assert.notEqual(label,enLabel,`${code} historical profession label is still English`);
  }
  assert.match(app,/function applyLanguage\(\).*render\(\)/s,'Language change must rerender dynamic Season labels');
  for(const flag of ['season_ui_historical_profession_label','season_ui_state_title_when_progress_not_applicable','season_ui_labels_23_languages']) assert.match(health,new RegExp(flag+':true'));
  log('Season UI switches Profession/Progress to historical profession/Season state for ended/inter-season in all 23 explicit languages');
}


// V2.5.19 private-beta privacy boundary: local/cloud state is preserved but never rendered signed out,
// for a non-invited account, or before beta consent.
{
  const app=read('app.js'),idx=read('index.html'),health=read('api/health.js');
  assert.match(app,/function betaPrivateDataVisible\(\)\{return Boolean\(cloudSession\?\.user\)&&betaAccessAllowed\(\)&&betaConsentAccepted\(\)\}/);
  assert.match(app,/if\(!reveal\)\{[\s\S]*?#playerMeta[\s\S]*?to_connect[\s\S]*?#allianceMeta[\s\S]*?—/);
  assert.match(app,/renderAccountFields\(\).*?reveal=betaPrivateDataVisible\(\)[\s\S]*?#fName[\s\S]*?value=""[\s\S]*?disabled=!reveal/s);
  assert.match(app,/function renderAdvice\(\)\{if\(!betaPrivateDataVisible\(\)\)/);
  assert.match(app,/function renderProvider\(\).*?reveal=betaPrivateDataVisible\(\)[\s\S]*?beta_signin_required/s);
  assert.match(app,/logoutBtn[\s\S]*?render\(\);renderAuth\(\);renderBeta\(\)/);
  assert.doesNotMatch(app,/removeItem\(STORE_KEY\)/,'Privacy masking must not delete the saved player state');
  assert.match(health,/signed_out_private_data_masked:true/);
  assert.match(health,/invited_without_consent_private_data_masked:true/);
  assert.match(health,/private_state_preserved_not_deleted:true/);
  assert.match(health,/cross_account_local_state_isolated:true/);
  assert.match(app,/ACCOUNT_STATE_PREFIX="warboost_account_state:"/);
  assert.match(app,/function safestLoginSeed\(userId,currentState\)/);
  assert.match(app,/owner===id\|\|!owner\|\|owner===localOwner/,'Only same-account or unclaimed legacy state may become a login seed');
  assert.match(app,/if\(oldOwner&&oldOwner!==localOwner&&oldOwner!==userId&&hasMeaningfulCore\(state\)\)rememberAccountState\(oldOwner,state\)/);
  assert.match(app,/state=loginSeed\?mergeState\(initialState\(\),loginSeed\):initialState\(\)/,'A different account without its own cache must start from an empty state');
  assert.doesNotMatch(app,/logoutBtn[\s\S]*?state\.player_id=clientId\(\)/,'Logout must keep the stored account owner so another account cannot claim it as legacy data');
  assert.match(app,/betaState=\{\.\.\.betaState,allowed:false,access_status:"checking"\}/,'Auth transitions must fail closed while the allowlist is rechecked');
  assert.match(app,/betaConsent[\s\S]*?render\(\);renderBeta\(\);renderPro\(\)/,'Consent changes must immediately rerender the privacy boundary');
  log('Signed-out, unconsented and cross-account beta sessions isolate private data without deleting saved state');
}

// V2.5.19 UI cleanup: no internal season lifecycle key, home tile shows inter-season state,
// and Sunday explicitly shows Monday Day 1 as the next VS scoring day.
{
  const app=read('app.js'),idx=read('index.html'),css=read('styles.css'),health=read('api/health.js');
  assert.match(idx,/id="seasonDesc"/);
  assert.match(app,/seasonLife==="interseason"\?t\("season_interseason"\)/);
  assert.match(app,/function adaptiveSeasonPhaseLabel/);
  assert.match(app,/phase==="interseason"\)return t\("season_interseason"\)/);
  assert.doesNotMatch(app,/t\(`season_phase_\$\{ctx\.season\.phase\}`\)/,'Internal season phase keys must not be rendered directly');
  assert.match(app,/vs_next_day1/);
  assert.match(css,/\.day\.next/);
  for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')) assert.notEqual(translator(code)('vs_next_day1'),'vs_next_day1',`${code} missing Sunday next-day label`);
  assert.match(health,/season_home_interseason_label:true/);
  assert.match(health,/pro_context_internal_season_key_hidden:true/);
  assert.match(health,/vs_sunday_next_monday_label:true/);
  log('Inter-season and Sunday-prep UI no longer exposes technical or misleading labels');
}



// V2.5.19 regression: EX explanations must match the real ranking and cover all five main heroes.
{
  const st=structuredClone(baseState);
  st.player_context={objective:'vs',server_profile:'auto'};
  st.vs={day:0,week:35,opponent:null,updated_at:now};
  st.season={number:6,name:'Saison 6',lifecycle:'interseason',profession:'Chef de guerre',updated_at:now};
  st.squads[0]={id:1,power:42.58,updated_at:now,needs_rescan:false,heroes:[
    hero('Carlie',150,5,8,5),hero('Lucius',150,5,8,1),hero('DVA',150,5,9,30),hero('Morrison',150,5,8,10),hero('Skyler',150,5,8,1)
  ]};
  const a=callAdvice('player',st,'fr-FR').body.analysis;
  assert.equal(a.exclusive_comparison.heroes.length,5);
  assert.deepEqual(new Set(a.exclusive_comparison.heroes.map(x=>x.hero)),new Set(['Carlie','Lucius','DVA','Morrison','Skyler']));
  const dva=a.exclusive_comparison.heroes.find(x=>x.hero==='DVA');
  assert.equal(dva.current,30);assert.equal(dva.status,'model_cap');assert.equal(dva.exclusive_rank,null);
  assert.equal(a.exclusive_comparison.exact_fragment_quantities,false);
  assert.equal(a.exclusive_comparison.fragment_cost_known,false);
  const exPriorities=a.priorities.filter(x=>x.kind==='exclusive');
  assert.ok(exPriorities.length>=2);
  const notes=exPriorities.map(x=>x.comparison_note);
  assert.equal(new Set(notes).size,notes.length,'Each selected EX hero must have a distinct rank-aware explanation');
  for(const x of exPriorities){
    const row=a.exclusive_comparison.heroes.find(r=>r.hero===x.hero);assert.ok(row?.exclusive_rank);
    assert.match(x.comparison_note,new RegExp(`n°${row.exclusive_rank}|rang|Classé`, 'i'));
    if(row.exclusive_rank>1)assert.doesNotMatch(x.comparison_note,/offre actuellement le meilleur compromis|currently has the best balance/i);
    assert.equal(x.fragment_cost_known,false);
  }
  assert.ok(notes.some(n=>/DVA.*EX30/i.test(n)),'The comparison must explain why capped DVA is not ranked for more EX spending');
  assert.equal(a.meta_intelligence.knowledge_date,'2026-08-30');
  assert.equal(a.meta_intelligence.air_main,true);
  assert.ok(a.meta_intelligence.evidence.some(x=>x.id==='reddit-ew-s6-a'));
  assert.ok(a.meta_intelligence.evidence.some(x=>x.id==='reddit-air-post-s6'));
  assert.ok(a.meta_intelligence.evidence.every(x=>x.verified===true&&/^https:\/\//.test(x.url)));
  assert.equal(a.meta_intelligence.policy,'verified-links-visible; topic-filtered-to-current-diagnostic; community-evidence-explanatory-only; account-data-drives-score');
  assert.ok(a.priorities.filter(x=>x.kind==='exclusive').every(x=>Number(x.meta_adjustment||0)===0),'Community evidence must not directly add opaque EX score points');
  log('PRO EX ranking explanations are consistent, five-hero complete, capped-safe and meta-dated');
}

// V2.5.19 regression: an unknown EX remains visible as missing; it is never silently invented.
{
  const st=structuredClone(baseState);
  st.squads[0]={...st.squads[0],heroes:[hero('Carlie',150,5,8,5),hero('Lucius',150,5,8,1),hero('DVA',150,5,9,null),hero('Morrison',150,5,8,10),hero('Skyler',150,5,8,1)]};
  st.exclusive_weapons=[];st.hero_progression=[];st.hero_profiles=[];
  const a=buildPlayerAnalysis(st,'fr-FR'),dva=a.exclusive_comparison.heroes.find(x=>x.hero==='DVA');
  assert.ok(dva);assert.equal(dva.current,null);assert.equal(dva.status,'missing');assert.match(dva.status_label,/vérifier/i);
  assert.equal(dva.marginal_value_score,null);assert.equal(dva.fragment_cost_known,false);
  log('Missing EX values stay explicit and cannot receive an invented score or fragment quantity');
}

// V2.5.19 regression: source evidence must be filtered to the active diagnostic domains.
{
  const st=structuredClone(baseState);
  st.player_context={objective:'vs',server_profile:'auto'};
  st.squads[0]={id:1,power:42.58,updated_at:now,needs_rescan:false,heroes:[
    hero('Carlie',150,5,8,5),hero('Lucius',150,5,8,1),hero('DVA',150,5,9,null),hero('Morrison',150,5,8,10),hero('Skyler',150,5,8,1)
  ]};
  st.exclusive_weapons=[];st.hero_progression=[];st.hero_profiles=[];
  const a=buildPlayerAnalysis(st,'fr-FR');
  assert.ok(a.priorities.some(x=>x.kind==='exclusive'));
  assert.deepEqual(a.meta_intelligence.topics,['exclusive']);
  assert.ok(a.meta_intelligence.source_count>0);
  assert.ok(a.meta_intelligence.evidence.every(x=>x.topic==='exclusive'));
  assert.ok(!a.meta_intelligence.evidence.some(x=>x.id==='official-drone-chests'));
  assert.ok(a.meta_intelligence.source_count<a.meta_intelligence.all_source_count);

  const exOnly=metaContext(st,{topics:['exclusive']});
  assert.ok(exOnly.evidence.every(x=>x.topic==='exclusive'));
  assert.ok(!exOnly.evidence.some(x=>x.topic==='drone'||x.topic==='gear'));
  const droneOnly=metaContext(st,{topics:['drone']});
  assert.deepEqual(droneOnly.evidence.map(x=>x.id),['official-drone-chests']);
  const gearOnly=metaContext(st,{topics:['gear']});
  assert.ok(gearOnly.evidence.length>0&&gearOnly.evidence.every(x=>x.topic==='gear'));
  const none=metaContext(st,{topics:[]});
  assert.equal(none.source_count,0);assert.equal(none.confidence,0);
  log('Meta source rows and source counts are topic-scoped to the current diagnostic');
}

// V2.5.19 UI: expose all-hero EX comparison and dated/source-typed meta evidence without claiming live meta.
{
  const app=read('app.js'),idx=read('index.html'),meta=read('lib/meta-intel.js'),health=read('api/health.js');
  for(const id of ['proExclusiveCompare','proMetaSources','inviteNote'])assert.match(idx,new RegExp(`id=["']${id}["']`));
  assert.match(app,/analysis\.exclusive_comparison/);assert.match(app,/analysis\.meta_intelligence/);assert.match(app,/meta_updated/);
  assert.match(app,/server_profile_insufficient/);
  assert.match(meta,/knowledge_date:'2026-08-30'/);assert.match(meta,/topic-filtered-to-current-diagnostic/);assert.match(meta,/never claims to browse Last War live/i);assert.match(meta,/official-drone-chests/);assert.match(meta,/bonus:0/);
  assert.doesNotMatch(read('api/advice.js'),/offre actuellement le meilleur compromis|currently has the best balance/i);
  for(const flag of ['exclusive_comparison_all_main_heroes','exclusive_rank_explanations_consistent','exclusive_model_cap_disclosed','exact_ex_fragment_quantities_never_invented','dated_meta_sources_visible','community_meta_secondary_to_account_data','meta_source_exact_urls_visible','community_meta_never_direct_score_bonus','official_meta_source_claim_scoped','meta_sources_topic_filtered','irrelevant_meta_sources_excluded_from_source_count'])assert.match(health,new RegExp(flag+':true'));
  log('UI and health contract expose explainable ranking and dated meta without live-source overclaiming');
}

// V2.5.19 labels are present in all explicit languages, including the safer VS/server/alliance copy.
{
  const keys=['pro_exclusive_compare','pro_meta_sources','server_profile_insufficient','ex_missing','ex_not_ranked','meta_adjustment','ex_exact_cost_unknown','ex_compare_unavailable','meta_updated','meta_source_count','meta_secondary_policy','meta_source_official','meta_source_guide','meta_source_community','unknown_opponent','invite_note'];
  for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')){const tr=translator(code);for(const k of keys)assert.notEqual(tr(k),k,`${code} missing V2.5.19 ${k}`);assert.match(tr('tagline'),/V2\.5\.19/)}
  assert.equal(translator('fr')('unknown_opponent'),'Adversaire non encore disponible');
  assert.match(translator('fr')('server_profile_insufficient'),/Données insuffisantes/);
  assert.match(translator('fr')('invite_note',{alliance:'ALL4'}),/espace WarBoost de l’alliance ALL4/);
  log('All 23 explicit languages include the V2.5.19 explainability and safer-context labels');
}


// V2.5.19 regression: Boutique IA consumes the exact current Diagnostic PRO EX ranking.
{
  const st=structuredClone(baseState);
  st.player_context={objective:'vs',server_profile:'auto'};
  st.vs={day:0,week:35,opponent:null,updated_at:now};
  st.season={number:6,name:'Saison 6',lifecycle:'interseason',profession:'Chef de guerre',updated_at:now};
  st.shop={store_type:'',currency:'diamonds',currency_balance:25000,offers:[],snapshots:[],updated_at:null};
  st.squads[0]={id:1,power:42.58,updated_at:now,needs_rescan:false,heroes:[
    hero('Carlie',150,5,8,5),hero('Lucius',150,5,8,1),hero('DVA',150,5,9,null),hero('Morrison',150,5,8,10),hero('Skyler',150,5,8,1)
  ]};
  st.exclusive_weapons=[];st.hero_progression=[];st.hero_profiles=[];
  const analysis=buildPlayerAnalysis(st,'fr-FR'),shop=buildShopAdvice(st,'fr-FR',analysis);
  const ranked=analysis.exclusive_comparison.heroes.filter(x=>x.exclusive_rank).sort((a,b)=>a.exclusive_rank-b.exclusive_rank);
  assert.ok(ranked.length>=3);assert.equal(ranked[0].hero,'Carlie');
  const ex=shop.recommendations.find(x=>x.category==='exclusive');assert.ok(ex);
  assert.equal(ex.target.split(' / ')[0].split(' EX')[0],ranked[0].hero,'Shop EX target #1 must be Diagnostic PRO EX #1');
  assert.match(ex.reason,new RegExp(ranked[0].hero));
  assert.equal(shop.needs.exclusive_urgency>=0,true);
  assert.match(shop.method,/diagnostic-pro-single-source-of-truth/);
  log('Boutique IA EX targets inherit the exact current Diagnostic PRO ranking');
}

// V2.5.19 beta regression: historical real-money references are quarantined from current paid-offer rankings.
{
  const st=structuredClone(baseState);st.shop={store_type:'',currency:'diamonds',currency_balance:25000,offers:[],snapshots:[],updated_at:null};
  const analysis=buildPlayerAnalysis(st,'fr-FR'),shop=buildShopAdvice(st,'fr-FR',analysis),g=shop.recommendation_groups;
  assert.ok(g&&Array.isArray(g.game_currency)&&Array.isArray(g.diamonds)&&Array.isArray(g.real_money)&&Array.isArray(g.historical_paid));
  assert.ok(g.game_currency.every(x=>x.purchase_type==='game_currency'));
  assert.ok(g.diamonds.every(x=>x.purchase_type==='diamonds'));
  assert.equal(g.real_money.length,0,'Dated reference-only cash offers must not appear as current real-money recommendations');
  assert.ok(g.historical_paid.length>=1,'Dated cash references must move to a historical verification group');
  for(const x of g.historical_paid){
    assert.equal(x.purchase_type,'real_money');assert.equal(x.historical_reference_paid,true);assert.equal(x.ranking_eligible,false);assert.equal(x.purchase_recommendation_eligible,false);
    assert.equal(x.score,null);assert.equal(x.relevance_score,null);assert.ok(Number.isFinite(Number(x.reference_relevance_score)));
    assert.equal(x.paid_guard.strong_recommendation_allowed,false);
    assert.equal(x.current_price_verified,false);assert.equal(x.current_contents_verified,false);assert.equal(x.cost_gain_verified,false);
    assert.match(x.price_label,/Prix observé le 26\/08\/2026/i);assert.match(x.price_label,/prix actuel non vérifié/i);
    assert.match(x.reason,/Offre référencée précédemment/i);assert.match(x.reason,/Rescanne la boutique/i);
    assert.doesNotMatch(x.reason,/Offre visible classée selon ton profil/i);
    assert.equal(x.verdict_key,'historical_paid');
  }
  assert.match(shop.method,/historical-paid-reference-quarantine/);
  log('Historical paid references are unranked and quarantined until current availability is confirmed');
}

// V2.5.19 regression: a scanned paid offer remains guarded until price, contents AND cost/gain are all current/verified.
{
  const makeState=(contents=false,costGain=false)=>{
    const st=structuredClone(baseState);
    st.shop={store_type:'Centre commercial · Super Pass Mensuel',currency:'EUR',currency_balance:null,updated_at:now,offers:[{item_name:'Pass Mensuel',category:'monthly_pass',price:21,currency:'EUR',updated_at:now,contents_verified:contents,cost_gain_verified:costGain}]};
    return st;
  };
  const blockedState=makeState(false,false),blockedAnalysis=buildPlayerAnalysis(blockedState,'fr-FR'),blockedShop=buildShopAdvice(blockedState,'fr-FR',blockedAnalysis),blocked=blockedShop.recommendations.find(x=>x.item==='Pass Mensuel');
  assert.ok(blockedShop.recommendation_groups.real_money.some(x=>x.item==='Pass Mensuel'));assert.equal(blockedShop.recommendation_groups.historical_paid.length,0);
  assert.ok(blocked);assert.equal(blocked.purchase_type,'real_money');assert.equal(blocked.current_price_verified,true);assert.equal(blocked.current_contents_verified,false);assert.equal(blocked.cost_gain_verified,false);assert.equal(blocked.paid_guard.strong_recommendation_allowed,false);assert.equal(blocked.verdict_key,'verify_paid');assert.match(blocked.reason,/prix actuel.*contenu actuel.*coût\/gain/i);
  const verifiedState=makeState(true,true),verifiedAnalysis=buildPlayerAnalysis(verifiedState,'fr-FR'),verified=buildShopAdvice(verifiedState,'fr-FR',verifiedAnalysis).recommendations.find(x=>x.item==='Pass Mensuel');
  assert.ok(verified);assert.equal(verified.current_price_verified,true);assert.equal(verified.current_contents_verified,true);assert.equal(verified.cost_gain_verified,true);assert.equal(verified.paid_guard.strong_recommendation_allowed,true);
  log('Real-money recommendation guard requires all three current evidence checks before strong advice is even eligible');
}

// V2.5.19 regression: gear-shop advice identifies a known target or explicitly says the target is unconfirmed.
{
  const st=structuredClone(baseState);st.shop={store_type:'',currency:'honor_medals',currency_balance:50000,offers:[],snapshots:[],updated_at:null};
  st.squads[0].heroes=st.squads[0].heroes.map((x,i)=>({...x,gear:i===0?20:40}));
  const analysis=buildPlayerAnalysis(st,'fr-FR'),shop=buildShopAdvice(st,'fr-FR',analysis),bp=shop.recommendations.find(x=>x.category==='blueprint');
  assert.ok(bp);assert.match(bp.target,/DVA|Carlie|Lucius|Morrison|Skyler|Escouade 1/);assert.match(bp.reason,/Cible équipement/i);
  const unknown=structuredClone(st);unknown.squads[0].heroes=unknown.squads[0].heroes.map(x=>({...x,gear:null}));const a2=buildPlayerAnalysis(unknown,'fr-FR'),s2=buildShopAdvice(unknown,'fr-FR',a2),bp2=s2.recommendations.find(x=>x.category==='blueprint');
  assert.ok(bp2);assert.match(bp2.target,/à confirmer/i);assert.match(bp2.reason,/non confirmée/i);
  log('Gear recommendations expose the actual target when known and disclose uncertainty otherwise');
}

// V2.5.19 UI/health/multilingual contract: beta players can distinguish historical paid references from current offers.
{
  const app=read('app.js'),css=read('styles.css'),health=read('api/health.js'),pkg=JSON.parse(read('package.json')),readme=read('README.md'),publisher=read('PUBLISHER_DEMO.md'),sw=read('sw.js');
  assert.equal(pkg.version,'2.5.19');assert.equal(pkg.name,'warboost-v2-private-beta');assert.equal(pkg.scripts.verify,'node scripts/verify-v2.5.19.mjs');
  assert.match(app,/historical_paid/);assert.match(app,/historical_reference_paid/);assert.match(app,/shop_group_paid_history/);assert.match(app,/displayRank=historicalPaid\?"—"/);
  assert.match(css,/\.shopHistoricalPaidCard/);assert.match(css,/\.shopHistoryGuard/);assert.match(sw,/warboost-v2-5-19-private-beta-player-safety/);
  for(const flag of ['shop_diagnostic_ex_single_source_of_truth','shop_payment_channels_separated','paid_offer_requires_current_price_contents_cost_gain','reference_cash_prices_dated_not_current','historical_paid_references_quarantined','historical_paid_references_unranked','current_paid_scan_required_for_current_offer_group','shop_gear_target_explicit_or_unconfirmed'])assert.match(health,new RegExp(flag+':true'));
  const keys=['shop_group_game','shop_group_diamonds','shop_group_paid','shop_group_paid_history','shop_group_unknown','shop_paid_guard','shop_history_guard'];
  for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')){const tr=translator(code);for(const key of keys)assert.notEqual(tr(key),key,`${code} missing V2.5.19 ${key}`);assert.match(tr('tagline'),/V2\.5\.19/)}
  assert.match(readme,/joueurs invités à la bêta privée/i);assert.match(readme,/private-beta/);assert.match(publisher,/Publisher Demo.*V2\.5\.19/is);
  log('All 23 explicit languages and beta release docs separate historical paid references from current paid offers');
}

console.log('\nWarBoost V2.5.19 verification: PASS');
