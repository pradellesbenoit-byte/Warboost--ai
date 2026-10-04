import {requireUser} from "./auth.js";
import {betaAccessForUserAsync,BETA_CONSENT_VERSION} from "./beta-access.js";
import {billingRow,billingRpc,billingError,billingDatabaseConfigured} from "./billing-store.js";
import {commercialConfig,getSubscription,subscriptionActive} from "./commercial-pro.js";

export async function entitlementForUser(user,{beta=null}={}){
  if(!user?.id)throw billingError("AUTH_REQUIRED","Connexion requise.",401);
  const cfg=commercialConfig();
  let grant=null,sub=null,schemaMissing=false;
  if(billingDatabaseConfigured()){
    try{[grant,sub]=await Promise.all([billingRow("warboost_pro_grants","user_id",user.id),getSubscription(user.id)])}
    catch(e){if(e.code!=="COMMERCIAL_SCHEMA_MISSING")throw e;schemaMissing=true}
  }else schemaMissing=true;
  if(!grant&&!schemaMissing){
    beta=beta||await betaAccessForUserAsync(user);
    // SQL enforces the frozen cutoff and invitation date. Legacy membership is verified server-side.
    if(beta.allowed)grant=await billingRpc("warboost_claim_existing_beta_grant",{p_user_id:user.id,p_verified_legacy:["legacy-env","support-admin"].includes(beta.invite_source)});
  }
  const betaActive=grant?.grant_type==="beta"&&!grant.revoked_at&&Date.parse(grant.starts_at)<=Date.now()&&(!grant.expires_at||Date.parse(grant.expires_at)>Date.now());
  // Preserve today's beta if migrations haven't been applied; never use this fallback in Stripe TEST.
  if(schemaMissing&&cfg.mode!=="test"){beta=beta||await betaAccessForUserAsync(user)}
  const legacyFallback=schemaMissing&&cfg.mode!=="test"&&beta?.allowed===true;
  const stripeActive=subscriptionActive(sub);
  const source=betaActive||legacyFallback?"beta":stripeActive?"stripe":"free";
  return {tier:source==="beta"?"BETA_FREE":source==="stripe"?"PRO_PAID":"FREE",active:source!=="free",source,
    reason:source==="beta"?(legacyFallback?"beta_migration_pending":"beta_grant"):source==="stripe"?"stripe_test_subscription":sub?.status||"no_grant",
    persistent:!legacyFallback,billing_test:source==="stripe",schema_ready:!schemaMissing,
    subscription:sub?{plan:sub.plan,status:sub.status,cancel_at_period_end:Boolean(sub.cancel_at_period_end),current_period_end:sub.current_period_end}:null};
}
export async function requireProductUser(req,{consent=false,pro=false,trace}={}){
  const user=await requireUser(req);
  if(consent&&String(req.headers?.["x-warboost-beta-consent"]||"")!==BETA_CONSENT_VERSION)
    throw billingError("BETA_CONSENT_REQUIRED","Consentement aux traitements cloud/IA requis.",428);
  const entitlement=pro?await entitlementForUser(user):null;
  if(pro&&!entitlement.active)throw billingError("PRO_REQUIRED","WarBoost PRO ou un droit bêta gratuit actif est requis.",403);
  if(trace)trace({stage:"AUTH_USER",status:"ok",ms:0});
  return {user,entitlement};
}