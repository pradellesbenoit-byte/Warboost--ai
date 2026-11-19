import assert from "node:assert/strict";
import fs from "node:fs";
import {translator} from "../i18n.js";
import {
  inspectStripeTestAccount,
  isStripeTestDiagnosticAdmin,
  stripeTestAccountDiagnosticAvailable,
  stripeTestAccountDiagnosticEnabledFor,
  stripeTestAccountDiagnosticContext,
  stripeTestAccountDiagnosticVisibleFor
} from "../lib/stripe-test-account-diagnostic.js";

const names=[
  "VERCEL_ENV","VERCEL_GIT_COMMIT_REF","VERCEL_GIT_COMMIT_SHA","WARBOOST_COMMERCIAL_MODE",
  "STRIPE_SECRET_KEY","WARBOOST_SUPPORT_ADMINS"
];
const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
const originalFetch=globalThis.fetch;
let calls=0,authorizationSeen="";
function configure({env="preview",branch="warboost-free-account-preview-20261117",mode="test",key="sk_test_unit_fixture"}={}){
  process.env.VERCEL_ENV=env;
  process.env.VERCEL_GIT_COMMIT_REF=branch;
  process.env.VERCEL_GIT_COMMIT_SHA="bc052959af0102fdfcee93177a556cf408ed6807";
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
  const blocked=await inspectStripeTestAccount();
  assert.equal(blocked.success,false);
  assert.equal(blocked.error_code,"TEST_DIAGNOSTIC_ENVIRONMENT_BLOCKED");
  assert.equal(blocked.diagnostic.branch_matches_target,false);
  assert.equal(blocked.diagnostic.stripe_request_allowed,false);
  assert.equal(calls,0);

  configure();
  process.env.WARBOOST_SUPPORT_ADMINS="admin@example.test";
  assert.equal(isStripeTestDiagnosticAdmin({email:"ADMIN@example.test"}),true);
  assert.equal(isStripeTestDiagnosticAdmin({email:"other@example.test"}),false);
  assert.equal(stripeTestAccountDiagnosticEnabledFor({email:"admin@example.test"}),true);
  assert.equal(stripeTestAccountDiagnosticVisibleFor({email:"admin@example.test"}),true);
  assert.equal(stripeTestAccountDiagnosticEnabledFor({email:"other@example.test"}),false);
  assert.equal(stripeTestAccountDiagnosticVisibleFor({email:"other@example.test"}),false);
  configure({env:"production"});
  assert.equal(stripeTestAccountDiagnosticEnabledFor({email:"admin@example.test"}),false);
  assert.equal(stripeTestAccountDiagnosticVisibleFor({email:"admin@example.test"}),false);
  configure({mode:"live"});
  assert.equal(stripeTestAccountDiagnosticEnabledFor({email:"admin@example.test"}),false);
  assert.equal(stripeTestAccountDiagnosticVisibleFor({email:"admin@example.test"}),true);
  assert.equal(stripeTestAccountDiagnosticAvailable(),false);
  configure();
  assert.equal(stripeTestAccountDiagnosticAvailable(),true);
  const context=stripeTestAccountDiagnosticContext();
  assert.equal(context.credential.variable,"STRIPE_SECRET_KEY");
  assert.equal(context.credential.kind,"test_secret");
  assert.equal(context.credential.source,"runtime_process_env");
  assert.equal(context.credential.vercel_scope,"not_exposed_to_function_runtime");
  assert.equal(context.branch_matches_target,true);
  assert.equal(context.commercial_mode_is_test,true);
  assert.equal(context.deployment_commit,"bc052959af0102fdfcee93177a556cf408ed6807");
  globalThis.fetch=async(url,options)=>{
    calls++;authorizationSeen=options.headers.authorization;
    assert.equal(url,"https://api.stripe.com/v1/account");
    assert.equal(options.method,"GET");
    assert.equal(options.body,undefined);
    return response(200,{object:"account",id:"acct_warboosttest",livemode:false,email:"must_not_escape"});
  };
  const success=await inspectStripeTestAccount();
  assert.equal(success.success,true);
  assert.equal(success.account_id,"acct_warboosttest");
  assert.equal(success.diagnostic.credential.kind,"test_secret");
  assert.ok(Number.isFinite(Date.parse(success.diagnostic.checked_at)));
  assert.equal(authorizationSeen,"Bearer sk_test_unit_fixture");
  assert.ok(!JSON.stringify(success).includes("sk_test_unit_fixture"));
  assert.ok(!JSON.stringify(success).includes("must_not_escape"));

  for(const [status,error_code] of [
    [401,"STRIPE_TEST_AUTH_REJECTED"],
    [403,"STRIPE_TEST_KEY_PERMISSION_DENIED"],
    [404,"STRIPE_TEST_ACCOUNT_UNAVAILABLE"],
    [429,"STRIPE_TEST_RATE_LIMITED"],
    [500,"STRIPE_TEST_API_REJECTED"]
  ]){
    globalThis.fetch=async()=>response(status,{error:{message:"must_not_escape",code:"private_provider_detail"}});
    const failed=await inspectStripeTestAccount();
    assert.equal(failed.success,false);
    assert.equal(failed.error_code,error_code);
    assert.ok(failed.diagnostic.checked_at);
    assert.ok(!JSON.stringify(failed).includes("private_provider_detail"));
  }

  globalThis.fetch=async()=>response(200,{object:"account",id:"acct_livewrongmode",livemode:true,email:"must_not_escape"});
  const wrongMode=await inspectStripeTestAccount();
  assert.equal(wrongMode.success,false);
  assert.equal(wrongMode.error_code,"STRIPE_TEST_ACCOUNT_RESPONSE_INVALID");
  assert.ok(!JSON.stringify(wrongMode).includes("must_not_escape"));

  const apiSource=fs.readFileSync(new URL("../api/pro.js",import.meta.url),"utf8");
  const appSource=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
  const uiChecks=[
    [apiSource.includes("stripe_test_account_diagnostic_visible:stripeTestAccountDiagnosticVisibleFor(user)"),"GET must expose only the server-computed admin/Preview/branch visibility gate"],
    [appSource.includes('proState.stripe_test_account_diagnostic_visible===true'),"button visibility must require explicit server approval for an authenticated admin"],
    [apiSource.includes('if(req.method==="POST"&&String(req.query?.action||"")==="test_stripe_account_diagnostic")'),"diagnostic route must remain action-scoped"],
    [apiSource.includes("if(!isStripeTestDiagnosticAdmin(diagnosticUser))"),"POST must retain its server-side admin check"],
    [apiSource.includes('if(process.env.VERCEL_ENV!=="preview")'),"POST must remain blocked outside Preview"],
    [appSource.includes("fetchJsonBounded(\"/api/pro?action=test_stripe_account_diagnostic\""),"button must call the existing same-origin endpoint"],
    [appSource.includes('cache:"no-store"'),"diagnostic request must bypass browser cache"],
    [appSource.includes('"Cache-Control":"no-cache","Pragma":"no-cache"'),"diagnostic request must explicitly request fresh data"],
    [appSource.includes("headers:authHeaders({\"content-type\":\"application/json\",\"Cache-Control\":\"no-cache\",\"Pragma\":\"no-cache\"})"),"request must use current authenticated app session"],
    [appSource.includes('logged&&proState.stripe_test_account_diagnostic_visible===true'),"button must remain hidden unless an authenticated admin is approved by the server"],
    [appSource.includes('t("stripe_test_diagnostic_http",{status:String(response.status),time:checkedAt})'),"UI must display the actual response status and server check time"],
    [appSource.includes('t("stripe_test_diagnostic_context"'),"UI must show sanitized runtime and credential-class diagnostics"],
    [appSource.includes('box.className="buttonRow stripeTestAccountDiagnostic hidden"'),"diagnostic UI must start hidden"],
    [appSource.includes('status.setAttribute("aria-live","polite")'),"diagnostic result must be announced accessibly"],
    [appSource.includes("acct_1U4Jj5Gh5pcfWSKy"),"UI must compare against the expected TEST account"]
  ];
  for(const [ok,message] of uiChecks)assert.ok(ok,message);
  assert.ok(!appSource.includes('console.log(cloudSession?.access_token'),"access token must not be logged");
  assert.equal(translator("fr")("stripe_test_diagnostic_button"),"Diagnostic Stripe TEST");
  assert.equal(translator("en-GB")("stripe_test_diagnostic_button"),"Stripe TEST diagnostic");
  assert.match(translator("fr")("stripe_test_diagnostic_http",{status:"200",time:"now"}),/HTTP 200.*now/);
  assert.match(translator("fr")("stripe_test_diagnostic_context",{environment:"Preview",branch:"conforme",mode:"TEST",credential:"TEST",scope:"inconnue",commit:"abc"}),/Preview.*TEST.*abc/);
  assert.match(translator("fr")("stripe_test_diagnostic_match",{account:"acct_demo"}),/acct_demo/);
  assert.match(translator("fr")("stripe_test_diagnostic_mismatch",{account:"acct_a",expected:"acct_b"}),/acct_a.*acct_b/);

  console.log("Stripe TEST account diagnostic mock responses, environment guards and administrator checks passed (no Stripe request made).");
  console.log(`Stripe TEST diagnostic UI: ${uiChecks.length+5} visibility, auth, status, localization, and account-match assertions passed.`);
}finally{
  globalThis.fetch=originalFetch;
  for(const name of names){
    if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];
  }
}
