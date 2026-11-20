import assert from "node:assert/strict";
import fs from "node:fs";
import {billingFixture,userA,userB,userBeta,userCountry,userFree,userRecovery,userAmbiguous,userCachedCreateError} from "./billing-test-fixture.mjs";
import {processWebhook} from "../lib/commercial-pro.js";
import {entitlementForUser} from "../lib/pro-access.js";
import proHandler from "../api/pro.js";
import {TEST_SUBSCRIPTION_CONSENT_VERSION} from "../lib/stripe-test.js";

const fixture=await billingFixture();
// Match the verified Stripe TEST catalog: tax behavior is unspecified. The
// payment flow must rely on the completed invoice total, not assume a tax mode.
fixture.priceOverride={tax_behavior:"unspecified"};
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log(`STRIPE SETUP ✓ ${name}`)};
const signedConsent={confirm_test_only:true,test_subscription_consent:true,
  test_subscription_consent_version:TEST_SUBSCRIPTION_CONSENT_VERSION};
const stripeCalls=()=>fixture.calls.filter(call=>call.host==="api.stripe.com");
const stripeCallsFor=path=>stripeCalls().filter(call=>call.path===`/v1/${path}`);
const stripeWrites=()=>stripeCalls().filter(call=>["POST","DELETE"].includes(call.opts?.method));
const noLiveStripeCalls=()=>assert.ok(stripeCalls().every(call=>
  !/^Bearer (?:sk|rk)_live_/.test(String(call.opts?.headers?.authorization||""))));
const user=id=>({id,email:`${id.slice(-1)}@example.test`});
async function post(id,body){
  let result;
  const req={method:"POST",query:{},headers:{authorization:`Bearer ${id}`,"x-warboost-beta-consent":"2026-09-05-safe-launch-v2"},
    body,rawBody:Buffer.from(JSON.stringify(body))};
  const res={setHeader(){},status(code){this.code=code;return this},json(data){result={status:this.code||200,data};return this}};
  await proHandler(req,res);return result;
}
async function webhook(event){
  const [raw,signature]=fixture.sign(event);let result;
  const req={method:"POST",query:{action:"webhook",mode:"test"},headers:{"stripe-signature":signature},rawBody:Buffer.from(raw)};
  const res={setHeader(){},status(code){this.code=code;return this},json(data){result={status:this.code||200,data};return this}};
  await proHandler(req,res);return result;
}
const start=(id,country="FR",extra={})=>post(id,{action:"test_setup_intent",billing_country:country,...signedConsent,...extra});
const prepare=(id,setupIntentId,country="FR",extra={})=>post(id,
  {action:"prepare_test_subscription",setup_intent_id:setupIntentId,billing_country:country,...signedConsent,...extra});
const attempt=async id=>(await fixture.pg.query(
  "select * from warboost_test_payment_attempts where user_id=$1",[id])).rows[0]||null;
const attemptExpiryActive=async id=>(await fixture.pg.query(
  "select expires_at>now() as active from warboost_test_payment_attempts where user_id=$1",[id])).rows[0]?.active===true;
const noSucceededPayment=()=>assert.ok([...fixture.paymentIntents.values()].every(pi=>pi.status!=="succeeded"));
const noNewSucceededPayments=priorIds=>assert.ok([...fixture.paymentIntents.values()]
  .every(pi=>pi.status!=="succeeded"||priorIds.has(pi.id)));

try{
  await check("PGlite migration is rerunnable, preserves rows, and denies client table access",async()=>{
    await fixture.pg.query(`insert into warboost_test_payment_attempts
      (user_id,attempt_id,state,billing_country,consent_version,expires_at)
      values($1,gen_random_uuid(),'canceled','FR','fixture-v1',now()+interval '1 hour')`,[userA]);
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_35_test_setup_intents.sql","utf8"));
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_36_test_payment_retry_recovery.sql","utf8"));
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_37_test_payment_expired_recovery.sql","utf8"));
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_37_test_payment_expired_recovery.sql","utf8"));
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_38_test_subscription_idempotency_recovery.sql","utf8"));
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_38_test_subscription_idempotency_recovery.sql","utf8"));
    const row=(await fixture.pg.query("select state from warboost_test_payment_attempts where user_id=$1",[userA])).rows[0];
    assert.equal(row.state,"canceled");
    const columns=(await fixture.pg.query(`select column_name from information_schema.columns
      where table_schema='public' and table_name='warboost_test_payment_attempts'
        and column_name in ('recovery_token','subscription_create_key_version',
          'subscription_create_failure_version','subscription_create_failure_at')`)).rows;
    assert.equal(columns.length,4,"recovery columns must be safely rerunnable");
    const rls=(await fixture.pg.query(`select relrowsecurity from pg_class where oid='public.warboost_test_payment_attempts'::regclass`)).rows[0];
    assert.equal(rls.relrowsecurity,true);
    const privileges=(await fixture.pg.query(`select
      has_table_privilege('anon','public.warboost_test_payment_attempts','select') as anon_read,
      has_table_privilege('authenticated','public.warboost_test_payment_attempts','insert') as user_insert,
      has_table_privilege('service_role','public.warboost_test_payment_attempts','select') as service_read,
      has_function_privilege('anon','public.warboost_finish_test_subscription_recovery(uuid,uuid,uuid,text,text,text,text,text)','execute') as anon_recover,
      has_function_privilege('authenticated','public.warboost_finish_test_subscription_recovery(uuid,uuid,uuid,text,text,text,text,text)','execute') as user_recover,
      has_function_privilege('anon','public.warboost_finish_test_subscription_recovery_v2(uuid,uuid,uuid,integer,text,text,text,text,text)','execute') as anon_recover_v2,
      has_function_privilege('authenticated','public.warboost_finish_test_subscription_recovery_v2(uuid,uuid,uuid,integer,text,text,text,text,text)','execute') as user_recover_v2,
      has_function_privilege('anon','public.warboost_claim_test_subscription_v2(uuid,uuid,text)','execute') as anon_claim_v2,
      has_function_privilege('authenticated','public.warboost_record_test_subscription_create_failure_v2(uuid,uuid,uuid,integer,integer,text)','execute') as user_failure_v2,
      has_function_privilege('service_role','public.warboost_finish_test_subscription_recovery_v2(uuid,uuid,uuid,integer,text,text,text,text,text)','execute') as service_recover,
      has_function_privilege('service_role','public.warboost_record_test_subscription_v2(uuid,uuid,text,text,uuid,integer)','execute') as service_record_v2,
      has_function_privilege('service_role','public.warboost_finish_test_subscription_v2(uuid,uuid,text,text,uuid,integer)','execute') as service_finish_v2`)).rows[0];
    assert.equal(privileges.anon_read,false);assert.equal(privileges.user_insert,false);assert.equal(privileges.service_read,true);
    assert.equal(privileges.anon_recover,false);assert.equal(privileges.user_recover,false);
    assert.equal(privileges.anon_recover_v2,false);assert.equal(privileges.user_recover_v2,false);
    assert.equal(privileges.service_recover,true);
    assert.equal(privileges.anon_claim_v2,false);assert.equal(privileges.user_failure_v2,false);
    assert.equal(privileges.service_record_v2,true);
    assert.equal(privileges.service_finish_v2,true);
  });

  await check("Missing consent, disallowed country, or unconfigured tax are rejected before Stripe writes",async()=>{
    const beforeWrites=stripeWrites().length;
    const noConsent=await post(userA,{action:"test_setup_intent",billing_country:"FR"});
    assert.equal(noConsent.status,428);assert.equal(noConsent.data.error,"TEST_SUBSCRIPTION_CONSENT_REQUIRED");
    assert.equal(noConsent.data.diagnostic.stage,"validation");
    assert.equal(noConsent.data.diagnostic.elapsed_ms>=0,true);
    const country=await start(userA,"US");
    assert.equal(country.status,403);assert.equal(country.data.error,"BILLING_COUNTRY_NOT_APPROVED");
    const oldTax=process.env.WARBOOST_TEST_AUTOMATIC_TAX_ENABLED;
    process.env.WARBOOST_TEST_AUTOMATIC_TAX_ENABLED="false";
    const tax=await start(userB);
    assert.equal(tax.status,503);assert.equal(tax.data.error,"TEST_PAYMENT_ELEMENT_NOT_READY");
    process.env.WARBOOST_TEST_AUTOMATIC_TAX_ENABLED=oldTax;
    assert.equal(stripeWrites().length,beforeWrites);
    assert.equal(fixture.customers.size,0);assert.equal(fixture.setupIntents.size,0);assert.equal(fixture.subscriptions.size,0);
    fixture.priceOverride={tax_behavior:"exclusive"};
    const exclusive=await start(userB);
    assert.equal(exclusive.status,503);assert.equal(exclusive.data.error,"TEST_PRICE_TAX_BEHAVIOR_UNRESOLVED");
    assert.equal(stripeWrites().length,beforeWrites);
    fixture.priceOverride={tax_behavior:"unspecified"};
  });

  await check("Legacy hosted TEST Checkout routes are retired without creating sessions",async()=>{
    const before=stripeCalls().length;
    for(const body of [
      {action:"checkout",billing_country:"FR"},
      {action:"checkout_test_beta",confirm_test_only:true,billing_country:"FR"}
    ]){
      const result=await post(userB,body);
      assert.equal(result.status,410);assert.equal(result.data.error,"TEST_CHECKOUT_RETIRED");
    }
    assert.equal(stripeCalls().length,before);
    assert.equal(fixture.sessions.size,0);assert.equal(fixture.subscriptions.size,0);
  });

  let userASetup;
  await check("SetupIntent collection is non-charging and setup failure can retry idempotently",async()=>{
    fixture.failSetupOnce=true;
    const beforeSubscriptions=fixture.subscriptions.size,beforePayments=fixture.paymentIntents.size;
    const failed=await start(userA);
    assert.equal(failed.status,502);
    assert.equal(failed.data.error,"PAYMENT_PROVIDER_ERROR");
    assert.equal(failed.data.diagnostic.stage,"setup_intent");
    assert.equal(Number.isFinite(failed.data.diagnostic.elapsed_ms),true);
    assert.doesNotMatch(JSON.stringify(failed.data),/SIMULATED_SETUP_FAILURE|secret_fixture|sk_test_fixture/);
    assert.equal(fixture.subscriptions.size,beforeSubscriptions);assert.equal(fixture.paymentIntents.size,beforePayments);
    assert.equal((await attempt(userA)).state,"creating");
    await fixture.pg.query("update warboost_test_payment_attempts set lease_until=now()-interval '1 second' where user_id=$1",[userA]);
    const result=await start(userA);
    assert.equal(result.status,200);assert.equal(result.data.state,"setup_required");
    assert.equal(result.data.diagnostic.stage,"setup_intent_ready");
    assert.equal(Number.isFinite(result.data.diagnostic.elapsed_ms),true);
    assert.deepEqual(Object.keys(result.data.diagnostic).sort(),["elapsed_ms","stage"]);
    assert.equal(fixture.subscriptions.size,beforeSubscriptions);assert.equal(fixture.paymentIntents.size,beforePayments);
    userASetup=result.data.setup_intent_id;
    assert.equal(fixture.setupIntents.size,1);
    assert.ok(stripeCallsFor("setup_intents").length>=2);
  });

  await check("Authenticated account owns its SetupIntent; spoofed user IDs cannot prepare another account's subscription",async()=>{
    fixture.completeSetup(userASetup,{country:"FR"});
    const before=fixture.subscriptions.size;
    const result=await prepare(userB,userASetup,"FR",{user_id:userA});
    assert.equal(result.status,409);assert.equal(result.data.error,"TEST_PAYMENT_ATTEMPT_INVALID");
    assert.equal(fixture.subscriptions.size,before);
    assert.equal((await attempt(userB)),null);
  });

  await check("Stripe-stored country mismatch and changed client country stop before subscription creation",async()=>{
    const before=fixture.subscriptions.size;
    fixture.completeSetup(userASetup,{country:"US"});
    const mismatch=await prepare(userA,userASetup,"FR");
    assert.equal(mismatch.status,403);assert.equal(mismatch.data.error,"TEST_BILLING_COUNTRY_MISMATCH");
    fixture.completeSetup(userASetup,{country:"FR"});
    const tampered=await prepare(userA,userASetup,"US");
    assert.equal(tampered.status,403);assert.equal(tampered.data.error,"TEST_BILLING_COUNTRY_MISMATCH");
    assert.equal(fixture.subscriptions.size,before);assert.equal(fixture.paymentIntents.size,0);
  });

  await check("Expired subscription lease reconciles the same customer, SetupIntent, country and existing invoice without duplicate creation",async()=>{
    const setup=await start(userB);
    assert.equal(setup.status,200);
    fixture.completeSetup(setup.data.setup_intent_id,{country:"FR"});
    const prepared=await prepare(userB,setup.data.setup_intent_id,"FR");
    assert.equal(prepared.status,200);
    const originalSubscription=fixture.subscriptions.get(prepared.data.subscription_id);
    const beforeSubscriptionCount=fixture.subscriptions.size;
    const beforeStripeWrites=stripeWrites().length;
    await fixture.pg.query(`update warboost_test_payment_attempts
      set state='subscription_creating',expires_at=now()-interval '36 minutes',
        lease_until=now()+interval '60 seconds' where user_id=$1`,[userB]);
    const busy=await start(userB);
    assert.equal(busy.status,409);assert.equal(busy.data.error,"TEST_PAYMENT_BUSY");
    assert.equal(fixture.subscriptions.size,beforeSubscriptionCount);
    assert.equal(stripeWrites().length,beforeStripeWrites);

    await fixture.pg.query(`update warboost_test_payment_attempts
      set lease_until=now()-interval '1 second' where user_id=$1`,[userB]);
    const cooldown=await start(userB);
    assert.equal(cooldown.status,409);assert.equal(cooldown.data.error,"TEST_PAYMENT_BUSY",
      "expired lease must cool down before recovery starts");
    assert.equal((await attempt(userB)).state,"subscription_creating");
    await fixture.pg.query(`update warboost_test_payment_attempts
      set lease_until=now()-interval '6 minutes' where user_id=$1`,[userB]);
    const oldApproved=process.env.WARBOOST_TEST_APPROVED_BILLING_COUNTRIES;
    const oldTaxReady=process.env.WARBOOST_TEST_TAX_READY_COUNTRIES;
    process.env.WARBOOST_TEST_APPROVED_BILLING_COUNTRIES="FR,DE";
    process.env.WARBOOST_TEST_TAX_READY_COUNTRIES="FR,DE";
    const wrongCountry=await start(userB,"DE");
    process.env.WARBOOST_TEST_APPROVED_BILLING_COUNTRIES=oldApproved;
    process.env.WARBOOST_TEST_TAX_READY_COUNTRIES=oldTaxReady;
    assert.equal(wrongCountry.status,409);assert.equal(wrongCountry.data.error,"TEST_PAYMENT_RESTART_REQUIRED");
    const wrongConsent=await start(userB,"FR",{test_subscription_consent_version:"stale-consent"});
    assert.equal(wrongConsent.status,428);assert.equal(wrongConsent.data.error,"TEST_SUBSCRIPTION_CONSENT_REQUIRED");

    const [retryA,retryB]=await Promise.all([start(userB),start(userB)]);
    assert.ok([retryA,retryB].some(recovered=>recovered.status===200&&recovered.data.state==="payment_pending"),
      JSON.stringify([retryA,retryB]));
    assert.ok([retryA,retryB].every(recovered=>
      recovered.status===200&&recovered.data.state==="payment_pending"||
      recovered.status===409&&recovered.data.error==="TEST_PAYMENT_BUSY"));
    assert.equal((await attempt(userB)).state,"payment_pending",
      "verified existing subscription must be atomically restored to payment_pending");
    assert.equal(await attemptExpiryActive(userB),true);
    assert.equal(fixture.subscriptions.size,beforeSubscriptionCount);
    assert.equal(stripeWrites().length,beforeStripeWrites);

    const resumed=await prepare(userB,setup.data.setup_intent_id,"FR");
    assert.equal(resumed.status,200);assert.equal(resumed.data.state,"payment_confirmation_required");
    assert.equal(resumed.data.subscription_id,originalSubscription.id);
    assert.equal(fixture.subscriptions.size,beforeSubscriptionCount,"retry must reuse, not duplicate, the existing subscription");
    assert.equal(stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length,1);
    assert.notEqual(fixture.paymentIntents.get(resumed.data.payment_intent_id).status,"succeeded");
    noLiveStripeCalls();noSucceededPayment();
  });

  await check("Attempt expired beyond 35 minutes with no Stripe subscription is atomically reopened then creates one incomplete TEST subscription",async()=>{
    const beforeSubscriptionCount=fixture.subscriptions.size;
    const setup=await start(userCountry);
    assert.equal(setup.status,200);
    fixture.completeSetup(setup.data.setup_intent_id,{country:"FR"});
    fixture.failSubscriptionBeforeCreationOnce=true;
    const failed=await prepare(userCountry,setup.data.setup_intent_id,"FR");
    assert.equal(failed.status,502);assert.equal(failed.data.error,"PAYMENT_PROVIDER_ERROR");
    assert.equal((await attempt(userCountry)).state,"subscription_creating");
    assert.equal(fixture.subscriptions.size,beforeSubscriptionCount);
    await fixture.pg.query(`update warboost_test_payment_attempts
      set expires_at=now()-interval '36 minutes',lease_until=now()-interval '6 minutes' where user_id=$1`,[userCountry]);
    const beforeStripeWrites=stripeWrites().length;
    const resumedSetup=await start(userCountry);
    assert.equal(resumedSetup.status,200);assert.equal(resumedSetup.data.state,"setup_succeeded");
    assert.equal(resumedSetup.data.setup_intent_id,setup.data.setup_intent_id);
    assert.equal((await attempt(userCountry)).state,"setup_pending");
    assert.equal(await attemptExpiryActive(userCountry),true);
    assert.equal(stripeWrites().length,beforeStripeWrites,"setup recovery must use only Stripe reads");
    const retry=await prepare(userCountry,setup.data.setup_intent_id,"FR");
    assert.equal(retry.status,200);assert.equal(retry.data.state,"payment_confirmation_required");
    assert.equal(fixture.subscriptions.size,beforeSubscriptionCount+1);
    assert.equal(fixture.subscriptions.get(retry.data.subscription_id).status,"incomplete");
    assert.notEqual(fixture.paymentIntents.get(retry.data.payment_intent_id).status,"succeeded");
    noLiveStripeCalls();noSucceededPayment();
  });

  await check("Stripe lookup errors during expired recovery fail closed and a fresh retry can recover",async()=>{
    const beforeSubscriptionCount=fixture.subscriptions.size;
    const setup=await start(userBeta);
    assert.equal(setup.status,200);
    fixture.completeSetup(setup.data.setup_intent_id,{country:"FR"});
    await fixture.pg.query(`update warboost_test_payment_attempts set state='subscription_creating',
      expires_at=now()-interval '36 minutes',lease_until=now()-interval '6 minutes' where user_id=$1`,[userBeta]);
    fixture.failSubscriptionLookupOnce=true;
    const beforeStripeWrites=stripeWrites().length;
    const result=await start(userBeta);
    assert.equal(result.status,502);assert.equal(result.data.error,"PAYMENT_PROVIDER_ERROR");
    assert.equal(result.data.diagnostic.stage,"subscription_reconcile");
    assert.equal(fixture.subscriptions.size,beforeSubscriptionCount);
    assert.equal(stripeWrites().length,beforeStripeWrites);
    noLiveStripeCalls();noSucceededPayment();
    await fixture.pg.query("update warboost_test_payment_attempts set lease_until=now()-interval '6 minutes' where user_id=$1",[userBeta]);
    const recovered=await start(userBeta);
    assert.equal(recovered.status,200);assert.equal(recovered.data.state,"setup_succeeded");
    assert.equal((await attempt(userBeta)).state,"setup_pending");
    assert.equal(fixture.subscriptions.size,beforeSubscriptionCount);
    noLiveStripeCalls();noSucceededPayment();
  });

  await check("Expired recovery with multiple Stripe subscriptions is ambiguous and never creates or rewrites one",async()=>{
    const setup=await start(userAmbiguous);
    assert.equal(setup.status,200);
    fixture.completeSetup(setup.data.setup_intent_id,{country:"FR"});
    const record=await attempt(userAmbiguous);
    const account=await fixture.pg.query("select stripe_customer_id from warboost_billing_accounts where user_id=$1",[userAmbiguous]);
    const customerId=account.rows[0].stripe_customer_id;
    const subscriptionsBefore=fixture.subscriptions.size;
    const makeMatch=id=>({id,object:"subscription",livemode:false,status:"incomplete",customer:customerId,
      default_payment_method:"pm_missing",metadata:{warboost_user_id:userAmbiguous,
        warboost_setup_attempt_id:record.attempt_id,billing_country:"FR"}});
    fixture.subscriptions.set("sub_test_ambiguous_1",makeMatch("sub_test_ambiguous_1"));
    fixture.subscriptions.set("sub_test_ambiguous_2",makeMatch("sub_test_ambiguous_2"));
    await fixture.pg.query(`update warboost_test_payment_attempts set state='subscription_creating',
      expires_at=now()-interval '36 minutes',lease_until=now()-interval '6 minutes' where user_id=$1`,[userAmbiguous]);
    const beforeWrites=stripeWrites().length;
    const result=await start(userAmbiguous);
    assert.equal(result.status,409);assert.equal(result.data.error,"TEST_SUBSCRIPTION_RECONCILIATION_AMBIGUOUS");
    assert.equal((await attempt(userAmbiguous)).state,"subscription_creating");
    assert.equal(fixture.subscriptions.size,subscriptionsBefore+2,
      "ambiguous recovery must neither create nor remove a Stripe subscription");
    assert.equal(stripeWrites().length,beforeWrites);
    noLiveStripeCalls();noSucceededPayment();
  });

  await check("Direct subscription retry after 35 minutes reconciles absence before atomic reopen and reuses one attempt",async()=>{
    const subscriptionsBefore=fixture.subscriptions.size;
    const subscriptionPostsBefore=stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length;
    const setup=await start(userRecovery);
    assert.equal(setup.status,200);
    fixture.completeSetup(setup.data.setup_intent_id,{country:"FR"});
    fixture.failSubscriptionBeforeCreationOnce=true;
    const failed=await prepare(userRecovery,setup.data.setup_intent_id,"FR");
    assert.equal(failed.status,502);
    const subscriptionPostsAfterFailure=stripeCalls().filter(
      call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length;
    assert.equal(subscriptionPostsAfterFailure,subscriptionPostsBefore+1,
      "the failed simulated create is still one provider request");
    const oldAttempt=await attempt(userRecovery);
    assert.equal(oldAttempt.state,"subscription_creating");
    assert.equal(fixture.subscriptions.size,subscriptionsBefore);
    await fixture.pg.query(`update warboost_test_payment_attempts set expires_at=now()-interval '36 minutes',
      lease_until=now()-interval '6 minutes' where user_id=$1`,[userRecovery]);
    const [recoveredA,recoveredB]=await Promise.all([
      prepare(userRecovery,setup.data.setup_intent_id,"FR"),
      prepare(userRecovery,setup.data.setup_intent_id,"FR")
    ]);
    const recovered=[recoveredA,recoveredB].find(result=>result.status===200);
    assert.ok(recovered);
    assert.ok([recoveredA,recoveredB].every(result=>
      result.status===200&&result.data.state==="payment_confirmation_required"||
      result.status===409&&result.data.error==="TEST_PAYMENT_BUSY"));
    assert.equal((await attempt(userRecovery)).attempt_id,oldAttempt.attempt_id);
    assert.equal(fixture.subscriptions.size,subscriptionsBefore+1);
    assert.equal(fixture.subscriptions.get(recovered.data.subscription_id).status,"incomplete");
    assert.equal((await fixture.pg.query("select state from warboost_test_payment_attempts where user_id=$1",[userRecovery])).rows[0].state,"payment_pending");
    const subscriptionPosts=stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length;
    assert.equal(subscriptionPosts,subscriptionPostsBefore+2,
      "one failed request plus one recovery request must create only one subscription");
    const replay=await prepare(userRecovery,setup.data.setup_intent_id,"FR");
    assert.equal(replay.status,200);assert.equal(replay.data.subscription_id,recovered.data.subscription_id);
    assert.equal(stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length,subscriptionPostsBefore+2,
      "idempotent replay must not issue another subscription POST");
    noLiveStripeCalls();noSucceededPayment();
  });

  await check("Cached Stripe 400 rotates the idempotency key only after cooldown and complete paginated reconciliation",async()=>{
    const beforeSubscriptions=fixture.subscriptions.size;
    const beforeInvoices=fixture.invoices.size;
    const beforePaymentIntents=fixture.paymentIntents.size;
    const subscriptionPostsBefore=stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length;
    const originalPriceOverride={...fixture.priceOverride};
    const setup=await start(userCachedCreateError);
    assert.equal(setup.status,200);
    fixture.completeSetup(setup.data.setup_intent_id,{country:"FR"});
    fixture.failSubscriptionInvalidRequestOnce=true;
    const failed=await prepare(userCachedCreateError,setup.data.setup_intent_id,"FR");
    assert.equal(failed.status,502);
    assert.equal(failed.data.error,"PAYMENT_PROVIDER_ERROR");
    assert.equal(failed.data.diagnostic.stripe_http_status,400);
    assert.equal(failed.data.diagnostic.stripe_error_type,"invalid_request_error");
    assert.equal((await attempt(userCachedCreateError)).subscription_create_key_version,1);
    assert.equal((await attempt(userCachedCreateError)).subscription_create_failure_version,1);
    assert.equal(fixture.subscriptions.size,beforeSubscriptions);
    const current=await attempt(userCachedCreateError);
    const legacyKey=`wb-test-subscription-${current.attempt_id}`;
    assert.equal(fixture.subscriptionErrorCache.has(legacyKey),true,
      "the simulated provider caches the first 400 for the legacy key");
    const firstSubscriptionPost=stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").at(-1);
    assert.equal(stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length,
      subscriptionPostsBefore+1);
    assert.equal(firstSubscriptionPost.opts.headers["Idempotency-Key"],legacyKey,
      "key version 1 must remain compatible with the key already cached by Stripe");

    fixture.priceOverride={tax_behavior:"inclusive"};
    const writesBeforeCooldown=stripeWrites().length;
    const coolingDown=await prepare(userCachedCreateError,setup.data.setup_intent_id,"FR");
    assert.equal(coolingDown.status,409);assert.equal(coolingDown.data.error,"TEST_PAYMENT_BUSY");
    assert.equal(stripeWrites().length,writesBeforeCooldown,
      "a click during the five-minute cooldown cannot issue another Stripe write");
    assert.equal((await attempt(userCachedCreateError)).subscription_create_key_version,1);

    const timestamp=Math.floor(Date.now()/1000)-3600;
    const customerId=current.stripe_customer_id;
    for(let index=1;index<=2;index++){
      const oldSubscriptionId=`sub_test_old_${index}`;
      fixture.subscriptions.set(oldSubscriptionId,{id:oldSubscriptionId,object:"subscription",
        livemode:false,status:"canceled",customer:customerId,metadata:{unrelated_fixture:"true"}});
      const oldInvoiceId=`in_test_old_${index}`;
      fixture.invoices.set(oldInvoiceId,{id:oldInvoiceId,object:"invoice",livemode:false,status:"void",
        currency:"eur",amount_due:499,total:499,customer:customerId,subscription:oldSubscriptionId,
        created:timestamp,metadata:{}});
      const oldIntentId=`pi_test_old_${index}`;
      fixture.paymentIntents.set(oldIntentId,{id:oldIntentId,object:"payment_intent",livemode:false,
        status:"canceled",amount:499,currency:"eur",customer:customerId,
        payment_method:"pm_old_fixture",invoice:oldInvoiceId,created:timestamp,metadata:{}});
    }
    const subscriptionsBeforeRecovery=fixture.subscriptions.size;
    fixture.paginationPageSize=1;
    const setExpiredCooldown=async()=>fixture.pg.query(`update warboost_test_payment_attempts
      set lease_until=now()-interval '6 minutes',subscription_create_failure_at=now()-interval '6 minutes'
      where user_id=$1`,[userCachedCreateError]);

    await setExpiredCooldown();
    fixture.failInvoiceLookupOnce=true;
    const invoiceOutage=await prepare(userCachedCreateError,setup.data.setup_intent_id,"FR");
    assert.equal(invoiceOutage.status,502);
    assert.equal((await attempt(userCachedCreateError)).subscription_create_key_version,1);
    assert.equal((await attempt(userCachedCreateError)).state,"subscription_creating");
    assert.equal(fixture.subscriptions.size,subscriptionsBeforeRecovery);

    await setExpiredCooldown();
    fixture.failPaymentIntentLookupOnce=true;
    const intentOutage=await prepare(userCachedCreateError,setup.data.setup_intent_id,"FR");
    assert.equal(intentOutage.status,502);
    assert.equal((await attempt(userCachedCreateError)).subscription_create_key_version,1);
    assert.equal(fixture.subscriptions.size,subscriptionsBeforeRecovery);

    await setExpiredCooldown();
    const beforeWrites=stripeWrites().length;
    const [retryA,retryB]=await Promise.all([
      prepare(userCachedCreateError,setup.data.setup_intent_id,"FR"),
      prepare(userCachedCreateError,setup.data.setup_intent_id,"FR")
    ]);
    const successful=[retryA,retryB].filter(result=>
      result.status===200&&result.data.state==="payment_confirmation_required");
    assert.equal(successful.length,1,"only one concurrent request may create the recovered subscription");
    assert.ok([retryA,retryB].every(result=>
      result.status===200&&result.data.state==="payment_confirmation_required"||
      result.status===409&&result.data.error==="TEST_PAYMENT_BUSY"));
    const after=await attempt(userCachedCreateError);
    assert.equal(after.attempt_id,current.attempt_id,"recovery must preserve the attempt id");
    assert.equal(after.subscription_create_key_version,2,"only verified absence after the failure rotates the key");
    assert.equal(after.subscription_create_failure_version,null);
    assert.equal(after.state,"payment_pending");
    assert.equal(fixture.subscriptions.size,subscriptionsBeforeRecovery+1);
    assert.equal(fixture.paymentIntents.size,beforePaymentIntents+3);
    assert.equal(fixture.invoices.size,beforeInvoices+3);
    const subscriptionPosts=stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST");
    assert.equal(subscriptionPosts.length,subscriptionPostsBefore+2,"one cached 400 and one successful new-key create");
    const keys=subscriptionPosts.slice(-2).map(call=>call.opts.headers["Idempotency-Key"]);
    assert.deepEqual(keys,[legacyKey,`${legacyKey}-v2`]);
    assert.equal(stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method!=="POST").length>=6,true,
      "subscription reconciliation must follow pagination");
    assert.equal(stripeCalls().filter(call=>call.path==="/v1/invoices"&&call.opts?.method!=="POST").length>=4,true,
      "invoice reconciliation must follow pagination");
    assert.equal(stripeCalls().filter(call=>call.path==="/v1/payment_intents"&&call.opts?.method!=="POST").length>=4,true,
      "PaymentIntent reconciliation must follow pagination");
    assert.equal(stripeWrites().length,beforeWrites+1,"recovery must perform exactly one provider write");
    const replay=await prepare(userCachedCreateError,setup.data.setup_intent_id,"FR");
    assert.equal(replay.status,200);
    assert.equal(replay.data.subscription_id,successful[0].data.subscription_id);
    assert.equal(stripeCalls().filter(call=>call.path==="/v1/subscriptions"&&call.opts?.method==="POST").length,subscriptionPostsBefore+2,
      "replay must reuse the persisted subscription without another create");
    fixture.priceOverride=originalPriceOverride;
    fixture.paginationPageSize=100;
    noLiveStripeCalls();noSucceededPayment();
  });

  await check("Unresolved Stripe tax calculation cancels the incomplete subscription before payment confirmation",async()=>{
    fixture.invoiceAmount=599;
    const totalMismatch=await prepare(userA,userASetup,"FR");
    assert.equal(totalMismatch.status,409);assert.equal(totalMismatch.data.error,"TEST_INVOICE_NOT_READY");
    const mismatchSub=[...fixture.subscriptions.values()].at(-1);
    const mismatchPi=[...fixture.paymentIntents.values()].at(-1);
    assert.equal(mismatchSub.status,"canceled");assert.notEqual(mismatchPi.status,"succeeded");
    assert.equal((await attempt(userA)).state,"canceled");
    fixture.invoiceAmount=499;

    const setupAfterMismatch=await start(userA);
    assert.equal(setupAfterMismatch.status,200);
    fixture.completeSetup(setupAfterMismatch.data.setup_intent_id,{country:"FR"});
    fixture.taxStatus="requires_location_inputs";
    const result=await prepare(userA,setupAfterMismatch.data.setup_intent_id,"FR");
    assert.equal(result.status,409,JSON.stringify(result.data));assert.equal(result.data.error,"TEST_INVOICE_NOT_READY");
    const sub=[...fixture.subscriptions.values()].at(-1);
    const pi=[...fixture.paymentIntents.values()].at(-1);
    assert.equal(sub.status,"canceled");assert.notEqual(pi.status,"succeeded");
    assert.equal((await attempt(userA)).state,"canceled");noSucceededPayment();
    fixture.taxStatus="complete";
  });

  let paidAttempt;
  await check("Valid TEST invoice is prepared incomplete, repeat is idempotent, and PRO waits for signed webhook",async()=>{
    const newSetup=await start(userA);
    assert.equal(newSetup.status,200);assert.equal(newSetup.data.state,"setup_required");
    fixture.completeSetup(newSetup.data.setup_intent_id,{country:"FR"});
    const result=await prepare(userA,newSetup.data.setup_intent_id,"FR");
    assert.equal(result.status,200);assert.equal(result.data.state,"payment_confirmation_required");
    assert.equal(result.data.amount_due,499);assert.equal(result.data.currency,"eur");
    assert.equal(fixture.price().tax_behavior,"unspecified");
    const subscription=fixture.subscriptions.get(result.data.subscription_id);
    const pi=fixture.paymentIntents.get(result.data.payment_intent_id);
    assert.equal(subscription.status,"incomplete");assert.equal(pi.status,"requires_payment_method");
    assert.equal((await entitlementForUser(user(userA))).active,false);
    const count=fixture.subscriptions.size;
    const retry=await prepare(userA,newSetup.data.setup_intent_id,"FR");
    assert.equal(retry.status,200);assert.equal(retry.data.subscription_id,result.data.subscription_id);
    assert.equal(retry.data.payment_intent_id,result.data.payment_intent_id);assert.equal(fixture.subscriptions.size,count);
    paidAttempt={subscription,pi,invoice:subscription.latest_invoice};
  });

  await check("Simulated payment is not granted until a signed webhook; replay is idempotent",async()=>{
    paidAttempt.subscription.status="active";paidAttempt.pi.status="succeeded";paidAttempt.invoice.status="paid";
    const event=fixture.event("invoice.paid",{id:paidAttempt.invoice.id,object:"invoice",
      customer:paidAttempt.subscription.customer,subscription:paidAttempt.subscription.id});
    const first=await webhook(event);
    assert.equal(first.status,200);assert.equal(first.data.access_granted,true);
    assert.equal((await entitlementForUser(user(userA))).active,true);
    const duplicate=await webhook(event);
    assert.equal(duplicate.status,200);assert.equal(duplicate.data.duplicate,true);
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_billing_events where event_id=$1",[event.id])).rows[0].n,1);
  });

  await check("Lost subscription response retries the same attempt; cancellation leaves no entitlement",async()=>{
    const succeededBefore=new Set([...fixture.paymentIntents.values()]
      .filter(pi=>pi.status==="succeeded").map(pi=>pi.id));
    const setup=await start(userFree);
    assert.equal(setup.status,200);
    fixture.completeSetup(setup.data.setup_intent_id,{country:"FR"});
    const subscriptionCount=fixture.subscriptions.size;
    fixture.failSubscriptionOnce=true;
    const first=await prepare(userFree,setup.data.setup_intent_id,"FR");
    assert.notEqual(first.status,200);
    const attemptBefore=await attempt(userFree),created=[...fixture.subscriptions.values()]
      .filter(s=>s.metadata?.warboost_user_id===userFree&&s.metadata?.warboost_setup_attempt_id===attemptBefore.attempt_id);
    assert.equal(created.length,1);assert.equal(created[0].status,"incomplete");
    await fixture.pg.query("update warboost_test_payment_attempts set lease_until=now()-interval '1 second' where user_id=$1",[userFree]);
    const retry=await prepare(userFree,setup.data.setup_intent_id,"FR");
    assert.equal(retry.status,200);assert.equal(retry.data.subscription_id,created[0].id);
    assert.equal(fixture.subscriptions.size,subscriptionCount+1,"retry did not create a duplicate subscription");
    const canceled=await post(userFree,{action:"cancel_test_pending"});
    assert.equal(canceled.status,200);assert.equal(canceled.data.state,"canceled");
    assert.equal(created[0].status,"canceled");assert.equal((await entitlementForUser(user(userFree))).active,false);
    noNewSucceededPayments(succeededBefore);
  });

  await check("Setup diagnostics never expose provider bodies or weaken TEST, admin, country, or tax gates",async()=>{
    const api=fs.readFileSync("api/pro.js","utf8"),flow=fs.readFileSync("lib/stripe-test-payment-flow.js","utf8");
    assert.match(api,/const user=await requireUser\(req\);requestAuthenticated=true;\s*const beta=await betaAccessForUserAsync\(user\)/);
    assert.match(api,/requestAction==="prepare_test_subscription"&&commerce\.mode==="test"&&commerce\.test_payments_enabled&&requestAuthenticated/);
    assert.match(api,/commerce\.mode!=="test"\|\|!commerce\.test_payments_enabled/);
    assert.match(api,/confirm_test_only!==true\|\|body\?\.test_subscription_consent!==true/);
    assert.match(api,/isStripeTestDiagnosticAdmin\(diagnosticUser\)/);
    assert.match(flow,/assertBillingCountryAllowed\(country,"test"\)/);
    assert.match(flow,/assertTestTaxCountryReady\(country\)/);
    assert.match(flow,/diagnosticStage=stage/);
    assert.doesNotMatch(api,/Stripe TEST setup error:\s*\$\{e\.message/);
  });

  console.log(`Stripe SetupIntent targeted cases passed: ${passed}`);
}finally{
  await fixture.close();
}
