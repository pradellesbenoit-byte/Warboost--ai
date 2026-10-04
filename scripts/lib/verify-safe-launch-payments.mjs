import assert from "node:assert/strict";
import {commercialConfig,createCheckoutForUser} from "../../lib/commercial-pro.js";

export async function verifySafeLaunchPayments(){
  const previous=process.env.WARBOOST_COMMERCIAL_MODE,originalFetch=globalThis.fetch;
  let networkCalls=0;
  globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected payment network call")};
  try{
    for(const mode of ["off","preview","live"]){
      process.env.WARBOOST_COMMERCIAL_MODE=mode;
      const config=commercialConfig();
      assert.equal(config.live,false);assert.equal(config.live_blocked,true);
      assert.equal(config.payments_enabled,false);
      await assert.rejects(createCheckoutForUser({id:"synthetic-recovery"}),
        error=>error.code==="SAFE_LAUNCH_PAYMENT_DISABLED"&&error.status===403);
    }
    assert.equal(networkCalls,0);
  }finally{
    globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.WARBOOST_COMMERCIAL_MODE;
    else process.env.WARBOOST_COMMERCIAL_MODE=previous;
  }
}