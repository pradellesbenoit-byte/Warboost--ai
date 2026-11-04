import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [vercel,serverSource]=await Promise.all([
  readFile(path.join(root,"vercel.json"),"utf8").then(JSON.parse),
  readFile(path.join(root,"server.mjs"),"utf8")
]);

const vercelRule=vercel.headers.find(rule=>rule.source==="/(.*)");
assert.ok(vercelRule,"Vercel global security-header rule is missing");
const vercelHeaders=vercelRule.headers;
const vercelCsp=vercelHeaders.find(header=>header.key==="Content-Security-Policy")?.value;
const expectedVercelCsp="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co https://*.supabase.in; upgrade-insecure-requests";
assert.equal(vercelCsp,expectedVercelCsp,"Vercel CSP changed outside the targeted WASM permission");
assert.deepEqual(vercelHeaders.filter(header=>header.key!=="Content-Security-Policy"),[
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"Permissions-Policy",value:"camera=(self), microphone=(), geolocation=()"}
],"Vercel non-CSP security headers changed");

const serverCsp=serverSource.match(/const CSP="([^"]+)";/)?.[1];
const expectedServerCsp="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://*.replit.com https://*.replit.dev; form-action 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co https://*.supabase.in";
assert.equal(serverCsp,expectedServerCsp,"Node server CSP changed outside the targeted WASM permission");
const securityHeadersBlock=serverSource.match(/function securityHeaders\(res\)\{([\s\S]*?)\n\}/)?.[1];
assert.ok(securityHeadersBlock,"Node server securityHeaders(res) function is missing");
const serverHeaderCalls=[...securityHeadersBlock.matchAll(/res\.setHeader\("([^"]+)",\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\);?/g)]
  .map(match=>({key:match[1],value:match[2]??match[3]}));
assert.deepEqual(serverHeaderCalls,[
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"Permissions-Policy",value:"camera=(self), microphone=(), geolocation=()"},
  {key:"Content-Security-Policy",value:"CSP"}
],"Node server security headers changed");

for(const [name,policy] of [["Vercel",vercelCsp],["Node server",serverCsp]]){
  const scriptSources=policy.split(";").map(value=>value.trim()).find(value=>value.startsWith("script-src "));
  const connectSources=policy.split(";").map(value=>value.trim()).find(value=>value.startsWith("connect-src "));
  assert.ok(scriptSources?.split(/\s+/).includes("'wasm-unsafe-eval'"),`${name} script-src must allow WASM compilation`);
  assert.ok(!scriptSources?.split(/\s+/).includes("'unsafe-eval'"),`${name} must not allow JavaScript unsafe-eval`);
  assert.equal(connectSources,"connect-src 'self' https://*.supabase.co https://*.supabase.in",`${name} connect-src was widened or changed`);
}

const requestHandler=serverSource.slice(serverSource.indexOf("const server=http.createServer"));
assert.ok(requestHandler.indexOf("securityHeaders(res)")>=0,"Node server must apply security headers");
assert.ok(requestHandler.indexOf("securityHeaders(res)")<requestHandler.indexOf("if(url.pathname.startsWith(\"/api/\"))"),"security headers must be applied before API/static routing");
assert.ok(requestHandler.includes("await staticFile(req,res,url)"),"static worker and page requests must use the shared security-header request handler");

console.log("PASS local OCR CSP: Vercel and Node page/worker policies allow WASM only; eval and unrelated headers/connect sources unchanged.");
