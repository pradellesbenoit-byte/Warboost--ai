function env(){
  return {url:process.env.SUPABASE_URL,pub:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY};
}
function json(res,status,data){res.setHeader("Cache-Control","no-store");return res.status(status).json(data)}
async function authUser(req){
  const {url,pub}=env();if(!url||!pub)throw new Error("Supabase public non configuré.");
  const h=req.headers?.authorization||req.headers?.Authorization||"";const m=String(h).match(/^Bearer\s+(.+)$/i);if(!m)return null;
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:pub,Authorization:`Bearer ${m[1]}`}});if(!r.ok)return null;return r.json();
}
function adminHeaders(extra={}){const {secret}=env();const h={apikey:secret,"Content-Type":"application/json",...extra};if(secret&&!String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;return h}
async function adminRest(path,opts={}){const {url,secret}=env();if(!url||!secret)throw new Error("SUPABASE_SECRET_KEY manquante.");return fetch(`${url}/rest/v1/${path}`,{...opts,headers:adminHeaders(opts.headers||{})})}
async function getSubscription(userId){const r=await adminRest(`warboost_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`);if(!r.ok)throw new Error(`Lecture abonnement impossible (${r.status}).`);const rows=await r.json();return rows?.[0]||null}
function isPro(sub){return !!sub&&["active","trialing"].includes(String(sub.status||""))}
function today(){return new Date().toISOString().slice(0,10)}
async function rpc(name,body){const r=await adminRest(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.message||data?.hint||`RPC ${name} ${r.status}`);return data}
async function reserveCredit(userId){const limit=50;const rows=await rpc("consume_warboost_ai_credit",{p_user:userId,p_day:today(),p_limit:limit});const row=Array.isArray(rows)?rows[0]:rows;const used=Number(row?.used||0);return {allowed:!!row?.allowed,plan:"pro",used,limit,remaining:Math.max(0,limit-used)}}
async function refundCredit(userId){try{await rpc("refund_warboost_ai_credit",{p_user:userId,p_day:today()})}catch(e){console.error("scan quota refund",e)}}
function outputText(data){if(data?.output_text)return data.output_text;const out=[];for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&c?.text)out.push(c.text);return out.join("\n")}
function parseJson(text){const t=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```$/i,"").trim();return JSON.parse(t)}

// V20.5.1: UI translations reuse this existing Serverless Function so WarBoost
// stays within the Vercel Hobby limit instead of creating /api/ui-translate.js.
const UI_TRANSLATE_LANGS={es:"Spanish",de:"German",ja:"Japanese",zh:"Simplified Chinese",ar:"Modern Standard Arabic",en:"British English","en-us":"American English"};
const uiTranslateRate=globalThis.__warboostTranslateRate||(globalThis.__warboostTranslateRate=new Map());
function uiTranslateAllowed(req){
  const ip=String(req.headers?.["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
  const now=Date.now(),windowMs=60_000,max=30;let x=uiTranslateRate.get(ip);
  if(!x||now-x.at>windowMs)x={at:now,n:0};x.n++;uiTranslateRate.set(ip,x);return x.n<=max;
}
async function handleUiTranslate(req,res){
  if(!uiTranslateAllowed(req))return json(res,429,{error:"Too many translation requests"});
  const target=String(req.body?.target_language||"").toLowerCase();
  if(!UI_TRANSLATE_LANGS[target])return json(res,400,{error:"Unsupported language"});
  const texts=Array.isArray(req.body?.texts)?req.body.texts:[];
  if(!texts.length||texts.length>70)return json(res,400,{error:"Send 1 to 70 strings"});
  const clean=texts.map(x=>String(x??"").slice(0,1200));
  const chars=clean.reduce((n,x)=>n+x.length,0);if(chars>30000)return json(res,413,{error:"Translation batch too large"});
  const model=process.env.OPENAI_TRANSLATION_MODEL||process.env.OPENAI_MODEL||"gpt-5";
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({
      model,reasoning:{effort:"minimal"},
      instructions:`Translate each WarBoost mobile-game UI string from its current language into ${UI_TRANSLATE_LANGS[target]}. Never leave French untranslated unless it is a proper name. Preserve emojis, numbers, hero names, product names, R5/R4, VS, PRO, WarBoost and Last War. Preserve placeholders and punctuation. Use concise natural game-interface wording. Do not add explanations. Return JSON only with exactly one translation for every input string, in the same order. For Arabic use natural Modern Standard Arabic and do not reverse numbers or product names.`,
      input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({texts:clean})}]}],
      text:{format:{type:"json_schema",name:"translations",strict:true,schema:{type:"object",additionalProperties:false,properties:{translations:{type:"array",items:{type:"string"},minItems:clean.length,maxItems:clean.length}},required:["translations"]}}}
    })});
    const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={}}
    if(!r.ok)return json(res,502,{error:"Translation engine unavailable"});
    const parsed=parseJson(outputText(data));
    if(!Array.isArray(parsed?.translations)||parsed.translations.length!==clean.length)return json(res,502,{error:"Invalid translation response"});
    return json(res,200,{translations:parsed.translations});
  }catch(e){return json(res,e?.name==="AbortError"?504:500,{error:"Translation temporarily unavailable"})}
  finally{clearTimeout(timer)}
}



/* ===== V20.5.27 • VERIFIED ALLIANCE SYNC =====
   Goal: a WarBoost R5/R4 account can sync only the alliance that LastWar Tools
   currently reports for that authenticated account's Last War nickname.

   Security model:
   - The browser never chooses the alliance tag.
   - WarBoost takes the Last War nickname from authenticated Supabase user metadata.
   - The server searches that player on the selected server.
   - The alliance tag is derived from that player record.
   - WarBoost downloads that alliance roster and confirms the same player is present as R4/R5.
   - Only then is the roster returned to the browser.

   This prevents normal users from typing another alliance tag and syncing it.
   It is not cryptographic ownership proof of a Last War account because Last War does
   not expose an official account-linking OAuth/API to WarBoost.

   Reuses /api/player-scan so Vercel Hobby does not gain another Serverless Function.
   LASTWAR_TOOLS_API_KEY stays server-side.

   Optional overrides:
   - LASTWAR_TOOLS_PLAYER_SEARCH_URL (exact endpoint / template)
   - LASTWAR_TOOLS_ALLIANCE_MEMBERS_URL (exact endpoint / template)
   - LASTWAR_TOOLS_API_BASE (default https://api.lastwar.dev)
   - LASTWAR_TOOLS_AUTH_MODE = bearer | x-api-key | auto
*/
const allianceSyncRate=globalThis.__warboostAllianceSyncRate||(globalThis.__warboostAllianceSyncRate=new Map());
const allianceDiagRate=globalThis.__warboostAllianceDiagRate||(globalThis.__warboostAllianceDiagRate=new Map());
const playerProfileSyncRate=globalThis.__warboostPlayerProfileSyncRate||(globalThis.__warboostPlayerProfileSyncRate=new Map());

// V20.5.27 — Token Saver + Alliance Cache: keep secrets server-side, cache only a signed
// player/alliance identity token, stop immediately on token exhaustion, and reserve API calls
// for Alliance Members whenever a valid cache is available.
function clampLastWarTimeout(v,fallback,min=5000,max=45000){
  const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;
}
function lastwarTimeout(provider,kind='player'){
  const legacy=provider==='legacy';
  if(kind==='alliance')return clampLastWarTimeout(
    legacy?process.env.LASTWAR_TOOLS_LEGACY_ALLIANCE_TIMEOUT_MS:process.env.LASTWAR_TOOLS_ALLIANCE_TIMEOUT_MS,
    legacy?36000:22000
  );
  return clampLastWarTimeout(
    legacy?process.env.LASTWAR_TOOLS_LEGACY_PLAYER_TIMEOUT_MS:process.env.LASTWAR_TOOLS_PLAYER_TIMEOUT_MS,
    legacy?32000:16000
  );
}
function normalizeLastWarApiKey(value){
  let s=String(value||'').trim();
  s=s.replace(/^[\s"'`]+|[\s"'`]+$/g,'');
  const bearer=s.match(/(?:authorization\s*:\s*)?bearer\s+([^\s"'`]+)/i);
  if(bearer?.[1])return bearer[1].trim();
  const xkey=s.match(/(?:x-api-key\s*:\s*)([^\s"'`]+)/i);
  if(xkey?.[1])return xkey[1].trim();
  const token=s.match(/\b(lw_[A-Za-z0-9._-]+)\b/);
  return token?.[1]||s;
}
function safeAttempt(e,provider){
  return {
    provider:provider||e?.provider||null,
    stage:e?.stage||'unknown',
    http_status:e?.upstream_status||null,
    result:e?.name==='AbortError'||e?.status===504?'timeout':'error',
    elapsed_ms:Number(e?.elapsed_ms||0)||null,
    timeout_ms:Number(e?.timeout_ms||0)||null
  };
}

function parseUpstreamPower(v){
  if(v==null)return 0;
  const raw=String(v).trim().toUpperCase().replace(/\s/g,"").replace(",", ".");
  if(!raw)return 0;
  const n=parseFloat(raw);
  if(!Number.isFinite(n))return 0;
  if(raw.endsWith("B"))return Math.round(n*1e9);
  if(raw.endsWith("M"))return Math.round(n*1e6);
  if(raw.endsWith("K"))return Math.round(n*1e3);
  return Math.round(n);
}
function normalizeAllianceRank(v){
  const x=String(v??"").trim().toUpperCase();
  const m=x.match(/R?([1-5])/);
  if(m)return `R${m[1]}`;
  const n=Number(v);
  return n>=1&&n<=5?`R${n}`:"R3";
}
function firstValue(obj,keys){
  for(const k of keys){
    const v=obj?.[k];
    if(v!==undefined&&v!==null&&v!=="")return v;
  }
  return null;
}
function normalizeName(v){
  return String(v||"").trim().normalize("NFKC").toLocaleLowerCase();
}
function extractAllianceMembers(data){
  const candidates=[
    data?.members,data?.players,data?.items,data?.results,
    data?.data?.members,data?.data?.players,data?.data?.items,data?.data?.results,
    data?.alliance?.members,data?.alliance?.players,
    data?.data?.alliance?.members,data?.data?.alliance?.players,
    Array.isArray(data?.data)?data.data:null,Array.isArray(data)?data:null
  ];
  return candidates.find(Array.isArray)||[];
}
function normalizeAllianceMember(m){
  const name=String(firstValue(m,["name","player_name","commander_name","username","nickname","display_name"])||"").trim();
  if(!name)return null;
  const power=parseUpstreamPower(firstValue(m,["power","fight_power","total_power","combat_power","strength","alliance_power"]));
  const hq=Number(firstValue(m,["hq_level","hq","base_level","headquarters_level","level","hqLevel"]))||null;
  const roleRaw=firstValue(m,["role","rank","alliance_role","member_role","r_level","allianceRank"]);
  return {
    name,
    rank:roleRaw!=null?normalizeAllianceRank(roleRaw):null,
    power,
    power_m:power?Math.round(power/100000)/10:null,
    hq_level:hq,
    player_id:firstValue(m,["player_id","id","uid","playerId"])||null
  };
}
function extractPlayerRecord(data){
  const candidates=[
    data?.player,data?.result?.player,data?.data?.player,
    data?.result,data?.data,
    Array.isArray(data?.players)?data.players[0]:null,
    Array.isArray(data?.results)?data.results[0]:null,
    Array.isArray(data?.data?.players)?data.data.players[0]:null,
    Array.isArray(data?.data?.results)?data.data.results[0]:null
  ];
  const p=candidates.find(x=>x&&typeof x==="object"&&!Array.isArray(x));
  if(!p)return null;
  const name=String(firstValue(p,["name","player_name","commander_name","username","nickname","display_name"])||"").trim();
  if(!name)return null;
  const allianceObj=p?.alliance&&typeof p.alliance==="object"?p.alliance:{};
  const allianceTag=String(
    firstValue(p,["alliance_tag","allianceTag","tag"])||
    firstValue(allianceObj,["tag","alliance_tag","name"])||""
  ).trim();
  const server=String(firstValue(p,["server_id","server","serverId","zone_id","kingdom"])||"").trim();
  const hq=Number(firstValue(p,["hq_level","hq","base_level","headquarters_level","level","hqLevel"]))||null;
  const power=parseUpstreamPower(firstValue(p,["power","fight_power","total_power","combat_power","strength","player_power"]));
  const x=Number(firstValue(p,["x","coord_x","position_x"]));
  const y=Number(firstValue(p,["y","coord_y","position_y"]));
  const roleRaw=firstValue(p,["role","rank","alliance_role","member_role","r_level","allianceRank"]);
  const allianceId=firstValue(p,["alliance_id","allianceId"])||firstValue(allianceObj,["id","alliance_id","allianceId"])||null;
  return {
    name,
    server_id:server||null,
    alliance_tag:allianceTag||null,
    alliance_id:allianceId,
    rank:roleRaw!=null?normalizeAllianceRank(roleRaw):null,
    hq_level:hq,
    power:power||null,power_m:power?Math.round(power/100000)/10:null,
    coordinates:Number.isFinite(x)&&Number.isFinite(y)?`${x}, ${y}`:null,
    player_id:firstValue(p,["player_id","id","uid","playerId"])||null
  };
}
function lastwarCurrentHeaders(apiKey){
  return {
    Accept:"application/json",
    Authorization:`Bearer ${apiKey}`,
    "User-Agent":"WarBoost/20.6.2"
  };
}
function lastwarLegacyHeaders(apiKey){
  return {
    Accept:"application/json",
    "X-API-Key":apiKey,
    "User-Agent":"WarBoost/20.6.2"
  };
}
function base64UrlEncode(value){
  return Buffer.from(value).toString("base64url");
}
function base64UrlDecode(value){
  return Buffer.from(String(value||""),"base64url").toString("utf8");
}
function lastwarCacheTtlMs(){
  const hours=Number(process.env.LASTWAR_TOOLS_PLAYER_CACHE_HOURS||168);
  const safe=Number.isFinite(hours)?Math.max(1,Math.min(720,hours)):168;
  return Math.round(safe*3600_000);
}
function lastwarCacheSignature(apiKey,payloadPart){
  const crypto=require("crypto");
  return crypto.createHmac("sha256",`warboost:lastwar:player-cache:v1:${apiKey}`).update(payloadPart).digest("base64url");
}
function makeLastWarPlayerCacheToken(apiKey,userId,player,provider){
  const now=Date.now(),exp=now+lastwarCacheTtlMs();
  const payload={
    v:1,uid:String(userId||""),iat:now,exp,
    provider:String(provider||"current"),
    player:{
      name:String(player?.name||""),server_id:String(player?.server_id||""),
      alliance_tag:String(player?.alliance_tag||""),alliance_id:player?.alliance_id??null,
      rank:player?.rank||null,hq_level:player?.hq_level||null,power:player?.power||null,power_m:player?.power_m||null,coordinates:player?.coordinates||null,player_id:player?.player_id||null
    }
  };
  const part=base64UrlEncode(JSON.stringify(payload));
  return {token:`${part}.${lastwarCacheSignature(apiKey,part)}`,expires_at:new Date(exp).toISOString()};
}
function verifyLastWarPlayerCacheToken(apiKey,userId,identity,token){
  try{
    const crypto=require("crypto");
    const [part,sig,extra]=String(token||"").split(".");
    if(!part||!sig||extra)return null;
    const expected=lastwarCacheSignature(apiKey,part);
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const payload=JSON.parse(base64UrlDecode(part));
    if(payload?.v!==1||String(payload?.uid||"")!==String(userId||""))return null;
    if(!Number(payload?.exp)||Date.now()>Number(payload.exp))return null;
    const player=payload?.player;
    if(!player?.name||!player?.alliance_tag)return null;
    if(normalizeName(player.name)!==normalizeName(identity.accountName))return null;
    if(String(player.server_id||"")!==String(identity.serverId||""))return null;
    const provider=["legacy","current"].includes(String(payload.provider))?String(payload.provider):"current";
    return {
      player:{...player,server_id:String(player.server_id)},provider,cached:true,token_calls:0,
      http_status:200,elapsed_ms:0,total_elapsed_ms:0,timeout_ms:0,fallback_used:false,
      cache_expires_at:new Date(Number(payload.exp)).toISOString(),
      attempts:[{provider,stage:"player_cache",result:"ok",http_status:200,elapsed_ms:0,timeout_ms:0}]
    };
  }catch{return null}
}
function cachedProbeOrNull(apiKey,user,identity,req){
  return verifyLastWarPlayerCacheToken(apiKey,user?.id,identity,req?.body?.player_cache_token);
}
function publicUpstreamError(status,kind="API",provider="current"){
  if(status===402)return "Solde de tokens LastWar Tools épuisé (HTTP 402). Attends le prochain reset indiqué sur ton dashboard LastWar Tools ou recharge ton solde.";
  if(status===401||status===403)return provider==="legacy"
    ? "La clé LastWar Tools a été refusée par l’API historique (X-API-Key). Vérifie que Vercel contient la clé complète créée sur LastWar Tools."
    : "La clé LastWar Tools a été refusée par l’API actuelle (Bearer). Vérifie que Vercel contient la clé complète créée sur LastWar Tools.";
  if(status===404||status===405)return `Le point d’accès ${kind} n’est pas disponible sur cette API.`;
  if(status===429)return "Quota LastWar Tools atteint. Réessaie après le renouvellement de tes tokens.";
  if(status>=500)return `Le service ${kind} est temporairement indisponible (HTTP ${status}).`;
  return `LastWar Tools a répondu avec le statut ${status}.`;
}
function templateUrl(raw,replacements={}){
  let out=String(raw||"");
  for(const [k,v] of Object.entries(replacements))out=out.replaceAll(`{${k}}`,encodeURIComponent(String(v??"")));
  return out;
}
function currentPlayerSearchUrl(serverId,playerName){
  const configured=String(process.env.LASTWAR_TOOLS_PLAYER_SEARCH_URL||"").trim();
  const raw=configured||"https://api.lastwar.dev/v1/player/search";
  const u=new URL(templateUrl(raw,{server_id:serverId,server:serverId,name:playerName,player_name:playerName}));
  if(!u.searchParams.has("name"))u.searchParams.set("name",playerName);
  if(!u.searchParams.has("server"))u.searchParams.set("server",serverId);
  return u.toString();
}
function legacyPlayerSearchUrl(serverId,playerName){
  const configured=String(process.env.LASTWAR_TOOLS_LEGACY_PLAYER_SEARCH_URL||"").trim();
  const raw=configured||"https://api.lastwar.tools/world/find-player";
  const u=new URL(templateUrl(raw,{server_id:serverId,server:serverId,name:playerName,player_name:playerName}));
  if(!u.searchParams.has("name"))u.searchParams.set("name",playerName);
  if(!u.searchParams.has("server_id"))u.searchParams.set("server_id",serverId);
  return u.toString();
}
function safeAllianceMembersUrl(serverId,tag,allianceId){
  const configured=String(process.env.LASTWAR_TOOLS_ALLIANCE_MEMBERS_URL||"").trim();
  const raw=configured||"https://api.lastwar.dev/v1/alliance/members";
  const u=new URL(templateUrl(raw,{
    server_id:serverId,server:serverId,alliance_tag:tag,tag,
    alliance_id:allianceId||"",id:allianceId||""
  }));
  if(!u.searchParams.has("server"))u.searchParams.set("server",serverId);
  if(!u.searchParams.has("tag"))u.searchParams.set("tag",tag);
  if(allianceId&&!u.searchParams.has("alliance_id"))u.searchParams.set("alliance_id",String(allianceId));
  return u.toString();
}
function allianceHeadersForUrl(url,apiKey){
  try{
    const host=new URL(url).hostname.toLowerCase();
    if(host==="api.lastwar.tools")return lastwarLegacyHeaders(apiKey);
  }catch{}
  return lastwarCurrentHeaders(apiKey);
}
async function fetchLastWarSafe(url,headers,timeoutMs=16000){
  const controller=new AbortController(),started=Date.now(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{method:"GET",signal:controller.signal,headers});
    const raw=await r.text();
    let data={};
    try{data=raw?JSON.parse(raw):{}}catch{data={raw:String(raw||"").slice(0,500)}}
    return {r,data,raw,elapsed_ms:Date.now()-started,timeout_ms:timeoutMs};
  }catch(e){
    e.elapsed_ms=Date.now()-started;e.timeout_ms=timeoutMs;throw e;
  }finally{clearTimeout(timer)}
}
function diagnosticError(message,{status=502,stage="unknown",upstream_status=null,token_calls=0,provider=null,elapsed_ms=null,timeout_ms=null,attempts=null,retry_recommended=false}={}){
  const e=new Error(message);e.status=status;e.stage=stage;e.upstream_status=upstream_status;e.token_calls=token_calls;e.provider=provider;
  e.elapsed_ms=elapsed_ms;e.timeout_ms=timeout_ms;e.attempts=attempts;e.retry_recommended=!!retry_recommended;return e;
}
function shouldFallbackToLegacy(e){
  const upstream=Number(e?.upstream_status||0),status=Number(e?.status||0);
  // V20.6.1: a temporary outage must never trigger a second immediate provider call.
  // We only try the alternate provider for an endpoint-compatibility error (404/405).
  if([401,402,403,429].includes(upstream)||[401,402,403,429].includes(status))return false;
  if(e?.retry_recommended||upstream>=500||[502,503,504].includes(status))return false;
  return e?.stage==="player_endpoint" || [404,405].includes(upstream);
}
async function safePlayerProbeMode(apiKey,serverId,accountName,provider="current"){
  const legacy=provider==="legacy";
  const url=legacy?legacyPlayerSearchUrl(serverId,accountName):currentPlayerSearchUrl(serverId,accountName);
  const headers=legacy?lastwarLegacyHeaders(apiKey):lastwarCurrentHeaders(apiKey);
  const timeoutMs=lastwarTimeout(provider,"player");
  let result;
  try{result=await fetchLastWarSafe(url,headers,timeoutMs)}catch(e){
    if(e?.name==="AbortError")throw diagnosticError(
      legacy
        ? `Player Search historique n’a pas répondu dans ${Math.round(timeoutMs/1000)} s. LastWar Tools est probablement ralenti ; WarBoost a interrompu proprement l’appel.`
        : `Player Search actuel n’a pas répondu dans ${Math.round(timeoutMs/1000)} s. WarBoost arrête ici pour éviter un second appel pendant la panne.`,
      {status:504,stage:"player_search",token_calls:1,provider,elapsed_ms:e.elapsed_ms,timeout_ms:timeoutMs,retry_recommended:true}
    );
    throw diagnosticError(`Connexion à ${legacy?"Player Search historique":"Player Search actuel"} impossible.`,{status:502,stage:"player_search",token_calls:1,provider,elapsed_ms:e?.elapsed_ms,timeout_ms:timeoutMs,retry_recommended:true});
  }
  const {r,data,raw,elapsed_ms}=result;
  if(!r.ok){
    console.error("LastWar Tools player diagnostic",{provider,status:r.status,elapsed_ms,body:String(raw).slice(0,300)});
    throw diagnosticError(publicUpstreamError(r.status,"Player Search",provider),{
      status:r.status===402?402:(r.status===429?429:(r.status===401||r.status===403?401:(r.status>=500?503:502))),
      stage:r.status===402?"tokens_exhausted":(r.status===401||r.status===403?"authentication":(r.status===404||r.status===405?"player_endpoint":"player_search")),
      upstream_status:r.status,token_calls:1,provider,elapsed_ms,timeout_ms:timeoutMs,retry_recommended:r.status>=500
    });
  }
  const player=extractPlayerRecord(data);
  if(!player)throw diagnosticError(`La clé API est acceptée et ${legacy?"Player Search historique":"Player Search actuel"} répond, mais aucun profil exploitable n’a été retourné pour ce pseudo.`,{status:404,stage:"player_not_found",upstream_status:r.status,token_calls:1,provider,elapsed_ms,timeout_ms:timeoutMs});
  if(normalizeName(player.name)!==normalizeName(accountName))throw diagnosticError("Player Search répond, mais le profil retourné ne correspond pas exactement au pseudo saisi.",{status:409,stage:"player_mismatch",upstream_status:r.status,token_calls:1,provider,elapsed_ms,timeout_ms:timeoutMs});
  if(player.server_id&&String(player.server_id)!==String(serverId))throw diagnosticError("Player Search répond, mais le profil trouvé appartient à un autre serveur.",{status:409,stage:"server_mismatch",upstream_status:r.status,token_calls:1,provider,elapsed_ms,timeout_ms:timeoutMs});
  if(!player.alliance_tag)throw diagnosticError("Player Search fonctionne, mais ce profil n’indique actuellement aucune alliance.",{status:409,stage:"alliance_missing",upstream_status:r.status,token_calls:1,provider,elapsed_ms,timeout_ms:timeoutMs});
  return {player,raw:data,http_status:r.status,token_calls:1,provider,fallback_used:false,elapsed_ms,timeout_ms:timeoutMs,attempts:[{provider,stage:"player_found",http_status:r.status,result:"ok",elapsed_ms,timeout_ms:timeoutMs}]};
}
async function smartPlayerProbe(apiKey,serverId,accountName,providerHint=""){
  const hint=String(providerHint||"").toLowerCase();
  const firstProvider=(hint==="legacy"||hint==="current")?hint:"current";
  const secondProvider=firstProvider==="legacy"?"current":"legacy";
  try{return await safePlayerProbeMode(apiKey,serverId,accountName,firstProvider)}
  catch(first){
    first.attempts=[safeAttempt(first,firstProvider)];
    if(!shouldFallbackToLegacy(first))throw first;
    try{
      const second=await safePlayerProbeMode(apiKey,serverId,accountName,secondProvider);
      second.token_calls=Number(first.token_calls||1)+Number(second.token_calls||1);
      second.fallback_used=true;
      second.first_status=first.upstream_status||first.status||null;
      second.first_provider=firstProvider;
      second.attempts=[safeAttempt(first,firstProvider),...(second.attempts||[])];
      second.total_elapsed_ms=second.attempts.reduce((n,a)=>n+Number(a?.elapsed_ms||0),0);
      return second;
    }catch(second){
      second.token_calls=Number(first.token_calls||1)+Number(second.token_calls||1);
      second.first_status=first.upstream_status||first.status||null;
      second.first_provider=firstProvider;
      second.attempts=[safeAttempt(first,firstProvider),safeAttempt(second,secondProvider)];
      second.total_elapsed_ms=second.attempts.reduce((n,a)=>n+Number(a?.elapsed_ms||0),0);
      if(second.status===504&&secondProvider==="legacy"){
        second.message=`LastWar Tools ne répond pas assez vite : API actuelle indisponible puis API historique sans réponse après ${Math.round(Number(second.timeout_ms||32000)/1000)} s. Réessaie plus tard ; les imports par captures restent disponibles.`;
      }
      throw second;
    }
  }
}
function allianceMemberCandidates(serverId,tag,allianceId,provider="current"){
  const out=[];
  const add=(url,label,mode)=>{if(!url||out.some(x=>x.url===url))return;out.push({url,label,provider:mode})};
  const make=(raw,mode,label)=>{
    const u=new URL(templateUrl(raw,{server_id:serverId,server:serverId,alliance_tag:tag,tag,alliance_id:allianceId||"",id:allianceId||""}));
    if(mode==="legacy"){
      if(!u.searchParams.has("server_id")&&!u.searchParams.has("server"))u.searchParams.set("server_id",serverId);
      if(!u.searchParams.has("alliance_tag")&&!u.searchParams.has("tag"))u.searchParams.set("alliance_tag",tag);
    }else{
      if(!u.searchParams.has("server")&&!u.searchParams.has("server_id"))u.searchParams.set("server",serverId);
      if(!u.searchParams.has("tag")&&!u.searchParams.has("alliance_tag"))u.searchParams.set("tag",tag);
    }
    if(allianceId&&!u.searchParams.has("alliance_id")&&!u.searchParams.has("id"))u.searchParams.set("alliance_id",String(allianceId));
    add(u.toString(),label,mode);
  };
  const legacyConfigured=String(process.env.LASTWAR_TOOLS_LEGACY_ALLIANCE_MEMBERS_URL||"").trim();
  const currentConfigured=String(process.env.LASTWAR_TOOLS_ALLIANCE_MEMBERS_URL||"").trim();
  if(provider==="legacy"){
    if(legacyConfigured)make(legacyConfigured,"legacy","Historique configurée");
    make("https://api.lastwar.tools/world/alliance-members","legacy","Historique /world/alliance-members");
    if(currentConfigured)make(currentConfigured,"current","Actuelle configurée");
    else make("https://api.lastwar.dev/v1/alliance/members","current","Actuelle /v1/alliance/members");
  }else{
    if(currentConfigured)make(currentConfigured,"current","Actuelle configurée");
    else make("https://api.lastwar.dev/v1/alliance/members","current","Actuelle /v1/alliance/members");
    if(legacyConfigured)make(legacyConfigured,"legacy","Historique configurée");
    make("https://api.lastwar.tools/world/alliance-members","legacy","Historique /world/alliance-members");
  }
  return out.slice(0,3);
}
function retryAllianceCandidate(err){
  const st=Number(err?.upstream_status||err?.status||0),status=Number(err?.status||0);
  if(st===402||status===402)return false;
  // V20.6.1: a second route is allowed only for endpoint compatibility (404/405).
  if([404,405].includes(st))return true;
  // Never burn another token during a 5xx/network/timeout outage.
  if(err?.name==="AbortError"||err?.retry_recommended||st>=500||[502,503,504].includes(status))return false;
  return false;
}
async function fetchAllianceRosterCandidate(apiKey,serverId,player,candidate,requireLeader=true){
  const tag=String(player.alliance_tag||"").trim();
  const headers=candidate.provider==="legacy"?lastwarLegacyHeaders(apiKey):lastwarCurrentHeaders(apiKey);
  const timeoutMs=lastwarTimeout(candidate.provider,"alliance");
  let result;
  try{result=await fetchLastWarSafe(candidate.url,headers,timeoutMs)}catch(e){
    if(e?.name==="AbortError")throw diagnosticError(`Alliance Members (${candidate.label}) n’a pas répondu dans ${Math.round(timeoutMs/1000)} s.`,{status:504,stage:"alliance_members",token_calls:1,provider:candidate.provider,elapsed_ms:e.elapsed_ms,timeout_ms:timeoutMs,retry_recommended:true,attempts:[{provider:candidate.provider,stage:"alliance_members",route:candidate.label,result:"timeout",elapsed_ms:e.elapsed_ms,timeout_ms:timeoutMs}]});
    throw diagnosticError(`Connexion à Alliance Members impossible (${candidate.label}).`,{status:502,stage:"alliance_members",token_calls:1,provider:candidate.provider,elapsed_ms:e?.elapsed_ms,timeout_ms:timeoutMs,retry_recommended:true,attempts:[{provider:candidate.provider,stage:"alliance_members",route:candidate.label,result:"network",elapsed_ms:e?.elapsed_ms||null,timeout_ms:timeoutMs}]});
  }
  const {r,data,raw,elapsed_ms}=result;
  if(!r.ok){
    console.error("LastWar Tools alliance diagnostic",{provider:candidate.provider,route:candidate.label,status:r.status,elapsed_ms,body:String(raw).slice(0,300)});
    const msg=r.status===401||r.status===403?"Player Search a accepté la clé, mais Alliance Members refuse cette requête.":publicUpstreamError(r.status,"Alliance Members",candidate.provider);
    throw diagnosticError(msg,{status:r.status===402?402:(r.status===429?429:(r.status===401||r.status===403?403:(r.status>=500?503:502))),stage:r.status===402?"tokens_exhausted":(r.status===404||r.status===405?"alliance_endpoint":"alliance_members"),upstream_status:r.status,token_calls:1,provider:candidate.provider,elapsed_ms,timeout_ms:timeoutMs,retry_recommended:r.status!==402&&(r.status>=500||r.status===404||r.status===405),attempts:[{provider:candidate.provider,stage:"alliance_members",route:candidate.label,http_status:r.status,result:"error",elapsed_ms,timeout_ms:timeoutMs}]});
  }
  const members=extractAllianceMembers(data).map(normalizeAllianceMember).filter(Boolean).slice(0,100);
  if(!members.length)throw diagnosticError(`Alliance Members répond via ${candidate.label}, mais aucun membre exploitable n’a été retourné.`,{status:502,stage:"alliance_empty",upstream_status:r.status,token_calls:1,provider:candidate.provider,elapsed_ms,timeout_ms:timeoutMs,attempts:[{provider:candidate.provider,stage:"alliance_members",route:candidate.label,http_status:r.status,result:"empty",elapsed_ms,timeout_ms:timeoutMs}]});
  const a=data?.alliance||data?.data?.alliance||data?.meta?.alliance||{};
  const returnedTag=String(firstValue(a,["tag","alliance_tag"])||data?.alliance_tag||tag).trim()||tag;
  const returnedServer=String(firstValue(a,["server_id","server"])||data?.server_id||serverId);
  if(normalizeName(returnedTag)!==normalizeName(tag))throw diagnosticError("L’API a retourné une autre alliance que celle détectée sur ton profil. Import refusé.",{status:403,stage:"alliance_mismatch",upstream_status:r.status,token_calls:1,provider:candidate.provider,elapsed_ms,timeout_ms:timeoutMs});
  const self=members.find(m=>normalizeName(m.name)===normalizeName(player.name));
  if(!self)throw diagnosticError("Ton joueur n’apparaît pas dans le roster retourné pour l’alliance détectée. Import refusé.",{status:403,stage:"self_missing",upstream_status:r.status,token_calls:1,provider:candidate.provider,elapsed_ms,timeout_ms:timeoutMs});
  if(requireLeader&&!["R4","R5"].includes(String(self.rank||"").toUpperCase()))throw diagnosticError("La synchronisation complète est réservée aux membres R4/R5 de leur propre alliance.",{status:403,stage:"rank_check",upstream_status:r.status,token_calls:1,provider:candidate.provider,elapsed_ms,timeout_ms:timeoutMs});
  return {members,self,raw:data,alliance:{tag:returnedTag,server_id:returnedServer,name:firstValue(a,["name","alliance_name"])||null},http_status:r.status,token_calls:1,provider:candidate.provider,route_label:candidate.label,elapsed_ms,timeout_ms:timeoutMs,attempts:[{provider:candidate.provider,stage:"alliance_members",route:candidate.label,http_status:r.status,result:"ok",elapsed_ms,timeout_ms:timeoutMs}]};
}
async function safeAllianceRoster(apiKey,serverId,player,provider="current",maxAttemptsOverride=null,requireLeader=true){
  const candidates=allianceMemberCandidates(serverId,String(player.alliance_tag||"").trim(),player.alliance_id,provider);
  const attempts=[];let calls=0,lastErr=null;
  const configured=Math.max(1,Math.min(3,Number(process.env.LASTWAR_TOOLS_ALLIANCE_MAX_ATTEMPTS||2)||2));
  const maxAttempts=Math.max(1,Math.min(configured,Number(maxAttemptsOverride||configured)||configured));
  for(const c of candidates.slice(0,maxAttempts)){
    try{
      const r=await fetchAllianceRosterCandidate(apiKey,serverId,player,c,requireLeader);r.token_calls=calls+1;r.attempts=[...attempts,...(r.attempts||[])];return r;
    }catch(e){
      calls+=Number(e?.token_calls||1);attempts.push(...(e?.attempts||[{provider:c.provider,stage:e?.stage||"alliance_members",route:c.label,http_status:e?.upstream_status||null,result:"error",elapsed_ms:e?.elapsed_ms||null,timeout_ms:e?.timeout_ms||null}]));lastErr=e;
      if(!retryAllianceCandidate(e)||calls>=maxAttempts)break;
    }
  }
  if(lastErr){lastErr.token_calls=calls;lastErr.attempts=attempts;const routes=attempts.map(a=>a.route).filter(Boolean);lastErr.message=routes.length>1?`Ton joueur et ton alliance ont bien été détectés, mais Alliance Members n’a pas encore répondu correctement. WarBoost a testé ${routes.join(" puis ")}.`:`Ton joueur et ton alliance ont bien été détectés, mais Alliance Members est temporairement indisponible. WarBoost s’est arrêté après un seul appel pour protéger tes tokens.`;throw lastErr}
  throw diagnosticError("Alliance Members indisponible.",{status:502,stage:"alliance_members",token_calls:calls,attempts});
}
function allianceRequestIdentity(req,user){
  const serverId=String(req.body?.server_id||"").trim();
  if(!/^\d{1,6}$/.test(serverId))throw diagnosticError("Numéro de serveur invalide.",{status:400,stage:"input",token_calls:0});
  const requestedName=String(req.body?.player_name||"").trim();
  const metadataName=String(user?.user_metadata?.display_name||"").trim();
  const accountName=requestedName||metadataName;
  if(!accountName || accountName.length<2 || accountName.length>64)throw diagnosticError("Indique ton pseudo Last War exact.",{status:400,stage:"input",token_calls:0});
  return {serverId,accountName};
}
async function requireAllianceEntitlement(req,res){
  try{
    const user=await authUser(req);
    if(!user){json(res,401,{error:"Connecte ton compte WarBoost pour synchroniser ton alliance."});return null}
    const sub=await getSubscription(user.id);
    if(!isPro(sub)){json(res,403,{error:"La synchronisation automatique d’alliance est réservée à WarBoost PRO."});return null}
    return user;
  }catch(e){
    console.error("alliance sync entitlement",e);
    json(res,503,{error:"Vérification du compte WarBoost indisponible."});return null;
  }
}
async function requirePlayerProfileEntitlement(req,res){
  try{
    const user=await authUser(req);if(!user){json(res,401,{error:"Connecte ton compte WarBoost pour synchroniser ton profil."});return null}
    const sub=await getSubscription(user.id);if(!isPro(sub)){json(res,403,{error:"La synchronisation automatique du profil Last War est réservée à WarBoost PRO."});return null}
    return user;
  }catch(e){console.error("player profile sync entitlement",e);json(res,503,{error:"Vérification du compte WarBoost indisponible."});return null}
}
async function handlePlayerProfileSync(req,res){
  const user=await requirePlayerProfileEntitlement(req,res);if(!user)return;
  const now=Date.now(),last=Number(playerProfileSyncRate.get(user.id)||0);if(now-last<20000)return json(res,429,{error:"Patiente quelques secondes avant une nouvelle synchronisation du profil.",retry_after:Math.ceil((20000-(now-last))/1000)});playerProfileSyncRate.set(user.id,now);
  const apiKey=normalizeLastWarApiKey(process.env.LASTWAR_TOOLS_API_KEY);if(!apiKey)return json(res,503,{error:"La connexion LastWar Tools n’est pas configurée dans Vercel (LASTWAR_TOOLS_API_KEY)."});
  let identity;try{identity=allianceRequestIdentity(req,user)}catch(e){return json(res,e.status||400,{error:e.message})}
  const providerHint=String(req.body?.provider_hint||"").toLowerCase();let calls=0;
  try{
    const cached=cachedProbeOrNull(apiKey,user,identity,req);const probe=cached||await smartPlayerProbe(apiKey,identity.serverId,identity.accountName,providerHint);calls+=Number(probe.token_calls||0);
    const signed=makeLastWarPlayerCacheToken(apiKey,user.id,{...probe.player,server_id:probe.player.server_id||identity.serverId},probe.provider);
    let self=null,alliance=null,rosterWarning=null;
    // V20.6.1: a 5xx/timeout never triggers an immediate fallback. A second call is reserved for 404/405 compatibility only.
    if(probe.player?.alliance_tag&&calls<2){
      try{const roster=await safeAllianceRoster(apiKey,identity.serverId,probe.player,probe.provider,Math.max(1,2-calls),false);calls+=Number(roster.token_calls||0);self=roster.self;alliance=roster.alliance}
      catch(e){calls+=Number(e?.token_calls||0);rosterWarning=e?.message||"Alliance Members indisponible."}
    }
    const power=Number(self?.power||probe.player?.power||0)||null;const powerM=Number(self?.power_m||probe.player?.power_m||0)||null;
    const profile={
      name:self?.name||probe.player.name,server_id:String(identity.serverId),alliance_tag:alliance?.tag||probe.player.alliance_tag||null,
      rank:self?.rank||probe.player.rank||null,hq_level:self?.hq_level||probe.player.hq_level||null,power,power_m:powerM,coordinates:probe.player.coordinates||null,player_id:self?.player_id||probe.player.player_id||null
    };
    // V20.6.1: provenance field-by-field. This is intentionally explicit so the
    // scanner / recommendation engine can distinguish API facts from local memory.
    const rosterUsed=!!self;
    const field_sources={
      name:rosterUsed?"alliance_members":"player_search",server_id:"verified_request",
      alliance_tag:alliance?.tag?"alliance_members":"player_search",rank:self?.rank?"alliance_members":(probe.player?.rank?"player_search":null),
      hq_level:self?.hq_level?"alliance_members":(probe.player?.hq_level?"player_search":null),
      power_m:self?.power_m||self?.power?"alliance_members":(probe.player?.power_m||probe.player?.power?"player_search":null),
      coordinates:probe.player?.coordinates?"player_search":null
    };
    const fields=Object.entries({name:profile.name,server_id:profile.server_id,alliance_tag:profile.alliance_tag,rank:profile.rank,hq_level:profile.hq_level,power_m:profile.power_m,coordinates:profile.coordinates}).filter(([,v])=>v!==null&&v!==undefined&&v!=="").map(([k])=>k);
    const weights={name:20,server_id:15,alliance_tag:15,rank:15,hq_level:10,power_m:15,coordinates:10};
    const qualityScore=Math.max(0,Math.min(100,fields.reduce((n,k)=>n+(weights[k]||0),0)));
    const qualityLevel=qualityScore>=90?"excellent":qualityScore>=70?"bon":qualityScore>=50?"partiel":"minimal";
    const partial=!!rosterWarning||qualityScore<70;
    return json(res,200,{ok:true,schema_version:"20.6.1",provider:"LastWar Tools",provider_mode:probe.provider,source:"community_api",identity_verified:true,synced_at:new Date().toISOString(),token_calls:calls,cache_used:!!cached,partial,warning:rosterWarning,fields,field_sources,quality:{score:qualityScore,level:qualityLevel},profile,player_cache_token:signed.token,player_cache_expires_at:signed.expires_at});
  }catch(e){
    calls+=Number(e?.token_calls||0);const status=[400,401,402,403,404,409,429,502,503,504].includes(Number(e?.status))?Number(e.status):502;
    return json(res,status,{error:e?.message||"Synchronisation du profil Last War impossible.",invalidate_player_cache:["self_missing","alliance_mismatch","player_mismatch","server_mismatch"].includes(String(e?.stage||"")),stage:e?.stage||"unknown",http_status:e?.upstream_status||null,token_calls:calls,retry_after:[500,502,503,504].includes(Number(e?.upstream_status||e?.status))?300:undefined,transient_outage:[500,502,503,504].includes(Number(e?.upstream_status||e?.status))});
  }
}

async function handleAllianceApiDiagnostic(req,res){
  const user=await requireAllianceEntitlement(req,res);if(!user)return;
  const now=Date.now(),last=Number(allianceDiagRate.get(user.id)||0);
  if(now-last<20000)return json(res,429,{error:"Patiente quelques secondes avant un nouveau test API.",retry_after:Math.ceil((20000-(now-last))/1000),diagnostic:{stage:"rate_limit",token_calls:0}});
  allianceDiagRate.set(user.id,now);
  const apiKey=normalizeLastWarApiKey(process.env.LASTWAR_TOOLS_API_KEY);
  if(!apiKey)return json(res,503,{error:"La connexion LastWar Tools n’est pas configurée dans Vercel (LASTWAR_TOOLS_API_KEY).",diagnostic:{stage:"configuration",token_calls:0}});
  let identity;
  try{identity=allianceRequestIdentity(req,user)}catch(e){return json(res,e.status||400,{error:e.message,diagnostic:{stage:e.stage||"input",token_calls:0}})}
  const providerHint=String(req.body?.provider_hint||"").toLowerCase();
  try{
    const cached=cachedProbeOrNull(apiKey,user,identity,req);
    const probe=cached||await smartPlayerProbe(apiKey,identity.serverId,identity.accountName,providerHint);
    const signed=makeLastWarPlayerCacheToken(apiKey,user.id,{...probe.player,server_id:probe.player.server_id||identity.serverId},probe.provider);
    return json(res,200,{
      ok:true,provider:"LastWar Tools",provider_mode:probe.provider,mode:cached?"signed_player_cache":"smart_api_fallback",token_calls:probe.token_calls,
      player_cache_token:signed.token,player_cache_expires_at:signed.expires_at,cache_used:!!cached,
      diagnostic:{authentication:"ok",player_search:cached?"cached":"ok",http_status:probe.http_status,stage:cached?"player_cache":"player_found",provider:probe.provider,fallback_used:!!probe.fallback_used,first_status:probe.first_status||null,token_calls:probe.token_calls,elapsed_ms:probe.total_elapsed_ms||probe.elapsed_ms||0,timeout_ms:probe.timeout_ms||null,attempts:probe.attempts||[]},
      player:{name:probe.player.name,server_id:probe.player.server_id||identity.serverId,alliance_tag:probe.player.alliance_tag,rank:probe.player.rank||null,hq_level:probe.player.hq_level||null,player_id:probe.player.player_id||null},
      message:cached
        ? "Cache Player Search sécurisé validé : 0 appel LastWar Tools. Les prochains tokens peuvent être réservés au roster Alliance Members."
        : (probe.fallback_used
          ? "Mode compatible détecté et mis en cache : l’API historique a trouvé ton joueur. La prochaine synchronisation pourra éviter Player Search."
          : "Connexion API validée et profil mis en cache. La prochaine synchronisation pourra éviter Player Search.")
    });
  }catch(e){
    const st=Number(e?.upstream_status||e?.status||0);return json(res,e.status||502,{error:e.message,retry_after:[500,502,503,504].includes(st)?300:undefined,transient_outage:[500,502,503,504].includes(st),diagnostic:{stage:e.stage||"unknown",http_status:e.upstream_status||null,token_calls:e.token_calls||1,provider:e.provider||providerHint||"current",first_status:e.first_status||null,elapsed_ms:e.total_elapsed_ms||e.elapsed_ms||null,timeout_ms:e.timeout_ms||null,attempts:e.attempts||[],retry_recommended:!!e.retry_recommended}});
  }
}
async function handleAllianceSync(req,res){
  const user=await requireAllianceEntitlement(req,res);if(!user)return;
  const now=Date.now(),last=Number(allianceSyncRate.get(user.id)||0);
  if(now-last<45000)return json(res,429,{error:"Patiente quelques secondes avant une nouvelle synchronisation.",retry_after:Math.ceil((45000-(now-last))/1000),diagnostic:{stage:"rate_limit",token_calls:0}});
  allianceSyncRate.set(user.id,now);

  const apiKey=normalizeLastWarApiKey(process.env.LASTWAR_TOOLS_API_KEY);
  if(!apiKey)return json(res,503,{error:"La connexion LastWar Tools n’est pas configurée dans Vercel (LASTWAR_TOOLS_API_KEY).",diagnostic:{stage:"configuration",token_calls:0}});
  let identity;
  try{identity=allianceRequestIdentity(req,user)}catch(e){return json(res,e.status||400,{error:e.message,diagnostic:{stage:e.stage||"input",token_calls:0}})}

  let tokenCalls=0;
  const providerHint=String(req.body?.provider_hint||"").toLowerCase();
  try{
    const cached=cachedProbeOrNull(apiKey,user,identity,req);
    const probe=cached||await smartPlayerProbe(apiKey,identity.serverId,identity.accountName,providerHint);tokenCalls+=Number(probe.token_calls||0);
    const signedBeforeRoster=makeLastWarPlayerCacheToken(apiKey,user.id,{...probe.player,server_id:probe.player.server_id||identity.serverId},probe.provider);

    // Token Saver: during outages, stop after the first LastWar Tools call. Two calls are possible only for endpoint compatibility (404/405).
    // If provider discovery already consumed both calls, persist the signed identity cache
    // and stop before Alliance Members. The retry will use 0 calls for Player Search.
    if(!cached && probe.fallback_used && probe.token_calls>=2){
      return json(res,200,{
        provider:"LastWar Tools",provider_mode:probe.provider,source:"community_api",identity_verified:false,requires_retry:true,token_calls:tokenCalls,
        player_cache_token:signedBeforeRoster.token,player_cache_expires_at:signedBeforeRoster.expires_at,cache_used:false,
        diagnostic:{authentication:"ok",player_search:"ok",alliance_members:"not_called",stage:"provider_selected",provider:probe.provider,fallback_used:true,token_calls:tokenCalls},
        player:{name:probe.player.name,server_id:probe.player.server_id||identity.serverId,alliance_tag:probe.player.alliance_tag,rank:probe.player.rank||null,hq_level:probe.player.hq_level||null,player_id:probe.player.player_id||null},
        message:"Mode API compatible détecté et mis en cache. Relance la synchronisation : Player Search coûtera 0 appel et WarBoost consacrera jusqu’à 2 appels à Alliance Members."
      });
    }

    const rosterBudget=cached?2:Math.max(1,2-tokenCalls);
    const roster=await safeAllianceRoster(apiKey,identity.serverId,probe.player,probe.provider,rosterBudget);tokenCalls+=roster.token_calls;
    return json(res,200,{
      provider:"LastWar Tools",provider_mode:probe.provider,source:"community_api",identity_verified:true,synced_at:new Date().toISOString(),token_calls:tokenCalls,
      player_cache_token:signedBeforeRoster.token,player_cache_expires_at:signedBeforeRoster.expires_at,cache_used:!!cached,
      diagnostic:{authentication:"ok",player_search:cached?"cached":"ok",alliance_members:"ok",stage:"complete",provider:probe.provider,roster_provider:roster.provider||probe.provider,roster_route:roster.route_label||null,fallback_used:!!probe.fallback_used,cache_used:!!cached,token_calls:tokenCalls,player_elapsed_ms:probe.total_elapsed_ms||probe.elapsed_ms||0,roster_elapsed_ms:roster.elapsed_ms||null,attempts:[...(probe.attempts||[]),...(roster.attempts||[])]},
      verified_player:{
        name:roster.self.name,rank:roster.self.rank,server_id:String(identity.serverId),alliance_tag:roster.alliance.tag,
        player_id:roster.self.player_id||probe.player.player_id||null
      },
      alliance:roster.alliance,members:roster.members
    });
  }catch(e){
    tokenCalls+=Number(e?.token_calls||0);
    console.error("smart verified alliance sync",{stage:e?.stage,status:e?.upstream_status,message:e?.message,provider:e?.provider});
    const status=[400,401,402,403,404,409,429,502,503,504].includes(Number(e?.status))?Number(e.status):502;
    return json(res,status,{
      error:e?.message||"Synchronisation vérifiée impossible.",
      invalidate_player_cache:["self_missing","alliance_mismatch","player_mismatch","server_mismatch"].includes(String(e?.stage||"")),
      retry_after:[500,502,503,504].includes(Number(e?.upstream_status||e?.status))?300:undefined,
      transient_outage:[500,502,503,504].includes(Number(e?.upstream_status||e?.status)),
      diagnostic:{stage:e?.stage||"unknown",http_status:e?.upstream_status||null,token_calls:tokenCalls,provider:e?.provider||providerHint||null,first_status:e?.first_status||null,elapsed_ms:e?.total_elapsed_ms||e?.elapsed_ms||null,timeout_ms:e?.timeout_ms||null,attempts:e?.attempts||[],retry_recommended:!!e?.retry_recommended},
      security:"Le tag alliance est dérivé du profil Last War trouvé ; il n’est jamais accepté depuis le téléphone."
    });
  }
}



/* ===== V20.5.27 • VS LIVE INTELLIGENCE =====
   The community API publicly documents Player Search / Alliance Members, but a weekly
   VS-matchup endpoint is not currently part of the public feature list. WarBoost therefore:
   1) verifies the caller's own R4/R5 alliance;
   2) reads opponent metadata if the provider already includes it in the alliance payload;
   3) optionally calls LASTWAR_TOOLS_VS_MATCHUP_URL when an exact provider route is configured;
   4) otherwise accepts one manual opponent tag/server as a fallback, but NEVER imports it
      as the user's own alliance. It is used only for VS comparison.
*/
function allianceSummary(alliance,members=[]){
  const powers=(members||[]).map(x=>Number(x?.power||0)).filter(x=>x>0).sort((x,y)=>y-x);
  const total=powers.reduce((x,y)=>x+y,0),avg=powers.length?Math.round(total/powers.length):0,top10=powers.slice(0,10).reduce((x,y)=>x+y,0);
  return {tag:String(alliance?.tag||""),name:alliance?.name||null,server_id:String(alliance?.server_id||""),members:(members||[]).length,total_power:total,avg_power:avg,top10_power:top10};
}
function normalizeOpponentCandidate(v,defaultServer=""){
  if(!v)return null;
  if(typeof v==="string")return {tag:v.trim(),server_id:String(defaultServer||"")};
  if(typeof v!=="object"||Array.isArray(v))return null;
  const nested=(v.alliance&&typeof v.alliance==="object")?v.alliance:{};
  const tag=String(firstValue(v,["tag","alliance_tag","opponent_tag","enemy_tag","vs_opponent_tag"])||firstValue(nested,["tag","alliance_tag"])||"").trim();
  if(!tag)return null;
  return {tag,server_id:String(firstValue(v,["server_id","server","opponent_server","enemy_server","vs_opponent_server"])||firstValue(nested,["server_id","server"])||defaultServer||""),alliance_id:firstValue(v,["alliance_id","id"])||firstValue(nested,["alliance_id","id"])||null,name:String(firstValue(v,["name","alliance_name","opponent_name"])||firstValue(nested,["name","alliance_name"])||"").trim()||null};
}
function extractVsOpponent(data,defaultServer=""){
  const candidates=[
    data?.vs_opponent,data?.opponent,data?.enemy,data?.duel_opponent,data?.alliance_duel_opponent,
    data?.vs?.opponent,data?.duel?.opponent,data?.matchup?.opponent,data?.weekly_vs?.opponent,
    data?.data?.vs_opponent,data?.data?.opponent,data?.data?.vs?.opponent,data?.data?.duel?.opponent,data?.data?.matchup?.opponent,
    data?.meta?.vs_opponent,data?.meta?.opponent,data?.meta?.matchup?.opponent
  ];
  for(const c of candidates){const n=normalizeOpponentCandidate(c,defaultServer);if(n)return n}
  return null;
}
function vsMatchupUrl(serverId,ownTag,ownAllianceId){
  const configured=String(process.env.LASTWAR_TOOLS_VS_MATCHUP_URL||"").trim();
  if(!configured)return null;
  const u=new URL(templateUrl(configured,{server_id:serverId,server:serverId,alliance_tag:ownTag,tag:ownTag,alliance_id:ownAllianceId||"",id:ownAllianceId||""}));
  if(!u.searchParams.has("server")&&!u.searchParams.has("server_id"))u.searchParams.set("server",serverId);
  if(!u.searchParams.has("tag")&&!u.searchParams.has("alliance_tag"))u.searchParams.set("tag",ownTag);
  return u.toString();
}
async function fetchVsOpponentFromConfiguredEndpoint(apiKey,serverId,ownAlliance){
  const url=vsMatchupUrl(serverId,ownAlliance?.tag,ownAlliance?.alliance_id);
  if(!url)return {opponent:null,token_calls:0,source:null};
  let result;
  try{result=await fetchLastWarSafe(url,allianceHeadersForUrl(url,apiKey),14000)}catch(e){return {opponent:null,token_calls:1,source:"matchup_endpoint",error:e?.name==="AbortError"?"timeout":"network"}}
  const {r,data}=result;if(!r.ok)return {opponent:null,token_calls:1,source:"matchup_endpoint",http_status:r.status};
  return {opponent:extractVsOpponent(data,serverId),token_calls:1,source:"matchup_endpoint",http_status:r.status};
}
async function safeOpponentRoster(apiKey,serverId,opponent){
  const tag=String(opponent?.tag||"").trim();
  if(!tag)throw diagnosticError("Tag de l’alliance adverse manquant.",{status:400,stage:"opponent_input",token_calls:0});
  const url=safeAllianceMembersUrl(serverId,tag,opponent?.alliance_id||null),headers=allianceHeadersForUrl(url,apiKey);
  let result;
  try{result=await fetchLastWarSafe(url,headers,16000)}catch(e){throw diagnosticError(e?.name==="AbortError"?"Le roster adverse met trop de temps à répondre.":"Connexion au roster adverse impossible.",{status:e?.name==="AbortError"?504:502,stage:"opponent_roster",token_calls:1})}
  const {r,data}=result;
  if(!r.ok)throw diagnosticError(publicUpstreamError(r.status,"Alliance Members adverse"),{status:r.status===429?429:502,stage:"opponent_roster",upstream_status:r.status,token_calls:1});
  const members=extractAllianceMembers(data).map(normalizeAllianceMember).filter(Boolean).slice(0,100);
  if(!members.length)throw diagnosticError("Le roster de l’alliance adverse ne contient aucun membre exploitable.",{status:502,stage:"opponent_empty",upstream_status:r.status,token_calls:1});
  const aa=data?.alliance||data?.data?.alliance||data?.meta?.alliance||{};
  const returnedTag=String(firstValue(aa,["tag","alliance_tag"])||data?.alliance_tag||tag).trim()||tag;
  return {members,alliance:{tag:returnedTag,server_id:String(firstValue(aa,["server_id","server"])||data?.server_id||serverId),name:firstValue(aa,["name","alliance_name"])||opponent?.name||null},raw:data,token_calls:1};
}
async function handleVsWeeklySync(req,res){
  const user=await requireAllianceEntitlement(req,res);if(!user)return;
  const apiKey=normalizeLastWarApiKey(process.env.LASTWAR_TOOLS_API_KEY);
  if(!apiKey)return json(res,503,{error:"La connexion LastWar Tools n’est pas configurée dans Vercel.",stage:"configuration",token_calls:0});
  let identity;try{identity=allianceRequestIdentity(req,user)}catch(e){return json(res,e.status||400,{error:e.message,stage:e.stage||"input",token_calls:0})}
  let calls=0;const hint=String(req.body?.provider_hint||"").toLowerCase();
  try{
    const cached=cachedProbeOrNull(apiKey,user,identity,req);
    const probe=cached||await smartPlayerProbe(apiKey,identity.serverId,identity.accountName,hint);calls+=Number(probe.token_calls||0);
    const signed=makeLastWarPlayerCacheToken(apiKey,user.id,{...probe.player,server_id:probe.player.server_id||identity.serverId},probe.provider);
    if(!cached&&probe.fallback_used&&probe.token_calls>=2)return json(res,200,{requires_retry:true,provider_mode:probe.provider,token_calls:calls,player_cache_token:signed.token,player_cache_expires_at:signed.expires_at,player:probe.player,message:"Mode API compatible détecté sans dépasser 2 appels. Relance la synchronisation VS pour utiliser directement ce mode."});
    const ownRoster=await safeAllianceRoster(apiKey,identity.serverId,probe.player,probe.provider);calls+=Number(ownRoster.token_calls||0);
    const own=allianceSummary(ownRoster.alliance,ownRoster.members);
    const self=ownRoster.self||{};
    const verifiedPlayer={name:self.name||probe.player.name,rank:self.rank||probe.player.rank||null,server_id:String(identity.serverId),alliance_tag:ownRoster.alliance?.tag||probe.player.alliance_tag||null,hq_level:self.hq_level||probe.player.hq_level||null,power:self.power||probe.player.power||null,power_m:self.power_m||probe.player.power_m||null,player_id:self.player_id||probe.player.player_id||null};
    let opponent=extractVsOpponent(ownRoster.raw,identity.serverId),opponentSource=opponent?"alliance_payload":null;
    if(!opponent){const m=await fetchVsOpponentFromConfiguredEndpoint(apiKey,identity.serverId,{...ownRoster.alliance,alliance_id:probe.player.alliance_id});calls+=Number(m.token_calls||0);opponent=m.opponent;if(opponent)opponentSource=m.source}
    const manualTag=String(req.body?.manual_opponent_tag||"").trim(),manualServer=String(req.body?.manual_opponent_server||"").trim();
    if(!opponent&&manualTag){
      if(!/^\d{1,6}$/.test(manualServer))throw diagnosticError("Serveur de l’alliance adverse invalide.",{status:400,stage:"opponent_input",token_calls:0});
      opponent={tag:manualTag,server_id:manualServer};opponentSource="manual_fallback";
    }
    if(!opponent){
      return json(res,200,{ok:true,identity_verified:true,provider_mode:probe.provider,source:"community_api",synced_at:new Date().toISOString(),token_calls:calls,cache_used:!!cached,player_cache_token:signed.token,player_cache_expires_at:signed.expires_at,verified_player:verifiedPlayer,requires_opponent:true,own_alliance:own,opponent_alliance:null,opponent_source:null,message:"Ton alliance R4/R5 est vérifiée. Le fournisseur ne publie pas encore l’adversaire VS dans les données disponibles : renseigne uniquement l’adversaire une fois dans le mode secours."});
    }
    const oppServer=String(opponent.server_id||"").trim();
    if(!/^\d{1,6}$/.test(oppServer))return json(res,200,{ok:true,identity_verified:true,provider_mode:probe.provider,synced_at:new Date().toISOString(),token_calls:calls,cache_used:!!cached,player_cache_token:signed.token,player_cache_expires_at:signed.expires_at,verified_player:verifiedPlayer,requires_opponent:true,own_alliance:own,opponent_alliance:null,opponent_source:opponentSource,message:"L’adversaire VS a été détecté, mais son serveur n’est pas fourni. Renseigne son serveur une fois dans le mode secours."});
    if(normalizeName(opponent.tag)===normalizeName(own.tag)&&String(oppServer)===String(own.server_id))throw diagnosticError("Le matchup retourné correspond à ta propre alliance. Analyse refusée.",{status:409,stage:"opponent_same",token_calls:0});
    const oppRoster=await safeOpponentRoster(apiKey,oppServer,opponent);calls+=Number(oppRoster.token_calls||0);
    const opp=allianceSummary(oppRoster.alliance,oppRoster.members);
    return json(res,200,{ok:true,identity_verified:true,provider_mode:probe.provider,source:"community_api",source_label:opponentSource==="manual_fallback"?"Adversaire renseigné une fois":"Adversaire détecté via API",synced_at:new Date().toISOString(),token_calls:calls,cache_used:!!cached,player_cache_token:signed.token,player_cache_expires_at:signed.expires_at,verified_player:verifiedPlayer,requires_opponent:false,opponent_source:opponentSource,own_alliance:own,opponent_alliance:opp});
  }catch(e){
    calls+=Number(e?.token_calls||0);console.error("vs weekly sync",{stage:e?.stage,status:e?.upstream_status,message:e?.message});
    const status=[400,401,402,403,404,409,429,502,503,504].includes(Number(e?.status))?Number(e.status):502;
    return json(res,status,{error:e?.message||"Synchronisation VS impossible.",stage:e?.stage||"unknown",http_status:e?.upstream_status||null,token_calls:calls});
  }
}


/* ===== V20.5.27 • SEASON LIVE SYNC =====
   Public LastWar Tools material currently advertises Player Search, Alliance Rankings,
   Alliance Members and Kingdom Positions, but no public Season Status endpoint is
   guaranteed. WarBoost therefore never guesses a provider route:
   - exact player/server verification is reused from Player Search;
   - season metadata already present in that payload is accepted when available;
   - an OPTIONAL exact LASTWAR_TOOLS_SEASON_STATUS_URL can be configured in Vercel;
   - otherwise the client falls back to a clearly-labelled one-time calendar anchor.
   No extra Serverless Function is created.
*/
function parseSeasonNumber(v){
  if(v==null||v==="")return null;
  if(typeof v==="number"&&Number.isFinite(v)&&v>=1&&v<=99)return Math.trunc(v);
  const x=String(v).trim();
  let m=x.match(/(?:season|saison|seizoen|temporada|s)\s*[#:_-]?\s*(\d{1,2})/i);
  if(!m&&/^\d{1,2}$/.test(x))m=[x,x];
  const n=m?Number(m[1]):NaN;return Number.isFinite(n)&&n>=1&&n<=99?n:null;
}
function parseSeasonDay(v){
  if(v==null||v==="")return null;
  if(typeof v==="number"&&Number.isFinite(v)&&v>=1&&v<=400)return Math.trunc(v);
  const x=String(v).trim();
  let m=x.match(/(?:day|jour|tag|día|dia|日|天)\s*[#:_-]?\s*(\d{1,3})/i);
  if(!m&&/^\d{1,3}$/.test(x))m=[x,x];
  const n=m?Number(m[1]):NaN;return Number.isFinite(n)&&n>=1&&n<=400?n:null;
}
function cleanSeasonText(v,max=120){
  if(v==null||typeof v==="object")return null;
  const x=String(v).trim();return x?x.slice(0,max):null;
}
function normalizeSeasonCandidate(c,root={},defaultServer=""){
  if(c==null)return null;
  if(typeof c!=="object"||Array.isArray(c)){
    const season_number=parseSeasonNumber(c);
    if(!season_number)return null;
    return {season_number,season_name:`Saison ${season_number}`,day:null,phase:null,event:null,server_id:String(defaultServer||"")||null};
  }
  const seasonRaw=firstValue(c,["season_number","season_no","seasonNumber","current_season","currentSeason","season","number","name","season_name","seasonName"]);
  const dayRaw=firstValue(c,["season_day","seasonDay","current_day","currentDay","day_number","dayNumber","day"]);
  let season_number=parseSeasonNumber(seasonRaw),day=parseSeasonDay(dayRaw);
  if(!season_number)season_number=parseSeasonNumber(firstValue(root,["season_number","season_no","seasonNumber","current_season","currentSeason"]));
  if(!day)day=parseSeasonDay(firstValue(root,["season_day","seasonDay","current_day","currentDay","day_number","dayNumber"]));
  const season_name=cleanSeasonText(firstValue(c,["season_name","seasonName","name","title"])) || (season_number?`Saison ${season_number}`:null);
  const phase=cleanSeasonText(firstValue(c,["phase","current_phase","currentPhase","stage","season_phase","seasonPhase"]));
  const event=cleanSeasonText(firstValue(c,["event","current_event","currentEvent","event_name","eventName","season_event","seasonEvent"]));
  const starts_at=cleanSeasonText(firstValue(c,["starts_at","start_at","start_date","season_start","started_at"]),80);
  const ends_at=cleanSeasonText(firstValue(c,["ends_at","end_at","end_date","season_end"]),80);
  const server_id=String(firstValue(c,["server_id","server","serverId","zone_id","kingdom"])||defaultServer||"").trim()||null;
  if(!season_number&&!day&&!phase&&!event)return null;
  return {season_number,season_name,day,phase,event,starts_at,ends_at,server_id};
}
function extractSeasonSnapshot(data,defaultServer=""){
  if(!data)return null;
  const candidates=[
    data?.season_status,data?.seasonStatus,data?.season_info,data?.seasonInfo,data?.current_season,data?.currentSeason,data?.season,
    data?.player?.season_status,data?.player?.season_info,data?.player?.current_season,data?.player?.season,
    data?.server?.season_status,data?.server?.season_info,data?.server?.season,
    data?.world?.season_status,data?.world?.season_info,data?.world?.season,
    data?.kingdom?.season_status,data?.kingdom?.season_info,data?.kingdom?.season,
    data?.data?.season_status,data?.data?.seasonStatus,data?.data?.season_info,data?.data?.seasonInfo,data?.data?.current_season,data?.data?.currentSeason,data?.data?.season,
    data?.data?.server?.season_status,data?.data?.server?.season_info,data?.data?.server?.season,
    data?.meta?.season_status,data?.meta?.season_info,data?.meta?.season,
    data
  ];
  for(const c of candidates){const n=normalizeSeasonCandidate(c,data,defaultServer);if(n)return n}
  return null;
}
function seasonStatusUrl(serverId,player){
  const configured=String(process.env.LASTWAR_TOOLS_SEASON_STATUS_URL||"").trim();
  if(!configured)return null;
  const raw=templateUrl(configured,{server_id:serverId,server:serverId,player_id:player?.player_id||"",id:player?.player_id||"",name:player?.name||"",player_name:player?.name||""});
  const u=new URL(raw);
  if(!u.searchParams.has("server")&&!u.searchParams.has("server_id"))u.searchParams.set("server",serverId);
  if(player?.player_id&&!u.searchParams.has("player_id"))u.searchParams.set("player_id",String(player.player_id));
  return u.toString();
}
async function fetchConfiguredSeasonStatus(apiKey,serverId,player){
  const url=seasonStatusUrl(serverId,player);
  if(!url)return {snapshot:null,token_calls:0,source:null};
  let result;
  try{result=await fetchLastWarSafe(url,allianceHeadersForUrl(url,apiKey),14000)}catch(e){
    return {snapshot:null,token_calls:1,source:"season_endpoint",error:e?.name==="AbortError"?"timeout":"network"};
  }
  const {r,data}=result;
  if(!r.ok)return {snapshot:null,token_calls:1,source:"season_endpoint",http_status:r.status};
  return {snapshot:extractSeasonSnapshot(data,serverId),token_calls:1,source:"season_endpoint",http_status:r.status};
}
async function requireSeasonEntitlement(req,res){
  try{
    const user=await authUser(req);
    if(!user){json(res,401,{error:"Connecte ton compte WarBoost pour synchroniser la saison."});return null}
    const sub=await getSubscription(user.id);
    if(!isPro(sub)){json(res,403,{error:"La synchronisation Saison avec Last War est réservée à WarBoost PRO."});return null}
    return user;
  }catch(e){console.error("season sync entitlement",e);json(res,503,{error:"Vérification du compte WarBoost indisponible."});return null}
}
async function handleSeasonDailySync(req,res){
  const user=await requireSeasonEntitlement(req,res);if(!user)return;
  const apiKey=normalizeLastWarApiKey(process.env.LASTWAR_TOOLS_API_KEY);
  if(!apiKey)return json(res,503,{error:"La connexion LastWar Tools n’est pas configurée dans Vercel.",stage:"configuration",token_calls:0});
  let identity;try{identity=allianceRequestIdentity(req,user)}catch(e){return json(res,e.status||400,{error:e.message,stage:e.stage||"input",token_calls:0})}
  let calls=0;const hint=String(req.body?.provider_hint||"").toLowerCase();
  try{
    const probe=await smartPlayerProbe(apiKey,identity.serverId,identity.accountName,hint);calls+=Number(probe.token_calls||0);
    if(probe.fallback_used&&probe.token_calls>=2)return json(res,200,{requires_retry:true,provider_mode:probe.provider,token_calls:calls,message:"Mode API compatible détecté sans dépasser 2 appels. Relance la synchronisation Saison pour utiliser directement ce mode."});
    let snapshot=extractSeasonSnapshot(probe.raw,identity.serverId),source=snapshot?"player_payload":null,seasonEndpointStatus=null;
    if(!snapshot){
      const ext=await fetchConfiguredSeasonStatus(apiKey,identity.serverId,probe.player);calls+=Number(ext.token_calls||0);snapshot=ext.snapshot;seasonEndpointStatus=ext.http_status||ext.error||null;if(snapshot)source=ext.source;
    }
    if(!snapshot){
      return json(res,200,{ok:true,identity_verified:true,provider_mode:probe.provider,synced_at:new Date().toISOString(),token_calls:calls,requires_calibration:true,snapshot:null,source:null,season_endpoint_status:seasonEndpointStatus,verified_player:{name:probe.player.name,server_id:probe.player.server_id||identity.serverId},message:"Ton joueur et ton serveur sont vérifiés, mais le fournisseur ne transmet pas encore de donnée Saison exploitable. Calibre une seule fois le numéro et le jour visibles dans Last War : WarBoost suivra ensuite l’avancement quotidien sans inventer de donnée API."});
    }
    return json(res,200,{ok:true,identity_verified:true,provider_mode:probe.provider,synced_at:new Date().toISOString(),token_calls:calls,requires_calibration:false,snapshot,source,source_label:source==="season_endpoint"?"Season Status via API":"Donnée Saison reçue avec le profil",verified_player:{name:probe.player.name,server_id:probe.player.server_id||identity.serverId}});
  }catch(e){
    calls+=Number(e?.token_calls||0);console.error("season daily sync",{stage:e?.stage,status:e?.upstream_status,message:e?.message});
    const status=[400,401,402,403,404,409,429,502,503,504].includes(Number(e?.status))?Number(e.status):502;
    return json(res,status,{error:e?.message||"Synchronisation Saison impossible.",stage:e?.stage||"unknown",http_status:e?.upstream_status||null,token_calls:calls});
  }
}

export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Méthode non autorisée."});

  // Alliance sync is data infrastructure: no OpenAI call and no WarBoost AI credit.
  if(String(req.body?.mode||"").toLowerCase()==="player_profile_sync")return handlePlayerProfileSync(req,res);
  if(String(req.body?.mode||"").toLowerCase()==="alliance_api_diagnostic")return handleAllianceApiDiagnostic(req,res);
  if(String(req.body?.mode||"").toLowerCase()==="alliance_sync")return handleAllianceSync(req,res);
  if(String(req.body?.mode||"").toLowerCase()==="vs_weekly_sync")return handleVsWeeklySync(req,res);
  if(String(req.body?.mode||"").toLowerCase()==="season_daily_sync")return handleSeasonDailySync(req,res);
  if(!process.env.OPENAI_API_KEY)return json(res,500,{error:"OPENAI_API_KEY manquante dans Vercel."});

  // UI translation is intentionally handled before account/PRO checks.
  // This is UI infrastructure, not a player AI-credit action.
  if(String(req.body?.mode||"").toLowerCase()==="ui_translate")return handleUiTranslate(req,res);

  let user,usage;
  try{
    user=await authUser(req);
    if(!user)return json(res,401,{error:"Connecte ton compte WarBoost pour scanner des captures."});
    const sub=await getSubscription(user.id);
    if(!isPro(sub))return json(res,403,{error:"Le Smart Player Scan est réservé à WarBoost PRO."});
    usage=await reserveCredit(user.id);
    if(!usage.allowed)return json(res,429,{error:"Quota IA PRO du jour atteint.",usage});
  }catch(e){
    console.error("player scan entitlement",e);
    return json(res,503,{error:"Vérification du compte WarBoost indisponible."});
  }

  const images=Array.isArray(req.body?.images)?req.body.images:[];
  if(!images.length||images.length>10){
    await refundCredit(user.id);
    return json(res,400,{error:"Envoie entre 1 et 10 captures.",usage:{...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)}});
  }
  if(images.some(x=>typeof x!=="string"||!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(x))){
    await refundCredit(user.id);return json(res,400,{error:"Format d’image non accepté."});
  }
  const approx=images.reduce((n,x)=>n+x.length,0);
  if(approx>3900000){
    await refundCredit(user.id);return json(res,413,{error:"Captures trop lourdes après compression. Réessaie avec moins d’images."});
  }

  const langCode=String(req.body?.language||"fr").toLowerCase();
  const language=({fr:"français",en:"anglais britannique","en-us":"anglais américain",es:"espagnol",de:"allemand",ja:"japonais",zh:"chinois simplifié",ar:"arabe"})[langCode]||"français";
  const mode=String(req.body?.mode||"classic");

  if(mode==="shop_advisor"){
    const ctx=req.body?.shop_context&&typeof req.body.shop_context==="object"?req.body.shop_context:{};
    const budget=String(ctx.budget||"0");
    const focus=String(ctx.focus||"auto");
    const playerPriorities=Array.isArray(ctx.priorities)?ctx.priorities.slice(0,3):[];

    const shopSchema={
      type:"object",additionalProperties:false,
      properties:{
        shop:{
          type:"object",additionalProperties:false,
          properties:{
            summary:{type:"string"},
            detected_shops:{type:"array",maxItems:8,items:{type:"string"}},
            offers:{
              type:"array",maxItems:30,
              items:{
                type:"object",additionalProperties:false,
                properties:{
                  shop_type:{type:"string"},item_name:{type:"string"},
                  currency:{type:["string","null"]},price_text:{type:["string","null"]},
                  quantity_text:{type:["string","null"]},real_money:{type:"boolean"},
                  confidence:{type:"number",minimum:0,maximum:1}
                },
                required:["shop_type","item_name","currency","price_text","quantity_text","real_money","confidence"]
              }
            },
            recommendations:{
              type:"array",maxItems:14,
              items:{
                type:"object",additionalProperties:false,
                properties:{
                  rank:{type:"integer",minimum:1,maximum:20},
                  spend_type:{type:"string",enum:["in_game","paid"]},
                  shop_type:{type:"string"},item_name:{type:"string"},
                  price_text:{type:["string","null"]},
                  verdict:{type:"string",enum:["buy_now","good","situational","skip"]},
                  reason:{type:"string"},evidence:{type:"string"},player_fit:{type:"string"},
                  confidence:{type:"number",minimum:0,maximum:1}
                },
                required:["rank","spend_type","shop_type","item_name","price_text","verdict","reason","evidence","player_fit","confidence"]
              }
            },
            warnings:{type:"array",maxItems:8,items:{type:"string"}},
            next_capture:{type:["string","null"]}
          },
          required:["summary","detected_shops","offers","recommendations","warnings","next_capture"]
        }
      },
      required:["shop"]
    };

    const shopModel=process.env.OPENAI_VISION_MODEL||process.env.OPENAI_MODEL||"gpt-5";
    const batchSize=2;
    const batches=[];
    for(let i=0;i<images.length;i+=batchSize)batches.push(images.slice(i,i+batchSize));

    const basePrompt=`Tu es le Smart Shop Advisor de WarBoost V20.4.2 pour Last War: Survival.

BUT
- Lire UNIQUEMENT les boutiques/offres visibles dans les captures.
- Reconnaître si possible : Boutique Diamants, VIP, Alliance, Honneur, Campagne, Saison, packs/offres payantes, ou autre.
- Classer ce qui vaut le coup pour CE joueur, en distinguant "sans argent réel" et "payant".
- Le classement doit d'abord servir les FAIBLESSES DE FORMATION transmises par le Smart Scan.
- Répondre en ${language}.

CONTEXTE JOUEUR
- Focus: ${focus}
- Budget argent réel: ${budget}
- Puissance formation visible: ${ctx.formation_power_m??"non renseignée"}
- Niveau Drone visible: ${ctx.drone_level??"non renseigné"}
- Priorités Smart Scan: ${JSON.stringify(playerPriorities).slice(0,3500)}
- Besoins formation structurés: ${JSON.stringify(ctx.formation_needs||[]).slice(0,2500)}

RÈGLES DE FIABILITÉ
- N'invente jamais un article, un prix, une quantité ou une remise non visible.
- Si le nom exact est illisible, ne recommande l'article que si l'icône/texte est suffisamment clair.
- Pour un pack payant, utilise uniquement le prix affiché. Ne convertis pas une devise.
- Un pourcentage de valeur/remise affiché par le jeu n'est PAS une preuve suffisante de bon achat.
- Ne promets jamais un gain de puissance chiffré s'il n'est pas visible.
- Ne duplique pas une offre montrée plusieurs fois.
- evidence doit citer ce qui est réellement visible.

RÈGLES WARBOOST
- Honneur : Plans d'équipement légendaires souvent prioritaires si l'équipement est le besoin.
- Alliance : fragments UR, accélérateurs et pièces de Drone peuvent être utiles; garder les besoins opérationnels.
- VIP : endurance, fragments universels UR et accélérateurs selon le besoin réel.
- Diamants : prudence; éviter les achats de routine sans lien direct avec la priorité.
- Campagne : ressources, pièces de Drone, fragments d'arme exclusive selon la progression.
- Saison : contenu variable; classer uniquement ce qui est visible.

RÈGLES PAYANTES
- Si budget="${budget}" vaut "0", toutes les offres payantes doivent être "skip".
- Sinon, "buy_now" seulement si le contenu visible correspond directement à une priorité Smart Scan.
- Respecte le budget. Budget élevé ne veut jamais dire acheter tout.
- Si rien ne correspond au besoin, recommande de ne rien acheter.
- player_fit : gear, heroes, drone, speed, season ou general.
- Une offre sans lien avec la formation ne peut pas être "buy_now".

SORTIE
- "in_game" = monnaies du jeu, sans paiement réel au moment de l'achat.
- "paid" = argent réel / packs payants.
- Trie les recommandations par utilité réelle pour le joueur.`;

    async function analyzeShopBatch(batch,batchIndex){
      const shopContent=[{type:"input_text",text:`${basePrompt}\n\nLOT ${batchIndex+1}/${batches.length} • ${batch.length} capture(s). Analyse uniquement ce lot.`}];
      for(const image_url of batch)shopContent.push({type:"input_image",image_url,detail:"high"});

      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),70000);
      const makeBody=(withReasoning=true)=>{
        const body={
          model:shopModel,
          max_output_tokens:3200,
          input:[{role:"user",content:shopContent}],
          text:{verbosity:"low",format:{type:"json_schema",name:"warboost_shop_advisor",strict:true,schema:shopSchema}}
        };
        if(withReasoning)body.reasoning={effort:"minimal"};
        return body;
      };
      const call=body=>fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
        signal:controller.signal,
        body:JSON.stringify(body)
      });

      try{
        let rr=await call(makeBody(true));
        let raw=await rr.text();let od={};
        try{od=raw?JSON.parse(raw):{}}catch{od={error:{message:raw.slice(0,500)}}}
        const technical=String(od?.error?.message||"");
        if(!rr.ok&&rr.status===400&&/reasoning|effort|unsupported value/i.test(technical)){
          rr=await call(makeBody(false));
          raw=await rr.text();od={};
          try{od=raw?JSON.parse(raw):{}}catch{od={error:{message:raw.slice(0,500)}}}
        }
        if(!rr.ok){
          const err=new Error("Lot boutique non analysé");err.status=rr.status;err.technical=String(od?.error?.message||"");throw err;
        }
        if(od?.status==="incomplete")throw new Error("Lot boutique interrompu");
        const parsed=parseJson(outputText(od));
        if(!parsed?.shop)throw new Error("Lot boutique incomplet");
        return parsed.shop;
      }finally{clearTimeout(timeout)}
    }

    try{
      // Compatibilité héritée : le mode shop_advisor reste accepté mais V20.4.2 ne l'expose plus dans l’interface.
      // Côté WarBoost, l'utilisateur ne consomme qu'un seul crédit pour toute l'analyse.
      const settled=await Promise.allSettled(batches.map((batch,i)=>analyzeShopBatch(batch,i)));
      const ok=settled.filter(x=>x.status==="fulfilled").map(x=>x.value);
      const failed=settled.filter(x=>x.status==="rejected");

      if(!ok.length){
        await refundCredit(user.id);
        const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
        const throttled=failed.some(x=>Number(x.reason?.status)===429);
        return json(res,throttled?429:502,{error:throttled?"Le moteur IA est momentanément saturé. Réessaie dans quelques instants.":"WarBoost n’a pas pu analyser les captures boutique. Le crédit IA a été remboursé : relance l’analyse.",usage:refunded});
      }

      const uniq=(arr,keyFn)=>{const seen=new Set();return arr.filter(x=>{const k=keyFn(x);if(seen.has(k))return false;seen.add(k);return true})};
      const detected_shops=uniq(ok.flatMap(x=>x.detected_shops||[]),x=>String(x||"").trim().toLowerCase()).slice(0,20);
      const offers=uniq(ok.flatMap(x=>x.offers||[]),x=>`${x.shop_type}|${x.item_name}|${x.price_text||""}|${x.quantity_text||""}`.toLowerCase()).slice(0,60);
      const verdictOrder={buy_now:0,good:1,situational:2,skip:3};
      let recommendations=uniq(ok.flatMap(x=>x.recommendations||[]),x=>`${x.spend_type}|${x.shop_type}|${x.item_name}|${x.price_text||""}`.toLowerCase())
        .sort((a,b)=>(verdictOrder[a.verdict]??9)-(verdictOrder[b.verdict]??9)||Number(b.confidence||0)-Number(a.confidence||0)||Number(a.rank||99)-Number(b.rank||99));

      if(budget==="0")recommendations=recommendations.map(x=>x.spend_type==="paid"?{...x,verdict:"skip",reason:"Budget réglé sur 0 € : WarBoost ne recommande aucun achat payant."}:x);
      recommendations=recommendations.slice(0,18).map((x,i)=>({...x,rank:i+1}));

      const warnings=uniq(ok.flatMap(x=>x.warnings||[]),x=>String(x||"").trim().toLowerCase()).slice(0,8);
      if(failed.length)warnings.unshift(`${failed.length} lot(s) sur ${batches.length} n’ont pas pu être analysés. Les résultats affichés proviennent des autres captures.`);
      const next_capture=ok.map(x=>x.next_capture).find(Boolean)||null;
      const shop={
        summary:`${images.length} capture(s) traitée(s) • ${detected_shops.length} boutique(s) détectée(s) • ${recommendations.length} recommandation(s).`,
        detected_shops,offers,recommendations,warnings:warnings.slice(0,8),next_capture
      };
      return json(res,200,{shop,model:shopModel,usage,batches:{total:batches.length,success:ok.length,failed:failed.length}});
    }catch(e){
      await refundCredit(user.id);
      const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
      console.error("smart shop advisor",e);
      return json(res,500,{error:"Erreur serveur pendant l’analyse des boutiques. Le crédit IA a été remboursé.",usage:refunded});
    }
  }


  const content=[{
    type:"input_text",
    text:`Analyse ces captures de Last War: Survival comme le Smart Player Scan WarBoost V20.4.2.

ORDRE D’ANALYSE OBLIGATOIRE : héros → équipements → puissance de formation → Drone → Suzerain. N’évalue les priorités et la Boutique qu’après avoir terminé cette extraction.

FUSION MULTI-CAPTURES V20.6.2:
- si plusieurs images sont fournies, considère-les comme des vues complémentaires du MÊME compte et de la MÊME escouade principale;
- fusionne les informations concordantes entre les images sans dupliquer les héros;
- une capture peut montrer la formation, une autre les détails héros/équipements, une autre le Drone;
- préfère la valeur la plus clairement lisible lorsqu’un même champ apparaît plusieurs fois;
- si deux valeurs se contredisent et qu’aucune n’est clairement plus fiable, mets null et signale le doute dans missing_information;
- l’objectif prioritaire est de récupérer : 5 héros, leurs niveaux, étoiles, armes exclusives, jusqu’à 4 équipements par héros, ainsi que le niveau/puissance Drone lorsqu’ils sont visibles.

OBJECTIF:
1. extraire uniquement les informations réellement visibles;
2. distinguer impérativement la puissance TOTALE DU COMPTE de la puissance DE FORMATION;
3. reconnaître correctement la STRUCTURE de l'écran "Détails de la formation";
4. lire le DRONE visible et son niveau lorsque le nombre est lisible;
5. analyser l'équilibre visible des 5 héros et de leurs équipements;
6. produire un ordre concret de ce que le joueur doit améliorer en premier.

STRUCTURE LAST WAR À RESPECTER:
- une formation comporte au maximum 5 HÉROS;
- un héros Last War a au maximum 5 ÉTOILES : la valeur hero.stars doit toujours rester entre 0 et 5;
- le portrait de SUZERAIN / compagnon placé à gauche de la rangée des héros n'est JAMAIS un 6e héros;
- le DRONE n'est JAMAIS un héros;
- l'icône circulaire avec un drone/appareil et un nombre (ex. 157) correspond au niveau du drone lorsqu'elle est clairement visible;
- chaque héros dispose au maximum de 4 emplacements d'équipement;
- sur une formation complète : maximum 5 héros et maximum 20 équipements;
- les lignes d'équipements dans "Détails du héros" doivent être rattachées aux 5 héros, une ligne par héros;
- ne compte jamais les icônes de compétences, drone, suzerain, décoration ou autres boutons comme équipement.

RÈGLES ANTI-INVENTION:
- n'invente jamais une statistique cachée;
- n'invente jamais un niveau, une étoile, une arme exclusive ou un équipement non visible;
- si une valeur n'est pas lisible, mets null;
- un nombre affiché dans un écran "Détails de la formation" ou "Formation actuelle" est une puissance de FORMATION, pas la puissance totale du compte;
- power_m = puissance totale du compte UNIQUEMENT si l'écran l'indique clairement;
- formation_power_m = puissance de la formation visible;
- si le nom d'un héros n'est pas écrit mais que le portrait est reconnaissable avec forte confiance, tu peux le nommer; sinon utilise null et réfère-toi à sa position (Héros 1, Héros 2...);
- le niveau du drone doit aller dans player.drone.level, jamais dans un héros;
- ne compare pas directement le niveau du drone au niveau des héros : ce ne sont pas les mêmes systèmes de progression;
- base chaque recommandation sur une preuve visible dans la capture;
- ne donne pas de gain chiffré inventé. expected_impact est seulement high, medium ou low;
- si la capture ne permet pas une recommandation fiable, demande la prochaine capture utile au lieu d'inventer.

RÈGLES DE PRIORISATION V20.3.3:
1. Classe d'abord les FAIBLESSES RELATIVES visibles dans la formation.
2. Pour les équipements, compare les 20 pièces entre elles : niveau, étoiles/points visibles, qualité/tier/couleur si clairement lisible.
3. Si toutes les pièces sont au même niveau (par exemple Lv40), ne recommande PAS automatiquement "monter au-delà de Lv40". Cherche plutôt les pièces ayant moins d'étoiles/points, une qualité inférieure, ou un retard visible.
4. Pour un héros, une priorité est justifiée seulement si son niveau, ses étoiles, son arme exclusive ou ses équipements sont visiblement en retard par rapport aux autres héros.
5. Le Drone NE DOIT JAMAIS être priorité n°1 uniquement parce que son niveau est lisible ou parce qu'il "impacte toute la formation".
6. Un niveau de Drone isolé (ex. 157) ne prouve pas que le Drone est en retard. Sans écran détaillé du Drone/modules/composants, mets requires_more_info=true et place cette recommandation APRÈS les faiblesses visibles des héros/équipements.
7. Pour mettre le Drone en priorité n°1, il faut une preuve supplémentaire visible : module/composant/compétence clairement en retard, indicateur comparatif, ou autre donnée explicite montrant une faiblesse.
8. L'evidence d'une priorité doit citer précisément ce qui est visible (ex. "pièce du héros 3 avec moins d'étoiles que les autres"), pas une règle générale du jeu.
9. Si aucune faiblesse relative n'est lisible avec assez de confiance, ne fabrique pas de priorité forte : explique que la formation paraît homogène et demande une capture plus rapprochée.

LANGUE DE LA RÉPONSE: ${language}.
MODE: ${mode}.
Retourne uniquement la structure JSON demandée.`
  }];
  for(const image_url of images)content.push({type:"input_image",image_url,detail:"high"});

  const schema={
    type:"object",additionalProperties:false,
    properties:{
      player:{
        type:"object",additionalProperties:false,
        properties:{
          name:{type:["string","null"]},server:{type:["string","null"]},alliance:{type:["string","null"]},role:{type:["string","null"]},
          hq_level:{type:["number","null"]},power_m:{type:["number","null"]},formation_power_m:{type:["number","null"]},coordinates:{type:["string","null"]},
          drone:{type:"object",additionalProperties:false,properties:{level:{type:["number","null"]},power_m:{type:["number","null"]}},required:["level","power_m"]},
          technology_pct:{type:["number","null"]},gear_pct:{type:["number","null"]},main_squad_type:{type:["string","null"]},
          squads:{
            type:"array",maxItems:4,
            items:{
              type:"object",additionalProperties:false,
              properties:{
                name:{type:"string"},type:{type:["string","null"]},power_m:{type:["number","null"]},
                heroes:{
                  type:"array",maxItems:5,
                  items:{
                    type:"object",additionalProperties:false,
                    properties:{
                      name:{type:["string","null"]},position:{type:"integer",minimum:1,maximum:5},level:{type:["number","null"]},stars:{type:["number","null"],minimum:0,maximum:5},
                      exclusive_weapon:{type:["number","null"]},gear_average:{type:["number","null"]},
                      equipment:{
                        type:"array",maxItems:4,
                        items:{
                          type:"object",additionalProperties:false,
                          properties:{slot:{type:["string","null"]},name:{type:["string","null"]},level:{type:["number","null"]},stars:{type:["number","null"]},tier:{type:["string","null"]}},
                          required:["slot","name","level","stars","tier"]
                        }
                      }
                    },
                    required:["name","position","level","stars","exclusive_weapon","gear_average","equipment"]
                  }
                }
              },
              required:["name","type","power_m","heroes"]
            }
          },
          confidence:{type:"number",minimum:0,maximum:1},
          notes:{type:"array",maxItems:10,items:{type:"string"}}
        },
        required:["name","server","alliance","role","hq_level","power_m","formation_power_m","coordinates","drone","technology_pct","gear_pct","main_squad_type","squads","confidence","notes"]
      },
      analysis:{
        type:"object",additionalProperties:false,
        properties:{
          formation_power_m:{type:["number","null"]},
          detected_heroes:{type:"integer",minimum:0,maximum:5},
          visible_equipment_count:{type:"integer",minimum:0,maximum:20},
          drone_detected:{type:"boolean"},
          drone_level:{type:["number","null"]},
          suzerain_detected:{type:"boolean"},
          structure_valid:{type:"boolean"},
          confidence:{type:"number",minimum:0,maximum:1},
          summary:{type:"string"},
          strengths:{type:"array",maxItems:4,items:{type:"string"}},
          priorities:{
            type:"array",maxItems:5,
            items:{
              type:"object",additionalProperties:false,
              properties:{
                rank:{type:"integer",minimum:1,maximum:5},severity:{type:"string",enum:["critical","high","medium","low"]},
                target:{type:"string"},action:{type:"string"},reason:{type:"string"},evidence:{type:"string"},
                expected_impact:{type:"string",enum:["high","medium","low"]},confidence:{type:"number",minimum:0,maximum:1},requires_more_info:{type:"boolean"}
              },
              required:["rank","severity","target","action","reason","evidence","expected_impact","confidence","requires_more_info"]
            }
          },
          missing_information:{type:"array",maxItems:8,items:{type:"string"}},
          next_capture:{type:["string","null"]}
        },
        required:["formation_power_m","detected_heroes","visible_equipment_count","drone_detected","drone_level","suzerain_detected","structure_valid","confidence","summary","strengths","priorities","missing_information","next_capture"]
      }
    },
    required:["player","analysis"]
  };

  const model=process.env.OPENAI_VISION_MODEL||process.env.OPENAI_MODEL||"gpt-5";
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),45000);

  try{
    const requestBody={
      model,
      // GPT-5 ne supporte pas reasoning.effort="none".
      // "minimal" garde le scan rapide tout en restant compatible avec GPT-5.
      reasoning:{effort:"minimal"},
      max_output_tokens:5000,
      input:[{role:"user",content}],
      text:{verbosity:"low",format:{type:"json_schema",name:"warboost_smart_player_scan",strict:true,schema}}
    };

    const callOpenAI=body=>fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      signal:controller.signal,
      body:JSON.stringify(body)
    });

    let r=await callOpenAI(requestBody);
    let raw=await r.text();let data={};
    try{data=raw?JSON.parse(raw):{}}catch{data={error:{message:raw.slice(0,500)}}}

    // Compatibilité de secours si OPENAI_MODEL pointe vers un modèle ne gérant pas reasoning.
    // On relance une seule fois sans le paramètre, sans consommer un second crédit WarBoost.
    const apiError=String(data?.error?.message||"");
    if(!r.ok && r.status===400 && /reasoning|effort|unsupported value/i.test(apiError)){
      const fallbackBody={...requestBody};
      delete fallbackBody.reasoning;
      r=await callOpenAI(fallbackBody);
      raw=await r.text();data={};
      try{data=raw?JSON.parse(raw):{}}catch{data={error:{message:raw.slice(0,500)}}}
    }

    if(!r.ok){
      await refundCredit(user.id);
      const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
      const technical=String(data?.error?.message||"");
      console.error("smart scan api",technical||`HTTP ${r.status}`);
      const safeError=r.status===429
        ? "Le moteur IA est momentanément saturé. Réessaie dans quelques instants."
        : "WarBoost n’a pas pu terminer l’analyse IA. La requête a été remboursée : relance le scan.";
      return json(res,r.status===429?429:502,{error:safeError,usage:refunded});
    }
    if(data?.status==="incomplete"){
      const reason=String(data?.incomplete_details?.reason||"");
      await refundCredit(user.id);
      const msg=reason==="max_output_tokens"
        ?"Le Smart Scan a manqué de place pour terminer l’analyse. WarBoost a remboursé la requête IA : relance simplement le scan."
        :"Le Smart Scan a été interrompu avant la fin. WarBoost a remboursé la requête IA : relance simplement le scan.";
      return json(res,502,{error:msg,incomplete_reason:reason});
    }

    const text=outputText(data);let parsed;
    try{parsed=parseJson(text)}catch(e){
      console.error("smart scan invalid json",text?.slice(0,1200));
      await refundCredit(user.id);
      return json(res,502,{error:"Le Smart Scan a répondu dans un format inexploitable. Réessaie avec une capture plus nette."});
    }
    if(!parsed?.player||!parsed?.analysis){
      await refundCredit(user.id);
      return json(res,502,{error:"Analyse incomplète. Réessaie avec une capture des détails de formation."});
    }

    // V20.3.2 — garde-fous déterministes pour l'écran Last War "Détails de la formation".
    // Le Suzerain et le Drone ne doivent jamais devenir des héros.
    if(!Array.isArray(parsed.player.squads))parsed.player.squads=[];
    if(mode==="smart_formation"&&parsed.player.squads.length>1){
      parsed.player.squads=parsed.player.squads.slice(0,1);
    }
    for(const squad of parsed.player.squads){
      let heroes=Array.isArray(squad.heroes)?squad.heroes:[];
      const byPosition=new Map();
      const noPosition=[];
      for(const h of heroes){
        if(!h||typeof h!=="object")continue;
        const pos=Number(h.position||0);
        if(pos>=1&&pos<=5&&!byPosition.has(pos))byPosition.set(pos,h);
        else noPosition.push(h);
      }
      heroes=[...byPosition.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
      for(const h of noPosition){
        if(heroes.length>=5)break;
        if(!heroes.includes(h))heroes.push(h);
      }
      heroes=heroes.slice(0,5);
      heroes.forEach((h,i)=>{
        h.position=i+1;
        if(h.stars!==null&&h.stars!==undefined){
          const n=Number(h.stars);h.stars=Number.isFinite(n)?Math.max(0,Math.min(5,n)):null;
        }
        h.equipment=(Array.isArray(h.equipment)?h.equipment:[]).slice(0,4);
      });
      squad.heroes=heroes;
    }

    const primary=parsed.player.squads[0]||null;
    const actualHeroes=(primary?.heroes||[]).filter(h=>h&&(h.name||h.level!=null||h.stars!=null||(h.equipment||[]).length)).length;
    const actualGear=(primary?.heroes||[]).reduce((n,h)=>n+(h?.equipment||[]).slice(0,4).length,0);
    parsed.analysis.detected_heroes=Math.min(5,actualHeroes);
    parsed.analysis.visible_equipment_count=Math.min(20,actualGear);

    const droneLevel=Number(parsed.player?.drone?.level||parsed.analysis?.drone_level||0)||null;
    if(droneLevel!=null){
      parsed.player.drone.level=droneLevel;
      parsed.analysis.drone_level=droneLevel;
      parsed.analysis.drone_detected=true;
    }else{
      parsed.analysis.drone_level=null;
      parsed.analysis.drone_detected=!!(parsed.player?.drone?.power_m);
    }

    parsed.analysis.structure_valid=
      parsed.analysis.detected_heroes<=5 &&
      parsed.analysis.visible_equipment_count<=20 &&
      (primary?.heroes||[]).every(h=>(h?.equipment||[]).length<=4);

    // Si l'écran est une formation complète et que 5 héros sont présents,
    // l'absence de 20 équipements signifie simplement qu'une partie n'était pas lisible.
    if(parsed.analysis.detected_heroes===5&&parsed.analysis.visible_equipment_count<20){
      if(!Array.isArray(parsed.analysis.missing_information))parsed.analysis.missing_information=[];
      const msg="Certains emplacements d’équipement ne sont pas assez lisibles pour être comptés avec certitude.";
      if(!parsed.analysis.missing_information.includes(msg))parsed.analysis.missing_information.push(msg);
    }


    // V20.4.7 — les héros sont plafonnés à 5 étoiles, y compris dans les textes générés.
    const fixHeroStarText=value=>{
      let t=String(value??"");
      if(/h[ée]ros|hero/i.test(t)){
        t=t.replace(/\b(?:[6-9]|[1-9]\d+(?:[.,]\d+)?)\s*★/g,"5★");
        t=t.replace(/\b(?:[6-9]|[1-9]\d+(?:[.,]\d+)?)\s*[ée]toiles?\b/gi,"5 étoiles");
      }
      return t;
    };
    if(Array.isArray(parsed.analysis.strengths))parsed.analysis.strengths=parsed.analysis.strengths.map(fixHeroStarText);
    if(Array.isArray(parsed.analysis.missing_information))parsed.analysis.missing_information=parsed.analysis.missing_information.map(fixHeroStarText);
    if(Array.isArray(parsed.analysis.priorities))parsed.analysis.priorities=parsed.analysis.priorities.map(p=>{
      if(!p||typeof p!=="object")return p;
      for(const k of ["target","action","reason","evidence"])if(p[k]!=null)p[k]=fixHeroStarText(p[k]);
      return p;
    });

    // V20.3.3 — Priorités fiables : un simple niveau de Drone n'est pas une preuve de retard.
    if(Array.isArray(parsed.analysis.priorities)){
      const isDrone=p=>/\bdrone\b/i.test(`${p?.target||""} ${p?.action||""} ${p?.reason||""}`);
      const droneSupported=p=>{
        const e=String(p?.evidence||"").toLowerCase();
        // Un nombre/une icône de niveau seul ne suffit pas.
        const onlyLevel=/\b(level|niveau|niv\.?|lvl\.?)\b/.test(e) && !/(module|composant|component|skill|compétence|retard|inférieur|lower|behind|étoile|star|qualité|tier)/i.test(e);
        const strong=/(module|composant|component|skill|compétence|retard|inférieur|lower|behind|étoile|star|qualité|tier)/i.test(e);
        return strong && !onlyLevel;
      };

      const normal=[];
      const weakDrone=[];
      for(const p of parsed.analysis.priorities){
        if(isDrone(p)&&!droneSupported(p)){
          p.requires_more_info=true;
          p.confidence=Math.min(Number(p.confidence||0.5),0.55);
          p.expected_impact=p.expected_impact==="high"?"medium":(p.expected_impact||"medium");
          p.severity=p.severity==="critical"||p.severity==="high"?"medium":(p.severity||"medium");
          if(!String(p.reason||"").toLowerCase().includes("détail")){
            p.reason="Le niveau du Drone est visible, mais cela ne suffit pas à prouver qu’il est le maillon faible de cette formation.";
          }
          if(!String(p.action||"").toLowerCase().includes("détail")){
            p.action="Ouvrir les détails du Drone et de ses modules avant d’en faire une priorité majeure.";
          }
          weakDrone.push(p);
        }else{
          normal.push(p);
        }
      }

      // Les priorités appuyées par une faiblesse visible passent avant le Drone non prouvé.
      parsed.analysis.priorities=[...normal,...weakDrone].slice(0,5).map((p,i)=>({...p,rank:i+1}));

      if(weakDrone.length){
        if(!Array.isArray(parsed.analysis.missing_information))parsed.analysis.missing_information=[];
        const msg="Capture détaillée du Drone/modules nécessaire pour savoir s’il mérite réellement une priorité élevée.";
        if(!parsed.analysis.missing_information.includes(msg))parsed.analysis.missing_information.push(msg);
        if(!parsed.analysis.next_capture){
          parsed.analysis.next_capture="Ouvre les détails du Drone et prends une capture de son niveau, de ses modules/composants et améliorations visibles.";
        }
      }
    }

    if(parsed.player.formation_power_m==null && parsed.analysis.formation_power_m!=null)parsed.player.formation_power_m=parsed.analysis.formation_power_m;
    if(parsed.player.formation_power_m!=null){
      if(!Array.isArray(parsed.player.squads))parsed.player.squads=[];
      if(!parsed.player.squads.length)parsed.player.squads.push({name:"Formation actuelle",type:parsed.player.main_squad_type||null,power_m:parsed.player.formation_power_m,heroes:[]});
      else if(parsed.player.squads[0].power_m==null)parsed.player.squads[0].power_m=parsed.player.formation_power_m;
    }

    return json(res,200,{player:parsed.player,analysis:parsed.analysis,model,usage});
  }catch(e){
    await refundCredit(user.id);
    const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
    if(e?.name==="AbortError")return json(res,504,{error:"Le Smart Scan a mis trop de temps. Réessaie avec une seule capture.",usage:refunded});
    console.error("smart player scan",e);
    return json(res,500,{error:"Erreur serveur pendant le Smart Scan.",usage:refunded});
  }finally{clearTimeout(timeout)}
}
