import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commercialConfig,managedPaymentsProductEligible,MANAGED_PAYMENTS_PRODUCT_TAX_CODE,
  STRIPE_API_VERSION,STRIPE_MANAGED_PAYMENTS_API_VERSION,stripeCheckoutLocale} from '../lib/stripe-test.js';
import {translator} from '../i18n.js';

test('Managed Payments accepts the existing eligible AIaaS personal-use tax code only',()=>{
  assert.equal(MANAGED_PAYMENTS_PRODUCT_TAX_CODE,'txcd_10105001');
  assert.equal(managedPaymentsProductEligible({object:'product',active:true,tax_code:'txcd_10105001'}),true);
  assert.equal(managedPaymentsProductEligible({object:'product',active:true,tax_code:'txcd_10103000'}),false);
  assert.equal(managedPaymentsProductEligible({object:'product',active:false,tax_code:'txcd_10105001'}),false);
  assert.equal(managedPaymentsProductEligible({object:'product',tax_code:'txcd_10105001'}),false);
});

test('TEST keeps its existing API version; LIVE Checkout uses the Managed Payments minimum',()=>{
  assert.equal(STRIPE_API_VERSION,'2025-02-24.acacia');
  assert.equal(STRIPE_MANAGED_PAYMENTS_API_VERSION,'2025-03-31.basil');
});

test('LIVE stays off without explicit Managed Payments account approval',()=>{
  const names=['WARBOOST_COMMERCIAL_MODE','WARBOOST_LIVE_PAYMENTS_ENABLED','WARBOOST_LIVE_MANAGED_PAYMENTS_ENABLED',
    'WARBOOST_LIVE_MANAGED_PAYMENTS_VERIFIED','WARBOOST_LIVE_ACTIVATION_APPROVED','WARBOOST_LIVE_CATALOG_VERIFIED',
    'WARBOOST_LIVE_LEGAL_CONFIRMED','WARBOOST_LIVE_LEGACY_RECONCILED','WARBOOST_LIVE_INTERNATIONAL_SALES_ENABLED',
    'STRIPE_LIVE_SECRET_KEY','STRIPE_LIVE_WEBHOOK_SECRET','STRIPE_LIVE_PRICE_PRO_MONTHLY','STRIPE_LIVE_PRODUCT_PRO',
    'WARBOOST_LIVE_APP_URL','WARBOOST_LEGAL_BUSINESS_NAME','WARBOOST_SUPPORT_EMAIL','WARBOOST_LIVE_TERMS_URL',
    'WARBOOST_LIVE_PRIVACY_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try{
    for(const name of names)process.env[name]='';
    process.env.WARBOOST_COMMERCIAL_MODE='live';
    assert.equal(commercialConfig().payments_enabled,false);
    assert.equal(commercialConfig().activation_requirements.managed_payments_enabled,false);
    assert.equal(commercialConfig().activation_requirements.managed_payments_verified,false);
  }finally{
    for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name]}
  }
});

test('Stripe checkout locale is constrained and otherwise uses automatic locale',()=>{
  assert.equal(stripeCheckoutLocale('fr'),'fr');
  assert.equal(stripeCheckoutLocale('en-GB'),'en-GB');
  assert.equal(stripeCheckoutLocale('not-a-locale'),'auto');
});

test('Managed Payments checkout disclosures exist in French, English and safe fallback',()=>{
  const keys=['commercial_live_managed_payments_note','commercial_live_consent','commercial_live_not_ready','commercial_live_price_note',
    'commercial_live_renewal','commercial_live_success','commercial_live_cancel'];
  const en=translator('en-GB'),fr=translator('fr'),other=translator('es');
  for(const key of keys){
    assert.notEqual(en(key),key,`English key missing: ${key}`);
    assert.notEqual(fr(key),key,`French key missing: ${key}`);
    assert.notEqual(other(key),key,`fallback key missing: ${key}`);
    assert.notEqual(fr(key),en(key),`French copy fell through to English: ${key}`);
    assert.equal(other(key),en(key),`non-French fallback should use English: ${key}`);
  }
  assert.match(en('commercial_live_managed_payments_note'),/merchant of record/i);
  assert.match(fr('commercial_live_managed_payments_note'),/marchand de référence/i);
});

test('price copy states reference EUR pricing and defers local currency amount to Stripe',()=>{
  assert.match(translator('en')('commercial_live_price_note'),/€4\.99/);
  assert.match(translator('fr')('commercial_live_price_note'),/4,99 €/);
  assert.match(translator('en')('commercial_live_price_note'),/final amount is shown there/i);
  assert.doesNotMatch(translator('en')('commercial_live_price_note'),/\b(?:USD|GBP|CAD)\s?\d/);
});
