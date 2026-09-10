import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LANGUAGES,translator} from '../i18n.js';
import {commercialConfig,PRO_PLAN,verifyWebhookSignature,createCheckoutForUser} from '../lib/commercial-pro.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const log=x=>console.log(`HF8 ✓ ${x}`);

{
  const cfg=commercialConfig();
  assert.equal(cfg.payments_enabled,false);
  assert.equal(PRO_PLAN.amount,499);
  assert.equal(PRO_PLAN.currency,'eur');
  assert.equal(PRO_PLAN.interval,'month');
  assert.equal(PRO_PLAN.price_label,'4,99 € / mois');
  log('Safe Launch is still non-billable by default and PRO price is server-locked to 4.99 EUR/month');
}

{
  const pro=read('api/pro.js'),commerce=read('lib/commercial-pro.js'),html=read('index.html'),app=read('app.js'),health=read('api/health.js'),sw=read('sw.js'),manifest=JSON.parse(read('manifest.webmanifest')),pkg=JSON.parse(read('package.json'));
  assert.match(html,/WarBoost V2\.5\.28 HF8/);
  assert.match(html,/id="proCommercialPreview"/);
  assert.match(app,/function formatProPrice/);
  assert.match(app,/commercial_preview_note/);
  assert.match(app,/SAFE_LAUNCH_PAYMENT_DISABLED|beta_payment_disabled/);
  assert.match(pro,/SAFE_LAUNCH_PAYMENT_DISABLED/);
  assert.doesNotMatch(pro,/sk_(?:test|live)_|whsec_|price_[A-Za-z0-9]/);
  assert.match(commerce,/PRO_PLAN/);
  assert.match(commerce,/unit_amount/);
  assert.match(commerce,/billing_portal\/sessions/);
  assert.match(commerce,/checkout\/sessions/);
  assert.match(commerce,/timingSafeEqual/);
  assert.match(health,/build:"hf8-commercial-readiness"/);
  assert.match(health,/commercial_price_server_locked_499_eur_month:true/);
  assert.match(sw,/warboost-v2-5-28-hf8-commercial-readiness/);
  assert.match(manifest.name,/HF8/);
  assert.match(pkg.scripts.check,/commercial-pro\.js/);
  assert.match(pkg.scripts.verify,/verify-v2\.5\.28-hf8\.mjs/);
  assert.equal(fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')).length,12);
  log('HF8 UI, backend readiness, cache metadata and exactly 12 serverless APIs are preserved');
}

{
  const sql=read('supabase/migration_v2_5_28_hf8_commercial_readiness.sql');
  assert.match(sql,/create table if not exists public\.warboost_subscriptions/i);
  assert.match(sql,/create table if not exists public\.warboost_billing_events/i);
  assert.match(sql,/enable row level security/i);
  assert.doesNotMatch(sql,/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
  log('HF8 billing schema is additive/idempotent, RLS-enabled and contains no destructive data operation');
}

{
  const explicit=LANGUAGES.map(x=>x[0]).filter(x=>x!=='auto');
  assert.equal(explicit.length,23);
  const en=translator('en');
  for(const code of explicit){
    const tr=translator(code);
    for(const key of ['commercial_preview_title','commercial_preview_note','commercial_payment_not_ready']){
      assert.notEqual(tr(key),key,`${code} missing ${key}`);
      if(!code.startsWith('en'))assert.notEqual(tr(key),en(key),`${code} inherits English commercial copy for ${key}`);
    }
    assert.match(tr('tagline'),/V2\.5\.28 HF8/);
  }
  log('23 explicit languages have localized HF8 commercial-readiness copy');
}

{
  const old={...process.env};
  process.env.WARBOOST_COMMERCIAL_MODE='live';
  process.env.WARBOOST_APP_URL='https://warboost-preview.vercel.app';
  process.env.WARBOOST_LEGAL_BUSINESS_NAME='WarBoost Test';
  process.env.WARBOOST_SUPPORT_EMAIL='support@example.test';
  process.env.WARBOOST_TERMS_URL='https://warboost.fr/legal.html';
  process.env.WARBOOST_PRIVACY_URL='https://warboost.fr/privacy.html';
  process.env.STRIPE_SECRET_KEY='sk_test_example';
  process.env.STRIPE_PRICE_PRO_MONTHLY='price_example';
  process.env.STRIPE_WEBHOOK_SECRET='whsec_example';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-example';
  const cfg=commercialConfig();
  assert.equal(cfg.live,true);assert.equal(cfg.stable_domain,false);assert.equal(cfg.configured,false);assert.equal(cfg.payments_enabled,false);
  process.env={...old};
  log('A temporary Vercel preview domain cannot accidentally enable live billing');
}

{
  const oldEnv={...process.env},oldFetch=globalThis.fetch;
  Object.assign(process.env,{
    WARBOOST_COMMERCIAL_MODE:'live',WARBOOST_APP_URL:'https://warboost.fr',WARBOOST_LEGAL_BUSINESS_NAME:'WarBoost Test',WARBOOST_SUPPORT_EMAIL:'support@warboost.fr',WARBOOST_TERMS_URL:'https://warboost.fr/legal.html',WARBOOST_PRIVACY_URL:'https://warboost.fr/privacy.html',STRIPE_SECRET_KEY:'sk_test_example',STRIPE_PRICE_PRO_MONTHLY:'price_pro_499',STRIPE_WEBHOOK_SECRET:'whsec_example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-example'
  });
  const calls=[];
  globalThis.fetch=async(url,opts={})=>{
    calls.push({url:String(url),opts});
    const u=String(url);
    if(u.includes('/rest/v1/warboost_subscriptions?'))return new Response('[]',{status:200});
    if(u.includes('/v1/prices/price_pro_499'))return new Response(JSON.stringify({id:'price_pro_499',active:true,unit_amount:499,currency:'eur',recurring:{interval:'month'}}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/v1/checkout/sessions'))return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/test'}),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({error:{message:'unmatched'}}),{status:500,headers:{'content-type':'application/json'}});
  };
  const out=await createCheckoutForUser({id:'00000000-0000-4000-8000-000000000001',email:'player@example.test'});
  assert.equal(out.plan.amount,499);assert.match(out.url,/^https:\/\//);
  assert.ok(calls.some(c=>c.url.includes('/v1/prices/price_pro_499')));
  assert.ok(calls.some(c=>c.url.includes('/v1/checkout/sessions')));
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];
  for(const [k,v] of Object.entries(oldEnv))process.env[k]=v;
  log('Live checkout can start only after the provider price is verified as 4.99 EUR monthly');
}

{
  const old=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
  const raw='{"id":"evt_1","type":"customer.subscription.updated"}',ts=Math.floor(Date.now()/1000),sig=crypto.createHmac('sha256','whsec_test').update(`${ts}.${raw}`).digest('hex');
  assert.equal(verifyWebhookSignature(raw,`t=${ts},v1=${sig}`),true);
  assert.equal(verifyWebhookSignature(raw,`t=${ts},v1=${'0'.repeat(64)}`),false);
  if(old===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=old;
  log('Commercial webhook uses timestamped HMAC verification and rejects an invalid signature');
}

console.log('\nWarBoost V2.5.28 HF8 Commercial Readiness verification: PASS');
