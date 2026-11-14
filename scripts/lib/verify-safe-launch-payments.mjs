import assert from "node:assert/strict";
import {commercialConfig,createCheckoutForUser} from "../../lib/commercial-pro.js";

export async function verifySafeLaunchPayments(){
  const names=[
    "WARBOOST_COMMERCIAL_MODE","STRIPE_SECRET_KEY","STRIPE_LIVE_SECRET_KEY",
    "STRIPE_PRICE_PRO_MONTHLY","STRIPE_PRODUCT_PRO","STRIPE_LIVE_PRICE_PRO_MONTHLY",
    "STRIPE_LIVE_PRODUCT_PRO","STRIPE_WEBHOOK_SECRET","STRIPE_LIVE_WEBHOOK_SECRET",
    "WARBOOST_APP_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
    "WARBOOST_LEGAL_BUSINESS_NAME","WARBOOST_SUPPORT_EMAIL","WARBOOST_TERMS_URL",
    "WARBOOST_PRIVACY_URL","WARBOOST_LIVE_AUTOMATIC_TAX_ENABLED","STRIPE_LIVE_TAX_CODE",
    "WARBOOST_LIVE_TAX_READY","WARBOOST_LIVE_APPROVED_BILLING_COUNTRIES",
    "WARBOOST_LIVE_PAYMENTS_ENABLED","WARBOOST_LIVE_WEBHOOKS_ENABLED"
  ];
  const previous=new Map(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch;
  let networkCalls=0;
  globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected payment network call")};
  try{
    for(const name of names)delete process.env[name];
    for(const mode of ["off","preview","live"]){
      process.env.WARBOOST_COMMERCIAL_MODE=mode;
      const config=commercialConfig();
      assert.equal(config.live,false);assert.equal(config.live_blocked,true);
      assert.equal(config.payments_enabled,false);
      await assert.rejects(createCheckoutForUser({id:"synthetic-recovery"}),
        error=>mode==="live"
          ?error.code==="LIVE_ACTIVATION_REQUIREMENTS_MISSING"&&error.status===503&&error.requirements.includes("precharge_country_guard")
          :error.code==="SAFE_LAUNCH_PAYMENT_DISABLED"&&error.status===403);
    }
    assert.equal(networkCalls,0);
  }finally{
    globalThis.fetch=originalFetch;
    for(const [name,value] of previous){
      if(value===undefined)delete process.env[name];
      else process.env[name]=value;
    }
  }
}