import {requireUser} from "../lib/auth.js";
import {betaAccessForUserAsync} from "../lib/beta-access.js";
import {commercialConfig,commercialStatusForUser,createCheckoutForUser,createPortalForUser,processWebhook,readRawBody,paymentWebhookSignature} from "../lib/commercial-pro.js";

// HF8 keeps Safe Launch as the default. Commercial mode is opt-in server-side only.
// Body parsing is disabled so the same serverless function can later verify signed payment webhooks.
export const config={api:{bodyParser:false}};

function jsonBody(raw){try{return raw?JSON.parse(raw):{}}catch{return {}}}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  const commerce=commercialConfig();
  try{
    // Future commercial webhook endpoint: /api/pro?action=webhook.
    // It remains unreachable while WARBOOST_COMMERCIAL_MODE is not explicitly set to live.
    if(req.method==="POST"&&String(req.query?.action||"")==="webhook"){
      if(!commerce.live)return res.status(403).json({ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",message:"WarBoost payments are disabled in the Safe Launch beta."});
      const raw=await readRawBody(req),signature=paymentWebhookSignature(req);
      const result=await processWebhook(raw,signature);return res.status(200).json(result);
    }

    const user=await requireUser(req),beta=await betaAccessForUserAsync(user);
    if(req.method==="GET"){
      // Default beta path: PRO remains free for invited testers and no payment can be initiated.
      if(!commerce.live)return res.status(200).json({
        ok:true,beta:true,release:true,safe_launch:true,configured:false,
        beta_configured:beta.configured,enforced:beta.enforced,allowed:beta.allowed,
        invited_count:beta.invited_count,consent_version:beta.consent_version,
        access_status:beta.access_status,invite_source:beta.invite_source,active:Boolean(beta.allowed),
        status:beta.allowed?"beta":"invite_required",plan:{...commerce.plan},
        payments_enabled:false,pro_included:Boolean(beta.allowed),commercial_preview:true,
        commercial:{mode:commerce.mode,ready:commerce.configured,payments_enabled:false,activation_requirements:commerce.activation_requirements}
      });

      const status=await commercialStatusForUser(user);
      return res.status(200).json({
        ok:true,beta:false,release:true,safe_launch:false,commercial:true,
        configured:status.configured,active:status.active,status:status.status,
        plan:status.plan,payments_enabled:status.payments_enabled,pro_included:false,
        subscription:status.subscription,activation_requirements:status.activation_requirements
      });
    }

    if(req.method==="POST"){
      if(!commerce.live)return res.status(403).json({
        ok:false,error:"SAFE_LAUNCH_PAYMENT_DISABLED",
        message:"WarBoost payments are disabled in the Safe Launch beta. PRO features are included for invited testers."
      });
      const raw=await readRawBody(req),body=jsonBody(raw),action=String(body?.action||"").toLowerCase();
      if(action==="checkout")return res.status(200).json({ok:true,...await createCheckoutForUser(user)});
      if(action==="portal")return res.status(200).json({ok:true,...await createPortalForUser(user)});
      return res.status(400).json({ok:false,error:"unknown_pro_action"});
    }
    return res.status(405).json({error:"method_not_allowed"});
  }catch(e){
    return res.status(e?.status||500).json({error:e?.code||"pro_error",message:e?.message||"WarBoost PRO error",requirements:e?.requirements||undefined});
  }
}
