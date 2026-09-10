import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildAllianceAdvice} from '../api/advice.js';
import {parseRosterImport} from '../lib/roster-import.js';
import {LANGUAGES,translator} from '../i18n.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const log=x=>console.log(`✓ ${x}`);
const now='2026-09-08T10:46:00.000Z';
const stale='2026-08-20T10:46:00.000Z';

// Exact Preview-like regression: 94 stale members must not create a false "0 inactive" verdict.
{
  const members=Array.from({length:94},(_,i)=>({
    name:`Joueur${String(i+1).padStart(2,'0')}`,
    role:i<10?'R4':i<80?'R3':i<91?'R2':'R1',
    power_m:100-i/10,
    updated_at:stale,last_active_at:stale,delta_m:0,vs_points:0
  }));
  const out=buildAllianceAdvice({alliance:{members}},'fr-FR');
  assert.equal(out.activity.active,0);
  assert.equal(out.activity.refresh,94);
  assert.equal(out.activity.inactive,0);
  assert.equal(out.inactivity_evaluated,false);
  assert.equal(out.immediate_actions.length,0);
  assert.deepEqual(out.plan_b.map(x=>x.kind),['refresh']);
  assert.equal(out.plan_b[0].count,94);
  assert.match(out.advice,/inactivité non évaluée/i);
  assert.doesNotMatch(out.advice,/0 inactifs probables/i);
  assert.doesNotMatch(out.advice,/R5\/R4 pilotent/i,'Generic tactical role framing must not appear while the roster is stale');
  log('94 stale members show inactivity not evaluated, refresh-only Plan B and zero tactical assignments');
}

// One self/real positive member + 93 stale members: only the confirmed active member may be assigned.
{
  const active={name:'Alpha',role:'R4',power_m:110,updated_at:now,last_active_at:now,delta_m:1};
  const staleMembers=Array.from({length:93},(_,i)=>({name:`Old${i+1}`,role:'R3',power_m:90-i/10,updated_at:stale,last_active_at:stale,delta_m:0,vs_points:0}));
  const out=buildAllianceAdvice({alliance:{members:[active,...staleMembers]}},'fr-FR');
  assert.equal(out.activity.active,1);assert.equal(out.activity.refresh,93);assert.equal(out.activity.inactive,0);
  assert.equal(out.inactivity_evaluated,false);
  assert.equal(out.plan_b.find(x=>x.kind==='refresh')?.count,93);
  assert.deepEqual(out.immediate_actions.flatMap(x=>x.members||[]),['Alpha']);
  assert.match(out.advice,/1 actifs confirmés · 93 à actualiser · inactivité non évaluée/i);
  log('1 active / 93 stale keeps assignments evidence-only and does not invent inactivity');
}

// Unknown members are already included in refresh; Plan B must never double-count them.
{
  const members=Array.from({length:94},(_,i)=>({name:`Unknown${i+1}`,role:'R3'}));
  const out=buildAllianceAdvice({alliance:{members}},'en-GB');
  assert.equal(out.activity.unknown,94);
  assert.equal(out.activity.refresh,94,'unknown is intentionally included in refresh');
  assert.equal(out.plan_b.find(x=>x.kind==='refresh')?.count,94,'unknown members must not be counted twice');
  assert.match(out.advice,/inactivity not evaluated/i);
  log('Unknown roster members are never double-counted in Plan B');
}

// A real probable-inactive verdict still works when fresh negative evidence is actually present.
{
  const inactive={name:'Observed',role:'R2',updated_at:now,last_active_at:'2026-08-20T00:00:00.000Z',delta_m:0,vs_points:0,season_points:0};
  const out=buildAllianceAdvice({alliance:{members:[inactive]}},'fr-FR');
  assert.equal(out.activity.inactive,1);assert.equal(out.activity.refresh,0);assert.equal(out.inactivity_evaluated,true);
  assert.match(out.advice,/1 inactifs probables/i);
  assert.doesNotMatch(out.advice,/inactivité non évaluée/i);
  log('Probable inactivity remains available only when fresh negative evidence exists');
}

// French/Excel-friendly import example is accepted exactly as displayed in the UI.
{
  const rows=parseRosterImport('Joueur01;R4;30;65,2',{now});
  assert.equal(rows.length,1);assert.equal(rows[0].name,'Joueur01');assert.equal(rows[0].role,'R4');assert.equal(rows[0].hq_level,30);assert.equal(rows[0].power_m,65.2);
  log('Displayed French CSV/Excel example parses correctly with semicolons and decimal comma');
}

// All explicit languages must resolve the HF3 public-beta and reliability labels without falling back to key names.
{
  const explicit=LANGUAGES.filter(([code])=>code!=='auto');
  assert.equal(explicit.length,23);
  const keys=['beta_signin_required','beta_invite_required','beta_pro_free','beta_payment_disabled','invite_note','ai_estimate','activity_inactivity_not_evaluated','alliance_plan_refresh_required','alliance_plan_partial_refresh'];
  for(const [code] of explicit){
    const tr=translator(code);
    for(const key of keys)assert.notEqual(tr(key),key,`${code} missing ${key}`);
    assert.match(tr('invite_note',{alliance:'ALL4'}),/WarBoost/);
  }
  const fr=translator('fr'),en=translator('en-GB');
  assert.doesNotMatch(fr('beta_signin_required'),/privée/i);assert.match(fr('beta_signin_required'),/publique/i);
  assert.doesNotMatch(fr('beta_pro_free'),/privée/i);assert.match(fr('beta_pro_free'),/publique/i);
  assert.doesNotMatch(en('beta_signin_required'),/private/i);assert.match(en('beta_signin_required'),/public/i);
  assert.doesNotMatch(en('beta_pro_free'),/private/i);assert.match(en('beta_pro_free'),/public/i);
  assert.doesNotMatch(fr('invite_note',{alliance:'ALL4'}),/remonte ensuite automatiquement/i);
  log('23 languages resolve public-beta wording and Alliance reliability labels consistently');
}

// UI/client/health/cache contract for the deployable HF3 build.
{
  const html=read('index.html'),app=read('app.js'),health=read('api/health.js'),sw=read('sw.js'),pkg=JSON.parse(read('package.json'));
  assert.match(html,/WarBoost V2\.5\.28 HF(?:3|4|5|6|7)/);
  assert.match(html,/placeholder="Joueur01;R4;30;65,2"/);
  assert.match(html,/data-i18n="ai_estimate">Fiabilité des données/);
  assert.match(app,/const inactivityPending=/);
  assert.match(app,/activity_inactivity_not_evaluated/);
  assert.match(app,/alliance_plan_refresh_required/);
  assert.match(app,/alliance_plan_partial_refresh/);
  assert.match(health,/build:"(?:hf3-final-reliability|hf4-final-management-ai|hf5-lastwar-identity-link|hf6-player-ready-final|hf7-server-alliance-invite-gate)"/);
  assert.match(health,/activity_zero_inactive_not_overclaimed_when_refresh_pending:true/);
  assert.match(health,/alliance_refresh_plan_never_double_counts_unknown:true/);
  assert.match(health,/public_beta_wording_consistent_23_languages:true/);
  assert.match(sw,/warboost-v2-5-28-(?:hf2-declared-r4-r5-advice-hf3-final-reliability|hf4-final-management-ai|hf5-lastwar-identity-link|hf6-player-ready-final|hf7-server-alliance-invite-gate)/);
  assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf3\.mjs/);
  log('HF3 UI, health safeguards, cache bump and verification hook are present');
}

console.log('\nWarBoost V2.5.28 HF3 Final Reliability verification: PASS');
