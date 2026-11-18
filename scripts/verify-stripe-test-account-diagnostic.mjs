import assert from "node:assert/strict";
import {
  inspectStripeTestAccount,
  isStripeTestDiagnosticAdmin,
  stripeTestAccountDiagnosticAvailable
} from "../lib/stripe-test-account-diagnostic.js";

const names=[
  "VERCEL_ENV","VERCEL_GIT_COMMIT_REF","WARBOOST_COMMERCIAL_MODE",
  "STRIPE_SECRET_KEY","WARBOOST_SUPPORT_ADMINS"
];
const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
const originalFetch=globalThis.fetch;
let calls=0,authorizationSeen="";
function configure({env="preview",branch="warboost-free-account-preview-20261117",mode="test",key="sk_test_unit_fixture"}={}){
  process.env.VERCEL_ENV=env;
  process.env.VERCEL_GIT_COMMIT_REF=branch;
  process.env.WARBOOST_COMMERCIAL_MODE=mode;
  process.env.STRIPE_SECRET_KEY=key;
}
function response(status,body){
  return {ok:status>=200&&status<300,status,json:async()=>body};
}

try{
  configure({branch:"some-other-branch"});
  globalThis.fetch=async()=>{calls++;return response(200,{object:"account",id:"acct_shouldnotbecalled"})};
  assert.equal(stripeTestAccountDiagnosticAvailable(),false);
  assert.deepEqual(await inspectStripeTestAccount(),{success:false,error_code:"TEST_DIAGNOSTIC_ENVIRONMENT_BLOCKED"});
  assert.equal(calls,0);

  configure();
  process.env.WARBOOST_SUPPORT_ADMINS="admin@example.test";
  assert.equal(isStripeTestDiagnosticAdmin({email:"ADMIN@example.test"}),true);
  assert.equal(isStripeTestDiagnosticAdmin({email:"other@example.test"}),false);
  assert.equal(stripeTestAccountDiagnosticAvailable(),true);
  globalThis.fetch=async(url,options)=>{
    calls++;authorizationSeen=options.headers.authorization;
    assert.equal(url,"https://api.stripe.com/v1/account");
    assert.equal(options.method,"GET");
    assert.equal(options.body,undefined);
    return response(200,{object:"account",id:"acct_warboosttest",livemode:false,email:"must_not_escape"});
  };
  const success=await inspectStripeTestAccount();
  assert.deepEqual(success,{success:true,account_id:"acct_warboosttest"});
  assert.equal(authorizationSeen,"Bearer sk_test_unit_fixture");
  assert.deepEqual(Object.keys(success).sort(),["account_id","success"]);

  for(const [status,error_code] of [
    [401,"STRIPE_TEST_AUTH_REJECTED"],
    [403,"STRIPE_TEST_KEY_PERMISSION_DENIED"],
    [404,"STRIPE_TEST_ACCOUNT_UNAVAILABLE"],
    [429,"STRIPE_TEST_RATE_LIMITED"],
    [500,"STRIPE_TEST_API_REJECTED"]
  ]){
    globalThis.fetch=async()=>response(status,{error:{message:"must_not_escape",code:"private_provider_detail"}});
    assert.deepEqual(await inspectStripeTestAccount(),{success:false,error_code});
  }

  globalThis.fetch=async()=>response(200,{object:"account",id:"acct_livewrongmode",livemode:true,email:"must_not_escape"});
  assert.deepEqual(await inspectStripeTestAccount(),{success:false,error_code:"STRIPE_TEST_ACCOUNT_RESPONSE_INVALID"});

  console.log("Stripe TEST account diagnostic: 18 targeted assertions passed (mocked HTTP only; no Stripe request made).");
}finally{
  globalThis.fetch=originalFetch;
  for(const name of names){
    if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];
  }
}
