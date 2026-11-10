import assert from "node:assert/strict";
import fs from "node:fs";
import {billingFixture,userA,userB,userBeta,userFree,userExistingLive,TEST_PRO_PRICE_ID,LIVE_PRO_PRICE_ID,LIVE_PRO_PRODUCT_ID} from "./billing-test-fixture.mjs";
import {commercialConfig,createCheckoutForUser,createLiveCheckoutForUser,createPortalForUser,createLivePortalForUser,
  processWebhook,processLiveWebhook,verifyWebhookSignature,subscriptionActive,readJsonRequestBody,readRawBody,LIVE_COMMERCIAL_CONSENT_VERSION} from "../lib/commercial-pro.js";
import {entitlementForUser,requireProductUser} from "../lib/pro-access.js";
import proHandler from "../api/pro.js";
import stateHandler from "../api/state.js";
import scanHandler from "../api/scan.js";
import adviceHandler from "../api/advice.js";
const fixture=await billingFixture();
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log(`BILLING ✓ ${name}`)};
const user=id=>({id,email:id===userBeta?"beta@example.test":id===userA?"a@example.test":id===userB?"b@example.test":"free@example.test"});
const deliver=e=>processWebhook(...fixture.sign(e));
const deliverLive=e=>processLiveWebhook(...fixture.signLive(e));
async function call(handler,id,{method="GET",query={},body=null}={}){
  let result;
  const req={method,query,headers:{authorization:`Bearer ${id}`,"x-warboost-beta-consent":"2026-09-05-safe-launch-v2"},body:body||{},rawBody:Buffer.from(body?JSON.stringify(body):"")};
  const res={setHeader(){},status(n){this.code=n;return this},json(data){result={code:this.code||200,data};return this}};
  await handler(req,res);return result;
}
async function callWithParsedBody(handler,id,body,query={}){
  let result;
  const req={method:"POST",query,headers:{authorization:`Bearer ${id}`,"x-warboost-beta-consent":"2026-09-05-safe-launch-v2"},body};
  const res={setHeader(){},status(n){this.code=n;return this},json(data){result={code:this.code||200,data};return this}};
  await handler(req,res);return result;
}
async function callWithRawStream(handler,raw,signature,query={}){
  let result;
  const req={method:"POST",query,headers:{"stripe-signature":signature},
    async *[Symbol.asyncIterator](){yield Buffer.from(raw)},
    get body(){throw new Error("Webhook reader accessed parsed body before raw bytes")}
  };
  const res={setHeader(){},status(n){this.code=n;return this},json(data){result={code:this.code||200,data};return this}};
  await handler(req,res);return result;
}
try{
  await test("Migrations execute and re-run on isolated PostgreSQL; tables/RPCs are not client-writable",async()=>{
    for(const p of fixture.migrations)await fixture.pg.exec(fs.readFileSync(p,"utf8"));
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_pro_grants")).rows[0].n,1);
    await fixture.pg.query(`insert into warboost_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,
      stripe_product_id,plan,status,livemode) values($1,'cus_history_fixture','sub_history_fixture','legacy-test-price','legacy-test-product','free','inactive',false)`,[userExistingLive]);
    const legacyBefore=(await fixture.pg.query("select * from warboost_subscriptions where user_id=$1",[userExistingLive])).rows[0];
    await fixture.pg.exec(fs.readFileSync("supabase/migration_v2_5_33_stripe_live_billing.sql","utf8"));
    assert.deepEqual((await fixture.pg.query("select * from warboost_subscriptions where user_id=$1",[userExistingLive])).rows[0],legacyBefore);
    for(const role of ["anon","authenticated"]){
      const row=(await fixture.pg.query(`select has_function_privilege('${role}','public.warboost_claim_checkout(uuid)','EXECUTE') rpc,
        has_table_privilege('${role}','public.warboost_pro_grants','INSERT') writes,
        has_function_privilege('${role}','public.warboost_live_claim_checkout(uuid)','EXECUTE') live_rpc,
        has_table_privilege('${role}','public.warboost_live_subscriptions','INSERT') live_writes`)).rows[0];
      assert.equal(row.rpc,false);assert.equal(row.writes,false);
      assert.equal(row.live_rpc,false);assert.equal(row.live_writes,false);
    }
    const liveFunctions=await fixture.pg.query(`select p.proname,p.proconfig from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'warboost_live_%'`);
    assert.equal(liveFunctions.rows.length,9);
    for(const fn of liveFunctions.rows)
      assert.ok(fn.proconfig?.includes("search_path=pg_catalog"),`${fn.proname} must pin a safe SECURITY DEFINER search_path`);
  });
  await test("LIVE mode and live keys cannot initiate a provider request",async()=>{
    const n=fixture.calls.length;process.env.WARBOOST_COMMERCIAL_MODE="live";
    assert.equal(commercialConfig().payments_enabled,false);
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"SAFE_LAUNCH_PAYMENT_DISABLED"});
    process.env.WARBOOST_COMMERCIAL_MODE="test";process.env.STRIPE_SECRET_KEY="sk_live_fixture_not_real";
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"STRIPE_TEST_KEY_REQUIRED"});
    assert.equal(fixture.calls.length,n);process.env.STRIPE_SECRET_KEY="sk_test_fixture_only";
  });
  await test("Parsed authenticated Checkout JSON is accepted; webhook uses original stream bytes only",async()=>{
    const parsed=await callWithParsedBody(proHandler,userFree,{action:"unknown"});
    assert.equal(parsed.code,400);assert.equal(parsed.data.error,"unknown_pro_action");
    const e=fixture.event("unsupported.fixture",{object:"fixture"},Math.floor(Date.now()/1000));
    const [raw,signature]=fixture.sign(e);
    const webhook=await callWithRawStream(proHandler,raw,signature,{action:"webhook",mode:"test"});
    assert.equal(webhook.code,200);assert.equal(webhook.data.ignored,true);
    await assert.rejects(readRawBody({body:{action:"webhook"}}),{code:"RAW_BODY_REQUIRED"});
    assert.deepEqual(await readJsonRequestBody({body:{action:"checkout"}}),{action:"checkout"});
  });
  await test("Wrong amount/currency/product/interval count/usage/livemode Price rejected before checkout",async()=>{
    for(const override of [{unit_amount:599},{currency:"usd"},{product:"prod_other"},{recurring:{interval:"month",interval_count:3,usage_type:"licensed"}},
      {recurring:{interval:"month",interval_count:1,usage_type:"metered"}},{livemode:true},{active:false},{id:"price_other"}]){
      fixture.priceOverride=override;await assert.rejects(createCheckoutForUser(user(userA)));
    }
    fixture.priceOverride={};fixture.productOverride={active:false};
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"PRO_PRODUCT_MISMATCH"});fixture.productOverride={};
    assert.equal(fixture.sessions.size,0);
  });
  await test("Two simultaneous tabs: one persistent Checkout, target 499 EUR monthly and TEST return URLs",async()=>{
    const results=await Promise.allSettled([createCheckoutForUser(user(userA)),createCheckoutForUser(user(userA))]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(results.find(x=>x.status==="rejected").reason.code,"CHECKOUT_IN_PROGRESS");
    assert.equal(fixture.sessions.size,1);assert.equal(fixture.customers.size,1);
    const retry=await createCheckoutForUser(user(userA));assert.equal(retry.url,results.find(x=>x.status==="fulfilled").value.url);
    const params=new URLSearchParams(fixture.calls.find(x=>x.path==="/v1/checkout/sessions").opts.body);
    assert.equal(params.get("line_items[0][price]"),TEST_PRO_PRICE_ID);assert.equal(params.get("line_items[0][quantity]"),"1");
    assert.equal(params.get("success_url"),"https://beta.warboost.fr/?billing=test-success");
    assert.equal(params.get("cancel_url"),"https://beta.warboost.fr/?billing=test-cancel");
  });
  const customerA=(await fixture.pg.query("select stripe_customer_id from warboost_billing_accounts where user_id=$1",[userA])).rows[0].stripe_customer_id;
  let subscription=fixture.sub(customerA);subscription.metadata={user_id:userA};fixture.subscriptions.set(subscription.id,subscription);
  await test("Success browser return stays FREE; FREE personal scans remain available while PRO advice stays gated",async()=>{
    assert.equal((await entitlementForUser(user(userA))).active,false);
    const pro=await call(proHandler,userA,{query:{billing:"test-success"}});
    assert.equal(pro.data.active,false);assert.equal(pro.data.allowed,true);
    const scan=await call(scanHandler,userA,{method:"POST",body:{scan_type:"profile"}});
    assert.equal(scan.code,400,"FREE users pass scan authorization; this synthetic request stops at image validation");
    assert.equal(scan.data.error,"invalid_image","no OCR provider is called by the no-image fixture");
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
    await assert.rejects(deliver({...e,livemode:true}),{code:"STRIPE_LIVE_EVENT_REJECTED"});
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
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"PRO_SUBSCRIPTION_EXISTS"});
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
    fixture.failCheckoutOnce=true;await assert.rejects(createCheckoutForUser(user(userB)));
    const count=fixture.sessions.size;
    await fixture.pg.query("update warboost_checkout_attempts set lease_until=now()-interval '1 second' where user_id=$1",[userB]);
    await createCheckoutForUser(user(userB));assert.equal(fixture.sessions.size,count);
  });
  await test("Server-only journal is minimal, browser contains no Stripe secrets; exact raw-body required",async()=>{
    for(const file of ["app.js","index.html","sw.js","publisher-ui.js"])
      assert.doesNotMatch(fs.readFileSync(file,"utf8"),/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+/);
    const columns=(await fixture.pg.query("select column_name from information_schema.columns where table_name='warboost_billing_events'")).rows.map(x=>x.column_name);
    assert.ok(!columns.some(c=>/payload|email|card|address|secret/.test(c)));
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
  await test("LIVE remains blocked by default and cannot issue provider requests",async()=>{
    process.env.WARBOOST_COMMERCIAL_MODE="live";
    Object.assign(process.env,{STRIPE_LIVE_SECRET_KEY:"sk_live_fixture_only",STRIPE_LIVE_WEBHOOK_SECRET:"whsec_live_fixture_only",
      STRIPE_LIVE_PRICE_PRO_MONTHLY:LIVE_PRO_PRICE_ID,STRIPE_LIVE_PRODUCT_PRO:LIVE_PRO_PRODUCT_ID});
    const before=fixture.calls.length;
    assert.equal(commercialConfig().live_payments_enabled,false);
    await assert.rejects(createLiveCheckoutForUser(user(userFree),{consentVersion:LIVE_COMMERCIAL_CONSENT_VERSION}),
      {code:"LIVE_ACTIVATION_REQUIREMENTS_MISSING"});
    assert.equal(fixture.calls.length,before);
    process.env.WARBOOST_COMMERCIAL_MODE="test";process.env.STRIPE_LIVE_SECRET_KEY="";process.env.STRIPE_LIVE_WEBHOOK_SECRET="";
    process.env.STRIPE_LIVE_PRICE_PRO_MONTHLY="";process.env.STRIPE_LIVE_PRODUCT_PRO="";
  });
  await test("TEST and LIVE price IDs are isolated; invalid LIVE price fails before customer or consent writes",async()=>{
    assert.notEqual(TEST_PRO_PRICE_ID,LIVE_PRO_PRICE_ID);
    process.env.STRIPE_PRICE_PRO_MONTHLY=LIVE_PRO_PRICE_ID;
    await assert.rejects(createCheckoutForUser(user(userExistingLive)),{code:"STRIPE_TEST_LIVE_ID_MISMATCH"});
    process.env.STRIPE_PRICE_PRO_MONTHLY=TEST_PRO_PRICE_ID;
    fixture.enableLive();
    fixture.livePriceOverride={unit_amount:599};
    const before=fixture.calls.length;
    await assert.rejects(createLiveCheckoutForUser(user(userFree),{consentVersion:LIVE_COMMERCIAL_CONSENT_VERSION}),
      {code:"PRO_LIVE_PRICE_MISMATCH"});
    assert.equal(fixture.liveCustomers.size,0);assert.equal(fixture.liveSessions.size,0);
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_live_billing_consents")).rows[0].n,0);
    assert.equal(fixture.calls.slice(before).filter(x=>x.path==="/v1/customers").length,0);
    fixture.livePriceOverride={};
  });
  await test("Beta rights stay free and the authenticated first LIVE subscription uses Managed Payments",async()=>{
    await fixture.pg.query("update warboost_pro_grants set revoked_at=null where user_id=$1",[userBeta]);
    const providerCount=fixture.calls.filter(x=>x.host==="api.stripe.com").length;
    const betaResult=await call(proHandler,userBeta,{method:"POST",body:{action:"checkout",consent_version:LIVE_COMMERCIAL_CONSENT_VERSION}});
    assert.equal(betaResult.code,409);assert.equal(betaResult.data.error,"BETA_PRO_INCLUDED");
    assert.equal(fixture.calls.filter(x=>x.host==="api.stripe.com").length,providerCount);
    const response=await call(proHandler,userFree,{method:"POST",body:{action:"checkout",consent_version:LIVE_COMMERCIAL_CONSENT_VERSION}});
    assert.equal(response.code,200);assert.equal(response.data.live,true);
    const session=[...fixture.liveSessions.values()][0],params=session.params;
    assert.equal(params["mode"],"subscription");assert.equal(params["managed_payments[enabled]"],"true");
    assert.equal(params["line_items[0][price]"],LIVE_PRO_PRICE_ID);assert.equal(params["line_items[0][quantity]"],"1");
    assert.equal(params["billing_address_collection"],"required");
    for(const forbidden of ["automatic_tax[enabled]","adaptive_pricing[enabled]","customer_update[address]"])
      assert.equal(Object.hasOwn(params,forbidden),false);
    const liveCall=fixture.calls.findLast(x=>x.path==="/v1/checkout/sessions"&&x.opts.headers?.authorization==="Bearer sk_live_fixture_only");
    assert.equal(liveCall.opts.headers["Stripe-Version"],"2025-03-31.basil");
    assert.equal((await entitlementForUser(user(userFree))).active,false,"Checkout return/session alone must not grant PRO");
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_live_billing_consents where user_id=$1",[userFree])).rows[0].n,1);
  });
  await test("Existing Stripe LIVE customer is owner-checked and reused without another customer",async()=>{
    const customerId="cus_live_existing";
    fixture.liveCustomers.set(customerId,{id:customerId,object:"customer",livemode:true,metadata:{warboost_user_id:userExistingLive}});
    await fixture.pg.query("insert into warboost_live_billing_accounts(user_id,stripe_customer_id) values($1,$2)",[userExistingLive,customerId]);
    const before=fixture.liveCustomers.size;
    const result=await createLiveCheckoutForUser(user(userExistingLive),{consentVersion:LIVE_COMMERCIAL_CONSENT_VERSION});
    assert.equal(result.live,true);assert.equal(fixture.liveCustomers.size,before);
    const session=[...fixture.liveSessions.values()].find(x=>x.customer===customerId);
    assert.ok(session);assert.equal(session.customer,customerId);
    const wrong=await fixture.pg.query("select count(*)::int n from warboost_live_billing_consents where user_id=$1",[userExistingLive]);
    assert.equal(wrong.rows[0].n,1);
  });
  const liveCustomer=(await fixture.pg.query("select stripe_customer_id from warboost_live_billing_accounts where user_id=$1",[userFree])).rows[0].stripe_customer_id;
  let liveSubscription=fixture.liveSub(liveCustomer,"sub_live_free","active",{metadata:{user_id:userFree,warboost_checkout_model:"managed_payments"}});
  fixture.liveSubscriptions.set(liveSubscription.id,liveSubscription);
  let liveClock=Math.floor(Date.now()/1000)+100;
  await test("LIVE signature is required, browser return is inert, signed confirmed subscription grants PRO",async()=>{
    const e=fixture.liveEvent("checkout.session.completed",{object:"checkout.session",customer:liveCustomer,
      subscription:liveSubscription.id,client_reference_id:userFree},liveClock++);
    const [raw,sig]=fixture.signLive(e);
    await assert.rejects(processLiveWebhook(raw,sig.replace(/v1=.*/,"v1="+"0".repeat(64))),{code:"INVALID_WEBHOOK_SIGNATURE"});
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_live_subscriptions where user_id=$1",[userFree])).rows[0].n,0);
    process.env.WARBOOST_COMMERCIAL_MODE="test";
    await assert.rejects(processWebhook(raw,sig),{code:"INVALID_WEBHOOK_SIGNATURE"});
    process.env.WARBOOST_COMMERCIAL_MODE="live";
    const browser=await call(proHandler,userFree,{query:{billing:"live-success"}});
    assert.equal(browser.data.active,false);
    assert.equal((await deliverLive(e)).processed,true);
    const entitlement=await entitlementForUser(user(userFree));
    assert.equal(entitlement.tier,"PRO_PAID");assert.equal(entitlement.billing_live,true);assert.equal(entitlement.billing_test,false);
  });
  await test("Bad LIVE price never grants PRO; current signed status controls renewal, failure and cancellation",async()=>{
    const goodPrice=fixture.livePrice();
    liveSubscription={...liveSubscription,items:{data:[{quantity:1,price:{...goodPrice,id:"price_wrong"}}]}};
    fixture.liveSubscriptions.set(liveSubscription.id,liveSubscription);
    await deliverLive(fixture.liveEvent("customer.subscription.updated",liveSubscription,liveClock++));
    assert.equal((await entitlementForUser(user(userFree))).active,false);
    liveSubscription={...liveSubscription,items:{data:[{quantity:1,price:goodPrice}]}};
    fixture.liveSubscriptions.set(liveSubscription.id,liveSubscription);
    await deliverLive(fixture.liveEvent("invoice.paid",{object:"invoice",customer:liveCustomer,subscription:liveSubscription.id},liveClock++));
    assert.equal((await entitlementForUser(user(userFree))).active,true);
    liveSubscription={...liveSubscription,status:"past_due"};fixture.liveSubscriptions.set(liveSubscription.id,liveSubscription);
    await deliverLive(fixture.liveEvent("invoice.payment_failed",{object:"invoice",customer:liveCustomer,subscription:liveSubscription.id},liveClock++));
    assert.equal((await entitlementForUser(user(userFree))).active,false);
    liveSubscription={...liveSubscription,status:"active"};fixture.liveSubscriptions.set(liveSubscription.id,liveSubscription);
    await deliverLive(fixture.liveEvent("invoice.paid",{object:"invoice",customer:liveCustomer,subscription:liveSubscription.id},liveClock++));
    assert.equal((await entitlementForUser(user(userFree))).active,true);
    liveSubscription={...liveSubscription,status:"canceled"};fixture.liveSubscriptions.set(liveSubscription.id,liveSubscription);
    await deliverLive(fixture.liveEvent("customer.subscription.deleted",liveSubscription,liveClock++));
    assert.equal((await entitlementForUser(user(userFree))).active,false);
    await assert.rejects(createLiveCheckoutForUser(user(userFree),{consentVersion:"wrong"}),{code:"COMMERCIAL_CONSENT_REQUIRED"});
  });
  await test("LIVE portal uses the linked customer; duplicate webhook is idempotent and all network is fixture-only",async()=>{
    liveSubscription={...liveSubscription,status:"active"};fixture.liveSubscriptions.set(liveSubscription.id,liveSubscription);
    const portal=await createLivePortalForUser(user(userFree));assert.equal(portal.live,true);
    assert.equal(new URLSearchParams(fixture.calls.findLast(x=>x.path==="/v1/billing_portal/sessions"&&
      x.opts.headers?.authorization==="Bearer sk_live_fixture_only").opts.body).get("customer"),liveCustomer);
    const e=fixture.liveEvent("customer.subscription.updated",liveSubscription,liveClock++);
    assert.equal((await deliverLive(e)).processed,true);assert.equal((await deliverLive(e)).duplicate,true);
    assert.ok(fixture.calls.every(x=>["fixture.invalid","api.stripe.com"].includes(x.host)));
    assert.ok(fixture.calls.filter(x=>x.host==="api.stripe.com").every(x=>x.opts.headers?.authorization==="Bearer sk_test_fixture_only"||
      x.opts.headers?.authorization==="Bearer sk_live_fixture_only"));
  });
  process.env.WARBOOST_COMMERCIAL_MODE="test";
  console.log(`\nStripe TEST verification PASS: ${passed} scenarios. Provider transitions simulated; real cards/3DS remain manual.`);
}finally{await fixture.close()}
async function callPortal(id){return call(proHandler,id,{method:"POST",body:{action:"portal"}})}