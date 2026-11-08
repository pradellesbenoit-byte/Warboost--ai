
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectLiveStripeTaxSettings} from '../lib/stripe-live-tax-readiness.js';

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
