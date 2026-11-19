import {billingError,billingRpc,billingRow} from "./billing-store.js";
import {
  commercialConfig,checkedTestConfig,providerRequest,verifiedProviderPrice,priceMatches,
  testPaymentElementPublicKey,assertBillingCountryAllowed,assertTestTaxCountryReady,
  TEST_SUBSCRIPTION_CONSENT_VERSION,PRO_PLAN,testPriceId
} from "./stripe-test.js";

const modeError=()=>billingError("TEST_PAYMENT_FLOW_DISABLED","Le parcours Payment Element est réservé à Stripe TEST configuré.",403);
const attemptError=()=>billingError("TEST_PAYMENT_ATTEMPT_INVALID","Cette préparation de paiement a expiré ou ne correspond plus au compte.",409);
const setupDiagnostic=(stage,startedAt)=>({stage,elapsed_ms:Math.max(0,Math.min(120000,Date.now()-startedAt))});
const testConsentOk=consent=>consent?.confirm_test_only===true&&
  consent?.test_subscription_consent===true&&
  consent?.test_subscription_consent_version===TEST_SUBSCRIPTION_CONSENT_VERSION;
const normalizeCountry=value=>String(value||"").trim().toUpperCase();
const idOf=value=>typeof value==="string"?value:value?.id||null;

function assertFlowReady(country){
  checkedTestConfig();
  const cfg=commercialConfig();
  if(cfg.mode!=="test"||!cfg.test_payment_element_enabled||!testPaymentElementPublicKey())
    throw modeError();
  assertBillingCountryAllowed(country,"test");
  assertTestTaxCountryReady(country);
}
function mapClaimState(state){
  if(state==="busy")throw billingError("TEST_PAYMENT_BUSY","Une préparation TEST est déjà en cours. Réessayez dans quelques instants.",409);
  if(state==="blocked")throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement existe déjà. Utilisez le portail client.",409);
  if(state==="checkout_exists")throw billingError("TEST_CHECKOUT_EXISTS","Un Checkout est déjà ouvert pour ce compte. Terminez-le ou attendez son expiration.",409);
  if(state==="country_or_consent_mismatch")throw billingError("TEST_PAYMENT_RESTART_REQUIRED","Le pays ou le consentement a changé. Fermez cette préparation et recommencez.",409);
  if(state==="invalid")throw attemptError();
}
function verifySetupIntent(intent,attempt,userId){
  if(!intent||intent.object!=="setup_intent"||intent.livemode!==false||intent.id!==attempt.setup_intent_id||
    intent.customer!==attempt.stripe_customer_id||intent.status!=="succeeded"||
    intent.metadata?.warboost_user_id!==userId||
    intent.metadata?.warboost_setup_attempt_id!==attempt.attempt_id||
    intent.metadata?.billing_country!==attempt.billing_country||
    intent.metadata?.test_consent_version!==TEST_SUBSCRIPTION_CONSENT_VERSION)
    throw billingError("TEST_SETUP_NOT_CONFIRMED","Le moyen de paiement TEST n’est pas confirmé par Stripe.",409);
  const paymentMethod=idOf(intent.payment_method);
  if(!paymentMethod)throw billingError("TEST_PAYMENT_METHOD_MISSING","Stripe n’a pas retourné de moyen de paiement confirmé.",409);
  return paymentMethod;
}
async function getAttempt(userId){
  const attempt=await billingRow("warboost_test_payment_attempts","user_id",userId);
  if(!attempt)throw attemptError();
  return attempt;
}
async function readSetupIntent(attempt){
  const intent=await providerRequest(`setup_intents/${encodeURIComponent(attempt.setup_intent_id)}`);
  if(intent.id!==attempt.setup_intent_id||intent.livemode!==false||intent.customer!==attempt.stripe_customer_id||
    intent.metadata?.warboost_setup_attempt_id!==attempt.attempt_id)
    throw billingError("TEST_SETUP_MISMATCH","La préparation Stripe TEST ne correspond pas à cette tentative.",409);
  return intent;
}
async function ensureTestProPrice(){
  const price=await verifiedProviderPrice("test");
  // Stripe may report "unspecified" when the account default determines tax
  // behavior. That is acceptable only because no payment secret is returned
  // until the completed automatic-tax invoice proves a 499 EUR-cent total.
  if(!["inclusive","unspecified"].includes(price.tax_behavior))
    throw billingError("TEST_PRICE_TAX_BEHAVIOR_UNRESOLVED","Le comportement fiscal du prix TEST n’est pas compatible avec un total TTC de 4,99 €.",503);
  return price;
}
async function setupResponse(attempt){
  const intent=await readSetupIntent(attempt);
  if(typeof intent.client_secret!=="string"||!intent.client_secret)
    throw billingError("TEST_SETUP_SECRET_MISSING","Stripe n’a pas retourné le secret temporaire du formulaire.",502);
  return {test:true,live:false,mode:"test",state:intent.status==="succeeded"?"setup_succeeded":"setup_required",
    setup_intent_id:intent.id,setup_client_secret:intent.client_secret,publishable_key:testPaymentElementPublicKey(),
    billing_country:attempt.billing_country,consent_version:attempt.consent_version};
}

export async function createTestPaymentSetup(user,{billingCountry,consent}={}){
  const startedAt=Date.now();
  let stage="validation";
  try{
    if(!testConsentOk(consent))throw billingError("TEST_SUBSCRIPTION_CONSENT_REQUIRED","Confirmez explicitement l’abonnement de test mensuel avant de continuer.",428);
    const country=normalizeCountry(billingCountry);
    assertFlowReady(country);

    // Validate the catalog entry before creating a Customer or SetupIntent.
    // "unspecified" is checked against the completed invoice before payment
    // confirmation, so it cannot silently increase the advertised TTC total.
    stage="price_product";
    await ensureTestProPrice();

    stage="database";
    const claim=await billingRpc("warboost_claim_test_payment_attempt",{p_user_id:user.id,p_country:country,p_consent_version:TEST_SUBSCRIPTION_CONSENT_VERSION});
    mapClaimState(claim?.state);
    if(claim?.state==="payment_pending"){
      const attempt=await getAttempt(user.id);
      return {test:true,live:false,mode:"test",state:"payment_pending",setup_intent_id:attempt.setup_intent_id,
        publishable_key:testPaymentElementPublicKey(),billing_country:attempt.billing_country,
        consent_version:attempt.consent_version,diagnostic:setupDiagnostic("database",startedAt)};
    }
    if(claim?.state==="setup_pending"){
      const attempt=await getAttempt(user.id);
      stage="setup_intent_verify";
      return {...await setupResponse(attempt),diagnostic:setupDiagnostic("setup_intent_ready",startedAt)};
    }
    if(claim?.state==="subscription_retry")
      throw billingError("TEST_PAYMENT_RETRY_REQUIRED","Une création d’abonnement TEST est déjà en cours. Réessayez après quelques secondes.",409);
    if(claim?.state!=="creating"||!claim?.attempt_id)throw attemptError();

    const attemptId=claim.attempt_id;
    const account=await billingRow("warboost_billing_accounts","user_id",user.id);
    let customerId=String(claim.customer_id||account?.stripe_customer_id||"");
    stage="customer";
    if(customerId){
      const current=await providerRequest(`customers/${encodeURIComponent(customerId)}`);
      if(current.object!=="customer"||current.id!==customerId||current.livemode!==false||
        current.metadata?.warboost_user_id!==user.id)
        throw billingError("TEST_CUSTOMER_MISMATCH","Le client Stripe TEST n’est pas lié au compte connecté.",409);
    }else{
      const customer=await providerRequest("customers",{method:"POST",params:{
        "metadata[warboost_user_id]":user.id,
        ...(user.email?{email:String(user.email).slice(0,254)}:{})
      },idempotencyKey:`wb-test-setup-customer-${attemptId}`});
      if(customer.object!=="customer"||customer.livemode!==false||customer.metadata?.warboost_user_id!==user.id)
        throw billingError("TEST_CUSTOMER_MODE_MISMATCH","Le client Stripe créé n’est pas en mode TEST ou n’est pas lié au compte.",502);
      customerId=customer.id;
    }
    stage="database";
    await billingRpc("warboost_link_test_payment_customer",{p_user_id:user.id,p_attempt_id:attemptId,p_customer_id:customerId});
    stage="setup_intent";
    const intent=await providerRequest("setup_intents",{method:"POST",params:{
      customer:customerId,usage:"off_session","payment_method_types[0]":"card",
      "metadata[warboost_user_id]":user.id,"metadata[warboost_setup_attempt_id]":attemptId,
      "metadata[billing_country]":country,"metadata[test_consent_version]":TEST_SUBSCRIPTION_CONSENT_VERSION
    },idempotencyKey:`wb-test-setup-intent-${attemptId}`});
    if(intent.object!=="setup_intent"||intent.livemode!==false||intent.customer!==customerId||
      intent.metadata?.warboost_user_id!==user.id||intent.metadata?.warboost_setup_attempt_id!==attemptId||
      !intent.id||!intent.client_secret)
      throw billingError("TEST_SETUP_MODE_MISMATCH","Stripe n’a pas confirmé la création d’une préparation TEST.",502);
    stage="database";
    await billingRpc("warboost_finish_test_payment_setup",{p_user_id:user.id,p_attempt_id:attemptId,
      p_customer_id:customerId,p_setup_intent_id:intent.id});
    const attempt=await getAttempt(user.id);
    stage="setup_intent_verify";
    return {...await setupResponse(attempt),diagnostic:setupDiagnostic("setup_intent_ready",startedAt)};
  }catch(error){
    if(error&&typeof error==="object"){
      error.diagnosticStage=stage;
      error.diagnosticElapsedMs=setupDiagnostic(stage,startedAt).elapsed_ms;
    }
    throw error;
  }
}

async function invoiceForSubscription(subscription){
  const invoiceId=idOf(subscription?.latest_invoice);
  if(!invoiceId)throw billingError("TEST_INVOICE_MISSING","La facture TEST n’est pas disponible; aucun paiement ne peut être confirmé.",502);
  const invoice=subscription.latest_invoice&&typeof subscription.latest_invoice==="object"?
    subscription.latest_invoice:await providerRequest(`invoices/${encodeURIComponent(invoiceId)}?expand[0]=payment_intent`);
  const paymentIntent=invoice.payment_intent&&typeof invoice.payment_intent==="object"?
    invoice.payment_intent:null;
  return {invoice,paymentIntent};
}
function verifyPendingInvoice(invoice,paymentIntent,subscription,attempt,userId){
  const allowedPiStatus=new Set(["requires_payment_method","requires_action","requires_confirmation"]);
  const taxAmounts=Array.isArray(invoice.total_tax_amounts)?invoice.total_tax_amounts:[];
  const taxSum=taxAmounts.reduce((sum,row)=>sum+(Number.isInteger(row?.amount)&&row.amount>=0?row.amount:NaN),0);
  if(invoice.object!=="invoice"||invoice.livemode!==false||invoice.status!=="open"||
    invoice.currency!=="eur"||invoice.amount_due!==PRO_PLAN.amount||invoice.total!==PRO_PLAN.amount||
    invoice.automatic_tax?.enabled!==true||invoice.automatic_tax?.status!=="complete"||
    !Number.isInteger(taxSum)||idOf(invoice.customer)!==attempt.stripe_customer_id||
    idOf(invoice.subscription)!==subscription.id||subscription.status!=="incomplete"||
    subscription.livemode!==false||idOf(subscription.customer)!==attempt.stripe_customer_id||
    subscription.metadata?.warboost_user_id!==userId||
    subscription.metadata?.warboost_setup_attempt_id!==attempt.attempt_id||
    subscription.metadata?.billing_country!==attempt.billing_country||
    !paymentIntent||paymentIntent.object!=="payment_intent"||paymentIntent.livemode!==false||
    paymentIntent.status==="succeeded"||!allowedPiStatus.has(paymentIntent.status)||
    paymentIntent.currency!=="eur"||paymentIntent.amount!==PRO_PLAN.amount||
    typeof paymentIntent.client_secret!=="string"||!paymentIntent.client_secret)
    throw billingError("TEST_INVOICE_NOT_READY","La facture ou le calcul fiscal TEST n’est pas vérifiable à 4,99 € TTC. Aucun paiement ne peut être confirmé.",409);
  const item=subscription.items?.data?.[0];
  if(subscription.items?.has_more===true||subscription.items?.data?.length!==1||item?.quantity!==1||
     !priceMatches(item.price,"test")||!["inclusive","unspecified"].includes(item.price?.tax_behavior))
    throw billingError("TEST_SUBSCRIPTION_PRICE_MISMATCH","L’abonnement TEST ne correspond pas au prix PRO mensuel TTC attendu.",409);
  return paymentIntent;
}
async function cancelUnconfirmedSubscription(subscription,attempt,userId){
  if(subscription?.status!=="incomplete"||subscription?.livemode!==false||
    subscription?.metadata?.warboost_user_id!==userId||
    subscription?.metadata?.warboost_setup_attempt_id!==attempt.attempt_id)
    throw billingError("TEST_SUBSCRIPTION_CLEANUP_REQUIRED","La préparation TEST n’est pas annulée automatiquement; ne confirmez aucun paiement et contactez le support.",502);
  const canceled=await providerRequest(`subscriptions/${encodeURIComponent(subscription.id)}`,{
    method:"DELETE",params:{invoice_now:"false",prorate:"false"},
    idempotencyKey:`wb-test-cancel-unverified-${attempt.attempt_id}`
  });
  if(canceled?.livemode!==false||canceled?.status!=="canceled")
    throw billingError("TEST_SUBSCRIPTION_CLEANUP_REQUIRED","L’abonnement TEST incomplet n’a pas pu être annulé; aucun secret de paiement n’a été transmis.",502);
  await billingRpc("warboost_abort_test_subscription",{p_user_id:userId,p_attempt_id:attempt.attempt_id,p_subscription_id:subscription.id});
}
async function retrieveAndVerifyPending(subscriptionId,attempt,userId){
  const subscription=await providerRequest(`subscriptions/${encodeURIComponent(subscriptionId)}?expand[0]=latest_invoice.payment_intent`);
  if(subscription.id!==subscriptionId||idOf(subscription.customer)!==attempt.stripe_customer_id||
    subscription.metadata?.warboost_user_id!==userId||subscription.metadata?.warboost_setup_attempt_id!==attempt.attempt_id)
    throw billingError("TEST_SUBSCRIPTION_MISMATCH","L’abonnement TEST n’est pas lié au compte connecté.",409);
  const {invoice,paymentIntent}=await invoiceForSubscription(subscription);
  const pi=verifyPendingInvoice(invoice,paymentIntent,subscription,attempt,userId);
  return {subscription,invoice,paymentIntent:pi};
}

export async function prepareTestSubscriptionPayment(user,{setupIntentId,billingCountry,consent}={}){
  if(!testConsentOk(consent))throw billingError("TEST_SUBSCRIPTION_CONSENT_REQUIRED","Confirmez explicitement l’abonnement de test mensuel avant de continuer.",428);
  const attempt=await getAttempt(user.id);
  if(attempt.state!=="setup_pending"&&attempt.state!=="subscription_creating"&&attempt.state!=="payment_pending")
    throw attemptError();
  if(!setupIntentId||setupIntentId!==attempt.setup_intent_id)throw attemptError();
  const setup=await providerRequest(`setup_intents/${encodeURIComponent(setupIntentId)}`);
  const paymentMethodId=verifySetupIntent(setup,attempt,user.id);
  const paymentMethod=await providerRequest(`payment_methods/${encodeURIComponent(paymentMethodId)}`);
  const actualCountry=normalizeCountry(paymentMethod.billing_details?.address?.country);
  if(paymentMethod.object!=="payment_method"||paymentMethod.livemode!==false||
    idOf(paymentMethod.customer)!==attempt.stripe_customer_id||!actualCountry||
    actualCountry!==normalizeCountry(attempt.billing_country)||
    actualCountry!==normalizeCountry(billingCountry))
    throw billingError("TEST_BILLING_COUNTRY_MISMATCH","Le pays de facturation retourné par Stripe ne correspond pas au pays autorisé sélectionné. Aucun abonnement n’a été créé.",403);
  assertFlowReady(actualCountry);
  const price=await ensureTestProPrice();
  if(!priceMatches(price,"test"))throw billingError("PRO_PRICE_MISMATCH","Le prix TEST ne correspond pas à WarBoost PRO.",409);

  const claimed=await billingRpc("warboost_claim_test_subscription",{p_user_id:user.id,
    p_attempt_id:attempt.attempt_id,p_setup_intent_id:setupIntentId});
  mapClaimState(claimed?.state);
  if(claimed.state==="payment_pending"||claimed.state==="complete"){
    if(!claimed.subscription_id)throw attemptError();
    const pending=await retrieveAndVerifyPending(claimed.subscription_id,attempt,user.id);
    const setup=await providerRequest(`setup_intents/${encodeURIComponent(setupIntentId)}`);
    const pmId=verifySetupIntent(setup,attempt,user.id);
    return paymentResponse(attempt,pending,pmId);
  }
  if(!["creating","retry"].includes(claimed.state)||!claimed.attempt_id)throw attemptError();

  const existing=await providerRequest(`subscriptions?customer=${encodeURIComponent(attempt.stripe_customer_id)}&status=all&limit=100`);
  if(existing.has_more===true||!Array.isArray(existing.data))
    throw billingError("TEST_SUBSCRIPTION_LOOKUP_INCOMPLETE","Impossible de vérifier les abonnements TEST existants; aucun nouvel abonnement n’a été créé.",503);
  const sameAttempt=existing.data.find(sub=>sub.metadata?.warboost_setup_attempt_id===attempt.attempt_id&&
    sub.metadata?.warboost_user_id===user.id&&idOf(sub.customer)===attempt.stripe_customer_id);
  const unrelated=existing.data.find(sub=>!["canceled","incomplete_expired"].includes(sub.status)&&
    sub.id!==claimed.subscription_id&&sub.id!==sameAttempt?.id);
  if(unrelated)throw billingError("PRO_SUBSCRIPTION_EXISTS","Un abonnement Stripe existe déjà. Aucun abonnement supplémentaire n’a été créé.",409);

  let subscription=claimed.subscription_id?await providerRequest(
    `subscriptions/${encodeURIComponent(claimed.subscription_id)}?expand[0]=latest_invoice.payment_intent`
  ):null;
  if(!subscription&&sameAttempt)
    subscription=await providerRequest(`subscriptions/${encodeURIComponent(sameAttempt.id)}?expand[0]=latest_invoice.payment_intent`);
  if(!subscription){
    subscription=await providerRequest("subscriptions",{method:"POST",params:{
      customer:attempt.stripe_customer_id,
      "items[0][price]":testPriceId(),
      "items[0][quantity]":"1",
      collection_method:"charge_automatically",
      payment_behavior:"default_incomplete",
      default_payment_method:paymentMethodId,
      "automatic_tax[enabled]":"true",
      "metadata[user_id]":user.id,
      "metadata[warboost_user_id]":user.id,
      "metadata[warboost_setup_attempt_id]":attempt.attempt_id,
      "metadata[billing_country]":actualCountry,
      "expand[0]":"latest_invoice.payment_intent"
    },idempotencyKey:`wb-test-subscription-${attempt.attempt_id}`});
  }
  const paymentIntentId=idOf(subscription.latest_invoice?.payment_intent)||null;
  await billingRpc("warboost_record_test_subscription",{p_user_id:user.id,p_attempt_id:attempt.attempt_id,
    p_subscription_id:subscription.id,p_payment_intent_id:paymentIntentId});
  try{
    if(subscription.object!=="subscription"||subscription.livemode!==false||
      subscription.status!=="incomplete"||idOf(subscription.customer)!==attempt.stripe_customer_id||
      subscription.metadata?.warboost_user_id!==user.id||
      subscription.metadata?.warboost_setup_attempt_id!==attempt.attempt_id||
      subscription.metadata?.billing_country!==actualCountry)
      throw billingError("TEST_SUBSCRIPTION_CREATE_MISMATCH","Stripe n’a pas confirmé un abonnement incomplet en mode TEST.",502);
    const {invoice,paymentIntent}=await invoiceForSubscription(subscription);
    verifyPendingInvoice(invoice,paymentIntent,subscription,attempt,user.id);
    await billingRpc("warboost_finish_test_subscription",{p_user_id:user.id,p_attempt_id:attempt.attempt_id,
      p_subscription_id:subscription.id,p_payment_intent_id:paymentIntent.id});
    return paymentResponse(attempt,{subscription,invoice,paymentIntent},paymentMethodId);
  }catch(error){
    if(subscription?.status==="incomplete"){
      await cancelUnconfirmedSubscription(subscription,attempt,user.id);
    }
    throw error;
  }
}
function paymentResponse(attempt,{subscription,invoice,paymentIntent},paymentMethodId){
  if(subscription.status!=="incomplete"||paymentIntent.status==="succeeded")
    throw billingError("TEST_PAYMENT_ALREADY_PROCESSED","Le paiement TEST a déjà été traité. Actualisez votre statut PRO.",409);
  return {test:true,live:false,mode:"test",state:"payment_confirmation_required",
    setup_intent_id:attempt.setup_intent_id,subscription_id:subscription.id,payment_intent_id:paymentIntent.id,
    payment_method_id:paymentMethodId,
    payment_client_secret:paymentIntent.client_secret,amount_due:invoice.amount_due,currency:invoice.currency,
    consent_version:attempt.consent_version};
}

export async function cancelTestPendingSubscription(user){
  const attempt=await getAttempt(user.id);
  if(attempt.state==="canceled")return {test:true,live:false,mode:"test",state:"canceled"};
  if(attempt.state!=="payment_pending"||!attempt.subscription_id)
    throw billingError("TEST_SUBSCRIPTION_NOT_CANCELABLE","Aucun paiement TEST en attente ne peut être annulé.",409);
  const subscription=await providerRequest(`subscriptions/${encodeURIComponent(attempt.subscription_id)}?expand[0]=latest_invoice.payment_intent`);
  if(subscription.livemode!==false||subscription.id!==attempt.subscription_id||
    subscription.metadata?.warboost_user_id!==user.id||subscription.metadata?.warboost_setup_attempt_id!==attempt.attempt_id||
    subscription.status!=="incomplete")
    throw billingError("TEST_SUBSCRIPTION_NOT_CANCELABLE","Seul un abonnement TEST incomplet sans paiement confirmé peut être annulé ici.",409);
  const {paymentIntent}=await invoiceForSubscription(subscription);
  if(!paymentIntent||paymentIntent.status==="succeeded")
    throw billingError("TEST_SUBSCRIPTION_NOT_CANCELABLE","Un paiement est déjà confirmé; utilisez le portail client TEST pour gérer l’abonnement.",409);
  const canceled=await providerRequest(`subscriptions/${encodeURIComponent(subscription.id)}`,{
    method:"DELETE",params:{invoice_now:"false",prorate:"false"},
    idempotencyKey:`wb-test-cancel-${attempt.attempt_id}`
  });
  if(canceled?.livemode!==false||canceled?.id!==subscription.id||canceled?.status!=="canceled")
    throw billingError("TEST_SUBSCRIPTION_CANCEL_UNCONFIRMED","Stripe n’a pas confirmé l’annulation de l’abonnement TEST.",502);
  await billingRpc("warboost_cancel_test_payment_attempt",{p_user_id:user.id,p_attempt_id:attempt.attempt_id,p_subscription_id:subscription.id});
  return {test:true,live:false,mode:"test",state:"canceled"};
}
