import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPublisherDemoState,PUBLISHER_CONTACT_CONTEXT,PUBLISHER_DEMO_VERSION} from '../lib/publisher-demo.js';
import {buildPlayerAnalysis,buildShopAdvice,buildAllianceAdvice,buildVsAdvice,buildSeasonAdvice,buildSevenDayPlan,buildCrossDomain} from '../api/advice.js';
import adviceHandler from '../api/advice.js';
import scanHandler from '../api/scan.js';
import {HERO_CATALOG} from '../lib/heroes.js';
import {LANGUAGES,translator} from '../i18n.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const log=(x)=>console.log(`✓ ${x}`);
function mockRes(){return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(x){this.body=x;return this}}}

const state=buildPublisherDemoState('2026-09-02T16:00:00.000Z');
assert.equal(PUBLISHER_DEMO_VERSION,'2.5.21');
assert.equal(state.sync.provider_kind,'publisher-demo');
assert.equal(state.player.name,'WarBoost Demo Player');
assert.equal(state.squads.length,4);
assert.equal(state.alliance.role,'R5');
assert.ok(state.alliance.members.length>=6);
assert.equal(state.sync.sources.official,false);
log('Anonymized publisher fixture is complete, local-only and official-source disabled');

const player=buildPlayerAnalysis(state,'en-GB');
assert.equal(player.focus_squad,1);
assert.ok(player.priorities.length>=3);
assert.equal(player.exclusive_comparison.heroes.length,5);
const dva=player.exclusive_comparison.heroes.find(x=>x.hero==='DVA');
assert.ok(dva);assert.equal(dva.current,null);assert.equal(dva.status,'missing');assert.equal(dva.marginal_value_score,null);
assert.equal(player.exclusive_comparison.exact_fragment_quantities,false);
const plan=buildSevenDayPlan(state,player);assert.equal(plan.days.length,7);assert.equal(plan.exact_quantities,false);
const cross=buildCrossDomain(state,'en-GB',player);assert.ok(cross);
log('Player PRO diagnostic works; DVA missing EX stays unknown and exact quantities are never invented');

const shop=buildShopAdvice(state,'en-GB',player);
assert.ok(shop.recommendations.length>=8);
assert.ok(shop.recommendation_groups.game_currency.length>=3);
assert.ok(shop.recommendation_groups.diamonds.length>=1);
assert.ok(shop.recommendation_groups.historical_paid.length>=1);
assert.equal(shop.recommendation_groups.real_money.length,0);
for(const x of shop.recommendation_groups.historical_paid){assert.equal(x.ranking_eligible,false);assert.equal(x.purchase_recommendation_eligible,false);assert.equal(x.score,null)}
const ranked=player.exclusive_comparison.heroes.filter(x=>x.exclusive_rank).sort((a,b)=>a.exclusive_rank-b.exclusive_rank);
const exShop=shop.recommendations.find(x=>x.category==='exclusive');assert.ok(exShop);assert.match(exShop.target,new RegExp(ranked[0].hero));
log('Shop advisor stays aligned with Diagnostic PRO and quarantines historical paid references');

const alliance=buildAllianceAdvice(state,'en-GB');assert.ok(alliance.immediate_actions.length>=1);assert.ok(alliance.immediate_actions.flatMap(x=>x.members||[]).length>=4);
const vs=buildVsAdvice(state,'en-GB');assert.ok(vs.priorities.length>=1);assert.equal(vs.opponent,'DEMO');
const season=buildSeasonAdvice(state,'en-GB');assert.equal(season.lifecycle,'active');assert.ok(season.priorities.length>=1);
log('Alliance R5/R4, VS and Season engines all return usable publisher-demo output');

// API advice publisher bypass is compute-only and requires explicit publisher fixture marker.
{
  const req={method:'POST',body:{scope:'player',state,publisher_demo:true,locale:'en-GB'},headers:{}};const res=mockRes();await adviceHandler(req,res);
  assert.equal(res.statusCode,200);assert.equal(res.body?.ok,true);assert.match(res.body.engine,/2\.5\.21/);
}
// Scan publisher route is a disclosed simulation and must not call external vision.
{
  const req={method:'POST',body:{publisher_demo:true,scan_type:'drone',image_data_url:'data:image/png;base64,AA=='},headers:{}};const res=mockRes();await scanHandler(req,res);
  assert.equal(res.statusCode,200);assert.equal(res.body.publisher_demo,true);assert.equal(res.body.image_processed,false);assert.equal(res.body.engine,'publisher-demo-simulation');assert.equal(res.body.state.drone.level,157);
}
log('Publisher API paths work without login while scan remains a disclosed non-external simulation');

assert.equal(HERO_CATALOG.length,31);
assert.equal(LANGUAGES.filter(([c])=>c!=='auto').length,23);
for(const [code] of LANGUAGES.filter(([c])=>c!=='auto'))assert.match(translator(code)('tagline'),/V2\.5\.21/);
log('31 canonical heroes and 23 explicit languages + Auto are preserved');

const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),scan=read('api/scan.js'),advice=read('api/advice.js'),pub=read('lib/publisher-demo.js'),pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest')),sw=read('sw.js');
assert.match(app,/APP_VERSION="2\.5\.21"/);
assert.match(app,/PUBLISHER_DEMO_MODE/);
assert.match(app,/warboost_publisher_demo_state_v2521/);
assert.match(app,/if\(PUBLISHER_DEMO_MODE\)return true/);
assert.match(app,/Publisher sandbox: official Last War synchronization is intentionally disabled/);
assert.match(app,/Publisher sandbox: alliance invitation writes are disabled/);
assert.match(app,/publisher_demo:PUBLISHER_DEMO_MODE/);
assert.match(app,/!PUBLISHER_DEMO_MODE&&!cloudSession\?\.access_token/);
assert.match(html,/WarBoost V2\.5\.21 — Publisher Demo RC/);
assert.match(html,/ANONYMIZED SAMPLE DATA/);
assert.match(html,/Official request submitted/);
assert.match(html,/Read-only · player-authorized/);
assert.match(html,/No gameplay automation/);
assert.match(html,/Connector disabled pending approval/);
assert.match(html,/publisherSandboxAuth/);
assert.match(html,/Reset publisher demo data/);
assert.doesNotMatch(html,/>BETA PRIVÉE</);
assert.match(health,/mode:"publisher-demo-rc-approval-first"/);
for(const flag of ['publisher_demo_anonymized_sample_data','publisher_demo_no_login_required','publisher_demo_no_cloud_writes','publisher_demo_external_scan_disabled','publisher_demo_scan_simulation_disclosed','publisher_demo_official_connector_disabled_until_written_authorization','publisher_demo_no_payment_checkout','unauthorized_source_default'])assert.match(health,new RegExp(flag+':(?:true|false)'));
assert.match(health,/unauthorized_source_default:false/);
assert.match(scan,/publisher-demo-simulation/);assert.match(scan,/image_processed:false/);
assert.match(advice,/publisherDemo/);
assert.match(pub,/awaiting-written-authorization/);
assert.equal(pkg.name,'warboost-v2-publisher-demo');assert.equal(pkg.version,'2.5.21');
assert.match(manifest.name,/V2\.5\.21 Publisher Demo RC/);assert.match(sw,/warboost-v2-5-21-publisher-demo-rc/);
assert.match(html,/id=[\"']betaAccessSection[\"'][^>]*class=[\"'][^\"']*hidden/);
assert.doesNotMatch(html,/id=[\"']proTitle[\"'][^>]*data-i18n=[\"']beta_pro_title/);
assert.doesNotMatch(html,/id=[\"']proPrice[\"'][^>]*data-i18n=[\"']beta_pro_free/);

log('Static publisher contract: no login, no cloud writes, no payment, no unauthorized connector, visible sample disclosure');

assert.equal(PUBLISHER_CONTACT_CONTEXT.subject,'WarBoost – Official Last War Data & API Permission Request');
assert.equal(PUBLISHER_CONTACT_CONTEXT.status,'awaiting-written-authorization');
assert.ok(PUBLISHER_CONTACT_CONTEXT.commitments.includes('no gameplay automation'));
log('Publisher contact context records the submitted official request without inventing a Last War reply');

const normalizedSource=read('lib/normalize.js');assert.match(normalizedSource,/version:\s*["']2\.5\.21["']/);
log('Normalized publisher state metadata is aligned to V2.5.21');

const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).sort();assert.equal(apiFiles.length,12);
for(const file of apiFiles)assert.ok(pkg.scripts.check.includes(`node --check api/${file}`),`${file} missing from npm run check`);
assert.ok(pkg.scripts.check.includes('node --check lib/publisher-demo.js'));
log('All 12 serverless API functions remain syntax-covered');

console.log('\nWarBoost V2.5.21 Publisher Demo RC verification: PASS');
