import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

const path=new URL("../assets/last-war-knowledge.json",import.meta.url);
const official=new Set(["wiki.lastwar.com","lastwar.com","www.lastwar.com"]);
const community=new Set(["lastwar.wiki","lastwarvault.com"]);
export const KNOWLEDGE_REFRESH_MS=24*60*60*1000;
let cached=null,inFlight=null,lastAttempt=0,diskRevision=null;
export function approvedSource(source){
  try{
    const url=new URL(source.url);
    return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&
      !/\/(?:api|graphql|auth|login|account|player|user)(?:\/|$)/i.test(url.pathname)&&
      (source.kind==="official"?official:community).has(url.hostname);
  }catch{return false}
}
export function visibleText(html){
  return String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi," ")
    .replace(/<[^>]*>/g," ").replace(/&(nbsp|amp|quot|lt|gt|apos);/gi,
      (_,key)=>({nbsp:" ",amp:"&",quot:'"',lt:"<",gt:">",apos:"'"}[key.toLowerCase()]))
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,value)=>{
      const code=value[0].toLowerCase()==="x"?parseInt(value.slice(1),16):Number(value);
      return code>=32&&code<=0x10ffff?String.fromCodePoint(code):" ";
    }).replace(/\s+/g," ").trim();
}
export function discoverPublicNotices(html,source,now){
  const notices=[],seen=new Set(),pattern=/<(a|h[1-3])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const document=String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi," ");
  for(const match of document.matchAll(pattern)){
    const title=visibleText(match[3]);
    if(title.length<8||title.length>180||!/update|patch|version|season|exclusive weapon|awakening/i.test(title))continue;
    let url=source.url;
    const href=match[2].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if(href)try{url=new URL(href,source.url).href}catch{continue}
    if(!approvedSource({...source,url})||seen.has(`${url}:${title}`))continue;
    seen.add(`${url}:${title}`);
    notices.push({title,url,source_id:source.id,observed_at:now,published_at:null,
      review_status:"requires_article_review",author_verified:false,scope:null});
    if(notices.length>=12)break;
  }
  return notices;
}
export function robotsAllowed(text,pathname){
  const groups=[];let group=null;
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.split("#")[0].trim(),match=line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if(!match)continue;
    if(match[1].toLowerCase()==="user-agent"){
      if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group)}
      group.agents.push(match[2].toLowerCase());
    }else if(group&&match[2])group.rules.push({allow:match[1].toLowerCase()==="allow",path:match[2]});
  }
  const specific=groups.filter(group=>group.agents.some(agent=>agent!=="*"&&"warboost-public-knowledge-check/1.0".startsWith(agent)));
  const selected=specific.length?specific:groups.filter(group=>group.agents.includes("*"));
  const rules=selected.flatMap(group=>group.rules).filter(rule=>{
    const end=rule.path.endsWith("$"),path=end?rule.path.slice(0,-1):rule.path;
    const pattern=path.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*");
    return new RegExp("^"+pattern+(end?"$":"")).test(pathname);
  }).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
  return !rules.length||rules[0].allow;
}
async function boundedText(response,limit=512000){
  if(!response.body?.getReader){const text=await response.text();if(Buffer.byteLength(text)>limit)throw Error("source_too_large");return text}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>limit)throw Error("source_too_large");chunks.push(Buffer.from(value))}}
  finally{await reader.cancel().catch(()=>{})}
  return Buffer.concat(chunks).toString("utf8");
}
export async function inspectKnowledgeSource(source,{fetchImpl=fetch,now=new Date().toISOString()}={}){
  const out={...source,last_attempt_at:now,status:"unavailable",error:null};
  if(!approvedSource(source))return {...out,error:"source_not_allowlisted"};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  const options={signal:controller.signal,redirect:"manual",headers:{"User-Agent":"WarBoost-Public-Knowledge-Check/1.0","Accept":"text/html,text/plain"}};
  try{
    const url=new URL(source.url),robots=await fetchImpl(`${url.origin}/robots.txt`,options);
    if(robots.status!==404){
      if(!robots.ok)throw Error("robots_unavailable");
      if(!robotsAllowed(await boundedText(robots,64000),url.pathname))throw Error("robots_disallowed");
    }
    const response=await fetchImpl(url.href,options);
    if(!response.ok)throw Error(`source_http_${response.status}`);
    const contentType=response.headers?.get?.("content-type")||"";
    if(contentType&&!/text\/(?:html|plain)|application\/(?:rss|atom)\+xml/i.test(contentType))throw Error("not_a_public_document");
    const html=await boundedText(response),text=visibleText(html);
    if(text.length<100)throw Error("source_requires_public_browser_review");
    if(/sign in to continue|access denied|service temporarily unavailable/i.test(text))throw Error("source_content_unavailable");
    return {...out,status:"verified",verified_at:now,content_hash:createHash("sha256").update(text).digest("hex"),text,
      notices:discoverPublicNotices(html,source,now)};
  }catch(error){return {...out,error:controller.signal.aborted?"source_timeout":String(error.message||"source_unavailable").slice(0,80)}}
  finally{clearTimeout(timer)}
}
export async function refreshKnowledgeSnapshot(snapshot,{fetchImpl=fetch,now=new Date().toISOString()}={}){
  const enabled=(snapshot.sources||[]).filter(source=>source.enabled).slice(0,4);
  // At most two concurrent public reads; never sends a profile or capture.
  const checks=[];
  for(let i=0;i<enabled.length;i+=2)checks.push(...await Promise.all(
    enabled.slice(i,i+2).map(source=>inspectKnowledgeSource(source,{fetchImpl,now}))));
  const facts=(snapshot.facts||[]).map(fact=>{
    const source=checks.find(row=>row.id===fact.source_id),quote=visibleText(fact.evidence_quote||"");
    const verified=source?.status==="verified"&&source.kind==="official"&&source.editorial==="publisher"&&
      source.url===fact.source_url&&fact.review_status==="approved"&&quote.length>=80&&source.text?.includes(quote)&&
      fact.approved_source_hash===source.content_hash;
    return {...fact,evidence_verified:Boolean(verified),verified_at:verified?now:fact.verified_at||null};
  });
  const sources=(snapshot.sources||[]).map(source=>{
    const checked=checks.find(row=>row.id===source.id);if(!checked)return source;
    const {text,notices,...metadata}=checked;return metadata;
  });
  const discoveries=new Map((snapshot.discoveries||[]).map(row=>[`${row.url}:${row.title}`,row]));
  for(const row of checks.flatMap(check=>check.notices||[]))discoveries.set(`${row.url}:${row.title}`,row);
  const revision=createHash("sha256").update(JSON.stringify({sources,facts})).digest("hex").slice(0,20);
  return {...snapshot,sources,facts,discoveries:[...discoveries.values()].slice(-100),revision,last_attempt_at:now,
    verified_at:checks.some(row=>row.status==="verified")?now:snapshot.verified_at||null};
}
export async function loadKnowledge({refresh=false}={}){
  if(inFlight)return inFlight;
  const disk=JSON.parse(await readFile(path,"utf8"));
  const {revision,...content}=disk;
  const fingerprint=createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0,20);
  if(!cached||diskRevision!==fingerprint){
    cached={...disk,revision:fingerprint};diskRevision=fingerprint;lastAttempt=Date.parse(disk.last_attempt_at||"")||0;
  }
  if(!refresh||Date.now()-lastAttempt<KNOWLEDGE_REFRESH_MS)return cached;
  lastAttempt=Date.now();
  inFlight=refreshKnowledgeSnapshot(cached).then(result=>(cached=result)).finally(()=>{inFlight=null});
  return inFlight;
}
