import assert from "node:assert/strict";
import fs from "node:fs";
import {billingFixture,userA,userB,userBeta,userFree,userLive,userCountry} from "./billing-test-fixture.mjs";
import {commercialConfig,createCheckoutForUser,createPortalForUser,processWebhook,verifyWebhookSignature,subscriptionActive,readRawBody,recordLiveConsent} from "../lib/commercial-pro.js";
import {entitlementForUser,requireProductUser} from "../lib/pro-access.js";
import proHandler from "../api/pro.js";
import stateHandler from "../api/state.js";
import scanHandler from "../api/scan.js";
import adviceHandler from "../api/advice.js";
const fixture=await billingFixture();
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log(`BILLING ✓ ${name}`)};
const user=id=>({id,email:id===userBeta?"beta@example.test":id===userA?"a@example.test":id===userB?"b@example.test":"free@example.test"});
const createTestCheckout=(account,options={})=>createCheckoutForUser(account,{billingCountry:"FR",...options});
const deliver=e=>processWebhook(...fixture.sign(e));
async function call(handler,id,{method="GET",query={},body=null,parsedOnly=false}={}){
  let result;
  const req={method,query,headers:{authorization:`Bearer ${id}`,"x-warboost-beta-consent":"2026-09-05-safe-launch-v2"},body:body||{}};
  if(!parsedOnly)req.rawBody=Buffer.from(body?JSON.stringify(body):"");
  const res={setHeader(){},status(n){this.code=n;return this},json(data){result={code:this.code||200,data};return this}};
  await handler(req,res);return result;
}
async function callWebhook(raw,signature,mode="test"){
  let result;
  const req={method:"POST",query:{action:"webhook",mode},headers:{"stripe-signature":signature},rawBody:Buffer.from(raw)};
  const res={setHeader(){},status(n){this.code=n;return this},json(data){result={code:this.code||200,data};return this}};
  await proHandler(req,res);return result;
}
try{
  await test("Migrations execute and re-run on isolated PostgreSQL; tables/RPCs are not client-writable",async()=>{
    for(const p of fixture.migrations)await fixture.pg.exec(fs.readFileSync(p,"utf8"));
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_pro_grants")).rows[0].n,1);
    for(const role of ["anon","authenticated"]){
      const row=(await fixture.pg.query(`select has_function_privilege('${role}','public.warboost_claim_checkout(uuid)','EXECUTE') rpc,
        has_function_privilege('${role}','public.warboost_live_claim_checkout(uuid)','EXECUTE') live_rpc,
        has_table_privilege('${role}','public.warboost_pro_grants','INSERT') writes,
        has_table_privilege('${role}','public.warboost_live_commercial_consents','INSERT') live_consent_writes,
        has_table_privilege('${role}','public.warboost_live_commercial_consents','UPDATE') live_consent_updates,
        has_table_privilege('${role}','public.warboost_live_commercial_consents','DELETE') live_consent_deletes`)).rows[0];
      assert.equal(row.rpc,false);assert.equal(row.live_rpc,false);assert.equal(row.writes,false);
      assert.equal(row.live_consent_writes,false);assert.equal(row.live_consent_updates,false);assert.equal(row.live_consent_deletes,false);
    }
  });
  await test("LIVE mode and live keys cannot initiate a provider request",async()=>{
    Object.assign(process.env,{STRIPE_LIVE_SECRET_KEY:"",STRIPE_LIVE_PRICE_PRO_MONTHLY:"",STRIPE_LIVE_PRODUCT_PRO:"",STRIPE_LIVE_WEBHOOK_SECRET:"",
      WARBOOST_LIVE_PAYMENTS_ENABLED:"",WARBOOST_LIVE_WEBHOOKS_ENABLED:"",WARBOOST_LIVE_TAX_READY:"",
      WARBOOST_LIVE_AUTOMATIC_TAX_ENABLED:"",WARBOOST_LIVE_APPROVED_BILLING_COUNTRIES:"",WARBOOST_LIVE_PRECHARGE_COUNTRY_GUARD:"",
      STRIPE_LIVE_TAX_CODE:"",WARBOOST_LEGAL_BUSINESS_NAME:"",WARBOOST_SUPPORT_EMAIL:"",WARBOOST_TERMS_URL:"",WARBOOST_PRIVACY_URL:""});
    const n=fixture.calls.filter(x=>x.host==="api.stripe.com").length;
    process.env.WARBOOST_COMMERCIAL_MODE="off";
    assert.equal(commercialConfig().test_payments_enabled,false);assert.equal(commercialConfig().live_payments_enabled,false);
    const off=await call(proHandler,userLive,{method:"POST",body:{action:"checkout"},parsedOnly:true});
    assert.equal(off.code,403);assert.equal(off.data.error,"SAFE_LAUNCH_PAYMENT_DISABLED");
    process.env.WARBOOST_COMMERCIAL_MODE="live";
    assert.equal(commercialConfig().payments_enabled,false);
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"LIVE_ACTIVATION_REQUIREMENTS_MISSING"});
    process.env.WARBOOST_COMMERCIAL_MODE="test";process.env.STRIPE_SECRET_KEY="sk_live_fixture_not_real";
    await assert.rejects(createTestCheckout(user(userA)),{code:"STRIPE_TEST_KEY_REQUIRED"});
    assert.equal(fixture.calls.filter(x=>x.host==="api.stripe.com").length,n);process.env.STRIPE_SECRET_KEY="sk_test_fixture_only";
  });
  await test("Wrong amount/currency/product/interval count/usage/livemode Price rejected before checkout",async()=>{
    for(const override of [{unit_amount:599},{currency:"usd"},{product:"prod_other"},{recurring:{interval:"month",interval_count:3,usage_type:"licensed"}},
      {recurring:{interval:"month",interval_count:1,usage_type:"metered"}},{livemode:true},{active:false},{id:"price_other"}]){
      fixture.priceOverride=override;await assert.rejects(createTestCheckout(user(userA)));
    }
    fixture.priceOverride={};fixture.productOverride={active:false};
    await assert.rejects(createTestCheckout(user(userA)),{code:"PRO_PRODUCT_MISMATCH"});fixture.productOverride={};
    assert.equal(fixture.sessions.size,0);
  });
  await test("TEST Checkout validates country server-side before any Stripe request or billing reservation",async()=>{
    assert.equal(commercialConfig().test_checkout_enabled,true);
    assert.deepEqual(commercialConfig().test_approved_billing_countries,["FR"]);
    const stripeCalls=()=>fixture.calls.filter(x=>x.host==="api.stripe.com");
    const reservations=async()=>(await fixture.pg.query("select count(*)::int n from warboost_checkout_attempts")).rows[0].n;
    const before=stripeCalls().length,sessions=fixture.sessions.size,customers=fixture.customers.size;
    const reservationCount=await reservations();
    await assert.rejects(createCheckoutForUser(user(userCountry)),{code:"BILLING_COUNTRY_REQUIRED"});
    await assert.rejects(createCheckoutForUser(user(userCountry),{billingCountry:"US"}),{code:"BILLING_COUNTRY_NOT_APPROVED"});
    assert.equal(stripeCalls().length,before);
    assert.equal(fixture.sessions.size,sessions);assert.equal(fixture.customers.size,customers);
    assert.equal(await reservations(),reservationCount);
    process.env.WARBOOST_TEST_BILLING_PREFLIGHT_ENABLED="false";
    await assert.rejects(createCheckoutForUser(user(userCountry),{billingCountry:"FR"}),{code:"BILLING_COUNTRY_PREFLIGHT_NOT_CONFIGURED"});
    process.env.WARBOOST_TEST_BILLING_PREFLIGHT_ENABLED="true";
    assert.equal(stripeCalls().length,before);
    const apiMissing=await call(proHandler,userCountry,{method:"POST",body:{action:"checkout"}});
    assert.equal(apiMissing.code,400);assert.equal(apiMissing.data.error,"BILLING_COUNTRY_REQUIRED");
    const apiDenied=await call(proHandler,userCountry,{method:"POST",body:{action:"checkout",billing_country:"US"}});
    assert.equal(apiDenied.code,403);assert.equal(apiDenied.data.error,"BILLING_COUNTRY_NOT_APPROVED");
    assert.equal(stripeCalls().length,before);
    assert.equal(await reservations(),reservationCount);
    const allowed=await call(proHandler,userCountry,{method:"POST",body:{action:"checkout",billing_country:"fr"}});
    assert.equal(allowed.code,200);assert.equal(allowed.data.mode,"test");assert.equal(allowed.data.test,true);
    assert.equal(fixture.sessions.size,sessions+1);assert.equal(fixture.customers.size,customers+1);
    assert.equal(await reservations(),reservationCount+1);
    const latestSession=[...fixture.sessions.values()].at(-1);
    const createdCustomer=[...fixture.customers.values()].find(row=>row.id===latestSession.customer);
    assert.equal(createdCustomer.address.country,"FR","country is normalized and attached only after allowlist validation");
    assert.equal(allowed.data.live,false);
    assert.ok(stripeCalls().some(x=>x.path==="/v1/checkout/sessions"));
  });
  await test("Two simultaneous tabs: one persistent Checkout, target 499 EUR monthly and TEST return URLs",async()=>{
    const sessionsBefore=fixture.sessions.size,customersBefore=fixture.customers.size;
    const results=await Promise.allSettled([createTestCheckout(user(userA)),createTestCheckout(user(userA))]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(results.find(x=>x.status==="rejected").reason.code,"CHECKOUT_IN_PROGRESS");
    assert.equal(fixture.sessions.size,sessionsBefore+1);assert.equal(fixture.customers.size,customersBefore+1);
    const retry=await createTestCheckout(user(userA));assert.equal(retry.url,results.find(x=>x.status==="fulfilled").value.url);
    assert.equal((await fixture.rpc("warboost_live_claim_checkout",{p_user_id:userA})).state,"busy",
      "an open TEST session blocks a simultaneous LIVE checkout");
    const params=new URLSearchParams(fixture.calls.filter(x=>x.path==="/v1/checkout/sessions").at(-1).opts.body);
    assert.equal(params.get("line_items[0][price]"),"price_pro_test");assert.equal(params.get("line_items[0][quantity]"),"1");
    assert.equal(params.get("success_url"),"https://beta.warboost.fr/?billing=test-success");
    assert.equal(params.get("cancel_url"),"https://beta.warboost.fr/?billing=test-cancel");
  });
  const customerA=(await fixture.pg.query("select stripe_customer_id from warboost_billing_accounts where user_id=$1",[userA])).rows[0].stripe_customer_id;
  let subscription=fixture.sub(customerA);subscription.metadata={user_id:userA};fixture.subscriptions.set(subscription.id,subscription);
  await test("Success browser return alone stays FREE; scans are FREE while advice remains PRO-gated",async()=>{
    assert.equal((await entitlementForUser(user(userA))).active,false);
    const pro=await call(proHandler,userA,{query:{billing:"test-success"}});
    assert.equal(pro.data.active,false);assert.equal(pro.data.allowed,true);
    const scan=await call(scanHandler,userA,{method:"POST",body:{}});
    assert.equal(scan.code,400,"FREE user reaches scan input validation rather than a PRO gate");
    assert.notEqual(scan.data.code||scan.data.error,"PRO_REQUIRED");
    const advice=await call(adviceHandler,userA,{method:"POST",body:{}});
    assert.equal(advice.code,403);assert.equal(advice.data.code||advice.data.error,"PRO_REQUIRED");
  });
  await test("Valid signed webhook activates new payer without old beta invitation",async()=>{
    const e=fixture.event("checkout.session.completed",{object:"checkout.session",customer:customerA,subscription:subscription.id,client_reference_id:userA});
    assert.equal((await deliver(e)).processed,true);
    const entitlement=await entitlementForUser(user(userA));assert.equal(entitlement.tier,"PRO_PAID");assert.equal(entitlement.source,"stripe");
    const req={headers:{authorization:`Bearer ${userA}`,"x-warboost-beta-consent":"2026-09-05-safe-launch-v2"}};
    assert.equal((await requireProductUser(req,{consent:true,pro:true})).user.id,userA);
    assert.equal((await call(proHandler,userA)).data.active,true);
    const state=await call(stateHandler,userA,{query:{restore:"fast"}});
    assert.equal(state.code,200);assert.equal(state.data.state,null);
  });
  await test("Duplicate webhook is idempotent, no duplicate subscription",async()=>{
    const e=fixture.event("customer.subscription.updated",subscription);
    await deliver(e);assert.equal((await deliver(e)).duplicate,true);
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_subscriptions where user_id=$1",[userA])).rows[0].n,1);
  });
  await test("Parallel delivery of the same event is safe and retryable",async()=>{
    const e=fixture.event("customer.subscription.updated",subscription);
    const result=await Promise.allSettled([deliver(e),deliver(e)]);
    assert.equal(result.filter(x=>x.status==="fulfilled").length,1);
    assert.equal((await deliver(e)).duplicate,true);
  });
  await test("Bad/expired signatures and LIVE webhook rejected without DB writes",async()=>{
    const e=fixture.event("customer.subscription.updated",subscription),[raw,sig]=fixture.sign(e);
    assert.equal(verifyWebhookSignature(raw,"t=1,v1="+"0".repeat(64)),false);
    await assert.rejects(processWebhook(raw,sig.replace(/v1=.*/,"v1="+"0".repeat(64))),{code:"INVALID_WEBHOOK_SIGNATURE"});
    const liveEvent={...e,livemode:true},[liveRaw,liveSig]=fixture.sign(liveEvent,false);
    await assert.rejects(processWebhook(liveRaw,liveSig),{code:"STRIPE_LIVE_EVENT_REJECTED"});
  });
  await test("Failed DB application remains replayable; retry succeeds",async()=>{
    fixture.failApplyOnce=true;const e=fixture.event("invoice.paid",{object:"invoice",customer:customerA,subscription:subscription.id});
    await assert.rejects(deliver(e),{code:"COMMERCIAL_DATABASE_ERROR"});
    const row=(await fixture.pg.query("select * from warboost_billing_events where event_id=$1",[e.id])).rows[0];
    assert.equal(row.processing_status,"failed");assert.equal(row.processed,false);assert.equal(row.error_code,"COMMERCIAL_DATABASE_ERROR");assert.equal(row.user_id,userA);
    assert.equal((await deliver(e)).processed,true);
    fixture.failDb=true;const other=fixture.event("customer.subscription.updated",subscription);
    await assert.rejects(deliver(other));fixture.failDb=false;await deliver(other);
  });
  await test("Delayed/out-of-order snapshots never resurrect canceled PRO; current Stripe state wins",async()=>{
    const created=Math.floor(Date.now()/1000)+5;
    subscription={...subscription,status:"canceled"};fixture.subscriptions.set(subscription.id,subscription);
    await deliver(fixture.event("customer.subscription.deleted",subscription,created));
    await deliver(fixture.event("customer.subscription.updated",{...subscription,status:"active"},created-1));
    assert.equal((await entitlementForUser(user(userA))).active,false);
    // Even a newer delivery containing stale active data reads the provider's canceled state.
    await deliver(fixture.event("customer.subscription.updated",{...subscription,status:"active"},created+1));
    assert.equal((await entitlementForUser(user(userA))).active,false);
  });
  let clock=Math.floor(Date.now()/1000)+20;
  await test("Renewal, failed payment, unpaid, trialing, recovery and cancellation at period end",async()=>{
    for(const [status,eventType,expected] of [["active","invoice.paid",true],["past_due","invoice.payment_failed",false],["unpaid","customer.subscription.updated",false],
      ["trialing","customer.subscription.updated",true],["active","invoice.payment_succeeded",true]]){
      subscription={...subscription,status,current_period_end:Math.floor(Date.now()/1000)+172800};fixture.subscriptions.set(subscription.id,subscription);
      await deliver(fixture.event(eventType,eventType.startsWith("invoice.")?{object:"invoice",customer:customerA,subscription:subscription.id}:subscription,clock++));
      assert.equal((await entitlementForUser(user(userA))).active,expected,status);
    }
    subscription={...subscription,cancel_at_period_end:true};fixture.subscriptions.set(subscription.id,subscription);
    await deliver(fixture.event("customer.subscription.updated",subscription,clock++));
    assert.equal((await entitlementForUser(user(userA))).active,true);
    const row=(await fixture.pg.query("select * from warboost_subscriptions where user_id=$1",[userA])).rows[0];
    assert.equal(subscriptionActive(row,Date.parse(row.current_period_end)+1),false);
    subscription={...subscription,cancel_at_period_end:false};fixture.subscriptions.set(subscription.id,subscription);
    await deliver(fixture.event("customer.subscription.updated",subscription,clock++));
    assert.equal((await entitlementForUser(user(userA))).subscription.cancel_at_period_end,false);
  });
  await test("Active subscription prevents another Checkout; expired/mismatched price never grants PRO",async()=>{
    await assert.rejects(createTestCheckout(user(userA)),{code:"PRO_SUBSCRIPTION_EXISTS"});
    const row=(await fixture.pg.query("select * from warboost_subscriptions where user_id=$1",[userA])).rows[0];
    for(const bad of [{current_period_end:null},{current_period_end:"bad"},{stripe_price_id:"price_other"},{stripe_product_id:"prod_other"},{livemode:true},{plan:"free"}])
      assert.equal(subscriptionActive({...row,...bad}),false);
  });
  await test("Portal belongs to authenticated account; missing customer gets clean error",async()=>{
    const portal=await createPortalForUser(user(userA));assert.equal(portal.test,true);
    const call=fixture.calls.findLast(x=>x.path==="/v1/billing_portal/sessions");
    assert.equal(new URLSearchParams(call.opts.body).get("customer"),customerA);
    await assert.rejects(createPortalForUser(user(userB)),{code:"BILLING_CUSTOMER_MISSING"});
    const result=await callPortal(userB);assert.equal(result.code,409);
  });
  await test("Cross-account metadata cannot transfer PRO; unlinked customers are ignored",async()=>{
    const bad={...subscription,metadata:{user_id:userB}};fixture.subscriptions.set(subscription.id,bad);
    await assert.rejects(deliver(fixture.event("customer.subscription.updated",bad,clock++)),{code:"BILLING_OWNER_MISMATCH"});
    assert.equal((await entitlementForUser(user(userB))).active,false);
    fixture.subscriptions.set(subscription.id,subscription);
    const ignored=await deliver(fixture.event("customer.subscription.updated",fixture.sub("cus_unlinked","sub_unlinked"),clock++));
    assert.equal(ignored.ignored,true);
  });
  await test("Subscription deletion revokes Stripe PRO, not independent beta grant",async()=>{
    subscription={...subscription,status:"canceled"};fixture.subscriptions.set(subscription.id,subscription);
    await deliver(fixture.event("customer.subscription.deleted",subscription,clock++));
    assert.equal((await entitlementForUser(user(userA))).tier,"FREE");
    const beta=await entitlementForUser(user(userBeta));assert.equal(beta.tier,"BETA_FREE");assert.equal(beta.persistent,true);
    const response=await call(proHandler,userBeta,{method:"POST",body:{action:"checkout"}});
    assert.equal(response.data.error,"BETA_PRO_INCLUDED");
    assert.equal((await entitlementForUser(user(userFree))).tier,"FREE");
  });
  await test("Nonce preserved after provider success/network loss; retry cannot create second session",async()=>{
    fixture.failCheckoutOnce=true;await assert.rejects(createTestCheckout(user(userB)));
    const count=fixture.sessions.size;
    await fixture.pg.query("update warboost_checkout_attempts set lease_until=now()-interval '1 second' where user_id=$1",[userB]);
    await createTestCheckout(user(userB));assert.equal(fixture.sessions.size,count);
  });
  await test("Server-only journal is minimal, browser contains no Stripe secrets; exact raw-body required",async()=>{
    for(const file of ["app.js","index.html","sw.js","publisher-ui.js"])
      assert.doesNotMatch(fs.readFileSync(file,"utf8"),/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+/);
    for(const table of ["warboost_billing_events","warboost_live_billing_events"]){
      const columns=(await fixture.pg.query("select column_name from information_schema.columns where table_name=$1",[table])).rows.map(x=>x.column_name);
      assert.ok(!columns.some(c=>/payload|email|card|secret/.test(c)));
    }
    await assert.rejects(readRawBody({body:{hello:"parsed"}}),{code:"RAW_BODY_REQUIRED"});
  });
  await test("Incomplete/3DS-pending or declined-payment fixture cannot activate PRO",async()=>{
    const customerB=(await fixture.pg.query("select stripe_customer_id from warboost_billing_accounts where user_id=$1",[userB])).rows[0].stripe_customer_id;
    const pending=fixture.sub(customerB,"sub_pending","incomplete");pending.metadata={user_id:userB};fixture.subscriptions.set(pending.id,pending);
    await deliver(fixture.event("checkout.session.completed",{object:"checkout.session",customer:customerB,subscription:pending.id,client_reference_id:userB},clock++));
    assert.equal((await entitlementForUser(user(userB))).active,false);
    await deliver(fixture.event("invoice.payment_failed",{object:"invoice",customer:customerB,subscription:pending.id},clock++));
    assert.equal((await entitlementForUser(user(userB))).active,false);
    fixture.subscriptions.set(pending.id,{...pending,status:"active"});
    await deliver(fixture.event("invoice.paid",{object:"invoice",customer:customerB,subscription:pending.id},clock++));
    assert.equal((await entitlementForUser(user(userB))).active,true);
  });
  await test("Canceled old subscription cannot revoke a replacement even with a newer event",async()=>{
    const replacement={...subscription,id:"sub_replacement",status:"active"};fixture.subscriptions.set(replacement.id,replacement);
    await deliver(fixture.event("customer.subscription.created",replacement,clock++));
    assert.equal((await entitlementForUser(user(userA))).active,true);
    const oldResult=await deliver(fixture.event("customer.subscription.deleted",subscription,clock++));
    assert.equal(oldResult.ignored,true);assert.equal((await entitlementForUser(user(userA))).active,true);
  });
  await test("Cohort is frozen; later invitations do not become free PRO; grant revocation stays revoked",async()=>{
    await fixture.pg.query("insert into wb1_beta_invites(email,status,invited_at,accepted_user_id) values('free@example.test','accepted',now()+interval '1 second',$1)",[userFree]);
    assert.equal((await entitlementForUser(user(userFree))).source,"free");
    await fixture.pg.query("update warboost_pro_grants set revoked_at=now() where user_id=$1",[userBeta]);
    assert.equal((await entitlementForUser(user(userBeta))).active,false);
    for(const path of fixture.migrations)await fixture.pg.exec(fs.readFileSync(path,"utf8"));
    assert.equal((await entitlementForUser(user(userBeta))).active,false);
  });
  await test("LIVE mock remains OFF without explicit configuration and does not call provider or write consent",async()=>{
    const before=fixture.calls.filter(x=>x.host==="api.stripe.com").length;
    process.env.WARBOOST_COMMERCIAL_MODE="live";
    assert.equal(commercialConfig().live_payments_enabled,false);
    const response=await call(proHandler,userLive,{method:"POST",body:{action:"checkout",commercial_consent_accepted:true,commercial_consent_version:"2026-11-warboost-pro-monthly-v1",billing_country:"FR"}});
    assert.equal(response.code,403);assert.equal(response.data.error,"SAFE_LAUNCH_PAYMENT_DISABLED");
    assert.equal(fixture.calls.filter(x=>x.host==="api.stripe.com").length,before);
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_live_commercial_consents")).rows[0].n,0);
  });
  await test("LIVE mock requires legal consent version and approved country before any Stripe request",async()=>{
    Object.assign(process.env,{WARBOOST_COMMERCIAL_MODE:"live",STRIPE_LIVE_SECRET_KEY:"sk_live_fixture_not_real",
      STRIPE_LIVE_PRICE_PRO_MONTHLY:"price_pro_live_fixture",STRIPE_LIVE_PRODUCT_PRO:"prod_pro_live_fixture",
      STRIPE_LIVE_WEBHOOK_SECRET:"whsec_live_fixture_only",WARBOOST_LIVE_PAYMENTS_ENABLED:"true",
      WARBOOST_LIVE_WEBHOOKS_ENABLED:"true",WARBOOST_LIVE_TAX_READY:"true",WARBOOST_LIVE_AUTOMATIC_TAX_ENABLED:"true",
      STRIPE_LIVE_TAX_CODE:"txcd_fixture",WARBOOST_LIVE_APPROVED_BILLING_COUNTRIES:"FR",WARBOOST_LIVE_PRECHARGE_COUNTRY_GUARD:"verified",
      WARBOOST_LEGAL_BUSINESS_NAME:"WarBoost Fixture",WARBOOST_SUPPORT_EMAIL:"support@example.test",
      WARBOOST_TERMS_URL:"https://terms.example.test",WARBOOST_PRIVACY_URL:"https://privacy.example.test"});
    assert.equal(commercialConfig().live_payments_enabled,false,
      "self-declared Checkout billing country cannot satisfy pre-charge verification");
    assert.equal(commercialConfig().activation_requirements.live.precharge_country_guard,false);
    const before=fixture.calls.filter(x=>x.host==="api.stripe.com").length;
    const noConsent=await call(proHandler,userLive,{method:"POST",body:{action:"checkout"}});
    assert.equal(noConsent.code,403);assert.equal(noConsent.data.error,"SAFE_LAUNCH_PAYMENT_DISABLED");
    const wrongCountry=await call(proHandler,userLive,{method:"POST",body:{action:"checkout",commercial_consent_accepted:true,
      commercial_consent_version:"2026-11-warboost-pro-monthly-v1",billing_country:"US"}});
    assert.equal(wrongCountry.code,403);assert.equal(wrongCountry.data.error,"SAFE_LAUNCH_PAYMENT_DISABLED");
    process.env.WARBOOST_TERMS_URL="";
    assert.equal(commercialConfig().live_payments_enabled,false,"missing legal page keeps LIVE disabled");
    process.env.WARBOOST_TERMS_URL="https://terms.example.test";
    assert.equal(fixture.calls.filter(x=>x.host==="api.stripe.com").length,before);
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_live_commercial_consents")).rows[0].n,0);
  });
  await test("LIVE price must be inclusive and exactly EUR 4.99/month before consent storage or customer creation",async()=>{
    const sessions=fixture.sessions.size,customers=fixture.customers.size;
    fixture.livePriceOverride={tax_behavior:"exclusive"};
    const rejected=await call(proHandler,userLive,{method:"POST",body:{action:"checkout",commercial_consent_accepted:true,
      commercial_consent_version:"2026-11-warboost-pro-monthly-v1",billing_country:"FR"}});
    assert.equal(rejected.code,403);assert.equal(rejected.data.error,"SAFE_LAUNCH_PAYMENT_DISABLED");
    assert.equal(fixture.sessions.size,sessions);assert.equal(fixture.customers.size,customers);
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_live_commercial_consents")).rows[0].n,0);
    fixture.livePriceOverride={};
  });
  await test("A self-declared country and the legacy verified flag cannot unlock LIVE Checkout",async()=>{
    process.env.WARBOOST_LIVE_PRECHARGE_COUNTRY_GUARD="verified";
    const before=fixture.calls.filter(x=>x.host==="api.stripe.com").length;
    const sessions=fixture.sessions.size,customers=fixture.customers.size;
    await assert.rejects(createCheckoutForUser(user(userLive),{mode:"live",commercialConsent:{
      commercial_consent_accepted:true,commercial_consent_version:"2026-11-warboost-pro-monthly-v1",billing_country:"FR"
    }}),{code:"LIVE_ACTIVATION_REQUIREMENTS_MISSING"});
    assert.equal(fixture.calls.filter(x=>x.host==="api.stripe.com").length,before);
    assert.equal(fixture.sessions.size,sessions);assert.equal(fixture.customers.size,customers);
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_live_commercial_consents")).rows[0].n,0);
  });
  await test("LIVE consent is append-only, timestamped, and attributed to the authenticated server user",async()=>{
    const consent=await recordLiveConsent(user(userLive),{
      version:"2026-11-warboost-pro-monthly-v1",
      terms:"https://terms.example.test",privacy:"https://privacy.example.test",country:"FR",
      user_id:userB
    });
    assert.equal(consent.user_id,userLive,"body-supplied user_id cannot redirect consent attribution");
    assert.equal(consent.consent_version,"2026-11-warboost-pro-monthly-v1");
    assert.equal(consent.billing_country,"FR");
    assert.ok(Number.isFinite(Date.parse(consent.accepted_at)),"acceptance timestamp is persisted");
    assert.ok(consent.consent_event_id);
    const eventCount=(await fixture.pg.query(
      "select count(*)::int n from warboost_live_commercial_consents where user_id=$1",[userLive])).rows[0].n;
    assert.equal(eventCount,1);
    await assert.rejects(fixture.rpc("warboost_live_record_commercial_consent",{
      p_consent_event_id:consent.consent_event_id,p_user_id:userB,
      p_consent_version:"2026-11-warboost-pro-monthly-v1",
      p_terms_url:"https://other.example.test",p_privacy_url:"https://privacy.example.test",p_billing_country:"US"
    }),/duplicate key|unique constraint/i,"reusing an event ID cannot overwrite or reassign it");
    await assert.rejects(fixture.pg.query(
      "update warboost_live_commercial_consents set billing_country='US' where consent_event_id=$1",[consent.consent_event_id]),
      /LIVE_CONSENT_APPEND_ONLY/);
    await assert.rejects(fixture.pg.query(
      "delete from warboost_live_commercial_consents where consent_event_id=$1",[consent.consent_event_id]),
      /LIVE_CONSENT_APPEND_ONLY/);
    await fixture.pg.exec("set role service_role");
    try{
      await assert.rejects(fixture.pg.query(
        "update warboost_live_commercial_consents set billing_country='US' where consent_event_id=$1",
        [consent.consent_event_id]),/LIVE_CONSENT_APPEND_ONLY/);
    }finally{await fixture.pg.exec("reset role")}
    const after=(await fixture.pg.query(
      "select user_id,billing_country,terms_url,accepted_at from warboost_live_commercial_consents where consent_event_id=$1",
      [consent.consent_event_id])).rows[0];
    assert.equal(after.user_id,userLive);assert.equal(after.billing_country,"FR");
    assert.equal(after.terms_url,"https://terms.example.test");
    assert.equal(new Date(after.accepted_at).toISOString(),new Date(consent.accepted_at).toISOString(),
      "database and HTTP timestamp representations must denote the same UTC instant");

    const authSource=fs.readFileSync("api/pro.js","utf8");
    assert.match(authSource,/const user=await requireUser\(req\)/);
    assert.match(authSource,/createCheckoutForUser\(user,\{mode:"live",commercialConsent:body,billingCountry:body\.billing_country\}\)/);
    assert.match(authSource,/createCheckoutForUser\(user,\{mode:"test",billingCountry:body\.billing_country\}\)/);
    assert.doesNotMatch(authSource,/commercialConsent:\s*\{[^}]*user_id\s*:\s*body/i);

    const deletedUser="10000000-0000-4000-8000-000000000006";
    await fixture.pg.query("insert into auth.users(id,email) values($1,'delete-consent@example.test')",[deletedUser]);
    await recordLiveConsent(user(deletedUser),{
      version:"2026-11-warboost-pro-monthly-v1",
      terms:"https://terms.example.test",privacy:"https://privacy.example.test",country:"FR"
    });
    await fixture.pg.query("delete from auth.users where id=$1",[deletedUser]);
    assert.equal((await fixture.pg.query(
      "select count(*)::int n from warboost_live_commercial_consents where user_id=$1",[deletedUser])).rows[0].n,0,
      "the existing account-deletion cascade remains available for privacy");
  });
  await test("LIVE signed webhook cannot grant PRO from the self-declared Customer country; duplicate/cancel are safe",async()=>{
    const liveCustomerId="cus_live_fixture_seeded";
    await fixture.pg.query("insert into warboost_billing_accounts(user_id,stripe_live_customer_id) values($1,$2)",[userLive,liveCustomerId]);
    fixture.customers.set(liveCustomerId,{id:liveCustomerId,object:"customer",livemode:true,address:{country:"FR"}});
    const account=(await fixture.pg.query("select stripe_live_customer_id from warboost_billing_accounts where user_id=$1",[userLive])).rows[0];
    let liveSub=fixture.sub(account.stripe_live_customer_id,"sub_live_fixture","active","live");
    liveSub.metadata={user_id:userLive,commercial_consent_version:"2026-11-warboost-pro-monthly-v1",billing_country:"FR"};
    fixture.subscriptions.set(liveSub.id,liveSub);
    const event=fixture.event("customer.subscription.created",liveSub,Math.floor(Date.now()/1000),"evt_live_fixture_001",true);
    const [raw,signature]=fixture.sign(event);
    const delivered=await callWebhook(raw,signature,"live");
    assert.equal(delivered.code,200);assert.equal(delivered.data.processed,true);assert.equal(delivered.data.access_granted,false);
    assert.equal((await entitlementForUser(user(userLive))).active,false);
    assert.equal((await fixture.pg.query("select plan from warboost_subscriptions where user_id=$1",[userLive])).rows[0].plan,"free");
    assert.equal((await processWebhook(raw,signature,"live")).duplicate,true);
    const crossModeEvent=fixture.event("customer.subscription.updated",liveSub,undefined,"evt_test_cross_mode",false);
    const [crossModeRaw,crossModeSignature]=fixture.sign(crossModeEvent,true);
    await assert.rejects(processWebhook(crossModeRaw,crossModeSignature,"live"),{code:"STRIPE_TEST_EVENT_REJECTED"});
    liveSub={...liveSub,status:"canceled"};fixture.subscriptions.set(liveSub.id,liveSub);
    const canceled=fixture.event("customer.subscription.deleted",liveSub,Math.floor(Date.now()/1000)+2,"evt_live_fixture_002",true);
    assert.equal((await processWebhook(...fixture.sign(canceled),"live")).processed,true);
    assert.equal((await entitlementForUser(user(userLive))).active,false);
  });
  await test("LIVE portal uses only the separately linked LIVE customer",async()=>{
    const portal=await createPortalForUser(user(userLive),{mode:"live"});
    assert.equal(portal.live,true);assert.equal(portal.test,false);
    const request=fixture.calls.findLast(x=>x.path==="/v1/billing_portal/sessions");
    const account=(await fixture.pg.query("select stripe_live_customer_id from warboost_billing_accounts where user_id=$1",[userLive])).rows[0];
    assert.equal(new URLSearchParams(request.opts.body).get("customer"),account.stripe_live_customer_id);
  });
  console.log(`\nStripe TEST verification PASS: ${passed} scenarios. Provider transitions simulated; real cards/3DS remain manual.`);
}finally{await fixture.close()}
async function callPortal(id){return call(proHandler,id,{method:"POST",body:{action:"portal"}})}