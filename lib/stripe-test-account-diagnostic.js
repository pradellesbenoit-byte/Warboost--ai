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

export function stripeTestAccountDiagnosticAvailable(){
  return process.env.VERCEL_ENV==="preview"&&
    process.env.VERCEL_GIT_COMMIT_REF===TARGET_PREVIEW_BRANCH&&
    cleanEnv("WARBOOST_COMMERCIAL_MODE").toLowerCase()==="test"&&
    /^(sk|rk)_test_/.test(cleanEnv("STRIPE_SECRET_KEY"));
}

function safeProviderError(status){
  if(status===401)return "STRIPE_TEST_AUTH_REJECTED";
  if(status===403)return "STRIPE_TEST_KEY_PERMISSION_DENIED";
  if(status===404)return "STRIPE_TEST_ACCOUNT_UNAVAILABLE";
  if(status===429)return "STRIPE_TEST_RATE_LIMITED";
  return "STRIPE_TEST_API_REJECTED";
}

export async function inspectStripeTestAccount(){
  if(!stripeTestAccountDiagnosticAvailable())
    return {success:false,error_code:"TEST_DIAGNOSTIC_ENVIRONMENT_BLOCKED"};

  try{
    const response=await fetchWithTimeout("https://api.stripe.com/v1/account",{
      method:"GET",
      headers:{
        authorization:`Bearer ${cleanEnv("STRIPE_SECRET_KEY")}`,
        "Stripe-Version":STRIPE_API_VERSION
      }
    },5000,{code:"STRIPE_TEST_ACCOUNT_DIAGNOSTIC_TIMEOUT",message:"Stripe TEST is unavailable"});
    if(!response.ok)return {success:false,error_code:safeProviderError(response.status)};
    const account=await response.json().catch(()=>null);
    if(account?.object!=="account"||!/^acct_[A-Za-z0-9]+$/.test(String(account?.id||""))||account?.livemode===true)
      return {success:false,error_code:"STRIPE_TEST_ACCOUNT_RESPONSE_INVALID"};
    return {success:true,account_id:account.id};
  }catch{
    return {success:false,error_code:"STRIPE_TEST_API_UNAVAILABLE"};
  }
}
