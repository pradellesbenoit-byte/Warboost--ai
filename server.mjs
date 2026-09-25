import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT)||5000;
const API_NAMES=new Set(["advice","alliance-role","cloud-config","health","ingest","invite","join","pro","scan","state","support","sync"]);
const MIME={".css":"text/css; charset=utf-8",".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};
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
  try{
    if(!["GET","HEAD"].includes(req.method))req.body=await body(req);
    else req.body={};
    const mod=await import(`${pathToFileURL(path.join(ROOT,"api",`${name}.js`)).href}?dev=1`);
    await mod.default(req,res);
  }catch(error){
    if(!res.headersSent)res.status(error?.status||500).json({error:error?.message||"local_api_error"});
    else if(!res.writableEnded)res.end();
  }
  return true;
}
async function staticFile(req,res,url){
  let pathname;
  try{pathname=decodeURIComponent(url.pathname)}catch{res.statusCode=400;return res.end("Bad request")}
  if(pathname==="/")pathname="/index.html";
  if(!path.extname(pathname))pathname+=".html";
  const file=path.resolve(ROOT,`.${pathname}`);
  if(file!==ROOT&&!file.startsWith(`${ROOT}${path.sep}`)){res.statusCode=403;return res.end("Forbidden")}
  try{
    const info=await stat(file);if(!info.isFile())throw new Error("not_file");
    const data=await readFile(file);res.setHeader("Content-Type",MIME[path.extname(file).toLowerCase()]||"application/octet-stream");res.setHeader("Cache-Control",path.extname(file)===".html"?"no-cache":"public, max-age=0");res.statusCode=200;if(req.method==="HEAD")res.end();else res.end(data);
  }catch{res.statusCode=404;res.setHeader("Content-Type","text/plain; charset=utf-8");res.end("Not found")}
}

const server=http.createServer(async(req,res)=>{
  securityHeaders(res);
  const url=new URL(req.url||"/",`http://${req.headers.host||"localhost"}`);
  if(url.pathname.startsWith("/api/")){if(!await api(req,res,url)){res.statusCode=404;res.end("Not found")}return}
  await staticFile(req,res,url);
});
server.listen(PORT,"0.0.0.0",()=>console.log(`WarBoost V2.5.32 HF8.6.32 listening on ${PORT}`));