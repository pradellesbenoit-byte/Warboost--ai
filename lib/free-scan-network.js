import {createHmac} from "node:crypto";
import {isIP} from "node:net";

// Never trust x-forwarded-for or any body-provided address. Vercel must overwrite
// x-vercel-forwarded-for; otherwise use the direct connection, or fail closed.
export function freeScanNetworkDigest(req,{vercel=process.env.VERCEL==="1",
 secret=process.env.WARBOOST_FREE_IP_HASH_SECRET,now=Date.now()}={}){
  if(typeof secret!=="string"||secret.length<32)throw Object.assign(new Error("FREE scan network protection is not configured."),{status:503,code:"FREE_NETWORK_GUARD_REQUIRED"});
  const ip=String(vercel?req.headers?.["x-vercel-forwarded-for"]||"":req.socket?.remoteAddress||"").trim().toLowerCase();
  if(!isIP(ip))throw Object.assign(new Error("Cannot verify the scan network origin."),{status:503,code:"FREE_NETWORK_GUARD_REQUIRED"});
  return createHmac("sha256",secret).update(`${new Date(now).toISOString().slice(0,10)}|${ip}`).digest("hex");
}
