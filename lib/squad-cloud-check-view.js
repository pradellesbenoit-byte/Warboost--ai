const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const fill=(value,vars={})=>String(value||"").replace(/\{([a-z0-9_]+)\}/gi,(_,key)=>String(vars[key]??""));
const fmtPower=value=>value===0?"0 M":Number.isFinite(Number(value))?
  `${new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(Number(value))} M`:"—";
const fmtDate=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():"";

function fieldValue(field,value,t){
  if(field.key==="profile")return t(value?"squad_cloud_profile_present":"squad_cloud_profile_missing");
  if(value==null)return t("squad_cloud_value_missing");
  if(field.key==="hero")return String(value);
  if(field.key==="power")return fmtPower(value);
  if(field.key==="confirmation"){
    if(!value)return t("squad_cloud_value_missing");
    return `${value.source} · ${value.names.join(", ")} · ${fmtDate(value.at)}`;
  }
  if(field.key==="weapon"){
    if(!value)return t("squad_cloud_value_missing");
    const parts=[value.hero,value.name,value.level==null?null:`Lv. ${value.level}`].filter(Boolean);
    return parts.join(" · ")||t("squad_cloud_value_missing");
  }
  if(field.key==="marker"){
    if(!value.active)return t("squad_cloud_marker_none");
    return t(value.reason==="squad_freshness_ambiguous"?
      "squad_cloud_marker_ambiguous":"squad_cloud_marker_other");
  }
  return String(value);
}

function fieldLabel(field,t){
  if(field.key==="hero"||field.key==="weapon")return fill(t(
    field.key==="hero"?"squad_cloud_field_hero":"squad_cloud_field_weapon",{slot:field.slot}
  ));
  const labels={
    profile:"squad_cloud_field_profile",power:"squad_cloud_field_power",
    confirmation:"squad_cloud_field_confirmation",marker:"squad_cloud_field_marker"
  };
  return t(labels[field.key]||"squad_cloud_field_marker");
}

export function squadCloudCheckHtml(view,t){
  if(!view||view.kind==="idle")return "";
  if(view.kind==="busy")return `<p class="squadCloudCheckNotice" role="status">${esc(t("squad_cloud_busy"))}</p>`;
  if(view.kind==="stale")return `<p class="squadCloudCheckNotice" role="status">${esc(t("squad_cloud_stale"))}</p>`;
  if(view.kind==="error")return `<p class="squadCloudCheckNotice" role="status">${esc(t(`squad_cloud_error_${view.reason||"server"}`))}</p>`;
  if(view.kind!=="result")return "";
  const comparison=view.comparison;
  const optionalSlots=(comparison.optionalMissingWeaponSlots||[]).join(", ");
  const summaryKey=comparison.summary==="identical"?"squad_cloud_summary_identical":
    comparison.summary==="missing"?"squad_cloud_summary_missing":
      comparison.summary==="optional_missing"?
        comparison.optionalMissingWeaponCount===1?"squad_cloud_summary_optional_one":"squad_cloud_summary_optional_many":
        "squad_cloud_summary_review";
  const summaryText=comparison.summary==="optional_missing"?
    fill(t(summaryKey,{count:comparison.optionalMissingWeaponCount,slots:optionalSlots}),
      {count:comparison.optionalMissingWeaponCount,slots:optionalSlots}):t(summaryKey);
  const rows=comparison.fields.map(field=>{
    const status=t(`squad_cloud_${field.state}`);
    return `<li class="squadCloudCheckField" data-state="${esc(field.state)}">
      <div><strong>${esc(fieldLabel(field,t))}</strong>
        <small>${esc(t("squad_cloud_local"))}: ${esc(fieldValue(field,field.local,t))} · ${esc(t("squad_cloud_cloud"))}: ${esc(fieldValue(field,field.cloud,t))}</small>
      </div><span class="squadCloudCheckState">${esc(status)}</span>
    </li>`;
  }).join("");
  const revision=comparison.cloudRevision?
    `<p>${esc(fill(t("squad_cloud_revision"),{date:fmtDate(comparison.cloudRevision)}))}</p>`:
    `<p>${esc(t("squad_cloud_revision_missing"))}</p>`;
  const squadRevision=comparison.cloudSquadUpdatedAt?
    `<p>${esc(fill(t("squad_cloud_squad_revision"),{date:fmtDate(comparison.cloudSquadUpdatedAt)}))}</p>`:
    `<p>${esc(t("squad_cloud_squad_revision_missing"))}</p>`;
  return `<section class="squadCloudCheckResult" aria-label="${esc(t("squad_cloud_button"))}">
    <p class="squadCloudCheckNotice" role="status">${esc(summaryText)}</p>
    <div class="squadCloudCheckMeta"><p>${esc(fill(t("squad_cloud_read_at"),{date:fmtDate(view.checkedAt)}))}</p>${revision}${squadRevision}</div>
    <ul>${rows}</ul>
  </section>`;
}
