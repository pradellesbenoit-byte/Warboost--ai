import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ACTIVITY_EVENT_TYPES,activityEventId,normalizeActivityEvent,mergeActivityEvents,confirmedActivityEvents,activityEventEvidence,eventCountsByType} from '../lib/activity-events.js';
import {classifyAllianceMember,summarizeAllianceActivity} from '../lib/alliance-activity.js';
import {normalizeState,mergeNewest} from '../lib/normalize.js';
import {mergeCloudRosterPreservingManual,mergeCurrentPlayerActivityIntoRoster} from '../lib/alliance-roster-merge.js';
import {S6_AWAKENING_HEROES,S6_AWAKENING_MIN_STARS,S6_AWAKENING_MIN_EX,S6_AWAKENING_UNLOCK_SHARDS,awakeningReadiness,awakeningDecisionScore,heroReshapeDecisionValue,season6TechPriorities,awakeningSwapAssessment} from '../lib/season6-awakening.js';
import {seasonLifecycle,seasonIsActive,activeSeasonProgress,repairSeasonState} from '../lib/season-lifecycle.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const log=x=>console.log(`PASS: ${x}`);
const nowMs=Date.parse('2026-09-07T16:00:00.000Z');

// Exactly the six agreed low-friction confirmations. No screenshot is required by this data model.
{
  assert.deepEqual([...ACTIVITY_EVENT_TYPES],['vs','zombie','marauder','alliance_event','war','season']);
  for(const type of ACTIVITY_EVENT_TYPES){
    const id=activityEventId(type,'2026-09-07');
    assert.equal(id,`2026-09-07:${type}`);
    const row=normalizeActivityEvent({type,date:'2026-09-07',confirmed:true,updated_at:'2026-09-07T15:00:00Z'});
    assert.equal(row.source,'player_self_report');
    assert.equal(row.confirmed,true);
  }
  log('Exactly six one-tap player-declared event types are supported');
}

// Removing a confirmation creates a newer tombstone. An older cloud copy cannot resurrect it.
{
  const oldConfirm={event_type:'vs',event_date:'2026-09-07',confirmed:true,confirmed_at:'2026-09-07T10:00:00Z',updated_at:'2026-09-07T10:00:00Z'};
  const newerRemove={event_type:'vs',event_date:'2026-09-07',confirmed:false,updated_at:'2026-09-07T11:00:00Z'};
  const merged=mergeActivityEvents([newerRemove],[oldConfirm]);
  assert.equal(merged.length,1);assert.equal(merged[0].confirmed,false);assert.equal(merged[0].confirmed_at,null);
  assert.equal(confirmedActivityEvents(merged,{nowMs,days:7}).length,0);
  const state=mergeNewest(normalizeState({player_id:'p1',activity_events:[newerRemove]}),{activity_events:[oldConfirm]});
  assert.equal(state.activity_events[0].confirmed,false,'old cloud confirmation must not resurrect a newer local removal');
  log('Activity tombstones beat stale cloud confirmations');
}

// A recent player confirmation is positive activity evidence, but still explicitly self-reported.
{
  const event={event_type:'marauder',event_date:'2026-09-07',confirmed:true,confirmed_at:'2026-09-07T15:00:00Z',updated_at:'2026-09-07T15:00:00Z'};
  const e=activityEventEvidence([event],nowMs);assert.equal(e.count,1);assert.deepEqual(e.types,['marauder']);assert.ok(e.latest_hours<=2);
  const a=classifyAllianceMember({name:'Alpha',activity_events:[event]},nowMs);
  assert.equal(a.key,'active');assert.equal(a.reason,'recent_event_confirmation');assert.equal(a.confidence,'high');
  assert.equal(a.eventEvidence.rows[0].source,'player_self_report');
  log('Recent one-tap event confirmation can confirm activity without claiming official Last War telemetry');
}

// Missing confirmation alone can NEVER mean inactive.
{
  assert.notEqual(classifyAllianceMember({name:'NoData'},nowMs).key,'inactive');
  assert.equal(classifyAllianceMember({name:'NoData'},nowMs).key,'unknown');
  const stale='2026-08-20T12:00:00Z';
  const row=classifyAllianceMember({name:'Old',updated_at:stale,last_active_at:stale,delta_m:0,vs_points:0},nowMs);
  assert.notEqual(row.key,'inactive');assert.equal(row.key,'refresh');
  log('No confirmation and stale data never become an automatic inactivity verdict');
}

// Declared Last War rank and verified WarBoost management permission are separate fields.
{
  const s=normalizeState({player_id:'p1',player:{name:'Alpha',role:'R5'},alliance:{role:'R1',management_verified:false,members:[{player_id:'p1',name:'Alpha',role:'R5',management_role:'R1'}]}});
  assert.equal(s.player.role,'R5');
  assert.equal(s.alliance.management_verified,false);
  assert.equal(s.alliance.role,'R1');
  assert.equal(s.alliance.members[0].role,'R5');
  assert.equal(s.alliance.members[0].management_role,'R1');
  log('Self-declared R1-R5 rank is preserved without granting WarBoost management permission');
}

// Regression from real Preview: a freshly confirmed event must immediately reach the authenticated player's roster row.
{
  const old=[{player_id:'p1',name:'Alpha',role:'R4',activity_events:[],updated_at:'2026-09-07T14:00:00Z'}];
  const cloud=mergeCloudRosterPreservingManual(old,[{player_id:'p1',name:'Alpha',role:'R4',activity_events:[],updated_at:'2026-09-07T14:00:00Z'}]);
  const fresh={event_type:'vs',event_date:'2026-09-07',confirmed:true,confirmed_at:'2026-09-07T15:30:00Z',updated_at:'2026-09-07T15:30:00Z'};
  const roster=mergeCurrentPlayerActivityIntoRoster(cloud,{playerId:'p1',name:'Alpha',activityEvents:[fresh],updatedAt:'2026-09-07T15:31:00Z'});
  assert.equal(roster.length,1);assert.equal(roster[0].activity_events[0].confirmed,true);
  assert.equal(eventCountsByType(roster[0].activity_events,{nowMs,days:7}).vs,1);
  assert.equal(classifyAllianceMember(roster[0],nowMs).key,'active');
  const untouched=mergeCurrentPlayerActivityIntoRoster([{player_id:'p2',name:'Bravo',activity_events:[]}],{playerId:'p1',name:'Alpha',activityEvents:[fresh]});
  assert.equal(untouched[0].activity_events.length,0,'current-player injection must never alter another member');
  log('Fresh self-reported activity is mirrored into the authenticated roster row after sync');
}

// Alliance aggregates use evidence only and count event types over seven days.
{
  const event=(type,hours)=>({event_type:type,event_date:'2026-09-07',confirmed:true,confirmed_at:new Date(nowMs-hours*36e5).toISOString(),updated_at:new Date(nowMs-hours*36e5).toISOString()});
  const members=[
    {name:'A',role:'R4',activity_events:[event('vs',2),event('zombie',4)]},
    {name:'B',role:'R3',activity_events:[event('marauder',30)]},
    {name:'C',role:'R2'}
  ];
  const summary=summarizeAllianceActivity(members,nowMs);
  assert.equal(summary.counts.active,2);assert.equal(summary.counts.inactive,0);assert.equal(summary.counts.refresh,1);
  const totals=members.map(m=>eventCountsByType(m.activity_events,{nowMs,days:7}));
  assert.equal(totals.reduce((n,x)=>n+x.vs,0),1);assert.equal(totals.reduce((n,x)=>n+x.zombie,0),1);assert.equal(totals.reduce((n,x)=>n+x.marauder,0),1);
  log('Alliance activity summary is evidence-based and event history is countable without screenshots');
}

// Security source guards: a declared R4/R5 must never unlock management.
{
  const app=read('app.js'),advice=read('api/advice.js'),supabase=read('lib/supabase.js'),normalize=read('lib/normalize.js');
  assert.doesNotMatch(app,/a\.role\s*\|\|\s*p\.role/);
  assert.doesNotMatch(app,/state\.alliance\.role\s*=\s*safeRole/);
  assert.doesNotMatch(app,/out\.alliance\.role\s*=\s*r\b/);
  assert.match(app,/function isAllianceManager\(\)\{return state\?\.alliance\?\.management_verified===true&&\["R4","R5"\]\.includes\(normalizedRole\(state\?\.alliance\?\.role\)\)\}/);
  assert.match(app,/canShareAllianceInvite=a\.management_verified===true&&\["R4","R5"\]\.includes\(normalizedRole\(a\.role\)\)/);
  assert.match(app,/row\.management_role=nextRole/);
  assert.doesNotMatch(app,/row\.role=nextRole/);
  assert.match(advice,/getAllianceMembership\(betaUser\.id\)/);
  assert.match(advice,/if\(!\["R4","R5"\]\.includes\(role\)\)return res\.status\(403\)/);
  assert.doesNotMatch(advice,/s\?\.player\?\.role/);
  assert.match(supabase,/role:s\.player\?\.role\|\|"R1",management_role:m\.role\|\|"R1"/);
  assert.match(normalize,/management_verified:alliance\.management_verified===true/);
  log('Declared rank is statically separated from server-verified R4/R5 management access');
}

// S6 Awakening/Reshape rules must survive V2.5.28 unchanged and must switch off in inter-season.
{
  assert.deepEqual(S6_AWAKENING_HEROES,{Kimberly:'tank',DVA:'aircraft',Tesla:'missile'});
  assert.equal(S6_AWAKENING_MIN_STARS,5);assert.equal(S6_AWAKENING_MIN_EX,20);assert.equal(S6_AWAKENING_UNLOCK_SHARDS,50);
  const hero={name:'DVA',stars:5,exclusive:'23',awakening:{unlocked:true,stars:2,skill_level:5,named_shards:50,universal_shards:10,trial_complete:true,in_base:true,power:9.2,reshape_stage:2,reshape_value:71}};
  const active={number:6,day:20,total_days:35,lifecycle:'active'};
  const r=awakeningReadiness(hero,[],active);assert.equal(r.checks.eligible,true);assert.equal(r.checks.season6,true);assert.equal(r.checks.stars.ok,true);assert.equal(r.checks.exclusive.ok,true);assert.equal(r.checks.named_shards.ok,true);
  const score=awakeningDecisionScore({hero,season:active,mainType:'aircraft',formationBonus:20});assert.ok(Number.isFinite(score));
  const reshape=heroReshapeDecisionValue({hero,season:active,mainType:'aircraft',formationBonus:20});assert.equal(reshape.exact_power_projected,false);assert.equal(reshape.model,'relative-decision-value-only');assert.equal(reshape.observed_awakening_power,9.2);assert.equal(reshape.observed_reshape_value,71);
  const between=repairSeasonState({number:6,name:'S6',lifecycle:'interseason',progress_pct:90,profession:'Chef de guerre'});assert.equal(seasonLifecycle(between),'interseason');assert.equal(seasonIsActive(between),false);assert.equal(activeSeasonProgress(between),null);assert.equal(between.progress_pct,null);
  assert.equal(awakeningDecisionScore({hero,season:between,mainType:'aircraft',formationBonus:20}),null,'S6 Awakening advice must be inactive between seasons');
  log('S6 Awakening/Reshape stays data-driven and is disabled in inter-season');
}

// S6 technologies and Awakening swap safety remain available when their real conditions are known.
{
  const tech=season6TechPriorities({type_mastery_pct:80,hero_tech_pct:75,siege_to_seize_pct:60,defensive_fortification_pct:90,tactical_weapon_pct:70},{offense:true});
  assert.equal(tech.known,true);assert.ok(tech.priorities.length>=4);assert.ok(tech.priorities.some(x=>x.key==='type_mastery'));assert.ok(tech.priorities.some(x=>x.key==='tactical_weapon'));
  const source={name:'DVA',stars:5,exclusive:'23',awakening:{unlocked:true,in_base:true,named_shards:0}};
  const target={name:'Kimberly',stars:5,exclusive:'20',awakening:{unlocked:true,in_base:true,named_shards:0}};
  const swap=awakeningSwapAssessment({swap:{source_hero:'DVA',target_hero:'Kimberly',attempts_remaining:1,active:true},heroes:[source,target]});
  assert.equal(swap.requirements_known,true);assert.equal(swap.safe_to_swap,true);assert.deepEqual(swap.blockers,[]);assert.deepEqual(swap.warnings,[]);
  const risky=awakeningSwapAssessment({swap:{source_hero:'DVA',target_hero:'Kimberly',attempts_remaining:1,active:true},heroes:[source,{...target,awakening:{...target.awakening,named_shards:10}}]});
  assert.ok(risky.warnings.includes('spend_target_specific_awakening_shards_before_swap'));assert.equal(risky.safe_to_swap,false);
  log('S6 technology and Awakening Swap safeguards remain intact');
}

// UI contract and all explicit languages include the new labels.
{
  const html=read('index.html'),app=read('app.js'),css=read('styles.css'),health=read('api/health.js'),sw=read('sw.js');
  assert.match(html,/id="activityEventGrid"/);assert.match(html,/id="allianceEventSummary"/);
  assert.match(app,/ACTIVITY_EVENT_TYPES\.map/);assert.match(app,/source:"player_self_report"/);
  assert.match(css,/\.activityEventBtn\.confirmed/);assert.match(css,/\.decisionDetails\[open\] \.detailsOpen/);
  assert.match(health,/activity_missing_confirmation_never_inactive/);assert.match(health,/declared_rank_never_unlocks_management/);
  assert.match(sw,/warboost-v2-5-28-activity-events/);assert.match(sw,/\/lib\/activity-events\.js/);
  const keys=['activity_quick_title','activity_quick_help','event_vs','event_zombie','event_marauder','event_alliance_event','event_war','event_season','activity_confirm','activity_remove','activity_reason_event','declared_role','diagnostic_confidence','data_completeness','shop_details','shop_hide_details','management_permission'];
  const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
  for(const [code] of explicit){const tr=translator(code);for(const key of keys)assert.notEqual(tr(key),key,`${code} missing ${key}`);assert.match(tr('tagline'),/V2\.5\.28/)}
  log('Activity/UX contract exists in all 23 explicit language choices');
}

// Finishing regressions accumulated during real Preview testing.
{
  const app=read('app.js'),advice=read('api/advice.js');
  assert.match(app,/t\("diagnostic_confidence"/);assert.match(app,/t\("data_completeness"/);
  assert.match(app,/detailsClosed/);assert.match(app,/detailsOpen/);assert.match(app,/shop_hide_details/);
  assert.doesNotMatch(advice,/À éviter\s*:\s*À éviter/i);
  assert.match(app,/if\(j\.lifecycle==="interseason"\|\|j\.lifecycle==="ended"\)/);
  log('Diagnostic labels, shop toggle, VS duplicate prefix and inter-season advice cleanup are guarded');
}

console.log('\nWarBoost V2.5.28 Activity Events verification: PASS');
