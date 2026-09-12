import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {vsDecisionEngine,vsSnapshotFreshness,vsSituation} from '../lib/vs-live.js';
import {buildVsAdvice} from '../api/advice.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),app=read('app.js'),health=read('api/health.js'),sw=read('sw.js'),pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest'));

// Real screenshot supplied by the tester on 2026-09-11 around 22:06 CEST.
const realNow=new Date('2026-09-11T20:06:07.000Z');
const realVs={
  theme:'Mobilisation Totale',score_confirmed:true,
  our_server_id:'884',our_tag:'ALL4',our_alliance:'ALL FOR 1',
  opponent_server_id:'872',opponent_tag:'MEP',opponent:'Fire and Brimstone',
  our_score:821407081,their_score:508264286,our_percent:62,their_percent:38,
  time_remaining_text:'05:53:55',time_remaining_seconds:5*3600+53*60+55,
  updated_at:'2026-09-11T20:06:07.000Z'
};
const realFresh=vsSnapshotFreshness(realVs,{now:realNow});
assert.equal(realFresh.current,true,'today real VS fixture must be accepted as current');
const realSit=vsSituation(realVs);
assert.equal(realSit.gap,313142795,'real ALL4/Mep gap must be exact');
assert.ok(realSit.our_share>61&&realSit.our_share<63,'real score share must remain about 62%');
const realDecision=vsDecisionEngine(realVs,{now:realNow});
assert.equal(realDecision.stale,false);assert.equal(realDecision.ended,false);assert.equal(realDecision.decision,'save');assert.equal(realDecision.urgency,'low');
assert.equal(realDecision.time_remaining_seconds,21235);

// Yesterday's screenshot must NEVER drive today's live card, timer, trend or spending advice.
const staleVs={...realVs,our_score:1580000000,their_score:815687526,time_remaining_text:'00:00:00',time_remaining_seconds:0,updated_at:'2026-09-10T20:06:07.000Z',snapshots:[
  {...realVs,week:37,day:4,our_score:1440270940,their_score:667494056,updated_at:'2026-09-10T19:20:00.000Z'},
  {...realVs,week:37,day:4,our_score:1580000000,their_score:815687526,updated_at:'2026-09-10T20:06:07.000Z'}
]};
const staleFresh=vsSnapshotFreshness(staleVs,{now:realNow});assert.equal(staleFresh.current,false);assert.equal(staleFresh.status,'stale');
const staleDecision=vsDecisionEngine(staleVs,{now:realNow});
assert.equal(staleDecision.stale,true);assert.equal(staleDecision.ended,false,'old 0h00 must not imply today ended');assert.equal(staleDecision.decision,'scan');assert.equal(staleDecision.urgency,'unknown');assert.equal(staleDecision.trend,null);assert.equal(staleDecision.eta_seconds,null);assert.equal(staleDecision.time_remaining_seconds,null);assert.equal(staleDecision.risk,'stale_snapshot');

// A genuinely current 0h00 scan still uses the safe ended state from HF8.4.
const endedToday={...realVs,time_remaining_text:'00:00:00',time_remaining_seconds:0,updated_at:'2026-09-11T20:06:07.000Z'};
const ended=vsDecisionEngine(endedToday,{now:realNow});assert.equal(ended.stale,false);assert.equal(ended.ended,true);assert.equal(ended.decision,'ended');assert.equal(ended.rescan_minutes,0);assert.equal(ended.trend,null);

// Server-side advice refuses stale live recommendations too.
const staleForApi={...staleVs,updated_at:new Date(Date.now()-30*3600*1000).toISOString(),day:5,week:37};
const staleAdvice=buildVsAdvice({vs:staleForApi,updated_at:new Date().toISOString()},'fr-FR');
assert.equal(staleAdvice.live_decision.stale,true);assert.equal(staleAdvice.live_decision.decision_key,'scan');assert.equal(staleAdvice.score_gap,null);assert.equal(staleAdvice.time_remaining_seconds,null);assert.equal(staleAdvice.trend,null);assert.match(staleAdvice.advice,/ancien|scanne|scan du jour/i);assert.doesNotMatch(staleAdvice.advice,/second scan est nécessaire|deuxième scan est nécessaire/i);

// UI: stale score cannot remain labelled live; pending account details must open when present.
assert.match(html,/WarBoost V2\.5\.28 HF8\.(?:5|6)/);assert.match(html,/id=["']vsLiveSituationTitle["']/);
for(const token of ['vsSnapshotFreshness','vs_stale_notice','vs_status_stale','vs_last_scan_stale','pendingDetails.open=pending.length>0'])assert.match(app,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(app,/liveKnown=known&&freshness\.current/);assert.match(app,/\$\("#vsRemaining"\)\.textContent=stale\?"—"/);assert.match(app,/\$\("#vsGap"\)\.textContent=liveKnown\?/);

// Every explicit UI language has all HF8.5 stale-data safeguards.
const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
for(const [code] of explicit){const tr=translator(code);for(const key of ['vs_stale_title','vs_status_stale','vs_stale_notice','vs_reason_stale','vs_use_stale','vs_keep_stale','vs_rescan_stale','vs_risk_stale','vs_last_scan_stale'])assert.notEqual(tr(key),key,`${code} missing ${key}`)}

// Release metadata and non-regression guard rails.
assert.match(health,/ui_revision:"hf8\.5-vs-freshness-guard"/);
for(const guard of ['vs_current_server_day_required_for_live','vs_stale_scan_history_only','vs_stale_scan_blocks_spend_projection_and_timer','vs_real_fixture_2026_09_11_all4_mep_guard','alliance_pending_identity_details_auto_open'])assert.match(health,new RegExp(`${guard}:true`));
assert.match(sw,/hf8-5-vs-freshness-guard/);assert.match(pkg.description,/HF8\.(?:5|6)/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf8-5\.mjs/);assert.match(manifest.name,/HF8\.(?:5|6)/);
assert.match(health,/safe_launch_no_scraping:true/);assert.match(health,/safe_launch_no_gameplay_automation:true/);assert.match(health,/beta_payments_disabled:true/);
assert.doesNotMatch(app,/localStorage\.clear\s*\(/);assert.doesNotMatch(app,/WARBOOST_PUBLIC_LASTWAR_URL|LASTWAR_API_KEY/);
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
const migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?5/i.test(x));assert.equal(migrations.length,0,'HF8.5 must not add a Supabase migration');
const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];assert.deepEqual(duplicates,[],`duplicate HTML ids: ${duplicates.join(', ')}`);

console.log('WarBoost V2.5.28 HF8.5 VS Freshness Guard verification: PASS');
