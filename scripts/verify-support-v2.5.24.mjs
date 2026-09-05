import assert from 'node:assert/strict';
import handler from '../api/support.js';

process.env.SUPABASE_URL='https://test.supabase.co';
process.env.SUPABASE_ANON_KEY='anon';
process.env.SUPABASE_SERVICE_ROLE_KEY='service';
process.env.WARBOOST_BETA_EMAILS='beta@example.com';
process.env.WARBOOST_SUPPORT_ADMINS='admin@example.com';

const ticket={id:'11111111-1111-4111-8111-111111111111',ticket_no:'WB-20260905-A1B2C3',player_id:'u1',email:'beta@example.com',nickname:'Benoit',category:'bug',subject:'Test support',description:'Description suffisamment longue',status:'received',app_version:'2.5.24',locale:'fr',screen:'support',diagnostics:{},attachment_path:null,attachment_name:null,created_at:'2026-09-05T06:00:00.000Z',updated_at:'2026-09-05T06:00:00.000Z'};
let messages=[];
const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,opts={})=>{
  const u=String(url);calls.push({u,method:opts.method||'GET',body:opts.body});
  if(u.endsWith('/auth/v1/user'))return json(200,{id:'u1',email:'beta@example.com'});
  if(u.includes('/rest/v1/wb1_support_tickets')){
    if((opts.method||'GET')==='POST')return json(201,[ticket]);
    if((opts.method||'GET')==='PATCH')return json(204,null);
    return json(200,[ticket]);
  }
  if(u.includes('/rest/v1/wb1_support_messages')){
    if((opts.method||'GET')==='POST'){messages.push(JSON.parse(opts.body));return json(201,null)}
    return json(200,messages.map((m,i)=>({id:`m${i+1}`,created_at:'2026-09-05T06:01:00.000Z',...m})));
  }
  throw new Error(`Unexpected fetch ${u}`);
};
function json(status,body){return {ok:status>=200&&status<300,status,text:async()=>body==null?'':JSON.stringify(body),json:async()=>body}}
function response(){return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
const auth={authorization:'Bearer token'};
try{
  let res=response();await handler({method:'POST',headers:auth,body:{action:'create',category:'bug',subject:'Test support',description:'Description suffisamment longue',nickname:'Benoit',app_version:'2.5.24',locale:'fr',screen:'support',diagnostics:{online:true}}},res);
  assert.equal(res.statusCode,201);assert.equal(res.body.ok,true);assert.match(res.body.ticket.ticket_no,/^WB-/);assert.equal(messages.length,1);assert.equal(messages[0].author_kind,'player');

  res=response();await handler({method:'GET',headers:auth,query:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.tickets.length,1);assert.equal(res.body.tickets[0].player_id,'u1');

  res=response();await handler({method:'POST',headers:auth,body:{action:'reply',ticket_id:ticket.id,body:'Complément joueur'}},res);assert.equal(res.statusCode,200);assert.equal(messages.length,2);assert.equal(messages[1].author_kind,'player');

  assert.ok(calls.some(c=>c.u.includes('player_id=eq.u1')),'Player GET must be scoped to authenticated player_id');
  console.log('WarBoost V2.5.24 support API simulated flow: PASS');
} finally {globalThis.fetch=originalFetch}
