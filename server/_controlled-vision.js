// Server-only. The dedicated key is read nowhere else; no fallback provider.
import {createHash,randomUUID} from "node:crypto";
import {fetchWithTimeout} from "../lib/http-timeout.js";
import {assertFreeAccount} from "../lib/free-access.js";
import {BETA_CONSENT_VERSION} from "../lib/beta-access.js";

export const TEST_PROJECT="zaioadmbhqzeihkvdjsd";
export const TEST_BASE=`https://${TEST_PROJECT}.supabase.co`;
export const REVIEW_BRANCH="warboost-free-access-review-20261025";
export const CONTROLLED_TYPES=Object.freeze(["squad1","drone","technology","exclusive"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code,status=503)=>Object.assign(new Error("Controlled Vision unavailable"),{code,status});
function scopedKey(value,role){
  try{
    const claims=JSON.parse(Buffer.from(value.split(".")[1],"base64url").toString("utf8"));
    return claims.ref===TEST_PROJECT&&claims.role===role;
  }catch{return false}
}
// Routing is explicit per request. Server configuration only authorizes the
// experimental path below; it must never reroute ordinary FREE/PRO scans.
export const controlledVisionRequested=req=>req.body?.controlled_vision===true;

export function controlledVisionConfig(env=process.env){
  if(env.WARBOOST_CONTROLLED_VISION!=="on")throw fail("VISION_TEST_OFF");
  if(env.VERCEL_ENV!=="preview"||env.VERCEL_GIT_COMMIT_REF!==REVIEW_BRANCH)
    throw fail("VISION_TEST_OFF");
  let origin;
  try{origin=new URL(env.WARBOOST_VISION_TEST_ORIGIN)}catch{throw fail("VISION_TEST_OFF")}
  // Exact, dedicated Vercel deployment origin, not a path/custom production domain.
  if(origin.protocol!=="https:"||!origin.hostname.endsWith(".vercel.app")||
     origin.origin!==env.WARBOOST_VISION_TEST_ORIGIN||origin.username||origin.password)
    throw fail("VISION_TEST_OFF");
  if(env.WARBOOST_VISION_TEST_SUPABASE_URL!==TEST_BASE||
     !uuid.test(env.WARBOOST_VISION_TEST_CAMPAIGN||"")||
     !/^[a-f0-9]{64}$/.test(env.WARBOOST_VISION_TESTER_DIGEST||"")||
     env.WARBOOST_VISION_TEST_BUDGET_APPROVED!=="hard-limit-2-usd-reviewed"||
     env.WARBOOST_VISION_TEST_MODEL!=="gpt-6-luna")
    throw fail("VISION_TEST_OFF");
  // A project-scoped private key is required. Actual validity/project budget
  // cannot be established offline; operator approval is not independent proof.
  if(!/^sk-proj-[A-Za-z0-9_-]{32,}$/.test(env.WARBOOST_VISION_TEST_OPENAI_KEY||"")||
     !/^proj_[A-Za-z0-9_-]+$/.test(env.WARBOOST_VISION_TEST_OPENAI_PROJECT||"")||
     !scopedKey(env.WARBOOST_TEST_SUPABASE_ANON_KEY,"anon")||
     !scopedKey(env.WARBOOST_TEST_SUPABASE_SERVICE_ROLE_KEY,"service_role"))
    throw fail("VISION_TEST_OFF");
  // Reject inconsistent legacy URL aliases instead of authenticating on prod.
  for(const name of ["SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL"])
    if(env[name]&&env[name]!==TEST_BASE)throw fail("VISION_TEST_OFF");
  for(const name of ["OPENAI_API_KEY","WARBOOST_VISION_ENDPOINT","WARBOOST_VISION_SECRET"])
    if(env[name])throw fail("VISION_TEST_OFF");
  return Object.freeze({origin:origin.origin,base:TEST_BASE,
    campaign:env.WARBOOST_VISION_TEST_CAMPAIGN,tester:env.WARBOOST_VISION_TESTER_DIGEST,
    anon:env.WARBOOST_TEST_SUPABASE_ANON_KEY,service:env.WARBOOST_TEST_SUPABASE_SERVICE_ROLE_KEY,
    key:env.WARBOOST_VISION_TEST_OPENAI_KEY,project:env.WARBOOST_VISION_TEST_OPENAI_PROJECT,
    model:"gpt-6-luna",maxTokens:6000});
}

async function requestJson(url,init,transport){
  const response=await transport(url,{...init,redirect:"error"},15000);
  if(!response.ok)throw fail("VISION_TEST_BLOCKED",response.status===401?401:503);
  try{return await response.json()}catch{throw fail("VISION_TEST_BLOCKED")}
}
export async function authorizeControlledVision(req,{scanType,images,env=process.env,transport=fetchWithTimeout}={}){
  const cfg=controlledVisionConfig(env);
  if(req.headers?.origin!==cfg.origin)throw fail("VISION_TEST_BLOCKED",403);
  if(!CONTROLLED_TYPES.includes(scanType)||images?.length!==1||
     req.body?.image_data_urls?.length>1)throw fail("VISION_TEST_BLOCKED",400);
  if(req.body?.controlled_vision!==true||req.body?.controlled_vision_confirm!==true)
    throw fail("VISION_TEST_CONFIRM",428);
  const access=String(req.headers?.authorization||"");
  if(!/^Bearer \S+$/.test(access))throw fail("AUTH_REQUIRED",401);
  // GoTrue verifies the JWT, email verification and consent are still required.
  const user=assertFreeAccount(await requestJson(`${cfg.base}/auth/v1/user`,{
    method:"GET",headers:{apikey:cfg.anon,authorization:access}
  },transport));
  if(String(req.headers?.["x-warboost-beta-consent"]||"")!==BETA_CONSENT_VERSION)
    throw fail("BETA_CONSENT_REQUIRED",428);
  const digest=createHash("sha256").update(String(user.id),"utf8").digest("hex");
  if(digest!==cfg.tester)throw fail("VISION_TEST_BLOCKED",403);
  return {user,cfg};
}

export async function controlledLedger(cfg,body,transport=fetchWithTimeout){
  return requestJson(`${TEST_BASE}/rest/v1/rpc/wb1_vision_test_control`,{
    method:"POST",headers:{apikey:cfg.service,authorization:`Bearer ${cfg.service}`,"content-type":"application/json"},
    body:JSON.stringify({p_campaign:cfg.campaign,p_tester_digest:cfg.tester,...body})
  },transport);
}
// Reserve durably BEFORE any paid request. A crashed worker leaves a permanent
// busy lease; no TTL can free it while an upstream request might still be alive.
export async function runControlledVision({cfg,scanType,call,ledger=controlledLedger}){
  const requestId=randomUUID();
  const ticket=await ledger(cfg,{p_action:"reserve",p_request:requestId,p_scan_type:scanType,p_success:null});
  if(ticket?.reserved!==true||ticket.request_id!==requestId)throw fail("VISION_TEST_LIMIT",429);
  let success=false;
  try{
    // Exactly one invocation, no retries, tools, fallback or portrait pass.
    const value=await call(cfg);
    if(!value||typeof value!=="object")throw fail("VISION_TEST_BLOCKED");
    success=true;
    return value;
  }catch{throw fail("VISION_TEST_PROVIDER_FAILED")}
  finally{
    // A failed completion cannot authorize another attempt. Do not retry it.
    const result=await ledger(cfg,{p_action:"finish",p_request:requestId,p_scan_type:scanType,p_success:success});
    if(result?.finished!==true)throw fail("VISION_TEST_BLOCKED");
  }
}
