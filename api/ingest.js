// WarBoost V2.5.25 Safe Launch: external/trusted game-data ingest is not shipped.
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  return res.status(403).json({
    ok:false,error:"SAFE_LAUNCH_INGEST_DISABLED",
    message:"External game-data ingestion is disabled in the WarBoost Safe Launch beta."
  });
}
