const SETUP_STAGES=new Set([
  "validation","price_product","database","customer","setup_intent","setup_intent_verify","setup_intent_ready",
  "stripe_js","elements_create","elements_mount","request"
]);

export function normalizeStripeSetupDiagnostic(value,fallbackStage="request"){
  const data=value&&typeof value==="object"?value:{};
  const stage=SETUP_STAGES.has(data.stage)?data.stage:
    (SETUP_STAGES.has(fallbackStage)?fallbackStage:"request");
  const httpStatus=Number.isInteger(data.http_status)&&data.http_status>=100&&data.http_status<=599?
    data.http_status:null;
  const code=/^[A-Z][A-Z0-9_]{1,63}$/.test(String(data.code||""))?String(data.code):"SETUP_FAILED";
  const elapsedMs=Number.isFinite(data.elapsed_ms)?Math.max(0,Math.min(120000,Math.round(data.elapsed_ms))):0;
  return {stage,http_status:httpStatus,code,elapsed_ms:elapsedMs};
}

export function stripeSetupRequestFailure(error,elapsedMs=0){
  const timedOut=error?.name==="TimeoutError"||error?.code==="request_timeout"||error?.name==="AbortError";
  return {stage:"request",http_status:null,code:timedOut?"REQUEST_TIMEOUT":"NETWORK_ERROR",
    elapsed_ms:Math.max(0,Math.min(120000,Math.round(Number(elapsedMs)||0)))};
}

function setupUiError(stage,code){
  const error=new Error("Stripe TEST setup UI step failed");
  error.diagnosticStage=stage;
  error.diagnosticCode=code;
  return error;
}

export async function createAndMountStripeTestElement({
  loadStripe,publishableKey,clientSecret,locale,host,onStage=()=>{},onReady=()=>{},
  timeoutMs=12000,schedule=setTimeout,cancel=clearTimeout
}={}){
  let stage="stripe_js",startedAt=Date.now();
  const reportStage=value=>{stage=value;try{onStage(value)}catch{}};
  let stripe;
  try{
    reportStage("stripe_js");
    stripe=await loadStripe();
    if(typeof stripe!=="function")throw setupUiError("stripe_js","STRIPE_JS_UNAVAILABLE");
  }catch{
    throw setupUiError("stripe_js","STRIPE_JS_UNAVAILABLE");
  }
  let stripeClient,elements,element;
  try{
    reportStage("elements_create");
    stripeClient=stripe(publishableKey);
    elements=stripeClient.elements({clientSecret,locale});
    element=elements.create("payment",{layout:"tabs",fields:{billingDetails:{address:"auto"}}});
  }catch{
    throw setupUiError("elements_create","STRIPE_ELEMENTS_CREATE_FAILED");
  }
  if(!host||typeof element?.on!=="function"||typeof element?.mount!=="function")
    throw setupUiError("elements_mount","PAYMENT_ELEMENT_HOST_OR_API_MISSING");

  reportStage("elements_mount");
  await new Promise((resolve,reject)=>{
    let settled=false,timer=null;
    const fail=code=>{
      if(settled)return;settled=true;if(timer!==null)cancel(timer);
      reject(setupUiError("elements_mount",code));
    };
    timer=schedule(()=>fail("ELEMENT_READY_TIMEOUT"),Math.max(1,Number(timeoutMs)||12000));
    try{
      element.on("ready",()=>{
        if(settled)return;settled=true;if(timer!==null)cancel(timer);
        try{onReady()}catch{}
        resolve();
      });
      element.on("loaderror",()=>fail("STRIPE_ELEMENTS_LOAD_FAILED"));
      element.mount(host);
    }catch{
      fail("ELEMENT_MOUNT_FAILED");
    }
  });
  const diagnostic={stage,code:"ELEMENT_READY",http_status:null,
    elapsed_ms:Math.max(0,Math.min(120000,Date.now()-startedAt))};
  return {stripe:stripeClient,elements,element,diagnostic};
}
