import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const log=msg=>console.log(`✓ ${msg}`);

// Static migration and packaging contract.
{
  const sql=read('supabase/migration_v2_5_26_beta_invites.sql');
  assert.match(sql,/create table if not exists public\.wb1_beta_invites/i);
  assert.match(sql,/email text not null unique/i);
  assert.match(sql,/status in \('pending','accepted','revoked'\)/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/grant select, insert, update on table public\.wb1_beta_invites to service_role/i);
  assert.doesNotMatch(sql,/\bdrop\s+table\b/i);
  assert.doesNotMatch(sql,/\btruncate\b/i);
  assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
  log('Beta invite migration is additive, private and non-destructive');
}

// No extra Vercel function: invite management reuses /api/support.
{
  const api=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).sort();
  assert.equal(api.length,12);
  assert.ok(api.includes('support.js'));
  assert.ok(!api.includes('beta-invites.js'));
  log('Invite manager stays within the 12-function Vercel Hobby limit');
}

// Player/support identity separation and status lifecycle.
{
  const support=read('api/support.js'),app=read('app.js'),admin=read('support-admin.js');
  assert.match(support,/req\.body\?\.as_support===true/);
  assert.match(support,/asSupport\?await anyTicket\(id\):await ownTicket\(id,user\.id\)/);
  assert.match(support,/const author_kind=asSupport\?"support":"player"/);
  assert.match(support,/const nextStatus=author_kind==="support"\?"waiting_player":"in_progress"/);
  assert.match(app,/action:"reply",ticket_id:ticketId,body,as_support:false/);
  assert.match(admin,/action:"reply",ticket_id:id,body,as_support:true/);
  const {renderSupportAdminTicket}=await import('../lib/support-admin-view.js');
  assert.ok(renderSupportAdminTicket({id:"fixture",status:"waiting_player"}).includes("Attente joueur"));
  assert.ok(renderSupportAdminTicket({id:"fixture",status:"in_progress"}).includes("En cours"));
  log('Player replies cannot be mislabeled as Support and admin badges are localized');
}

// Admin invitation UI and actions.
{
  const html=read('support-admin.html'),js=read('support-admin.js'),support=read('api/support.js');
  for(const id of ['inviteEmails','inviteNote','inviteAddBtn','copyBetaLinkBtn','inviteList'])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(js,/action:"invite_add"/);
  assert.match(js,/"invite_revoke"/);
  assert.match(js,/"invite_restore"/);
  assert.match(js,/Aucun redéploiement n’est nécessaire/);
  assert.match(support,/action==="invite_add"/);
  assert.match(support,/action==="invite_revoke"\|\|action==="invite_restore"/);
  assert.match(support,/splitInviteEmails/);
  assert.match(support,/slice\(0,100\)/);
  assert.doesNotMatch(support,/benoitpradelles@orange\.fr/i);
  log('Admin can bulk-authorize/revoke players without hardcoding any player email');
}

// Dynamic database access behavior with mocked Supabase REST.
{
  const oldEnv={...process.env};
  const oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';
  process.env.WARBOOST_SUPPORT_ADMINS='support@warboost.fr';
  process.env.WARBOOST_BETA_EMAILS='legacy@example.fr,revoked@example.fr';

  let rows=[
    {id:'1',email:'player@example.fr',status:'pending',expires_at:null,accepted_at:null,accepted_user_id:null},
    {id:'2',email:'revoked@example.fr',status:'revoked',expires_at:null,accepted_at:null,accepted_user_id:'u2'}
  ];
  const calls=[];
  globalThis.fetch=async(url,opts={})=>{
    calls.push({url:String(url),method:opts.method||'GET',body:opts.body||null});
    const u=String(url),method=String(opts.method||'GET').toUpperCase();
    if(!u.includes('/rest/v1/wb1_beta_invites'))return new Response('{}',{status:404});
    if(method==='PATCH'){
      const id=decodeURIComponent((u.match(/id=eq\.([^&]+)/)||[])[1]||'');
      const patch=JSON.parse(opts.body||'{}');rows=rows.map(r=>r.id===id?{...r,...patch}:r);
      return new Response(JSON.stringify(rows.filter(r=>r.id===id)),{status:200});
    }
    const emailRaw=(u.match(/email=eq\.([^&]+)/)||[])[1];
    const ownerRaw=(u.match(/accepted_user_id=eq\.([^&]+)/)||[])[1];
    const body=emailRaw?rows.filter(r=>r.email===decodeURIComponent(emailRaw)):ownerRaw?rows.filter(r=>r.accepted_user_id===decodeURIComponent(ownerRaw)):rows;
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };

  const mod=await import(`${pathToFileURL(path.join(root,'lib/beta-access.js')).href}?v2526=${Date.now()}`);
  const pending=await mod.betaAccessForUserAsync({id:'u1',email:'player@example.fr'});
  assert.equal(pending.allowed,true);assert.equal(pending.invite_source,'database');
  assert.ok(calls.some(c=>c.method==='PATCH'&&c.url.includes('id=eq.1')),'pending invite must be marked accepted');
  assert.equal(rows.find(r=>r.id==='1').status,'accepted');

  const revoked=await mod.betaAccessForUserAsync({id:'u2',email:'revoked@example.fr'});
  assert.equal(revoked.allowed,false,'database revocation must override legacy env allowlist');
  assert.equal(revoked.access_status,'revoked');

  const legacy=await mod.betaAccessForUserAsync({id:'u3',email:'legacy@example.fr'});
  assert.equal(legacy.allowed,true);assert.equal(legacy.invite_source,'legacy-env');

  const adminAccess=await mod.betaAccessForUserAsync({id:'admin',email:'support@warboost.fr'});
  assert.equal(adminAccess.allowed,true);assert.equal(adminAccess.invite_source,'support-admin');

  process.env=oldEnv;globalThis.fetch=oldFetch;
  log('Database invitations, acceptance, revocation override, legacy fallback and admin bootstrap all work');
}

// Version and Safe Launch invariants.
{
  const pkg=JSON.parse(read('package.json')),health=read('api/health.js'),manifest=read('manifest.webmanifest'),sw=read('sw.js');
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
  const {default:healthHandler}=await import('../api/health.js');let current;
  await healthHandler({method:"GET"},{setHeader(){},status(){return this},json(value){current=value}});
  assert.equal(current.version,pkg.version);
  assert.match(health,/beta_database_invitation_registry:true/);
  assert.match(health,/beta_admin_invite_manager:true/);
  assert.match(health,/safe_launch_external_game_access_hard_disabled:true/);
  assert.match(health,/safe_launch_payments_code_disabled:true/);
  assert.ok(JSON.parse(manifest).name.includes(`V${pkg.version}`));
  const {verifySwResources}=await import('./lib/verify-sw-resources.mjs');
  await verifySwResources(["app.js","support-admin.js"]);
  log('V2.5.26 versioning and Safe Launch payment/game-access locks remain explicit');
}

console.log('\nWarBoost V2.5.26 Beta Invitation Manager verification: PASS');
