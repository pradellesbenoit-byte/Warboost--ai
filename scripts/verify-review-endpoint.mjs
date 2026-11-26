import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'warboost-review-endpoint-'));
const dir=path.join(temp,'lib');await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
for(const f of ['squad-review-resolution.js','squad-review-resolve-handler.js'])
 await fs.copyFile(path.join(root,'lib',f),path.join(dir,f));
// Isolated stand-ins for the existing pure comparison helpers; no real network.
await fs.writeFile(path.join(dir,'squad-comparison-project.js'),`
export function projectSquads(raw){return {rows:Array.from({length:4},(_,index)=>({id:index+1,squad:raw?.find(x=>x.id===index+1)}))};}
`);
await fs.writeFile(path.join(dir,'squad-comparison-results.js'),`
export function compareSquadProjections(local,remote){return Array.from({length:4},(_,i)=>{
 const l=local.rows[i].squad,r=remote.rows[i].squad;
 if(!l||!r)return {id:i+1,kind:'unknown',fields:[],issues:[],counts:{different:0,unknown:1}};
 const different=JSON.stringify(l.heroes.map(h=>[h.name,h.power,h.exclusive]))!==JSON.stringify(r.heroes.map(h=>[h.name,h.power,h.exclusive]));
 const fields=i===0?Array.from({length:5},(_,n)=>({category:'power',slot:n+1,state:'same',confirmed:false})):
 i===1?[{category:'power',slot:3,state:'same',confirmed:false},{category:'weapons',slot:3,state:'same',confirmed:false}]:[];
 return {id:i+1,kind:different?'different':fields.length?'partial':'marker',marker:true,fields,issues:fields.map(f=>({reason:'field_confirmation_missing'})),counts:{different:different?1:0,unknown:0}};
});}
`);
const {createSquadReviewResolveHandler}=await import(pathToFileURL(path.join(dir,'squad-review-resolve-handler.js')));
const stamp='2026-11-26T20:25:00.000Z',revision='2026-11-26T19:55:00.000Z';
const makeState=()=>({player_id:'owner',player:{name:'T'},drone:{level:170},alliance:{members:['A','B']},squads:
 [46.91,37.02,31.44,0].map((power,index)=>({id:index+1,power,
 composition_conflict:index<3?{reason:'squad_freshness_ambiguous'}:null,
 heroes:Array.from({length:5},(_,n)=>({name:`H${n+1}`,power:n+2,exclusive:n===2?{level:7}:null}))}))});
const makeBody=(state,id=1,overrides={})=>({acknowledgement:'I_REVIEWED_MY_SQUAD_FIELDS',squad_id:id,
 expected_revision:revision,local_squad:structuredClone(state.squads[id-1]),reviewed_fields:id===1?[1,2,3,4,5].map(slot=>({category:'power',slot})):
 id===2?[{category:'power',slot:3},{category:'weapons',slot:3}]:[],...overrides});
function prepare({owner='owner',consent='V1',token='Bearer token',readOverride,saveOverride}={}){
 let writes=0,reads=0,state=makeState();
 const handler=createSquadReviewResolveHandler({consentVersion:'V1',requireProductUser:async()=>({user:{id:owner}}),
  readForUser:async()=>{reads++;return readOverride?readOverride():{state,updated_at:revision}},
  saveForUser:async(_owner,next,_token,base)=>{writes++;if(saveOverride)return saveOverride(next);assert.equal(base,revision);return {state:next,updated_at:stamp}}});
 const req={method:'POST',headers:{'x-warboost-beta-consent':consent,authorization:token},body:makeBody(state)};
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
 return {handler,req,res,state,writes:()=>writes,reads:()=>reads};
}
test('successful selected squad review uses CAS and returns confirmed receipt',async()=>{
 const x=prepare();await x.handler(x.req,x.res);
 assert.equal(x.res.statusCode,200);assert.equal(x.res.body.ok,true);assert.equal(x.res.body.write_confirmed,true);
 assert.equal(x.res.body.squad.power,46.91);assert.equal(x.writes(),1);assert.equal(x.reads(),1);
 assert.deepEqual(x.state.squads[1].heroes[0],{name:'H1',power:2,exclusive:null});
});
test('no consent means HTTP 428 and zero reads/writes',async()=>{const x=prepare({consent:''});await x.handler(x.req,x.res);assert.equal(x.res.statusCode,428);assert.equal(x.writes(),0);assert.equal(x.reads(),0)});
test('absent bearer means HTTP 401 and no writes',async()=>{const x=prepare({token:''});await x.handler(x.req,x.res);assert.equal(x.res.statusCode,401);assert.equal(x.writes(),0)});
test('wrong authenticated owner is 403, without writes',async()=>{const x=prepare({owner:'intruder'});await x.handler(x.req,x.res);assert.equal(x.res.statusCode,403);assert.equal(x.writes(),0)});
test('stale revision is 409, no write',async()=>{const x=prepare();x.req.body.expected_revision='old';await x.handler(x.req,x.res);assert.equal(x.res.statusCode,409);assert.equal(x.writes(),0)});
test('atomic CAS conflict maps to 409 no success',async()=>{const x=prepare({saveOverride:()=>{throw Object.assign(new Error('conflict'),{code:'profile_write_conflict',status:409})}});await x.handler(x.req,x.res);assert.equal(x.res.statusCode,409);assert.notEqual(x.res.body.ok,true);assert.equal(x.writes(),1)});
test('failed receipt does not get reported as successful',async()=>{const x=prepare({saveOverride:next=>({state:{...next,player:{name:'changed'}},updated_at:stamp})});await x.handler(x.req,x.res);assert.equal(x.res.statusCode,503);assert.notEqual(x.res.body.ok,true)});
test('no cloud read is safe failure',async()=>{const x=prepare({readOverride:()=>null});await x.handler(x.req,x.res);assert.equal(x.res.statusCode,409);assert.equal(x.writes(),0)});
test('4th squad never resolves',async()=>{const x=prepare();x.req.body=makeBody(x.state,4);await x.handler(x.req,x.res);assert.equal(x.res.statusCode,400);assert.equal(x.writes(),0)});
test('missing explicit acknowledgement returns 400',async()=>{const x=prepare();x.req.body.acknowledgement='';await x.handler(x.req,x.res);assert.equal(x.res.statusCode,400);assert.equal(x.writes(),0)});
test('differences on the device are refused, even if power 46.91 on cloud',async()=>{const x=prepare();x.req.body.local_squad.heroes[2].power=999;await x.handler(x.req,x.res);assert.equal(x.res.statusCode,409);assert.equal(x.writes(),0)});
await fs.rm(temp,{recursive:true,force:true});
// A historical marker can persist on the device even when the cloud has no
// marker. A cloud-verified no-op must NEVER be represented as a write.
test('local-only marker: 200 cloud_verified, zero writes',async()=>{
 const x=prepare();
 const latest=structuredClone(x.state);
 latest.squads[2].composition_conflict=null;
 x.req.body=makeBody(x.state,3);
 const handler=createSquadReviewResolveHandler({consentVersion:'V1',requireProductUser:async()=>({user:{id:'owner'}}),
   readForUser:async()=>({state:latest,updated_at:revision}),
   saveForUser:async()=>{throw Error('must not save for cloud no-op');}});
 await handler(x.req,x.res);
 assert.equal(x.res.statusCode,200);
 assert.equal(x.res.body.cloud_verified,true);
 assert.equal(x.res.body.write_confirmed,false);
});
