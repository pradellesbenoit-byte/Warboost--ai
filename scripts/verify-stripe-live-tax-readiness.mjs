
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectLiveStripeTaxSettings} from '../lib/stripe-live-tax-readiness.js';
import {evaluateLiveBillingCountry,parseLiveApprovedBillingCountries,validateLiveDeclaredBillingCountry} from '../lib/stripe-live-tax-readiness.js';
import {stripeCheckoutLocale} from '../lib/stripe-test.js';
import {translator} from '../i18n.js';

const active = {object:'tax.settings', livemode:true, status:'active', head_office:{address:{country:'FR'}}};
const product = {tax_code:'txcd_10103000'};
function reason(settings, item=product){return inspectLiveStripeTaxSettings(settings,item).reason;}

test('refuse un compte Stripe TEST', () => {
  assert.equal(reason({...active,livemode:false}), 'TAX_SETTINGS_WRONG_MODE');
});
test('refuse des paramètres Stripe Tax absents', () => {
  assert.equal(reason(undefined), 'TAX_SETTINGS_WRONG_MODE');
});
test('refuse Stripe Tax non activé', () => {
  assert.equal(reason({...active,status:'pending'}), 'TAX_SETTINGS_NOT_ACTIVE');
});
test('refuse un siège fiscal différent ou absent', () => {
  assert.equal(reason({...active,head_office:null}), 'TAX_HEAD_OFFICE_UNVERIFIED');
});
test('refuse un produit sans catégorie fiscale', () => {
  assert.equal(reason(active,{}), 'PRODUCT_TAX_CODE_MISSING');
});
test('ne reconnaît que les paramètres techniques complets', () => {
  assert.deepEqual(inspectLiveStripeTaxSettings(active,product), {ready:true,reason:'READY_FOR_SEPARATE_LEGAL_REVIEW'});
});

test('aucun pays de vente n’est approuvé par défaut et une liste mal formée ferme tout',()=>{
  assert.deepEqual(parseLiveApprovedBillingCountries(''),[]);
  assert.deepEqual(parseLiveApprovedBillingCountries('FR,DE fr'),['DE','FR']);
  assert.deepEqual(parseLiveApprovedBillingCountries('FR,not-a-country'),[]);
});
test('le précontrôle exige un pays explicitement approuvé',()=>{
  const approvedCountries=parseLiveApprovedBillingCountries('FR,DE');
  assert.equal(validateLiveDeclaredBillingCountry('',approvedCountries).reason,'BILLING_COUNTRY_REQUIRED');
  assert.equal(validateLiveDeclaredBillingCountry('ES',approvedCountries).reason,'BILLING_COUNTRY_NOT_APPROVED');
  assert.equal(validateLiveDeclaredBillingCountry('fr',approvedCountries).allowed,true);
});
test('le pays Stripe autoritatif doit être approuvé et égal au pays déclaré',()=>{
  const approvedCountries=['FR','DE'];
  assert.equal(evaluateLiveBillingCountry({declaredCountry:'FR',authoritativeCountry:'',approvedCountries}).reason,'STRIPE_BILLING_COUNTRY_UNKNOWN');
  assert.equal(evaluateLiveBillingCountry({declaredCountry:'FR',authoritativeCountry:'ES',approvedCountries}).reason,'STRIPE_BILLING_COUNTRY_NOT_APPROVED');
  assert.equal(evaluateLiveBillingCountry({declaredCountry:'FR',authoritativeCountry:'DE',approvedCountries}).reason,'BILLING_COUNTRY_MISMATCH');
});
test('le webhook exige le pays déclaré signé dans les métadonnées de l’abonnement',()=>{
  const approvedCountries=['FR'];
  assert.equal(evaluateLiveBillingCountry({declaredCountry:'FR',authoritativeCountry:'FR',approvedCountries,requireSubscriptionHint:true}).reason,'BILLING_COUNTRY_HINT_MISSING');
  assert.equal(evaluateLiveBillingCountry({declaredCountry:'FR',authoritativeCountry:'FR',subscriptionCountryHint:'DE',approvedCountries,requireSubscriptionHint:true}).reason,'BILLING_COUNTRY_HINT_MISMATCH');
  assert.equal(evaluateLiveBillingCountry({declaredCountry:'FR',authoritativeCountry:'FR',subscriptionCountryHint:'FR',approvedCountries,requireSubscriptionHint:true}).allowed,true);
});
test('la langue Stripe Checkout est limitée à des valeurs prises en charge, sinon auto',()=>{
  assert.equal(stripeCheckoutLocale('fr'),'fr');
  assert.equal(stripeCheckoutLocale('en-GB'),'en-GB');
  assert.equal(stripeCheckoutLocale('not-a-locale'),'auto');
});
test('les textes critiques de facturation sont complets en FR/EN et ont un repli anglais',()=>{
  const keys=['commercial_live_consent','commercial_live_not_ready','commercial_live_country_label',
    'commercial_live_country_helper','commercial_live_price_note','commercial_live_country_required',
    'commercial_live_country_not_approved','commercial_live_country_mismatch','commercial_live_country_unverified','commercial_live_renewal',
    'commercial_subscription_cancels_at','commercial_live_success','commercial_live_cancel'];
  const en=translator('en-GB'),fr=translator('fr'),other=translator('es');
  for(const key of keys){
    assert.notEqual(en(key),key,`English key missing: ${key}`);
    assert.notEqual(fr(key),key,`French key missing: ${key}`);
    assert.notEqual(other(key),key,`fallback key missing: ${key}`);
    assert.notEqual(fr(key),en(key),`French copy fell through to English: ${key}`);
    assert.equal(other(key),en(key),`non-French fallback should use English: ${key}`);
  }
});
