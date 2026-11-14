import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import proHandler from "../api/pro.js";
import {requireBetaUser,betaAccessForUserAsync,BETA_CONSENT_VERSION} from "../lib/beta-access.js";
import {syncAllianceRoster} from "../lib/roster-import-sync.js";
import {betaCodeVisible} from "../lib/beta-activation-ui.js";
import {WARBOOST_PREVIEW_BRANCH,WARBOOST_TEST_SUPABASE_REF} from "../lib/preview-supabase-isolation.js";

const originalEnv={...process.env},originalFetch=globalThis.fetch;
const b64=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt=(role)=>`${b64({alg:"HS256",typ:"JWT"})}.${b64({ref:WARBOOST_TEST_SUPABASE_REF,role})}.preview-fixture`;
const envNames=[
  "VERCEL_ENV","VERCEL_GIT_COMMIT_REF","SUPABASE_URL","SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY","WARBOOST_BETA_EMAILS","WARBOOST_SUPPORT_ADMINS",
  "WARBOOST_COMMERCIAL_MODE","WARBOOST_STRIPE_MODE","STRIPE_SECRET_KEY",
  "STRIPE_LIVE_SECRET_KEY","STRIPE_TEST_SECRET_KEY"
];
const users={
  "token-a":{id:"preview-user-a",email:"player-a@example.test",email_confirmed_at:"2026-01-01T00:00:00Z"},
  "token-b":{id:"preview-user-b",email:"player-b@example.test",email_confirmed_at:"2026-01-01T00:00:00Z"}
};
let restReads=[];
const pass=name=>console.log(`PASS ${name}`);
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
function setEnvironment(environment="preview",branch=WARBOOST_PREVIEW_BRANCH){
  for(const name of envNames)delete process.env[name];
  Object.assign(process.env,{
    VERCEL_ENV:environment,
    VERCEL_GIT_COMMIT_REF:branch,
    SUPABASE_URL:environment==="preview"?`https://${WARBOOST_TEST_SUPABASE_REF}.supabase.co`:"https://production-placeholder.supabase.co",
    SUPABASE_ANON_KEY:jwt("anon"),
    SUPABASE_SERVICE_ROLE_KEY:jwt("service_role"),
    WARBOOST_BETA_EMAILS:"",
    WARBOOST_SUPPORT_ADMINS:"",
    WARBOOST_COMMERCIAL_MODE:"off",
    WARBOOST_STRIPE_MODE:"off",
    STRIPE_SECRET_KEY:"",
    STRIPE_LIVE_SECRET_KEY:"",
    STRIPE_TEST_SECRET_KEY:""
  });
  restReads=[];
}
globalThis.fetch=async(input,init={})=>{
  const url=String(input),authorization=String(init.headers?.authorization||"");
  if(url.includes("/auth/v1/user")){
    const token=authorization.replace(/^Bearer\s+/i,"");
    return users[token]?response(users[token]):response({message:"invalid token"},401);
  }
  if(url.includes("/rest/v1/")){
    restReads.push(url);
    // All test data is synthetic. No unmocked network calls are allowed.
    return response([]);
  }
  throw new Error("Unexpected external request in local preview-access test");
};
const run=async(name,fn)=>{await fn();pass(name)};
function req(token,{consent=true}={}){
  return {headers:{
    ...(token?{authorization:`Bearer ${token}`}:{ }),
    ...(consent?{"x-warboost-beta-consent":BETA_CONSENT_VERSION}:{})
  }};
}
function res(){
  return {headers:{},setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
}

try{
  setEnvironment("preview");
  await run("non connecté refusé avant toute recherche d'invitation",async()=>{
    await assert.rejects(()=>requireBetaUser(req(null)),error=>error.status===401&&error.code==="AUTH_REQUIRED");
  });
  await run("compte Supabase-Test authentifié autorisé sans code, sans consentement implicite",async()=>{
    await assert.rejects(()=>requireBetaUser(req("token-a",{consent:false}),{consent:true}),error=>error.status===428&&error.code==="BETA_CONSENT_REQUIRED");
    const {user,beta}=await requireBetaUser(req("token-a"),{consent:true});
    assert.equal(user.id,"preview-user-a");
    assert.equal(beta.account_access_allowed,true);
    assert.equal(beta.allowed,false);
    assert.equal(beta.code_eligible,false);
  });
  await run("les sessions distinctes restent attachées à leur utilisateur authentifié",async()=>{
    const a=await requireBetaUser(req("token-a"),{consent:true});
    const b=await requireBetaUser(req("token-b"),{consent:true});
    assert.equal(a.user.id,"preview-user-a");
    assert.equal(b.user.id,"preview-user-b");
    assert.notEqual(a.user.id,b.user.id);
  });
  await run("API PRO masque le code en Preview sans accorder PRO ni rôle alliance",async()=>{
    const result=res();
    await proHandler({method:"GET",headers:{authorization:"Bearer token-a"},query:{}},result);
    assert.equal(result.statusCode,200);
    assert.equal(result.body.account_access_allowed,true);
    assert.equal(result.body.beta_code_eligible,false);
    assert.equal(result.body.alliance_beta_allowed,false);
    assert.equal(result.body.active,false);
    assert.equal(result.body.pro_included,false);
    assert.equal(result.body.beta_access_status,"preview-account");
  });
  await run("UI ne propose pas le code pour un compte libre de la Preview",async()=>{
    assert.equal(betaCodeVisible({account_access_allowed:true,beta_code_eligible:true},{logged:true}),false);
    assert.equal(betaCodeVisible({account_access_allowed:false,beta_code_eligible:true},{logged:true}),true);
  });
  await run("un compte libre ne passe pas le contrôle R4/R5 du roster",async()=>{
    let writes=0;
    const result=await syncAllianceRoster({
      base_roster_updated_at:"roster-v1",
      roster_patch:{server_id:"123",alliance_tag:"ABC",members:[{name:"Tester",server_id:"123",alliance_tag:"ABC",role:"R4"}]}
    },{playerId:"preview-user-a",access:"synthetic-token",betaAllowed:true},{
      configured:()=>true,userConfigured:()=>false,
      getProfile:async()=>({state:{player:{name:"Tester",server_id:"123"},alliance:{tag:"ABC"}}}),
      getAllianceRoster:async()=>({alliance:{id:"alliance-other",server_id:"123",tag:"ABC",updated_at:"alliance-v1",roster_updated_at:"roster-v1",owner_player_id:"other-user",roster:[]},membership:null}),
      updateAllianceScopeRoster:async()=>{writes++;throw new Error("should not write")}
    });
    assert.equal(result.status,403);
    assert.equal(result.body.authorization?.allowed,false);
    assert.equal(writes,0);
  });
  await run("Production conserve le refus d'un compte sans invitation",async()=>{
    setEnvironment("production");
    const beta=await betaAccessForUserAsync(users["token-a"]);
    assert.equal(beta.account_access_allowed,false);
    assert.equal(beta.allowed,false);
    await assert.rejects(()=>requireBetaUser(req("token-a"),{consent:true}),error=>error.status===403&&error.code==="BETA_INVITE_REQUIRED");
  });
  await run("une Preview d'une autre branche ou sans référence reste protégée par invitation",async()=>{
    setEnvironment("preview","other-preview-branch");
    const otherBranch=await betaAccessForUserAsync(users["token-a"]);
    assert.equal(otherBranch.account_access_allowed,false);
    await assert.rejects(()=>requireBetaUser(req("token-a"),{consent:true}),error=>error.status===403&&error.code==="BETA_INVITE_REQUIRED");
    setEnvironment("preview","");
    const missingRef=await betaAccessForUserAsync(users["token-a"]);
    assert.equal(missingRef.account_access_allowed,false);
    await assert.rejects(()=>requireBetaUser(req("token-a"),{consent:true}),error=>error.status===403&&error.code==="BETA_INVITE_REQUIRED");
  });
  await run("les routes R4/R5 gardent leur contrôle canonique",async()=>{
    const [syncSource,roleSource]=await Promise.all([
      readFile(new URL("../api/sync.js",import.meta.url),"utf8"),
      readFile(new URL("../api/alliance-role.js",import.meta.url),"utf8")
    ]);
    assert.match(syncSource,/betaAllowed:beta\.allowed\|\|beta\.account_access_allowed/);
    assert.match(syncSource,/canonicalAllianceAuthorization/);
    assert.match(roleSource,/canonicalAllianceAuthorization/);
    assert.match(roleSource,/if\(!access\.allowed\)return res\.status\(403\)\.json\(\{error:"r4_r5_required"\}\)/);
  });
  console.log(`Synthetic Supabase requests: ${restReads.length}; no real account or network data used.`);
}finally{
  globalThis.fetch=originalFetch;
  for(const name of envNames)delete process.env[name];
  Object.assign(process.env,originalEnv);
}
