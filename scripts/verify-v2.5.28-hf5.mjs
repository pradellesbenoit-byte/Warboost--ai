import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {linkCurrentPlayerIdentityIntoRoster,rosterLinkSummary} from '../lib/alliance-identity.js';
import {mergeCloudRosterWithIdentity} from '../lib/alliance-roster-merge.js';
import {eventCountsByType,mergeActivityEvents} from '../lib/activity-events.js';
import {normalizeState} from '../lib/normalize.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const log=x=>console.log(`HF5 ✓ ${x}`);
const now='2026-09-09T11:10:00.000Z';
const event={event_type:'vs',event_date:'2026-09-09',participation_status:'participated',confirmed:true,confirmed_at:now,updated_at:now,source:'player_self_report'};
const roster94=()=>Array.from({length:94},(_,i)=>({name:i===9?'les gladiateurs81':`Joueur${String(i+1).padStart(2,'0')}`,role:i<10?'R4':i<80?'R3':i<91?'R2':'R1',hq_level:30,power_m:50+i/10,source:'manual_import',updated_at:'2026-08-20T10:00:00Z'}));

// Exact Last War identity must link without changing the 94-member roster count.
{
  const result=linkCurrentPlayerIdentityIntoRoster(roster94(),{playerId:'auth-private-1',name:'les gladiateurs81',serverId:'884',allianceTag:'ALL4',activityEvents:[event],updatedAt:now});
  assert.equal(result.status,'linked_exact');assert.equal(result.members.length,94);
  const self=result.members.find(x=>x.name==='les gladiateurs81');assert.ok(self);assert.equal(self.player_id,'auth-private-1');assert.equal(self.warboost_linked,true);assert.equal(self.server_id,'884');assert.equal(self.alliance_tag,'ALL4');
  assert.equal(eventCountsByType(self.activity_events,{nowMs:Date.parse(now),days:7}).vs,1);
  assert.deepEqual(rosterLinkSummary(result.members),{linked:1,unlinked:93,total:94});
  log('exact nickname + server + alliance links the player to the existing 94-member roster and carries participation');
}

// A wrong nickname, wrong server, or ambiguous nickname never receives activity.
{
  const noMatch=linkCurrentPlayerIdentityIntoRoster(roster94(),{playerId:'p1',name:'AutrePseudo',serverId:'884',allianceTag:'ALL4',activityEvents:[event],updatedAt:now});
  assert.equal(noMatch.status,'no_match');assert.equal(noMatch.members.length,94);assert.equal(noMatch.members.some(x=>(x.activity_events||[]).length),false);
  const wrongServer=roster94();wrongServer[9].server_id='885';wrongServer[9].alliance_tag='ALL4';
  const conflict=linkCurrentPlayerIdentityIntoRoster(wrongServer,{playerId:'p1',name:'les gladiateurs81',serverId:'884',allianceTag:'ALL4',activityEvents:[event],updatedAt:now});
  assert.equal(conflict.status,'no_match');assert.equal(conflict.members.some(x=>x.player_id==='p1'),false);
  const dup=roster94();dup.push({...dup[9],player_id:null});
  const ambiguous=linkCurrentPlayerIdentityIntoRoster(dup,{playerId:'p1',name:'les gladiateurs81',serverId:'884',allianceTag:'ALL4',activityEvents:[event],updatedAt:now});
  assert.equal(ambiguous.status,'ambiguous');assert.equal(ambiguous.members.some(x=>x.player_id==='p1'),false);
  log('wrong or ambiguous Last War identity is never guessed and never gets another player’s participation');
}

// Legacy HF4 player_id metadata is not trusted by itself: exact game identity must be re-proved.
{
  const legacy=roster94();legacy[0].player_id='legacy-private';legacy[0].name='WrongPseudo';
  const wrong=linkCurrentPlayerIdentityIntoRoster(legacy,{playerId:'legacy-private',name:'les gladiateurs81',serverId:'884',allianceTag:'ALL4',activityEvents:[event],updatedAt:now});
  assert.equal(wrong.status,'linked_exact');
  assert.equal(wrong.members[0].warboost_linked===true,false);
  assert.equal((wrong.members[0].activity_events||[]).length,0);
  const actual=wrong.members.find(x=>x.name==='les gladiateurs81');assert.equal(actual.warboost_linked,true);assert.equal(actual.player_id,'legacy-private');
  const legacyCloud=mergeCloudRosterWithIdentity(legacy,[{player_id:'legacy-private',name:'les gladiateurs81',server_id:'884',alliance_tag:'ALL4',activity_events:[event],updated_at:now}],{serverId:'884',allianceTag:'ALL4'});
  assert.equal(legacyCloud.roster[0].warboost_linked===true,false);
  assert.equal(legacyCloud.roster.find(x=>x.name==='les gladiateurs81').warboost_linked,true);
  log('legacy HF4 private ids cannot override nickname/server/alliance identity; exact Last War identity is re-proved');
}

// Cloud account aggregation attaches by game identity and never inflates an imported roster.
{
  const cloud=[{player_id:'auth-private-1',name:'les gladiateurs81',server_id:'884',alliance_tag:'ALL4',role:'R4',management_role:'R1',activity_events:[event],updated_at:now}];
  const merged=mergeCloudRosterWithIdentity(roster94(),cloud,{serverId:'884',allianceTag:'ALL4'});
  assert.equal(merged.roster.length,94);assert.equal(merged.unlinked_accounts.length,0);
  const self=merged.roster.find(x=>x.name==='les gladiateurs81');assert.equal(self.warboost_linked,true);assert.equal(eventCountsByType(self.activity_events,{nowMs:Date.parse(now),days:7}).vs,1);
  const unmatched=mergeCloudRosterWithIdentity(roster94(),[{...cloud[0],player_id:'p2',name:'PseudoAbsentDuRoster'}],{serverId:'884',allianceTag:'ALL4'});
  assert.equal(unmatched.roster.length,94);assert.equal(unmatched.unlinked_accounts.length,1);assert.equal(unmatched.unlinked_accounts[0].name,'PseudoAbsentDuRoster');
  assert.equal(Object.hasOwn(unmatched.unlinked_accounts[0],'email'),false);
  log('cloud accounts match by Last War identity; unmatched accounts stay pending without creating a fake roster member');
}

// Once a game-identity link exists, a deliberate nickname change keeps history through the private continuity id.
{
  const first=linkCurrentPlayerIdentityIntoRoster([{name:'Alpha',role:'R3'}],{playerId:'private-id',name:'Alpha',serverId:'884',allianceTag:'ALL4',activityEvents:[event],updatedAt:now});
  const second=linkCurrentPlayerIdentityIntoRoster(first.members,{playerId:'private-id',name:'Alpha Renamed',serverId:'884',allianceTag:'ALL4',activityEvents:[],updatedAt:'2026-09-09T11:20:00Z'});
  assert.equal(second.status,'linked_existing');assert.equal(second.members[0].name,'Alpha Renamed');assert.equal(second.members[0].activity_events.length,1);assert.equal(second.members[0].warboost_linked,true);
  log('nickname change keeps participation history after an established Last War identity link');
}

// Normalization must preserve identity/link metadata and pending account hints without exposing e-mail.
{
  const state=normalizeState({player_id:'p1',player:{name:'Alpha',server_id:'884'},alliance:{tag:'ALL4',members:[{player_id:'p1',name:'Alpha',server_id:'884',alliance_tag:'ALL4',warboost_linked:true,identity_basis:'lastwar_nickname_server_alliance',identity_linked_at:now,activity_events:[event]}],unlinked_accounts:[{name:'Beta',server_id:'884',alliance_tag:'ALL4',reason:'no_roster_match'}]}});
  assert.equal(state.alliance.members[0].warboost_linked,true);assert.equal(state.alliance.members[0].server_id,'884');assert.equal(state.alliance.unlinked_accounts[0].name,'Beta');assert.equal(Object.hasOwn(state.alliance.unlinked_accounts[0],'email'),false);
  log('normalization preserves Last War identity linkage and pending accounts without e-mail identity fields');
}

// Static runtime/UI contract.
{
  const app=read('app.js'),sync=read('api/sync.js'),supabase=read('lib/supabase.js'),identity=read('lib/alliance-identity.js'),html=read('index.html'),health=read('api/health.js'),sw=read('sw.js');
  for(const id of ['allianceIdentitySummary','participationLegend','unlinkedWarBoostDetails','unlinkedWarBoostAccounts'])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(html,/WarBoost V2\.5\.28 HF[567]/);assert.match(app,/reconcileCurrentPlayerAllianceIdentity/);assert.match(app,/saveState\(\);await syncAll\(\);const joined=await joinPendingAlliance\(\);if\(joined\)await syncAll\(\)/);assert.match(sync,/authoritativeTag/);assert.match(sync,/mergeCloudRosterWithIdentity/);assert.match(supabase,/server_id:serverId/);assert.match(supabase,/alliance_tag:profileAlliance/);assert.doesNotMatch(identity,/\.email\b|email\s*:/i);
  assert.match(sw,/warboost-v2-5-28-(?:hf5-lastwar-identity-link|hf6-player-ready-final|hf7-server-alliance-invite-gate)/);assert.match(health,/build:"(?:hf5-lastwar-identity-link|hf6-player-ready-final|hf7-server-alliance-invite-gate)"/);
  for(const flag of ['alliance_identity_lastwar_nickname_server_alliance','alliance_email_never_identity_key','alliance_unmatched_account_never_creates_roster_member','alliance_identity_ambiguous_match_blocked','alliance_legacy_private_id_requires_game_identity_reproof','alliance_nickname_change_history_preserved'])assert.match(health,new RegExp(`${flag}:true`));
  const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
  log('HF5 UI/server contract exposes game-identity linking while preserving the 12-function budget');
}

// New labels exist in all explicit languages (fallback copy is acceptable, missing keys are not).
{
  const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
  const identityKeys=['identity_match_privacy','identity_linked_short','identity_unlinked_short','identity_roster_summary','identity_pending_cloud','identity_unlinked_accounts_title','participation_legend'];
  const en=translator('en-GB');
  for(const [code] of explicit){const tr=translator(code);for(const key of identityKeys){assert.notEqual(tr(key),key,`${code} missing ${key}`);if(!code.startsWith('en'))assert.notEqual(tr(key),en(key),`${code} still inherits English HF5 identity copy for ${key}`)}assert.match(tr('tagline'),/V2\.5\.28 HF[567]/)}
  log('23 explicit language choices resolve localized HF5 identity-link labels without English leakage');
}

console.log('\nWarBoost V2.5.28 HF5 Last War Identity Link verification: PASS');
