import assert from "node:assert/strict";
import {commercialConfig,createCheckoutForUser,createLiveCheckoutForUser} from "../../lib/commercial-pro.js";

export async function verifySafeLaunchPayments(){
  const previous=process.env.WARBOOST_COMMERCIAL_MODE,previousLiveEnabled=process.env.WARBOOST_LIVE_PAYMENTS_ENABLED;
  const originalFetch=globalThis.fetch;
  let networkCalls=0;
  globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected payment network call")};
  try{
    for(const mode of ["off","preview"]){
      process.env.WARBOOST_COMMERCIAL_MODE=mode;
      const config=commercialConfig();
      assert.equal(config.mode,mode);
      assert.equal(config.live,false);
      assert.equal(config.live_blocked,false);
      assert.equal(config.payments_enabled,false);
      assert.equal(config.live_payments_enabled,false);
      await assert.rejects(createCheckoutForUser({id:"synthetic-recovery"}),
        error=>error.code==="SAFE_LAUNCH_PAYMENT_DISABLED"&&error.status===403);
    }
    process.env.WARBOOST_COMMERCIAL_MODE="live";
    process.env.WARBOOST_LIVE_PAYMENTS_ENABLED="false";
    const liveConfig=commercialConfig();
    assert.equal(liveConfig.mode,"live");
    assert.equal(liveConfig.live,true,"LIVE describes the selected mode, not enabled payments");
    assert.equal(liveConfig.live_blocked,true);
    assert.equal(liveConfig.payments_enabled,false);
    assert.equal(liveConfig.live_payments_enabled,false);
    await assert.rejects(createLiveCheckoutForUser({id:"synthetic-recovery"}),
      error=>error.status===403&&[
        "LIVE_BILLING_DISABLED","STRIPE_LIVE_KEY_REQUIRED","STRIPE_LIVE_CATALOG_MISMATCH",
        "LIVE_ACTIVATION_REQUIREMENTS_MISSING"
      ].includes(error.code));
    assert.equal(networkCalls,0);
  }finally{
    globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.WARBOOST_COMMERCIAL_MODE;
    else process.env.WARBOOST_COMMERCIAL_MODE=previous;
    if(previousLiveEnabled===undefined)delete process.env.WARBOOST_LIVE_PAYMENTS_ENABLED;
    else process.env.WARBOOST_LIVE_PAYMENTS_ENABLED=previousLiveEnabled;
  }
}