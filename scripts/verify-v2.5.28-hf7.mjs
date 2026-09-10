import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {managerProofFromState,joinProofForAlliance,sanitizeCanonicalRoster,strictRosterIdentityCandidates,mergeCanonicalRoster} from '../lib/alliance-scope.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const log=x=>console.log(`HF7 ✓ ${x}`);

const roster=[
  {name:'AlphaR5',role:'R5',server_id:'884',alliance_tag:'ALL4',hq_level:30,power_m:80,email:'must-not-survive@example.com'},
  {name:'les gladiateurs81',role:'R4',server_id:'884',alliance_tag:'ALL4',hq_level:30,power_m:70},
  {name:'MemberR3',role:'R3',server_id:'884',alliance_tag:'ALL4',hq_level:29,power_m:50}
];
const state=(name='les gladiateurs81',server='884',tag='ALL4',role='R4',members=roster)=>({player:{name,server_id:server,role},alliance:{tag,members}});

// Manager creation/share proof is exact Last War nickname + server + alliance + roster R4/R5.
{
  const p=managerProofFromState(state());assert.equal(p.ok,true);assert.equal(p.roster_role,'R4');assert.equal(p.scope.server_id,'884');assert.equal(p.scope.alliance_tag,'ALL4');
  assert.equal(Object.hasOwn(p.roster[0],'email'),false);
  const r3=managerProofFromState(state('MemberR3','884','ALL4','R3'));assert.equal(r3.ok,false);assert.equal(r3.code,'manager_roster_role_required');
  const missing=managerProofFromState(state('Nobody','884','ALL4','R4'));assert.equal(missing.ok,false);assert.equal(missing.code,'manager_roster_match_required');
  log('only an exact Last War R5/R4 roster identity can establish/share an alliance space; e-mail is never copied into canonical roster');
}

// Joining is fail-closed by exact target server + alliance + nickname roster membership.
{
  const alliance={id:'a1',server_id:'884',tag:'ALL4',name:'ALL FOR 1',roster:sanitizeCanonicalRoster(roster,{serverId:'884',allianceTag:'ALL4'})};
  let p=joinProofForAlliance(state('MemberR3','884','ALL4','R3'),alliance);assert.equal(p.ok,true);assert.equal(p.roster_role,'R3');
  p=joinProofForAlliance(state('MemberR3','885','ALL4','R3'),alliance);assert.equal(p.ok,false);assert.equal(p.code,'alliance_server_mismatch');
  p=joinProofForAlliance(state('MemberR3','884','OTHER','R3'),alliance);assert.equal(p.ok,false);assert.equal(p.code,'alliance_tag_mismatch');
  p=joinProofForAlliance(state('Unknown','884','ALL4','R1'),alliance);assert.equal(p.ok,false);assert.equal(p.code,'player_not_in_alliance_roster');
  p=joinProofForAlliance(state('MemberR3','884','ALL4','R3'),{...alliance,roster:[]});assert.equal(p.ok,false);assert.equal(p.code,'alliance_roster_not_ready');
  const dup={...alliance,roster:[...alliance.roster,{...alliance.roster[2]}]};p=joinProofForAlliance(state('MemberR3','884','ALL4','R3'),dup);assert.equal(p.ok,false);assert.equal(p.code,'alliance_roster_identity_ambiguous');
  log('valid code alone is insufficient: cross-server, cross-alliance, outsider and ambiguous roster joins are blocked');
}

// Strict matching never treats missing context as an exact match.
{
  assert.equal(strictRosterIdentityCandidates([{name:'A',server_id:'',alliance_tag:'ALL4'}],{nickname:'A',server_id:'884',alliance_tag:'ALL4'}).length,0);
  assert.equal(strictRosterIdentityCandidates([{name:'A',server_id:'884',alliance_tag:'ALL4'}],{nickname:'A',server_id:'884',alliance_tag:'ALL4'}).length,1);
  log('server and alliance context are mandatory for exact invitation admission');
}

// Canonical roster refreshes keep R5/R4 participation evidence while stripping private fields.
{
  const old=[{...roster[2],activity_events:[{event_type:'vs',event_date:'2026-09-07',participation_status:'participated',updated_at:'2026-09-07T20:00:00Z',source:'player_self_report'}],email:'private@example.com'}];
  const fresh=[{...roster[2],power_m:55,activity_events:[{event_type:'desert_storm',event_date:'2026-09-09',participation_status:'excused',updated_at:'2026-09-09T20:00:00Z',source:'r5_r4_import'}]}];
  const merged=mergeCanonicalRoster(old,fresh,{serverId:'884',allianceTag:'ALL4'});assert.equal(merged.length,1);assert.equal(merged[0].power_m,55);assert.equal(merged[0].activity_events.length,2);assert.equal(Object.hasOwn(merged[0],'email'),false);assert.equal(Object.hasOwn(merged[0],'player_id'),false);
  log('canonical roster refresh preserves participation evidence and never stores e-mail/private account ids');
}

// Additive database migration: scope + canonical roster, legacy HF6 backfill, no destructive data mutation.
{
  const sql=read('supabase/migration_v2_5_28_hf7_alliance_scope.sql');
  assert.match(sql,/add column if not exists server_id text/i);assert.match(sql,/add column if not exists roster jsonb/i);assert.match(sql,/add column if not exists roster_updated_at/i);
  assert.match(sql,/state #>> '\{player,server_id\}'/);assert.match(sql,/state #> '\{alliance,members\}'/);assert.match(sql,/jsonb_build_object/);assert.match(sql,/'activity_events'/);assert.match(sql,/wb1_alliances_server_tag_unique_idx/);assert.doesNotMatch(sql,/['"]email['"]/i);assert.doesNotMatch(sql,/['"]player_id['"]/i);
  assert.doesNotMatch(sql,/\bdrop\s+table\b/i);assert.doesNotMatch(sql,/\btruncate\b/i);assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
  const schema=read('supabase/schema.sql');assert.match(schema,/server_id text/);assert.match(schema,/roster jsonb not null default '\[\]'::jsonb/);
  log('HF7 Supabase migration is additive/idempotent and backfills existing alliance scope/roster without deleting data');
}

// Runtime flow persists identity before join, manager syncs roster before invite, and management is not granted to R1-R3.
{
  const app=read('app.js'),invite=read('api/invite.js'),join=read('api/join.js'),sync=read('api/sync.js'),supabase=read('lib/supabase.js');
  assert.match(app,/await syncAll\(\);const joined=await joinPendingAlliance\(\);if\(joined\)await syncAll\(\)/);
  assert.match(app,/await syncAll\(\);const rr=await fetch\("\/api\/invite"/);
  assert.match(app,/management_verified=j\.scope_verified===true&&\["R4","R5"\]/);
  assert.match(invite,/managerProofFromState/);assert.match(invite,/findAllianceByScope/);assert.match(invite,/alliance_space_exists_invitation_required/);assert.match(invite,/fresh\.roster\.length>=existingCount/);assert.match(invite,/mergeCanonicalRoster/);assert.match(invite,/alliance_scope_ambiguous_admin_required/);
  assert.match(join,/joinProofForAlliance/);assert.match(join,/The invite code is not authorization by itself/);assert.match(join,/role:proof\.roster_role/);assert.match(join,/findAllianceByScope/);assert.match(join,/alliance_scope_ambiguous_admin_required/);
  assert.match(sync,/managementVerified=Boolean/);assert.match(sync,/updateAllianceScopeRoster/);assert.match(sync,/mergeCanonicalRoster/);assert.match(sync,/ctx\.cloud_roster/);
  assert.match(supabase,/findAllianceByScope/);assert.match(supabase,/roster_updated_at/);assert.match(supabase,/canonicalRoster/);
  log('browser/API/cloud flow saves identity first, scopes manager sharing, gates joins, preserves roster roles and avoids partial-roster overwrite');
}

// Health/cache/package contract remains within the 12 serverless function budget.
{
  const health=read('api/health.js'),sw=read('sw.js'),html=read('index.html'),pkg=JSON.parse(read('package.json'));
  assert.match(health,/build:"hf7-server-alliance-invite-gate"/);assert.match(health,/alliance_scope_schema/);
  for(const flag of ['alliance_invites_r5_r4_only','alliance_invitation_exact_server_scope','alliance_invitation_exact_alliance_scope','alliance_invitation_exact_roster_nickname_required','alliance_invitation_code_never_authorizes_by_itself','alliance_outsider_join_fail_closed','alliance_cross_server_join_blocked','alliance_cross_alliance_join_blocked','alliance_switch_requires_target_roster_proof','alliance_canonical_roster_server_side','alliance_canonical_roster_preserves_participation_evidence','alliance_email_never_invite_identity_key'])assert.match(health,new RegExp(`${flag}:true`));
  assert.match(sw,/warboost-v2-5-28-hf7-server-alliance-invite-gate/);assert.match(sw,/\/lib\/alliance-scope\.js/);assert.match(html,/WarBoost V2\.5\.28 HF7/);assert.match(html,/data-i18n="invite_note_scoped"/);
  const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);assert.match(pkg.scripts.check,/alliance-scope\.js/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf7\.mjs/);
  log('HF7 health/cache/UI/test contract exposes the new gate while preserving exactly 12 serverless APIs');
}

// Every explicit language receives the security-critical invitation/join copy.
{
  const explicit=LANGUAGES.filter(([c])=>c!=='auto');assert.equal(explicit.length,23);const en=translator('en-GB');
  const keys=['invite_note_scoped','alliance_invite_ready_scoped','alliance_joined_scoped','alliance_invite_manager_only','alliance_manager_roster_match_required','alliance_roster_identity_ambiguous','lastwar_nickname_required','lastwar_server_required','lastwar_alliance_required','lastwar_identity_required','alliance_space_exists_invitation_required','alliance_scope_not_ready','alliance_server_mismatch','alliance_tag_mismatch','alliance_roster_not_ready','player_not_in_alliance_roster','alliance_scope_ambiguous_admin_required'];
  for(const [code] of explicit){const tr=translator(code);for(const key of keys){assert.notEqual(tr(key),key,`${code} missing ${key}`);if(!code.startsWith('en'))assert.notEqual(tr(key),en(key),`${code} inherits English HF7 security copy for ${key}`)}assert.match(tr('tagline'),/V2\.5\.28 HF7/)}
  log('23 explicit languages contain localized HF7 alliance invitation security messages');
}

console.log('\nWarBoost V2.5.28 HF7 Server + Alliance Invite Gate verification: PASS');
