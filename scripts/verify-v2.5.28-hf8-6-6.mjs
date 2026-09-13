import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LANGUAGES,translator} from '../i18n.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const app=read('app.js');
const html=read('index.html');
const pending=read('lib/pending-scan-storage.js');
const sw=read('sw.js');
const health=read('api/health.js');
const pkg=JSON.parse(read('package.json'));

assert.match(app,/RELEASE_LABEL="HF8\.6\.6"/);
assert.match(app,/from "\.\/lib\/pending-scan-storage\.js"/);
assert.match(app,/savePendingSingleScan/);
assert.match(app,/loadPendingSingleScan/);
assert.match(app,/savePendingRosterFiles/);
assert.match(app,/loadPendingRosterFiles/);
assert.match(app,/movePendingScans/);
assert.match(app,/pendingScanOwner\(session=cloudSession\)/);
assert.match(app,/scanResultHasUsefulData/);
assert.match(app,/if\(!scanResultHasUsefulData\(scanType,j\.state\)\)/);
assert.match(app,/closeHeroConfirmation\(false\)/);
assert.match(app,/pending_cloud_save:true/);
assert.match(app,/scheduleCloudRetry/);
assert.match(app,/pagehide/);
assert.match(app,/visibilitychange/);
assert.match(app,/keepalive:Boolean\(keepalive\)/);
assert.match(app,/safeLocalSet\(STORE_KEY/);
assert.match(app,/scan_pending_local_failed/);

assert.match(pending,/DB_NAME="warboost-pending-scans-v1"/);
assert.match(pending,/SINGLE_TTL_MS=48\*60\*60\*1000/);
assert.match(pending,/ROSTER_TTL_MS=48\*60\*60\*1000/);
assert.match(pending,/ROSTER_MAX_BYTES=60\*1024\*1024/);
assert.match(pending,/recordKey\(owner,"single"\)/);
assert.match(pending,/recordKey\(owner,"roster"\)/);
assert.match(pending,/new File\(/);

for(const id of ['scanFile','scanPreview','clearScanCaptureBtn','rosterScanFiles']) assert.match(html,new RegExp(`id=["']${id}["']`));
assert.match(html,/HF8\.6\.6/);
assert.match(html,/data-i18n="privacy_scan"/);
assert.match(sw,/hf8-6-6-scan-persistence-reliability/);
assert.match(sw,/\/lib\/pending-scan-storage\.js/);
assert.match(health,/pending_scan_indexeddb_persistence:true/);
assert.match(health,/pending_roster_queue_indexeddb_persistence:true/);
assert.match(health,/cloud_save_retry_on_mobile_lifecycle:true/);
assert.match(pkg.description,/HF8\.6\.6/);
assert.match(pkg.scripts.check,/lib\/pending-scan-storage\.js/);

// 22 selectable languages + en-GB + en-US + auto = 24 entries total.
assert.equal(LANGUAGES.length,24);
const fr=translator('fr');
assert.match(fr('privacy_scan'),/48 h/);
assert.match(fr('tagline'),/HF8\.6\.6/);
assert.notEqual(fr('scan_pending_local_failed'),'scan_pending_local_failed');
const en=translator('en-GB');
assert.match(en('privacy_scan'),/48 hours/);

const migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?6[_-]?6/i.test(x));
assert.equal(migrations.length,0,'HF8.6.6 must not require a Supabase migration');
const apis=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));
assert.equal(apis.length,12,'HF8.6.6 must stay within the existing 12 Vercel functions');

console.log('WarBoost V2.5.28 HF8.6.6 Scan Persistence Reliability verification: PASS');
