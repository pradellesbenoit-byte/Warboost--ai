import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createSquadCloudCheckHandler} from "../lib/squad-cloud-check-handler.js";
import {
  compareSquadCloudCheck,createSquadCloudCheck,projectSquadCloudCheckRecord
} from "../lib/squad-cloud-check.js";
import {squadCloudCheckHtml} from "../lib/squad-cloud-check-view.js";
import {ACCOUNT_SYNC_COPY} from "../lib/account-sync-copy.js";

const names=["Carlie","Lucius","Morrison","DVA","Skyler"];
const confirmedAt="2026-11-03T07:00:00.000Z";
function profile({namesInSquad=names,power=45.6,marker=null,weapon=true}={}){
  return {
    player_id:"synthetic-account-a",
    squads:[{id:1,heroes:namesInSquad.map(name=>({name})),power,
      composition_source:"explicit_confirmation",composition_confirmed_at:confirmedAt,
      confirmed_composition:namesInSquad,composition_conflict:marker,
      updated_at:confirmedAt,identity_history:[{hero:"DVA",evidence:"synthetic"}]}],
    exclusive_weapons:weapon?names.map(name=>({hero_name:name,
      weapon_name:name==="DVA"?"Lame de Frappe DVA":`${name} synthetic weapon`,
      level:name==="DVA"?29:1})):[]
  };
}
const response=(status,body)=>({
  status,ok:status>=200&&status<300,json:async()=>body
});
function makeRes(){
  return {statusCode:200,headers:{},body:null,
    setHeader(name,value){this.headers[name.toLowerCase()]=value},
    status(code){this.statusCode=code;return this},
    json(body){this.body=body;return body}
  };
}
const request=(headers={},query={action:"squad_cloud_check"},method="GET")=>({headers,query,method});
const apiConsent={"x-warboost-beta-consent":"synthetic-consent"};

test("projection compares the authenticated user's squad fields without returning profile data",()=>{
  const projected=projectSquadCloudCheckRecord(profile(),{revision:confirmedAt});
  assert.equal(projected.schema,1);
  assert.deepEqual(projected.composition.slots.map(slot=>slot.value),names);
  assert.equal(projected.power.value,45.6);
  assert.deepEqual(projected.weapons.slots[3].value,{hero:"DVA",name:"Lame de Frappe DVA",level:29});
  assert.equal(projected.marker.readable,true);
  assert.equal(projected.marker.value.active,false);
  assert.equal("player_id" in projected,false);
  assert.equal("identity_history" in projected,false);
});

test("identical data, explicit zero, and an old conflict marker are reported honestly",()=>{
  const local=projectSquadCloudCheckRecord(profile({power:0}),{revision:confirmedAt});
  const same=projectSquadCloudCheckRecord(profile({power:0}),{revision:confirmedAt});
  const zeroResult=compareSquadCloudCheck(local,same);
  assert.equal(zeroResult.fields.find(row=>row.key==="power").state,"identical");
  assert.equal(zeroResult.fields.find(row=>row.key==="power").local,0);
  assert.equal(zeroResult.summary,"identical");

  const oldMarker=projectSquadCloudCheckRecord(profile({marker:{reason:"squad_freshness_ambiguous"}}),
    {revision:confirmedAt});
  const markerResult=compareSquadCloudCheck(local,oldMarker);
  assert.equal(markerResult.fields.at(-1).state,"different");
  assert.equal(markerResult.summary,"review");

  const sameActiveMarker=projectSquadCloudCheckRecord(profile({marker:{reason:"squad_freshness_ambiguous"}}),
    {revision:confirmedAt});
  assert.equal(compareSquadCloudCheck(sameActiveMarker,sameActiveMarker).summary,"review");
});

test("hero order, power and weapon divergence are field-by-field differences",()=>{
  const local=projectSquadCloudCheckRecord(profile(),{revision:confirmedAt});
  const cloud=projectSquadCloudCheckRecord(profile({
    namesInSquad:["Lucius","Carlie","Morrison","DVA","Skyler"],power:46.1
  }),{revision:confirmedAt});
  const result=compareSquadCloudCheck(local,cloud);
  assert.equal(result.fields.find(row=>row.key==="hero"&&row.slot===1).state,"different");
  assert.equal(result.fields.find(row=>row.key==="power").state,"different");

  const differentWeapon=projectSquadCloudCheckRecord({
    ...profile(),exclusive_weapons:[{hero_name:"DVA",weapon_name:"Other synthetic weapon",level:28}]
  },{revision:confirmedAt});
  assert.equal(compareSquadCloudCheck(local,differentWeapon).fields.find(row=>row.key==="weapon"&&row.slot===4).state,"different");
});

test("missing profile and unsupported marker schemas never report a match",()=>{
  const local=projectSquadCloudCheckRecord(profile(),{revision:confirmedAt});
  const noProfile=projectSquadCloudCheckRecord({}, {profilePresent:false});
  const absent=compareSquadCloudCheck(local,noProfile);
  assert.equal(absent.summary,"missing");
  assert.equal(absent.fields[0].state,"missing");

  const unsupported=profile();
  delete unsupported.squads[0].composition_conflict;
  const noMarkerSchema=projectSquadCloudCheckRecord(unsupported,{revision:confirmedAt});
  const result=compareSquadCloudCheck(local,noMarkerSchema);
  assert.equal(result.fields.at(-1).state,"not_verifiable");
  assert.equal(result.summary,"review");

  const unknownMarker=projectSquadCloudCheckRecord(profile({
    marker:{future_conflict_state:"unrecognized"}
  }),{revision:confirmedAt});
  const unknownMarkerResult=compareSquadCloudCheck(local,unknownMarker);
  assert.equal(unknownMarkerResult.fields.at(-1).state,"not_verifiable");
  assert.equal(unknownMarkerResult.summary,"review");

  const noSquad=projectSquadCloudCheckRecord({squads:[],exclusive_weapons:[]},{revision:confirmedAt});
  assert.equal(compareSquadCloudCheck(local,noSquad).summary,"review");
});

test("server handler is GET-only, consent-gated, scoped to the authenticated owner and returns minimal data",async()=>{
  const calls=[];
  const handler=createSquadCloudCheckHandler({
    requireUser:async req=>({id:req.headers.authorization.endsWith("token-b")?"account-b":"account-a"}),
    readForUser:async(owner,token)=>{calls.push({owner,token});return profile()},
    consentVersion:"synthetic-consent"
  });
  const req=request({authorization:"Bearer token-b",...apiConsent});
  const res=makeRes();
  await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.read_only,true);
  assert.equal(res.body.profile_present,true);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{owner:"account-b",token:"token-b"});
  assert.equal(res.headers["cache-control"],"no-store, max-age=0");
  assert.equal(res.body.cloud.weapons.slots[3].value.level,29);
  assert.equal("player_id" in res.body.cloud,false);
});

test("server rejects caller-selected identities, missing auth, missing consent and writes without reading",async()=>{
  let reads=0;
  const handler=createSquadCloudCheckHandler({
    requireUser:async()=>({id:"account-b"}),
    readForUser:async()=>{reads++;return profile()},
    consentVersion:"synthetic-consent"
  });
  const wrongOwner=makeRes();
  await handler(request({authorization:"Bearer token-b",...apiConsent},{action:"squad_cloud_check",player_id:"account-a"}),wrongOwner);
  assert.equal(wrongOwner.statusCode,400);
  assert.equal(reads,0);

  const noAuth=makeRes();
  await handler(request(apiConsent),noAuth);
  assert.equal(noAuth.statusCode,401);
  assert.equal(reads,0);

  const noConsent=makeRes();
  await handler(request({authorization:"Bearer token-b"}),noConsent);
  assert.equal(noConsent.statusCode,428);
  assert.equal(reads,0);

  const writeAttempt=makeRes();
  await handler(request({authorization:"Bearer token-b",...apiConsent},{action:"squad_cloud_check"},"POST"),writeAttempt);
  assert.equal(writeAttempt.statusCode,405);
  assert.equal(reads,0);
});

test("an absent cloud profile is represented as missing, not successful",async()=>{
  const handler=createSquadCloudCheckHandler({
    requireUser:async()=>({id:"account-a"}),
    readForUser:async()=>null,
    consentVersion:"synthetic-consent"
  });
  const res=makeRes();
  await handler(request({authorization:"Bearer token-a",...apiConsent}),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.profile_present,false);
  assert.equal(res.body.cloud.profilePresent,false);
});

test("client check runs only on explicit request and blocks a different local owner",async()=>{
  let calls=0,ctx={session:"session-b",owner:"account-b",allowed:true,
    local:{...profile(),player_id:"account-b"}};
  const okBody={ok:true,read_only:true,schema:1,checked_at:confirmedAt,profile_present:true,
    revision:confirmedAt,cloud:projectSquadCloudCheckRecord(profile(),{revision:confirmedAt})};
  const controller=createSquadCloudCheck({context:()=>ctx,
    request:async()=>{calls++;return {response:response(200,okBody),json:okBody}}});
  assert.equal(controller.view().kind,"idle");
  assert.equal(calls,0);
  ctx={...ctx,owner:"account-a"};
  await controller.run();
  assert.equal(calls,0);
  assert.equal(controller.view().kind,"error");
  assert.equal(controller.view().reason,"auth");
});

test("client rejects stale owner changes while the read-only request is pending",async()=>{
  let ctx={session:"session-a",owner:"account-a",allowed:true,
    local:{...profile(),player_id:"account-a"}};
  let finish;
  const pending=new Promise(resolve=>{finish=resolve});
  const controller=createSquadCloudCheck({context:()=>ctx,request:()=>pending});
  const run=controller.run();
  ctx={...ctx,session:"session-b",owner:"account-b",
    local:{...profile(),player_id:"account-b"}};
  const body={ok:true,read_only:true,schema:1,checked_at:confirmedAt,profile_present:true,
    revision:confirmedAt,cloud:projectSquadCloudCheckRecord(profile(),{revision:confirmedAt})};
  finish({response:response(200,body),json:body});
  await run;
  assert.equal(controller.view().kind,"stale");
});

test("client reports missing data and refuses unproven or schema-incomplete replies",async()=>{
  const local={...profile(),player_id:"account-a"};
  let payload={ok:true,read_only:true,schema:1,checked_at:confirmedAt,profile_present:false,
    revision:null,cloud:projectSquadCloudCheckRecord({}, {profilePresent:false})};
  const controller=createSquadCloudCheck({context:()=>({session:"s",owner:"account-a",allowed:true,local}),
    request:async()=>({response:response(200,payload),json:payload})});
  await controller.run();
  assert.equal(controller.view().comparison.summary,"missing");

  payload={ok:true,read_only:true,schema:1,checked_at:confirmedAt,profile_present:true,
    revision:null,cloud:{schema:1,profilePresent:true}};
  await controller.run();
  assert.equal(controller.view().kind,"error");
  assert.equal(controller.view().reason,"unconfirmed");
});

test("the database reader uses an authenticated own-row GET and selects only review fields",async()=>{
  const envKeys=["SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"];
  const old=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  const oldFetch=globalThis.fetch;
  const calls=[];
  process.env.SUPABASE_URL="https://synthetic.invalid";
  process.env.SUPABASE_ANON_KEY="synthetic-public-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY="";
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    return new Response(JSON.stringify([{squads:profile().squads,exclusive_weapons:profile().exclusive_weapons,updated_at:confirmedAt}]),
      {status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const {getSquadCloudCheckForUser}=await import("../lib/supabase.js");
    const row=await getSquadCloudCheckForUser("account-b","synthetic-user-token");
    assert.equal(row.updated_at,confirmedAt);
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/player_id=eq\.account-b/);
    assert.match(calls[0].url,/squads:state->squads/);
    assert.match(calls[0].url,/exclusive_weapons:state->exclusive_weapons/);
    assert.doesNotMatch(calls[0].url,/select=state(?:,|&|$)/);
    assert.equal(calls[0].options.method,"GET");
    assert.equal(calls[0].options.body,undefined);
    assert.equal(calls[0].options.headers.apikey,"synthetic-public-key");
    assert.equal(calls[0].options.headers.authorization,"Bearer synthetic-user-token");
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of envKeys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}
  }
});

test("the Player UI exposes only an explicit read-only action and localization never shows raw keys",async()=>{
  const [app,api]=await Promise.all([
    readFile(new URL("../app.js",import.meta.url),"utf8"),
    readFile(new URL("../api/state.js",import.meta.url),"utf8")
  ]);
  assert.match(app,/data-squad-cloud-check="1"/);
  assert.match(app,/id="squad1CloudCheckResult" aria-live="polite"/);
  assert.match(app,/\/api\/state\?action=squad_cloud_check/);
  assert.match(app,/void squadCloudCheck\.run\(\)/);
  const apiRoute=app.slice(app.indexOf("async function readOwnSquad1CloudForCheck"),
    app.indexOf("const squadCloudCheck=createSquadCloudCheck"));
  assert.match(apiRoute,/method:"GET"/);
  assert.doesNotMatch(apiRoute,/method:"POST"|saveState|mergeState|pushServerState|scan/i);
  assert.match(api,/action==="squad_cloud_check"/);
  assert.match(api,/readForUser:getSquadCloudCheckForUser/);

  const expectedLocales=["fr","en","de","es","it","pt","pl","tr","ru","uk","ar","ja","ko","zh","ro","el","cs","id","th","vi","nl","sv"];
  for(const locale of expectedLocales){
    const copy=ACCOUNT_SYNC_COPY[locale]||ACCOUNT_SYNC_COPY["en-GB"];
    assert.equal(typeof copy.squad_cloud_button,"string");
    assert.notEqual(copy.squad_cloud_button,"squad_cloud_button");
    assert.equal(typeof copy.squad_cloud_not_verifiable,"string");
  }
  assert.equal(ACCOUNT_SYNC_COPY.fr.squad_cloud_button,"Vérifier mon Escouade 1 dans le Cloud (lecture seule)");
  const html=squadCloudCheckHtml({kind:"result",checkedAt:confirmedAt,
    comparison:compareSquadCloudCheck(
      projectSquadCloudCheckRecord(profile(),{revision:confirmedAt}),
      projectSquadCloudCheckRecord(profile(),{revision:confirmedAt})
    )},key=>ACCOUNT_SYNC_COPY.fr[key]||key);
  assert.match(html,/role="status"/);
  assert.match(html,/Identique/);
  assert.doesNotMatch(html,/squad_cloud_[a-z_]+/);
});
