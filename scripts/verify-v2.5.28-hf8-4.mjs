import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {applyRosterImportLifecycle,confirmRosterDeparture,rosterLifecycleKey} from '../lib/alliance-roster-lifecycle.js';
import {replaceCanonicalRosterFromCompleteSnapshot} from '../lib/alliance-scope.js';
import {allianceParticipationByEvent} from '../lib/alliance-participation-insights.js';
import {vsDecisionEngine} from '../lib/vs-live.js';
import {buildVsAdvice} from '../api/advice.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),app=read('app.js'),health=read('api/health.js'),sync=read('api/sync.js'),sw=read('sw.js'),pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest'));
const ctx={server_id:'884',alliance_tag:'ALL4'};
const m=(name,role,extra={})=>({name,role,...ctx,...extra});
const t1='2026-09-11T18:00:00.000Z',t2='2026-09-11T18:10:00.000Z',t3='2026-09-11T18:20:00.000Z';

// Complete roster = explicit lifecycle authority, never an automatic departure.
const existing=[m('les gladiateurs81','R4'),m('Joueur B','R3'),m('Joueur C','R2')];
const complete=[m('Nono 50','R5'),m('les gladiateurs81','R4'),m('Joueur B','R2')];
let life=applyRosterImportLifecycle({members:existing,review:[],former:[]},complete,{complete:true,now:t1});
assert.equal(life.members.length,3,'adding R5 while one member is missing must not create an artificial +1 active total');
assert.equal(life.members.find(x=>x.name==='Nono 50')?.role,'R5','R5 displayed separately in Last War must be accepted in the complete roster');
assert.equal(life.review.length,1,'missing member from complete snapshot must go to review');
assert.equal(life.review[0].name,'Joueur C');
assert.equal(life.former.length,0,'missing member must never be auto-confirmed as departed');
assert.ok(life.members.find(x=>x.name==='Joueur B')?.membership_history?.some(x=>x.type==='role_changed'&&x.from_role==='R3'&&x.to_role==='R2'),'rank change must be historized');

// Departure needs R5/R4 confirmation; return reactivates the same history.
const cKey=rosterLifecycleKey(life.review[0]);
const left=confirmRosterDeparture({review:life.review,former:life.former},cKey,{now:t2});
assert.equal(left.changed,true);assert.equal(left.review.length,0);assert.equal(left.former.length,1);
assert.ok(left.former[0].membership_history.some(x=>x.type==='left_confirmed'));
life=applyRosterImportLifecycle({members:life.members,review:left.review,former:left.former},[m('Joueur C','R3')],{complete:false,now:t3});
assert.equal(life.former.length,0);assert.ok(life.members.some(x=>x.name==='Joueur C'));
const returned=life.members.find(x=>x.name==='Joueur C');
assert.ok(returned.membership_history.some(x=>x.type==='left_confirmed'),'departure history must survive return');
assert.ok(returned.membership_history.some(x=>x.type==='returned'),'return must be historized');

// Partial import remains additive: a missing row changes nothing about membership.
const partial=applyRosterImportLifecycle({members:[m('A','R4'),m('B','R3')],review:[],former:[]},[m('A','R4')],{complete:false,now:t1});
assert.deepEqual(partial.members.map(x=>x.name).sort(),['A','B']);assert.equal(partial.review.length,0);assert.equal(partial.former.length,0);

// Server canonical complete replacement may shrink, but exact member participation evidence survives.
const evidence={event_type:'vs',event_date:'2026-09-11',participation_status:'participated',source:'player_self_report',updated_at:t1};
const canonical=replaceCanonicalRosterFromCompleteSnapshot([m('A','R4'),m('B','R3',{activity_events:[evidence]})],[m('B','R2')],{serverId:'884',allianceTag:'ALL4'});
assert.equal(canonical.length,1);assert.equal(canonical[0].name,'B');assert.equal(canonical[0].role,'R2');assert.equal(canonical[0].activity_events.length,1);assert.equal(canonical[0].activity_events[0].participation_status,'participated');

// Unknown participation is explicit per active member/event, never converted to absence/inactivity.
const members=[m('A','R4',{activity_events:[evidence]}),m('B','R3'),m('C','R2')];
const rollup=allianceParticipationByEvent(members,{nowMs:Date.parse('2026-09-11T20:00:00Z'),days:30});
assert.equal(rollup.by_event.vs.participated,1);assert.equal(rollup.by_event.vs.absent_confirmed,0);assert.equal(rollup.by_event.vs.unknown_members,2);
assert.equal(rollup.by_event.desert_storm.unknown_members,3);assert.equal(rollup.by_event.desert_storm.absent_confirmed,0);

// VS at exactly 0h00 is a final state: no spending recommendation, no rescan, no trend prompt.
const endedVs={day:4,theme:'Former des Héros',score_confirmed:true,our_score:1500000000,their_score:740000000,time_remaining_seconds:0,updated_at:t1,snapshots:[{day:4,week:37,our_score:1400000000,their_score:600000000,score_confirmed:true,updated_at:'2026-09-11T17:30:00.000Z'},{day:4,week:37,our_score:1500000000,their_score:740000000,score_confirmed:true,updated_at:t1}]};
const ended=vsDecisionEngine(endedVs);assert.equal(ended.ended,true);assert.equal(ended.decision,'ended');assert.equal(ended.rescan_minutes,0);assert.equal(ended.risk,'event_ended');assert.equal(ended.trend,null);
const endedAdvice=buildVsAdvice({vs:endedVs,updated_at:t1},'fr-FR');assert.equal(endedAdvice.live_decision.decision_key,'ended');assert.equal(endedAdvice.live_decision.rescan_minutes,0);assert.equal(endedAdvice.trend,null);assert.match(endedAdvice.advice,/VS TERMINÉ|terminée/i);assert.match(endedAdvice.advice,/aucune dépense|aucun.*scan|Évite tout nouveau scan/i);assert.doesNotMatch(endedAdvice.advice,/second scan est nécessaire|deuxième scan est nécessaire/i);

// HF8.4 UI/reliability guards.
assert.match(html,/WarBoost V2\.5\.28 HF8\.4/);assert.match(html,/id=["']rosterFullSnapshot["']/);assert.match(html,/data-i18n=["']import_roster_help["'][^>]*>[^<]*R5/i);assert.doesNotMatch(html,/Nono 50/);
for(const token of ['roster_review_title','former_members_title','identity_retry_match','participation_unknown_members_guard','vs_no_rescan_ended'])assert.match(app,new RegExp(token));
assert.match(app,/allianceParticipationByEvent/);assert.match(app,/confirmRosterDeparture/);assert.match(app,/restoreRosterReviewMember/);
assert.match(sync,/roster_snapshot_complete_at/);assert.match(sync,/replaceCanonicalRosterFromCompleteSnapshot/);assert.doesNotMatch(sync,/roster_updated_at\|\|ctx\.alliance\?\.updated_at/);

// Every explicit UI language contains the new safety labels.
const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
for(const [code] of explicit){const tr=translator(code);for(const key of ['roster_full_snapshot_label','roster_review_title','roster_review_departed','former_members_title','identity_retry_match','participation_unknown_members_guard','vs_decision_ended','vs_no_rescan_ended'])assert.notEqual(tr(key),key,`${code} missing ${key}`)}

// Release metadata, Safe Launch and regressions.
assert.match(health,/ui_revision:"hf8\.4-alliance-lifecycle-reliability"/);
for(const guard of ['alliance_complete_roster_snapshot_explicit','alliance_missing_complete_snapshot_member_review_not_departure','alliance_departure_requires_r5_r4_confirmation','alliance_former_member_history_preserved','alliance_return_reactivates_history','alliance_role_change_history','alliance_r5_separate_lastwar_header_supported','alliance_unknown_event_member_count_visible','alliance_unlinked_account_exact_match_retry','vs_zero_time_final_state_no_spend_or_rescan','vs_ended_suppresses_second_scan'])assert.match(health,new RegExp(`${guard}:true`));
assert.match(sw,/hf8-4-alliance-lifecycle-reliability/);assert.match(sw,/alliance-roster-lifecycle\.js/);assert.match(pkg.description,/HF8\.4/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf8-4\.mjs/);assert.match(manifest.name,/HF8\.4/);
assert.match(health,/safe_launch_no_scraping:true/);assert.match(health,/safe_launch_no_gameplay_automation:true/);assert.match(health,/beta_payments_disabled:true/);
assert.doesNotMatch(app,/localStorage\.clear\s*\(/);assert.doesNotMatch(app,/WARBOOST_PUBLIC_LASTWAR_URL|LASTWAR_API_KEY/);
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
const hf84Migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?4/i.test(x));assert.equal(hf84Migrations.length,0,'HF8.4 must not add a Supabase migration');
const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];assert.deepEqual(duplicates,[],`duplicate HTML ids: ${duplicates.join(', ')}`);

console.log('WarBoost V2.5.28 HF8.4 Alliance Lifecycle Reliability verification: PASS');
