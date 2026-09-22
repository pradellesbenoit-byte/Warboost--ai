import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeAvailabilityRecord,mergeAvailabilityRecords,countAvailabilitySlots,recommendBestSlot,planAvailabilityRoster} from '../lib/alliance-availability-planner.js';
import {CANYON_STORM_RULESET,buildCanyonPlan,buildEfficientCanyonSelection,normalizeCanyonState,mergeCanyonState} from '../lib/canyon-storm-plan.js';
import {normalizeState,mergeNewest} from '../lib/normalize.js';
import {hydrateCloudState} from '../lib/cloud-state-recovery.js';

assert.equal(CANYON_STORM_RULESET.max_starters,20);assert.equal(CANYON_STORM_RULESET.max_substitutes,10);
assert.equal(CANYON_STORM_RULESET.structures.data_center_i.alliance_pps,20);
assert.equal(CANYON_STORM_RULESET.structures.sample_warehouse_i.alliance_pps,15);
assert.equal(CANYON_STORM_RULESET.structures.power_tower.alliance_pps,50);
assert.equal(CANYON_STORM_RULESET.structures.virus_lab.alliance_pps,120);
assert.equal(CANYON_STORM_RULESET.structures.defense_system_i.alliance_pps,20);
assert.equal(CANYON_STORM_RULESET.structures.serum_factory_i.alliance_pps,20);
assert.equal(CANYON_STORM_RULESET.structures.power_plant.alliance_pps,null);
assert.equal(CANYON_STORM_RULESET.structures.point_supply_box.alliance_pps,null);
assert.deepEqual(CANYON_STORM_RULESET.energy_categories,{battle:null,assistance:null,strategy_garrison:null});
assert.deepEqual(CANYON_STORM_RULESET.skills.seismic_tower,{faction:'instigators',duration:30,cost:500000,cooldown:300,arrival_durability:1000,then_every_seconds:3,durability:300,severely_wounded:60});
assert.deepEqual(CANYON_STORM_RULESET.skills.field_hospital,{faction:'universal',duration:30,cost:500000,cooldown:300,every_seconds:3,restore_durability:300,heal_wounded:150});
assert.deepEqual(CANYON_STORM_RULESET.skills.artillery_turret,{faction:'scouts',duration:30,cost:750000,cooldown:300,every_seconds:2,durability:300,severely_wounded:60});
assert.equal(CANYON_STORM_RULESET.skills.doomsday.duration,120);
const members=Array.from({length:35},(_,i)=>({name:`P${i}`,canonical_member_key:`p${i}`,lifecycle_key:`p${i}`}));
const records=members.map((m,i)=>({canonical_member_key:m.canonical_member_key,event_type:'canyon_storm',status:i<30?'present':'unknown',time_slot:i<30?'20:00':'21:00',source:'player_data',updated_at:'2026-01-01T00:00:00Z'}));
const normalized=normalizeAvailabilityRecord(records[0]);assert.equal(normalized.display_status,'present');assert.equal(normalized.source,'player_data');
assert.equal(countAvailabilitySlots(records)['20:00'].present,30);assert.equal(recommendBestSlot(records).slot,'20:00');
for(const event_type of ['desert_storm','canyon_storm','vs','season'])assert.ok(planAvailabilityRoster(members,records,{event_type}));
const plan=buildCanyonPlan(members,records,{faction:'instigators',status:'planned',date:'2026-01-01',time:'20:00'});
assert.equal(plan.participants.length,20);assert.equal(plan.substitutes.length,10);assert.equal(plan.phases.length,3);
assert.ok(plan.participants.every(x=>Array.isArray(x.sources)&&x.why));assert.equal(buildCanyonPlan(members,[],{}).confirmation.length,35);
assert.equal(buildCanyonPlan(members,[],{}).excluded.length,0);
assert.equal(buildCanyonPlan(members,records,{faction:'scouts'}).faction_to_confirm,false);
assert.equal(buildCanyonPlan(members,records,{}).faction_to_confirm,true);
assert.ok(plan.participants.some(x=>x.role==='adjudicator'));
assert.ok(!buildCanyonPlan(members,records,{faction:'scouts'}).participants.some(x=>x.role==='adjudicator'));
const efficientMembers=Array.from({length:35},(_,i)=>({
  name:`E${i}`,canonical_member_key:`e${i}`,lifecycle_key:`e${i}`,
  role:i===0?'R5':i===1?'R4':'R1',
  power_m:i<18?240+i:null,squad_power_m:i<10?260+i:null,
  warboost_linked:i<10
}));
const efficientRecords=efficientMembers.map((member,i)=>({
  canonical_member_key:member.canonical_member_key,event_type:'canyon_storm',
  status:i<15?'present':i<18?'absent':'unknown',time_slot:'20:00',
  source:'player_data',updated_at:'2026-01-02T00:00:00Z'
}));
const efficient=buildEfficientCanyonSelection(efficientMembers,efficientRecords,{
  faction:'instigators',time:'20:00',adjudicator_key:'e1'
});
assert.equal(efficient.starters.length,20);
assert.equal(efficient.substitutes.length,10);
assert.ok(efficient.starters.slice(0,15).every(x=>x.availability.status==='present'));
assert.ok(!efficient.starters.some(x=>x.availability.status==='absent'));
assert.ok(efficient.starters.some(x=>x.canonical_member_key==='e1'));
assert.equal(new Set([...efficient.starters,...efficient.substitutes].map(x=>x.canonical_member_key)).size,30);
assert.ok(efficient.starters.some(x=>x.selection_reason.includes('Disponibilité à confirmer')));
assert.ok(efficient.missing_data_count>0);
assert.ok(efficient.starters.every(x=>x.selection_reason&&!x.selection_reason.includes('score')));
const efficientPlan=buildCanyonPlan(efficientMembers,efficientRecords,{
  faction:'instigators',time:'20:00',adjudicator_key:'e1',selection:efficient
});
const efficientReopened=normalizeState(JSON.parse(JSON.stringify({
  alliance:{canyon:{...normalizeCanyonState({faction:'instigators',availability:efficientRecords,plan:efficientPlan}),updated_at:'2026-01-02T01:00:00Z'}}
})));
assert.equal(efficientReopened.alliance.canyon.plan.participants.length,20);
assert.equal(efficientReopened.alliance.canyon.plan.substitutes.length,10);
assert.equal(efficientReopened.alliance.canyon.plan.participants.filter(x=>x.canonical_member_key==='e1').length,1);
const persisted=normalizeState({alliance:{desert_storm:{team:'B',registered_keys:['keep-desert'],updated_at:'2026-01-01T08:00:00Z'},canyon:{...normalizeCanyonState({faction:'instigators',availability:records,plan}),updated_at:'2026-01-01T10:00:00Z'}}});
assert.equal(persisted.alliance.canyon.availability.length,35);assert.equal(persisted.alliance.canyon.plan.participants.length,20);
assert.deepEqual(persisted.alliance.desert_storm.registered_keys,['keep-desert']);
const older={alliance:{canyon:{faction:'scouts',availability:[],updated_at:'2026-01-01T09:00:00Z'}}};
assert.equal(mergeNewest(persisted,older).alliance.canyon.faction,'instigators');
assert.equal(hydrateCloudState(older,persisted,'player').alliance.canyon.availability.length,35);
assert.equal(mergeCanyonState(persisted.alliance.canyon,older.alliance.canyon).faction,'instigators');
assert.equal(mergeAvailabilityRecords(records[0],{...records[0],status:'unknown',source:null,updated_at:'2026-01-02T00:00:00Z'})[0].status,'present');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 for(const id of ['canyonPlanner','canyonStatus','canyonDateTime','canyonFaction','canyonAdjudicator','canyonAvailabilityList','canyonEfficientSelectBtn','canyonSelectionProposal','canyonGenerateBtn','canyonValidateBtn','canyonObjectives','canyonSkills','canyonPlan'])assert.match(html,new RegExp(`id=[\"']${id}[\"']`));
assert.match(app,/function renderCanyonPlanner\(\)/);assert.match(app,/buildCanyonPlan\(members,canyon\.availability/);assert.match(app,/buildEfficientCanyonSelection/);assert.match(app,/Appliquer cette sélection/);assert.match(app,/Annuler/);assert.match(app,/removeCanyonStarter/);assert.match(app,/promoteCanyonSubstitute/);
console.log('Canyon Storm verification: PASS');