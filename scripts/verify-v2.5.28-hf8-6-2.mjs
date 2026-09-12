import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {cleanRosterOcrName,rosterIdentityKey,rosterNameSimilarity,resolveRosterScanIdentity,resolveRosterScanRows,confirmRosterScanPossibleMatch,rosterScanHasUnresolvedIdentity} from '../lib/roster-identity-resolution.js';
import {applyRosterImportLifecycle} from '../lib/alliance-roster-lifecycle.js';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),scan=read('api/scan.js'),health=read('api/health.js'),sw=read('sw.js'),styles=read('styles.css');
const pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest'));
const ctx={server_id:'884',alliance_tag:'ALL4'};
const kaufik={name:'xXx Kaufik ALL4 xXx',server_id:'884',alliance_tag:'ALL4',role:'R4',hq_level:35,power_m:276,updated_at:'2026-09-01T08:00:00.000Z',joined_at:'2026-01-01T00:00:00.000Z'};
const current={members:[kaufik],review:[],former:[]};

// Bracketed alliance display tag is UI context, never part of the nickname.
assert.equal(cleanRosterOcrName('[ALL4]xXx Kaufik ALL4 xXx','ALL4'),'xXx Kaufik ALL4 xXx');
assert.equal(cleanRosterOcrName('［ALL4］ Nono 50','ALL4'),'Nono 50');
assert.equal(cleanRosterOcrName('xXx Kaufik ALL4 xXx','ALL4'),'xXx Kaufik ALL4 xXx','bare ALL4 inside a nickname was removed');
assert.equal(rosterIdentityKey('[ALL4]xXx Kaufik ALL4 xXx','ALL4'),rosterIdentityKey(kaufik.name,'ALL4'));

// A power increase and even rank/HQ changes must NEVER create a new identity.
let row=resolveRosterScanIdentity({name:'[ALL4]xXx Kaufik ALL4 xXx',role:'R4',hq_level:35,power_m:320.7,confidence:.98},current,ctx);
assert.equal(row.identity_status,'existing');
assert.equal(row.name,kaufik.name);assert.equal(row.previous_power_m,276);assert.equal(row.power_m,320.7);assert.equal(row.identity_needs_confirmation,false);
row=resolveRosterScanIdentity({name:'[ALL4]xXx Kaufik ALL4 xXx',role:'R3',hq_level:36,power_m:401.2,confidence:.99},current,ctx);
assert.equal(row.identity_status,'existing','grade/HQ progression incorrectly changed identity');

// Different people remain different even when their grade/HQ/power are close.
const other=resolveRosterScanIdentity({name:'KaufiK2',role:'R4',hq_level:35,power_m:321},current,ctx);
assert.notEqual(other.identity_status,'existing');

// OCR uncertainty may suggest an existing player, but it must never auto-merge.
const possible=resolveRosterScanIdentity({name:'xXx Kaufik ALL4 xX',role:'R4',hq_level:35,power_m:320.7},current,ctx);
assert.equal(possible.identity_status,'possible');assert.equal(possible.identity_needs_confirmation,true);assert.equal(rosterScanHasUnresolvedIdentity([possible]),true);
const confirmed=confirmRosterScanPossibleMatch(possible,current,ctx);assert.equal(confirmed.identity_status,'existing');assert.equal(confirmed.name,kaufik.name);assert.equal(rosterScanHasUnresolvedIdentity([confirmed]),false);

// Ambiguous near matches are blocked rather than guessed.
const ambiguousCurrent={members:[{...kaufik,name:'AlphaOne'},{...kaufik,name:'Alpha0ne'}],review:[],former:[]};
const amb=resolveRosterScanIdentity({name:'AlphaOnee',role:'R4',hq_level:35,power_m:400},ambiguousCurrent,ctx);
assert.ok(['possible','ambiguous'].includes(amb.identity_status));assert.equal(amb.identity_needs_confirmation,true);

// Former member is recognized as the same identity and will be reintegrated, not duplicated.
const former={...kaufik,left_at:'2026-09-05T10:00:00.000Z',membership_status:'left_confirmed'};
const formerRow=resolveRosterScanIdentity({name:'[ALL4]xXx Kaufik ALL4 xXx',role:'R4',hq_level:35,power_m:330}, {members:[],review:[],former:[former]},ctx);
assert.equal(formerRow.identity_status,'former');

// Importing Kaufik at 320.7M updates ONE member in place and retains both power observations.
const incoming={...row,name:kaufik.name,server_id:'884',alliance_tag:'ALL4',role:'R4',hq_level:35,power_m:320.7,updated_at:'2026-09-12T08:11:00.000Z',source:'roster_scan'};
const life=applyRosterImportLifecycle({members:[kaufik],review:[],former:[]},[incoming],{complete:false,now:'2026-09-12T08:11:00.000Z'});
assert.equal(life.members.length,1,'power progression created a duplicate member');
assert.equal(life.members[0].power_m,320.7);
assert.ok(life.members[0].power_history.some(x=>x.power_m===276),'old power was not preserved');
assert.ok(life.members[0].power_history.some(x=>x.power_m===320.7),'new power observation was not preserved');

// Two distinct scanned rows survive identity resolution as two rows.
const two=resolveRosterScanRows([{name:'[ALL4]xXx Kaufik ALL4 xXx',role:'R4',hq_level:35,power_m:320.7},{name:'Brand New',role:'R3',hq_level:35,power_m:280}],current,ctx);
assert.equal(two.length,2);assert.equal(two[0].identity_status,'existing');assert.equal(two[1].identity_status,'new');

// Browser integration: pass current state to vision, re-resolve before import and block uncertain matches.
assert.match(app,/current_state:state/);assert.match(app,/resolveCurrentRosterScanDraft/);assert.match(app,/rosterScanHasUnresolvedIdentity\(rosterScanDraft\)/);assert.match(app,/confirmRosterScanPossibleMatch/);assert.match(app,/roster_identity_unresolved_block/);
assert.match(app,/result\.added>0\)\{rosterScanDraft=\[\]/,'adding a new screenshot did not invalidate stale OCR results');
assert.match(styles,/\.rosterIdentityStatus/);

// Vision contract explicitly separates alliance tag from nickname and preserves trailing digits.
assert.match(scan,/square brackets before the nickname/);assert.match(scan,/Never delete a bare token/);assert.match(scan,/Preserve trailing digits/);assert.match(scan,/Power, HQ and rank can change over time and must never be used to decide/);
assert.match(scan,/sanitizeRosterRows\(extracted,new Date\(\)\.toISOString\(\),rosterAllianceTag\)/);

// All explicit languages expose identity UX keys, not raw keys.
const explicit=LANGUAGES.filter(([code])=>code!=='auto');assert.equal(explicit.length,23);
for(const [code] of explicit){const tr=translator(code);for(const k of ['roster_scan_reanalyze','roster_identity_existing','roster_identity_former','roster_identity_new','roster_identity_possible','roster_identity_use_match','roster_identity_ambiguous','roster_identity_unresolved_block'])assert.notEqual(tr(k),k,`${code} missing ${k}`)}

// Version/cache/health/security contracts.
assert.match(html,/V2\.5\.28 HF8\.6\.2/);assert.match(manifest.name,/HF8\.6\.2/);assert.match(pkg.description,/HF8\.6\.2/);assert.match(sw,/hf8-6-2-reliable-roster-identity/);assert.match(health,/ui_revision_final:"hf8\.6\.2-reliable-roster-identity"/);
for(const flag of ['alliance_roster_identity_power_never_identity','alliance_roster_identity_alliance_tag_prefix_removed','alliance_roster_identity_exact_existing_updates_in_place','alliance_roster_identity_fuzzy_match_requires_confirmation','alliance_roster_identity_unresolved_blocks_import','alliance_roster_member_power_history_preserved'])assert.match(health,new RegExp(`${flag}:true`));
assert.match(pkg.scripts.check,/roster-identity-resolution\.js/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf8-6-2\.mjs/);
assert.doesNotMatch(app,/localStorage\.clear\s*\(/);
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
const migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?6[_-]?2/i.test(x));assert.equal(migrations.length,0,'HF8.6.2 must not add a Supabase migration');

console.log('WarBoost V2.5.28 HF8.6.2 Reliable Roster Identity verification: PASS');
