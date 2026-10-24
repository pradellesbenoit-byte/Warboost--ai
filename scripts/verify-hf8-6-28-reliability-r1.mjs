import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeLastWarNickname,linkCurrentPlayerIdentityIntoRoster} from '../lib/alliance-identity.js';
import {mergeCloudRosterWithIdentity} from '../lib/alliance-roster-merge.js';
import {repairContradictoryPendingState} from '../publisher-ui.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

assert.equal(normalizeLastWarNickname('[ALL4]ToyN','ALL4'),'toyn');
assert.equal(normalizeLastWarNickname(' ToyN ','ALL4'),'toyn');
assert.notEqual(normalizeLastWarNickname('[OTHER]ToyN','ALL4'),'toyn');

const roster=[
  {name:'ToyN',role:'R4',server_id:'884',alliance_tag:'ALL4'},
  {name:'Bay004',role:'R3',server_id:'884',alliance_tag:'ALL4'}
];
const linked=linkCurrentPlayerIdentityIntoRoster(roster,{playerId:'p-toyn',name:'[ALL4]ToyN',serverId:'884',allianceTag:'ALL4'});
assert.equal(linked.status,'linked_exact');
assert.equal(linked.members[0].name,'ToyN');
assert.equal(linked.members[0].role,'R4');
assert.equal(linked.members[0].player_id,'p-toyn');
assert.equal(linked.members[0].warboost_linked,true);

const wrongServer=linkCurrentPlayerIdentityIntoRoster(roster,{playerId:'p-x',name:'[ALL4]ToyN',serverId:'999',allianceTag:'ALL4'});
assert.equal(wrongServer.status,'no_match');
const wrongAlliance=linkCurrentPlayerIdentityIntoRoster(roster,{playerId:'p-x',name:'[OTHER]ToyN',serverId:'884',allianceTag:'ALL4'});
assert.equal(wrongAlliance.status,'no_match');

const protectedRoster=[{name:'ToyN',role:'R4',server_id:'884',alliance_tag:'ALL4',player_id:'p-old',warboost_linked:true,identity_basis:'lastwar_nickname_server_alliance'}];
const cannotSteal=linkCurrentPlayerIdentityIntoRoster(protectedRoster,{playerId:'p-new',name:'[ALL4]ToyN',serverId:'884',allianceTag:'ALL4'});
assert.equal(cannotSteal.status,'roster_member_already_linked');
assert.equal(cannotSteal.members[0].player_id,'p-old');

const accountAlreadyUsed=[
  {name:'ToyN',role:'R4',server_id:'884',alliance_tag:'ALL4'},
  {name:'OldName',role:'R3',server_id:'884',alliance_tag:'ALL4',player_id:'p-same',warboost_linked:true,identity_basis:'lastwar_nickname_server_alliance'}
];
const cannotDoubleLink=linkCurrentPlayerIdentityIntoRoster(accountAlreadyUsed,{playerId:'p-same',name:'[ALL4]ToyN',serverId:'884',allianceTag:'ALL4'});
assert.ok(['account_already_linked','ambiguous_rename'].includes(cannotDoubleLink.status));
assert.equal(cannotDoubleLink.members[1].player_id,'p-same');
assert.equal(cannotDoubleLink.members[0].player_id??null,null);

const cloud=[
  {player_id:'p-toyn',name:'[ALL4]ToyN',server_id:'884',alliance_tag:'ALL4',power_m:240},
  {player_id:'p-toyn',name:'[ALL4]ToyN',server_id:'884',alliance_tag:'ALL4',power_m:240}
];
const merged=mergeCloudRosterWithIdentity(roster,cloud,{serverId:'884',allianceTag:'ALL4'});
assert.equal(merged.roster.filter(x=>x.player_id==='p-toyn').length,1);
assert.equal(merged.unlinked_accounts.length,0);
assert.equal(merged.roster[0].name,'ToyN');
assert.equal(merged.roster[0].role,'R4');

const contradictory={
  player:{server_id:'884'},
  alliance:{tag:'ALL4',server_id:'884',members:[{name:'ToyN',server_id:'884',alliance_tag:'ALL4',player_id:'p-toyn',warboost_linked:true,identity_basis:'lastwar_nickname_server_alliance'}],unlinked_accounts:[{name:'[ALL4]ToyN',server_id:'884',alliance_tag:'ALL4',reason:'no_match'}]}
};
const repaired=repairContradictoryPendingState(contradictory);
assert.equal(repaired.changed,true);
assert.equal(repaired.state.alliance.unlinked_accounts.length,0);

const wrongScope={...contradictory,alliance:{...contradictory.alliance,unlinked_accounts:[{name:'[ALL4]ToyN',server_id:'999',alliance_tag:'ALL4'}]}};
assert.equal(repairContradictoryPendingState(wrongScope).state.alliance.unlinked_accounts.length,1);
const ambiguous={...contradictory,alliance:{...contradictory.alliance,members:[...contradictory.alliance.members,{...contradictory.alliance.members[0],player_id:'p-other'}],unlinked_accounts:[{name:'[ALL4]ToyN',server_id:'884',alliance_tag:'ALL4'}]}};
assert.equal(repairContradictoryPendingState(ambiguous).state.alliance.unlinked_accounts.length,1);

const scan=read('api/scan.js');
assert.match(scan,/SCAN_TOTAL_BUDGET_MS=52000/);
assert.match(scan,/CUSTOM_PRIMARY_TIMEOUT_MS=9000/);
assert.match(scan,/OPENAI_PRIMARY_TIMEOUT_MS=34000/);
assert.match(scan,/OPTIONAL_IDENTITY_TIMEOUT_MS=6500/);
assert.match(scan,/catch\(error\)\{providerError\(errors,"custom",error\);extracted=null\}/);
assert.match(scan,/identity_enrichment_skipped:identitySkipped/);
assert.match(scan,/Base extraction is returned even when optional portrait enrichment is skipped\/times out/);
assert.ok(!scan.includes('},45000,{code:"VISION_TIMEOUT"'), 'legacy 45s custom timeout must be gone');
assert.ok(!scan.includes('},50000,{code:"VISION_TIMEOUT"'), 'legacy 50s OpenAI timeout must be gone');

const sw=read('sw.js');
assert.match(sw,/warboost-v2-5-28-hf8-6-28-scan-identity-reliability-r1/);
console.log('WarBoost HF8.6.28 Reliability Patch R1: PASS');
