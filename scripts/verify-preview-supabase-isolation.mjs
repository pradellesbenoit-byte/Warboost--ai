import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import cloudConfig from "../api/cloud-config.js";
import {
  WARBOOST_PREVIEW_BRANCH,
  WARBOOST_TEST_SUPABASE_REF,
  assertPreviewSupabaseIsolation,
  isWarboostPreviewDeployment,
  previewSupabaseIsolationFailure
} from "../lib/preview-supabase-isolation.js";
import {safePreviewCloudConfigDiagnostic} from "../lib/preview-cloud-config-diagnostic.js";

const originalEnv={...process.env};
const supabaseEnvNames=[
  "VERCEL_ENV","VERCEL_GIT_COMMIT_REF",
  "SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEY","NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","VITE_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"
];
const b64=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt=(role,ref=WARBOOST_TEST_SUPABASE_REF)=>`${b64({alg:"HS256",typ:"JWT"})}.${b64({ref,role})}.fixture-signature`;
const validPublic=jwt("anon");
const validService=jwt("service_role");
const setSupabaseEnv=values=>{
  for(const name of supabaseEnvNames)process.env[name]="";
  Object.assign(process.env,values);
};
const baseEnv={
  VERCEL_ENV:"preview",
  VERCEL_GIT_COMMIT_REF:WARBOOST_PREVIEW_BRANCH,
  SUPABASE_URL:`https://${WARBOOST_TEST_SUPABASE_REF}.supabase.co`,
  SUPABASE_ANON_KEY:validPublic,
  SUPABASE_SERVICE_ROLE_KEY:validService
};
const run=(name,fn)=>{fn();console.log(`PASS ${name}`)};
const appSource=await readFile(new URL("../app.js",import.meta.url),"utf8");

try{
  run("configuration cohérente TEST acceptée",()=>{
    assert.equal(previewSupabaseIsolationFailure(baseEnv),null);
    assert.doesNotThrow(()=>assertPreviewSupabaseIsolation(baseEnv));
  });
  run("URL d'un autre projet refusée",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,SUPABASE_URL:"https://production-project.supabase.co"}),"PREVIEW_SUPABASE_URL_NOT_TEST");
  });
  run("alias URL contradictoire refusé malgré la priorité SUPABASE_URL",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,NEXT_PUBLIC_SUPABASE_URL:"https://production-project.supabase.co"}),"PREVIEW_SUPABASE_URL_ALIAS_MISMATCH");
  });
  run("clé anon d'un autre projet refusée",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,SUPABASE_ANON_KEY:jwt("anon","otherproject0000000000")}),"PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST");
  });
  run("clé publique de rôle privilégié refusée",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,SUPABASE_ANON_KEY:validService}),"PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST");
  });
  run("clé service_role d'un autre projet refusée",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,SUPABASE_SERVICE_ROLE_KEY:jwt("service_role","otherproject0000000000")}),"PREVIEW_SUPABASE_SERVICE_KEY_NOT_TEST");
  });
  run("clé moderne opaque refusée sans supposer son projet",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"}),"PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST");
  });
  run("production inchangée par le garde de branche Preview",()=>{
    const production={...baseEnv,VERCEL_ENV:"production",SUPABASE_URL:"https://production-project.supabase.co"};
    assert.equal(previewSupabaseIsolationFailure(production),null);
  });
  run("autre branche Preview hors périmètre",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,VERCEL_GIT_COMMIT_REF:"feature-other"}),null);
  });
  run("Preview sans référence de branche échoue en mode fermé",()=>{
    assert.equal(previewSupabaseIsolationFailure({...baseEnv,VERCEL_GIT_COMMIT_REF:"",SUPABASE_URL:"https://production-project.supabase.co"}),"PREVIEW_SUPABASE_URL_NOT_TEST");
  });
  run("diagnostic uniquement pour le code sûr d'une Preview en 503",()=>{
    assert.equal(safePreviewCloudConfigDiagnostic(503,{preview_diagnostic:true,error:"PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST",message:"secret à ignorer"}),"PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST");
    assert.equal(safePreviewCloudConfigDiagnostic(500,{preview_diagnostic:true,error:"PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST"}),"");
    assert.equal(safePreviewCloudConfigDiagnostic(503,{preview_diagnostic:false,error:"PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST"}),"");
    assert.equal(safePreviewCloudConfigDiagnostic(503,{preview_diagnostic:true,error:"arbitrary-secret-value"}),"");
  });
  run("cible Preview exige le marqueur serveur",()=>{
    assert.equal(isWarboostPreviewDeployment(baseEnv),true);
    assert.equal(isWarboostPreviewDeployment({...baseEnv,VERCEL_ENV:"production"}),false);
    assert.equal(isWarboostPreviewDeployment({...baseEnv,VERCEL_GIT_COMMIT_REF:"feature-other"}),false);
  });
  run("cloud-config refuse la clé privilégiée et ne la renvoie pas",()=>{
    setSupabaseEnv({...baseEnv,SUPABASE_URL:"https://production-project.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"sentinel-service-secret"});
    const res={headers:{},status(code){this.statusCode=code;return this},json(body){this.body=body;return this},setHeader(name,value){this.headers[name]=value}};
    cloudConfig({query:{}},res);
    assert.equal(res.statusCode,503);
    assert.equal(res.body.configured,false);
    assert.equal(res.body.error,"PREVIEW_SUPABASE_URL_NOT_TEST");
    assert.equal(res.body.preview_diagnostic,true);
    assert.equal(JSON.stringify(res.body).includes("sentinel-service-secret"),false);
  });
  run("cloud-config refuse une clé privilégiée placée dans le champ public",()=>{
    setSupabaseEnv({...baseEnv,SUPABASE_ANON_KEY:validService});
    const res={headers:{},status(code){this.statusCode=code;return this},json(body){this.body=body;return this},setHeader(name,value){this.headers[name]=value}};
    cloudConfig({query:{}},res);
    assert.equal(res.statusCode,503);
    assert.equal(res.body.configured,false);
    assert.equal(JSON.stringify(res.body).includes(validService),false);
  });
  run("cloud-config ne renvoie que la clé anon après validation",()=>{
    setSupabaseEnv(baseEnv);
    const res={headers:{},status(code){this.statusCode=code;return this},json(body){this.body=body;return this},setHeader(name,value){this.headers[name]=value}};
    cloudConfig({query:{}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.configured,true);
    assert.equal(res.body.preview_diagnostic,undefined);
    assert.equal(res.body.key,validPublic);
    assert.equal(JSON.stringify(res.body).includes(validService),false);
  });
  run("app.js n'affiche que le code filtré sur l'écran de démarrage",()=>{
    assert.match(appSource,/safePreviewCloudConfigDiagnostic\(r\.status,json\)/);
    assert.match(appSource,/Diagnostic Preview: \$\{previewCloudConfigDiagnostic\}/);
    assert.match(appSource,/cloudInit\.status==="config-unreachable"/);
  });
}finally{
  for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
  Object.assign(process.env,originalEnv);
}
