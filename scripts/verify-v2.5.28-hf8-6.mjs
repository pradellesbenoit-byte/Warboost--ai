import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {appendProgressionSnapshot,progressionComparison,strongestSquadFromState} from '../lib/progression-history.js';
import {removeActiveRosterMember,reinstateFormerRosterMember,currentActiveRosterMembers,rosterLifecycleKey} from '../lib/alliance-roster-lifecycle.js';
import {buildDesertStormPlan} from '../lib/desert-storm-plan.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),scan=read('api/scan.js'),sync=read('api/sync.js'),health=read('api/health.js'),sw=read('sw.js');
const pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest'));
const day1='2026-09-01T10:00:00.000Z',day12='2026-09-12T10:00:00.000Z';

// Progression: snapshots are preserved and compared instead of overwritten.
const state1={player:{power_m:250,hq_level:35},drone:{level:157,power_m:8.84},squads:[{power:45,updated_at:day1},{power:30,updated_at:day1},{power:20,updated_at:day1},{power:null}]};
const state2={player:{power_m:255,hq_level:35},drone:{level:158,power_m:9.02},squads:[{power:47,updated_at:day12},{power:31,updated_at:day12},{power:20.5,updated_at:day12},{power:null}]};
let hist=[];hist=appendProgressionSnapshot(hist,state1,{source:'test',at:day1});hist=appendProgressionSnapshot(hist,state2,{source:'test',at:day12});
assert.equal(hist.length,2);assert.equal(strongestSquadFromState(state2).power_m,47);
const cmp=progressionComparison(hist,30);assert.equal(cmp.elapsed_days,11);assert.equal(cmp.account.change_m,5);assert.equal(cmp.account.pct,2);assert.equal(cmp.main_squad.change_m,2);assert.equal(cmp.main_squad.pct,4.4);
assert.equal(cmp.account.per_day,0.45);assert.equal(cmp.main_squad.per_day,0.18);

// Updating only the profile must never make an old squad observation look fresh.
const day13='2026-09-13T10:00:00.000Z';
const freshAccountOnly={player:{power_m:255,hq_level:35,updated_at:day12},drone:{level:157,power_m:8.84,updated_at:day1},squads:[{power:45,updated_at:day1},{power:30,updated_at:day1},{power:20,updated_at:day1},{power:null}]};
let metricHist=[];metricHist=appendProgressionSnapshot(metricHist,{...state1,player:{...state1.player,updated_at:day1},drone:{...state1.drone,updated_at:day1}},{source:'baseline',at:day1});
metricHist=appendProgressionSnapshot(metricHist,freshAccountOnly,{source:'profile_only',at:day12});
let metricCmp=progressionComparison(metricHist,30);
assert.equal(metricCmp.account.change_m,5);assert.equal(metricCmp.account.elapsed_days,11);
assert.equal(metricCmp.main_squad.current,45);assert.equal(metricCmp.main_squad.previous,null);assert.equal(metricCmp.main_squad.updated_at,day1,'profile-only update falsely refreshed squad observation');
const realSquadUpdate={...freshAccountOnly,squads:[{power:47,updated_at:day13},{power:30,updated_at:day1},{power:20,updated_at:day1},{power:null}]};
metricHist=appendProgressionSnapshot(metricHist,realSquadUpdate,{source:'squad_update',at:day13});metricCmp=progressionComparison(metricHist,30);
assert.equal(metricCmp.main_squad.change_m,2);assert.equal(metricCmp.main_squad.elapsed_days,12);assert.equal(metricCmp.main_squad.updated_at,day13);

// A direct departure must survive a later stale canonical/cloud refresh.
const member={name:'Dengrengola',server_id:'884',alliance_tag:'ALL4',role:'R1',power_m:187,hq_level:35,joined_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-09-10T00:00:00.000Z'};
const key=rosterLifecycleKey(member);let life=removeActiveRosterMember({members:[member],review:[],former:[]},key,{now:'2026-09-12T06:33:28.553Z'});
assert.equal(life.members.length,0);assert.equal(life.former.length,1);
const staleCloud={...member,updated_at:'2026-09-12T08:50:00.000Z'};
assert.equal(currentActiveRosterMembers([staleCloud],[],life.former).length,0,'stale cloud roster resurrected removed member');
life=reinstateFormerRosterMember(life,key,{now:'2027-03-12T08:00:00.000Z'});assert.equal(life.members.length,1);assert.equal(currentActiveRosterMembers(life.members,life.review,life.former).length,1);
assert.match(sync,/currentActiveRosterMembers\(rosterMerged,merged\.alliance\?\.roster_review,merged\.alliance\?\.former_members\)/);

// Combat planning: real squad power outranks higher account power when both are known.
const mk=(name,account,squad,updated=day12)=>({name,server_id:'884',alliance_tag:'ALL4',role:'R3',hq_level:35,power_m:account,squad_power_m:squad,squad_power_updated_at:updated,updated_at:updated,lifecycle_key:`${name.toLowerCase()}|884|ALL4`});
const highAccount=mk('High Account',300,38),strongSquad=mk('Strong Squad',250,52);
let plan=buildDesertStormPlan([highAccount,strongSquad],[highAccount.lifecycle_key,strongSquad.lifecycle_key],{nowMs:Date.parse(day12)});
assert.equal(plan.starters[0].name,'Strong Squad');assert.equal(plan.starters[0].plan_evidence.combat_power_source,'squad');assert.equal(plan.starters[0].plan_evidence.combat_power_m,52);

// Missing squad power falls back to account power, never invents squad power, and lowers confidence.
const fallback=mk('Fallback',320,null);delete fallback.squad_power_m;delete fallback.squad_power_updated_at;
plan=buildDesertStormPlan([strongSquad,fallback],[strongSquad.lifecycle_key,fallback.lifecycle_key],{nowMs:Date.parse(day12)});
const fp=plan.starters.find(x=>x.name==='Fallback');assert.equal(fp.plan_evidence.combat_power_source,'account');assert.equal(fp.plan_evidence.squad_power_known,false);assert.ok(plan.warnings.some(x=>x.code==='partial_player_data'));

// Squad data older than 14 days lowers confidence and is explicitly warned.
const stale=mk('Stale Squad',260,50,'2026-08-20T10:00:00.000Z');
const fresh=mk('Fresh Squad',260,50,day12);
const stalePlan=buildDesertStormPlan([stale],[stale.lifecycle_key],{nowMs:Date.parse(day12)}),freshPlan=buildDesertStormPlan([fresh],[fresh.lifecycle_key],{nowMs:Date.parse(day12)});
assert.ok(stalePlan.warnings.some(x=>x.code==='stale_squad_data'));assert.ok(stalePlan.confidence<freshPlan.confidence);

// Roster screenshot import contract: multi-capture UX, visible R5 header, visible-only OCR, review before import.
for(const id of ['rosterScanFiles','rosterScanAnalyzeBtn','rosterScanDraft','rosterScanFullSnapshot','rosterScanImportBtn'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(html,/multiple/);assert.match(scan,/scanType==="alliance_roster"/);assert.match(scan,/R5 leader may be displayed separately/);assert.match(scan,/never guess a rank or number/);assert.match(scan,/never mark a missing player as departed/);
assert.match(app,/slice\(0,12\)/);assert.match(app,/renderRosterScanDraft/);assert.match(app,/collectRosterScanDraftFromDom/);assert.match(app,/source:"roster_scan"/);assert.match(app,/rosterScanFullSnapshot/);

// Quick player updates + dated progression are present without forcing a full rescan.
for(const id of ['progressionSummary','quickProfileScanBtn','quickSquadScanBtn','quickDroneScanBtn'])assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(app,/recordProgressionSnapshot\("manual_profile"\)/);assert.match(app,/recordProgressionSnapshot\(`scan_\$\{scanType\}`/);assert.match(pkg.scripts.check,/progression-history\.js/);

// All explicit languages resolve HF8.6 UI keys without exposing raw keys.
const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
for(const [code] of explicit){const tr=translator(code);for(const k of ['progression_title','quick_profile','quick_squad','quick_drone','progression_account','progression_squad','roster_scan_title','roster_scan_choose','roster_scan_analyze','roster_scan_import','combat_squad_short','combat_account_short','ds_warning_partial_player_data','ds_warning_stale_squad_data'])assert.notEqual(tr(k),k,`${code} missing ${k}`)}

// HF8.6 metadata/cache/safeguards.
assert.match(html,/V2\.5\.28 HF8\.6/);assert.match(manifest.name,/HF8\.6/);assert.match(pkg.description,/HF8\.6/);assert.match(sw,/hf8-6(?:-roster-scan-progression-combat-ai|-1-additive-roster-capture-queue)/);assert.match(sw,/progression-history\.js/);assert.match(health,/ui_revision_final:"hf8\.6(?:-roster-scan-progression-combat-ai|\.1-additive-roster-capture-queue)"/);
for(const guard of ['desert_storm_squad_power_primary_account_power_fallback','desert_storm_stale_squad_data_reduces_confidence','alliance_removed_member_blocked_from_event_picker_after_sync','alliance_roster_screenshot_multi_capture_import','alliance_roster_scan_r5_separate_header_supported','alliance_roster_scan_review_before_import','player_progression_dated_snapshots','player_progression_missing_update_never_no_progress','player_quick_refresh_profile_squad_drone'])assert.match(health,new RegExp(`${guard}:true`));
assert.match(health,/safe_launch_no_scraping:true/);assert.match(health,/safe_launch_no_gameplay_automation:true/);assert.match(health,/beta_payments_disabled:true/);assert.doesNotMatch(app,/localStorage\.clear\s*\(/);
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
const migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?6/i.test(x));assert.equal(migrations.length,0,'HF8.6 must not add a Supabase migration');
const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];assert.deepEqual(duplicates,[],`duplicate HTML ids: ${duplicates.join(', ')}`);

console.log('WarBoost V2.5.28 HF8.6 Roster Scan + Progression + Combat AI verification: PASS');
