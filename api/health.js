import {configured,userConfigured} from "../lib/supabase.js";
import {providerConfig} from "../lib/provider.js";
export default function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const providers=providerConfig(),serviceDb=configured(),userDb=userConfigured();
  res.status(200).json({
    ok:true,app:"WarBoost",version:"1.4.6",mode:"approval-first-api-ready",database:(serviceDb||userDb)?"ready":"local-fallback",database_access:serviceDb?"service+user-rls":userDb?"user-rls":"local-only",lastwar_official_access:providers.official?"configured":providers.approved?"approved-connector":"pending-approval",legacy_provider:providers.legacy?"explicitly-enabled":"disabled",vision:Boolean(process.env.OPENAI_API_KEY||process.env.WARBOOST_VISION_ENDPOINT)?"configured":"optional",languages:["fr","en-GB","en-US","es","de","ja","zh","ar"],safeguards:{read_only:true,player_consent:true,unauthorized_source_default:false,user_scoped_cloud:true,no_placeholder_hero_names:true,hero_identity_confirmation:true,double_pass_portrait_verification:true,hero_names_staged_until_confirmation:true,localized_scan_rendering:true},serverless_functions:12
  })
}
