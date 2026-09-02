import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPublisherDemoState,PUBLISHER_CONTACT_CONTEXT,PUBLISHER_DEMO_VERSION,buildPublisherScanState} from '../lib/publisher-demo.js';
import {buildPlayerAnalysis,buildShopAdvice,buildAllianceAdvice,buildVsAdvice,buildSeasonAdvice,buildSevenDayPlan,buildCrossDomain} from '../api/advice.js';
import adviceHandler from '../api/advice.js';
import scanHandler from '../api/scan.js';
import healthHandler from '../api/health.js';
import stateHandler from '../api/state.js';
import syncHandler from '../api/sync.js';
import inviteHandler from '../api/invite.js';
import joinHandler from '../api/join.js';
import roleHandler from '../api/alliance-role.js';
import ingestHandler from '../api/ingest.js';
import cronHandler from '../api/cron-sync.js';
import proHandler from '../api/pro.js';
import cloudConfigHandler from '../api/cloud-config.js';
import {HERO_CATALOG} from '../lib/heroes.js';
import {LANGUAGES,translator} from '../i18n.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const log=(x)=>console.log(`✓ ${x}`);
function mockRes(){return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(x){this.body=x;return this}}}

const state=buildPublisherDemoState('2026-09-02T16:00:00.000Z');
assert.equal(PUBLISHER_DEMO_VERSION,'2.5.22');
assert.equal(state.sync.provider_kind,'publisher-demo');
assert.equal(state.sync.sources.official,false);
assert.equal(state.season.profession,'engineer');
assert.equal(state.season.name,'publisher-demo-season');
assert.equal(state.squads.length,4);assert.equal(state.alliance.role,'R5');assert.equal(state.alliance.members.length,8);
log('Anonymized local publisher fixture is complete and official connector is disabled');

const player=buildPlayerAnalysis(state,'en-GB');
assert.equal(player.focus_squad,1);assert.equal(player.exclusive_comparison.heroes.length,5);
const dva=player.exclusive_comparison.heroes.find(x=>x.hero==='DVA');assert.ok(dva);assert.equal(dva.current,null);assert.equal(dva.status,'missing');assert.equal(dva.marginal_value_score,null);
assert.equal(player.exclusive_comparison.exact_fragment_quantities,false);
assert.equal(buildSevenDayPlan(state,player).days.length,7);assert.ok(buildCrossDomain(state,'en-GB',player));
log('Diagnostic PRO keeps DVA unknown and never invents exact EX quantities');

const shop=buildShopAdvice(state,'en-GB',player);assert.ok(shop.recommendations.length>=8);assert.equal(shop.recommendation_groups.real_money.length,0);assert.ok(shop.recommendation_groups.historical_paid.length>=1);
for(const x of shop.recommendation_groups.historical_paid){assert.equal(x.ranking_eligible,false);assert.equal(x.purchase_recommendation_eligible,false);assert.equal(x.score,null)}
const ranked=player.exclusive_comparison.heroes.filter(x=>x.exclusive_rank).sort((a,b)=>a.exclusive_rank-b.exclusive_rank);assert.match(shop.recommendations.find(x=>x.category==='exclusive').target,new RegExp(ranked[0].hero));
log('Shop remains aligned with Diagnostic PRO and historical paid offers stay non-current');

assert.ok(buildAllianceAdvice(state,'en-GB').immediate_actions.length);assert.equal(buildVsAdvice(state,'en-GB').opponent,'DEMO');assert.equal(buildSeasonAdvice(state,'en-GB').lifecycle,'active');
log('Alliance, VS and Season engines return usable sample output');

{const req={method:'POST',body:{scope:'player',state,publisher_demo:true,locale:'en-GB'},headers:{}};const res=mockRes();await adviceHandler(req,res);assert.equal(res.statusCode,200);assert.equal(res.body?.ok,true);assert.match(res.body.engine,/2\.5\.22/);assert.equal(res.body.publisher_demo,true);assert.equal(res.body.data_origin,'anonymized-sample');assert.equal(res.body.live_lastwar_data,false)}
{const req={method:'POST',body:{scan_type:'drone',image_data_url:'data:image/png;base64,AA=='},headers:{}};const res=mockRes();await scanHandler(req,res);assert.equal(res.statusCode,200);assert.equal(res.body.publisher_demo,true);assert.equal(res.body.image_processed,false);assert.equal(res.body.engine,'publisher-demo-simulation')}
assert.equal(buildPublisherScanState('drone','2026-09-02T16:00:00.000Z').drone.level,157);
log('Publisher API provenance is explicit and scan never performs external vision processing');

{const req={method:'GET',body:{},headers:{}};const res=mockRes();await healthHandler(req,res);assert.equal(res.statusCode,200);assert.equal(res.body.version,'2.5.22');assert.equal(res.body.mode,'publisher-demo-final-candidate');assert.equal(res.body.database_access,'none');assert.equal(res.body.lastwar_official_access,'pending-approval');assert.equal(res.body.vision,'publisher-demo-local-simulation-no-external-processing');assert.equal(res.body.safeguards.private_beta_badge,false);assert.equal(res.body.safeguards.publisher_demo_distinct_from_private_beta,true);assert.equal(res.body.safeguards.publisher_demo_scan_stays_in_browser,true)}
log('Health endpoint performs no publisher cloud probe and clearly separates Publisher Demo from Private Beta');


// Server-side read-only lockdown: direct endpoint testing cannot create cloud writes, payments or external Last War access.
{
  let res=mockRes();await stateHandler({method:'GET',body:{},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.publisher_demo,true);assert.equal(res.body.read_only,true);assert.equal(res.body.state.player.name,'WarBoost Demo Player');
  res=mockRes();await stateHandler({method:'POST',body:{state},headers:{}},res);assert.equal(res.statusCode,403);assert.equal(res.body.error,'publisher_demo_read_only');
}
{
  let res=mockRes();await syncHandler({method:'POST',body:{state},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.publisher_demo,true);assert.equal(res.body.official_connector,false);assert.equal(res.body.live_lastwar_data,false);
  res=mockRes();await inviteHandler({method:'POST',body:{},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.simulated,true);assert.equal(res.body.cloud_write,false);assert.equal(res.body.invite_code,'DEMO-R5');
  res=mockRes();await joinHandler({method:'POST',body:{invite_code:'DEMO-R5'},headers:{}},res);assert.equal(res.statusCode,403);assert.equal(res.body.cloud_write,false);
  res=mockRes();await roleHandler({method:'POST',body:{},headers:{}},res);assert.equal(res.statusCode,403);assert.equal(res.body.role_write,false);
  res=mockRes();await ingestHandler({method:'POST',body:{},headers:{}},res);assert.equal(res.statusCode,403);assert.equal(res.body.cloud_write,false);
  res=mockRes();await cronHandler({method:'GET',body:{},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.skipped,true);assert.equal(res.body.updated,0);
  res=mockRes();await proHandler({method:'GET',query:{},body:{},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.payments_enabled,false);assert.equal(res.body.checkout_enabled,false);
  res=mockRes();await proHandler({method:'POST',query:{},body:{},headers:{}},res);assert.equal(res.statusCode,403);assert.equal(res.body.checkout_enabled,false);
  res=mockRes();cloudConfigHandler({method:'GET',query:{},body:{},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.configured,false);assert.equal(res.body.cloud_writes,false);assert.equal(res.body.url,'');assert.equal(res.body.key,'');
}
log('All publisher server endpoints are read-only/simulated; no cloud writes, checkout or browser Supabase credentials are available');

assert.equal(HERO_CATALOG.length,31);assert.equal(LANGUAGES.filter(([c])=>c!=='auto').length,23);
const required=['tagline','publisher_release_label','publisher_demo_data','publisher_sample_desc','publisher_request_title','publisher_readonly_title','publisher_readonly_desc','publisher_noauto_title','publisher_noauto_desc','publisher_connector_title','publisher_connector_desc','publisher_local_only_note','publisher_scan_privacy','publisher_profession_engineer','publisher_sources_note','publisher_shop_note','publisher_no_payment_note','publisher_invite_note','publisher_import_note','publisher_scan_done','publisher_invite_status','publisher_import_done','publisher_reset_done','publisher_member_singular'];
for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')){const t=translator(code);for(const key of required){assert.notEqual(t(key),key,`${code}:${key}`);assert.ok(String(t(key)).trim().length>=1,`${code}:${key}`)}assert.match(t('tagline'),/V2\.5\.22/);assert.doesNotMatch(t('tagline'),/private beta|bêta privée|プライベートベータ/i)}
assert.match(translator('ja')('publisher_release_label'),/パブリッシャー/);assert.match(translator('zh')('publisher_sample_desc'),/Last War/);assert.match(translator('fr')('publisher_profession_engineer'),/Ingénieur/);
log('All 23 explicit languages + Auto have publisher-specific safety copy; Japanese no longer says Private Beta');

const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),scan=read('api/scan.js'),pubui=read('publisher-ui.js'),pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest')),sw=read('sw.js'),norm=read('lib/normalize.js');
assert.match(app,/APP_VERSION="2\.5\.22"/);assert.match(app,/buildPublisherScanState/);assert.match(app,/publisher_scan_done/);assert.match(app,/if\(PUBLISHER_DEMO_MODE\)\{const now=new Date\(\)\.toISOString\(\),sample=buildPublisherScanState/);assert.match(app,/canManage=!PUBLISHER_DEMO_MODE/);assert.match(app,/publisher_member_singular/);assert.match(app,/publisher_import_done/);assert.match(app,/publisher_invite_status/);
assert.match(html,/WarBoost V2\.5\.22 — Publisher Demo Final Candidate/);assert.match(html,/data-i18n="publisher_sample_desc"/);assert.match(html,/data-i18n="publisher_noauto_title"/);assert.match(html,/id="vsSampleNote"/);assert.match(html,/id="scanPrivacy"/);assert.doesNotMatch(html,/id="betaAccessSection"/);assert.doesNotMatch(html,/id="feedbackDrawer"/);assert.doesNotMatch(html,/プライベートベータ/);
assert.doesNotMatch(pubui,/Reset publisher demo data|Publisher demo data reset|Publisher reset failed/);
assert.match(health,/mode:"publisher-demo-final-candidate"/);assert.match(health,/private_beta_badge:false/);assert.match(health,/publisher_demo_scan_stays_in_browser:true/);assert.match(scan,/image_processed:false/);
assert.equal(pkg.name,'warboost-v2-publisher-demo');assert.equal(pkg.version,'2.5.22');assert.match(manifest.name,/V2\.5\.22 Publisher Demo Final Candidate/);assert.match(sw,/warboost-v2-5-22-publisher-demo-final/);assert.match(norm,/version:\s*["']2\.5\.22["']/);
log('Static final-candidate contract removes player-beta UI, misleading live wording and duplicate English publisher statuses');

assert.equal(PUBLISHER_CONTACT_CONTEXT.subject,'WarBoost – Official Last War Data & API Permission Request');assert.equal(PUBLISHER_CONTACT_CONTEXT.status,'awaiting-written-authorization');assert.ok(PUBLISHER_CONTACT_CONTEXT.commitments.includes('no gameplay automation'));
log('Official request context is preserved without inventing approval or a Last War reply');

const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).sort();assert.equal(apiFiles.length,12);for(const file of apiFiles)assert.ok(pkg.scripts.check.includes(`node --check api/${file}`),`${file} missing from npm run check`);assert.ok(pkg.scripts.check.includes('node --check lib/publisher-demo.js'));
log('All 12 serverless APIs remain syntax-covered');
console.log('\nWarBoost V2.5.22 Publisher Demo Final Candidate verification: PASS');
