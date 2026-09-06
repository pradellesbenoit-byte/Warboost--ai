import {createWarBoostSupabaseAuthClient} from "./lib/browser-auth.js";
const $=s=>document.querySelector(s);let cloud=null,session=null,tickets=[],invites=[];
const STATUS_LABELS={received:"Reçu",in_progress:"En cours",waiting_player:"Attente joueur",resolved:"Résolu"};
const CATEGORY_LABELS={login:"Connexion / compte",scan:"Scan / capture",data:"Données / escouades",ai:"IA / diagnostic",alliance:"Alliance R5/R4",bug:"Bug",suggestion:"Suggestion",other:"Autre"};
const INVITE_LABELS={pending:"En attente",accepted:"Accepté",revoked:"Révoqué"};
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function statusLabel(v){return STATUS_LABELS[String(v||"")]||String(v||"—")}
function categoryLabel(v){return CATEGORY_LABELS[String(v||"")]||String(v||"Autre")}
function inviteLabel(v){return INVITE_LABELS[String(v||"")]||String(v||"—")}
function status(text,warn=false){const el=$("#adminStatus");el.className=`notice${warn?" warn":""}`;el.textContent=text}
function inviteMessage(text,warn=false){const el=$("#inviteStatus");if(!el)return;el.className=`notice${warn?" warn":""}`;el.textContent=text;el.classList.remove("hidden")}
function authHeaders(extra={}){return {...extra,...(session?.access_token?{authorization:`Bearer ${session.access_token}`}:{})}}
function fmt(iso){if(!iso)return "—";try{return new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(iso))}catch{return iso||""}}
function renderTickets(){
  const box=$("#adminTickets");if(!tickets.length){box.innerHTML='<div class="privacyText">Aucun ticket.</div>';return}
  box.innerHTML=tickets.map(t=>{
    const msgs=(t.messages||[]).map(m=>`<div class="supportMessage ${m.author_kind==="support"?"support":""}"><b>${m.author_kind==="support"?"Support":"Joueur"} · ${esc(fmt(m.created_at))}</b>${esc(m.body)}</div>`).join("");
    const attachment=t.attachment_path?`<button class="smallBtn supportAttachmentBtn" data-admin-attachment="${esc(t.id)}">📎 ${esc(t.attachment_name||"Capture")}</button>`:"";
    return `<article class="supportAdminTicket"><div class="supportTicketHead"><div><div class="supportTicketNo">${esc(t.ticket_no)}</div><div class="supportTicketSubject">${esc(t.subject)}</div><div class="supportTicketMeta">${esc(categoryLabel(t.category))} · ${esc(t.nickname||"—")} · ${esc(t.email||"—")} · ${esc(fmt(t.created_at))}</div></div><span class="supportStatus ${esc(t.status)}">${esc(statusLabel(t.status))}</span></div><div class="notice" style="margin-top:8px">${esc(t.description)}</div>${attachment}<div class="supportMessages">${msgs}</div><div class="supportAdminControls"><select data-admin-status="${esc(t.id)}"><option value="received"${t.status==="received"?" selected":""}>Reçu</option><option value="in_progress"${t.status==="in_progress"?" selected":""}>En cours</option><option value="waiting_player"${t.status==="waiting_player"?" selected":""}>Attente joueur</option><option value="resolved"${t.status==="resolved"?" selected":""}>Résolu</option></select><button class="smallBtn" data-admin-save-status="${esc(t.id)}">Enregistrer</button></div><div class="supportReplyRow"><input data-admin-reply-input="${esc(t.id)}" maxlength="5000" placeholder="Réponse au joueur…"/><button class="smallBtn" data-admin-reply="${esc(t.id)}">Répondre</button></div></article>`
  }).join("");
  box.querySelectorAll("[data-admin-save-status]").forEach(b=>b.addEventListener("click",()=>saveTicketStatus(b.dataset.adminSaveStatus)));
  box.querySelectorAll("[data-admin-reply]").forEach(b=>b.addEventListener("click",()=>reply(b.dataset.adminReply)));
  box.querySelectorAll("[data-admin-attachment]").forEach(b=>b.addEventListener("click",()=>attachment(b.dataset.adminAttachment)));
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
    const r=await fetch("/api/support?admin=1&invites=1",{cache:"no-store",headers:authHeaders()}),j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error==="SUPPORT_ADMIN_REQUIRED"?"Ce compte n’est pas autorisé comme administrateur WarBoost. Vérifie WARBOOST_SUPPORT_ADMINS dans Vercel.":(j.message||j.error||"Erreur administration"));
    tickets=Array.isArray(j.tickets)?j.tickets:[];invites=Array.isArray(j.invites)?j.invites:[];
    if(j.invite_error==="BETA_INVITES_SCHEMA_MISSING")inviteMessage("La migration Supabase V2.5.26 doit être appliquée avant d’utiliser les invitations.",true);
    status(`${tickets.length} ticket(s) · ${invites.length} invitation(s).`);renderTickets();renderInvites();
  }catch(e){
    if(String(e.message||"").includes("migration_v2_5_26_beta_invites"))inviteMessage("La migration Supabase V2.5.26 doit être appliquée avant d’utiliser les invitations.",true);
    status(e.message||"Erreur administration",true)
  }
}
async function post(body){const r=await fetch("/api/support",{method:"POST",headers:authHeaders({"content-type":"application/json"}),body:JSON.stringify(body)}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.error||"Erreur administration");return j}
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
async function reply(id){const input=[...document.querySelectorAll("[data-admin-reply-input]")].find(x=>x.dataset.adminReplyInput===String(id)),body=String(input?.value||"").trim();if(body.length<2)return;try{await post({action:"reply",ticket_id:id,body,as_support:true});if(input)input.value="";await load()}catch(e){status(e.message,true)}}
async function attachment(id){try{const j=await post({action:"attachment",ticket_id:id,as_support:true});if(j.url)window.open(j.url,"_blank","noopener,noreferrer")}catch(e){status(e.message,true)}}
async function init(){try{const r=await fetch("/api/cloud-config",{cache:"no-store"}),cfg=await r.json();if(!r.ok||!cfg?.configured)throw new Error("Cloud WarBoost non configuré.");cloud=createWarBoostSupabaseAuthClient({url:cfg.url,key:cfg.key});const got=await cloud.auth.getSession();session=got.data?.session||null;cloud.auth.onAuthStateChange((_e,s)=>{session=s||null;load()});await load()}catch(e){status(e.message||"Impossible d’ouvrir la console administrateur.",true)}}
$("#adminRefresh")?.addEventListener("click",load);$("#inviteAddBtn")?.addEventListener("click",addInvites);$("#copyBetaLinkBtn")?.addEventListener("click",copyBetaLink);init();
