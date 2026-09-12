import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  removeActiveRosterMember,
  reinstateFormerRosterMember,
  applyRosterImportLifecycle,
  rosterLifecycleKey
} from '../lib/alliance-roster-lifecycle.js';
import {buildDesertStormPlan,DESERT_STORM_RULESET} from '../lib/desert-storm-plan.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js');
const pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest'));
const now='2026-09-11T21:30:00.000Z';
const later='2027-03-11T21:30:00.000Z';
const ctx={server_id:'884',alliance_tag:'ALL4'};
const mk=(name,role='R3',power_m=200,hq_level=35,extra={})=>({name,role,power_m,hq_level,updated_at:now,...ctx,...extra});

// Direct R5/R4 removal is an alliance lifecycle action, not a destructive delete.
const participation={event_type:'desert_storm',event_date:'2026-09-10',participation_status:'participated',source:'player_self_report',updated_at:now};
const leaving=mk('Former One','R1',187,35,{activity_events:[participation],membership_history:[{type:'joined',at:'2026-01-01T00:00:00.000Z',source:'roster_import'}]});
const key=rosterLifecycleKey(leaving);
let life=removeActiveRosterMember({members:[leaving,mk('Stays','R2')],review:[],former:[]},key,{now});
assert.equal(life.changed,true);assert.equal(life.members.length,1);assert.equal(life.former.length,1);
assert.equal(life.former[0].membership_status,'left_confirmed');assert.equal(life.former[0].activity_events[0].participation_status,'participated');
assert.ok(life.former[0].membership_history.some(x=>x.type==='left_confirmed'&&x.source==='r5_r4_direct_removal'));

// Six months later the same lifecycle identity can be restored without losing history.
life=reinstateFormerRosterMember(life,key,{now:later});
assert.equal(life.changed,true);assert.equal(life.former.length,0);assert.equal(life.members.length,2);
const restored=life.members.find(x=>x.name==='Former One');assert.ok(restored);assert.equal(restored.left_at,null);
assert.equal(restored.activity_events[0].participation_status,'participated');
assert.ok(restored.membership_history.some(x=>x.type==='left_confirmed'));
assert.ok(restored.membership_history.some(x=>x.type==='returned'&&x.source==='r5_r4_direct_reintegration'));

// A future roster import also recognizes a confirmed former member and reactivates it.
let former=removeActiveRosterMember({members:[leaving],review:[],former:[]},key,{now});
let imported=applyRosterImportLifecycle({members:former.members,review:former.review,former:former.former},[mk('Former One','R2',240,35)],{complete:false,now:later});
assert.equal(imported.former.length,0);assert.equal(imported.members.length,1);assert.equal(imported.members[0].role,'R2');
assert.ok(imported.members[0].membership_history.some(x=>x.type==='returned'));

// Current in-game structure values captured on 2026-09-11 are locked as the tactical reference.
assert.equal(DESERT_STORM_RULESET.max_starters,20);assert.equal(DESERT_STORM_RULESET.max_substitutes,10);
assert.equal(DESERT_STORM_RULESET.structures.nuclear_silo.alliance_pps,80);
assert.equal(DESERT_STORM_RULESET.structures.oil_refinery.alliance_pps,50);
assert.equal(DESERT_STORM_RULESET.structures.field_hospital.alliance_pps,30);
for(const k of ['science_hub','info_center','arsenal','mercenary_factory'])assert.equal(DESERT_STORM_RULESET.structures[k].alliance_pps,10,`${k} alliance pps`);
assert.equal(DESERT_STORM_RULESET.structures.science_hub.bonus,'free_relocation_cooldown_reduced_50pct');
assert.equal(DESERT_STORM_RULESET.structures.info_center.bonus,'captured_building_output_plus_10pct');
assert.equal(DESERT_STORM_RULESET.structures.arsenal.bonus,'allied_hero_atk_def_hp_plus_15pct');
assert.equal(DESERT_STORM_RULESET.structures.mercenary_factory.bonus,'enemy_hero_atk_def_hp_minus_15pct');

// Full 30-player registration => 20 starters, 10 substitutes, balanced five groups of four.
const roster=Array.from({length:32},(_,i)=>mk(`Player ${String(i+1).padStart(2,'0')}`,i===0?'R5':i<5?'R4':'R3',330-i*5,35-(i%4)));
const withKeys=roster.map(x=>({...x,lifecycle_key:rosterLifecycleKey(x)}));
const keys=withKeys.slice(0,30).map(x=>x.lifecycle_key);
const fullPlan=buildDesertStormPlan(withKeys,keys,{nowMs:Date.parse(now),team:'A',battleTime:'20:30'});
assert.equal(fullPlan.registered_count,30);assert.equal(fullPlan.starters.length,20);assert.equal(fullPlan.substitutes.length,10);assert.equal(fullPlan.groups.length,5);
assert.deepEqual(fullPlan.groups.map(g=>g.members.length),[4,4,4,4,4]);
const assigned=fullPlan.groups.flatMap(g=>g.members.map(m=>m.name));assert.equal(new Set(assigned).size,20);assert.equal(assigned.length,20);
assert.ok(fullPlan.groups.some(g=>g.mission.center==='silo_anchor'));assert.ok(fullPlan.groups.some(g=>g.mission.center==='arsenal'));assert.ok(fullPlan.groups.some(g=>g.mission.center==='mercenary_factory'));
assert.ok(fullPlan.groups.some(g=>g.mission.opening==='refinery_science'));assert.ok(fullPlan.groups.some(g=>g.mission.opening==='refinery_info'));assert.ok(fullPlan.groups.some(g=>g.mission.opening==='hospital_pair'));assert.ok(fullPlan.groups.some(g=>g.mission.opening==='mobile_capture'));

// More than 30 registered never silently creates extra battle slots.
const over=buildDesertStormPlan(withKeys,withKeys.map(x=>x.lifecycle_key),{nowMs:Date.parse(now)});
assert.equal(over.starters.length,20);assert.equal(over.substitutes.length,10);assert.ok(over.warnings.some(x=>x.code==='too_many_registered'&&x.count===2));

// Smaller attendance adapts instead of inventing missing players.
const compact=buildDesertStormPlan(withKeys,keys.slice(0,12),{nowMs:Date.parse(now)});
assert.equal(compact.starters.length,12);assert.equal(compact.groups.length,3);assert.ok(compact.warnings.some(x=>x.code==='starter_shortage'&&x.count===8));

// Missing player data lowers confidence but never removes or labels the player inactive.
const unknown=mk('Unknown Data','R2',null,null,{power_m:null,hq_level:null,lifecycle_key:'unknown|884|ALL4'});
const mixed=[...withKeys.slice(0,9),unknown];
const mixedPlan=buildDesertStormPlan(mixed,mixed.map(x=>x.lifecycle_key),{nowMs:Date.parse(now)});
assert.equal(mixedPlan.starters.length,10);assert.ok(mixedPlan.starters.some(x=>x.name==='Unknown Data'));assert.ok(mixedPlan.warnings.some(x=>x.code==='partial_player_data'));

// Former/review players cannot be selected when the caller passes the active roster only.
const ignored=buildDesertStormPlan(withKeys.slice(0,5),[...withKeys.slice(0,5).map(x=>x.lifecycle_key),'former|884|ALL4'],{nowMs:Date.parse(now)});
assert.equal(ignored.registered_count,5);

// The plan is phase/event driven, not tied to disputed public-guide minute marks.
const dsSource=read('lib/desert-storm-plan.js');
assert.doesNotMatch(dsSource,/after\s+10\s+minutes|10\s*min|15\s*min|phase.{0,12}\d+\s*min/i);
assert.match(dsSource,/opening \/ center open \/ late/);

// UI: simple remove/reintegrate plus R5/R4 registered-player picker and copyable short orders.
for(const token of ['data-roster-active-remove','data-roster-former-reinstate','removeActiveRosterMember','reinstateFormerRosterMember','renderDesertStormPlanner','buildDesertStormPlan'])assert.match(app,new RegExp(token));
for(const id of ['desertStormPlanner','desertStormRosterPicker','desertStormGenerateBtn','desertStormCopyBtn'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(html,/data-i18n=["']ds_registration_guard["']/);assert.match(app,/ds_order_objectives/);assert.match(app,/ds_order_center/);assert.match(app,/ds_order_help/);

// Runtime code remains generic: real alliance/player examples are tests/data, never hardcoded behavior.
for(const name of ['Nono 50','Dengrengola']){assert.doesNotMatch(app,new RegExp(name,'i'));assert.doesNotMatch(dsSource,new RegExp(name,'i'))}

// All explicit UI languages expose the new actions and Desert Storm labels.
const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
for(const [code] of explicit){const tr=translator(code);for(const k of ['roster_remove','roster_reintegrate','ds_title','ds_intro','ds_registration_guard','ds_generate','ds_copy','ds_order_objectives','ds_order_center','ds_order_help'])assert.notEqual(tr(k),k,`${code} missing ${k}`)}

// Metadata/Safe Launch/non-regression guards.
assert.match(health,/ui_revision_final:"hf8\.(?:5-final-alliance-desert-storm|6-roster-scan-progression-combat-ai)"/);
for(const guard of ['alliance_direct_remove_preserves_history','alliance_direct_reintegration_preserves_history','alliance_removed_member_excluded_from_active_counts','desert_storm_registered_not_participated_guard','desert_storm_r5_r4_registered_player_picker','desert_storm_twenty_starters_ten_substitutes_cap','desert_storm_balanced_groups','desert_storm_short_copyable_orders','desert_storm_no_fixed_phase_timer_assumptions','desert_storm_missing_power_never_inactive','vs_current_server_day_required_for_live','vs_stale_scan_history_only'])assert.match(health,new RegExp(`${guard}:true`));
assert.match(sw,/hf8-(?:5-final-alliance-desert-storm|6-roster-scan-progression-combat-ai)/);assert.match(sw,/desert-storm-plan\.js/);
assert.match(pkg.description,/HF8\.(?:5 FINAL|6)/);assert.match(pkg.scripts.check,/desert-storm-plan\.js/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf8-5-final\.mjs/);assert.match(manifest.name,/HF8\.(?:5 FINAL|6)/);
assert.match(health,/safe_launch_no_scraping:true/);assert.match(health,/safe_launch_no_gameplay_automation:true/);assert.match(health,/beta_payments_disabled:true/);
assert.doesNotMatch(app,/localStorage\.clear\s*\(/);assert.doesNotMatch(app,/WARBOOST_PUBLIC_LASTWAR_URL|LASTWAR_API_KEY/);
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
const newMigrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?5/i.test(x));assert.equal(newMigrations.length,0,'HF8.5 FINAL must not add a Supabase migration');
const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];assert.deepEqual(duplicates,[],`duplicate HTML ids: ${duplicates.join(', ')}`);

console.log('WarBoost V2.5.28 HF8.5 FINAL Alliance + Desert Storm verification: PASS');
