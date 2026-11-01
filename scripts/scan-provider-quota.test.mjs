import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import handler,{validateScanImageBatch} from "../api/scan.js";
import {requirePersonalScanUser} from "../lib/personal-scan-access.js";
import {controlledVisionRequested,authorizeControlledVision} from "../server/_controlled-vision.js";
import {createScanAbuseGuard} from "../lib/scan-abuse-guard.js";

// Execute the complete current handler, not a second implementation of its
// sequence. Only dependencies are replaced; no environment credentials or HTTP.
function fixture({pro=false,provider=null,authError=null,reserved=true,throttled=false,providerFails=false,providerEmpty=false,controlledFlag}={}){
  const events=[],reservations=[],calls=[];
  const req={method:"POST",headers:{"x-synthetic-consent":"yes"},body:{scan_type:"profile",image_data_url:"data:image/png;base64,c3ludGhldGlj"}};
  const deps={
    authorize:async(_req,options)=>{
      events.push("auth");assert.equal(options.consent,true);
      if(authError)throw Object.assign(new Error("Synthetic access refusal"),authError);
      return {user:{id:"synthetic-player-a",role:"R5"}};
    },
    entitlement:async()=>{events.push("entitlement");return {active:pro,source:pro?"beta":"free"}},
    networkDigest:()=>"a".repeat(64),
    consume:async(name,args)=>{
      events.push("quota");assert.equal(name,"wb1_reserve_free_scan_v2");
      assert.equal(args.p_user_id,"synthetic-player-a");assert.equal(args.p_ip_digest,"a".repeat(64));
      assert.match(args.p_request_id,/^[0-9a-f-]{36}$/);reservations.push(args);return {reserved};
    }
  };
  const vision=async()=>{
    events.push("provider");calls.push("synthetic-provider");
    if(providerFails)throw Object.assign(new Error("Synthetic failure"),{code:"VISION_HTTP_ERROR",status:503});
    if(providerEmpty)return null;
    return {synthetic:true};
  };
  const context={
    // Real selector, synthetic environment only. Never read runtime Secrets.
    controlledVisionRequested:request=>controlledVisionRequested(request,{WARBOOST_CONTROLLED_VISION:controlledFlag}),
    authorizeControlledVision:(request,options)=>{
      events.push("controlled");
      return authorizeControlledVision(request,{...options,env:{WARBOOST_CONTROLLED_VISION:controlledFlag},
        transport:async()=>assert.fail("Unexpected controlled auth/network")});
    },
    runControlledVision:()=>assert.fail("Unexpected controlled quota/provider"),
    validateScanImageBatch,
    requirePersonalScanUser:request=>requirePersonalScanUser(request,deps),
    env:name=>{
      events.push(`config:${name}`);
      return (provider==="openai"&&name==="OPENAI_API_KEY")||(provider==="custom"&&name==="WARBOOST_VISION_ENDPOINT")?"synthetic-config":"";
    },
    createScanTiming:()=>({measure:async(_label,fn)=>fn(),finish:()=>events.push("finish")}),
    verifiedRosterContext:()=>null,
    scanAbuseGuard:{acquire:()=>{
      events.push("throttle");
      return {allowed:!throttled,retryAfterSeconds:2,release:()=>events.push("release")};
    }},
    configured:()=>false,userConfigured:()=>false,
    loadHeroReferenceImages:async()=>({available:false,references:[]}),
    openaiVision:vision,customVision:vision,
    sanitize:()=>({synthetic:true}),usefulState:()=>true,
    safeErrorCode:error=>error?.code||"SCAN_FAILED",
    console:{error(){},warn(){}}
  };
  // Forward options to the real quota helper; the handler supplies its preflight.
  context.requirePersonalScanUser=(request,options)=>requirePersonalScanUser(request,{...deps,...options});
  const run=vm.runInNewContext(`(${handler.toString()})`,context);
  return {req,events,reservations,calls,async execute(){
    let body;const headers={};
    const res={code:200,setHeader:(key,value)=>{headers[key]=value},status(code){this.code=code;return this},json(value){body=value;return this}};
    await run(req,res);
    assert.equal(headers["Cache-Control"],"no-store");
    return {status:res.code,body,headers};
  }};
}

for(const pro of [false,true]){
  test(`actual handler: ${pro?"PRO":"FREE"} scan stays manual-only with no provider`,async()=>{
    const f=fixture({pro}),result=await f.execute();
    assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
    assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
    assert.ok(f.events.includes("auth"));
    assert.equal(f.events.some(event=>event.startsWith("config:")),false);
  });
  for(const provider of ["openai","custom"]){
    test(`actual handler: ${pro?"verified historical PRO":"FREE"} ignores configured ${provider} provider`,async()=>{
      const f=fixture({pro,provider}),result=await f.execute();
      assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
      assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
      assert.equal(f.events.includes("provider"),false);
    });
  }
}
for(const [code,status] of [["AUTH_REQUIRED",401],["AUTH_INVALID",401],["EMAIL_CONFIRMATION_REQUIRED",403],["BETA_CONSENT_REQUIRED",403]]){
  test(`actual handler: ${code} precedes provider configuration without quota or disclosure`,async()=>{
    const f=fixture({authError:{code,status}}),result=await f.execute();
    assert.equal(result.status,status);assert.equal(result.body.code,code);
    assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
    assert.ok(!f.events.some(value=>value.startsWith("config:")));
  });
}
test("actual handler: invalid request and HTTP method do not authorize, reserve or call AI",async()=>{
  for(const change of [f=>{f.req.method="GET"},f=>{f.req.body.scan_type="invalid"},f=>{f.req.body.image_data_url="invalid"}]){
    const f=fixture();change(f);const result=await f.execute();
    assert.ok([400,405].includes(result.status));assert.equal(f.events.includes("auth"),false);
    assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
  }
});
test("actual handler: declared R5 cannot enable automatic roster extraction",async()=>{
  const f=fixture();f.req.body.scan_type="alliance_roster";const result=await f.execute();
  assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
  assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
});
test("actual handler: manual-only capture never reserves an account/IP/global scan quota",async()=>{
  const f=fixture({provider:"custom",reserved:false}),result=await f.execute();
  assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
  assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
});
test("manual-only capture cannot call AI; the bounded abuse guard still limits bursts and concurrency",async()=>{
  const f=fixture({provider:"custom",throttled:true}),result=await f.execute();
  assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
  assert.equal(f.calls.length,0);assert.equal(f.events.includes("throttle"),false);
  const guard=createScanAbuseGuard({windowMs:1_000,maxBurst:2,maxConcurrent:1,requestTimeoutMs:500});
  const first=guard.acquire("synthetic-player",10_000);
  assert.equal(first.allowed,true);
  assert.equal(guard.acquire("synthetic-player",10_001).allowed,false);
  first.release();
  const second=guard.acquire("synthetic-player",10_001);
  assert.equal(second.allowed,true);
  assert.equal(guard.acquire("synthetic-player",10_002).allowed,false);
  second.release();
});
test("actual handler: configured provider failures are unreachable and never reserved or retried",async()=>{
  const f=fixture({provider:"openai",providerFails:true}),result=await f.execute();
  assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
  assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
});
test("actual quota helper: failed provider preflight cannot consume FREE quota",async()=>{
  let consumed=0,preflight=0;
  await assert.rejects(requirePersonalScanUser({body:{scan_type:"squad4"}},{
    authorize:async()=>({user:{id:"synthetic-free"}}),
    entitlement:async()=>({active:false}),
    consume:async()=>{consumed++;return {reserved:true}},
    beforeScan:()=>{preflight++;throw Object.assign(new Error("No provider"),{code:"SCAN_NOT_CONFIGURED",status:503})}
  }),{code:"SCAN_MANUAL_ONLY",status:503,quota_reserved:false});
  assert.equal(preflight,0);assert.equal(consumed,0);
});
test("configured provider returning empty is unreachable and no scan quota is debited",async()=>{
  const f=fixture({provider:"openai",providerEmpty:true}),result=await f.execute();
  assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
  assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
});

for(const controlledFlag of ["off","on",""]){
  for(const pro of [false,true])for(const provider of [null,"openai","custom"]){
    test(`actual handler routing: flag=${JSON.stringify(controlledFlag)}, ${pro?"PRO":"FREE"}, provider=${provider}`,async()=>{
      for(const explicitFalse of [false,true]){
        const f=fixture({controlledFlag,pro,provider});
        if(explicitFalse)f.req.body.controlled_vision=false;
        const result=await f.execute();
        assert.equal(f.events.includes("controlled"),false);
        assert.equal(f.events.includes("auth"),true);
        assert.equal(result.status,503);
        assert.equal(result.body.code,"SCAN_MANUAL_ONLY");
        assert.equal(f.reservations.length,0);
        assert.equal(f.calls.length,0);
        assert.equal(f.events.some(event=>event.startsWith("config:")),false);
      }
    });
  }
  for(const [code,status] of [["AUTH_REQUIRED",401],["BETA_CONSENT_REQUIRED",428],["EMAIL_CONFIRMATION_REQUIRED",403]]){
    test(`ordinary auth/consent not bypassed: flag=${JSON.stringify(controlledFlag)}, ${code}`,async()=>{
      const f=fixture({controlledFlag,provider:"openai",authError:{code,status}});
      const result=await f.execute();
      assert.equal(result.status,status);assert.equal(result.body.code,code);
      assert.equal(f.events.includes("controlled"),false);
      assert.equal(f.events.some(event=>event.startsWith("config:")),false);
      assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
    });
  }
  test(`ordinary requests stay manual-only regardless of quota, declared rank, or provider flag=${JSON.stringify(controlledFlag)}`,async()=>{
    const quota=fixture({controlledFlag,provider:"openai",reserved:false});
    const quotaResult=await quota.execute();
    assert.equal(quotaResult.status,503);assert.equal(quotaResult.body.code,"SCAN_MANUAL_ONLY");
    assert.equal(quota.reservations.length,0);
    assert.equal(quota.calls.length,0);
    const rank=fixture({controlledFlag,provider:"openai"});
    rank.req.body.scan_type="alliance_roster";
    const rankResult=await rank.execute();
    assert.equal(rankResult.status,503);assert.equal(rankResult.body.code,"SCAN_MANUAL_ONLY");
    assert.equal(rank.reservations.length,0);assert.equal(rank.calls.length,0);
    const rate=fixture({controlledFlag,provider:"openai",throttled:true});
    const rateResult=await rate.execute();
    assert.equal(rateResult.status,503);assert.equal(rateResult.body.code,"SCAN_MANUAL_ONLY");
    assert.equal(rate.calls.length,0);
  });
}
for(const controlledFlag of ["off","","on"]){
  test(`explicit experimental request refuses unavailable config before auth/quota/AI: flag=${JSON.stringify(controlledFlag)}`,async()=>{
    const f=fixture({controlledFlag,provider:"openai",pro:true});
    f.req.body.scan_type="drone";f.req.body.controlled_vision=true;f.req.body.controlled_vision_confirm=true;
    const result=await f.execute();
    assert.equal(result.status,503);assert.equal(result.body.code,"VISION_TEST_OFF");
    assert.equal(f.events.includes("controlled"),true);
    assert.equal(f.events.includes("auth"),false);
    assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
  });
}
