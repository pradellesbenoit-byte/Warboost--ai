// Browser verification only; loopback, synthetic identities, no Supabase or production API.
import http from "node:http";
import fs from "node:fs/promises";
import {createAccountDeletionHandler} from "../lib/account-deletion.js";
const userId="50000000-0000-4000-8000-000000000001";
const index=await fs.readFile(new URL("../index.html",import.meta.url),"utf8");
const dialog=index.match(/<dialog id="accountDeletionDialog"[\s\S]*?<\/dialog>/)[0];
const root=new URL("../",import.meta.url);
let unavailable=false;
const handler=createAccountDeletionHandler({
  requireUser:async req=>{if(req.headers.authorization!=="Bearer browser-fixture")throw Object.assign(new Error("auth"),{status:401,code:"AUTH_REQUIRED"});return {id:userId}},
  prepare:async()=>{if(unavailable)throw Object.assign(new Error("migration"),{status:503,code:"DELETION_MIGRATION_REQUIRED"})},
  remove:async()=>{},secret:()=>"browser-fixture-only-secret"
});
http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1:5001");
  if(url.pathname==="/"){
    unavailable=url.searchParams.has("unavailable");
    res.setHeader("content-type","text/html; charset=utf-8");
    res.end(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated deletion verification</title><link rel="stylesheet" href="/trust-pages.css"></head><body><main><h1>Compte synthétique — test isolé</h1><button id="deleteAccountBtn">Supprimer mon compte et mes données</button><p id="fixtureResult" role="status"></p>${dialog}</main><script type="module">
      import {mountAccountDeletion} from "/lib/account-deletion-ui.js";
      const userId="${userId}";
      localStorage.setItem("warboost_account_state:"+userId,JSON.stringify({player_id:userId}));
      localStorage.setItem("warboost_last_good_state",JSON.stringify({state:{player_id:userId}}));
      localStorage.setItem("warboost_account_state:other",JSON.stringify({player_id:"other"}));
      mountAccountDeletion({getSession:()=>({user:{id:userId},access_token:"browser-fixture"}),onDeleted:async(id)=>{
        document.getElementById("accountDeletionDialog").close();
        document.getElementById("fixtureResult").textContent="Suppression synthétique confirmée";
      }});
    </script></body></html>`);return;
  }
  if(url.pathname==="/api/support"){
    let raw="";for await(const chunk of req)raw+=chunk;
    req.body=JSON.parse(raw||"{}");req.query={};
    req.body.action=req.body.action==="account_delete_prepare"?"prepare":"delete";
    res.status=code=>{res.statusCode=code;return res};res.json=body=>{res.setHeader("content-type","application/json");res.end(JSON.stringify(body))};
    return handler(req,res);
  }
  if(!["/lib/account-deletion-ui.js","/lib/pending-scan-storage.js","/trust-pages.css"].includes(url.pathname)){res.statusCode=404;return res.end()}
  res.setHeader("content-type",url.pathname.endsWith(".css")?"text/css":"text/javascript");
  res.end(await fs.readFile(new URL(`.${url.pathname}`,root)));
}).listen(5001,"127.0.0.1",()=>console.log("ISOLATED deletion UI fixture ready on 5001"));
