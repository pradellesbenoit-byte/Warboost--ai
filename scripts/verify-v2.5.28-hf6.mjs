import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {playerParticipationInsight,allianceParticipationOverview} from '../lib/alliance-participation-insights.js';
import {linkCurrentPlayerIdentityIntoRoster} from '../lib/alliance-identity.js';
import {REVIEWED_GAME_UPDATE} from '../lib/game-update.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const log=x=>console.log(`HF6 ✓ ${x}`);
const now='2026-09-09T16:30:00.000Z',nowMs=Date.parse(now);
const event=(type,date,status='participated',source='player_self_report')=>({event_type:type,event_date:date,participation_status:status,confirmed:status==='participated',confirmed_at:status==='participated'?now:null,updated_at:now,source});

// Evidence summary is factual and never infers inactivity from missing records.
{
  const member={name:'les gladiateurs81',warboost_linked:true,activity_events:[
    event('vs','2026-09-09'),event('vs','2026-09-08'),event('desert_storm','2026-09-07','absent_confirmed','r5_r4_import'),event('alliance_exercise','2026-09-06','not_selected','r5_r4_import'),event('zombie_siege','2026-09-05','excused','r5_r4_import')
  ]};
  const insight=playerParticipationInsight(member,{nowMs,days:30});
  assert.equal(insight.total.participated,2);assert.equal(insight.total.absent_confirmed,1);assert.equal(insight.total.not_selected,1);assert.equal(insight.total.excused,1);
  assert.equal(insight.latest_participation_date,'2026-09-09');assert.equal(insight.by_type.find(x=>x.event_type==='vs').counts.participated,2);
  assert.equal(insight.evidence_key,'confirmed');
  const empty=playerParticipationInsight({name:'NoData',warboost_linked:true,activity_events:[]},{nowMs,days:30});assert.equal(empty.evidence_key,'insufficient');assert.equal(empty.records.length,0);
  log('player details expose dates/status/source/counts while missing data remains insufficient, never inactive');
}

// Management summary counts only explicit evidence and linked coverage.
{
  const members=[
    {name:'A',warboost_linked:true,activity_events:[event('vs','2026-09-09'),event('desert_storm','2026-09-08','absent_confirmed','r5_r4_import')]},
    {name:'B',warboost_linked:true,activity_events:[]},
    {name:'C',warboost_linked:false,activity_events:[event('zombie_siege','2026-09-08','excused','r5_r4_import')]}
  ];
  const o=allianceParticipationOverview(members,{nowMs,days:30});
  assert.equal(o.total_members,3);assert.equal(o.linked,2);assert.equal(o.known_members,2);assert.equal(o.linked_known_members,1);assert.equal(o.linked_without_evidence,1);assert.equal(o.confirmed_absences,1);assert.equal(o.excused,1);assert.equal(o.participated_records,1);
  log('R5/R4 summary separates roster linking, known evidence, explicit absences and missing evidence');
}

// Exact Last War identity still carries player events into the existing roster without inflation.
{
  const roster=[{name:'les gladiateurs81',role:'R4',server_id:'884',alliance_tag:'ALL4'},{name:'Autre',role:'R3',server_id:'884',alliance_tag:'ALL4'}];
  const linked=linkCurrentPlayerIdentityIntoRoster(roster,{playerId:'private-auth-id',name:'les gladiateurs81',serverId:'884',allianceTag:'ALL4',activityEvents:[event('vs','2026-09-09')],updatedAt:now});
  assert.equal(linked.status,'linked_exact');assert.equal(linked.members.length,2);assert.equal(linked.members[0].warboost_linked,true);assert.equal(linked.members[0].activity_events.length,1);
  assert.equal(Object.hasOwn(linked.members[0],'email'),false);
  log('nickname + server + alliance remains the identity key; no roster inflation and no e-mail identity field');
}

// Current public game watch is reviewed, informational only and season rumors remain blocked.
{
  assert.equal(REVIEWED_GAME_UPDATE.version,'1.0.362');assert.equal(REVIEWED_GAME_UPDATE.released_on,'2026-09-09');assert.equal(REVIEWED_GAME_UPDATE.reviewed_on,'2026-09-09');assert.equal(REVIEWED_GAME_UPDATE.meta_impact,'informational-only');assert.equal(REVIEWED_GAME_UPDATE.confirmed_hero_meta_change,false);assert.equal(REVIEWED_GAME_UPDATE.season7_status,'not-activated-from-rumors');
  log('game watch refreshed to 1.0.362 without inventing hero/meta/Season 7 impact');
}

// Runtime/UI player-ready contract.
{
  const app=read('app.js'),html=read('index.html'),css=read('styles.css'),health=read('api/health.js'),sw=read('sw.js'),pkg=JSON.parse(read('package.json'));
  assert.match(html,/WarBoost V2\.5\.28 HF[67]/);assert.match(html,/id="allianceParticipationManagementSummary"/);assert.match(app,/allianceParticipationOverview/);assert.match(app,/playerParticipationInsight/);assert.match(app,/participationHistoryRow/);assert.match(app,/participationEvidenceLabel/);
  for(const cls of ['participationManagementSummary','participationPlayerCard','participationEventDetail','participationHistoryRow'])assert.match(css,new RegExp(`\\.${cls}`));
  assert.match(health,/build:"(?:hf6-player-ready-final|hf7-server-alliance-invite-gate)"/);
  for(const flag of ['alliance_player_detail_dates_counts_sources','alliance_management_evidence_summary','alliance_management_never_infers_inactivity_from_missing_participation','alliance_participation_insight_labels_evidence_only','latest_game_update_1_0_362_reviewed_2026_09_09'])assert.match(health,new RegExp(`${flag}:true`));
  assert.match(sw,/warboost-v2-5-28-(?:hf6-player-ready-final|hf7-server-alliance-invite-gate)/);assert.match(sw,/\/lib\/alliance-participation-insights\.js/);
  const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);assert.match(pkg.scripts.check,/alliance-participation-insights\.js/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf6\.mjs/);
  log('HF6 UI/cache/health/test contract is player-ready while preserving the 12 serverless-function budget');
}

// Every explicit language gets the new management copy and current game-watch copy.
{
  const explicit=LANGUAGES.filter(([c])=>c!=='auto');assert.equal(explicit.length,23);
  const keys=['participation_management_title','participation_management_linked','participation_management_evidence','participation_management_missing','participation_management_absences','participation_management_guard','participation_evidence_confirmed','participation_evidence_no_conclusion','participation_evidence_insufficient','participation_last_participation','participation_last_known','participation_known_records','participation_recent_history','participation_evidence_guard','game_update_title','game_update_note'];
  const en=translator('en-GB');
  for(const [code] of explicit){const tr=translator(code);for(const key of keys){assert.notEqual(tr(key),key,`${code} missing ${key}`);if(!code.startsWith('en'))assert.notEqual(tr(key),en(key),`${code} still inherits English HF6 copy for ${key}`)}assert.match(tr('tagline'),/V2\.5\.28 HF[67]/)}
  log('23 explicit languages resolve HF6 management and game-watch copy without English leakage');
}

console.log('\nWarBoost V2.5.28 HF6 Player-Ready Final verification: PASS');
