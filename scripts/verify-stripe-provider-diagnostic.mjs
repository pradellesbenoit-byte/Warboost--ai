import assert from "node:assert/strict";
import fs from "node:fs";
import {
  stripeProviderDiagnostic,stripeProviderFailurePayload,stripeProviderStep,
  sanitizeStripeProviderDiagnostic
} from "../lib/stripe-provider-diagnostic.js";
import {providerRequestForMode} from "../lib/stripe-test.js";

let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log(`STRIPE PROVIDER DIAGNOSTIC ✓ ${name}`)};
const originalFetch=globalThis.fetch;
const originalEnv={...process.env};
const fixtureKey="sk_test_diagnostic_fixture";
for(const [key,value] of Object.entries({
  WARBOOST_COMMERCIAL_MODE:"test",WARBOOST_APP_URL:"https://checkout-test.warboost.fr",
  STRIPE_SECRET_KEY:fixtureKey,STRIPE_PRICE_PRO_MONTHLY:"price_fixture",
  STRIPE_PRODUCT_PRO:"prod_fixture",STRIPE_WEBHOOK_SECRET:"whsec_fixture",
  SUPABASE_URL:"https://warboost-test-fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:"service_role_fixture_only"
}))process.env[key]=value;
delete process.env.VERCEL_ENV;
delete process.env.VERCEL_GIT_COMMIT_REF;

try{
  const cases=[
    ["setup_intent","setup_intents/seti_private_fixture","GET",{}],
    ["payment_method","payment_methods/pm_private_fixture","GET",{}],
    ["price","prices/price_private_fixture","GET",{}],
    ["customer","customers/cus_private_fixture","GET",{}],
    ["subscription","subscriptions?customer=cus_private_fixture","GET",{}],
    ["invoice_tax","subscriptions","POST",{"automatic_tax[enabled]":"true"}],
    ["invoice_tax","invoices/in_private_fixture","GET",{}]
  ];
  for(const [step,path,method,params] of cases)
    await check(`request is classified as ${step} without exposing its path`,()=>{
      assert.equal(stripeProviderStep(path,method,params),step);
    });

  await check("recognized Stripe error fields are retained while provider payload is discarded",()=>{
    const diag=stripeProviderDiagnostic({
      step:"invoice_tax",status:400,type:"invalid_request_error",code:"tax_calculation_failed",
      requestId:"req_Abcdef123456"
    });
    assert.deepEqual(diag,{
      stage:"invoice_tax",source:"stripe_response",stripe_http_status:400,
      stripe_error_type:"invalid_request_error",stripe_error_code:"tax_calculation_failed",
      stripe_request_id:"req_Abcdef123456"
    });
  });

  await check("unknown Stripe codes, types, malformed status and request ids are masked",()=>{
    const diag=stripeProviderDiagnostic({
      step:"setup_intent",status:999,type:"private_secret_type",code:"cus_private_123",
      requestId:"sk_test_never_return_this"
    });
    assert.equal(diag.stripe_http_status,null);
    assert.equal(diag.stripe_error_type,"unknown");
    assert.equal(diag.stripe_error_code,"unknown");
    assert.equal(diag.stripe_request_id,null);
    assert.doesNotMatch(JSON.stringify(diag),/private_secret|cus_private|sk_test/);
  });

  await check("sanitizer drops every unapproved field and rejects unknown stages",()=>{
    const clean=sanitizeStripeProviderDiagnostic({
      ...stripeProviderDiagnostic({step:"payment_method",status:402,type:"card_error",code:"card_declined"}),
      message:"PII",client_secret:"secret_fixture",customer:"cus_private"
    });
    assert.equal(clean.stage,"payment_method");
    assert.equal("message" in clean,false);
    assert.equal("client_secret" in clean,false);
    assert.equal("customer" in clean,false);
    assert.equal(sanitizeStripeProviderDiagnostic({stage:"private_id",source:"stripe_response"}),null);
  });

  await check("diagnostic payload is restricted to authenticated TEST subscription preparation",()=>{
    const error={safeStripeDiagnostic:stripeProviderDiagnostic({
      step:"subscription",status:400,type:"invalid_request_error",code:"parameter_missing"
    })};
    assert.ok(stripeProviderFailurePayload(error,{mode:"test",action:"prepare_test_subscription",authenticated:true}));
    assert.equal(stripeProviderFailurePayload(error,{mode:"live",action:"prepare_test_subscription",authenticated:true}),null);
    assert.equal(stripeProviderFailurePayload(error,{mode:"test",action:"test_setup_intent",authenticated:true}),null);
    assert.equal(stripeProviderFailurePayload(error,{mode:"test",action:"prepare_test_subscription",authenticated:false}),null);
    assert.equal(stripeProviderFailurePayload({message:"customer@example.test"},{mode:"test",action:"prepare_test_subscription",authenticated:true}),null);
  });

  await check("API keeps authentication before payment actions and gates diagnostic response to TEST",()=>{
    const api=fs.readFileSync("api/pro.js","utf8");
    assert.match(api,/const user=await requireUser\(req\);requestAuthenticated=true/);
    assert.match(api,/requestAction==="prepare_test_subscription"&&commerce\.mode==="test"&&commerce\.test_payments_enabled&&requestAuthenticated/);
  });

  let nextResponse={ok:true,status:200,headers:{get:()=>null},json:async()=>({object:"setup_intent",livemode:false,id:"seti_fixture"})};
  let networkCalls=0;
  globalThis.fetch=async(input,init)=>{
    networkCalls++;
    const url=new URL(input);
    assert.equal(url.hostname,"api.stripe.com");
    assert.ok(String(init?.headers?.authorization||"").includes(fixtureKey));
    return nextResponse;
  };
  await check("successful mocked TEST API response returns the Stripe object without diagnostic",async()=>{
    const result=await providerRequestForMode("setup_intents/seti_fixture","test");
    assert.equal(result.id,"seti_fixture");
    assert.equal(networkCalls,1);
  });

  for(const [step,path,method,params] of cases){
    nextResponse={
      ok:false,status:400,headers:{get:name=>name==="request-id"?"req_Abcdef123456":null},
      json:async()=>({error:{
        type:"invalid_request_error",code:"parameter_missing",
        message:"must not escape: secret_fixture user@example.test cus_private",
        client_secret:"seti_fixture_secret_private",customer:"cus_private",payment_method:"pm_private"
      }})
    };
    await (async()=>{
      try{await providerRequestForMode(path,"test",{method,params});assert.fail("expected Stripe rejection")}
      catch(error){
        assert.equal(error.code,"PAYMENT_PROVIDER_ERROR");
        assert.equal(error.status,502);
        assert.equal(error.message,"Stripe TEST a refusé la demande.");
        const clean=sanitizeStripeProviderDiagnostic(error.safeStripeDiagnostic);
        assert.equal(clean.stage,step);
        assert.equal(clean.stripe_http_status,400);
        assert.equal(clean.stripe_error_type,"invalid_request_error");
        assert.equal(clean.stripe_error_code,"parameter_missing");
        assert.equal(clean.stripe_request_id,"req_Abcdef123456");
        assert.doesNotMatch(JSON.stringify(clean),/secret_fixture|user@example|cus_private|pm_private|seti_fixture/);
      }
    })();
    passed++;console.log(`STRIPE PROVIDER DIAGNOSTIC ✓ Stripe refusal safely tagged at ${step}`);
  }

  await check("TEST transport failure carries only a safe stage and no raw exception",async()=>{
    globalThis.fetch=async()=>{throw new Error("private@example.test sk_test_private cus_123")};
    try{await providerRequestForMode("payment_methods/pm_fixture","test");assert.fail("expected transport failure")}
    catch(error){
      assert.equal(error.code,"PAYMENT_PROVIDER_ERROR");
      assert.deepEqual(sanitizeStripeProviderDiagnostic(error.safeStripeDiagnostic),{
        stage:"payment_method",source:"transport",stripe_http_status:null,
        stripe_error_type:"unknown",stripe_error_code:"unknown",stripe_request_id:null
      });
      assert.equal(error.message,"Stripe TEST ne répond pas.");
      assert.doesNotMatch(JSON.stringify(error.safeStripeDiagnostic),/private@example|sk_test_private|cus_123/);
    }
  });

  await check("browser renders structured diagnostic only for TEST subscription preparation",()=>{
    const app=fs.readFileSync("app.js","utf8");
    assert.match(app,/action==="prepare_test_subscription"&&proState\.mode==="test"\?\s*sanitizeStripeProviderDiagnostic\(json\?\.diagnostic\):null/);
    assert.match(app,/stripeProviderDiagnosticText\(error\.safeStripeProviderDiagnostic\)/);
    assert.match(app,/sanitizeStripeProviderDiagnostic\(value\)/);
  });

  console.log(`STRIPE PROVIDER DIAGNOSTIC: ${passed} assertions PASS`);
}finally{
  globalThis.fetch=originalFetch;
  for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
  for(const [key,value] of Object.entries(originalEnv))process.env[key]=value;
}
