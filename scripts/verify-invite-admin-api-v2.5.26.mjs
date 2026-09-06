import assert from 'node:assert/strict';
import supportHandler from '../api/support.js';
import proHandler from '../api/pro.js';

process.env.SUPABASE_URL='https://test.supabase.co';
process.env.SUPABASE_ANON_KEY='anon';
process.env.SUPABASE_SERVICE_ROLE_KEY='service';
process.env.WARBOOST_SUPPORT_ADMINS='support@warboost.fr';
delete process.env.WARBOOST_BETA_EMAILS;

let invites=[];
let tickets=[
  {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ticket_no:'WB-ADMIN-OWN',player_id:'admin-u',email:'support@warboost.fr',nickname:'Support',category:'bug',subject:'Ticket admin en mode joueur',description:'Test identité joueur administrateur',status:'waiting_player',created_at:'2026-09-06T09:00:00.000Z',updated_at:'2026-09-06T09:00:00.000Z'},
  {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ticket_no:'WB-PLAYER-OTHER',player_id:'player-u',email:'player@example.fr',nickname:'Player',category:'bug',subject:'Ticket joueur',description:'Ticket joueur pour réponse support',status:'received',created_at:'2026-09-06T09:01:00.000Z',updated_at:'2026-09-06T09:01:00.000Z'}
];
let messages=[];
const originalFetch=globalThis.fetch;

function json(status,body,headers={}){return new Response(body==null?null:JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}})}
function response(){return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
async function call(handler,{method='GET',token='admin-token',body={},query={}}={}){const res=response();await handler({method,headers:{authorization:`Bearer ${token}`},body,query},res);return res}
function queryValue(url,key){const u=new URL(url);const raw=u.searchParams.get(key);if(raw==null)return null;return raw.replace(/^eq\./,'')}

globalThis.fetch=async(url,opts={})=>{
  const u=String(url),method=String(opts.method||'GET').toUpperCase(),headers=opts.headers||{};
  if(u.endsWith('/auth/v1/user')){
    const auth=String(headers.authorization||headers.Authorization||'');
    if(auth.includes('admin-token'))return json(200,{id:'admin-u',email:'support@warboost.fr'});
    if(auth.includes('player-token'))return json(200,{id:'player-u',email:'player@example.fr'});
    return json(401,{message:'bad token'});
  }
  if(u.includes('/rest/v1/wb1_beta_invites')){
    const email=queryValue(u,'email'),id=queryValue(u,'id');
    if(method==='GET'){
      let rows=invites;
      if(email!=null)rows=rows.filter(x=>x.email===decodeURIComponent(email));
      if(id!=null)rows=rows.filter(x=>x.id===decodeURIComponent(id));
      return json(200,rows);
    }
    if(method==='POST'){
      const row=JSON.parse(opts.body||'{}');
      const created={id:`invite-${invites.length+1}`,...row,accepted_at:null,accepted_user_id:null,revoked_at:null,expires_at:null};
      invites.push(created);return json(201,null);
    }
    if(method==='PATCH'){
      const patch=JSON.parse(opts.body||'{}'),target=decodeURIComponent(id||'');
      invites=invites.map(x=>x.id===target?{...x,...patch}:x);return json(204,null);
    }
  }
  if(u.includes('/rest/v1/wb1_support_tickets')){
    const id=queryValue(u,'id'),playerId=queryValue(u,'player_id');
    if(method==='GET'){
      let rows=tickets;if(id)rows=rows.filter(x=>x.id===decodeURIComponent(id));if(playerId)rows=rows.filter(x=>x.player_id===decodeURIComponent(playerId));return json(200,rows);
    }
    if(method==='PATCH'){
      const patch=JSON.parse(opts.body||'{}'),target=decodeURIComponent(id||'');tickets=tickets.map(x=>x.id===target?{...x,...patch}:x);return json(204,null);
    }
  }
  if(u.includes('/rest/v1/wb1_support_messages')){
    if(method==='GET')return json(200,messages);
    if(method==='POST'){messages.push({id:`m${messages.length+1}`,created_at:'2026-09-06T09:10:00.000Z',...JSON.parse(opts.body||'{}')});return json(201,null)}
  }
  throw new Error(`Unexpected fetch: ${method} ${u}`);
};

try{
  let r=await call(supportHandler,{method:'POST',body:{action:'invite_add',emails:['PLAYER@EXAMPLE.FR','not-an-email'],note:'Test bêta'}});
  assert.equal(r.statusCode,200);assert.equal(r.body.results.length,2);assert.equal(r.body.results.filter(x=>x.ok).length,1);
  assert.equal(invites.length,1);assert.equal(invites[0].email,'player@example.fr');assert.equal(invites[0].status,'pending');

  r=await call(supportHandler,{method:'GET',query:{admin:'1',invites:'1'}});
  assert.equal(r.statusCode,200);assert.equal(r.body.invites.length,1);assert.equal(r.body.tickets.length,2);

  r=await call(proHandler,{method:'GET',token:'player-token'});
  assert.equal(r.statusCode,200);assert.equal(r.body.allowed,true);assert.equal(r.body.active,true);
  assert.equal(invites[0].status,'accepted');assert.equal(invites[0].accepted_user_id,'player-u');

  r=await call(supportHandler,{method:'POST',body:{action:'invite_revoke',invite_id:invites[0].id}});
  assert.equal(r.statusCode,200);assert.equal(invites[0].status,'revoked');
  r=await call(proHandler,{method:'GET',token:'player-token'});
  assert.equal(r.statusCode,200);assert.equal(r.body.allowed,false);assert.equal(r.body.access_status,'revoked');

  r=await call(supportHandler,{method:'POST',body:{action:'invite_restore',invite_id:invites[0].id}});
  assert.equal(r.statusCode,200);assert.equal(invites[0].status,'accepted');
  r=await call(proHandler,{method:'GET',token:'player-token'});
  assert.equal(r.body.allowed,true);assert.equal(r.body.active,true);

  // An administrator using the normal player UI is still a player on their OWN ticket.
  r=await call(supportHandler,{method:'POST',body:{action:'reply',ticket_id:tickets[0].id,body:'Réponse depuis interface joueur',as_support:false}});
  assert.equal(r.statusCode,200);assert.equal(r.body.author_kind,'player');assert.equal(messages.at(-1).author_kind,'player');assert.equal(tickets[0].status,'in_progress');

  // The same administrator can explicitly answer another player's ticket as Support only from admin UI.
  r=await call(supportHandler,{method:'POST',body:{action:'reply',ticket_id:tickets[1].id,body:'Réponse support',as_support:true}});
  assert.equal(r.statusCode,200);assert.equal(r.body.author_kind,'support');assert.equal(messages.at(-1).author_kind,'support');assert.equal(tickets[1].status,'waiting_player');

  console.log('WarBoost V2.5.26 invite/admin API simulated lifecycle: PASS');
} finally {globalThis.fetch=originalFetch}
