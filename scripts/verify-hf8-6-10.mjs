import assert from 'node:assert/strict';
import {mergeCloudRosterWithIdentity} from '../lib/alliance-roster-merge.js';
import {sanitizeCanonicalRoster,mergeCanonicalRoster,replaceCanonicalRosterFromCompleteSnapshot} from '../lib/alliance-scope.js';
import {resolveRosterScanIdentity} from '../lib/roster-identity-resolution.js';

const ctx={serverId:'884',allianceTag:'ALL4'};
const canonical=[{name:'ToyN',role:'R4',power_m:231,hq_level:35,server_id:'884',alliance_tag:'ALL4',membership_status:'active'}];

// 1. Stale profile rank must never move ToyN out of R4.
let merged=mergeCloudRosterWithIdentity(canonical,[{player_id:'p-toyn',name:'[ALL4]ToyN',role:'R5',management_role:'R5',power_m:240,hq_level:35,server_id:'884',alliance_tag:'ALL4'}],ctx).roster[0];
assert.equal(merged.role,'R4');
assert.equal(merged.management_role,'R5');
assert.equal(merged.power_m,240);
assert.equal(merged.delta_m,9);

// 2. Missing cloud power is UNKNOWN: preserve 231, never manufacture 0 or -231.
merged=mergeCloudRosterWithIdentity(canonical,[{player_id:'p-toyn',name:'[ALL4]ToyN',role:'R5',management_role:'R5',power_m:null,hq_level:null,server_id:'884',alliance_tag:'ALL4'}],ctx).roster[0];
assert.equal(merged.role,'R4');
assert.equal(merged.power_m,231);
assert.equal(merged.hq_level,35);
assert.equal(merged.delta_m,null);

// 3. Empty strings and zero-like accidental values must not erase known metrics.
merged=mergeCloudRosterWithIdentity(canonical,[{player_id:'p-toyn',name:'ToyN',role:'R5',power_m:'',hq_level:0,server_id:'884',alliance_tag:'ALL4'}],ctx).roster[0];
assert.equal(merged.power_m,231);
assert.equal(merged.hq_level,35);
assert.equal(merged.delta_m,null);

// 4. Canonical sanitizer must not coerce null/blank to 0.
let clean=sanitizeCanonicalRoster([{name:'A',role:'R3',power_m:null,hq_level:'',server_id:'884',alliance_tag:'ALL4'}],ctx)[0];
assert.equal(clean.power_m,null);
assert.equal(clean.hq_level,null);
assert.equal(clean.role,'R3');

// 5. Missing role remains unknown at canonical sanitation (effective fallback happens later).
clean=sanitizeCanonicalRoster([{name:'A',power_m:100,hq_level:30,server_id:'884',alliance_tag:'ALL4'}],ctx)[0];
assert.equal(clean.role,null);

// 6. Partial canonical refresh must preserve known rank/metrics when incoming data is missing.
let c=mergeCanonicalRoster(canonical,[{name:'ToyN',server_id:'884',alliance_tag:'ALL4',role:null,power_m:null,hq_level:null}],ctx)[0];
assert.equal(c.role,'R4');
assert.equal(c.power_m,231);
assert.equal(c.hq_level,35);

// 7. Complete snapshot may remove absent members, but same-member missing metrics still preserve known values.
c=replaceCanonicalRosterFromCompleteSnapshot(canonical,[{name:'ToyN',server_id:'884',alliance_tag:'ALL4',role:'R4',power_m:null,hq_level:null}],ctx)[0];
assert.equal(c.role,'R4');
assert.equal(c.power_m,231);
assert.equal(c.hq_level,35);

// 8. Scan identity must not expose an unknown previous metric as fake zero.
let r=resolveRosterScanIdentity({name:'ToyN',role:'R4',hq_level:35,power_m:231},{members:[{name:'ToyN',role:'R4',power_m:null,hq_level:null,server_id:'884',alliance_tag:'ALL4'}],review:[],former:[]},{server_id:'884',alliance_tag:'ALL4'});
assert.equal(r.identity_status,'existing');
assert.equal(r.previous_power_m,undefined);
assert.equal(r.previous_hq_level,undefined);

console.log('HF8.6.10 roster integrity regression gate: PASS');
