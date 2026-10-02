const MISSING="non disponible";
const STATUS_LABELS={received:"Nouveau",in_progress:"En cours",waiting_player:"Attente joueur",resolved:"Résolu"};
const CATEGORY_LABELS={login:"Connexion / compte",scan:"Scan / capture",data:"Données / escouades",ai:"IA / diagnostic",alliance:"Alliance R5/R4",bug:"Bug",suggestion:"Suggestion",other:"Autre"};
const STATUS_CLASSES=new Set(Object.keys(STATUS_LABELS));

function text(value){return String(value??"").trim()}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function display(value){return text(value)||MISSING}
function dateLabel(value){
  if(!value)return MISSING;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return MISSING;
  return new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(date);
}
function statusLabel(value){return STATUS_LABELS[text(value)]||MISSING}
function categoryLabel(value){return CATEGORY_LABELS[text(value)]||MISSING}

export function supportTicketPreview(description,maxLength=200){
  const compact=text(description).replace(/\s+/g," ");
  if(compact.length<=maxLength)return compact||MISSING;
  return `${compact.slice(0,Math.max(0,maxLength-1)).trimEnd()}…`;
}

export function countNewSupportTickets(tickets=[]){
  return (Array.isArray(tickets)?tickets:[]).filter(ticket=>ticket?.status==="received").length;
}

export function filterAndSortSupportTickets(tickets=[],statusFilter="all",dateOrder="recent"){
  const rows=(Array.isArray(tickets)?tickets:[]).filter(ticket=>{
    if(statusFilter==="new")return ticket?.status==="received";
    if(statusFilter==="in_progress")return ticket?.status==="in_progress"||ticket?.status==="waiting_player";
    if(statusFilter==="resolved")return ticket?.status==="resolved";
    return true;
  });
  const direction=dateOrder==="oldest"?1:-1;
  return rows.sort((a,b)=>{
    const aTime=Date.parse(a?.created_at||"")||0,bTime=Date.parse(b?.created_at||"")||0;
    return direction*(aTime-bTime)||text(a?.ticket_no).localeCompare(text(b?.ticket_no));
  });
}

function fact(label,value){
  return `<div class="supportAdminFact"><dt>${esc(label)}</dt><dd>${esc(display(value))}</dd></div>`;
}

export function renderSupportAdminThread(messages=[]){
  if(!Array.isArray(messages)||!messages.length)return '<div class="privacyText">Aucun message dans le fil.</div>';
  return messages.map(message=>{
    const kind=message?.author_kind==="support"?"support":"player";
    const author=kind==="support"?"Support":"Joueur";
    return `<article class="supportMessage ${kind==="support"?"support":""}"><b>${author} · ${esc(dateLabel(message?.created_at))}</b><div class="supportAdminMessageBody">${esc(message?.body||"")}</div></article>`;
  }).join("");
}

function renderDiagnostics(diagnostics){
  const data=diagnostics&&typeof diagnostics==="object"&&!Array.isArray(diagnostics)?diagnostics:{};
  const keys=Object.keys(data);
  if(!keys.length)return '<div class="privacyText">Aucun diagnostic technique transmis.</div>';
  const rows=[
    ["Version",data.app_version||data.release],
    ["Langue",data.locale],
    ["Écran signalé",data.screen],
    ["Plateforme",data.platform],
    ["Connexion réseau",typeof data.online==="boolean"?(data.online?"En ligne":"Hors ligne"):null],
    ["État du chargement",data.status],
    ["Identifiant de session technique",data.run_id],
    ["Début du chargement",data.started_at],
    ["Fin du chargement",data.finished_at]
  ];
  const stages=Array.isArray(data.stages)?data.stages:[];
  const stageRows=stages.map(stage=>`<li>${esc(display(stage?.stage))} · ${esc(display(stage?.status))}${Number.isFinite(Number(stage?.ms))?` · ${esc(stage.ms)} ms`:""}${stage?.error?` · ${esc(stage.error)}`:""}</li>`).join("");
  return `<dl class="supportAdminFactGrid">${rows.map(([label,value])=>fact(label,value)).join("")}</dl>${stageRows?`<ul class="supportAdminDiagStages">${stageRows}</ul>`:""}`;
}

export function renderSupportAdminTicket(ticket={}, {open=false}={}){
  const id=esc(ticket?.id||"");
  const category=categoryLabel(ticket?.category);
  const status=text(ticket?.status);
  const safeStatusClass=STATUS_CLASSES.has(status)?status:"received";
  const nickname=display(ticket?.nickname),email=display(ticket?.email);
  const alliance=[text(ticket?.alliance_name),text(ticket?.alliance_tag)?`#${text(ticket.alliance_tag)}`:""].filter(Boolean).join(" ")||MISSING;
  const screen=ticket?.screen||ticket?.diagnostics?.screen;
  const diagnostics=ticket?.diagnostics&&typeof ticket.diagnostics==="object"?ticket.diagnostics:{};
  const thread=Array.isArray(ticket?.messages)?renderSupportAdminThread(ticket.messages):'<div class="privacyText">Le fil complet sera chargé à l’ouverture du ticket.</div>';
  const attachment=ticket?.attachment_path
    ?`<button class="smallBtn supportAttachmentBtn" type="button" data-admin-attachment="${id}">Voir la capture${ticket?.attachment_name?` · ${esc(ticket.attachment_name)}`:""}</button>`
    :'<span class="privacyText">Aucune capture jointe.</span>';
  return `<details class="supportAdminTicket" data-admin-ticket="${id}"${open?" open":""}>
    <summary class="supportAdminSummary">
      <div class="supportAdminSummaryHead"><span class="supportTicketNo">${esc(ticket?.ticket_no||MISSING)}</span><span class="supportStatus ${esc(safeStatusClass)}">${esc(statusLabel(status))}</span></div>
      <div class="supportTicketSubject">${esc(display(ticket?.subject))}</div>
      <div class="supportAdminPreview">${esc(supportTicketPreview(ticket?.description))}</div>
      <div class="supportTicketMeta">${esc(category)} · ${esc(nickname)} · ${esc(email)} · ${esc(dateLabel(ticket?.created_at))}</div>
    </summary>
    <div class="supportAdminDetails">
      <dl class="supportAdminFactGrid">
        ${fact("Pseudo WarBoost / Last War",ticket?.nickname)}
        ${fact("E-mail du compte",ticket?.email)}
        ${fact("Serveur",ticket?.server_id)}
        ${fact("Alliance",alliance)}
        ${fact("Catégorie",category)}
        ${fact("Sujet",ticket?.subject)}
        ${fact("Date et heure",dateLabel(ticket?.created_at))}
        ${fact("Version WarBoost",ticket?.app_version||diagnostics.app_version||diagnostics.release)}
        ${fact("Langue",ticket?.locale||diagnostics.locale)}
        ${fact("Écran / section concernée",screen)}
        <div class="supportAdminFact supportAdminFactFull"><dt>Description complète</dt><dd class="supportAdminDescription">${esc(display(ticket?.description))}</dd></div>
        ${fact("Statut du ticket",statusLabel(status))}
        <div class="supportAdminFact supportAdminFactFull"><dt>Capture d’écran</dt><dd>${attachment}</dd></div>
      </dl>
      <details class="supportAdminDiagnostics"><summary>Diagnostics techniques facultatifs</summary><div class="supportAdminDiagnosticsBody">${renderDiagnostics(diagnostics)}</div></details>
      <section class="supportAdminConversation"><h3>Fil de discussion</h3><div class="supportMessages" data-admin-thread="${id}" aria-live="polite">${thread}</div></section>
      <div class="supportAdminControls"><label class="adminFieldLabel" for="status-${id}">Statut du ticket</label><select id="status-${id}" data-admin-status="${id}"><option value="received"${status==="received"?" selected":""}>Nouveau</option><option value="in_progress"${status==="in_progress"?" selected":""}>En cours</option><option value="waiting_player"${status==="waiting_player"?" selected":""}>Attente joueur</option><option value="resolved"${status==="resolved"?" selected":""}>Résolu</option></select><button class="smallBtn" type="button" data-admin-save-status="${id}">Enregistrer</button></div>
      <div class="supportReplyRow"><input data-admin-reply-input="${id}" maxlength="5000" placeholder="Réponse au joueur…"/><button class="smallBtn" type="button" data-admin-reply="${id}">Répondre</button></div>
    </div>
  </details>`;
}