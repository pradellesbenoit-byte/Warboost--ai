import {requireUser} from "../lib/auth.js";
import {betaAccessForUserAsync} from "../lib/beta-access.js";
import {entitlementForUser} from "../lib/pro-access.js";
import {billingRow} from "../lib/billing-store.js";
import {commercialConfig,commercialStatusForUser,createCheckoutForUser,createLiveCheckoutForUser,createPortalForUser,
  createLivePortalForUser,processWebhook,processLiveWebhook,readJsonRequestBody,readRawBody,paymentWebhookSignature} from "../lib/commercial-pro.js";

// Safe Launch defaults to OFF. Only explicit TEST mode can contact Stripe; LIVE is hard-blocked.
// Preserve the exact signed bytes (Vercel and local server).
export const config={api:{bodyParser:false}};

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  const commerce=commercialConfig();
  try{
    // TEST and LIVE webhooks remain separate and always verify the original signed bytes.
    if(req.method==="POST"&&String(req.query?.action||"")==="webhook"){
      const raw=await readRawBody(req),signature=paymentWebhookSignature(req);
      const webhookMode=String(req.query?.mode||"test");
      const result=webhookMode==="test"?await processWebhook(raw,signature):
        webhookMode==="live"?await processLiveWebhook(raw,signature):null;
      if(!result)return res.status(400).json({ok:false,error:"INVALID_WEBHOOK_MODE"});
      return res.status(200).json(result);
    }

    const user=await requireUser(req),beta=await betaAccessForUserAsync(user);
    if(req.method==="GET"){
      const entitlement=await entitlementForUser(user,{beta});
       let account=null;
       if(entitlement.schema_ready){
         try{account=await billingRow(commerce.mode==="live"?"warboost_live_billing_accounts":"warboost_billing_accounts","user_id",user.id)}
         catch(e){if(e.code!=="COMMERCIAL_SCHEMA_MISSING")throw e}
       }
      return res.status(200).json({
        ok:true,beta:entitlement.source==="beta",release:true,safe_launch:true,commercial:true,
        configured:commerce.configured&&entitlement.schema_ready,enforced:true,allowed:true,
        beta_configured:beta.configured,alliance_beta_allowed:beta.allowed,
         beta_access_status:beta.access_status,beta_code_eligible:beta.code_eligible===true&&entitlement.source!=="beta",
        consent_version:beta.consent_version,access_status:entitlement.source==="beta"?"beta-granted":"account",
        active:entitlement.active,status:entitlement.source==="beta"?"beta":entitlement.subscription?.status||"free",
         plan:commerce.plan,payments_enabled:commerce.payments_enabled,test_payments_enabled:commerce.test_payments_enabled&&entitlement.schema_ready,
         live_payments_enabled:commerce.live_payments_enabled&&entitlement.schema_ready,portal_enabled:commerce.portal_enabled&&Boolean(account?.stripe_customer_id),
        pro_included:entitlement.source==="beta",entitlement,subscription:entitlement.subscription,can_manage_billing:Boolean(account?.stripe_customer_id),
        commercial_preview:commerce.mode!=="test",mode:commerce.mode,activation_requirements:commerce.activation_requirements
      });
    }

    if(req.method==="POST"){
      if(!["test","live"].includes(commerce.mode))return res.status(403).json({
        ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",
        message:"Les paiements WarBoost sont désactivés tant que le mode et ses prérequis ne sont pas explicitement validés."
      });
      const body=await readJsonRequestBody(req),action=String(body?.action||"").toLowerCase();
      if(action==="checkout"){
        const entitlement=await entitlementForUser(user,{beta});
        if(entitlement.source==="beta")return res.status(409).json({ok:false,error:"BETA_PRO_INCLUDED",message:"Votre accès PRO bêta reste gratuit. Aucun abonnement nécessaire."});
        const result=commerce.mode==="live"?await createLiveCheckoutForUser(user,{consentVersion:body?.consent_version}):await createCheckoutForUser(user);
        return res.status(200).json({ok:true,...result});
      }
      if(action==="portal")return res.status(200).json({ok:true,...(commerce.mode==="live"?await createLivePortalForUser(user):await createPortalForUser(user))});
      return res.status(400).json({ok:false,error:"unknown_pro_action"});
    }
    return res.status(405).json({error:"method_not_allowed"});
  }catch(e){
    return res.status(e?.status||500).json({error:e?.code||"pro_error",message:e?.message||"WarBoost PRO error",requirements:e?.requirements||undefined});
  }
}
