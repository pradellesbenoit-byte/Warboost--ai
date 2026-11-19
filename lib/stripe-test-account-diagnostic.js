import {fetchWithTimeout} from "./http-timeout.js";
import {STRIPE_API_VERSION} from "./stripe-test.js";

const TARGET_PREVIEW_BRANCH="warboost-free-account-preview-20261117";
const cleanEnv=name=>String(process.env[name]||"").trim();

export function isStripeTestDiagnosticAdmin(user){
  const allowlist=[...new Set(cleanEnv("WARBOOST_SUPPORT_ADMINS")
    .split(/[;,\n]/).map(value=>value.trim().toLowerCase()).filter(Boolean))];
  const email=String(user?.email||"").trim().toLowerCase();
  return Boolean(email&&allowlist.includes(email));
}

export function stripeTestAccountDiagnosticEnabledFor(user){
  return isStripeTestDiagnosticAdmin(user)&&stripeTestAccountDiagnosticAvailable();
}

export function stripeTestAccountDiagnosticVisibleFor(user){
  return isStripeTestDiagnosticAdmin(user)&&
    process.env.VERCEL_ENV==="preview"&&
    cleanEnv("VERCEL_GIT_COMMIT_REF")===TARGET_PREVIEW_BRANCH;
}

function stripeCredentialKind(key){
  if(/^sk_test_/.test(key))return "test_secret";
  if(/^rk_test_/.test(key))return "test_restricted";
  if(!key)return "absent";
  return "not_test";
}

export function stripeTestAccountDiagnosticContext(){
  const key=cleanEnv("STRIPE_SECRET_KEY");
  const branch=cleanEnv("VERCEL_GIT_COMMIT_REF");
  const commit=cleanEnv("VERCEL_GIT_COMMIT_SHA");
  const isPreview=process.env.VERCEL_ENV==="preview";
  const branchMatches=branch===TARGET_PREVIEW_BRANCH;
  const modeIsTest=cleanEnv("WARBOOST_COMMERCIAL_MODE").toLowerCase()==="test";
  const credentialKind=stripeCredentialKind(key);
  const credentialIsTest=credentialKind==="test_secret"||credentialKind==="test_restricted";
  return {
    checked_at:new Date().toISOString(),
    runtime_environment:isPreview?"preview":process.env.VERCEL_ENV==="production"?"production":"other",
    target_branch:TARGET_PREVIEW_BRANCH,
    branch_matches_target:branchMatches,
    commercial_mode_is_test:modeIsTest,
    credential:{
      variable:"STRIPE_SECRET_KEY",
      present:Boolean(key),
      kind:credentialKind,
      source:"runtime_process_env",
      vercel_scope:"not_exposed_to_function_runtime"
    },
    deployment_commit:/^[a-f0-9]{40}$/i.test(commit)?commit:null,
    stripe_request_allowed:isPreview&&branchMatches&&modeIsTest&&credentialIsTest
  };
}

export function stripeTestAccountDiagnosticAvailable(){
  return stripeTestAccountDiagnosticContext().stripe_request_allowed;
}

function safeProviderError(status){
  if(status===401)return "STRIPE_TEST_AUTH_REJECTED";
  if(status===403)return "STRIPE_TEST_KEY_PERMISSION_DENIED";
  if(status===404)return "STRIPE_TEST_ACCOUNT_UNAVAILABLE";
  if(status===429)return "STRIPE_TEST_RATE_LIMITED";
  return "STRIPE_TEST_API_REJECTED";
}

export async function inspectStripeTestAccount(){
  const diagnostic=stripeTestAccountDiagnosticContext();
  if(!diagnostic.stripe_request_allowed)
    return {success:false,error_code:"TEST_DIAGNOSTIC_ENVIRONMENT_BLOCKED",diagnostic};

  try{
    const response=await fetchWithTimeout("https://api.stripe.com/v1/account",{
      method:"GET",
      headers:{
        authorization:`Bearer ${cleanEnv("STRIPE_SECRET_KEY")}`,
        "Stripe-Version":STRIPE_API_VERSION
      }
    },5000,{code:"STRIPE_TEST_ACCOUNT_DIAGNOSTIC_TIMEOUT",message:"Stripe TEST is unavailable"});
    if(!response.ok)return {success:false,error_code:safeProviderError(response.status),diagnostic};
    const account=await response.json().catch(()=>null);
    if(account?.object!=="account"||!/^acct_[A-Za-z0-9]+$/.test(String(account?.id||""))||account?.livemode===true)
      return {success:false,error_code:"STRIPE_TEST_ACCOUNT_RESPONSE_INVALID",diagnostic};
    return {success:true,account_id:account.id,diagnostic};
  }catch{
    return {success:false,error_code:"STRIPE_TEST_API_UNAVAILABLE",diagnostic};
  }
}
