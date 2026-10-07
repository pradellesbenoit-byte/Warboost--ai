import assert from 'node:assert/strict';
import {buildScanReviewGroups,serializeScanReviewGear} from '../lib/scan-review-presentation.js';
import {applyOwnedScanReview,createScanReviewDraft} from '../lib/scan-review.js';

const squadPatch=createScanReviewDraft('squad1',{squads:[{
  power:0,
  heroes:[{name:'Carlie',level:0,stars:3,power:0,exclusive:'not visible',gear:'count=4;levels=40,40,40,40'}]
}]});
const squadGroups=buildScanReviewGroups('squad1',squadPatch);
assert.equal(squadGroups.filter(group=>group.kind==='hero').length,5,'all five hero slots must be represented');
assert.equal(squadGroups[0].kind,'squad','squad power stays in its own group');
assert.equal(squadGroups[0].rows[0].status,'missing','zero squad power is treated as unobserved');
const firstHero=squadGroups.find(group=>group.kind==='hero'&&group.number===1);
assert.deepEqual(firstHero.rows.map(row=>row.field),['name','level','stars','power','exclusive','gear']);
assert.equal(firstHero.rows.find(row=>row.field==='level').status,'missing','an unobserved hero level is blank');
assert.equal(firstHero.rows.find(row=>row.field==='stars').value,3);
assert.equal(firstHero.rows.find(row=>row.field==='power').status,'missing');
assert.equal(firstHero.rows.find(row=>row.field==='exclusive').exclusiveNotVisible,true);
assert.equal(firstHero.rows.find(row=>row.field==='exclusive').status,'missing');
assert.deepEqual(firstHero.rows.find(row=>row.field==='gear').value,[{count:4,levels:[40,40,40,40],rarity:''}]);
assert.equal(JSON.stringify(squadGroups).includes('count=4;levels=40,40,40,40'),false,'technical gear encoding is never a presentation value');
assert.equal(squadGroups.find(group=>group.kind==='hero'&&group.number===2).rows.every(row=>row.status==='missing'),true,'an absent hero slot is fully blank');

const ownerDraft={owner:'user:a',patch:squadPatch};
const confirmed=applyOwnedScanReview(ownerDraft,'user:a',[
  {path:['squads',0,'heroes',0,'exclusive'],value:''},
  {path:['squads',0,'heroes',0,'level'],value:'55'},
  {path:['squads',0,'heroes',1,'stars'],value:'2'},
  {path:['squads',0,'power'],value:'12.5'}
]);
assert.deepEqual(confirmed.errors,[]);
assert.equal(confirmed.patch.squads[0].heroes[0].exclusive,undefined,'blank confirmation never persists opaque no-weapon text');
assert.equal(confirmed.patch.squads[0].heroes[0].level,55,'missing whitelisted hero fields can be entered');
assert.equal(confirmed.patch.squads[0].heroes[1].stars,2,'an entirely missing slot can be edited without shifting slots');
assert.equal(confirmed.patch.squads[0].power,12.5,'a missing squad power can be supplied from its blank input');
assert.equal(applyOwnedScanReview(ownerDraft,'user:a',[{path:['squads',0,'power'],value:'invalid'}]).errors[0]?.reason,'invalid_number','optional squad power still uses numeric validation');
const concreteExclusive=applyOwnedScanReview(ownerDraft,'user:a',[{path:['squads',0,'heroes',0,'exclusive'],value:'Visible weapon detail'}]);
assert.equal(concreteExclusive.patch.squads[0].heroes[0].exclusive,'Visible weapon detail','concrete exclusive edits are retained');
for(const opaque of ['exclusive : non visible','arme exclusive : non visible','not detected']){
  const opaqueDraft={owner:'user:a',patch:createScanReviewDraft('squad1',{squads:[{heroes:[{exclusive:opaque}]}]})};
  const opaqueRow=buildScanReviewGroups('squad1',opaqueDraft.patch).find(group=>group.kind==='hero'&&group.number===1).rows.find(item=>item.field==='exclusive');
  assert.equal(opaqueRow.exclusiveNotVisible,true,`prefixed opaque exclusive is marked missing: ${opaque}`);
  const opaqueConfirmed=applyOwnedScanReview(opaqueDraft,'user:a',[{path:['squads',0,'heroes',0,'exclusive'],value:''}]);
  assert.equal(opaqueConfirmed.patch.squads?.[0]?.heroes?.[0]?.exclusive,undefined,`opaque exclusive is stripped on confirmation: ${opaque}`);
}
assert.equal(applyOwnedScanReview(ownerDraft,'user:b',[]),null,'the account owner guard remains enforced');

const gear=serializeScanReviewGear([{count:'4',levels:'40/40,40/40',rarity:''}]);
assert.deepEqual(gear,{value:'count=4;levels=40,40,40,40'});
const singleLevelGear=serializeScanReviewGear([{count:'3',levels:'40',rarity:''}]);
assert.deepEqual(singleLevelGear,{value:'count=3;level=40'});
const groupedLevelGear=serializeScanReviewGear([{count:'3',levels:'40',rarity:''},{count:'1',levels:'50',rarity:''}]);
assert.deepEqual(groupedLevelGear,{value:'count=3;level=40|count=1;level=50'},'multiple level-only gear groups keep their individual level syntax');
const gearRoundTrip=buildScanReviewGroups('squad1',{squads:[{heroes:[{gear:groupedLevelGear.value}]}]})[1].rows.find(item=>item.field==='gear').value;
assert.deepEqual(serializeScanReviewGear(gearRoundTrip.map(segment=>({count:String(segment.count),levels:segment.levels.join('/'),rarity:segment.rarity}))),groupedLevelGear,'parsed multiple gear groups serialize back without losing single-level segment syntax');
const gearEdited=applyOwnedScanReview(ownerDraft,'user:a',[{path:['squads',0,'heroes',0,'gear'],value:gear.value}]);
assert.equal(gearEdited.patch.squads[0].heroes[0].gear,'count=4;levels=40,40,40,40','valid gear edits persist in canonical form');
assert.equal(serializeScanReviewGear([]).value,'','empty gear is represented as blank');
for(const [parts,error] of [
  [[{count:'0',levels:'40',rarity:''}],'invalid_count'],
  [[{count:'1',levels:'101',rarity:''}],'invalid_levels'],
  [[{count:'1',levels:'40//50',rarity:''}],'invalid_levels'],
  [[{count:'1',levels:'40',rarity:'rainbow'}],'invalid_rarity']
]){
  assert.equal(serializeScanReviewGear(parts).error,error);
}
const invalidGear=applyOwnedScanReview(ownerDraft,'user:a',[{path:['squads',0,'heroes',0,'gear'],value:'count=4;levels=10,not-a-level'}]);
assert.equal(invalidGear.errors[0]?.reason,'invalid_gear','malformed gear cannot be saved');

const priceGroups=buildScanReviewGroups('shop',{shop:{offers:[{item_name:'Bundle',price:0}]}});
assert.equal(priceGroups[0].rows.find(row=>row.field==='price').status,'pending','legitimate price zero remains a real value');
assert.equal(buildScanReviewGroups('awakening',{hero_progression:[{hero_name:'Carlie',stars:0}]})[0].rows.find(row=>row.field==='stars').status,'missing','unobserved hero progression stars are blank');
assert.equal(buildScanReviewGroups('squad1',{squads:[{heroes:[{gear:'count=4;levels=40,not-a-level'}]}]})[1].rows.find(row=>row.field==='gear').status,'missing','malformed gear stays blank');

console.log('PASS: scan-review presentation groups and gear edits are safe');