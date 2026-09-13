import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mergeCloudRosterWithIdentity} from '../lib/alliance-roster-merge.js';

const canonical=[
  {name:'ToyN',role:'R4',power_m:231,hq_level:35,server_id:'884',alliance_tag:'ALL4',membership_status:'active',membership_history:[{type:'joined',at:'2026-01-01T00:00:00.000Z'}]},
  {name:'Bay004',role:'R3',power_m:283,hq_level:35,server_id:'884',alliance_tag:'ALL4'}
];
const cloud=[
  {player_id:'p-toyn',name:'[ALL4]ToyN',role:'R5',management_role:'R5',power_m:240,hq_level:35,server_id:'884',alliance_tag:'ALL4',drone_level:160},
  {player_id:'p-bay',name:'[ALL4]Bay004',role:'R5',management_role:'R1',power_m:290,hq_level:35,server_id:'884',alliance_tag:'ALL4'}
];
const merged=mergeCloudRosterWithIdentity(canonical,cloud,{serverId:'884',allianceTag:'ALL4'}).roster;
const toyn=merged.find(x=>x.name==='ToyN');
const bay=merged.find(x=>x.name==='Bay004');
assert.ok(toyn,'ToyN must remain in roster');
assert.equal(toyn.role,'R4','canonical ToyN R4 must not be overwritten by stale cloud R5');
assert.equal(toyn.player_id,'p-toyn');
assert.equal(toyn.warboost_linked,true);
assert.equal(toyn.power_m,240,'cloud progression data may enrich canonical member');
assert.equal(toyn.drone_level,160);
assert.equal(toyn.membership_status,'active');
assert.equal(toyn.membership_history.length,1);
assert.ok(bay,'Bay004 must remain in roster');
assert.equal(bay.role,'R3','canonical Bay004 R3 must not be overwritten by stale cloud R5');
assert.equal(bay.player_id,'p-bay');

const cloudOnly=mergeCloudRosterWithIdentity([],cloud,{serverId:'884',allianceTag:'ALL4'}).roster;
assert.equal(cloudOnly.find(x=>x.player_id==='p-toyn').role,'R5','cloud-only fallback keeps declared role when no canonical roster exists');

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const health=fs.readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.match(index,/HF8\.6\.8/);
assert.match(health,/hf8\.6\.8-association-keeps-roster-identity/);
assert.match(sw,/hf8-6-8-association-keeps-roster-identity/);
console.log('WarBoost V2.5.28 HF8.6.8 Association Keeps Roster Identity verification: PASS');
