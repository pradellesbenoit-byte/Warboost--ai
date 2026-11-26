import test from 'node:test';
import assert from 'node:assert/strict';
import {planSquadReview,isReviewReceiptValid} from '../lib/squad-review-resolution.js';

const ts='2026-11-26T20:21:00.000Z';
const revision='2026-11-26T19:14:32.000Z';
const mkHero=i=>({name:`Hero${i}`,power: i*2,exclusive:i===3?{level:7}:null,level:150,
 field_source:{level:'confirmed_scan'},field_updated_at:{level:ts},field_status:{}});
const mkSquad=(id,power,history=false)=>({id,power,
  composition_conflict:{reason:'squad_freshness_ambiguous',status:'needs_verification',
    ...(history?{identity_history:[{names:['old','names']}] }: {})},
  needs_rescan:true,heroes:Array.from({length:5},(_,i)=>mkHero(i+1)),
  composition_source:'explicit_confirmation',composition_confirmed_at:ts,
  confirmed_composition:Array.from({length:5},(_,i)=>`Hero${i+1}`)});
const cloud=()=>({player_id:'owner',player:{name:'unchanged',power_m:223.5},drone:{level:170,power_m:9.45},
  alliance:{role:'R4',members:[{role:'R5'},{role:'R3'}]},progression_snapshots:[{at:ts,value:223.5}],
  shop:{offers:[1,2]},squads:[mkSquad(1,46.91,true),mkSquad(2,37.02),mkSquad(3,31.44),{id:4,power:null,heroes:[]}],
  unrelated:{proof:'must never change',nested:{array:[1,2,3]}}});
const mkField=(cat,slot,confirmed=false)=>({category:cat,slot,state:'same',confirmed});
const scenario=(id)=>id===1?[1,2,3,4,5].map(i=>mkField('power',i)):
  id===2?[mkField('power',3),mkField('weapons',3)]:[];
const compareFor=id=>(a,b,sid)=>({id:sid,kind:id===3?'marker':'partial',marker:true,
 fields:[mkField('composition',1,true),...scenario(id)],
 issues:scenario(id).map(f=>({reason:'field_confirmation_missing',category:f.category,slot:f.slot})),
 counts:{same:1+scenario(id).length,different:0,unknown:0,unconfirmed:scenario(id).length}});
const args=id=>{const c=cloud();return {cloudState:c,owner:'owner',revision,expectedRevision:revision,
   squadId:id,localSquad:structuredClone(c.squads[id-1]),reviewedFields:scenario(id).map(f=>({category:f.category,slot:f.slot})),now:ts,compare:compareFor(id)}};
const failCode=(fn,code)=>assert.throws(fn,e=>e?.code===code,`Expected ${code}`);

test('S1 power 46.91 unchanged and 5 individual hero powers explicitly confirmed manually',()=>{
 const x=args(1),out=planSquadReview(x);
 assert.equal(out.candidate.squads[0].power,46.91);
 assert.equal(out.confirmedFields.length,5);
 for(let i=0;i<5;i++){
  assert.equal(out.candidate.squads[0].heroes[i].power,x.cloudState.squads[0].heroes[i].power);
  assert.equal(out.candidate.squads[0].heroes[i].field_source.power,'confirmed_manual');
  assert.equal(out.candidate.squads[0].heroes[i].field_updated_at.power,ts);
 }
 assert.deepEqual(out.candidate.squads[0].composition_conflict.identity_history,[{names:['old','names']}]);
 assert.equal(out.candidate.squads[0].composition_conflict.reason,undefined);
 assert.equal(out.candidate.squads[0].needs_rescan,false);
});
test('S2 power and exclusive of hero 3 only are attested',()=>{
 const x=args(2),p=planSquadReview(x).candidate;
 assert.equal(p.squads[1].power,37.02);
 assert.deepEqual(p.squads[1].heroes[2].exclusive,{level:7});
 assert.equal(p.squads[1].heroes[2].field_source.power,'confirmed_manual');
 assert.equal(p.squads[1].heroes[2].field_source.exclusive,'confirmed_manual');
 assert.equal(p.squads[1].heroes[0].field_source.power,undefined);
});
test('S3 removes only an obsolete marker after explicit review (no phantom proof)',()=>{
 const x=args(3),p=planSquadReview(x).candidate;
 assert.equal(p.squads[2].power,31.44);
 assert.equal(p.squads[2].composition_conflict,null);
 assert.equal(p.squads[2].heroes[0].field_source.power,undefined);
});
test('other squads and all unrelated profile fields bit-for-bit preserved',()=>{
 const x=args(1),p=planSquadReview(x).candidate;
 for(let i=1;i<4;i++)assert.deepEqual(p.squads[i],x.cloudState.squads[i]);
 for(const k of Object.keys(x.cloudState).filter(k=>k!=='squads'))assert.deepEqual(p[k],x.cloudState[k]);
});
test('local-side untrusted hero value never uploaded over cloud',()=>{
 const x=args(1);x.localSquad.heroes[0].power=999;
 const p=planSquadReview(x).candidate;
 assert.equal(p.squads[0].heroes[0].power,2);
});
test('wrong owner forbidden',()=>{const x=args(1);x.owner='attacker';failCode(()=>planSquadReview(x),'review_owner_mismatch')});
test('changed server revision rejected',()=>{const x=args(1);x.expectedRevision='older';failCode(()=>planSquadReview(x),'review_revision_changed')});
test('missing field attestation rejected',()=>{const x=args(1);x.reviewedFields.pop();failCode(()=>planSquadReview(x),'review_fields_changed')});
test('unrequested extra attestation rejected',()=>{const x=args(2);x.reviewedFields.push({category:'power',slot:1});failCode(()=>planSquadReview(x),'review_fields_changed')});
test('duplicate fields rejected',()=>{const x=args(1);x.reviewedFields[1]=x.reviewedFields[0];failCode(()=>planSquadReview(x),'review_fields_changed')});
test('unsupported unconfirmed categories are not silently declared as evidence',()=>{const x=args(2);x.compare=()=>({id:2,kind:'partial',fields:[mkField('level',1)],issues:[],counts:{different:0,unknown:0}});failCode(()=>planSquadReview(x),'review_unverified_field_unsupported')});
test('comparison with different value rejected',()=>{const x=args(1);x.compare=()=>({id:1,kind:'different',fields:[],issues:[],counts:{different:1,unknown:0}});failCode(()=>planSquadReview(x),'review_comparison_incomplete')});
test('unreadable or unknown field rejected',()=>{const x=args(1);x.compare=()=>({id:1,kind:'unknown',fields:[],issues:[],counts:{different:0,unknown:1}});failCode(()=>planSquadReview(x),'review_comparison_incomplete')});
test('identity ambiguity rejected',()=>{const x=args(1);x.compare=()=>({id:1,kind:'partial',fields:scenario(1),issues:[{reason:'hero_identity_mismatch'}],counts:{different:0,unknown:0}});failCode(()=>planSquadReview(x),'review_comparison_incomplete')});
test('missing current historical marker cannot be magically cleaned',()=>{const x=args(3);x.cloudState.squads[2].composition_conflict=null;x.localSquad.composition_conflict=null;failCode(()=>planSquadReview(x),'review_marker_not_current')});
test('duplicate or unslotted cloud squad invalid',()=>{const x=args(3);x.cloudState.squads[2].id=1;failCode(()=>planSquadReview(x),'review_cloud_structure_ambiguous')});
test('receipt requires matching current owner, newer revision and exactly returned profile',()=>{
 const x=args(1),p=planSquadReview(x),saved={updated_at:ts,state:p.candidate};
 const input={saved,previousRevision:revision,expectedSquad:p.squad,candidate:p.candidate,owner:'owner',squadId:1};
 assert.equal(isReviewReceiptValid(input),true);
 assert.equal(isReviewReceiptValid({...input,saved:{...saved,updated_at:revision}}),false);
 assert.equal(isReviewReceiptValid({...input,owner:'other'}),false);
 assert.equal(isReviewReceiptValid({...input,saved:{...saved,state:{...p.candidate,drone:{level:1}}}}),false);
});
test('no cloud receipt means NO success',()=>{
 const x=args(1),p=planSquadReview(x),input={saved:null,previousRevision:revision,expectedSquad:p.squad,candidate:p.candidate,owner:'owner',squadId:1};
 assert.equal(isReviewReceiptValid(input),false);
});
test('open scan review blocks stale marker clearance',()=>{
 const x=args(1);x.cloudState.squads[0].composition_conflict.scan_pending=[{slot:1}];
 failCode(()=>planSquadReview(x),'review_identity_evidence_pending');
});
test('hero power pending blocks evidence fabrication',()=>{
 const x=args(1);x.cloudState.squads[0].heroes[0].power_sync_status='pending';
 failCode(()=>planSquadReview(x),'review_field_unresolved');
});
test('ambiguous weapon field blocks manual confirmation',()=>{
 const x=args(2);x.cloudState.squads[1].heroes[2].field_status.exclusive='ambiguous';
 failCode(()=>planSquadReview(x),'review_field_unresolved');
});
test('local-only obsolete marker can be cleared without changing cloud state',()=>{
 const x=args(3);x.cloudState.squads[2].composition_conflict=null;x.cloudState.squads[2].needs_rescan=false;
 const p=planSquadReview(x).candidate;
 assert.deepEqual(p,x.cloudState);
});
test('local-only marker and absent field attestations can be confirmed without changing values',()=>{
 const x=args(1);x.cloudState.squads[0].composition_conflict=null;x.cloudState.squads[0].needs_rescan=false;
 const p=planSquadReview(x).candidate;
 assert.equal(p.squads[0].heroes[0].field_source.power,'confirmed_manual');
 assert.equal(p.squads[0].composition_conflict,null);
});
