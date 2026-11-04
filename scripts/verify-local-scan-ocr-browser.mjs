import assert from "node:assert/strict";
import {createServer} from "node:http";
import {existsSync} from "node:fs";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import sharp from "sharp";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const webRoot=path.join(root,"web-dist");
const chromium=process.env.CHROMIUM_BIN||"/repl/tools/bin/chromium";
assert.ok(existsSync(path.join(webRoot,"assets/local-ocr/ocr-engine.js")),"build web-dist before running the browser OCR test");
assert.ok(existsSync(chromium),`Chromium is unavailable: ${chromium}`);

const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="620"><rect width="100%" height="100%" fill="white"/><text x="70" y="210" font-family="Arial, sans-serif" font-size="112" font-weight="700" fill="black">FORMATION TEST</text><text x="70" y="420" font-family="Arial, sans-serif" font-size="112" font-weight="700" fill="black">TOTAL POWER 45.64M</text></svg>`);
const png=await sharp(svg).png().toBuffer();
const imageDataUrl=`data:image/png;base64,${png.toString("base64")}`;
const csp="default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'";
const page=`<!doctype html><html><head><meta charset="utf-8"><title>Local OCR browser test</title></head><body>
<div id="result" data-state="pending" data-payload=""></div>
<script type="module">
const output=document.querySelector("#result");
const violations=[];
let lastProgress=null;
document.addEventListener("securitypolicyviolation",event=>{
  let uri=String(event.blockedURI||"");
  try{uri=new URL(uri,location.href).origin}catch{uri=uri.slice(0,120)}
  violations.push({uri,directive:String(event.effectiveDirective||"")});
});
const imageDataUrl=${JSON.stringify(imageDataUrl)};
const encode=value=>{const bytes=new TextEncoder().encode(JSON.stringify(value));let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)};
const finish=(state,payload)=>{output.dataset.state=state;output.dataset.payload=encode(payload)};
try{
  const {runLocalScanOcrBatch}=await import("/assets/local-ocr/ocr-engine.js");
  const [report]=await runLocalScanOcrBatch([imageDataUrl],{
    language:"eng",scanType:"squad1",timeoutMs:90000,
    onProgress:message=>{
      const progress=Number(message?.progress);
      lastProgress={status:String(message?.status||""),progress:Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):null};
      if("text" in message)throw new Error("progress exposed OCR text");
    }
  });
  await new Promise(resolve=>setTimeout(resolve,150));
  finish("pass",{text:report.text,confidence:report.lines.map(line=>line.confidence),candidates:report.candidates,violations,lastProgress});
}catch(error){
  finish("fail",{error:String(error?.message||error),code:error?.code||null,violations,lastProgress});
}
</script></body></html>`;

const requests=[];
const writes=[];
const server=createServer(async(req,res)=>{
  const rawUrl=req.url||"/";
  let requestPath="/[invalid]";
  try{requestPath=new URL(rawUrl,"http://127.0.0.1").pathname}catch{}
  const requestRecord={method:req.method||"",url:requestPath,status:null,mime:null};
  requests.push(requestRecord);
  const respond=(status,mime,body="")=>{
    requestRecord.status=status;
    requestRecord.mime=mime;
    res.statusCode=status;
    if(mime)res.setHeader("Content-Type",mime);
    res.end(req.method==="HEAD"?"":body);
  };
  res.setHeader("Content-Security-Policy",csp);
  res.setHeader("Cache-Control","no-store");
  if(!["GET","HEAD"].includes(req.method||"")){
    writes.push({method:req.method||"",url:requestPath});
    respond(405,"text/plain; charset=utf-8","Method not allowed");return;
  }
  const pathname=requestPath;
  if(pathname==="/__ocr_test__"){
    respond(200,"text/html; charset=utf-8",page);return;
  }
  let file;
  try{file=path.resolve(webRoot,`.${decodeURIComponent(pathname)}`)}catch{
    respond(400,"text/plain; charset=utf-8","Bad path");return;
  }
  if(!file.startsWith(`${webRoot}${path.sep}`)){
    respond(403,"text/plain; charset=utf-8","Forbidden");return;
  }
  try{
    const data=await readFile(file),ext=path.extname(file);
    const mime=ext===".js"?"text/javascript; charset=utf-8":ext===".wasm"?"application/wasm":ext===".gz"?"application/gzip":ext===".txt"?"text/plain; charset=utf-8":"application/octet-stream";
    respond(200,mime,data);
  }catch{
    respond(404,"text/plain; charset=utf-8","Not found");
  }
});

const profile=await mkdtemp(path.join(os.tmpdir(),"warboost-ocr-chromium-"));
let child=null;
let childClosed=null;
let cdp=null;
const cdpRequests=[];
const blockedExternal=[];
const consoleEntries=[];
const runtimeExceptions=[];
const protocolErrors=[];
const wallDeadline=Date.now()+140000;

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const excerpt=value=>String(value||"")
  .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,"$1[redacted]")
  .replace(/\b(access_token|refresh_token|api[_-]?key|secret)\b(\s*[:=]\s*)[^\s,;]+/gi,"$1$2[redacted]")
  .slice(-4000);
const safeRequest=(url,method="")=>{
  try{const parsed=new URL(url);return {method,origin:parsed.origin,path:parsed.pathname}}
  catch{return {method,origin:"invalid",path:"/[invalid]"}}
};
const diagnosticState=()=>{
  const apiRequests=requests.filter(item=>item.url.startsWith("/api/"));
  return {
    localRequests:requests,
    writes,
    apiRequests,
    blockedExternal,
    cdpRequests,
    consoleEntries:consoleEntries.slice(-20),
    runtimeExceptions:runtimeExceptions.slice(-10),
    protocolErrors:protocolErrors.slice(-10),
    stdout:excerpt(chromeStdout.join("")),
    stderr:excerpt(chromeStderr.join(""))
  };
};

class CdpClient{
  constructor(url){
    this.socket=new WebSocket(url);
    this.nextId=0;
    this.pending=new Map();
    this.listeners=new Map();
    this.socket.addEventListener("message",event=>{
      let message;
      try{message=JSON.parse(String(event.data))}catch{return}
      if(Number.isInteger(message.id)){
        const pending=this.pending.get(message.id);
        if(!pending)return;
        clearTimeout(pending.timer);this.pending.delete(message.id);
        if(message.error)pending.reject(new Error(`CDP ${pending.method}: ${message.error.message||JSON.stringify(message.error)}`));
        else pending.resolve(message.result||{});
        return;
      }
      for(const listener of this.listeners.get(message.method)||[]){
        try{listener(message.params||{})}catch(error){protocolErrors.push(String(error?.message||error))}
      }
    });
    this.socket.addEventListener("close",()=>{
      for(const pending of this.pending.values()){
        clearTimeout(pending.timer);pending.reject(new Error("CDP WebSocket closed"));
      }
      this.pending.clear();
    });
    this.socket.addEventListener("error",()=>{
      for(const pending of this.pending.values()){
        clearTimeout(pending.timer);pending.reject(new Error("CDP WebSocket error"));
      }
      this.pending.clear();
    });
  }
  async open(){
    if(this.socket.readyState===WebSocket.OPEN)return;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("CDP WebSocket open timed out")),8000);
      this.socket.addEventListener("open",()=>{clearTimeout(timer);resolve()},{once:true});
      this.socket.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("CDP WebSocket failed to open"))},{once:true});
    });
  }
  on(method,listener){
    const listeners=this.listeners.get(method)||[];
    listeners.push(listener);this.listeners.set(method,listeners);
  }
  send(method,params={}){
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);reject(new Error(`CDP ${method} timed out`));
      },8000);
      this.pending.set(id,{resolve,reject,timer,method});
      try{this.socket.send(JSON.stringify({id,method,params}))}
      catch(error){clearTimeout(timer);this.pending.delete(id);reject(error)}
    });
  }
  close(){try{this.socket.close()}catch{}}
}

async function waitForDevToolsPort(){
  const portFile=path.join(profile,"DevToolsActivePort");
  while(Date.now()<wallDeadline){
    if(child?.exitCode!==null&&child?.exitCode!==undefined)throw new Error(`Chromium exited before CDP was ready: ${child.exitCode}`);
    try{
      const value=await readFile(portFile,"utf8");
      const port=Number(value.split(/\r?\n/)[0]);
      if(Number.isInteger(port)&&port>0&&port<65536)return port;
    }catch{}
    await delay(50);
  }
  throw new Error("Timed out waiting for loopback DevToolsActivePort");
}

async function waitForResult(cdpClient){
  const expression=`(()=>{const node=document.querySelector("#result");return node?{state:node.dataset.state||"",payload:node.dataset.payload||""}:null})()`;
  while(Date.now()<wallDeadline){
    if(child?.exitCode!==null&&child?.exitCode!==undefined)throw new Error(`Chromium exited while waiting for OCR DOM: ${child.exitCode}`);
    const evaluated=await cdpClient.send("Runtime.evaluate",{expression,returnByValue:true});
    const value=evaluated.result?.value;
    if(value&&value.state&&value.state!=="pending"){
      let payload=null,payloadError=null;
      if(value.payload){
        try{payload=JSON.parse(Buffer.from(value.payload,"base64").toString("utf8"))}
        catch(error){payloadError=String(error?.message||error)}
      }
      return {state:value.state,payload,payloadError};
    }
    await delay(100);
  }
  return {state:"pending",payload:null,payloadError:null};
}

try{
  await new Promise((resolve,reject)=>server.listen(0,"127.0.0.1",error=>error?reject(error):resolve()));
  const address=server.address();
  const url=`http://127.0.0.1:${address.port}/__ocr_test__`;
  const args=[
    "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--disable-background-networking","--disable-component-update","--disable-sync",
    "--disable-extensions","--no-first-run","--no-default-browser-check",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    "--remote-debugging-address=127.0.0.1","--remote-debugging-port=0",
    `--user-data-dir=${profile}`,url
  ];
  const chromeStdout=[],chromeStderr=[];
  child=spawn(chromium,args,{stdio:["ignore","pipe","pipe"]});
  child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
  child.stdout.on("data",chunk=>chromeStdout.push(chunk));
  child.stderr.on("data",chunk=>chromeStderr.push(chunk));
  childClosed=new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
  const port=await waitForDevToolsPort();
  const listResponse=await fetch(`http://127.0.0.1:${port}/json/list`);
  assert.equal(listResponse.status,200,"loopback DevTools target list was unavailable");
  const targets=await listResponse.json();
  const target=targets.find(item=>item.type==="page"&&item.webSocketDebuggerUrl);
  assert.ok(target,"Chromium did not expose a page target over loopback CDP");
  const debuggerUrl=new URL(target.webSocketDebuggerUrl);
  assert.equal(debuggerUrl.hostname,"127.0.0.1","DevTools WebSocket must stay on loopback");
  assert.equal(Number(debuggerUrl.port),port,"DevTools WebSocket port mismatch");
  if(typeof WebSocket!=="function")throw new Error("Node native WebSocket is unavailable; refusing to add a dependency");
  cdp=new CdpClient(debuggerUrl.href);
  await cdp.open();
  cdp.on("Network.requestWillBeSent",event=>cdpRequests.push(safeRequest(event.request?.url||"",event.request?.method||"")));
  cdp.on("Log.entryAdded",event=>{
    const entry=event.entry||{};
    consoleEntries.push({level:entry.level||"",source:entry.source||"",text:excerpt(entry.text||"")});
  });
  cdp.on("Runtime.exceptionThrown",event=>{
    runtimeExceptions.push(excerpt(event.exceptionDetails?.text||event.exceptionDetails?.exception?.description||"JavaScript exception"));
  });
  cdp.on("Fetch.requestPaused",event=>{
    const request=event.request||{};
    let allowed=false,origin="invalid";
    try{
      const parsed=new URL(request.url);
      origin=parsed.origin;
      allowed=parsed.protocol==="http:"&&["127.0.0.1","localhost"].includes(parsed.hostname)&&Number(parsed.port||80)===address.port;
    }catch{}
    const decision=allowed
      ?cdp.send("Fetch.continueRequest",{requestId:event.requestId})
      :(blockedExternal.push({origin,method:request.method||""}),cdp.send("Fetch.failRequest",{requestId:event.requestId,errorReason:"BlockedByClient"}));
    void decision.catch(error=>protocolErrors.push(excerpt(error?.message||error)));
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Log.enable");
  await cdp.send("Fetch.enable",{patterns:[{urlPattern:"*",requestStage:"Request"}]});
  const navigation=await cdp.send("Page.navigate",{url});
  if(navigation.errorText)throw new Error(`Chromium navigation failed: ${navigation.errorText}`);
  const result=await waitForResult(cdp);
  const childExit=child.exitCode===null?null:await Promise.race([childClosed,delay(50).then(()=>null)]);
  const apiRequests=requests.filter(item=>item.url.startsWith("/api/"));
  const diagnostics=`wallTimeMs=${Date.now()-(wallDeadline-140000)}; resultState=${result.state}; payloadParseError=${result.payloadError||"none"}; localRequests=${JSON.stringify(requests)}; writes=${writes.length}; apiRequests=${apiRequests.length}; blockedExternal=${JSON.stringify(blockedExternal)}; cdpRequests=${JSON.stringify(cdpRequests)}; cspViolations=${JSON.stringify(result.payload?.violations||[])}; lastOcrProgress=${JSON.stringify(result.payload?.lastProgress||null)}; console=${JSON.stringify(consoleEntries.slice(-20))}; runtimeExceptions=${JSON.stringify(runtimeExceptions.slice(-10))}; protocolErrors=${JSON.stringify(protocolErrors.slice(-10))}; childExit=${JSON.stringify(childExit)}; stdoutTail=${excerpt(chromeStdout.join(""))}; stderrTail=${excerpt(chromeStderr.join(""))}`;
  try{
    assert.ok(result.state==="pass",`Chromium OCR did not pass (state=${result.state}, payload=${JSON.stringify(result.payload)}); ${diagnostics}`);
    const payload=result.payload;
    assert.match(payload.text,/FORMATION\s+TEST/i);
    assert.match(payload.text,/TOTAL\s+POWER\s+45[.,]64\s*M/i);
    assert.equal(payload.candidates.length,1);
    assert.equal(payload.candidates[0].field,"squad_power_m");
    assert.equal(payload.candidates[0].value,45.64);
    assert.deepEqual(payload.violations,[]);
    assert.equal(writes.length,0,`browser issued a write request; ${diagnostics}`);
    assert.equal(apiRequests.length,0,`browser requested an API endpoint; ${diagnostics}`);
    const workerRequest=requests.find(item=>item.url==="/assets/local-ocr/worker.min.js");
    const wasmRequest=requests.find(item=>
      item.url.startsWith("/assets/local-ocr/core/")&&
      ((item.url.endsWith(".wasm.js")&&item.status===200&&item.mime?.startsWith("text/javascript"))||
       (item.url.endsWith(".wasm")&&item.status===200&&item.mime==="application/wasm")));
    const languageRequest=requests.find(item=>item.url==="/assets/local-ocr/lang/eng.traineddata.gz");
    assert.ok(workerRequest&&workerRequest.status===200&&workerRequest.mime?.startsWith("text/javascript"),`local OCR worker did not load with expected status/MIME; ${diagnostics}`);
    assert.ok(wasmRequest,`local OCR WASM core did not load with expected status/MIME; ${diagnostics}`);
    assert.ok(languageRequest&&languageRequest.status===200&&languageRequest.mime==="application/gzip",`local English data did not load with expected status/MIME; ${diagnostics}`);
    console.log(`PASS browser OCR: text recognized; local requests=${requests.length}; worker/WASM/language HTTP 200; 0 write/API requests; blocked external attempts=${blockedExternal.length}; 0 CSP violations.`);
  }catch(error){
    error.message=`${error.message}\nChromium diagnostics: ${diagnostics}`;
    throw error;
  }
}finally{
  cdp?.close();
  if(child&&child.exitCode===null){
    child.kill("SIGTERM");
    await Promise.race([childClosed||Promise.resolve(),delay(2000)]);
    if(child.exitCode===null)child.kill("SIGKILL");
  }
  await new Promise(resolve=>server.close(()=>resolve()));
  await rm(profile,{recursive:true,force:true});
}
