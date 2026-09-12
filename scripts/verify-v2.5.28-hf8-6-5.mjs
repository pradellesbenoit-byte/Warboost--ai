import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const response=()=>({statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
const json=(status,body)=>new Response(body==null?null:JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const hash=code=>createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g,'')).digest('hex');

// Static UI + security contract.
{
  const html=read('index.html'),app=read('app.js'),support=read('api/support.js'),i18n=read('i18n.js'),sw=read('sw.js');
  for(const id of ['betaCodeBox','betaAccessCode','betaCodeActivateBtn','betaCodeStatus'])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(app,/action:"beta_code_activate"/);
  assert.match(app,/fetch\("\/api\/support"/);
  assert.match(support,/DEFAULT_BETA_CODE_HASH="[a-f0-9]{64}"/);
  assert.match(support,/BETA_CODE_MAX_USERS=25/);
  assert.match(support,/2026-10-31T23:59:59Z/);
  assert.match(support,/existing\?\.status==="revoked"/);
  assert.match(support,/status:"accepted"/);
  assert.match(i18n,/beta_code_activate/);
  assert.match(i18n,/beta_code_required/);
  assert.match(sw,/hf8-6-5-beta-access-code/);
  assert.doesNotMatch([html,app,support,i18n,sw].join('\n'),/WB-BETA-23DP-PWNP-ZUAZ/,'plain owner code must never ship in browser/server package');
  const apis=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));
  assert.equal(apis.length,12,'HF8.6.5 must stay within the existing 12 Vercel functions');
  const migrations=fs.readdirSync(path.join(root,'supabase')).filter(x=>/hf8[_-]?6[_-]?5/i.test(x));
  assert.equal(migrations.length,0,'HF8.6.5 must not require a new Supabase migration');
}

// Simulated activation lifecycle. The verifier overrides only the SHA-256 hash,
// never the production code itself.
{
  const oldEnv={...process.env},oldFetch=globalThis.fetch;
  const testCode='WB-BETA-TEST-7K9M';
  process.env.SUPABASE_URL='https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service';
  process.env.SUPABASE_ANON_KEY='anon';
  process.env.WARBOOST_BETA_CODE_HASH=hash(testCode);
  delete process.env.WARBOOST_SUPPORT_ADMINS;
  delete process.env.WARBOOST_BETA_EMAILS;
  let invites=[];
  const user={id:'player-u',email:'player@example.fr'};
  globalThis.fetch=async(url,opts={})=>{
    const u=String(url),method=String(opts.method||'GET').toUpperCase(),headers=opts.headers||{};
    if(u.endsWith('/auth/v1/user')){
      if(String(headers.authorization||'').includes('player-token'))return json(200,user);
      return json(401,{message:'bad token'});
    }
    if(u.includes('/rest/v1/wb1_beta_invites')){
      const parsed=new URL(u),emailRaw=parsed.searchParams.get('email'),idRaw=parsed.searchParams.get('id'),sourceRaw=parsed.searchParams.get('invited_by_user_id');
      if(method==='GET'){
        let rows=invites;
        if(emailRaw)rows=rows.filter(x=>x.email===decodeURIComponent(emailRaw.replace(/^eq\./,'')));
        if(idRaw)rows=rows.filter(x=>x.id===decodeURIComponent(idRaw.replace(/^eq\./,'')));
        if(sourceRaw)rows=rows.filter(x=>x.invited_by_user_id===decodeURIComponent(sourceRaw.replace(/^eq\./,''))&&['pending','accepted'].includes(x.status));
        return json(200,rows);
      }
      if(method==='POST'){
        const row=JSON.parse(opts.body||'{}');
        invites.push({id:`invite-${invites.length+1}`,...row,revoked_at:null,expires_at:null});
        return json(201,null);
      }
      if(method==='PATCH'){
        const id=decodeURIComponent((idRaw||'').replace(/^eq\./,'')),patch=JSON.parse(opts.body||'{}');
        invites=invites.map(x=>x.id===id?{...x,...patch}:x);return json(204,null);
      }
    }
    if(u.includes('/rest/v1/wb1_support_tickets'))return json(200,[]);
    if(u.includes('/rest/v1/wb1_support_messages'))return json(200,[]);
    throw new Error(`Unexpected fetch ${method} ${u}`);
  };
  try{
    const support=(await import(`${pathToFileURL(path.join(root,'api/support.js')).href}?hf865=${Date.now()}`)).default;
    const call=async body=>{const res=response();await support({method:'POST',headers:{authorization:'Bearer player-token'},body,query:{}},res);return res};
    let r=await call({action:'beta_code_activate',code:'WRONG-CODE'});
    assert.equal(r.statusCode,403);assert.equal(r.body.error,'BETA_CODE_INVALID');assert.equal(invites.length,0);
    r=await call({action:'beta_code_activate',code:'wb beta test 7k9m'});
    assert.equal(r.statusCode,200);assert.equal(r.body.allowed,true);assert.equal(invites.length,1);assert.equal(invites[0].email,'player@example.fr');assert.equal(invites[0].status,'accepted');assert.equal(invites[0].accepted_user_id,'player-u');assert.equal(invites[0].invited_by_user_id,'beta-code-hf8.6.5');
    r=await call({action:'beta_code_activate',code:'does-not-matter-now'});
    assert.equal(r.statusCode,200);assert.equal(r.body.already_allowed,true);assert.equal(invites.length,1,'same account must never be duplicated');
    invites[0].status='revoked';
    r=await call({action:'beta_code_activate',code:testCode});
    assert.equal(r.statusCode,403);assert.equal(r.body.error,'BETA_ACCESS_REVOKED');assert.equal(invites[0].status,'revoked','shared code must never override an explicit revocation');
  } finally {process.env=oldEnv;globalThis.fetch=oldFetch}
}

console.log('WarBoost V2.5.28 HF8.6.5 Simple Beta Access Code verification: PASS');
