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



/* ===== V20.5.11 • VERIFIED ALLIANCE SYNC =====
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
  return {
    name,
    rank:normalizeAllianceRank(firstValue(m,["role","rank","alliance_role","member_role","r_level","allianceRank"])),
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
  const roleRaw=firstValue(p,["role","rank","alliance_role","member_role","r_level","allianceRank"]);
  const allianceId=firstValue(p,["alliance_id","allianceId"])||firstValue(allianceObj,["id","alliance_id","allianceId"])||null;
  return {
    name,
    server_id:server||null,
    alliance_tag:allianceTag||null,
    alliance_id:allianceId,
    rank:roleRaw!=null?normalizeAllianceRank(roleRaw):null,
    hq_level:hq,
    player_id:firstValue(p,["player_id","id","uid","playerId"])||null
  };
}
function lastwarAuthModes(family){
  const forced=String(process.env.LASTWAR_TOOLS_AUTH_MODE||"auto").trim().toLowerCase();
  if(forced==="bearer")return ["bearer"];
  if(forced==="x-api-key"||forced==="x_api_key"||forced==="xapikey")return ["x-api-key"];
  return family==="legacy"?["x-api-key","bearer"]:["bearer","x-api-key"];
}
function lastwarHeaders(apiKey,mode){
  const h={Accept:"application/json","User-Agent":"WarBoost/20.5.11"};
  if(mode==="bearer")h.Authorization=`Bearer ${apiKey}`;
  else h["X-API-Key"]=apiKey;
  return h;
}
function publicUpstreamError(status,kind="API"){
  if(status===401||status===403)return "Clé LastWar Tools refusée. Vérifie LASTWAR_TOOLS_API_KEY dans Vercel.";
  if(status===404||status===405)return `Le point d’accès ${kind} n’a pas été trouvé.`;
  if(status===429)return "Quota LastWar Tools atteint. Réessaie plus tard.";
  return `LastWar Tools indisponible (${status}).`;
}
function templateUrl(raw,replacements={}){
  let out=String(raw||"");
  for(const [k,v] of Object.entries(replacements))out=out.replaceAll(`{${k}}`,encodeURIComponent(String(v??"")));
  return out;
}
function playerUrlWithParams(raw,serverId,playerName){
  const templated=templateUrl(raw,{server_id:serverId,server:serverId,name:playerName,player_name:playerName});
  const u=new URL(templated);
  if(!u.searchParams.has("name"))u.searchParams.set("name",playerName);
  if(!u.searchParams.has("server_id"))u.searchParams.set("server_id",serverId);
  if(u.hostname==="api.lastwar.dev"&&!u.searchParams.has("server"))u.searchParams.set("server",serverId);
  return u.toString();
}
function playerEndpointCandidates(serverId,playerName){
  const configured=String(process.env.LASTWAR_TOOLS_PLAYER_SEARCH_URL||"").trim();
  if(configured)return [{url:playerUrlWithParams(configured,serverId,playerName),family:"configured"}];
  const base=String(process.env.LASTWAR_TOOLS_API_BASE||"https://api.lastwar.dev").replace(/\/+$/,"");
  const raw=[
    {url:`${base}/v1/player/search`,family:"modern"},
    {url:`${base}/world/find-player`,family:"modern"},
    {url:"https://api.lastwar.tools/world/find-player",family:"legacy"}
  ];
  const seen=new Set();
  return raw.map(x=>({...x,url:playerUrlWithParams(x.url,serverId,playerName)}))
    .filter(x=>!seen.has(x.url)&&seen.add(x.url));
}
function allianceUrlWithParams(raw,serverId,tag,allianceId){
  const templated=templateUrl(raw,{
    server_id:serverId,server:serverId,alliance_tag:tag,tag,
    alliance_id:allianceId||"",id:allianceId||""
  });
  const u=new URL(templated);
  if(!u.searchParams.has("server_id"))u.searchParams.set("server_id",serverId);
  if(!u.searchParams.has("alliance_tag"))u.searchParams.set("alliance_tag",tag);
  if(allianceId&&!u.searchParams.has("alliance_id"))u.searchParams.set("alliance_id",allianceId);
  if(u.hostname==="api.lastwar.dev"){
    if(!u.searchParams.has("server"))u.searchParams.set("server",serverId);
    if(!u.searchParams.has("tag"))u.searchParams.set("tag",tag);
  }
  return u.toString();
}
function allianceEndpointCandidates(serverId,tag,allianceId){
  const configured=String(process.env.LASTWAR_TOOLS_ALLIANCE_MEMBERS_URL||"").trim();
  if(configured)return [{url:allianceUrlWithParams(configured,serverId,tag,allianceId),family:"configured"}];
  const base=String(process.env.LASTWAR_TOOLS_API_BASE||"https://api.lastwar.dev").replace(/\/+$/,"");
  const raw=[
    {url:`${base}/v1/alliance/members`,family:"modern"},
    {url:`${base}/v1/alliances/members`,family:"modern"},
    {url:`${base}/v1/alliance/${encodeURIComponent(tag)}/members`,family:"modern"},
    {url:`${base}/v1/alliances/${encodeURIComponent(tag)}/members`,family:"modern"},
    ...(allianceId?[
      {url:`${base}/v1/alliance/${encodeURIComponent(String(allianceId))}/members`,family:"modern"},
      {url:`${base}/v1/alliances/${encodeURIComponent(String(allianceId))}/members`,family:"modern"}
    ]:[]),
    {url:`${base}/world/alliance-members`,family:"modern"},
    {url:"https://api.lastwar.tools/world/alliance-members",family:"legacy"}
  ];
  const seen=new Set();
  return raw.map(x=>({...x,url:allianceUrlWithParams(x.url,serverId,tag,allianceId)}))
    .filter(x=>!seen.has(x.url)&&seen.add(x.url));
}
async function fetchLastWarJson(url,apiKey,authMode,timeoutMs=16000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{method:"GET",signal:controller.signal,headers:lastwarHeaders(apiKey,authMode)});
    const raw=await r.text();
    let data={};
    try{data=raw?JSON.parse(raw):{}}catch{data={raw:String(raw||"").slice(0,500)}}
    return {r,data,raw};
  }finally{clearTimeout(timer)}
}
async function findAuthenticatedPlayer(apiKey,serverId,accountName,attempts){
  let lastError="Profil Last War introuvable.";
  for(const endpoint of playerEndpointCandidates(serverId,accountName)){
    for(const authMode of lastwarAuthModes(endpoint.family)){
      try{
        const {r,data,raw}=await fetchLastWarJson(endpoint.url,apiKey,authMode);
        attempts.push({kind:"player",family:endpoint.family,auth:authMode,status:r.status});
        if(r.ok){
          const player=extractPlayerRecord(data);
          if(player){
            if(normalizeName(player.name)!==normalizeName(accountName)){
              lastError="Le profil retourné ne correspond pas exactement au pseudo de ton compte WarBoost.";
              continue;
            }
            if(player.server_id&&String(player.server_id)!==String(serverId)){
              lastError="Le profil trouvé appartient à un autre serveur.";
              continue;
            }
            if(!player.alliance_tag){
              lastError="Ton profil Last War ne semble appartenir à aucune alliance actuellement.";
              continue;
            }
            return {player,api_compat:endpoint.family,auth_compat:authMode};
          }
          lastError="LastWar Tools n’a pas retourné de profil joueur exploitable.";
          break;
        }
        lastError=publicUpstreamError(r.status,"Player Search");
        console.error("LastWar Tools player lookup",{family:endpoint.family,auth:authMode,status:r.status,body:String(raw).slice(0,300)});
        if(r.status===429)throw Object.assign(new Error(lastError),{status:429});
        if(r.status===401||r.status===403)continue;
        break;
      }catch(e){
        if(e?.status===429)throw e;
        attempts.push({kind:"player",family:endpoint.family,auth:authMode,status:e?.name==="AbortError"?504:0});
        lastError=e?.name==="AbortError"?"LastWar Tools met trop de temps à répondre.":"Connexion LastWar Tools impossible.";
      }
    }
  }
  throw new Error(lastError);
}
async function fetchVerifiedAllianceMembers(apiKey,serverId,player,attempts){
  const tag=String(player.alliance_tag||"").trim();
  let lastError="Connexion Alliance Members impossible.";
  for(const endpoint of allianceEndpointCandidates(serverId,tag,player.alliance_id)){
    for(const authMode of lastwarAuthModes(endpoint.family)){
      try{
        const {r,data,raw}=await fetchLastWarJson(endpoint.url,apiKey,authMode);
        attempts.push({kind:"alliance",family:endpoint.family,auth:authMode,status:r.status});
        if(r.ok){
          const members=extractAllianceMembers(data).map(normalizeAllianceMember).filter(Boolean).slice(0,100);
          if(members.length){
            const a=data?.alliance||data?.data?.alliance||data?.meta?.alliance||{};
            const returnedTag=String(firstValue(a,["tag","alliance_tag"])||data?.alliance_tag||tag).trim()||tag;
            const returnedServer=String(firstValue(a,["server_id","server"])||data?.server_id||serverId);
            if(normalizeName(returnedTag)!==normalizeName(tag)){
              lastError="L’API a retourné une autre alliance que celle de ton profil Last War.";
              continue;
            }
            const self=members.find(m=>normalizeName(m.name)===normalizeName(player.name));
            if(!self){
              lastError="Ton joueur n’apparaît pas dans le roster retourné pour cette alliance.";
              continue;
            }
            if(!["R4","R5"].includes(String(self.rank||"").toUpperCase())){
              const err=new Error("La synchronisation complète est réservée aux membres R4/R5 de leur propre alliance.");
              err.status=403;throw err;
            }
            return {
              members,self,
              alliance:{tag:returnedTag,server_id:returnedServer,name:firstValue(a,["name","alliance_name"])||null},
              api_compat:endpoint.family,auth_compat:authMode
            };
          }
          lastError="La réponse LastWar Tools ne contient aucun membre pour ton alliance.";
          break;
        }
        lastError=publicUpstreamError(r.status,"Alliance Members");
        console.error("LastWar Tools alliance sync",{family:endpoint.family,auth:authMode,status:r.status,body:String(raw).slice(0,300)});
        if(r.status===429)throw Object.assign(new Error(lastError),{status:429});
        if(r.status===401||r.status===403)continue;
        break;
      }catch(e){
        if(e?.status===403||e?.status===429)throw e;
        attempts.push({kind:"alliance",family:endpoint.family,auth:authMode,status:e?.name==="AbortError"?504:0});
        lastError=e?.name==="AbortError"?"LastWar Tools met trop de temps à répondre.":"Connexion LastWar Tools impossible.";
      }
    }
  }
  throw new Error(lastError);
}
async function handleAllianceSync(req,res){
  let user;
  try{
    user=await authUser(req);
    if(!user)return json(res,401,{error:"Connecte ton compte WarBoost pour synchroniser ton alliance."});
    const sub=await getSubscription(user.id);
    if(!isPro(sub))return json(res,403,{error:"La synchronisation automatique d’alliance est réservée à WarBoost PRO."});
  }catch(e){
    console.error("alliance sync entitlement",e);
    return json(res,503,{error:"Vérification du compte WarBoost indisponible."});
  }

  const now=Date.now(),last=Number(allianceSyncRate.get(user.id)||0);
  if(now-last<45000)return json(res,429,{error:"Patiente quelques secondes avant une nouvelle synchronisation.",retry_after:Math.ceil((45000-(now-last))/1000)});
  allianceSyncRate.set(user.id,now);

  const apiKey=String(process.env.LASTWAR_TOOLS_API_KEY||"").trim();
  if(!apiKey)return json(res,503,{error:"La connexion LastWar Tools n’est pas encore configurée dans Vercel (LASTWAR_TOOLS_API_KEY)."});

  const serverId=String(req.body?.server_id||"").trim();
  if(!/^\d{1,6}$/.test(serverId))return json(res,400,{error:"Numéro de serveur invalide."});

  // Critical V20.5.11 guard: alliance_tag from the browser is intentionally ignored.
  const accountName=String(user?.user_metadata?.display_name||"").trim();
  if(!accountName)return json(res,400,{error:"Ajoute ton pseudo Last War comme nom de ton compte WarBoost avant de synchroniser."});


  const attempts=[];
  try{
    const identity=await findAuthenticatedPlayer(apiKey,serverId,accountName,attempts);
    const roster=await fetchVerifiedAllianceMembers(apiKey,serverId,identity.player,attempts);
    return json(res,200,{
      provider:"LastWar Tools",
      source:"community_api",
      identity_verified:true,
      synced_at:new Date().toISOString(),
      verified_player:{
        name:roster.self.name,
        rank:roster.self.rank,
        server_id:String(serverId),
        alliance_tag:roster.alliance.tag,
        player_id:roster.self.player_id||identity.player.player_id||null
      },
      alliance:roster.alliance,
      members:roster.members,
      api_compat:{player:identity.api_compat,alliance:roster.api_compat},
      auth_compat:{player:identity.auth_compat,alliance:roster.auth_compat}
    });
  }catch(e){
    const status=e?.status===403?403:e?.status===429?429:502;
    console.error("verified alliance sync",e);
    return json(res,status,{
      error:`${e?.message||"Synchronisation vérifiée impossible."} WarBoost ne permet pas de choisir une autre alliance : elle doit être celle trouvée pour ton profil Last War.`,
      compat_attempts:attempts.map(x=>`${x.kind}:${x.family}:${x.auth}:${x.status}`)
    });
  }
}

export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Méthode non autorisée."});

  // Alliance sync is data infrastructure: no OpenAI call and no WarBoost AI credit.
  if(String(req.body?.mode||"").toLowerCase()==="alliance_sync")return handleAllianceSync(req,res);
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
