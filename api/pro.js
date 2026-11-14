import {requireUser} from "../lib/auth.js";
import {betaAccessForUserAsync} from "../lib/beta-access.js";
import {entitlementForUser} from "../lib/pro-access.js";
import {billingRow} from "../lib/billing-store.js";
import {commercialConfig,commercialStatusForUser,createCheckoutForUser,createPortalForUser,processWebhook,readRawBody,paymentWebhookSignature} from "../lib/commercial-pro.js";

// Safe Launch defaults to OFF. TEST and LIVE use separate credentials and storage.
// Preserve the exact signed bytes (Vercel and local server).
export const config={api:{bodyParser:false}};

function jsonBody(raw){try{return raw?JSON.parse(raw):{}}catch{return {}}}
async function postJsonBody(req){
  const parsed=req.body;
  if(parsed&&typeof parsed==="object"&&!Buffer.isBuffer(parsed)&&!Array.isArray(parsed))return parsed;
  return jsonBody(await readRawBody(req));
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  const commerce=commercialConfig();
  try{
    // TEST and LIVE webhooks are explicitly selected and independently verified.
    if(req.method==="POST"&&String(req.query?.action||"")==="webhook"){
      const webhookMode=String(req.query?.mode||"")==="live"?"live":"test";
      if(webhookMode==="live"?!commerce.live_webhooks_enabled:commerce.mode!=="test")
        return res.status(403).json({ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",message:"Canal de webhook Stripe désactivé ou non configuré."});
      const raw=await readRawBody(req),signature=paymentWebhookSignature(req);
      const result=await processWebhook(raw,signature,webhookMode);return res.status(200).json(result);
    }

    const user=await requireUser(req),beta=await betaAccessForUserAsync(user);
    if(req.method==="GET"){
      const entitlement=await entitlementForUser(user,{beta});
        const account=entitlement.schema_ready?await billingRow("warboost_billing_accounts","user_id",user.id):null;
      return res.status(200).json({
        ok:true,beta:entitlement.source==="beta",release:true,safe_launch:true,commercial:true,
        configured:commerce.configured&&entitlement.schema_ready,enforced:true,allowed:true,
        beta_configured:beta.configured,alliance_beta_allowed:beta.allowed,
        beta_access_status:beta.account_access_allowed&&!beta.allowed?"preview-account":beta.access_status,
        account_access_allowed:beta.account_access_allowed===true,
        beta_code_eligible:!beta.account_access_allowed&&beta.code_eligible===true&&entitlement.source!=="beta",
        consent_version:beta.consent_version,access_status:entitlement.source==="beta"?"beta-granted":"account",
        active:entitlement.active,status:entitlement.source==="beta"?"beta":entitlement.subscription?.status||"free",
         plan:commerce.plan,payments_enabled:commerce.live_payments_enabled&&entitlement.schema_ready,
         test_payments_enabled:commerce.test_payments_enabled&&entitlement.schema_ready,
         live_payments_enabled:commerce.live_payments_enabled&&entitlement.schema_ready,live_provider_ready:commerce.live_provider_ready&&entitlement.schema_ready,
         live_webhooks_enabled:commerce.live_webhooks_enabled,
         commercial_consent_version:commerce.commercial_consent_version,terms_url:commerce.terms_url,privacy_url:commerce.privacy_url,
         test_checkout_enabled:commerce.test_checkout_enabled,
         test_approved_billing_countries:commerce.test_approved_billing_countries,
         live_approved_billing_countries:commerce.activation_requirements.live.approved_billing_countries,
         pro_included:entitlement.source==="beta",entitlement,subscription:entitlement.subscription,
         can_manage_billing:Boolean(account?.stripe_customer_id||account?.stripe_live_customer_id),
         commercial_preview:commerce.mode!=="test",mode:commerce.mode,activation_requirements:commerce.activation_requirements
      });
    }

    if(req.method==="POST"){
      const body=await postJsonBody(req),action=String(body?.action||"").toLowerCase();
      if(action==="checkout"){
        const entitlement=await entitlementForUser(user,{beta});
        if(entitlement.source==="beta")return res.status(409).json({ok:false,error:"BETA_PRO_INCLUDED",message:"Votre accès PRO bêta reste gratuit. Aucun abonnement nécessaire."});
        if(commerce.mode==="test"&&commerce.test_payments_enabled)
          return res.status(200).json({ok:true,...await createCheckoutForUser(user,{mode:"test",billingCountry:body.billing_country})});
        if(commerce.mode==="live"&&commerce.live_payments_enabled)
          return res.status(200).json({ok:true,...await createCheckoutForUser(user,{mode:"live",commercialConsent:body,billingCountry:body.billing_country})});
        return res.status(403).json({ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",message:"Les paiements sont désactivés tant que les prérequis commerciaux LIVE ne sont pas vérifiés."});
      }
      if(action==="portal"){
        if(commerce.mode==="test"&&commerce.test_payments_enabled)return res.status(200).json({ok:true,...await createPortalForUser(user,{mode:"test"})});
        if(commerce.mode==="live"&&commerce.live_provider_ready)return res.status(200).json({ok:true,...await createPortalForUser(user,{mode:"live"})});
        return res.status(403).json({ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",message:"Le portail de facturation n’est pas configuré pour cet environnement."});
      }
      return res.status(400).json({ok:false,error:"unknown_pro_action"});
    }
    return res.status(405).json({error:"method_not_allowed"});
  }catch(e){
    return res.status(e?.status||500).json({error:e?.code||"pro_error",message:e?.message||"WarBoost PRO error",requirements:e?.requirements||undefined});
  }
}
