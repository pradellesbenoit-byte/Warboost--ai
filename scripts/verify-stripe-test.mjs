import assert from "node:assert/strict";
import fs from "node:fs";
import {billingFixture,userA,userB,userBeta,userFree,userLegacy,userLive} from "./billing-test-fixture.mjs";
import {commercialConfig,COMMERCIAL_CONSENT_VERSION,createCheckoutForUser,createPortalForUser,processWebhook,verifyWebhookSignature,subscriptionActive,readRawBody} from "../lib/commercial-pro.js";
import {providerRequest} from "../lib/stripe-test.js";
import {entitlementForUser,requireProductUser} from "../lib/pro-access.js";
import proHandler from "../api/pro.js";
import stateHandler from "../api/state.js";
import scanHandler from "../api/scan.js";
import adviceHandler from "../api/advice.js";
const fixture=await billingFixture();
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log(`BILLING ✓ ${name}`)};
const user=id=>({id,email:id===userBeta?"beta@example.test":id===userA?"a@example.test":id===userB?"b@example.test":id===userLegacy?"legacy@example.test":id===userLive?"live@example.test":"free@example.test"});
const deliver=e=>processWebhook(...fixture.sign(e));
const deliverLive=e=>processWebhook(...fixture.signLive(e),"live");
async function call(handler,id,{method="GET",query={},body=null,parsedBody=false}={}){
  let result;
  const req={method,query,headers:{authorization:`Bearer ${id}`,"x-warboost-beta-consent":"2026-09-05-safe-launch-v2"},body:body||{}};
  if(!parsedBody)req.rawBody=Buffer.from(body?JSON.stringify(body):"");
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
    const legacy=(await fixture.pg.query("select stripe_customer_id,stripe_subscription_id,stripe_price_id,plan,status from warboost_subscriptions where user_id=$1",[userLegacy])).rows[0];
    assert.deepEqual(legacy,{stripe_customer_id:"cus_legacy_fixture",stripe_subscription_id:"sub_legacy_fixture",stripe_price_id:"price_legacy_fixture",plan:"pro",status:"active"});
    const live=(await fixture.pg.query(`select has_function_privilege('authenticated','public.warboost_live_claim_checkout(uuid)','EXECUTE') rpc,
      has_table_privilege('authenticated','public.warboost_live_subscriptions','INSERT') writes`)).rows[0];
    assert.deepEqual(live,{rpc:false,writes:false});
  });
  await test("OFF and mismatched TEST/LIVE credentials cannot create provider requests",async()=>{
    const n=fixture.calls.filter(x=>x.host==="api.stripe.com").length;
    process.env.WARBOOST_COMMERCIAL_MODE="off";
    assert.equal(commercialConfig().payments_enabled,false);
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"SAFE_LAUNCH_PAYMENT_DISABLED"});
    process.env.WARBOOST_COMMERCIAL_MODE="live";
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"STRIPE_LIVE_KEY_REQUIRED"});
    process.env.WARBOOST_COMMERCIAL_MODE="test";process.env.STRIPE_SECRET_KEY="sk_live_fixturenotreal";
    await assert.rejects(createCheckoutForUser(user(userA)),{code:"STRIPE_TEST_KEY_REQUIRED"});
    fixture.enableLive();process.env.STRIPE_LIVE_SECRET_KEY="sk_test_fixtureonly";
    await assert.rejects(createCheckoutForUser(user(userLive),{consentVersion:COMMERCIAL_CONSENT_VERSION}),{code:"STRIPE_LIVE_KEY_REQUIRED"});
    assert.equal(fixture.calls.filter(x=>x.host==="api.stripe.com").length,n);fixture.enableTest();
  });
  await test("Stripe subscription lists allow omitted root livemode but enforce child and present root modes",async()=>{
    const customer="cus_test_list_mode",id="sub_test_list_mode";
    fixture.providerLive=false;
    fixture.subscriptions.set(id,{id,object:"subscription",livemode:false,customer});
    try{
      const list=await providerRequest(`subscriptions?customer=${customer}`,{mode:"test"});
      assert.equal(list.object,"list");assert.equal(Object.hasOwn(list,"livemode"),false);
      assert.equal(list.data.length,1);assert.equal(list.data[0].livemode,false);
      fixture.subscriptions.set(id,{...fixture.subscriptions.get(id),livemode:true});
      await assert.rejects(providerRequest(`subscriptions?customer=${customer}`,{mode:"test"}),{code:"STRIPE_TEST_OBJECT_REQUIRED"});
      fixture.subscriptions.set(id,{...fixture.subscriptions.get(id),livemode:false});
      fixture.providerLive=true;
      await assert.rejects(providerRequest(`subscriptions?customer=${customer}`,{mode:"test"}),{code:"STRIPE_TEST_OBJECT_REQUIRED"});
    }finally{
      fixture.providerLive=false;fixture.subscriptions.delete(id);
    }
  });
  await test("LIVE checkout requires consent and verifies the exact 499 EUR inclusive monthly price",async()=>{
    fixture.enableLive();const before=fixture.calls.filter(x=>x.host==="api.stripe.com").length;
    await assert.rejects(createCheckoutForUser(user(userLive)),{code:"COMMERCIAL_CONSENT_REQUIRED"});
    assert.equal(fixture.calls.filter(x=>x.host==="api.stripe.com").length,before);
    fixture.livePriceOverride={unit_amount:599};
    await assert.rejects(createCheckoutForUser(user(userLive),{consentVersion:COMMERCIAL_CONSENT_VERSION}),{code:"PRO_PRICE_MISMATCH"});
    fixture.livePriceOverride={};
    const checkout=await createCheckoutForUser(user(userLive),{consentVersion:COMMERCIAL_CONSENT_VERSION});
    assert.equal(checkout.live,true);assert.deepEqual(checkout.plan,{id:"warboost-pro-monthly",amount:499,currency:"eur",interval:"month",price_label:"4,99 € / mois"});
    assert.equal(fixture.liveSessions.size,1);
    const sessionCall=fixture.calls.findLast(x=>x.host==="api.stripe.com"&&x.path==="/v1/checkout/sessions"&&x.opts.headers.authorization==="Bearer sk_live_fixtureonly");
    const params=new URLSearchParams(sessionCall.opts.body);
    assert.equal(params.get("line_items[0][price]"),"price_prolivefixture");
    assert.equal(params.get("line_items[0][quantity]"),"1");assert.equal(params.get("billing_address_collection"),"required");
    assert.equal(params.get("automatic_tax[enabled]"),"true");
    assert.equal(params.get("success_url"),"https://warboost.fr/?billing=live-success");
    assert.equal(params.get("cancel_url"),"https://warboost.fr/?billing=live-cancel");
    assert.equal(params.has("subscription_data[trial_period_days]"),false);
    const consent=(await fixture.pg.query("select consent_version,stripe_price_id,terms_url,privacy_url from warboost_billing_consents where user_id=$1",[userLive])).rows[0];
    assert.deepEqual(consent,{consent_version:COMMERCIAL_CONSENT_VERSION,stripe_price_id:"price_prolivefixture",
      terms_url:"https://warboost.fr/legal.html",privacy_url:"https://warboost.fr/privacy.html"});
    fixture.enableTest();
  });
  await test("An active legacy subscription blocks LIVE checkout without changing legacy data",async()=>{
    fixture.enableLive();const before=(await fixture.pg.query("select * from warboost_subscriptions where user_id=$1",[userLegacy])).rows[0];
    await assert.rejects(createCheckoutForUser(user(userLegacy),{consentVersion:COMMERCIAL_CONSENT_VERSION}),{code:"LEGACY_SUBSCRIPTION_REVIEW_REQUIRED"});
    const after=(await fixture.pg.query("select * from warboost_subscriptions where user_id=$1",[userLegacy])).rows[0];
    assert.deepEqual(after,before);assert.equal(fixture.liveSessions.size,1);fixture.enableTest();
  });
  await test("LIVE PRO is granted only by a valid webhook, not the browser success return",async()=>{
    fixture.enableLive();assert.equal((await entitlementForUser(user(userLive))).active,false);
    const returned=await call(proHandler,userLive,{query:{billing:"live-success"}});assert.equal(returned.data.active,false);
    const account=(await fixture.pg.query("select stripe_customer_id from warboost_live_billing_accounts where user_id=$1",[userLive])).rows[0];
    const sub=fixture.liveSub(account.stripe_customer_id,"sub_live_fixture","active");sub.metadata={user_id:userLive};fixture.liveSubscriptions.set(sub.id,sub);
    const event=fixture.liveEvent("checkout.session.completed",{object:"checkout.session",customer:account.stripe_customer_id,
      subscription:sub.id,client_reference_id:userLive});
    assert.equal((await deliverLive(event)).processed,true);
    const ent=await entitlementForUser(user(userLive));assert.equal(ent.active,true);assert.equal(ent.billing_live,true);assert.equal(ent.billing_test,false);
    assert.equal((await call(proHandler,userLive)).data.active,true);
    fixture.enableTest();
  });
  await test("LIVE portal is account-bound; bad signatures and duplicate webhooks are rejected safely",async()=>{
    fixture.enableLive();
    const portal=await createPortalForUser(user(userLive));assert.equal(portal.live,true);
    const portalCall=fixture.calls.findLast(x=>x.host==="api.stripe.com"&&x.path==="/v1/billing_portal/sessions"&&x.opts.headers.authorization==="Bearer sk_live_fixtureonly");
    const customer=(await fixture.pg.query("select stripe_customer_id from warboost_live_billing_accounts where user_id=$1",[userLive])).rows[0].stripe_customer_id;
    assert.equal(new URLSearchParams(portalCall.opts.body).get("customer"),customer);
    await assert.rejects(createPortalForUser(user(userB)),{code:"BILLING_CUSTOMER_MISSING"});
    const sub=fixture.liveSubscriptions.get("sub_live_fixture"),event=fixture.liveEvent("customer.subscription.updated",sub);
    const [raw,sig]=fixture.signLive(event);
    assert.equal(verifyWebhookSignature(raw,sig,Date.now(),"live"),true);
    await assert.rejects(processWebhook(raw,sig.replace(/v1=.*/,"v1="+"0".repeat(64)),"live"),{code:"INVALID_WEBHOOK_SIGNATURE"});
    const [testRaw,testSig]=fixture.signLive({...event,livemode:false});
    await assert.rejects(processWebhook(testRaw,testSig,"live"),{code:"STRIPE_TEST_EVENT_REJECTED"});
    assert.equal((await deliverLive(event)).processed,true);assert.equal((await deliverLive(event)).duplicate,true);
    fixture.enableTest();
  });
  await test("LIVE failed payment and cancellation revoke access; stale events cannot restore it",async()=>{
    fixture.enableLive();const sub=fixture.liveSubscriptions.get("sub_live_fixture"),customer=sub.customer;
    sub.status="past_due";fixture.liveSubscriptions.set(sub.id,sub);
    assert.equal((await deliverLive(fixture.liveEvent("invoice.payment_failed",{object:"invoice",customer,subscription:sub.id}))).processed,true);
    assert.equal((await entitlementForUser(user(userLive))).active,false);
    sub.status="canceled";fixture.liveSubscriptions.set(sub.id,sub);
    const canceled=fixture.liveEvent("customer.subscription.deleted",{...sub},Math.floor(Date.now()/1000)+20);
    await deliverLive(canceled);
    const stale=fixture.liveEvent("customer.subscription.updated",{...sub,status:"active"},canceled.created-1);
    await deliverLive(stale);
    assert.equal((await entitlementForUser(user(userLive))).active,false);
    assert.equal((await entitlementForUser(user(userBeta))).tier,"BETA_FREE");fixture.enableTest();
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
    const params=new URLSearchParams(fixture.calls.find(x=>x.host==="api.stripe.com"&&x.path==="/v1/checkout/sessions"&&x.opts.headers.authorization==="Bearer sk_test_fixtureonly").opts.body);
    assert.equal(params.get("line_items[0][price]"),"price_protest");assert.equal(params.get("line_items[0][quantity]"),"1");
    assert.equal(params.get("success_url"),"https://beta.warboost.fr/?billing=test-success");
    assert.equal(params.get("cancel_url"),"https://beta.warboost.fr/?billing=test-cancel");
  });
  const customerA=(await fixture.pg.query("select stripe_customer_id from warboost_billing_accounts where user_id=$1",[userA])).rows[0].stripe_customer_id;
  let subscription=fixture.sub(customerA);subscription.metadata={user_id:userA};fixture.subscriptions.set(subscription.id,subscription);
  await test("Success browser return alone stays FREE; PRO advice blocked and invalid scans do not spend quota",async()=>{
    assert.equal((await entitlementForUser(user(userA))).active,false);
    const pro=await call(proHandler,userA,{query:{billing:"test-success"}});
    assert.equal(pro.data.active,false);assert.equal(pro.data.allowed,true);
    const advice=await call(adviceHandler,userA,{method:"POST",body:{}});assert.equal(advice.code,403);assert.equal(advice.data.code||advice.data.error,"PRO_REQUIRED");
    const scan=await call(scanHandler,userA,{method:"POST",body:{}});assert.equal(scan.code,400);assert.equal(scan.data.error,"invalid_image");
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
    const parsedCheckout=await call(proHandler,userBeta,{method:"POST",body:{action:"checkout"},parsedBody:true});
    assert.equal(parsedCheckout.code,409);assert.equal(parsedCheckout.data.error,"BETA_PRO_INCLUDED");
    const original=Buffer.from('{"id":"evt_original_bytes","type":"checkout.session.completed"}');
    let bodyGetterRead=false;
    const rawRequest={async *[Symbol.asyncIterator](){yield original.subarray(0,11);yield original.subarray(11)},
      get body(){bodyGetterRead=true;throw new Error("req.body getter accessed before raw stream")}};
    assert.equal(await readRawBody(rawRequest),original.toString("utf8"));
    assert.equal(bodyGetterRead,false);
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