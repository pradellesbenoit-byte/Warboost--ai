import {configured} from "../lib/supabase.js";
import {providerConfig} from "../lib/provider.js";
export default function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const providers=providerConfig();
  res.status(200).json({
    ok:true,
    app:"WarBoost",
    version:"1.4.0",
    mode:"approval-first-api-ready",
    database:configured()?"ready":"local-fallback",
    lastwar_official_access:providers.official?"configured":providers.approved?"approved-connector":"pending-approval",
    legacy_provider:providers.legacy?"explicitly-enabled":"disabled",
    vision:Boolean(process.env.OPENAI_API_KEY||process.env.WARBOOST_VISION_ENDPOINT)?"configured":"optional",
    languages:["fr","en-GB","en-US","es","de","ja","zh","ar"],
    safeguards:{read_only:true,player_consent:true,unauthorized_source_default:false},
    serverless_functions:12
  })
}
