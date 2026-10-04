import {requireUser} from "../lib/auth.js";
import {betaAccessForUserAsync} from "../lib/beta-access.js";
import {entitlementForUser} from "../lib/pro-access.js";
import {billingRow} from "../lib/billing-store.js";
import {commercialConfig,commercialStatusForUser,createCheckoutForUser,createPortalForUser,processWebhook,readRawBody,paymentWebhookSignature} from "../lib/commercial-pro.js";

// Safe Launch defaults to OFF. Only explicit TEST mode can contact Stripe; LIVE is hard-blocked.
// Preserve the exact signed bytes (Vercel and local server).
export const config={api:{bodyParser:false}};

function jsonBody(raw){try{return raw?JSON.parse(raw):{}}catch{return {}}}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  const commerce=commercialConfig();
  try{
    // TEST webhook endpoint: /api/pro?action=webhook.
    if(req.method==="POST"&&String(req.query?.action||"")==="webhook"){
      if(commerce.mode!=="test")return res.status(403).json({ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",message:"Stripe TEST uniquement ; paiements réels désactivés."});
      const raw=await readRawBody(req),signature=paymentWebhookSignature(req);
      const result=await processWebhook(raw,signature);return res.status(200).json(result);
    }

    const user=await requireUser(req),beta=await betaAccessForUserAsync(user);
    if(req.method==="GET"){
      const entitlement=await entitlementForUser(user,{beta});
      const account=entitlement.schema_ready?await billingRow("warboost_billing_accounts","user_id",user.id):null;
      return res.status(200).json({
        ok:true,beta:entitlement.source==="beta",release:true,safe_launch:true,commercial:true,
        configured:commerce.configured&&entitlement.schema_ready,enforced:true,allowed:true,
        beta_configured:beta.configured,alliance_beta_allowed:beta.allowed,
        consent_version:beta.consent_version,access_status:entitlement.source==="beta"?"beta-granted":"account",
        active:entitlement.active,status:entitlement.source==="beta"?"beta":entitlement.subscription?.status||"free",
        plan:commerce.plan,payments_enabled:false,test_payments_enabled:commerce.test_payments_enabled&&entitlement.schema_ready,
        pro_included:entitlement.source==="beta",entitlement,subscription:entitlement.subscription,can_manage_billing:Boolean(account?.stripe_customer_id),
        commercial_preview:commerce.mode!=="test",mode:commerce.mode,activation_requirements:commerce.activation_requirements
      });
    }

    if(req.method==="POST"){
      if(commerce.mode!=="test")return res.status(403).json({
        ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",
        message:"WarBoost payments are disabled in the Safe Launch beta. PRO features are included for invited testers."
      });
      const raw=await readRawBody(req),body=jsonBody(raw),action=String(body?.action||"").toLowerCase();
      if(action==="checkout"){
        const entitlement=await entitlementForUser(user,{beta});
        if(entitlement.source==="beta")return res.status(409).json({ok:false,error:"BETA_PRO_INCLUDED",message:"Votre accès PRO bêta reste gratuit. Aucun abonnement nécessaire."});
        return res.status(200).json({ok:true,...await createCheckoutForUser(user)});
      }
      if(action==="portal")return res.status(200).json({ok:true,...await createPortalForUser(user)});
      return res.status(400).json({ok:false,error:"unknown_pro_action"});
    }
    return res.status(405).json({error:"method_not_allowed"});
  }catch(e){
    return res.status(e?.status||500).json({error:e?.code||"pro_error",message:e?.message||"WarBoost PRO error",requirements:e?.requirements||undefined});
  }
}
