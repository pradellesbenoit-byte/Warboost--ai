const PAYMENT_INTENT_SECRET=/^(pi_[A-Za-z0-9_]+)_secret_[A-Za-z0-9_]+$/;
const PAYMENT_INTENT_ID=/^pi_[A-Za-z0-9_]+$/;
const PAYMENT_METHOD_ID=/^pm_[A-Za-z0-9_]+$/;
const RETRYABLE_INTENT_STATES=new Set([
  "requires_payment_method","requires_action","requires_confirmation"
]);

function missingState(input){
  if(!input?.ownerId||input.ownerId!==input.currentUserId)return "account";
  if(!PAYMENT_INTENT_ID.test(String(input.paymentIntentId||"")))return "payment_intent";
  const secret=String(input.clientSecret||"");
  const match=secret.match(PAYMENT_INTENT_SECRET);
  if(!match||match[1]!==input.paymentIntentId)return "payment_intent";
  if(!PAYMENT_METHOD_ID.test(String(input.paymentMethodId||"")))return "payment_method";
  if(input.stripeAvailable!==true)return "stripe";
  if(typeof input.prepareStripe!=="function"||typeof input.confirm!=="function")return "stripe";
  return "";
}

export function createStripeTestPaymentConfirmation({
  onState=()=>{},timeoutMs=45000,schedule=setTimeout,cancel=clearTimeout
}={}){
  let pending=false,confirmed=false,uncertain=false;
  const snapshot=()=>({pending,confirmed,uncertain});
  const emit=(state,details={})=>{try{onState(state,{...snapshot(),...details})}catch{}};
  return {
    snapshot,
    canConfirm(input){
      return !pending&&!confirmed&&!uncertain&&!missingState(input);
    },
    acceptVerifiedPreparation(){
      if(pending)return false;
      confirmed=false;uncertain=false;
      return true;
    },
    async run(input={}){
      if(pending){emit("already_in_progress");return {state:"already_in_progress"}}
      if(confirmed){emit("already_confirmed");return {state:"already_confirmed"}}
      if(uncertain){emit("outcome_unknown");return {state:"outcome_unknown"}}
      const missing=missingState(input);
      if(missing){emit(missing==="account"?"account_changed":"missing_state",{reason:missing});return {state:"missing_state",reason:missing}}

      pending=true;emit("preparing_stripe");
      let timer=null,requestStarted=false;
      if(Number(timeoutMs)>0)timer=schedule(()=>emit("timeout"),Number(timeoutMs));
      try{
        try{await input.prepareStripe()}
        catch{emit("stripe_unavailable");return {state:"stripe_unavailable"}}
        emit("confirming");
        const result=await input.confirm(()=>{requestStarted=true});
        const intent=result?.paymentIntent||result?.error?.paymentIntent||result?.error?.payment_intent||null;
        if(intent?.status==="succeeded"){
          confirmed=true;emit("succeeded");
          return {state:"succeeded"};
        }
        if(RETRYABLE_INTENT_STATES.has(intent?.status)){
          emit("retryable_error");
          return {state:"retryable_error"};
        }
        if(!requestStarted){
          emit("retryable_error");
          return {state:"retryable_error"};
        }
        uncertain=true;emit("outcome_unknown");
        return {state:"outcome_unknown"};
      }catch{
        if(!requestStarted){
          emit("retryable_error");
          return {state:"retryable_error"};
        }
        uncertain=true;emit("outcome_unknown");
        return {state:"outcome_unknown"};
      }finally{
        if(timer!==null)cancel(timer);
        pending=false;emit("settled");
      }
    }
  };
}
