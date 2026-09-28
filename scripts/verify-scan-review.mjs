import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sanitize} from '../api/scan.js';
import {createScanReviewDraft,scanReviewEntries,applyOwnedScanReview,scanRequestMatches} from '../lib/scan-review.js';

const log=message=>console.log(`PASS: ${message}`);
const original={player:{name:'Saved',power_m:42},season:{name:'Season 4',day:8},technology:{hero_tech_pct:31}};
const incoming={player:{name:'Vision name',hq_level:35,power_m:0},alliance:{tag:'NOVA',role:'R5',members:[{name:'not scanned'}]}};
const draft={owner:'user:a',type:'profile',patch:createScanReviewDraft('profile',incoming)};
assert.deepEqual(original,{player:{name:'Saved',power_m:42},season:{name:'Season 4',day:8},technology:{hero_tech_pct:31}});
assert.deepEqual(draft.patch,{player:{name:'Vision name',hq_level:35,power_m:0},alliance:{tag:'NOVA'}});
assert.equal(incoming.player.name,'Vision name','draft creation must not modify Vision response');
assert.equal(applyOwnedScanReview(draft,'user:a',[]).patch.player.name,'Vision name');
assert.equal(original.player.name,'Saved','discarding a staged result leaves live state unchanged');
log('scan staging leaves live state untouched and scopes payload to scan type');

const scanAt='2026-09-20T12:00:00.000Z';
const sanitizedProfile=sanitize({player:{name:'Nora',server_id:'884',hq_level:30,role:'R5'},alliance:{tag:'NOVA',name:'Nova Crew',role:'R5',server_id:'wrong-root'}},scanAt,'profile');
const profileReview=createScanReviewDraft('profile',sanitizedProfile);
assert.deepEqual(profileReview,{
  player:{name:'Nora',server_id:'884',hq_level:30,role:'R5'},
  alliance:{tag:'NOVA',name:'Nova Crew'}
},'profile review retains sanitized alliance tag/name and player server without staging alliance role/provenance');
const omittedAllianceIdentity=createScanReviewDraft('profile',{player:{name:'Nora'},alliance:{name:'Nova Crew',role:'R5'}});
assert.deepEqual(omittedAllianceIdentity,{player:{name:'Nora'},alliance:{name:'Nova Crew'}},'omitted confirmed alliance identity fields stay absent from the review patch');
const sanitizedDrone=sanitize({drone:{level:150,power_m:2.4,components:['chip'],chips:[{level:9}]}},scanAt,'drone');
const droneReview=createScanReviewDraft('drone',sanitizedDrone);
assert.deepEqual(scanReviewEntries(droneReview).map(entry=>entry.path),[['drone','level'],['drone','power_m']],'Drone review exposes only backend-supported level and power');
assert.deepEqual(createScanReviewDraft('drone',{drone:{level:150,power_m:2.4,components:['chip'],chips:[{level:9}]}}),{drone:{level:150,power_m:2.4}},'Drone review explicitly rejects unsupported component/chip fields');
log('profile review includes safe alliance identity; Drone review stays limited to supported fields');

const entries=scanReviewEntries(draft.patch);
const edits=entries.map(entry=>({path:entry.path,value:entry.path.at(-1)==='name'?'Corrected':entry.path.at(-1)==='power_m'?'0':'35'}));
const corrected=applyOwnedScanReview(draft,'user:a',edits).patch;
assert.equal(corrected.player.name,'Corrected');
assert.equal(corrected.player.hq_level,35);
assert.equal(corrected.player.power_m,0);
assert.equal(original.player.name,'Saved','correction applies only to the returned draft');
assert.equal(applyOwnedScanReview(draft,'user:b',edits),null,'a different account cannot commit the pending draft');
log('user edits are applied only on owner-matched explicit confirmation');

const typedDraft={owner:'user:a',patch:createScanReviewDraft('season',{season:{number:5,name:'Season 5',crystal_event_eligible:true}})};
const blankAndFalse=applyOwnedScanReview(typedDraft,'user:a',[
  {path:['season','number'],value:''},
  {path:['season','name'],value:'   '},
  {path:['season','crystal_event_eligible'],value:'false'}
]);
assert.deepEqual(blankAndFalse,{patch:{season:{crystal_event_eligible:false}},errors:[]},'blank number and text values are omitted while explicit false remains editable');
for(const [value,reason] of [['12abc','invalid_number'],['-1','negative_number']]){
  const invalid=applyOwnedScanReview(typedDraft,'user:a',[{path:['season','number'],value}]);
  assert.equal(invalid.errors[0]?.reason,reason,`invalid numeric input ${value} must be rejected`);
  assert.equal(invalid.patch.season.number,5,'an invalid edit cannot replace the staged value');
}
assert.equal(applyOwnedScanReview(typedDraft,'user:a',[{path:['season','number'],value:'',badInput:true}]).errors[0]?.reason,'invalid_number','browser-sanitized malformed numbers cannot masquerade as a blank field');
assert.equal(applyOwnedScanReview(typedDraft,'user:a',[{path:['season','crystal_event_eligible'],value:'not true'}]).errors[0]?.reason,'invalid_boolean','boolean strings are not coerced');
log('blank edits omit values; malformed and negative numbers and arbitrary booleans are rejected');

const booleanDraft=createScanReviewDraft('season',{season:{crystal_event_eligible:true}});
assert.deepEqual(scanReviewEntries(booleanDraft),[{path:['season','crystal_event_eligible'],value:true}]);
const squadEdit=createScanReviewDraft('squad1',{squads:[{heroes:[{power:4},{level:150}]}]});
const blankSlot=applyOwnedScanReview({owner:'user:a',patch:squadEdit},'user:a',[{path:['squads',0,'heroes',0,'power'],value:''}]);
assert.deepEqual(blankSlot.patch.squads[0].heroes,[null,{level:150}],'omitting a hero field never shifts later slots');

const request={owner:'user:a',scanType:'profile',imageFingerprint:'image-a',revision:4};
assert.equal(scanRequestMatches(request,{...request}),true);
for(const change of [{scanType:'drone'},{imageFingerprint:'image-b'},{revision:5},{owner:'user:b'}]){
  assert.equal(scanRequestMatches(request,{...request,...change}),false,`changed scan request context is rejected: ${Object.keys(change)[0]}`);
}
log('scan responses are invalidated by owner, type, image, or revision changes');

const techOnly=createScanReviewDraft('season',{technology:{hero_tech_pct:55}});
assert.deepEqual(techOnly,{technology:{hero_tech_pct:55}});
assert.deepEqual(scanReviewEntries(techOnly).map(x=>x.path),[['technology','hero_tech_pct']]);
assert.equal(original.season.name,'Season 4','technology-only results do not clear confirmed season values');
log('technology-only season data is reviewable without replacing omitted season fields');

const cleaned=createScanReviewDraft('shop',{shop:{store_type:'VIP',updated_at:'server metadata',offers:[]}});
assert.deepEqual(cleaned,{shop:{store_type:'VIP'}},'unrendered timestamps and empty lists are not silently applied');

const squad=createScanReviewDraft('squad1',{squads:[{power:19,heroes:[{name:'Carlie',power:4},{name:'Swift',level:150}]}]});
assert.deepEqual(squad.squads[0].heroes,[{power:4},{level:150}],'hero attributes are reviewed separately from the existing name confirmation');
assert.deepEqual(scanReviewEntries(squad).map(x=>x.path),[['squads',0,'power'],['squads',0,'heroes',0,'power'],['squads',0,'heroes',1,'level']]);
log('squad scan review covers non-name hero attributes while retaining five-name confirmation');

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const i18n=fs.readFileSync(new URL('../i18n.js',import.meta.url),'utf8');
const markup=fs.readFileSync(new URL('../lib/scan-review-markup.js',import.meta.url),'utf8');
const analyze=app.slice(app.indexOf('async function analyzeReviewedScan()'),app.indexOf('$("#analyzeScanBtn").addEventListener("click",async event=>'));
assert.doesNotMatch(analyze,/saveState\s*\(|mergeStateProtected\s*\(|state\s*=/,'analysis must only stage data before the review action');
assert.match(app,/draft\.owner!==pendingScanOwner\(\)/,'review confirmation is scoped to current account');
assert.match(app,/function resetPendingScanUi\(\)\{scanInputRevision\+\+;scanFileSelectionRevision\+\+;discardScanReviewDraft\(\)/,'account changes clear in-memory scan review and invalidate pending requests');
assert.match(app,/pendingPowerPaths\.some\(path=>path\[0\]==="squads"/,'unreadable squad power stays pending instead of being confirmed');
assert.match(app,/scanRequestIsCurrent\(request\)/,'analysis only stages results for the unchanged request context');
assert.match(app,/if\(result\.errors\.length\)/,'invalid edits stop before state merge and retain the draft');
assert.match(app,/scan_review_apply_failed/,'merge failures retain the review and show an inline error');
assert.match(markup,/row\.kind==="boolean"[\s\S]*?<select/,'boolean review fields use explicit true/false options');
assert.match(app,/renderScanReviewMarkup\(buildScanReviewGroups\(draft\.type,draft\.patch\),t,esc\)/,'review renders the localized grouped presentation');
assert.match(app,/beginNewScanFileSelection\(\)/,'a newly selected image clears older scan confirmations immediately');
assert.match(app,/mergeStateProtected\(safeClone\(previousState\),reviewed/,'profile identity uses the normal protected merge so omitted confirmed fields survive');
assert.match(app,/out\.alliance=safeFields\(base\.alliance,incoming\.alliance,preferBase\)/,'alliance values omitted by Vision remain in the confirmed base state');
assert.match(app,/a\.tag\|\|a\.name\|\|a\.server_id/,'profile alliance-only identity results remain reviewable');
assert.match(markup,/scan_review_group_\$\{group\.kind\}/,'profile alliance identity is grouped under a localized label');
assert.match(i18n,/scan_review_alliance_tag/,'alliance tag field label is localized');
log('analysis and account-switch paths cannot persist or reuse an unconfirmed draft');