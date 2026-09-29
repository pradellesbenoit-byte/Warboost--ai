import assert from "node:assert/strict";
import {createScanAbuseGuard} from "../lib/scan-abuse-guard.js";

// The in-process guard is intentionally bounded and does not imply a durable quota.
{
  const guard=createScanAbuseGuard({windowMs:1000,maxBurst:2,maxConcurrent:1,maxUsers:2,requestTimeoutMs:500});
  const first=guard.acquire("user-a",0);
  assert.equal(first.allowed,true);
  const concurrent=guard.acquire("user-a",10);
  assert.equal(concurrent.allowed,false);
  assert.equal(concurrent.retryAfterSeconds,1);
  first.release();
  const second=guard.acquire("user-a",20);
  assert.equal(second.allowed,true);
  second.release();
  const burst=guard.acquire("user-a",30);
  assert.equal(burst.allowed,false);
  assert.equal(burst.retryAfterSeconds,1);
  const expired=guard.acquire("user-a",1001);
  assert.equal(expired.allowed,true);
  expired.release();
  assert.equal(guard.acquire("user-b",1002).allowed,true);
  assert.equal(guard.acquire("user-c",1003).allowed,false,"user table stays bounded");
  console.log("PASS: bounded per-instance concurrency and rolling burst guard");
}

process.env.SUPABASE_URL="https://auth.test.invalid";
process.env.SUPABASE_ANON_KEY="public-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY="service-test-key";
process.env.WARBOOST_BETA_EMAILS="allowed@test.invalid";
process.env.WARBOOST_VISION_ENDPOINT="https://vision.test.invalid/scan";
process.env.WARBOOST_VISION_SECRET="vision-test-secret";
delete process.env.OPENAI_API_KEY;
const {BETA_CONSENT_VERSION}=await import("../lib/beta-access.js");
const {default:handler}=await import("../api/scan.js");

let providerOutput={state:{player:{hq_level:35}}};
let providerGate=null;
let providerCalls=0;
let providerStatus=200;
const customProviderPayloads=[];
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));
  if(url.pathname==="/auth/v1/user"){
    const token=String(init.headers?.authorization||"").replace(/^Bearer\s+/i,"");
    return new Response(JSON.stringify({id:token,email:"allowed@test.invalid"}),{status:200});
  }
  if(url.pathname.startsWith("/rest/v1/wb1_beta_invites")){
    return new Response("[]",{status:200});
  }
  if(url.href==="https://vision.test.invalid/scan"){
    providerCalls++;
    customProviderPayloads.push(JSON.parse(init.body));
    if(providerGate)await providerGate;
    return providerStatus===200
      ?new Response(JSON.stringify(providerOutput),{status:200})
      :new Response(JSON.stringify({message:"provider-secret-marker"}),{status:providerStatus});
  }
  throw new Error(`Unexpected test fetch ${url.href}`);
};

function request({token="api-user",body={},consent=BETA_CONSENT_VERSION}={}){
  const headers={authorization:`Bearer ${token}`};
  if(consent)headers["x-warboost-beta-consent"]=consent;
  return {method:"POST",headers,body:{image_data_url:"data:image/jpeg;base64,AAAA",...body}};
}
async function call(req=request()){
  let status=200;
  const headers={};
  let body=null;
  const res={
    setHeader(name,value){headers[name.toLowerCase()]=String(value);return this},
    status(value){status=value;return this},
    json(value){body=value;return this}
  };
  await handler(req,res);
  return {status,headers,body};
}

// The beta auth/consent gate must run before any provider request.
{
  const old=console.error;
  console.error=()=>{};
  try{
    const unauthenticated=await call(request({token:"",consent:BETA_CONSENT_VERSION}));
    assert.equal(unauthenticated.status,401);
    const noConsent=await call(request({consent:""}));
    assert.equal(noConsent.status,428);
    assert.equal(providerCalls,0);
  }finally{console.error=old}
  console.log("PASS: scan route enforces user authentication and current beta consent");
}

// Existing image validation remains bounded and rejects malformed captures.
{
  const invalid=await call(request({token:"image-limits",body:{image_data_url:"not-an-image"}}));
  assert.equal(invalid.status,400);
  const tooLarge=await call(request({token:"image-limits",body:{image_data_url:`data:image/jpeg;base64,${"A".repeat(4_150_000)}`}}));
  assert.equal(tooLarge.status,413);
  const invalidType=await call(request({token:"image-limits",body:{scan_type:"arbitrary"}}));
  assert.equal(invalidType.status,400);
  console.log("PASS: malformed and oversized image requests are rejected before OCR");
}

// Every actionable successful OCR result requires user review and reports only
// server scan time; it does not assert screenshot age or model confidence.
{
  providerOutput={state:{player:{hq_level:35,power_m:210.5}}};
  const profile=await call(request({token:"quality-profile",body:{scan_type:"profile"}}));
  assert.equal(profile.status,200);
  assert.equal(profile.body.quality.requires_confirmation,true);
  assert.equal(profile.body.quality.source,"screenshot_ocr");
  assert.equal(profile.body.quality.freshness.basis,"server_scan_time");
  assert.equal(profile.body.quality.freshness.screenshot_age,"unknown");
  assert.equal(Object.hasOwn(profile.body.quality,"confidence"),false);

  providerOutput={state:{alliance_roster:[{name:"Player One",role:"R4",hq_level:35,power_m:210.5,confidence:0.99}]}};
  const ownRosterState={player_id:"quality-roster",player:{name:"Player One",server_id:"884",power_m:210.5},alliance:{tag:"all4",name:"Private Alliance",members:[{name:"Other Account"}]}};
  const payloadIndex=customProviderPayloads.length;
  const roster=await call(request({token:"quality-roster",body:{scan_type:"alliance_roster",current_state:ownRosterState}}));
  assert.equal(roster.status,200);
  assert.equal(roster.body.quality.requires_confirmation,true);
  assert.equal(Object.hasOwn(roster.body.roster_rows[0],"confidence"),false);
  assert.deepEqual(customProviderPayloads[payloadIndex].current_state,{alliance:{tag:"ALL4"}});

  const otherPayloadIndex=customProviderPayloads.length;
  const otherAccount=await call(request({token:"different-authenticated-user",body:{scan_type:"alliance_roster",current_state:{player_id:"another-account",player:{name:"Private Name",power_m:999},alliance:{tag:"OTHER",members:[{name:"Private Member"}]}}}}));
  assert.equal(otherAccount.status,200);
  assert.equal(customProviderPayloads[otherPayloadIndex].current_state,null,"another account's state is never forwarded");
  assert.equal(JSON.stringify(customProviderPayloads[otherPayloadIndex]).includes("Private Name"),false);
  assert.equal(JSON.stringify(customProviderPayloads[otherPayloadIndex]).includes("Private Member"),false);

  providerOutput={state:{technology:{hero_tech_pct:17}}};
  const technologyOnly=await call(request({token:"technology-only",body:{scan_type:"season"}}));
  assert.equal(technologyOnly.status,200,"technology-only season capture is useful");
  assert.deepEqual(technologyOnly.body.state.technology,{updated_at:technologyOnly.body.scanned_at,hero_tech_pct:17});
  assert.equal(technologyOnly.body.state.season,undefined);
  assert.equal(technologyOnly.body.quality.requires_confirmation,true);

  providerOutput={state:{screen_type:"attributes",screen_title:"Attributs",drone:{level:80,power_raw:"12.3M",power_label:"Drone power",power_evidence:"visible_drone_power",power_confidence:0.98,components:["unsupported"],boost:99,chips:["unsupported"]}}};
  const drone=await call(request({token:"drone-unsupported",body:{scan_type:"drone"}}));
  assert.equal(drone.status,200);
  assert.deepEqual(drone.body.state.drone,{updated_at:drone.body.scanned_at,level:80,power_m:12.3});
  assert.equal(drone.body.quality.requires_confirmation,true);
  providerOutput={state:{drone:{level:400,power_m:0.907}}};
  const unclassified=await call(request({token:"drone-unclassified",body:{scan_type:"drone"}}));
  assert.equal(unclassified.status,422,"unclassified legacy Drone output cannot replace confirmed values");
  console.log("PASS: scan quality requires confirmation; technology-only is valid and drone extras are omitted");
}

// Provider failures log only sanitized diagnostics, never request or credential data.
{
  providerStatus=502;
  const old=console.error,logs=[];
  console.error=(...args)=>logs.push(args);
  try{
    const result=await call(request({token:"private-user-token-marker",body:{scan_type:"profile",image_data_url:"data:image/jpeg;base64,RAW_IMAGE_SENTINEL"}}));
    assert.equal(result.status,503);
  }finally{console.error=old;providerStatus=200}
  const logged=JSON.stringify(logs);
  assert.match(logged,/VISION_HTTP_ERROR/);
  assert.match(logged,/"status":502/);
  assert.match(logged,/"type":"profile"/);
  assert.match(logged,/"duration_ms":\d+/);
  for(const forbidden of ["private-user-token-marker","RAW_IMAGE_SENTINEL","vision-test-secret","provider-secret-marker"])assert.equal(logged.includes(forbidden),false,`log leaked ${forbidden}`);
  console.log("PASS: provider failure logs include bounded diagnostics without private payloads");
}

// Exercise route-level 429 behavior with three ordinary in-flight scans for
// one authenticated user. A fourth is rejected before it reaches OCR.
{
  let unlock;
  providerGate=new Promise(resolve=>{unlock=resolve});
  providerOutput={state:{player:{hq_level:35}}};
  const token="concurrent-user";
  const before=providerCalls;
  const requests=Array.from({length:3},(_,i)=>call(request({token,body:{scan_type:"profile",current_state:{marker:i}}})));
  for(let i=0;i<100&&providerCalls<before+3;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(providerCalls,before+3,"three requests should be admitted");
  const limited=await call(request({token,body:{scan_type:"profile",current_state:{marker:"fourth"}}}));
  assert.equal(limited.status,429);
  assert.ok(Number(limited.headers["retry-after"])>0);
  assert.equal(limited.body.error,"scan_rate_limited");
  unlock();
  const completed=await Promise.all(requests);
  assert.ok(completed.every(result=>result.status===200));
  providerGate=null;
  console.log("PASS: concurrent scans receive bounded 429 and Retry-After without blocking normal use");
}

console.log("Scan beta guardrails verification complete.");