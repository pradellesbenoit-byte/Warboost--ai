import assert from "node:assert/strict";
import fs from "node:fs";
import {billingFixture,userA,userB,userBeta,userFree} from "./billing-test-fixture.mjs";
import {commercialConfig,createCheckoutForUser,createPortalForUser,processWebhook,verifyWebhookSignature,subscriptionActive,readRawBody} from "../lib/commercial-pro.js";
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
async function call(handler,id,{method="GET",query={},body=null}={}){
  let result;
  const req={method,query,headers:{authorization:`Bearer ${id}`,"x-warboost-beta-consent":"2026-09-05-safe-launch-v2"},body:body||{},rawBody:Buffer.from(body?JSON.stringify(body):"")};
  const res={setHeader(){},status(n){this.code=n;return this},json(data){result={code:this.code||200,data};return this}};
  await handler(req,res);return result;
}
try{
  await test("Migrations execute and re-run on isolated PostgreSQL; tables/RPCs are not client-writable",async()=>{
    for(const p of fixture.migrations)await fixture.pg.exec(fs.readFileSync(p,"utf8"));
    assert.equal((await fixture.pg.query("select count(*)::int n from warboost_pro_grants")).rows[0].n,1);
    for(const role of ["anon","authenticated"]){
      const row=(await fixture.pg.query(`select has_function_privilege('${role}','public.warboost_claim_checkout(uuid)','EXECUTE') rpc,
        has_table_privilege('${role}','public.warboost_pro_grants','INSERT') writes`)).rows[0];
      assert.equal(row.rpc,false);assert.equal(row.writes,false);
    }
  });
  await test("LIVE mode and live keys cannot initiate a provider request",async()=>{
    const n=fixture.calls.length;process.env.WARBOOST_COMMERCIAL_MODE="live";
    assert.equal(commercialConfig().payments_enabled,false);
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"SAFE_LAUNCH_PAYMENT_DISABLED"});
    process.env.WARBOOST_COMMERCIAL_MODE="test";process.env.STRIPE_SECRET_KEY="sk_live_fixture_not_real";
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"STRIPE_TEST_KEY_REQUIRED"});
    assert.equal(fixture.calls.length,n);process.env.STRIPE_SECRET_KEY="sk_test_fixture_only";
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
    assert.equal(params.get("line_items[0][price]"),"price_pro_test");assert.equal(params.get("line_items[0][quantity]"),"1");
    assert.equal(params.get("success_url"),"https://beta.warboost.fr/?billing=test-success");
    assert.equal(params.get("cancel_url"),"https://beta.warboost.fr/?billing=test-cancel");
  });
  const customerA=(await fixture.pg.query("select stripe_customer_id from warboost_billing_accounts where user_id=$1",[userA])).rows[0].stripe_customer_id;
  let subscription=fixture.sub(customerA);subscription.metadata={user_id:userA};fixture.subscriptions.set(subscription.id,subscription);
  await test("Success browser return alone stays FREE; FREE blocked by BOTH scan and advice APIs",async()=>{
    assert.equal((await entitlementForUser(user(userA))).active,false);
    const pro=await call(proHandler,userA,{query:{billing:"test-success"}});
    assert.equal(pro.data.active,false);assert.equal(pro.data.allowed,true);
    for(const handler of [scanHandler,adviceHandler]){
      const r=await call(handler,userA,{method:"POST",body:{}});assert.equal(r.code,403);assert.equal(r.data.code||r.data.error,"PRO_REQUIRED");
    }
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
  console.log(`\nStripe TEST verification PASS: ${passed} scenarios. Provider transitions simulated; real cards/3DS remain manual.`);
}finally{await fixture.close()}
async function callPortal(id){return call(proHandler,id,{method:"POST",body:{action:"portal"}})}