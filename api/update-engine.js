import crypto from "crypto";

function send(res,status,data){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  return res.status(status).json(data);
}
function env(){return {url:process.env.SUPABASE_URL,secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,openai:process.env.OPENAI_API_KEY}}
function serviceHeaders(extra={}){
  const {secret}=env();const h={apikey:secret,Accept:"application/json",...extra};
  if(secret&&!String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;
  return h;
}
function bearer(req){const v=String(req.headers?.authorization||"");return v.toLowerCase().startsWith("bearer ")?v.slice(7).trim():""}
async function currentUser(req){
  const {url,secret}=env();const token=bearer(req);if(!url||!secret||!token)return null;
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:secret,Authorization:`Bearer ${token}`,Accept:"application/json"}});if(!r.ok)return null;return await r.json().catch(()=>null);
}
async function adminForUser(user){
  if(!user?.id)return null;const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_admins?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,{headers:serviceHeaders()});if(!r.ok)return null;const rows=await r.json().catch(()=>[]);return Array.isArray(rows)&&rows[0]?rows[0]:null;
}
async function requireAdmin(req,res){
  const user=await currentUser(req);if(!user){send(res,401,{error:"Connecte-toi à ton compte WarBoost."});return null}
  const admin=await adminForUser(user);if(!admin){send(res,403,{error:"Accès Auto Update refusé."});return null}
  return {user,role:admin.role||"admin"};
}
function txt(v,max=6000){return String(v??"").trim().slice(0,max)}
function safeUrl(v){const s=txt(v,700);if(!s)return null;try{const u=new URL(s);return ["http:","https:"].includes(u.protocol)?u.toString():null}catch{return null}}
function clamp(n,min,max,fallback){const v=Number(n);return Number.isFinite(v)?Math.min(max,Math.max(min,Math.round(v))):fallback}
const cats=new Set(["general","season","vs","hero","event","r5r4"]);
function outputText(data){if(data?.output_text)return data.output_text;const chunks=[];for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&c?.text)chunks.push(c.text);return chunks.join("\n")}
function jsonFromText(raw){
  let s=txt(raw,50000).replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
  try{return JSON.parse(s)}catch{}
  const a=s.indexOf("{");const b=s.lastIndexOf("}");if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}
  return null;
}
function fingerprint(x){const base=[x.category,txt(x.title,200).toLowerCase().replace(/\s+/g," "),safeUrl(x.source_url)||""].join("|");return crypto.createHash("sha256").update(base).digest("hex")}
async function listProposals(){
  const {url}=env();const sel="id,fingerprint,category,title,summary,body,priority,confidence,status,source_label,source_url,evidence,detected_at,published_content_id,created_at,updated_at";
  const r=await fetch(`${url}/rest/v1/warboost_update_proposals?select=${encodeURIComponent(sel)}&order=detected_at.desc&limit=50`,{headers:serviceHeaders()});if(!r.ok)throw new Error(`Supabase ${r.status}`);return await r.json().catch(()=>[]);
}
async function lastScan(){
  const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_update_scans?select=id,status,found_count,inserted_count,model,created_at,completed_at&order=created_at.desc&limit=1`,{headers:serviceHeaders()});if(!r.ok)return null;const rows=await r.json().catch(()=>[]);return Array.isArray(rows)&&rows[0]?rows[0]:null;
}
async function currentLive(){
  const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_live_content?is_active=eq.true&select=category,title,summary,updated_at&order=updated_at.desc&limit=30`,{headers:serviceHeaders()});if(!r.ok)return [];return await r.json().catch(()=>[]);
}
async function createScan(userId){
  const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_update_scans`,{method:"POST",headers:serviceHeaders({"Content-Type":"application/json",Prefer:"return=representation"}),body:JSON.stringify({requested_by:userId,status:"started"})});const rows=await r.json().catch(()=>[]);if(!r.ok)throw new Error("Impossible de démarrer le scan.");return Array.isArray(rows)?rows[0]:rows;
}
async function finishScan(id,data){
  const {url}=env();await fetch(`${url}/rest/v1/warboost_update_scans?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:serviceHeaders({"Content-Type":"application/json"}),body:JSON.stringify({...data,completed_at:new Date().toISOString()})});
}
async function insertProposal(row){
  const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_update_proposals?on_conflict=fingerprint`,{method:"POST",headers:serviceHeaders({"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=representation"}),body:JSON.stringify(row)});const data=await r.json().catch(()=>[]);if(!r.ok)throw new Error(data?.message||`Supabase ${r.status}`);return Array.isArray(data)?data:[];
}
async function findProposal(id){
  const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_update_proposals?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,{headers:serviceHeaders()});if(!r.ok)return null;const rows=await r.json().catch(()=>[]);return Array.isArray(rows)&&rows[0]?rows[0]:null;
}
async function markProposal(id,patch){
  const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_update_proposals?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:serviceHeaders({"Content-Type":"application/json",Prefer:"return=representation"}),body:JSON.stringify(patch)});const d=await r.json().catch(()=>[]);if(!r.ok)throw new Error(d?.message||`Supabase ${r.status}`);return Array.isArray(d)?d[0]:d;
}
function livePayloadIcon(cat){return ({general:"🔄",season:"🌍",vs:"🏆",hero:"🦸",event:"📅",r5r4:"🧠"})[cat]||"🔔"}
async function publishProposal(p){
  const {url}=env();const key=`auto_${p.category}_${fingerprint(p).slice(0,16)}`;
  const row={content_key:key,category:p.category,scope:"global",title:p.title,summary:p.summary||null,body:p.body||null,payload:{icon:livePayloadIcon(p.category),badge:String(p.category||"LIVE").toUpperCase(),auto_update:true,confidence:p.confidence,evidence:p.evidence||[]},priority:p.priority||30,is_active:true,source_label:p.source_label||"WarBoost Auto Update",source_url:safeUrl(p.source_url),version:1};
  const r=await fetch(`${url}/rest/v1/warboost_live_content?on_conflict=content_key`,{method:"POST",headers:serviceHeaders({"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=representation"}),body:JSON.stringify(row)});const d=await r.json().catch(()=>[]);if(!r.ok)throw new Error(d?.message||`Supabase ${r.status}`);const item=Array.isArray(d)?d[0]:d;await markProposal(p.id,{status:"published",published_content_id:item?.id||null});return item;
}
function normalizeProposal(x){
  const category=cats.has(txt(x?.category,30))?txt(x.category,30):"general";const title=txt(x?.title,160);if(!title)return null;
  const ev=(Array.isArray(x?.evidence)?x.evidence:[]).map(e=>({title:txt(e?.title||e?.label,180)||"Source",url:safeUrl(e?.url)})).filter(e=>e.url).slice(0,5);
  const main=safeUrl(x?.source_url)||ev[0]?.url||null;
  const row={category,title,summary:txt(x?.summary,500)||null,body:txt(x?.body,5000)||null,priority:clamp(x?.priority,1,999,30),confidence:clamp(x?.confidence,0,100,70),status:"pending",source_label:txt(x?.source_label,120)||"WarBoost Auto Update",source_url:main,evidence:ev,detected_at:new Date().toISOString()};row.fingerprint=fingerprint(row);return row;
}
async function scanWithOpenAI(live){
  const {openai}=env();if(!openai)throw new Error("OPENAI_API_KEY manquante dans Vercel.");
  const configured=txt(process.env.OPENAI_UPDATE_MODEL,80);
  const primary=configured||"gpt-5.1";
  const candidates=[primary,...(primary!=="gpt-5-mini"?["gpt-5-mini"]:[])];
  const now=new Date().toISOString();
  const prompt=`Nous maintenons WarBoost, un assistant pour Last War: Survival Game. Date UTC actuelle: ${now}.

Recherche sur le web les changements RÉCENTS et réellement utiles aux joueurs qui pourraient nécessiter une mise à jour WarBoost : saisons, Alliance Duel/VS, héros, événements, professions, mécaniques R5/R4, progression ou règles importantes.

Règles strictes:
- privilégie les sources officielles Last War (lastwar.com et comptes officiels) puis des sources communautaires spécialisées seulement si elles apportent une information utile;
- ne propose rien qui ne soit pas suffisamment vérifiable;
- ne transforme pas des conseils génériques en « nouveauté »;
- évite les doublons avec le contenu WarBoost déjà publié ci-dessous;
- maximum 4 propositions, zéro est acceptable;
- chaque proposition doit citer au moins une URL source;
- rédige les contenus en français, courts et utilisables sur mobile.

Contenu Live déjà publié:
${JSON.stringify(live||[]).slice(0,6000)}

Retourne uniquement les propositions structurées demandées.`;

  const schema={
    type:"object",
    additionalProperties:false,
    properties:{
      proposals:{
        type:"array",
        maxItems:4,
        items:{
          type:"object",
          additionalProperties:false,
          properties:{
            category:{type:"string",enum:["season","vs","hero","event","r5r4","general"]},
            title:{type:"string"},
            summary:{type:"string"},
            body:{type:"string"},
            priority:{type:"integer",minimum:1,maximum:999},
            confidence:{type:"integer",minimum:0,maximum:100},
            source_label:{type:"string"},
            source_url:{type:"string"},
            evidence:{
              type:"array",
              maxItems:5,
              items:{
                type:"object",
                additionalProperties:false,
                properties:{title:{type:"string"},url:{type:"string"}},
                required:["title","url"]
              }
            }
          },
          required:["category","title","summary","body","priority","confidence","source_label","source_url","evidence"]
        }
      }
    },
    required:["proposals"]
  };

  let lastError=null;
  for(const model of candidates){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),52000);
    try{
      const reasoningEffort=model.startsWith("gpt-5.1")?"none":"low";
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        signal:controller.signal,
        headers:{Authorization:`Bearer ${openai}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,
          reasoning:{effort:reasoningEffort},
          tools:[{type:"web_search",search_context_size:"low"}],
          max_output_tokens:6000,
          text:{
            verbosity:"low",
            format:{
              type:"json_schema",
              name:"warboost_update_proposals",
              strict:true,
              schema
            }
          },
          input:prompt
        })
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok){
        const msg=data?.error?.message||`OpenAI ${r.status}`;
        // Si le modèle principal n'est pas disponible, essaye automatiquement gpt-5-mini.
        if(model!==candidates[candidates.length-1] && /model|access|not found|does not exist/i.test(msg)){
          lastError=new Error(msg);
          continue;
        }
        throw new Error(msg);
      }
      if(data?.status==="incomplete"){
        const reason=data?.incomplete_details?.reason||"incomplete";
        console.error("WarBoost Auto Update incomplete",{model,reason,details:data?.incomplete_details});
        throw new Error(reason==="max_output_tokens"
          ?"Le scan a manqué de capacité de sortie malgré la marge de sécurité. Réessaie."
          :"Le scan a été interrompu avant la fin de la réponse. Réessaie.");
      }
      const raw=outputText(data);
      const parsed=jsonFromText(raw);
      if(!parsed||!Array.isArray(parsed.proposals)){
        console.error("WarBoost Auto Update invalid output",{model,status:data?.status,incomplete_details:data?.incomplete_details,raw:raw?.slice(0,1200)});
        throw new Error("Réponse Auto Update invalide malgré le format structuré.");
      }
      return {model,proposals:parsed.proposals};
    }catch(e){
      lastError=e;
      if(e?.name==="AbortError")throw e;
      if(model===candidates[candidates.length-1])throw e;
    }finally{
      clearTimeout(timeout);
    }
  }
  throw lastError||new Error("Le scan Auto Update a échoué.");
}
export default async function handler(req,res){
  const {url,secret}=env();if(!url||!secret)return send(res,503,{error:"Auto Update WarBoost non configuré."});const auth=await requireAdmin(req,res);if(!auth)return;
  if(req.method==="GET"){
    try{const [items,scan]=await Promise.all([listProposals(),lastScan()]);return send(res,200,{ok:true,items,last_scan_at:scan?.completed_at||scan?.created_at||null,last_scan:scan})}catch(e){console.error("update-engine list",e);return send(res,502,{error:"Impossible de charger les propositions Auto Update."})}
  }
  if(req.method!=="POST")return send(res,405,{error:"Méthode non autorisée."});
  const b=req.body&&typeof req.body==="object"?req.body:{};const action=txt(b.action,30);
  if(action==="scan"){
    const recent=await lastScan();const recentAt=Date.parse(recent?.created_at||0)||0;if(recent&&recent.status!=="failed"&&Date.now()-recentAt<10*60*1000){const items=await listProposals();return send(res,200,{ok:true,skipped:true,found:recent.found_count||0,inserted:recent.inserted_count||0,last_scan_at:recent.completed_at||recent.created_at,items})}
    const scan=await createScan(auth.user.id);
    try{
      const live=await currentLive();const result=await scanWithOpenAI(live);const normalized=result.proposals.map(normalizeProposal).filter(Boolean).filter(x=>x.confidence>=65&&x.source_url);let inserted=0;
      for(const row of normalized){const rows=await insertProposal(row);inserted+=rows.length}
      await finishScan(scan.id,{status:"completed",found_count:normalized.length,inserted_count:inserted,model:result.model,error_message:null});
      return send(res,200,{ok:true,found:normalized.length,inserted,model:result.model,scanned_at:new Date().toISOString()});
    }catch(e){console.error("update-engine scan",e);await finishScan(scan.id,{status:"failed",error_message:txt(e?.message,500)}).catch(()=>{});if(e?.name==="AbortError")return send(res,504,{error:"Le scan web a dépassé le temps prévu. Réessaie plus tard."});return send(res,502,{error:e?.message||"Le scan Auto Update a échoué."})}
  }
  const id=txt(b.id,80);if(!id)return send(res,400,{error:"Proposition manquante."});const p=await findProposal(id);if(!p)return send(res,404,{error:"Proposition introuvable."});
  try{
    if(action==="publish"){const item=await publishProposal(p);return send(res,200,{ok:true,item})}
    if(action==="reject"){const item=await markProposal(id,{status:"rejected"});return send(res,200,{ok:true,item})}
    if(action==="mark_published"){const item=await markProposal(id,{status:"published",published_content_id:txt(b.published_content_id,80)||null});return send(res,200,{ok:true,item})}
    return send(res,400,{error:"Action Auto Update inconnue."});
  }catch(e){console.error("update-engine action",e);return send(res,502,{error:"Action Auto Update impossible."})}
}
