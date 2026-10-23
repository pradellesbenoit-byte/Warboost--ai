import http from "node:http";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createPublicStaticFiles,publicRequestKey} from "./lib/public-static-files.mjs";
import {createSaveDiagnostic,publicSaveError} from "./lib/cloud-save-diagnostic.js";

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_FILES=await createPublicStaticFiles(ROOT);
const PORT=Number(process.env.PORT)||5000;
const API_NAMES=new Set(["advice","alliance-role","cloud-config","health","ingest","invite","join","pro","scan","state","support","sync"]);
const MIME={".css":"text/css; charset=utf-8",".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};
const CSP="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://*.replit.com https://*.replit.dev; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co https://*.supabase.in";

function securityHeaders(res){
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(self), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy",CSP);
}
async function body(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>7*1024*1024)throw Object.assign(new Error("request_too_large"),{status:413});chunks.push(chunk)}
  const raw=Buffer.concat(chunks);req.rawBody=raw;
  if(!raw.length)return {};
  const type=String(req.headers["content-type"]||"").split(";")[0].trim();
  if(type==="application/json")try{return JSON.parse(raw.toString("utf8"))}catch{throw Object.assign(new Error("invalid_json"),{status:400})}
  return raw.toString("utf8");
}
function decorate(req,res,url){
  req.query=Object.fromEntries(url.searchParams.entries());
  res.status=code=>{res.statusCode=code;return res};
  res.json=value=>{if(!res.headersSent)res.setHeader("Content-Type","application/json; charset=utf-8");res.end(JSON.stringify(value));return res};
  res.send=value=>{if(Buffer.isBuffer(value)||typeof value==="string")res.end(value);else res.json(value);return res};
}
async function api(req,res,url){
  const name=url.pathname.slice(5);
  if(!API_NAMES.has(name))return false;
  decorate(req,res,url);
  let handlerEntered=false;
  try{
    if(!["GET","HEAD"].includes(req.method))req.body=await body(req);
    else req.body={};
    const mod=await import(`${pathToFileURL(path.join(ROOT,"api",`${name}.js`)).href}?dev=1`);
    handlerEntered=true;
    await mod.default(req,res);
  }catch(error){
    if(name==="state"&&req.method==="POST"&&!res.headersSent){
      const status=error?.status||500;
      const code=publicSaveError({code:error?.message},status);
      res.status(status).json({error:code,diagnostic:createSaveDiagnostic({stage:handlerEntered?"response":"request",
        status,code,writeState:handlerEntered?"unknown":"not_attempted"})});
      return true;
    }
    if(!res.headersSent)res.status(error?.status||500).json({error:error?.message||"local_api_error"});
    else if(!res.writableEnded)res.end();
  }
  return true;
}
async function staticFile(req,res,url){
  if(!["GET","HEAD"].includes(req.method)){res.statusCode=405;return res.end("Method not allowed")}
  const request=publicRequestKey(req.url||"/");
  if(request.status!==200){res.statusCode=request.status;return res.end(request.status===400?"Bad request":"Forbidden");}
  const file=PUBLIC_FILES.get(request.key);
  if(!file){res.statusCode=404;res.setHeader("Content-Type","text/plain; charset=utf-8");return res.end("Not found");}
  res.setHeader("Content-Type",MIME[file.extension]||"application/octet-stream");
  res.setHeader("Cache-Control",file.extension===".html"?"no-cache":"public, max-age=0");
  res.statusCode=200;if(req.method==="HEAD")res.end();else res.end(file.data);
}

const server=http.createServer(async(req,res)=>{
  securityHeaders(res);
  let url;
  // Routing is origin-independent: an untrusted Host must not crash URL parsing.
  try{url=new URL(req.url||"/","http://localhost");}
  catch{res.statusCode=400;return res.end("Bad request");}
  if(url.pathname.startsWith("/api/")){if(!await api(req,res,url)){res.statusCode=404;res.end("Not found")}return}
  await staticFile(req,res,url);
});
server.listen(PORT,"0.0.0.0",()=>console.log(`WarBoost V2.5.32 HF8.6.34 listening on ${PORT}`));