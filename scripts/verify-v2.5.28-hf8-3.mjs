import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {mergeVsState,scoreKnown,vsSituation,vsTrend,personalVsPosition,vsDecisionEngine} from '../lib/vs-live.js';
import {buildVsAdvice} from '../api/advice.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),app=read('app.js'),advice=read('api/advice.js'),health=read('api/health.js'),sw=read('sw.js'),pkg=JSON.parse(read('package.json'));

// HF8.3 visible UI: decision first, raw leaderboard secondary/collapsed.
assert.match(html,/WarBoost V2\.5\.28 HF8\.[34]/);
for(const id of ['vsDecisionSection','vsUrgencyPill','vsDecisionAction','vsDecisionReason','vsDecisionUse','vsDecisionKeep','vsDecisionRescan','vsDecisionRisk','vsUrgency','vsVisibleRankingSection','vsVisibleRanking'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(html,/<details[^>]+id=["']vsVisibleRankingSection["']/);
assert.match(html,/vs_ranking_secondary/);
assert.match(app,/vsDecisionEngine/);assert.match(app,/renderVsDecision/);assert.match(app,/vsDecisionLabel/);assert.match(app,/vsUrgencyLabel/);
assert.doesNotMatch(html,/class=["'][^"']*vsStat[^"']*["'][^>]*>\s*<span[^>]*data-i18n=["']vs_personal_position["']/i);

// Real user scan regression: a large lead must produce SAVE, not rank chasing.
const sample={source:'scan',updated_at:'2026-09-10T18:15:00.000Z',week:37,day:4,theme:'Former des Héros',time_remaining_text:'07:29:18',time_remaining_seconds:26958,our_server_id:'884',our_tag:'ALL4',our_alliance:'ALL FOR 1',opponent_server_id:'872',opponent_tag:'Mep',opponent:'Fire and Brimstone',our_score:1440270940,their_score:667494056,our_percent:68,their_percent:32,personal_name:'les gladiateurs81',personal_rank:3,personal_score:43195000,score_confirmed:true,leaderboard:[{rank:1,alliance_tag:'ALL4',player_name:'benja12',score:63942208},{rank:2,alliance_tag:'ALL4',player_name:'Cyril°68°',score:53395524},{rank:3,alliance_tag:'ALL4',player_name:'les gladiateurs81',score:43195000},{rank:4,alliance_tag:'Mep',player_name:'Guntracker',score:40107747},{rank:5,alliance_tag:'ALL4',player_name:'Coliva',score:39371231}]};
let state=mergeVsState({},sample);
const sit=vsSituation(state),pos=personalVsPosition(state),d1=vsDecisionEngine(state);
assert.equal(sit.status,'strong_lead');assert.equal(sit.gap,772776884);assert.equal(pos.rank,3);assert.equal(pos.gap_to_next,10200524);
assert.equal(d1.decision,'save');assert.equal(d1.urgency,'low');assert.equal(d1.rescan_minutes,45);assert.equal(d1.risk,'no_trend');
const frAdvice=buildVsAdvice({vs:state,updated_at:sample.updated_at},'fr-FR',{now:new Date('2026-09-10T20:00:00.000Z')});
assert.equal(frAdvice.live_decision.decision_key,'save');
assert.match(frAdvice.advice,/Décision\s*:\s*ÉCONOMISER/);
assert.match(frAdvice.advice,/classement brut reste secondaire/i);
assert.doesNotMatch(frAdvice.advice,/10[,. ]?2\s*M.*Cyril|chasse.*rang|écart vers le rang supérieur/i);

// Second scan: opponent scores faster, but catch-up is projected after the event => no false emergency.
state=mergeVsState(state,{...sample,source:'scan',updated_at:'2026-09-10T18:45:00.000Z',our_score:1500270940,their_score:747494056,time_remaining_seconds:25158});
const trend=vsTrend(state),d2=vsDecisionEngine(state);
assert.equal(trend.elapsed_seconds,1800);assert.equal(trend.our_gain,60000000);assert.equal(trend.their_gain,80000000);assert.equal(trend.momentum,'theirs');
assert.equal(d2.risk,'opponent_catchup_after_end');assert.equal(d2.decision,'save');assert.equal(d2.urgency,'low');assert.equal(d2.rescan_minutes,30);assert.ok(d2.eta_seconds>18*3600&&d2.eta_seconds<19*3600);

// A real comeback threat before the end must switch to PROTECT / critical.
let threat=mergeVsState({}, {...sample,updated_at:'2026-09-10T18:00:00.000Z',our_score:1000000000,their_score:850000000,time_remaining_seconds:14400});
threat=mergeVsState(threat,{...sample,source:'scan',updated_at:'2026-09-10T18:30:00.000Z',our_score:1020000000,their_score:970000000,time_remaining_seconds:12600});
const dt=vsDecisionEngine(threat);assert.equal(dt.risk,'opponent_catchup_before_end');assert.equal(dt.decision,'protect');assert.equal(dt.urgency,'critical');assert.equal(dt.rescan_minutes,10);assert.ok(dt.eta_seconds<7200);

// Trailing cases use actual score/time, not visible-player rank.
const trailing={day:4,score_confirmed:true,our_score:600000000,their_score:900000000,time_remaining_seconds:10800,personal_rank:1,personal_score:90000000};
const d3=vsDecisionEngine(trailing);assert.equal(d3.situation,'strong_trail');assert.equal(d3.decision,'push_hard');assert.equal(d3.urgency,'critical');
const late=vsDecisionEngine({...trailing,time_remaining_seconds:3300});assert.equal(late.decision,'push_hard');assert.equal(late.urgency,'critical');assert.equal(late.rescan_minutes,5);
const unknown=vsDecisionEngine({our_score:0,their_score:0});assert.equal(unknown.known,false);assert.equal(unknown.decision,'scan');assert.equal(unknown.risk,'score_unknown');

// Advice keeps HF8.2 compatibility while exposing the new decision engine.
assert.match(advice,/warboost-vs-decision-ai-v/);assert.match(advice,/warboost-vs-live-ai-v/);assert.match(advice,/vsDecisionEngine\(v,\{now:decisionNow\}\)/);
assert.match(advice,/R5\/R4 should coordinate confirmed contributors|R5\/R4 doivent coordonner les contributeurs confirmés/);
assert.doesNotMatch(advice,/Ne chasse pas ce rang|Gap to next rank|Écart vers le rang supérieur/);

// All explicit languages resolve decision-first labels; Safe Launch wording is unambiguous.
for(const item of LANGUAGES.filter(x=>x.code!=='auto')){
  const t=translator(item.code);
  for(const key of ['vs_decision_engine','vs_recommended_action','vs_use_now','vs_keep_now','vs_next_scan','vs_comeback_risk','vs_decision_save','vs_decision_protect','vs_urgency_critical','vs_ranking_secondary','safe_external_disabled'])assert.notEqual(t(key),key,`${item.code} missing ${key}`);
}
const fr=translator('fr');assert.match(fr('safe_external_disabled'),/Accès Last War désactivé/i);assert.match(fr('safe_external_disabled'),/Safe Launch actif/i);assert.doesNotMatch(fr('safe_external_disabled'),/^Désactivé\s*·\s*Safe Launch$/i);

// Release/service worker metadata and hard constraints.
assert.match(sw,/hf8-3-vs-decision-engine/);assert.match(health,/(?:ui_revision|previous_ui_revision):"hf8\.(?:3-vs-decision-engine|4-alliance-lifecycle-reliability|5-vs-freshness-guard)"/);assert.match(health,/vs_decision_engine:true/);assert.match(health,/vs_ranking_secondary:true/);assert.match(health,/safe_launch_status_wording_unambiguous:true/);
assert.match(pkg.description,/HF8\.[34]/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf8-3\.mjs/);
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12,'serverless API function budget must remain 12');
assert.doesNotMatch(app,/localStorage\.clear\s*\(/);assert.doesNotMatch(app,/WARBOOST_PUBLIC_LASTWAR_URL|LASTWAR_API_KEY/);
const hf83Migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?3/i.test(x));assert.equal(hf83Migrations.length,0,'HF8.3 must not add a Supabase migration');

// Basic DOM integrity: no duplicate IDs.
const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];assert.deepEqual(duplicates,[],`duplicate HTML ids: ${duplicates.join(', ')}`);

console.log('WarBoost V2.5.28 HF8.3 VS Decision Engine verification: PASS');
