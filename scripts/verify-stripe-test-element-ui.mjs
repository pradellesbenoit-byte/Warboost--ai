import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createAndMountStripeTestElement,normalizeStripeSetupDiagnostic
} from "../lib/stripe-test-element-ui.js";

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
  assert.match(app,/createAndMountStripeTestElement/);
  assert.match(app,/setupBtn\.disabled=true/);
  assert.match(app,/setupBtn\.disabled=false;setupBtn\.classList\.remove\("hidden"\)/);
  assert.match(app,/safeProTestSetupDiagnostic/);
  assert.match(api,/const user=await requireUser\(req\),beta=await betaAccessForUserAsync\(user\)/);
  assert.match(api,/commerce\.mode!=="test"\|\|!commerce\.test_payments_enabled/);
  assert.match(api,/confirm_test_only!==true\|\|body\?\.test_subscription_consent!==true/);
  assert.match(flow,/assertBillingCountryAllowed\(country,"test"\)/);
  assert.match(flow,/assertTestTaxCountryReady\(country\)/);
  assert.doesNotMatch(app,/console\.(?:log|error)\([^)]*(?:clientSecret|setup_client_secret|secretKey)/i);
});

console.log(`Stripe TEST Element UI targeted cases passed: ${passed}`);
