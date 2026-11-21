import assert from "node:assert/strict";
import fs from "node:fs";
import {stripeTestReturnMessageKey} from "../lib/stripe-test-return.js";

let passed=0;
const check=(name,fn)=>{fn();passed++;console.log(`STRIPE TEST RETURN ✓ ${name}`)};
const serverPro={active:true,source:"stripe"};

check("setup return never claims a saved card or payment from the URL",()=>{
  assert.equal(stripeTestReturnMessageKey("test-setup-return",{serverReadOk:true,serverEntitlement:{active:false,source:"free"}}),
    "pro_test_setup_return");
});
check("setup return with unavailable server status stays unconfirmed",()=>{
  assert.equal(stripeTestReturnMessageKey("test-setup-return",{serverReadOk:false,serverEntitlement:serverPro}),
    "pro_test_return_status_unavailable");
});
check("payment return with unavailable server status grants nothing",()=>{
  assert.equal(stripeTestReturnMessageKey("test-payment-return",{serverReadOk:false,serverEntitlement:serverPro}),
    "pro_test_return_status_unavailable");
});
check("beta access is not mistaken for paid PRO after payment return",()=>{
  assert.equal(stripeTestReturnMessageKey("test-payment-return",{serverReadOk:true,serverEntitlement:{active:true,source:"beta"}}),
    "pro_test_return_pending");
});
check("inactive or incomplete server entitlement stays pending",()=>{
  assert.equal(stripeTestReturnMessageKey("test-payment-return",{serverReadOk:true,serverEntitlement:{active:false,source:"stripe"}}),
    "pro_test_return_pending");
});
check("only active server Stripe entitlement confirms PRO",()=>{
  assert.equal(stripeTestReturnMessageKey("test-payment-return",{serverReadOk:true,serverEntitlement:serverPro}),
    "pro_test_payment_entitlement_confirmed");
});
check("unknown and legacy Checkout markers do not use the new TEST return path",()=>{
  assert.equal(stripeTestReturnMessageKey("test-success",{serverReadOk:true,serverEntitlement:serverPro}),null);
  assert.equal(stripeTestReturnMessageKey("anything",{serverReadOk:true,serverEntitlement:serverPro}),null);
});
check("app reads the authenticated server status before handling the return marker",()=>{
  const app=fs.readFileSync("app.js","utf8");
  assert.match(app,/fetchSessionCritical\("\/api\/pro",\{cache:"no-store",headers:authHeaders\(\)\}/);
  assert.match(app,/stripeTestReturnMessageKey\(result,\{serverReadOk,serverEntitlement:proState\.entitlement\}\)/);
  assert.match(app,/history\.replaceState\(history\.state/);
});

console.log(`STRIPE TEST RETURN: ${passed} checks passed`);
