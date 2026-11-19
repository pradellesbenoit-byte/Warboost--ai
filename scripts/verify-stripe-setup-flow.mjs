import assert from "node:assert/strict";
import fs from "node:fs";
import {billingFixture,userA,userB,userFree} from "./billing-test-fixture.mjs";
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
const noSucceededPayment=()=>assert.ok([...fixture.paymentIntents.values()].every(pi=>pi.status!=="succeeded"));
const noNewSucceededPayments=priorIds=>assert.ok([...fixture.paymentIntents.values()]
  .every(pi=>pi.status!=="succeeded"||priorIds.has(pi.id)));

try{
  await check("PGlite migration is rerunnable, preserves rows, and denies client table access",async()=>{
    await fixture.pg.query(`insert into warboost_test_payment_attempts
      (user_id,attempt_id,state,billing_country,consent_version,expires_at)
      values($1,gen_random_uuid(),'canceled','FR','fixture-v1',now()+interval '1 hour')`,[userA]);
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_35_test_setup_intents.sql","utf8"));
    const row=(await fixture.pg.query("select state from warboost_test_payment_attempts where user_id=$1",[userA])).rows[0];
    assert.equal(row.state,"canceled");
    const rls=(await fixture.pg.query(`select relrowsecurity from pg_class where oid='public.warboost_test_payment_attempts'::regclass`)).rows[0];
    assert.equal(rls.relrowsecurity,true);
    const privileges=(await fixture.pg.query(`select
      has_table_privilege('anon','public.warboost_test_payment_attempts','select') as anon_read,
      has_table_privilege('authenticated','public.warboost_test_payment_attempts','insert') as user_insert,
      has_table_privilege('service_role','public.warboost_test_payment_attempts','select') as service_read`)).rows[0];
    assert.equal(privileges.anon_read,false);assert.equal(privileges.user_insert,false);assert.equal(privileges.service_read,true);
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
