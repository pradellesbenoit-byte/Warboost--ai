// Browser verification only; loopback, synthetic identities, no Supabase or production API.
import http from "node:http";
import fs from "node:fs/promises";
import {createAccountDeletionHandler} from "../lib/account-deletion.js";
const userId="50000000-0000-4000-8000-000000000001";
const index=await fs.readFile(new URL("../index.html",import.meta.url),"utf8");
const dialog=index.match(/<dialog id="accountDeletionDialog"[\s\S]*?<\/dialog>/)[0];
const root=new URL("../",import.meta.url);
let unavailable=false;
let fixtureVault="{}";
const handler=createAccountDeletionHandler({
  requireUser:async req=>{if(req.headers.authorization!=="Bearer browser-fixture")throw Object.assign(new Error("auth"),{status:401,code:"AUTH_REQUIRED"});return {id:userId}},
  prepare:async()=>{if(unavailable)throw Object.assign(new Error("migration"),{status:503,code:"DELETION_MIGRATION_REQUIRED"})},
  remove:async()=>{},secret:()=>"browser-fixture-only-secret"
});
http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1:5001");
  if(url.pathname==="/"){
    unavailable=url.searchParams.has("unavailable");
    const nativeMode=url.searchParams.has("native");
    res.setHeader("content-type","text/html; charset=utf-8");
    res.end(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated deletion verification</title><link rel="stylesheet" href="/trust-pages.css">${nativeMode?'<script>window.Capacitor={isNativePlatform:()=>true}</script>':''}</head><body><main><h1>Compte synthétique — test isolé</h1>${nativeMode?'<button id="fixtureLogin">Connexion synthétique</button><button id="fixtureOffline">Basculer hors ligne</button><input id="fixtureCapture" type="file" accept="image/png"><p id="fixtureCaptureStatus"></p><a href="/security.html">Sécurité</a><a href="https://checkout.stripe.com/blocked" id="fixtureStripe">Lien Stripe à bloquer</a>':''}<button id="deleteAccountBtn">Supprimer mon compte et mes données</button><p id="fixtureResult" role="status"></p>${dialog}</main><script type="module">
      import {mountAccountDeletion} from "/lib/account-deletion-ui.js";
      import {mobileSessionStorage,configureMobileAuth} from "/lib/mobile-runtime.js";
      import {createWarBoostSupabaseAuthClient} from "/lib/browser-auth.js";
      const userId="${userId}";
      let client;
      if(${nativeMode}){
        configureMobileAuth("https://fixture.supabase.co");
        client=createWarBoostSupabaseAuthClient({url:"https://fixture.supabase.co",key:"synthetic-anon",storage:mobileSessionStorage});
        document.getElementById("fixtureLogin").onclick=async()=>{const result=await client.auth.signInWithPassword({email:"alice@example.test",password:"synthetic-only"});document.getElementById("fixtureResult").textContent=result.error?"Connexion impossible":"Session mobile synthétique enregistrée"};
        document.getElementById("fixtureOffline").onclick=()=>window.fixtureToggleOffline();
        document.getElementById("fixtureCapture").onchange=event=>document.getElementById("fixtureCaptureStatus").textContent=event.target.files.length+" capture sélectionnée";
        const restored=await client.auth.getSession();
        if(restored.data.session)document.getElementById("fixtureResult").textContent="Session mobile restaurée";
      }
      if(!client||(await client.auth.getSession()).data.session){
        localStorage.setItem("warboost_account_state:"+userId,JSON.stringify({player_id:userId}));
        localStorage.setItem("warboost_last_good_state",JSON.stringify({state:{player_id:userId}}));
      }
      localStorage.setItem("warboost_account_state:other",JSON.stringify({player_id:"other"}));
      mountAccountDeletion({getSession:()=>client?client.auth.__fixtureSession:{user:{id:userId},access_token:"browser-fixture"},onDeleted:async(id)=>{
        if(client)await client.auth.signOut({scope:"local"});
        document.getElementById("accountDeletionDialog").close();
        document.getElementById("fixtureResult").textContent="Suppression synthétique confirmée";
      }});
      if(client){client.auth.__fixtureSession=(await client.auth.getSession()).data.session;client.auth.onAuthStateChange((event,session)=>client.auth.__fixtureSession=session)}
    </script></body></html>`);return;
  }
  if(url.pathname==="/fixture/vault"){
    if(req.method==="POST"){let raw="";for await(const chunk of req)raw+=chunk;fixtureVault=JSON.parse(raw).value}
    res.setHeader("content-type","application/json");return res.end(JSON.stringify({value:fixtureVault}));
  }
  if(url.pathname==="/lib/mobile-capacitor.js"){
    res.setHeader("content-type","text/javascript");
    return res.end(`const original=window.fetch.bind(window);
      export const Capacitor={getPlatform:()=>"android"};
      let offline=false,networkListener;
      export const Network={getStatus:async()=>({connected:!offline}),addListener:async(_,cb)=>{networkListener=cb}};
      window.fixtureToggleOffline=()=>{offline=!offline;networkListener({connected:!offline})};
      export const App={addListener:async()=>{},minimizeApp:async()=>{}};
      export const Browser={open:async()=>{throw new Error("External links disabled in fixture")}};
      export const Camera={getPhoto:async()=>{const data=await (await original("/assets/warboost-icon-192.png")).blob();const value=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(",")[1]);reader.readAsDataURL(data)});return {format:"png",base64String:value}}};
      export function registerPlugin(){return {readSession:async()=> (await original("/fixture/vault")).json(),writeSession:async({value})=>{await original("/fixture/vault",{method:"POST",body:JSON.stringify({value})})}}}
      export const CapacitorHttp={request:async(options)=>{
        if(offline)throw new Error("Synthetic offline");
        if(options.url.includes("fixture.supabase.co"))return {status:200,headers:{},url:options.url,data:JSON.stringify({access_token:"browser-fixture",refresh_token:"synthetic-refresh",expires_at:Math.floor(Date.now()/1000)+3600,user:{id:"${userId}",email:"alice@example.test"}})};
        const response=await original("/api/support",{method:options.method,headers:options.headers,body:options.data?JSON.stringify(options.data):undefined});return {status:response.status,headers:{"content-type":"application/json"},url:options.url,data:await response.text()};
      }};`);
  }
  if(url.pathname==="/api/support"){
    let raw="";for await(const chunk of req)raw+=chunk;
    req.body=JSON.parse(raw||"{}");req.query={};
    req.body.action=req.body.action==="account_delete_prepare"?"prepare":"delete";
    res.status=code=>{res.statusCode=code;return res};res.json=body=>{res.setHeader("content-type","application/json");res.end(JSON.stringify(body))};
    return handler(req,res);
  }
  if(!["/lib/account-deletion-ui.js","/lib/pending-scan-storage.js","/lib/mobile-runtime.js","/lib/mobile-policy.js","/lib/browser-auth.js","/trust-pages.css","/security.html","/privacy.html","/delete-account.html","/delete-account-page.js","/legal.html","/trust-pages.css","/assets/warboost-icon-192.png"].includes(url.pathname)){res.statusCode=404;return res.end()}
  res.setHeader("content-type",url.pathname.endsWith(".css")?"text/css":url.pathname.endsWith(".html")?"text/html":url.pathname.endsWith(".png")?"image/png":"text/javascript");
  res.end(await fs.readFile(new URL(`.${url.pathname}`,root)));
}).listen(5001,"127.0.0.1",()=>console.log("ISOLATED deletion UI fixture ready on 5001"));
