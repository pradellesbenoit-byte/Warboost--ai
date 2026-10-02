import {createWarBoostSupabaseAuthClient} from "./lib/browser-auth.js";
import {countNewSupportTickets,filterAndSortSupportTickets,renderSupportAdminTicket,renderSupportAdminThread} from "./lib/support-admin-view.js";
const $=s=>document.querySelector(s);let cloud=null,session=null,tickets=[],invites=[];const threadCache=new Map(),openTicketIds=new Set();
async function boundedFetch(input,init={},ms=20000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);try{return await fetch(input,{...init,signal:c.signal})}finally{clearTimeout(timer)}}
const INVITE_LABELS={pending:"En attente",accepted:"Accepté",revoked:"Révoqué"};
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function inviteLabel(v){return INVITE_LABELS[String(v||"")]||String(v||"—")}
function status(text,warn=false){const el=$("#adminStatus");el.className=`notice${warn?" warn":""}`;el.textContent=text}
function inviteMessage(text,warn=false){const el=$("#inviteStatus");if(!el)return;el.className=`notice${warn?" warn":""}`;el.textContent=text;el.classList.remove("hidden")}
function authHeaders(extra={}){return {...extra,...(session?.access_token?{authorization:`Bearer ${session.access_token}`}:{})}}
function fmt(iso){if(!iso)return "—";try{return new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(iso))}catch{return iso||""}}
function renderTickets(){
  const box=$("#adminTickets");if(!box)return;
  const statusFilter=$("#adminTicketStatusFilter")?.value||"all",dateOrder=$("#adminTicketDateSort")?.value||"recent";
  const newCount=countNewSupportTickets(tickets),visible=filterAndSortSupportTickets(tickets,statusFilter,dateOrder),summary=$("#supportTicketSummary");
  if(summary)summary.textContent=`${newCount} nouveau(x) non traité(s) · ${tickets.length} ticket(s) au total`;
  if(!visible.length){box.innerHTML=`<div class="privacyText">${tickets.length?"Aucun ticket pour ce filtre.":"Aucun ticket reçu."}</div>`;return}
  box.innerHTML=visible.map(ticket=>renderSupportAdminTicket({...ticket,messages:threadCache.get(String(ticket.id))},{open:openTicketIds.has(String(ticket.id))})).join("");
  box.querySelectorAll("[data-admin-ticket]").forEach(details=>{
    details.addEventListener("toggle",()=>{const id=String(details.dataset.adminTicket||"");if(!id)return;if(details.open){openTicketIds.add(id);if(!threadCache.has(id))loadTicketThread(id)}else openTicketIds.delete(id)});
    if(details.open&&!threadCache.has(String(details.dataset.adminTicket||"")))loadTicketThread(details.dataset.adminTicket);
  });
  box.querySelectorAll("[data-admin-save-status]").forEach(b=>b.addEventListener("click",()=>saveTicketStatus(b.dataset.adminSaveStatus)));
  box.querySelectorAll("[data-admin-reply]").forEach(b=>b.addEventListener("click",()=>reply(b.dataset.adminReply)));
  box.querySelectorAll("[data-admin-attachment]").forEach(b=>b.addEventListener("click",()=>attachment(b.dataset.adminAttachment)));
}
async function loadTicketThread(id){
  const ticketId=String(id||"");if(!ticketId)return;
  const thread=[...document.querySelectorAll("[data-admin-thread]")].find(el=>el.dataset.adminThread===ticketId);
  if(thread)thread.textContent="Chargement du fil complet…";
  try{
    const r=await boundedFetch(`/api/support?admin=1&ticket_id=${encodeURIComponent(ticketId)}`,{cache:"no-store",headers:authHeaders()},20000),j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ticket)throw new Error(j.message||j.error||"Impossible de charger le fil.");
    const messages=Array.isArray(j.ticket.messages)?j.ticket.messages:[];
    threadCache.set(ticketId,messages);
    const target=[...document.querySelectorAll("[data-admin-thread]")].find(el=>el.dataset.adminThread===ticketId);
    if(target)target.innerHTML=renderSupportAdminThread(messages);
  }catch(error){const target=[...document.querySelectorAll("[data-admin-thread]")].find(el=>el.dataset.adminThread===ticketId);if(target)target.textContent=error.message||"Impossible de charger le fil."}
}
function renderInvites(){
  const box=$("#inviteList");if(!box)return;
  if(!invites.length){box.innerHTML='<div class="privacyText">Aucune invitation enregistrée pour le moment.</div>';return}
  box.innerHTML=invites.map(i=>{
    const accepted=i.accepted_at?` · accepté ${esc(fmt(i.accepted_at))}`:"";
    const note=i.note?`<div class="adminInviteNote">${esc(i.note)}</div>`:"";
    const action=i.status==="revoked"?`<button class="smallBtn" data-invite-restore="${esc(i.id)}">Réactiver</button>`:`<button class="smallBtn dangerLite" data-invite-revoke="${esc(i.id)}">Révoquer</button>`;
    return `<article class="adminInviteRow"><div class="adminInviteMain"><div class="adminInviteEmail">${esc(i.email)}</div><div class="adminInviteMeta">Invité ${esc(fmt(i.invited_at))}${accepted}</div>${note}</div><span class="adminInviteBadge ${esc(i.status)}">${esc(inviteLabel(i.status))}</span>${action}</article>`
  }).join("");
  box.querySelectorAll("[data-invite-revoke]").forEach(b=>b.addEventListener("click",()=>changeInvite("invite_revoke",b.dataset.inviteRevoke)));
  box.querySelectorAll("[data-invite-restore]").forEach(b=>b.addEventListener("click",()=>changeInvite("invite_restore",b.dataset.inviteRestore)));
}
async function load(){
  if(!session?.access_token)return status("Connecte-toi d’abord à WarBoost sur ce même domaine, puis recharge cette page.",true);
  status("Chargement des tickets et invitations…");
  try{
    const r=await boundedFetch("/api/support?admin=1&invites=1",{cache:"no-store",headers:authHeaders()},20000),j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error==="SUPPORT_ADMIN_REQUIRED"?"Ce compte n’est pas autorisé comme administrateur WarBoost. Vérifie WARBOOST_SUPPORT_ADMINS dans Vercel.":(j.message||j.error||"Erreur administration"));
    tickets=Array.isArray(j.tickets)?j.tickets:[];invites=Array.isArray(j.invites)?j.invites:[];
    if(j.invite_error==="BETA_INVITES_SCHEMA_MISSING")inviteMessage("La migration Supabase V2.5.26 doit être appliquée avant d’utiliser les invitations.",true);
    status(`${tickets.length} ticket(s) · ${invites.length} invitation(s).`);renderTickets();renderInvites();
  }catch(e){
    if(String(e.message||"").includes("migration_v2_5_26_beta_invites"))inviteMessage("La migration Supabase V2.5.26 doit être appliquée avant d’utiliser les invitations.",true);
    status(e.message||"Erreur administration",true)
  }
}
async function post(body){const r=await boundedFetch("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify(body)},25000),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||"Erreur administration");return j}
async function addInvites(){
  const raw=String($("#inviteEmails")?.value||"").trim(),note=String($("#inviteNote")?.value||"").trim();if(!raw)return inviteMessage("Ajoute au moins une adresse e-mail.",true);
  const btn=$("#inviteAddBtn");if(btn)btn.disabled=true;
  try{
    const j=await post({action:"invite_add",emails:raw.split(/[;,\n\s]+/).filter(Boolean),note});invites=Array.isArray(j.invites)?j.invites:invites;renderInvites();
    const ok=(j.results||[]).filter(x=>x.ok).length,bad=(j.results||[]).length-ok;inviteMessage(`${ok} invitation(s) enregistrée(s)${bad?` · ${bad} adresse(s) invalide(s)`:""}. Aucun redéploiement n’est nécessaire.`,bad>0);
    if(ok&&$("#inviteEmails"))$("#inviteEmails").value="";
  }catch(e){inviteMessage(e.message||"Impossible d’enregistrer l’invitation.",true)}finally{if(btn)btn.disabled=false}
}
async function changeInvite(action,id){try{const j=await post({action,invite_id:id});invites=Array.isArray(j.invites)?j.invites:invites;renderInvites();inviteMessage(action==="invite_revoke"?"Accès révoqué.":"Accès réactivé.")}catch(e){inviteMessage(e.message||"Impossible de modifier l’invitation.",true)}}
async function copyBetaLink(){const url=location.origin.replace(/\/support-admin\.html(?:\?.*)?$/i,"/");try{await navigator.clipboard.writeText(url);inviteMessage("Lien de la bêta copié.")}catch{inviteMessage("Copie impossible sur ce navigateur.",true)}}
async function saveTicketStatus(id){const sel=[...document.querySelectorAll("[data-admin-status]")].find(x=>x.dataset.adminStatus===String(id));try{await post({action:"status",ticket_id:id,status:sel?.value||"received"});await load()}catch(e){status(e.message,true)}}
async function reply(id){const input=[...document.querySelectorAll("[data-admin-reply-input]")].find(x=>x.dataset.adminReplyInput===String(id)),body=String(input?.value||"").trim();if(body.length<2)return;try{await post({action:"reply",ticket_id:id,body,as_support:true});if(input)input.value="";threadCache.delete(String(id));await load()}catch(e){status(e.message,true)}}
async function attachment(id){try{const j=await post({action:"attachment",ticket_id:id,as_support:true});if(j.url)window.open(j.url,"_blank","noopener,noreferrer")}catch(e){status(e.message,true)}}
async function init(){try{const r=await boundedFetch("/api/cloud-config",{cache:"no-store"},8000),cfg=await r.json();if(!r.ok||!cfg?.configured)throw new Error("Cloud WarBoost non configuré.");cloud=createWarBoostSupabaseAuthClient({url:cfg.url,key:cfg.key,requestTimeoutMs:12000});const got=await cloud.auth.getSession();session=got.data?.session||null;cloud.auth.onAuthStateChange((_e,s)=>{session=s||null;load()});await load()}catch(e){status(e.message||"Impossible d’ouvrir la console administrateur.",true)}}
$("#adminRefresh")?.addEventListener("click",load);$("#adminTicketStatusFilter")?.addEventListener("change",renderTickets);$("#adminTicketDateSort")?.addEventListener("change",renderTickets);$("#inviteAddBtn")?.addEventListener("click",addInvites);$("#copyBetaLinkBtn")?.addEventListener("click",copyBetaLink);init();
