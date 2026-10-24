import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,symlink,unlink,rm,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {spawn} from "node:child_process";
import {createPublicStaticFiles,publicRequestKey} from "../lib/public-static-files.mjs";

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const root=await mkdtemp(path.join(os.tmpdir(),"wb-public-p0-"));
try{
  await mkdir(path.join(root,"assets"));
  await mkdir(path.join(root,"lib"));
  await writeFile(path.join(root,"index.html"),"synthetic public fixture");
  await writeFile(path.join(root,"manifest.webmanifest"),"{}");
  await writeFile(path.join(root,"app.js"),'import "./lib/browser.js";');
  await writeFile(path.join(root,"lib/browser.js"),"export const publicFixture=true;");
  await writeFile(path.join(root,"lib/private.js"),"synthetic private backend");
  const options={pages:["index.html"],roots:["app.js"]};
  const files=await createPublicStaticFiles(root,options);
  check(files.has("/index.html")&&files.has("/lib/browser.js"),"real public graph included");
  check(!files.has("/lib/private.js"),"unreachable backend excluded");
  await unlink(path.join(root,"index.html"));
  await symlink(path.join(root,"lib/private.js"),path.join(root,"index.html"));
  check(files.get("/index.html").data.toString()==="synthetic public fixture","post-startup link cannot change response");
  await assert.rejects(createPublicStaticFiles(root,options),/symlink/);checks++;
  await unlink(path.join(root,"index.html"));
  await writeFile(path.join(root,"index.html"),"fixture");
  await symlink(os.tmpdir(),path.join(root,"assets/escape"));
  await assert.rejects(createPublicStaticFiles(root,options),/symlink/);checks++;
}finally{await rm(root,{recursive:true,force:true});}

const forbidden=["/../index.html","/%2e%2e/index.html","/%252e%252e/index.html","/.git/config",
  "/.env","/server.mjs","/package.json","/api/scan.js","/lib/auth.js","/lib/stripe-test.js",
  "/lib/public-static-files.mjs","/supabase/a.sql","/research/a.png","/attached_assets/a.png",
  "/demo-lastwar-presentation/index.html","/generated-artifacts/a.png","/assets/..%2findex.html",
  "/assets%5c..%5cindex.html","/index.html%00","/assets/.hidden.png"];
for(const key of forbidden){
  const request=publicRequestKey(key);
  if(request.status===200)check(request.key!=="/index.html","double encoding stays unmatched");
}
check(publicRequestKey("/%zz").status===400,"malformed encoding");
check(publicRequestKey("/security?x=1").key==="/security.html","extensionless public route");
const port=await new Promise(resolve=>{const s=http.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const proc=spawn(process.execPath,["server.mjs"],{env:{...process.env,PORT:String(port)},stdio:["ignore","pipe","pipe"]});
let logs="";
const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error("server startup timeout")),30000);
  proc.stdout.on("data",data=>{logs+=data.toString();if(logs.includes("listening on")){clearTimeout(timer);resolve();}});
  proc.stderr.on("data",data=>{logs+=data.toString();});
  proc.once("exit",code=>{clearTimeout(timer);reject(Error("server exit "+code));});
});
function request(url,method="GET",headers={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:"127.0.0.1",port,path:url,method,headers},res=>{
      const chunks=[];res.on("data",x=>chunks.push(x));
      res.on("end",()=>resolve({status:res.statusCode,data:Buffer.concat(chunks),headers:res.headers}));
    });req.on("error",reject);req.end();
  });
}
try{
  await ready;
  for(const url of forbidden){const res=await request(url);check([400,403,404].includes(res.status),`${url}: ${res.status}`);}
  for(const url of ["/","/security","/privacy.html","/delete-account.html","/app.js","/lib/analysis-indicator.js","/manifest.webmanifest"]){
    const res=await request(url);check(res.status===200&&res.data.length>0,`${url} remains public`);
    check(res.headers["x-content-type-options"]==="nosniff","headers retained");
  }
  const head=await request("/","HEAD");check(head.status===200&&head.data.length===0,"HEAD empty");
  check((await request("/","GET",{Host:"["})).status===200,"malformed Host cannot crash routing");
  check((await request("/","POST")).status===405,"static mutations denied");
  const source=await readFile("server.mjs","utf8");
  check(!/readFile|realpath|stat\(/.test(source),"HTTP handler has no filesystem reads");
  console.log(`PASS public static server: ${checks} assertions, real HTTP + synthetic symlink fixtures; no authenticated API/provider calls`);
}finally{proc.kill("SIGTERM");}
