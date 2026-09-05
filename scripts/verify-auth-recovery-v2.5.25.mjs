import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWarBoostSupabaseAuthClient} from '../lib/browser-auth.js';
import {LANGUAGES,translator} from '../i18n.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const mem=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),dump:()=>m}};

{
  const storage=mem();
  let recoverUrl='',updateBody=null,userReads=0;
  const fetchImpl=async(url,opts={})=>{
    const u=String(url);
    if(u.includes('/auth/v1/recover')){
      recoverUrl=u;
      return {ok:true,status:200,json:async()=>({})};
    }
    if(u.endsWith('/auth/v1/user')&&(opts.method||'POST')==='GET'){
      userReads++;
      return {ok:true,status:200,json:async()=>({id:'u-recovery',email:'player@example.com'})};
    }
    if(u.endsWith('/auth/v1/user')&&opts.method==='PUT'){
      updateBody=JSON.parse(opts.body||'{}');
      return {ok:true,status:200,json:async()=>({id:'u-recovery',email:'player@example.com'})};
    }
    if(u.endsWith('/auth/v1/logout')){
      return {ok:true,status:204,json:async()=>({})};
    }
    throw new Error(`Unexpected request ${u} ${opts.method||'POST'}`);
  };
  const client=createWarBoostSupabaseAuthClient({url:'https://project.supabase.co',key:'publishable',storage,fetchImpl});
  let result=await client.auth.resetPasswordForEmail('PLAYER@EXAMPLE.COM',{redirectTo:'https://preview.example/reset-password.html'});
  assert.equal(result.error,null);
  assert.match(recoverUrl,/\/auth\/v1\/recover\?redirect_to=/);
  assert.match(decodeURIComponent(recoverUrl),/https:\/\/preview\.example\/reset-password\.html/);

  result=await client.auth.consumeRecoverySessionFromUrl(
    'https://preview.example/reset-password.html#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery',
    {cleanUrl:false}
  );
  assert.equal(result.error,null);
  assert.equal(result.data.event,'PASSWORD_RECOVERY');
  assert.equal(result.data.session.user.email,'player@example.com');
  assert.equal(userReads,1);

  result=await client.auth.updateUser({password:'NouveauMotDePasse123!'});
  assert.equal(result.error,null);
  assert.equal(updateBody.password,'NouveauMotDePasse123!');
  assert.doesNotMatch(JSON.stringify([...storage.dump().entries()]),/NouveauMotDePasse123!/,'Password must never be persisted in browser auth storage');
  await client.auth.signOut();
  assert.equal(storage.dump().size,0,'Recovery auth session must be cleared after sign-out');
  console.log('✓ Direct Supabase recovery flow: recover → recovery session → update password without persisting the password');
}


{
  const storage=mem();
  let replaced='';
  const oldLocation=globalThis.location,oldHistory=globalThis.history;
  globalThis.location={href:'https://preview.example/reset-password.html#access_token=cleanme&refresh_token=refreshme&expires_in=3600&token_type=bearer&type=recovery',origin:'https://preview.example'};
  globalThis.history={replaceState(_a,_b,url){replaced=String(url)}};
  const fetchImpl=async(url,opts={})=>{
    if(String(url).endsWith('/auth/v1/user')&&(opts.method||'POST')==='GET')return {ok:true,status:200,json:async()=>({id:'u-clean',email:'clean@example.com'})};
    throw new Error(`Unexpected request ${url}`);
  };
  const client=createWarBoostSupabaseAuthClient({url:'https://project.supabase.co',key:'publishable',storage,fetchImpl});
  const result=await client.auth.consumeRecoverySessionFromUrl(undefined,{cleanUrl:true});
  assert.equal(result.error,null);
  assert.equal(result.data.event,'PASSWORD_RECOVERY');
  assert.equal(replaced,'/reset-password.html','Recovery access/refresh tokens must be removed from the visible URL immediately');
  if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
  if(oldHistory===undefined)delete globalThis.history;else globalThis.history=oldHistory;
  console.log('✓ Recovery tokens are stripped from the browser URL immediately after consumption');
}

{
  const html=read('index.html'),page=read('reset-password.html'),js=read('reset-password.js'),app=read('app.js'),cloudCfg=read('api/cloud-config.js'),sw=read('sw.js'),pkg=JSON.parse(read('package.json'));
  assert.match(html,/id="forgotPasswordBtn"/);
  assert.match(app,/resetPasswordForEmail\(email,\{redirectTo\}\)/);
  assert.match(app,/cloudRecoveryRedirect\|\|new URL\("\/reset-password\.html",location\.origin\)/);
  assert.match(cloudCfg,/VERCEL_BRANCH_URL/);
  assert.match(cloudCfg,/recovery_redirect_url:recoveryRedirect/);
  assert.match(page,/autocomplete="new-password"/);
  assert.match(js,/consumeRecoverySessionFromUrl/);
  assert.match(js,/RECOVERY_MARKER/);
  assert.match(js,/sessionStorage\.getItem\(RECOVERY_MARKER\)==="1"/);
  assert.doesNotMatch(js,/localStorage\.clear\s*\(/);
  assert.match(js,/cloud\.auth\.updateUser\(\{password\}\)/);
  assert.match(js,/password\.length<8/);
  assert.match(js,/password!==confirm/);
  assert.match(sw,/reset-password\.html/);
  assert.match(sw,/reset-password\.js/);
  assert.match(sw,/warboost-v2-5-25-safe-launch-auth-recovery/);
  assert.equal(pkg.version,'2.5.25');
  console.log('✓ UI, service worker and release metadata include password recovery');
}

{
  const keys=['forgot_password','password_reset_enter_email','password_reset_sent','password_recovery','choose_new_password','password_recovery_intro','checking_recovery_link','new_password','confirm_new_password','password_minimum','save_new_password','back_to_warboost','recovery_link_expired','password_too_weak','recovery_link_invalid','password_too_short','passwords_do_not_match','saving','password_updated_success'];
  for(const [code] of LANGUAGES.filter(([c])=>c!=='auto')){
    const t=translator(code);
    for(const key of keys)assert.notEqual(t(key),key,`${code} missing ${key}`);
    assert.match(t('tagline'),/V2\.5\.25/);
  }
  console.log('✓ Password recovery labels exist in all 23 explicit languages');
}

{
  const app=read('app.js'),migration=read('supabase/migration_v2_5_24_support.sql'),support=read('api/support.js'),provider=read('lib/provider.js'),pro=read('api/pro.js'),health=read('api/health.js'),readme=read('README.md');
  assert.doesNotMatch(app,/localStorage\.clear\s*\(/);
  assert.match(app,/STORE_KEY="warboost_v1_core_state"/);
  assert.match(migration,/create table if not exists public\.wb1_support_tickets/i);
  assert.doesNotMatch(migration,/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
  assert.match(support,/WARBOOST_SUPPORT_ADMINS/);
  assert.match(provider,/Safe Launch hard lock/i);
  assert.doesNotMatch(pro,/stripe|paypal|checkout\.session/i);
  assert.match(health,/password_recovery_requires_recovery_session:true/);
  assert.match(health,/password_recovery_stable_preview_branch_redirect:true/);
  assert.match(health,/password_never_stored_by_warboost:true/);
  assert.match(readme,/Aucune nouvelle migration de base de données n[’']est nécessaire/);
  console.log('✓ Data preservation, support and Safe Launch/payment locks remain intact');
}

console.log('\nWarBoost V2.5.25 auth recovery verification: PASS');
