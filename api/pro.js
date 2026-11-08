import {requireUser} from "../lib/auth.js";
import {assertFreeAccount} from "../lib/free-access.js";
import {betaAccessForUserAsync} from "../lib/beta-access.js";
import {entitlementForUser} from "../lib/pro-access.js";
import {commercialConfig,commercialStatusForUser,billingAccountForUser,createCheckoutForUser,createPortalForUser,processWebhook,readRawBody,paymentWebhookSignature} from "../lib/commercial-pro.js";

// Safe Launch defaults to OFF. Only explicit TEST mode can contact Stripe; LIVE is hard-blocked.
// Preserve the exact signed bytes (Vercel and local server).
export const config={api:{bodyParser:false}};

function jsonBody(raw){try{return raw?JSON.parse(raw):{}}catch{return {}}}
function parsedJsonObject(body){
  return body!==null&&typeof body==="object"&&!Array.isArray(body)&&!Buffer.isBuffer(body)?body:null;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  const commerce=commercialConfig();
  try{
    // Signed TEST/LIVE webhook endpoint: /api/pro?action=webhook.
    if(req.method==="POST"&&String(req.query?.action||"")==="webhook"){
      if(!["test","live"].includes(commerce.mode))return res.status(403).json({ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",message:"Les paiements sont désactivés."});
      const raw=await readRawBody(req),signature=paymentWebhookSignature(req);
      const result=await processWebhook(raw,signature,commerce.mode);return res.status(200).json(result);
    }

    const user=assertFreeAccount(await requireUser(req)),beta=await betaAccessForUserAsync(user);
    if(req.method==="GET"){
      const [entitlement,commercial]=await Promise.all([entitlementForUser(user,{beta}),commercialStatusForUser(user)]);
      const account=commercial.portal_enabled?await billingAccountForUser(user.id):null;
      return res.status(200).json({
        ok:true,beta:entitlement.source==="beta",release:true,safe_launch:true,commercial:true,
        configured:commercial.configured&&entitlement.schema_ready,enforced:true,allowed:true,
        beta_configured:beta.configured,alliance_beta_allowed:beta.allowed,
         beta_access_status:beta.access_status,beta_code_eligible:false,open_registration:true,
        beta_consent_version:beta.consent_version,access_status:entitlement.source==="beta"?"beta-granted":"account",
        active:entitlement.active,status:entitlement.source==="beta"?"beta":entitlement.subscription?.status||"free",
        plan:commerce.plan,payments_enabled:commercial.payments_enabled,
        test_payments_enabled:commerce.test_payments_enabled&&entitlement.schema_ready,
        live_payments_enabled:commercial.payments_enabled,live_schema_ready:commercial.live_schema_ready,
        live_approved_billing_countries:commercial.live_approved_billing_countries||[],
        adaptive_pricing_enabled:Boolean(commercial.adaptive_pricing_enabled),
        portal_enabled:commercial.portal_enabled,consent_version:commercial.consent_version,
        pro_included:entitlement.source==="beta",entitlement,subscription:entitlement.subscription,can_manage_billing:Boolean(account?.stripe_customer_id),
        commercial_preview:commercial.mode!=="test",mode:commercial.mode,activation_requirements:commercial.activation_requirements
      });
    }

    if(req.method==="POST"){
      const body=parsedJsonObject(req.body)||jsonBody(await readRawBody(req)),action=String(body?.action||"").toLowerCase();
      if(!["test","live"].includes(commerce.mode))return res.status(403).json({
        ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",
        message:"WarBoost PRO billing is disabled until its server configuration is verified."
      });
      if(action==="checkout"){
        const entitlement=await entitlementForUser(user,{beta});
        if(entitlement.source==="beta")return res.status(409).json({ok:false,error:"BETA_PRO_INCLUDED",message:"Votre accès PRO bêta reste gratuit. Aucun abonnement nécessaire."});
        return res.status(200).json({ok:true,...await createCheckoutForUser(user,{
          consentVersion:body?.consent_version,billingCountry:body?.billing_country,locale:body?.locale
        })});
      }
      if(action==="portal")return res.status(200).json({ok:true,...await createPortalForUser(user)});
      return res.status(400).json({ok:false,error:"unknown_pro_action"});
    }
    return res.status(405).json({error:"method_not_allowed"});
  }catch(e){
    return res.status(e?.status||500).json({error:e?.code||"pro_error",message:e?.message||"WarBoost PRO error",requirements:e?.requirements||undefined});
  }
}
