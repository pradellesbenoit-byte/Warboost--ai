const escape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const safeNumber=value=>Number.isSafeInteger(value)&&value>=0?String(value):"";
const interpolate=(text,values)=>String(text).replace(/\{(\w+)\}/g,(_,key)=>escape(values[key]??""));
const RARITIES=["red","orange","gold","purple","blue","green"];
const REASONS=["ready","identity_unverified","local_incomplete","readable_difference","structure_ambiguous"];
const ERRORS=["auth","forbidden","consent","conflict","timeout","server","network","unconfirmed"];
const errorCopy=(reason,t)=>{
  const key=ERRORS.includes(reason)?reason:"unconfirmed";
  return t(`gear_repair_error_${key}`);
};
const reasonCopy=(candidate,t)=>{
  const reason=REASONS.includes(candidate.reason)?candidate.reason:"structure_ambiguous";
  return t(`gear_repair_reason_${reason}`);
};

function piecesMarkup(pieces,kind,t){
  const bySlot=new Map((Array.isArray(pieces)?pieces:[]).filter(piece=>
    piece&&Number.isSafeInteger(piece.slot)&&piece.slot>=0&&piece.slot<4
  ).map(piece=>[piece.slot,piece]));
  return `<ul>${[0,1,2,3].map(slot=>{
    const piece=bySlot.get(slot);
    const pieceName=interpolate(t("gear_repair_piece"),{piece:slot+1});
    if(!piece){
      const missing=kind==="missing";
      return `<li><b>${pieceName}</b> — ${escape(t(missing?"gear_repair_state_absent":"gear_repair_unknown"))}</li>`;
    }
    const level=piece.level===null||piece.level===undefined?t("gear_repair_unknown"):String(piece.level);
    const rarity=RARITIES.includes(piece.rarity)?t(`gear_repair_rarity_${piece.rarity}`):t("gear_repair_rarity_unknown");
    const state=kind==="unreadable"?"unreadable":kind==="missing"?"absent":"readable";
    return `<li><b>${pieceName}</b> — ${escape(t("gear_repair_level"))}: ${escape(level)} · ${escape(t("gear_repair_rarity"))}: ${escape(rarity)} · ${escape(t(`gear_repair_state_${state}`))}</li>`;
  }).join("")}</ul>`;
}

function candidateMarkup(candidate,stage,t){
  const squad=safeNumber(candidate.squad),hero=safeNumber(candidate.slot);
  if(!squad||!hero||candidate.id!==`${squad}:${hero}`)return "";
  const eligible=candidate.eligible===true;
  const selected=eligible&&candidate.selected===true;
  const proof=candidate.verified===true?"proof_verified":"proof_unverified";
  const controls=stage==="selection"&&eligible?`
    <p><label><input type="checkbox" data-gear-repair-select="${escape(candidate.id)}"${selected?" checked":""}> ${escape(t("gear_repair_select"))}</label></p>
    <p><label><input type="checkbox" data-gear-repair-verify="${escape(candidate.id)}"${candidate.verified===true?" checked":""}${selected?"":" disabled"}> ${escape(t("gear_repair_proof_label"))}</label></p>`:"";
  const localKind=["value","missing","unreadable"].includes(candidate.localKind)?candidate.localKind:"unreadable";
  const localStatus=localKind==="value"?"state_readable":localKind==="missing"?"state_absent":"state_unreadable";
  return `<li><h3>${escape(t("gear_repair_squad"))} ${squad} · ${escape(t("gear_repair_hero"))} ${hero}</h3>
    <p>${escape(eligible?t("gear_repair_eligible"):t("gear_repair_ineligible"))} — ${escape(reasonCopy(candidate,t))}</p>
    <details${stage==="preview"?" open":""}><summary>${escape(t("gear_repair_cloud"))}</summary>${piecesMarkup(candidate.cloudPieces,"value",t)}</details>
    <details${stage==="preview"?" open":""}><summary>${escape(t("gear_repair_local"))} — ${escape(t(`gear_repair_${localStatus}`))}</summary>${piecesMarkup(candidate.localPieces,localKind==="value"?"value":localKind,t)}</details>
    <p>${escape(t("gear_repair_saved_proof"))}: ${escape(t(candidate.localConfirmed===true?"gear_repair_saved_proof_yes":"gear_repair_saved_proof_no"))}</p>
    <p>${escape(t("gear_repair_proof_label"))}: ${escape(t(`gear_repair_${proof}`))}</p>${controls}</li>`;
}

export function gearRepairPreviewHtml(view,t){
  if(!view||view.kind==="idle")return "";
  if(view.kind==="busy")return `<p class="notice">${escape(t("gear_repair_busy"))}</p>
    <button type="button" class="btn" data-gear-repair-close>${escape(t("gear_repair_close"))}</button>`;
  if(view.kind==="stale")return `<p class="notice">${escape(t("gear_repair_stale"))}</p>`;
  if(view.kind==="error")return `<p class="notice">${escape(errorCopy(view.reason,t))}</p>`;
  if(view.kind!=="result")return "";
  const stage=view.stage==="preview"?"preview":"selection";
  const all=Array.isArray(view.candidates)?view.candidates:[];
  const candidates=stage==="preview"?all.filter(candidate=>candidate?.selected===true):all;
  const items=candidates.map(candidate=>candidateMarkup(candidate,stage,t)).filter(Boolean).join("");
  const selected=all.filter(candidate=>candidate?.eligible===true&&candidate.selected===true);
  const hasEligible=all.some(candidate=>candidate?.eligible===true);
  const canReview=selected.length>0&&selected.every(candidate=>candidate.verified===true);
  const title=stage==="preview"?"stage_preview":"stage_selection";
  return `<section class="notice gearRepairPreview"><h2>${escape(t("gear_repair_title"))}</h2>
    <p>${escape(t(`gear_repair_${title}`))}${view.at?` · ${interpolate(t("gear_repair_completed"),{date:view.at})}`:""}</p>
    <details><summary>${escape(t("gear_repair_readiness_title"))}</summary>
      <p>${escape(t("gear_repair_readiness_local"))}</p>
      <p>${escape(t("gear_repair_readiness_migration"))}</p>
      <p>${escape(t("gear_repair_readiness_guards"))}</p>
    </details>
    <p class="notice">${escape(t("gear_repair_proof_warning"))}</p>
    ${!hasEligible||!items?`<p class="notice">${escape(t("gear_repair_no_saved"))}</p>`:""}
    ${items?`<ul>${items}</ul>`:""}
    ${stage==="selection"?`<button type="button" class="btn" data-gear-repair-review${canReview?"":" disabled"}>${escape(t("gear_repair_review"))}</button>`:`
      <button type="button" class="btn" data-gear-repair-back>${escape(t("gear_repair_back"))}</button>
      <p class="notice">${escape(t("gear_repair_save_blocker"))} ${escape(t("gear_repair_no_saved"))}</p>
      <button type="button" class="btn" disabled>${escape(t("gear_repair_save"))}</button>`}
    ${stage==="selection"?`<p class="notice">${escape(t("gear_repair_save_blocker"))} ${escape(t("gear_repair_no_saved"))}</p>`:""}
    <button type="button" class="btn" data-gear-repair-close>${escape(t("gear_repair_close"))}</button>
  </section>`;
}
