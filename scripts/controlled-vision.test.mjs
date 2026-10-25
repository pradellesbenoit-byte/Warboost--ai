import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {createHash} from "node:crypto";
import fs from "node:fs";
import handler,{validateScanImageBatch,openaiResponseJson} from "../api/scan.js";
import {authorizeControlledVision,controlledVisionConfig,controlledLedger,runControlledVision,TEST_BASE,REVIEW_BRANCH} from "../server/_controlled-vision.js";
import {controlledVisionCopy,CONTROLLED_VISION_LOCALES} from "../lib/controlled-vision-copy.js";
import {translator,dirFor} from "../i18n.js";
import {analysisFailureMessage} from "../lib/analysis-indicator.js";
import {analyzePlayerCaptureBatch} from "../lib/player-scan-batch.js";
import {BETA_CONSENT_VERSION} from "../lib/beta-access.js";
const campaign="00000000-0000-4000-8000-000000000009";
const user={id:"synthetic-vision-tester",email:"synthetic@example.invalid",email_confirmed_at:"2026-01-01T00:00:00Z",app_metadata:{},user_metadata:{}};
const digest=createHash("sha256").update(user.id).digest("hex");
const jwt=role=>`synthetic.${Buffer.from(JSON.stringify({ref:"zaioadmbhqzeihkvdjsd",role})).toString("base64url")}.not-a-real-signature`;
const config=()=>({
  WARBOOST_CONTROLLED_VISION:"on",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:REVIEW_BRANCH,
  WARBOOST_VISION_TEST_ORIGIN:"https://synthetic-review.vercel.app",
  WARBOOST_VISION_TEST_SUPABASE_URL:TEST_BASE,WARBOOST_VISION_TEST_CAMPAIGN:campaign,
  WARBOOST_VISION_TESTER_DIGEST:digest,WARBOOST_VISION_TEST_BUDGET_APPROVED:"hard-limit-2-usd-reviewed",
  WARBOOST_VISION_TEST_MODEL:"gpt-6-luna",WARBOOST_VISION_TEST_OPENAI_PROJECT:"proj_synthetic",
  WARBOOST_VISION_TEST_OPENAI_KEY:`sk-proj-${"x".repeat(40)}`,
  WARBOOST_TEST_SUPABASE_ANON_KEY:jwt("anon"),WARBOOST_TEST_SUPABASE_SERVICE_ROLE_KEY:jwt("service_role")
});
const req=()=>({method:"POST",headers:{authorization:"Bearer synthetic-session",
  origin:"https://synthetic-review.vercel.app","x-warboost-beta-consent":BETA_CONSENT_VERSION},
  body:{controlled_vision:true,controlled_vision_confirm:true,scan_type:"drone",
    image_data_url:"data:image/png;base64,c3ludGhldGlj"}});
const check=(r=req(),env=config(),u=user)=>authorizeControlledVision(r,{scanType:r.body.scan_type,
  images:[r.body.image_data_url],env,transport:async(url,init)=>{
    assert.equal(url,`${TEST_BASE}/auth/v1/user`);assert.equal(init.redirect,"error");
    return {ok:true,json:async()=>u};
  }});

for(const [name,patch] of Object.entries({
  OFF:{WARBOOST_CONTROLLED_VISION:"off"},missingKey:{WARBOOST_VISION_TEST_OPENAI_KEY:""},
  ordinaryKeyFallback:{WARBOOST_VISION_TEST_OPENAI_KEY:"",OPENAI_API_KEY:"synthetic"},
  ordinaryProvider:{OPENAI_API_KEY:"synthetic"},customProvider:{WARBOOST_VISION_ENDPOINT:"https://synthetic.invalid"},
  production:{VERCEL_ENV:"production"},otherBranch:{VERCEL_GIT_COMMIT_REF:"main"},
  prodURL:{SUPABASE_URL:"https://jwjqcgexvqradjefskvh.supabase.co"},
  badDedicatedURL:{WARBOOST_VISION_TEST_SUPABASE_URL:"https://synthetic.invalid"},
  unknownModel:{WARBOOST_VISION_TEST_MODEL:"gpt-5.6-luna"},
  expensiveModel:{WARBOOST_VISION_TEST_MODEL:"gpt-6"},
  budgetNotApproved:{WARBOOST_VISION_TEST_BUDGET_APPROVED:""},
  serviceWrongScope:{WARBOOST_TEST_SUPABASE_SERVICE_ROLE_KEY:jwt("anon")},
  nonPrivateKey:{WARBOOST_VISION_TEST_OPENAI_KEY:"browser-key"},
  productionOrigin:{WARBOOST_VISION_TEST_ORIGIN:"https://warboost.fr"},
  originPath:{WARBOOST_VISION_TEST_ORIGIN:"https://synthetic-review.vercel.app/path"}
})){
  test(`fail closed before auth/network: ${name}`,async()=>{
    await assert.rejects(check(req(),{...config(),...patch}),{code:"VISION_TEST_OFF"});
  });
}
test("authorized GoTrue account only, no PRO assertion or billing lookup",async()=>{
  assert.equal((await check()).user.id,user.id);
  await assert.rejects(check(req(),config(),{...user,id:"other"}),{code:"VISION_TEST_BLOCKED"});
  await assert.rejects(check(req(),config(),{...user,email_confirmed_at:null}),{code:"EMAIL_CONFIRMATION_REQUIRED"});
});
for(const [name,change,code] of [
  ["origin",r=>r.headers.origin="https://warboost.fr","VISION_TEST_BLOCKED"],
  ["auth",r=>delete r.headers.authorization,"AUTH_REQUIRED"],
  ["consent",r=>delete r.headers["x-warboost-beta-consent"],"BETA_CONSENT_REQUIRED"],
  ["confirmation",r=>r.body.controlled_vision_confirm=false,"VISION_TEST_CONFIRM"],
  ["alliance",r=>r.body.scan_type="alliance_roster","VISION_TEST_BLOCKED"],
  ["squad2",r=>r.body.scan_type="squad2","VISION_TEST_BLOCKED"],
  ["profile",r=>r.body.scan_type="profile","VISION_TEST_BLOCKED"],
  ["multi-capture",r=>r.body.image_data_urls=["synthetic-a","synthetic-b"],"VISION_TEST_BLOCKED"]
]){
  test(`request guard: ${name}`,async()=>{const r=req();change(r);await assert.rejects(check(r),{code})});
}
test("missing SQL registry / reservation response lost never calls AI",async()=>{
  let calls=0;
  await assert.rejects(runControlledVision({cfg:{},scanType:"drone",
    ledger:async()=>{throw Error("synthetic missing relation")},call:async()=>{calls++}}));
  assert.equal(calls,0);
});
test("real RPC transport is fixed to TEST and masks schema errors, redirects forbidden",async()=>{
  const cfg=controlledVisionConfig(config());
  let calls=0;
  await assert.rejects(controlledLedger(cfg,{p_action:"reserve"},async(url,init)=>{
    calls++;assert.equal(url,`${TEST_BASE}/rest/v1/rpc/wb1_vision_test_control`);
    assert.equal(init.redirect,"error");assert.equal(init.method,"POST");
    assert.equal(JSON.parse(init.body).p_campaign,campaign);
    return {ok:false,status:404,json:async()=>({message:"synthetic-private-diagnostic"})};
  }),{code:"VISION_TEST_BLOCKED",message:"Controlled Vision unavailable"});
  assert.equal(calls,1);
});
test("unverified ticket or missing record refuses AI",async()=>{
  let calls=0;
  for(const reply of [null,{}, {reserved:true,request_id:"other"}]){
    await assert.rejects(runControlledVision({cfg:{},scanType:"drone",ledger:async()=>reply,
      call:async()=>{calls++}}),{code:"VISION_TEST_LIMIT"});
  }
  assert.equal(calls,0);
});
function memoryLedger(){
  const records=new Map();let used=0,busy=null;
  return {get used(){return used},async rpc(_cfg,b){
    if(b.p_action==="reserve"){
      if(busy||used>=4||[...records.values()].some(x=>x.type===b.p_scan_type))return {reserved:false};
      used++;busy=b.p_request;records.set(b.p_request,{type:b.p_scan_type});
      return {reserved:true,request_id:b.p_request};
    }
    assert.equal(busy,b.p_request);
    records.get(b.p_request).success=b.p_success;
    if(b.p_success)busy=null;
    return {finished:true};
  }};
}
test("four distinct types total; fifth and replay rejected, no refund",async()=>{
  const db=memoryLedger();let calls=0;
  for(const scanType of ["squad1","drone","technology","exclusive"]){
    await runControlledVision({cfg:{},scanType,ledger:db.rpc,call:async()=>{calls++;return {synthetic:true}}});
  }
  await assert.rejects(runControlledVision({cfg:{},scanType:"drone",ledger:db.rpc,call:async()=>{calls++}}),{code:"VISION_TEST_LIMIT"});
  assert.equal(calls,4);assert.equal(db.used,4);
});
test("parallel attempts: one active provider, no double reservation",async()=>{
  const db=memoryLedger();let release,calls=0;
  const first=runControlledVision({cfg:{},scanType:"drone",ledger:db.rpc,
    call:()=>{calls++;return new Promise(resolve=>release=resolve)}});
  await new Promise(resolve=>setImmediate(resolve));
  const rest=await Promise.allSettled(Array.from({length:8},()=>runControlledVision({
    cfg:{},scanType:"technology",ledger:db.rpc,call:async()=>{calls++;return {}}})));
  assert.equal(rest.filter(x=>x.status==="rejected").length,8);
  release({synthetic:true});await first;
  assert.equal(calls,1);assert.equal(db.used,1);
});
test("provider failure / lost response consumes attempt and poisons lease; no retry/fallback",async()=>{
  const db=memoryLedger();let calls=0;
  await assert.rejects(runControlledVision({cfg:{},scanType:"drone",ledger:db.rpc,
    call:async()=>{calls++;throw Error("synthetic timeout")}}),{code:"VISION_TEST_PROVIDER_FAILED"});
  await assert.rejects(runControlledVision({cfg:{},scanType:"exclusive",ledger:db.rpc,
    call:async()=>{calls++;return {}}}),{code:"VISION_TEST_LIMIT"});
  assert.equal(calls,1);assert.equal(db.used,1);
});
test("lost finish response is not retried",async()=>{
  const db=memoryLedger();let finishes=0;
  await assert.rejects(runControlledVision({cfg:{},scanType:"drone",
    ledger:async(c,b)=>{if(b.p_action==="finish"){finishes++;throw Error("synthetic loss")}return db.rpc(c,b)},
    call:async()=>({synthetic:true})}));
  assert.equal(finishes,1);assert.equal(db.used,1);
});
// Executes the current endpoint function with real controlled guards and only
// synthetic auth/SQL/provider transports. Never reads runtime credentials.
test("actual handler: controlled mode excludes normal FREE/PRO paths, hints, zooms and fallback",async()=>{
  let paidCalls=0,reserves=0;const r=req(),db=memoryLedger();
  const context={
    validateScanImageBatch,controlledVisionRequested:()=>true,
    authorizeControlledVision:(request,options)=>authorizeControlledVision(request,{...options,env:config(),
      transport:async()=>({ok:true,json:async()=>user})}),
    runControlledVision:args=>runControlledVision({...args,ledger:async(c,b)=>{if(b.p_action==="reserve")reserves++;return db.rpc(c,b)}}),
    requirePersonalScanUser:()=>assert.fail("ordinary quota/PRO bypass"),
    env:()=>assert.fail("ordinary provider config read"),
    verifiedRosterContext:()=>null,configured:()=>assert.fail("ordinary cloud read"),
    userConfigured:()=>assert.fail("ordinary cloud read"),loadHeroReferenceImages:()=>assert.fail("references"),
    openaiVision:()=>assert.fail("portrait pipeline"),customVision:()=>assert.fail("fallback"),
    openaiResponseJson:async args=>{
      paidCalls++;assert.equal(args.model,"gpt-6-luna");assert.equal(args.store,false);
      assert.equal(args.maxTokens,6000);assert.equal(args.project,"proj_synthetic");
      return {synthetic:true};
    },
    visionRequestContent:()=>[{type:"input_text",text:"synthetic"}],
    FORMATION_BATCH_SCHEMA:{type:"object"},
    sanitizeFormationBatch:()=>({batch_analysis:true,capture_count:1,state:{squads:[{heroes:[]}]}}),
    scanAbuseGuard:{acquire:()=>({allowed:true,release(){}})},
    createScanTiming:()=>({measure:async(_label,fn)=>fn(),finish(){}}),
    sanitize:()=>({drone:{level:1}}),classifyDroneScreen:()=>"drone",
    usefulState:()=>true,safeErrorCode:e=>e.code,console:{error(){},warn(){}}
  };
  const invoke=vm.runInNewContext(`(${handler.toString()})`,context);
  let body;const response={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){body=v;return this}};
  for(const type of ["squad1","drone","technology","exclusive"]){
    r.body.scan_type=type;
    await invoke(r,response);
    assert.equal(response.statusCode,200);assert.equal(body.engine,"controlled-openai");
    assert.equal(body.quality.requires_confirmation,true);
  }
  assert.equal(paidCalls,4);assert.equal(reserves,4);
  context.scanAbuseGuard={acquire:()=>({allowed:false,retryAfterSeconds:2})};
  await invoke(r,response);assert.equal(response.statusCode,429);assert.equal(paidCalls,4);assert.equal(reserves,4);
});
test("actual provider serializer: fixed URL, no redirects/tools/storage, project key and output cap",async()=>{
  let calls=0;
  const invoke=vm.runInNewContext(`(${openaiResponseJson.toString()})`,{
    REQUEST_TIMEOUT_MS:46000,fetchWithTimeout:async(url,init)=>{
      calls++;assert.equal(url,"https://api.openai.com/v1/responses");
      assert.equal(init.redirect,"error");
      const body=JSON.parse(init.body);
      assert.equal(body.store,false);assert.equal(body.tools,undefined);
      assert.equal(body.max_output_tokens,6000);
      return {ok:true,json:async()=>({})};
    },jsonFromText:()=>({synthetic:true}),textFromResponse:()=>"{}"
  });
  await invoke({key:"synthetic-private",project:"proj_synthetic",model:"gpt-6-luna",maxTokens:6000,store:false,content:[]});
  assert.equal(calls,1);
});
test("browser batch: cancelled confirmation makes zero requests and preserves selection",async()=>{
  const images=["synthetic-image"];let calls=0;
  const result=await analyzePlayerCaptureBatch({type:"drone",images,controlled:true,
    confirmControlled:()=>false,request:async()=>{calls++}});
  assert.equal(result,null);assert.equal(calls,0);assert.deepEqual(images,["synthetic-image"]);
});
test("browser batch refuses extra captures / formation second pass / other scan types",async()=>{
  let calls=0;
  for(const [type,images] of [["squad1",["a","b"]],["squad2",["a"]],["alliance_roster",["a"]]]){
    await assert.rejects(analyzePlayerCaptureBatch({type,images,controlled:true,confirmControlled:()=>true,
      request:async()=>{calls++}}),{code:"VISION_TEST_SINGLE"});
  }assert.equal(calls,0);
});
test("browser sends one controlled request and does not retry provider refusal",async()=>{
  let calls=0;
  await assert.rejects(analyzePlayerCaptureBatch({type:"drone",images:["synthetic"],controlled:true,
    confirmControlled:()=>true,request:async payload=>{
      calls++;assert.equal(payload.controlled_vision,true);assert.equal(payload.controlled_vision_confirm,true);
      return {response:{ok:false,status:503},json:{code:"VISION_TEST_PROVIDER_FAILED"}};
    }}),{code:"VISION_TEST_PROVIDER_FAILED"});
  assert.equal(calls,1);
});
for(const lang of CONTROLLED_VISION_LOCALES)test(`controlled messages resolve in ${lang}`,()=>{
  const copy=controlledVisionCopy(lang),t=translator(lang);
  assert.equal(Object.keys(copy).length,6);
  for(const [key,text] of Object.entries(copy)){
    assert.ok(text.length>15);assert.equal(t(key),text);
    if(lang!=="en")assert.notEqual(text,controlledVisionCopy("en")[key]);
  }
  assert.equal(analysisFailureMessage({code:"VISION_TEST_OFF"},t),copy.vision_test_off);
  assert.equal(analysisFailureMessage({code:"VISION_TEST_LIMIT"},t),copy.vision_test_limit);
  assert.equal(dirFor(lang),lang==="ar"?"rtl":"ltr");
});
test("private module not browser-imported and dedicated key has a single reader",()=>{
  const browser=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
  assert.ok(!browser.includes("_controlled-vision"));assert.ok(!browser.includes("VISION_TEST_OPENAI_KEY"));
  const sql=fs.readFileSync(new URL("../supabase/migration_controlled_vision_test.sql",import.meta.url),"utf8");
  assert.ok(!/auth\.users|drop table|delete from/i.test(sql));
  assert.ok(sql.includes("default false"));assert.ok(sql.includes("used between 0 and 4"));
});
