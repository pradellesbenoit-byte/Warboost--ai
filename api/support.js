import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {requireUser} from "../lib/auth.js";
import {betaAccessForUserAsync} from "../lib/beta-access.js";

function pick(...names){for(const n of names){const v=process.env[n];if(typeof v==="string"&&v.trim())return v.trim()}return ""}
const sbUrl=()=>pick("SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL").replace(/\/$/,"");
const serviceKey=()=>pick("SUPABASE_SERVICE_ROLE_KEY");
const configured=()=>Boolean(sbUrl()&&serviceKey());
function adminEmails(){return [...new Set(String(process.env.WARBOOST_SUPPORT_ADMINS||"").split(/[;,\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean))]}
const DEFAULT_BETA_CODE_HASH="13da15f59b83d395f6a637de15953870754436f9069d2819f78becb9a8bf2a32";
const BETA_CODE_SOURCE="beta-code-hf8.6.5";
const BETA_CODE_MAX_USERS=25;
const BETA_CODE_ACCEPT_UNTIL=Date.parse("2026-10-31T23:59:59Z");
function normalizeBetaCode(v){return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,80)}
function betaCodeHash(){const raw=String(process.env.WARBOOST_BETA_CODE_HASH||DEFAULT_BETA_CODE_HASH).trim().toLowerCase();return /^[a-f0-9]{64}$/.test(raw)?raw:DEFAULT_BETA_CODE_HASH}
function betaCodeMatches(v){const got=createHash("sha256").update(normalizeBetaCode(v)).digest(),want=Buffer.from(betaCodeHash(),"hex");return got.length===want.length&&timingSafeEqual(got,want)}
function isAdmin(user){return adminEmails().includes(String(user?.email||"").trim().toLowerCase())}
function safeText(v,max=4000){return String(v??"").replace(/\u0000/g,"").trim().slice(0,max)}
function cleanCategory(v){const x=String(v||"").toLowerCase();return ["login","scan","data","ai","alliance","bug","suggestion","other"].includes(x)?x:"other"}
function cleanStatus(v){const x=String(v||"").toLowerCase();return ["received","in_progress","waiting_player","resolved"].includes(x)?x:"received"}
function cleanEmail(v){return safeText(v,254).toLowerCase()}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(v))}
function ticketNo(){const d=new Date(),ymd=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;return `WB-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`}
function schemaMissing(raw){return /42p01|pgrst205|could not find the table|relation .* does not exist/.test(String(raw||"").toLowerCase())}
async function parse(r,path=""){
  const t=await r.text();let b=null;try{b=t?JSON.parse(t):null}catch{b=t}
  if(!r.ok){
    const raw=`${b?.code||""} ${b?.message||""} ${typeof b==="string"?b:""}`;
    const missing=schemaMissing(raw),invitePath=String(path).startsWith("wb1_beta_invites");
    const message=missing?(invitePath?"Registre d’invitations manquant. Applique migration_v2_5_26_beta_invites.sql.":"Support schema missing. Apply migration_v2_5_24_support.sql."):(b?.message||`Supabase HTTP ${r.status}`);
    throw Object.assign(new Error(message),{status:missing?503:r.status,code:missing?(invitePath?"BETA_INVITES_SCHEMA_MISSING":"SUPPORT_SCHEMA_MISSING"):"SUPPORT_DATABASE_ERROR",body:b});
  }
  return b;
}
async function rest(path,options={}){
  if(!configured())throw Object.assign(new Error("Support database not configured"),{status:503,code:"SUPPORT_NOT_CONFIGURED"});
  return parse(await fetch(`${sbUrl()}/rest/v1/${path}`,{...options,headers:{apikey:serviceKey(),authorization:`Bearer ${serviceKey()}`,"content-type":"application/json",...(options.headers||{})}}),path);
}
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
async function inviteByEmail(email){const rows=await rest(`wb1_beta_invites?email=eq.${encodeURIComponent(cleanEmail(email))}&select=*&limit=1`);return rows?.[0]||null}
async function inviteById(id){const rows=await rest(`wb1_beta_invites?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);return rows?.[0]||null}
async function listInvites(){return await rest("wb1_beta_invites?select=*&order=updated_at.desc&limit=1000")}
async function betaCodeUserCount(){const rows=await rest(`wb1_beta_invites?invited_by_user_id=eq.${encodeURIComponent(BETA_CODE_SOURCE)}&status=in.(pending,accepted)&select=id&limit=1000`);return Array.isArray(rows)?rows.length:0}
async function activateByBetaCode({code,user}){
  const email=cleanEmail(user?.email);if(!validEmail(email))throw Object.assign(new Error("BETA_ACCESS_EMAIL_REQUIRED"),{status:400,code:"BETA_ACCESS_EMAIL_REQUIRED"});
  const existing=await inviteByEmail(email),now=new Date().toISOString();
  if(existing?.status==="revoked")throw Object.assign(new Error("Cet accès bêta a été révoqué."),{status:403,code:"BETA_ACCESS_REVOKED"});
  if(existing&&["pending","accepted"].includes(String(existing.status||"").toLowerCase())){
    await rest(`wb1_beta_invites?id=eq.${encodeURIComponent(existing.id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"accepted",accepted_at:existing.accepted_at||now,accepted_user_id:String(user?.id||"")||existing.accepted_user_id||null,updated_at:now})});
    return {allowed:true,already_allowed:true};
  }
  if(Date.now()>BETA_CODE_ACCEPT_UNTIL)throw Object.assign(new Error("Ce code bêta n’accepte plus de nouveaux comptes."),{status:403,code:"BETA_CODE_EXPIRED"});
  if(!betaCodeMatches(code))throw Object.assign(new Error("Code d’accès bêta incorrect."),{status:403,code:"BETA_CODE_INVALID"});
  const count=await betaCodeUserCount();if(count>=BETA_CODE_MAX_USERS)throw Object.assign(new Error("La limite de testeurs de ce code bêta est atteinte."),{status:403,code:"BETA_CODE_FULL"});
  await rest("wb1_beta_invites",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({email,status:"accepted",note:"Accès par code bêta privé HF8.6.5",invited_by_user_id:BETA_CODE_SOURCE,invited_by_email:null,invited_at:now,accepted_at:now,accepted_user_id:String(user?.id||"")||null,updated_at:now})});
  return {allowed:true,already_allowed:false,remaining:Math.max(0,BETA_CODE_MAX_USERS-count-1)};
}
function splitInviteEmails(body){
  const raw=Array.isArray(body?.emails)?body.emails:[body?.email||""];
  const expanded=raw.flatMap(v=>String(v||"").split(/[;,\n\s]+/)).map(cleanEmail).filter(Boolean);
  return [...new Set(expanded)].slice(0,100);
}
async function addInvites({emails,note,user}){
  const results=[],now=new Date().toISOString();
  for(const email of emails){
    if(!validEmail(email)){results.push({email,ok:false,error:"INVALID_EMAIL"});continue}
    const existing=await inviteByEmail(email),base={email,note:safeText(note,500)||null,invited_by_user_id:String(user?.id||"")||null,invited_by_email:cleanEmail(user?.email),updated_at:now};
    if(existing){
      const status=existing.status==="accepted"?"accepted":"pending",patch={...base,status,revoked_at:null,invited_at:existing.invited_at||now};
      await rest(`wb1_beta_invites?id=eq.${encodeURIComponent(existing.id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
      results.push({email,ok:true,status,restored:existing.status==="revoked"});
    }else{
      const row={...base,status:"pending",invited_at:now};
      await rest("wb1_beta_invites",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)});
      results.push({email,ok:true,status:"pending",restored:false});
    }
  }
  return results;
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!configured())return res.status(503).json({error:"SUPPORT_NOT_CONFIGURED",message:"Le stockage support WarBoost n'est pas encore configuré."});
  try{
    const user=await requireUser(req),admin=isAdmin(user),beta=await betaAccessForUserAsync(user);
    if(req.method==="GET"){
      const wantAdmin=String(req.query?.admin||"")==="1",wantInvites=String(req.query?.invites||"")==="1";
      if((wantAdmin||wantInvites)&&!admin)return res.status(403).json({error:"SUPPORT_ADMIN_REQUIRED"});
      if(wantAdmin||wantInvites){
        const tickets=wantAdmin?await rest("wb1_support_tickets?select=*&order=updated_at.desc&limit=250"):[],messages=wantAdmin?await messagesFor((tickets||[]).map(x=>x.id)):[];
        let invites=[],invite_error=null;
        if(wantInvites){try{invites=await listInvites()}catch(e){if(e.code==="BETA_INVITES_SCHEMA_MISSING")invite_error=e.code;else throw e}}
        return res.status(200).json({ok:true,admin:true,tickets:enrich(tickets,messages),invites,invite_error,support_admin_configured:adminEmails().length>0,beta_access:beta.access_status});
      }
      const tickets=await rest(`wb1_support_tickets?player_id=eq.${encodeURIComponent(user.id)}&select=*&order=updated_at.desc&limit=100`),messages=await messagesFor((tickets||[]).map(x=>x.id));
      return res.status(200).json({ok:true,admin:false,tickets:enrich(tickets,messages),support_admin_configured:adminEmails().length>0,beta_access:beta.access_status});
    }
    if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
    const action=safeText(req.body?.action,40)||"create";

    if(action==="beta_code_activate"){const result=await activateByBetaCode({code:req.body?.code,user});return res.status(200).json({ok:true,...result})}

    if(action==="invite_add"){
      if(!admin)return res.status(403).json({error:"SUPPORT_ADMIN_REQUIRED"});
      const emails=splitInviteEmails(req.body);if(!emails.length)return res.status(400).json({error:"BETA_INVITE_EMAIL_REQUIRED"});
      const results=await addInvites({emails,note:req.body?.note,user});
      return res.status(200).json({ok:true,results,invites:await listInvites()});
    }
    if(action==="invite_revoke"||action==="invite_restore"){
      if(!admin)return res.status(403).json({error:"SUPPORT_ADMIN_REQUIRED"});
      const id=safeText(req.body?.invite_id,80);if(!id)return res.status(400).json({error:"BETA_INVITE_ID_REQUIRED"});
      const invite=await inviteById(id);if(!invite)return res.status(404).json({error:"BETA_INVITE_NOT_FOUND"});
      const now=new Date().toISOString(),restoreStatus=invite.accepted_user_id?"accepted":"pending",patch=action==="invite_revoke"?{status:"revoked",revoked_at:now,updated_at:now}:{status:restoreStatus,revoked_at:null,updated_at:now};
      await rest(`wb1_beta_invites?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
      return res.status(200).json({ok:true,status:patch.status,invites:await listInvites()});
    }

    if(action==="create"){
      if(!beta.configured)return res.status(503).json({error:"BETA_INVITES_NOT_CONFIGURED"});
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
      const asSupport=Boolean(admin&&req.body?.as_support===true),ticket=asSupport?await anyTicket(id):await ownTicket(id,user.id);if(!ticket)return res.status(404).json({error:"SUPPORT_TICKET_NOT_FOUND"});
      const author_kind=asSupport?"support":"player";
      await rest("wb1_support_messages",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({ticket_id:id,author_kind,author_player_id:user.id,author_email:safeText(user.email,220),body})});
      const nextStatus=author_kind==="support"?"waiting_player":"in_progress";
      await rest(`wb1_support_tickets?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:nextStatus,updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,status:nextStatus,author_kind});
    }
    if(action==="status"){
      if(!admin)return res.status(403).json({error:"SUPPORT_ADMIN_REQUIRED"});const id=safeText(req.body?.ticket_id,80),status=cleanStatus(req.body?.status);if(!id)return res.status(400).json({error:"SUPPORT_TICKET_REQUIRED"});
      const ticket=await anyTicket(id);if(!ticket)return res.status(404).json({error:"SUPPORT_TICKET_NOT_FOUND"});
      await rest(`wb1_support_tickets?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,status});
    }
    if(action==="attachment"){
      const id=safeText(req.body?.ticket_id,80),asSupport=Boolean(admin&&req.body?.as_support===true),ticket=asSupport?await anyTicket(id):await ownTicket(id,user.id);if(!ticket)return res.status(404).json({error:"SUPPORT_TICKET_NOT_FOUND"});
      const url=await signedAttachment(ticket.attachment_path);return res.status(200).json({ok:true,url,name:ticket.attachment_name||"capture"});
    }
    return res.status(400).json({error:"SUPPORT_ACTION_UNKNOWN"});
  }catch(e){return res.status(e.status||500).json({error:e.code||"SUPPORT_ERROR",message:e.message})}
}
