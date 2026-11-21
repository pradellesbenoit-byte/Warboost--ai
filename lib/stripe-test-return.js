export function stripeTestReturnMessageKey(marker,{serverReadOk=false,serverEntitlement=null}={}){
  if(marker!=="test-setup-return"&&marker!=="test-payment-return")return null;
  if(!serverReadOk)return "pro_test_return_status_unavailable";
  if(serverEntitlement?.source==="stripe"&&serverEntitlement?.active===true)
    return "pro_test_payment_entitlement_confirmed";
  if(marker==="test-setup-return")return "pro_test_setup_return";
  return "pro_test_return_pending";
}
