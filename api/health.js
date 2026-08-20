import {configured} from "../lib/supabase.js";
export default function handler(req,res){res.setHeader("Cache-Control","no-store");res.status(200).json({ok:true,app:"WarBoost V1 Core",version:"1.0.0",database:configured()?"ready":"local-fallback",lastwar_provider:Boolean(process.env.WARBOOST_LASTWAR_PROVIDER_URL)?"configured":"waiting"})}
