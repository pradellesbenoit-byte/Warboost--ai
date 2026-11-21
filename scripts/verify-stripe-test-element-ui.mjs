import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createAndMountStripeTestElement,normalizeStripeSetupDiagnostic
} from "../lib/stripe-test-element-ui.js";
import {createStripeTestPaymentConfirmation} from "../lib/stripe-test-payment-confirmation.js";
import {translator} from "../i18n.js";

let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log(`STRIPE ELEMENT UI ✓ ${name}`)};
const host={id:"payment-element-fixture"};
function stripeMock({ready=true,mountError=false,loadError=false,createError=false}={}){
  const handlers={};
  const element={
    on(name,handler){handlers[name]=handler},
    mount(target){
      if(target!==host)throw Error("wrong mount target");
      if(mountError)throw Error("raw mount failure fixture");
      if(loadError)queueMicrotask(()=>handlers.loaderror?.());
      else if(ready)queueMicrotask(()=>handlers.ready?.());
    }
  };
  const stripe=()=>({
    elements(options){
      assert.equal(options.clientSecret,"seti_fixture_secret_private");
      return {create(type,opts){
        assert.equal(type,"payment");assert.equal(opts.layout,"tabs");
        if(createError)throw Error("raw Stripe.js create failure fixture");
        return element;
      }};
    }
  });
  return {stripe,element};
}
async function expectSafeFailure(name,operation,stage,code){
  await check(name,async()=>{
    await assert.rejects(operation,error=>{
      assert.equal(error.diagnosticStage,stage);assert.equal(error.diagnosticCode,code);
      assert.doesNotMatch(error.message,/raw|secret_private|sk_test/i);
      return true;
    });
  });
}

await check("success appears only after the mounted Element emits ready",async()=>{
  const order=[];
  const mock=stripeMock();
  const result=await createAndMountStripeTestElement({
    loadStripe:async()=>mock.stripe,publishableKey:"pk_test_fixture",clientSecret:"seti_fixture_secret_private",
    locale:"fr",host,onStage:stage=>order.push(stage),onReady:()=>order.push("ready")
  });
  assert.deepEqual(order,["stripe_js","elements_create","elements_mount","ready"]);
  assert.equal(result.element,mock.element);assert.equal(result.diagnostic.code,"ELEMENT_READY");
});

await expectSafeFailure("missing Stripe.js returns a safe stage code",()=>createAndMountStripeTestElement({
  loadStripe:async()=>{throw Error("secret_private raw loader detail")}
}),"stripe_js","STRIPE_JS_UNAVAILABLE");

await expectSafeFailure("Payment Element creation failure is reported without provider detail",()=>createAndMountStripeTestElement({
  loadStripe:async()=>stripeMock({createError:true}).stripe,publishableKey:"pk_test_fixture",
  clientSecret:"seti_fixture_secret_private",host
}),"elements_create","STRIPE_ELEMENTS_CREATE_FAILED");

await expectSafeFailure("mount exception is distinguished from Stripe.js creation",()=>createAndMountStripeTestElement({
  loadStripe:async()=>stripeMock({mountError:true}).stripe,publishableKey:"pk_test_fixture",
  clientSecret:"seti_fixture_secret_private",host
}),"elements_mount","ELEMENT_MOUNT_FAILED");

await expectSafeFailure("Stripe Element loaderror is surfaced safely",()=>createAndMountStripeTestElement({
  loadStripe:async()=>stripeMock({loadError:true}).stripe,publishableKey:"pk_test_fixture",
  clientSecret:"seti_fixture_secret_private",host
}),"elements_mount","STRIPE_ELEMENTS_LOAD_FAILED");

await expectSafeFailure("missing ready event times out without claiming success",()=>createAndMountStripeTestElement({
  loadStripe:async()=>stripeMock({ready:false}).stripe,publishableKey:"pk_test_fixture",
  clientSecret:"seti_fixture_secret_private",host,timeoutMs:10
}),"elements_mount","ELEMENT_READY_TIMEOUT");

await check("diagnostic normalization drops secret-like fields and bounds values",async()=>{
  assert.deepEqual(normalizeStripeSetupDiagnostic({
    stage:"customer",http_status:502,code:"PAYMENT_PROVIDER_ERROR",elapsed_ms:999999,client_secret:"secret_should_not_escape",
    token:"private"
  }),{stage:"customer",http_status:502,code:"PAYMENT_PROVIDER_ERROR",elapsed_ms:120000});
  assert.deepEqual(normalizeStripeSetupDiagnostic({
    stage:"../../private",http_status:700,code:"sk_test_fixture",elapsed_ms:-1,raw:"private"
  }),{stage:"request",http_status:null,code:"SETUP_FAILED",elapsed_ms:0});
});

await check("application uses ready-gated UI and retains server-side TEST safeguards",async()=>{
  const app=fs.readFileSync("app.js","utf8"),api=fs.readFileSync("api/pro.js","utf8");
  const flow=fs.readFileSync("lib/stripe-test-payment-flow.js","utf8");
  const markup=fs.readFileSync("index.html","utf8"),i18n=fs.readFileSync("i18n.js","utf8");
  const confirmHandler=app.match(/async function confirmProTestPayment\(\)\s*\{([\s\S]*?)\n\}/)?.[1]||"";
  assert.match(app,/createAndMountStripeTestElement/);
  assert.match(app,/setupBtn\.disabled=true/);
  assert.match(app,/setupBtn\.disabled=false;setupBtn\.classList\.remove\("hidden"\)/);
  assert.match(app,/safeProTestSetupDiagnostic/);
  assert.match(api,/const user=await requireUser\(req\);requestAuthenticated=true;\s*const beta=await betaAccessForUserAsync\(user\)/);
  assert.match(api,/commerce\.mode!=="test"\|\|!commerce\.test_payments_enabled/);
  assert.match(api,/confirm_test_only!==true\|\|body\?\.test_subscription_consent!==true/);
  assert.match(flow,/assertBillingCountryAllowed\(country,"test"\)/);
  assert.match(flow,/assertTestTaxCountryReady\(country\)/);
  assert.match(app,/proTestPaymentConfirmation\.run\(proTestPaymentConfirmationInput\(\)\)/);
  assert.match(app,/syncProTestPaymentConfirmButton\(\)/);
  assert.match(app,/pro_test_payment_timeout/);
  assert.match(confirmHandler,/proTestPaymentConfirmation\.run/);
  assert.doesNotMatch(confirmHandler,/if\(!proTestStripe\|\|!proTestPaymentSecret\|\|!proTestPaymentMethodId\)return/);
  assert.match(app,/proState\.active\?"pro_test_payment_entitlement_confirmed":"pro_test_payment_pending_webhook"/);
  assert.match(markup,/<div id="proTestFlowStatus"[^>]*aria-live="polite"[^>]*role="status"/);
  for(const key of ["pro_test_payment_confirming","pro_test_payment_timeout","pro_test_payment_uncertain",
    "pro_test_payment_stripe_unavailable","pro_test_verify_payment_state"])
    assert.match(i18n,new RegExp(`${key}:`));
  assert.doesNotMatch(app,/console\.(?:log|error)\([^)]*(?:clientSecret|setup_client_secret|secretKey)/i);
});

await check("TEST commercial preview note is localized and retains the tax and renewal disclosures",async()=>{
  const app=fs.readFileSync("app.js","utf8");
  const fr=translator("fr")("pro_test_preview_note");
  const en=translator("en")("pro_test_preview_note");
  const de=translator("de")("pro_test_preview_note");
  assert.match(app,/proState\.mode==="test"\?t\("pro_test_preview_note"\)/);
  assert.notEqual(fr,en);
  assert.equal(de,en,"languages without a dedicated copy fall back to English instead of French");
  assert.match(fr,/Stripe TEST/);
  assert.match(fr,/4,99/);
  assert.match(fr,/renouvellement automatique/);
  assert.match(fr,/résiliation à l’échéance via le portail client/);
  assert.match(fr,/TVA, factures et CGV/);
  assert.match(en,/Stripe TEST/);
  assert.match(en,/automatic renewal/);
  assert.match(en,/VAT, invoices and Terms/);
});

const paymentInput=(overrides={})=>({
  ownerId:"user-fixture",currentUserId:"user-fixture",paymentIntentId:"pi_fixture_123",
  clientSecret:"pi_fixture_123_secret_test",paymentMethodId:"pm_fixture_123",stripeAvailable:true,
  prepareStripe:async()=>{},confirm:async mark=>{mark();return {paymentIntent:{status:"succeeded"}}},
  ...overrides
});
await check("confirmation rejects missing or mismatched client state visibly without Stripe calls",async()=>{
  const states=[];let calls=0;
  const controller=createStripeTestPaymentConfirmation({onState:state=>states.push(state)});
  const result=await controller.run(paymentInput({
    clientSecret:"",confirm:async()=>{calls++}
  }));
  assert.equal(result.state,"missing_state");assert.equal(result.reason,"payment_intent");
  assert.deepEqual(states,["missing_state"]);assert.equal(calls,0);
  assert.equal(controller.canConfirm(paymentInput({ownerId:"other-user"})),false);
});

await check("confirm status appears before Stripe call and duplicate clicks share one request",async()=>{
  const states=[];let resolvePayment,callCount=0;
  const controller=createStripeTestPaymentConfirmation({onState:state=>states.push(state)});
  const input=paymentInput({confirm:async mark=>{
    callCount++;mark();states.push("stripe_request");
    return await new Promise(resolve=>{resolvePayment=resolve});
  }});
  const first=controller.run(input);
  assert.equal(states[0],"preparing_stripe");
  await Promise.resolve();
  assert.ok(states.indexOf("confirming")<states.indexOf("stripe_request"));
  const second=await controller.run(input);
  assert.equal(second.state,"already_in_progress");assert.equal(callCount,1);
  resolvePayment({paymentIntent:{status:"succeeded"}});
  assert.equal((await first).state,"succeeded");
  assert.equal(controller.snapshot().confirmed,true);
  assert.equal((await controller.run(input)).state,"already_confirmed");
  assert.equal(callCount,1);
});

await check("timeout keeps confirmation locked and does not automatically retry",async()=>{
  const states=[];let timeoutCallback,resolvePayment,callCount=0;
  const controller=createStripeTestPaymentConfirmation({
    timeoutMs:5,onState:state=>states.push(state),
    schedule:callback=>{timeoutCallback=callback;return 1},cancel:()=>{}
  });
  const input=paymentInput({confirm:async mark=>{
    callCount++;mark();
    return await new Promise(resolve=>{resolvePayment=resolve});
  }});
  const first=controller.run(input);await Promise.resolve();timeoutCallback();
  assert.ok(states.includes("timeout"));assert.equal(controller.snapshot().pending,true);
  assert.equal((await controller.run(input)).state,"already_in_progress");assert.equal(callCount,1);
  resolvePayment({paymentIntent:{status:"processing"}});
  assert.equal((await first).state,"outcome_unknown");assert.equal(controller.snapshot().uncertain,true);
  assert.equal((await controller.run(input)).state,"outcome_unknown");assert.equal(callCount,1);
});

await check("Stripe.js initialization failure is recoverable before any confirmation request",async()=>{
  const states=[];let fail=true,confirmCalls=0;
  const controller=createStripeTestPaymentConfirmation({onState:state=>states.push(state)});
  const input=paymentInput({
    prepareStripe:async()=>{if(fail)throw Error("private loader detail")},
    confirm:async mark=>{confirmCalls++;mark();return {paymentIntent:{status:"succeeded"}}}
  });
  assert.equal((await controller.run(input)).state,"stripe_unavailable");
  assert.equal(confirmCalls,0);
  fail=false;
  assert.equal((await controller.run(input)).state,"succeeded");
  assert.equal(confirmCalls,1);
  assert.ok(states.includes("stripe_unavailable"));
});

await check("only explicit same-intent retry is possible for known retryable Stripe status",async()=>{
  const states=[];let calls=0;const seen=[];
  const controller=createStripeTestPaymentConfirmation({onState:state=>states.push(state)});
  const input=paymentInput({confirm:async mark=>{
    calls++;seen.push(["pi_fixture_123","pm_fixture_123"]);mark();
    return calls===1?{error:{payment_intent:{status:"requires_payment_method"}}}:
      {paymentIntent:{status:"succeeded"}};
  }});
  assert.equal((await controller.run(input)).state,"retryable_error");
  assert.equal(controller.snapshot().uncertain,false);
  assert.equal((await controller.run(input)).state,"succeeded");
  assert.equal(calls,2);assert.deepEqual(seen,[["pi_fixture_123","pm_fixture_123"],["pi_fixture_123","pm_fixture_123"]]);
});

await check("unknown Stripe outcome requires server-verified preparation before another confirm",async()=>{
  let calls=0;const controller=createStripeTestPaymentConfirmation();
  const input=paymentInput({confirm:async mark=>{calls++;mark();throw Error("private transport detail")}});
  assert.equal((await controller.run(input)).state,"outcome_unknown");
  assert.equal((await controller.run(input)).state,"outcome_unknown");assert.equal(calls,1);
  assert.equal(controller.acceptVerifiedPreparation(),true);
  assert.equal((await controller.run(paymentInput())).state,"succeeded");assert.equal(calls,1);
});

console.log(`Stripe TEST Element/confirmation targeted cases passed: ${passed}`);
