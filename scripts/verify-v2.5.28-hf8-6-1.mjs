import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {appendRosterScanFiles,removeRosterScanFile,rosterScanFileKey,DEFAULT_ROSTER_SCAN_FILE_LIMIT} from '../lib/roster-scan-queue.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('index.html'),styles=read('styles.css'),health=read('api/health.js'),sw=read('sw.js');
const pkg=JSON.parse(read('package.json')),manifest=JSON.parse(read('manifest.webmanifest'));

const shot=(name,size,lastModified,type='image/png')=>({name,size,lastModified,type});
const a=shot('Screenshot_1.png',1000,1),b=shot('Screenshot_2.png',1100,2),c=shot('Screenshot_3.png',1200,3);
let q=appendRosterScanFiles([], [a], {limit:24});
assert.equal(q.files.length,1);assert.equal(q.added,1);
q=appendRosterScanFiles(q.files,[b],{limit:24});
assert.equal(q.files.length,2,'second picker opening replaced the first capture');
q=appendRosterScanFiles(q.files,[c],{limit:24});
assert.equal(q.files.length,3,'third picker opening did not append');
q=appendRosterScanFiles(q.files,[a],{limit:24});
assert.equal(q.files.length,3);assert.equal(q.duplicates,1,'exact duplicate was not ignored');
assert.equal(rosterScanFileKey(a),rosterScanFileKey({...a}));
q.files=removeRosterScanFile(q.files,1);assert.deepEqual(q.files.map(x=>x.name),['Screenshot_1.png','Screenshot_3.png']);
assert.equal(DEFAULT_ROSTER_SCAN_FILE_LIMIT,24);
const twentyFive=Array.from({length:25},(_,i)=>shot(`s${i}.png`,100+i,i));
const capped=appendRosterScanFiles([],twentyFive);assert.equal(capped.files.length,24);assert.equal(capped.overflow,1);
const invalid=appendRosterScanFiles([], [{name:'notes.txt',size:4,lastModified:9,type:'text/plain'}]);assert.equal(invalid.files.length,0);assert.equal(invalid.invalid,1);

// Browser integration: the native FileList is never assigned directly to the queue anymore.
assert.match(app,/appendRosterScanFiles\(rosterScanFiles,e\.target\.files/);
assert.match(app,/e\.target\.value=""/,'native picker must reset after every selection');
assert.doesNotMatch(app,/rosterScanFiles=\[\.\.\.\(e\.target\.files\|\|\[\]\)\]/,'legacy replacement handler still present');
assert.match(app,/removeRosterScanFile\(rosterScanFiles/);
assert.match(app,/function renderRosterScanFiles\(/);
assert.match(app,/ROSTER_SCAN_FILE_LIMIT=DEFAULT_ROSTER_SCAN_FILE_LIMIT/);
assert.match(html,/id="rosterScanFileList"/);
assert.match(html,/id="rosterScanFiles"[^>]*multiple/);
assert.match(styles,/\.rosterScanFileList/);assert.match(styles,/\.rosterScanFileItem/);

// Version/cache/health contracts.
assert.match(html,/V2\.5\.28 HF8\.6\.(?:1|2)/);assert.match(manifest.name,/HF8\.6\.(?:1|2)/);
assert.match(sw,/hf8-6-(?:1-additive-roster-capture-queue|2-reliable-roster-identity)/);
assert.match(health,/ui_revision_final:"hf8\.6\.(?:1-additive-roster-capture-queue|2-reliable-roster-identity)"/);
for(const flag of ['alliance_roster_android_additive_capture_queue','alliance_roster_capture_picker_resets_without_clearing_queue','alliance_roster_capture_deduplication','alliance_roster_capture_individual_remove','alliance_roster_capture_queue_limit_24'])assert.match(health,new RegExp(`${flag}:true`));
assert.match(pkg.description,/HF8\.6\.(?:1|2)/);assert.match(pkg.scripts.check,/roster-scan-queue\.js/);assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf8-6-1\.mjs/);

// Core safeguards remain intact.
assert.doesNotMatch(app,/localStorage\.clear\s*\(/);
const apiFiles=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));assert.equal(apiFiles.length,12);
const migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?6[_-]?1/i.test(x));assert.equal(migrations.length,0,'HF8.6.1 must not add a Supabase migration');

console.log('WarBoost V2.5.28 HF8.6.1 Additive Roster Capture Queue verification: PASS');
