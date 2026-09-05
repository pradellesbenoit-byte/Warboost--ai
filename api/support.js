import {randomBytes} from "node:crypto";
import {requireUser} from "../lib/auth.js";
import {betaAccessForUser} from "../lib/beta-access.js";

function pick(...names){for(const n of names){const v=process.env[n];if(typeof v==="string"&&v.trim())return v.trim()}return ""}
const sbUrl=()=>pick("SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL").replace(/\/$/,"");
const serviceKey=()=>pick("SUPABASE_SERVICE_ROLE_KEY");
const configured=()=>Boolean(sbUrl()&&serviceKey());
function adminEmails(){return [...new Set(String(process.env.WARBOOST_SUPPORT_ADMINS||"").split(/[;,\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean))]}
function isAdmin(user){return adminEmails().includes(String(user?.email||"").trim().toLowerCase())}
function safeText(v,max=4000){return String(v??"").replace(/\u0000/g,"").trim().slice(0,max)}
function cleanCategory(v){const x=String(v||"").toLowerCase();return ["login","scan","data","ai","alliance","bug","suggestion","other"].includes(x)?x:"other"}
function cleanStatus(v){const x=String(v||"").toLowerCase();return ["received","in_progress","waiting_player","resolved"].includes(x)?x:"received"}
function ticketNo(){const d=new Date(),ymd=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;return `WB-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`}
async function parse(r){const t=await r.text();let b=null;try{b=t?JSON.parse(t):null}catch{b=t}if(!r.ok){const raw=`${b?.code||""} ${b?.message||""}`.toLowerCase();const missing=/42p01|pgrst205|could not find the table|relation .* does not exist/.test(raw);throw Object.assign(new Error(missing?"Support schema missing. Apply migration_v2_5_24_support.sql.":(b?.message||`Supabase HTTP ${r.status}`)),{status:missing?503:r.status,code:missing?"SUPPORT_SCHEMA_MISSING":"SUPPORT_DATABASE_ERROR",body:b})}return b}
async function rest(path,options={}){if(!configured())throw Object.assign(new Error("Support database not configured"),{status:503,code:"SUPPORT_NOT_CONFIGURED"});return parse(await fetch(`${sbUrl()}/rest/v1/${path}`,{...options,headers:{apikey:serviceKey(),authorization:`Bearer ${serviceKey()}`,"content-type":"application/json",...(options.headers||{})}}))}
async function uploadAttachment({ticketNo:tn,dataUrl,name}){
  const m=String(dataUrl||"").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);if(!m)return null;
  const bytes=Buffer.from(m[2],"base64");if(!bytes.length||bytes.length>2*1024*1024)throw Object.assign(new Error("Capture trop volumineuse (2 Mo maximum après compression)."),{status:413,code:"ATTACHMENT_TOO_LARGE"});
  const ext=m[1].toLowerCase()==="image/png"?"png":m[1].toLowerCase()==="image/webp"?"webp":"jpg";
  const path=`${tn}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const r=await fetch(`${sbUrl()}/storage/v1/object/warboost-support/${path}`,{method:"POST",headers:{apikey:serviceKey(),authorization:`Bearer ${serviceKey()}`,"content-type":m[1],"x-upsert":"false"},body:bytes});
  if(!r.ok){const body=await r.text().catch(()=>"");throw Object.assign(new Error(`Support attachment upload failed: ${body.slice(0,160)}`),{status:502,code:"ATTACHMENT_UPLOAD_FAILED"})}
  return {path,name:safeText(name||`capture.${ext}`,160)};
}
async function signedAttachment(path){if(!path)return null;const r=await fetch(`${sbUrl()}/storage/v1/object/sign/warboost-support/${path}`,{method:"POST",headers:{apikey:serviceKey(),authorization:`Bearer ${serviceKey()}`,"content-type":"application/json"},body:JSON.stringify({expiresIn:300})});if(!r.ok)return null;const j=await r.json().catch(()=>({}));const p=j?.signedURL||j?.signedUrl;return p?`${sbUrl()}/storage/v1${p.startsWith("/")?p:`/${p}`}`:null}
async function messagesFor(ticketIds){if(!ticketIds.length)return [];const ids=ticketIds.map(x=>`"${String(x).replace(/"/g,"")}"`).join(",");return await rest(`wb1_support_messages?ticket_id=in.(${encodeURIComponent(ids)})&select=id,ticket_id,author_kind,author_player_id,author_email,body,created_at&order=created_at.asc&limit=1000`).catch(()=>[])}
function enrich(tickets,messages){const map=new Map();for(const m of messages||[]){if(!map.has(m.ticket_id))map.set(m.ticket_id,[]);map.get(m.ticket_id).push(m)}return (tickets||[]).map(t=>({...t,messages:map.get(t.id)||[]}))}
async function ownTicket(id,playerId){const rows=await rest(`wb1_support_tickets?id=eq.${encodeURIComponent(id)}&player_id=eq.${encodeURIComponent(playerId)}&select=*&limit=1`);return rows?.[0]||null}
async function anyTicket(id){const rows=await rest(`wb1_support_tickets?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);return rows?.[0]||null}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!configured())return res.status(503).json({error:"SUPPORT_NOT_CONFIGURED",message:"Le stockage support WarBoost n'est pas encore configuré."});
  try{
    const user=await requireUser(req),admin=isAdmin(user),beta=betaAccessForUser(user);
    if(req.method==="GET"){
      const wantAdmin=String(req.query?.admin||"")==="1";
      if(wantAdmin&&!admin)return res.status(403).json({error:"SUPPORT_ADMIN_REQUIRED"});
      const path=wantAdmin
        ?`wb1_support_tickets?select=*&order=updated_at.desc&limit=250`
        :`wb1_support_tickets?player_id=eq.${encodeURIComponent(user.id)}&select=*&order=updated_at.desc&limit=100`;
      const tickets=await rest(path),messages=await messagesFor((tickets||[]).map(x=>x.id));
      return res.status(200).json({ok:true,admin:wantAdmin,tickets:enrich(tickets,messages),support_admin_configured:adminEmails().length>0,beta_access:beta.access_status});
    }
    if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
    const action=safeText(req.body?.action,40)||"create";
    if(action==="create"){
      if(!beta.configured)return res.status(503).json({error:"BETA_ALLOWLIST_NOT_CONFIGURED"});
      if(!beta.allowed)return res.status(403).json({error:"BETA_INVITE_REQUIRED"});
      const category=cleanCategory(req.body?.category),subject=safeText(req.body?.subject,140),description=safeText(req.body?.description,6000);
      if(subject.length<3||description.length<8)return res.status(400).json({error:"SUPPORT_FIELDS_REQUIRED"});
      const tn=ticketNo(),attachment=await uploadAttachment({ticketNo:tn,dataUrl:req.body?.attachment_data_url,name:req.body?.attachment_name});
      const row={ticket_no:tn,player_id:user.id,email:safeText(user.email,220),nickname:safeText(req.body?.nickname,100),category,subject,description,status:"received",app_version:safeText(req.body?.app_version,30),locale:safeText(req.body?.locale,20),screen:safeText(req.body?.screen,80),diagnostics:(req.body?.diagnostics&&typeof req.body.diagnostics==="object")?req.body.diagnostics:{},attachment_path:attachment?.path||null,attachment_name:attachment?.name||null,updated_at:new Date().toISOString()};
      const created=await rest("wb1_support_tickets",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(row)}),ticket=created?.[0];
      if(!ticket)return res.status(502).json({error:"SUPPORT_CREATE_FAILED"});
      await rest("wb1_support_messages",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({ticket_id:ticket.id,author_kind:"player",author_player_id:user.id,author_email:safeText(user.email,220),body:description})});
      return res.status(201).json({ok:true,ticket:{...ticket,messages:[]}});
    }
    if(action==="reply"){
      const id=safeText(req.body?.ticket_id,80),body=safeText(req.body?.body,5000);if(!id||body.length<2)return res.status(400).json({error:"SUPPORT_REPLY_REQUIRED"});
      const ticket=admin?await anyTicket(id):await ownTicket(id,user.id);if(!ticket)return res.status(404).json({error:"SUPPORT_TICKET_NOT_FOUND"});
      const author_kind=admin&&req.body?.as_support!==false?"support":"player";
      await rest("wb1_support_messages",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({ticket_id:id,author_kind,author_player_id:user.id,author_email:safeText(user.email,220),body})});
      const nextStatus=author_kind==="support"?"waiting_player":(ticket.status==="resolved"?"in_progress":ticket.status);
      await rest(`wb1_support_tickets?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:nextStatus,updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,status:nextStatus});
    }
    if(action==="status"){
      if(!admin)return res.status(403).json({error:"SUPPORT_ADMIN_REQUIRED"});const id=safeText(req.body?.ticket_id,80),status=cleanStatus(req.body?.status);if(!id)return res.status(400).json({error:"SUPPORT_TICKET_REQUIRED"});
      const ticket=await anyTicket(id);if(!ticket)return res.status(404).json({error:"SUPPORT_TICKET_NOT_FOUND"});
      await rest(`wb1_support_tickets?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,status});
    }
    if(action==="attachment"){
      const id=safeText(req.body?.ticket_id,80),ticket=admin?await anyTicket(id):await ownTicket(id,user.id);if(!ticket)return res.status(404).json({error:"SUPPORT_TICKET_NOT_FOUND"});
      const url=await signedAttachment(ticket.attachment_path);return res.status(200).json({ok:true,url,name:ticket.attachment_name||"capture"});
    }
    return res.status(400).json({error:"SUPPORT_ACTION_UNKNOWN"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"SUPPORT_ERROR",message:e.message})}
}
