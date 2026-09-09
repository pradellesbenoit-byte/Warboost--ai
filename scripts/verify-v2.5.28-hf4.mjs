import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPlayerAnalysis,buildVsAdvice} from '../api/advice.js';
import {PLAYER_ACTIVITY_EVENT_TYPES,LEGACY_ACTIVITY_EVENT_TYPES,parseParticipationImport,normalizeActivityEvent,participationSummaryByType} from '../lib/activity-events.js';
import {classifyAllianceMember} from '../lib/alliance-activity.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const log=x=>console.log(`HF4 ✓ ${x}`);
const now='2026-09-08T20:30:00.000Z';
const hero=(name,exclusive=10,power=6)=>({name,level:150,stars:5,power,exclusive,gear:'4 équipements niv.40'});
const emptySquad=(id,heroes)=>({id,name:`Squad ${id}`,power:40+id,updated_at:now,needs_rescan:false,heroes});

// R5/R4 event management: explicit event families, statuses and sources.
{
  for(const type of ['vs','alliance_exercise','zombie_siege','desert_storm','canyon_storm','ghost_ops','city_war','season_war','marauder'])assert.ok(PLAYER_ACTIVITY_EVENT_TYPES.includes(type),type);
  for(const legacy of ['zombie','alliance_event','war','season'])assert.ok(LEGACY_ACTIVITY_EVENT_TYPES.includes(legacy),legacy);
  const parsed=parseParticipationImport('Joueur01;2026-09-08;desert_storm;participated\nJoueur02;2026-09-08;canyon;absent\nJoueur03;2026-09-08;marshal;non_selectionne\nJoueur04;2026-09-08;ghost;excuse',{now});
  assert.equal(parsed.errors.length,0);assert.equal(parsed.rows.length,4);
  assert.deepEqual(parsed.rows.map(x=>x.participation_status),['participated','absent_confirmed','not_selected','excused']);
  assert.ok(parsed.rows.every(x=>x.source==='r5_r4_import'));
  const summary=participationSummaryByType(parsed.rows,{nowMs:Date.parse(now),days:30});
  assert.equal(summary.total.participated,1);assert.equal(summary.total.absent_confirmed,1);assert.equal(summary.total.not_selected,1);assert.equal(summary.total.excused,1);
  log('R5/R4 participation import separates participated / absent / not-selected / excused with source evidence');
}

// Missing or negative participation never auto-labels inactivity.
{
  const absent=normalizeActivityEvent({event_type:'desert_storm',event_date:'2026-09-08',participation_status:'absent_confirmed',source:'r5_r4_import',updated_at:now});
  const unknown=normalizeActivityEvent({event_type:'canyon_storm',event_date:'2026-09-08',participation_status:'unknown',source:'r5_r4_import',updated_at:now});
  assert.notEqual(classifyAllianceMember({name:'A',activity_events:[absent]},Date.parse(now)).key,'inactive');
  assert.notEqual(classifyAllianceMember({name:'B',activity_events:[unknown]},Date.parse(now)).key,'inactive');
  assert.notEqual(classifyAllianceMember({name:'C'},Date.parse(now)).key,'inactive');
  log('Absence/unknown/missing event data is never converted into automatic inactivity');
}

const airState={
  version:'2.5.28',updated_at:now,player:{name:'Air',role:'R4',hq_level:30,power_m:219},player_context:{objective:'vs',server_profile:'auto'},
  drone:{level:157,power_m:8.84,updated_at:now},technology:{updated_at:now},shop:{offers:[],snapshots:[]},sync:{last_sync:now,sources:{scan:true,alliance:true}},
  squads:[
    emptySquad(1,[hero('Carlie',5),hero('Lucius',1),hero('Morrison',10),hero('DVA',23),hero('Skyler',1)]),
    emptySquad(2,[hero('Murphy',10),hero('Williams',10),hero('Kimberly',20),hero('Marshall',10),hero('Stetmann',10)]),
    emptySquad(3,[hero('Adam',10),hero('Violet',10),hero('Tesla',20),hero('Sarah',10),hero('Mason',10)]),
    {id:4,name:'Squad 4',power:null,heroes:[]}
  ],hero_profiles:[],hero_progression:[],exclusive_weapons:[],vs:{day:2,week:37,opponent:null,updated_at:now},season:{number:6,name:'S6',lifecycle:'interseason',profession:'Chef de guerre',updated_at:now},alliance:{tag:'ALL4',members:[]}
};

// Personalized ranking belongs to this player's selected main squad; only TOP 3 cards are exposed.
{
  const a=buildPlayerAnalysis(airState,'fr-FR');
  assert.equal(a.focus_squad,1);assert.ok(a.priorities.length<=3);assert.equal(a.exclusive_comparison.heroes.length,5);
  assert.deepEqual(new Set(a.exclusive_comparison.heroes.map(x=>x.hero)),new Set(['Carlie','Lucius','Morrison','DVA','Skyler']));
  assert.match(a.decision_model,/this player’s selected main squad/i);
  const targetSet=new Set(['Carlie','Lucius','Morrison','DVA','Skyler']);
  for(const x of a.priorities.filter(x=>['exclusive','level','stars','gear'].includes(x.kind)))assert.ok(targetSet.has(x.hero),`foreign hero target ${x.hero}`);
  const firstEx=a.priorities.find(x=>x.kind==='exclusive');if(firstEx)assert.match(firstEx.action,/Priorité principale actuelle/);
  const later=a.priorities.filter(x=>x.kind==='exclusive'&&x.rank>1);for(const x of later)assert.match(x.action,/Deuxième priorité|Troisième priorité/);
  log('Diagnostic remains personalized to the player’s own main squad with TOP 3 cards only and hierarchical EX actions');
}

// Equal rounded EX scores expose the actual previous-rank tie relationship in the five-hero comparison.
{
  const a=buildPlayerAnalysis(airState,'fr-FR'),rows=a.exclusive_comparison.heroes.filter(x=>x.exclusive_rank).sort((a,b)=>a.exclusive_rank-b.exclusive_rank);
  const tied=rows.find((x,i)=>i>0&&Math.round(Number(x.marginal_value_score))===Math.round(Number(rows[i-1].marginal_value_score)));
  assert.ok(tied,'fixture must exercise an EX tie');assert.equal(tied.tie_with_previous,true);assert.ok(tied.tie_with_hero);assert.deepEqual(tied.tie_break_basis,['severity','roi','impact']);assert.equal(tied.status_label,'Comparé');
  log('Equal EX scores disclose previous-rank tie-break basis instead of hiding the ordering');
}

// A different main squad must never inherit the Air player's hero ranking.
{
  const tank=structuredClone(airState);tank.player={...tank.player,name:'Tank'};tank.squads[0]=emptySquad(1,[hero('Murphy',5),hero('Williams',10),hero('Kimberly',18),hero('Marshall',10),hero('Stetmann',5)]);
  const a=buildPlayerAnalysis(tank,'fr-FR'),own=new Set(['Murphy','Williams','Kimberly','Marshall','Stetmann']);
  assert.deepEqual(new Set(a.exclusive_comparison.heroes.map(x=>x.hero)),own);
  for(const x of a.priorities.filter(x=>x.hero&&['exclusive','level','stars','gear'].includes(x.kind)))assert.ok(own.has(x.hero));
  assert.ok(!a.exclusive_comparison.heroes.some(x=>['Carlie','Lucius','Morrison','DVA','Skyler'].includes(x.hero)));
  log('Tank player receives only Tank-main-squad hero evaluation; Air ranking is not inherited');
}

// VS Day 2 is explicit and actionable: Today / Keep / Avoid, including Day 3 + Day 4 preparation.
{
  const v=buildVsAdvice(airState,'fr-FR');assert.equal(v.day,2);assert.deepEqual(v.priorities.map(x=>x.kind),['today','keep','avoid']);
  assert.match(v.priorities[0].text,/Jour 2 · Expansion de base/);assert.match(v.priorities[1].text,/Jour 3/);assert.match(v.priorities[1].text,/Jour 4/);assert.match(v.priorities[2].text,/Évite/);assert.equal(v.opponent,null);
  log('VS Day 2 provides explicit Today / Keep / Avoid preparation without inventing an opponent');
}

// UI + language + health contract for HF4.
{
  const html=read('index.html'),app=read('app.js'),health=read('api/health.js'),sw=read('sw.js');
  for(const id of ['eventImportText','eventImportBtn','eventImportStatus','allianceParticipationTable'])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(html,/WarBoost V2\.5\.28 HF[45]/);assert.match(app,/renderAllianceParticipationTable/);assert.match(app,/PLAYER_ACTIVITY_EVENT_TYPES/);assert.match(sw,/warboost-v2-5-28-(?:hf4-final-management-ai|hf5-lastwar-identity-link)/);assert.match(health,/build:"(?:hf4-final-management-ai|hf5-lastwar-identity-link)"/);
  for(const flag of ['player_specific_main_squad_ranking','exclusive_equal_score_previous_rank_tiebreak_explained','alliance_event_management_30_day_history','alliance_participation_statuses_distinct','alliance_missing_participation_never_means_absence','alliance_r5_r4_participation_import','vs_today_keep_avoid_plan'])assert.match(health,new RegExp(`${flag}:true`));
  for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')){const tr=translator(code);for(const key of ['event_desert_storm','event_canyon_storm','participation_participated','participation_absent_confirmed','participation_not_selected','participation_excused','participation_import_title','participation_player_history','ex_tie_previous'])assert.notEqual(tr(key),key,`${code} missing ${key}`);assert.match(tr('tagline'),/V2\.5\.28 HF[45]/)}
  const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
  log('HF4 UI, 23-language labels, health safeguards, cache key and 12-function budget are present');
}

console.log('\nWarBoost V2.5.28 HF4 Final Management AI verification: PASS');
