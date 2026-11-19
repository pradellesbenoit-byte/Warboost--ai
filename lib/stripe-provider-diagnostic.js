const STRIPE_STEPS=new Set(["setup_intent","payment_method","price","customer","subscription","invoice_tax"]);
const STRIPE_ERROR_TYPES=new Set([
  "api_error","card_error","idempotency_error","invalid_request_error",
  "authentication_error","permission_error","rate_limit_error"
]);
const STRIPE_ERROR_CODES=new Set([
  "account_invalid","account_country_invalid_address","amount_too_large","amount_too_small",
  "balance_insufficient","card_declined","currency_not_supported","idempotency_key_in_use",
  "incorrect_address","incorrect_cvc","incorrect_number","invalid_expiry_month","invalid_expiry_year",
  "invalid_number","invoice_no_customer","invoice_no_payment_method_types","parameter_invalid_empty",
  "parameter_invalid_integer","parameter_missing","parameter_unknown","payment_intent_authentication_failure",
  "payment_intent_invalid_parameter","payment_intent_unexpected_state","payment_method_unactivated",
  "payment_method_unexpected_state","price_inactive","product_inactive","rate_limit",
  "resource_already_exists","resource_missing","setup_intent_authentication_failure",
  "setup_intent_invalid_parameter","setup_intent_unexpected_state","tax_calculation_failed",
  "tax_feature_not_enabled","tax_id_invalid","tax_location_invalid","tax_parameter_invalid",
  "tax_product_not_taxable"
]);

function routeResource(path){
  return String(path||"").split("?")[0].split("/")[0].toLowerCase();
}

export function stripeProviderStep(path,method="GET",params={}){
  const resource=routeResource(path),verb=String(method||"GET").toUpperCase();
  if(resource==="setup_intents")return "setup_intent";
  if(resource==="payment_methods")return "payment_method";
  if(resource==="prices"||resource==="products")return "price";
  if(resource==="customers")return "customer";
  if(resource==="invoices")return "invoice_tax";
  if(resource==="subscriptions"){
    if(verb==="POST"&&String(params?.["automatic_tax[enabled]"]||"")==="true")return "invoice_tax";
    return "subscription";
  }
  return "subscription";
}

export function stripeProviderDiagnostic({
  step,status,type,code,requestId,source="stripe_response"
}={}){
  const safeStep=STRIPE_STEPS.has(step)?step:"subscription";
  const safeSource=source==="transport"?"transport":"stripe_response";
  const httpStatus=Number.isInteger(status)&&status>=100&&status<=599?status:null;
  const safeRequestId=/^req_[A-Za-z0-9]{8,64}$/.test(String(requestId||""))?String(requestId):null;
  return {
    stage:safeStep,source:safeSource,stripe_http_status:httpStatus,
    stripe_error_type:STRIPE_ERROR_TYPES.has(type)?type:"unknown",
    stripe_error_code:STRIPE_ERROR_CODES.has(code)?code:"unknown",
    stripe_request_id:safeRequestId
  };
}

export function sanitizeStripeProviderDiagnostic(value){
  if(!value||typeof value!=="object"||!STRIPE_STEPS.has(value.stage))return null;
  const source=value.source==="transport"?"transport":value.source==="stripe_response"?"stripe_response":null;
  if(!source)return null;
  const status=Number.isInteger(value.stripe_http_status)&&value.stripe_http_status>=100&&value.stripe_http_status<=599?
    value.stripe_http_status:null;
  const type=STRIPE_ERROR_TYPES.has(value.stripe_error_type)?value.stripe_error_type:"unknown";
  const code=STRIPE_ERROR_CODES.has(value.stripe_error_code)?value.stripe_error_code:"unknown";
  const requestId=/^req_[A-Za-z0-9]{8,64}$/.test(String(value.stripe_request_id||""))?
    String(value.stripe_request_id):null;
  return {stage:value.stage,source,stripe_http_status:status,stripe_error_type:type,
    stripe_error_code:code,stripe_request_id:requestId};
}

export function stripeProviderFailurePayload(error,{mode,action,authenticated}={}){
  if(mode!=="test"||action!=="prepare_test_subscription"||authenticated!==true)return null;
  const diagnostic=sanitizeStripeProviderDiagnostic(error?.safeStripeDiagnostic);
  return diagnostic?{diagnostic}:null;
}
