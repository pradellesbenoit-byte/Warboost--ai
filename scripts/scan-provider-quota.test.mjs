import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import handler,{validateScanImageBatch} from "../api/scan.js";
import {requirePersonalScanUser} from "../lib/personal-scan-access.js";
import {controlledVisionRequested,authorizeControlledVision} from "../server/_controlled-vision.js";

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
  test(`actual handler: missing provider returns 503 after auth/consent, no ${pro?"PRO":"FREE"} quota`,async()=>{
    const f=fixture({pro}),result=await f.execute();
    assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_NOT_CONFIGURED");
    assert.equal(result.body.error,"scan_provider_unavailable");
    assert.equal(result.body.quota_reserved,false);
    assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
    assert.ok(f.events.indexOf("auth")<f.events.indexOf("config:OPENAI_API_KEY"));
  });
  for(const provider of ["openai","custom"]){
    test(`actual handler: ${pro?"verified historical PRO":"FREE"} with ${provider} retains quota policy`,async()=>{
      const f=fixture({pro,provider}),result=await f.execute();
      assert.equal(result.status,200);
      assert.equal(f.reservations.length,pro?0:1);assert.equal(f.calls.length,1);
      if(!pro)assert.ok(f.events.indexOf("config:OPENAI_API_KEY")<f.events.indexOf("quota"));
      assert.ok(f.events.includes("release"));
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
test("actual handler: declared R5 is not PRO; restricted scan remains forbidden",async()=>{
  const f=fixture();f.req.body.scan_type="alliance_roster";const result=await f.execute();
  assert.equal(result.status,403);assert.equal(result.body.code,"PRO_REQUIRED");
  assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
});
test("actual handler: denied account/IP/global reservation stops AI",async()=>{
  const f=fixture({provider:"custom",reserved:false}),result=await f.execute();
  assert.equal(result.status,429);assert.equal(result.body.code,"FREE_SCAN_QUOTA_EXCEEDED");
  assert.equal(f.reservations.length,1);assert.equal(f.calls.length,0);
});
test("actual handler: concurrency throttle still blocks AI and supplies Retry-After",async()=>{
  const f=fixture({provider:"custom",throttled:true}),result=await f.execute();
  assert.equal(result.status,429);assert.equal(result.body.code,"SCAN_RATE_LIMITED");
  assert.equal(result.headers["Retry-After"],"2");assert.equal(f.calls.length,0);
});
test("actual handler: provider failure after reservation is not refunded or retried",async()=>{
  const f=fixture({provider:"openai",providerFails:true}),result=await f.execute();
  assert.equal(result.status,503);assert.equal(result.body.code,"VISION_HTTP_ERROR");
  assert.equal(f.reservations.length,1);assert.equal(f.calls.length,1);
});
test("actual quota helper: failed provider preflight cannot consume FREE quota",async()=>{
  let consumed=0,preflight=0;
  await assert.rejects(requirePersonalScanUser({body:{scan_type:"squad4"}},{
    authorize:async()=>({user:{id:"synthetic-free"}}),
    entitlement:async()=>({active:false}),
    consume:async()=>{consumed++;return {reserved:true}},
    beforeScan:()=>{preflight++;throw Object.assign(new Error("No provider"),{code:"SCAN_NOT_CONFIGURED",status:503})}
  }),{code:"SCAN_NOT_CONFIGURED"});
  assert.equal(preflight,1);assert.equal(consumed,0);
});
test("late SCAN_NOT_CONFIGURED after a configured provider returns empty never claims no debit",async()=>{
  const f=fixture({provider:"openai",providerEmpty:true}),result=await f.execute();
  assert.equal(result.status,503);assert.equal(result.body.code,"SCAN_NOT_CONFIGURED");
  assert.equal(Object.hasOwn(result.body,"quota_reserved"),false);
  assert.equal(f.reservations.length,1);
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
        assert.equal(result.status,provider?200:503);
        if(!provider){
          assert.equal(result.body.code,"SCAN_NOT_CONFIGURED");
          assert.equal(result.body.quota_reserved,false);
        }
        assert.equal(f.reservations.length,provider&&!pro?1:0);
        assert.equal(f.calls.length,provider?1:0);
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
  test(`ordinary quota/rank/rate protections remain: flag=${JSON.stringify(controlledFlag)}`,async()=>{
    const quota=fixture({controlledFlag,provider:"openai",reserved:false});
    assert.equal((await quota.execute()).body.code,"FREE_SCAN_QUOTA_EXCEEDED");
    assert.equal(quota.calls.length,0);
    const rank=fixture({controlledFlag,provider:"openai"});
    rank.req.body.scan_type="alliance_roster";
    assert.equal((await rank.execute()).body.code,"PRO_REQUIRED");
    assert.equal(rank.reservations.length,0);assert.equal(rank.calls.length,0);
    const rate=fixture({controlledFlag,provider:"openai",throttled:true});
    assert.equal((await rate.execute()).body.code,"SCAN_RATE_LIMITED");
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
