import {COMPARISON_REASONS} from "./squad-comparison-project.js";
const escape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const reasonKeys={
  value_absent:"missing",value_unreadable:"unreadable",name_unknown:"identity_missing",
  gear_format_unsupported:"format",gear_layout_mismatch:"format",legacy_shape_unsupported:"format",
  squad_data_absent:"structure",invalid_squad_id:"number",duplicate_squad_id:"number",
  heroes_structure_unsupported:"structure",too_many_heroes:"structure",duplicate_hero:"duplicate",
  confirmation_missing:"confirmation",confirmation_identity_mismatch:"identity_conflict",
  explicit_empty_inconsistent:"identity_conflict",identity_missing:"identity_missing",
  hero_identity_mismatch:"identity_conflict",confirmation_invalid:"format",
  cloud_data_unavailable:"cloud",schema_unsupported:"schema",legacy_squad_number:"legacy",
  field_confirmation_missing:"evidence"
  ,gear_number_ambiguous:"format",gear_json_invalid:"format",gear_text_invalid:"format",gear_text_partial:"format"
};
const fieldLabel=(field,t)=>t("squad_compare_cat_"+field.category)+
  (field.slot?` · ${t("squad_compare_slot",{slot:field.slot})}`:field.category==="power"?` · ${t("squad_compare_total")}`:"");
function rowDetails(row,t){
  const counts=row.counts||{};
  if(row.kind==="empty")return row.marker?`<small>${escape(t("squad_compare_marker_kept"))}</small>`:"";
  const summaries=[
    row.fields?.length?t("squad_compare_summary",counts):"",
    counts.confirmedSame?t("squad_compare_confirmed",{count:counts.confirmedSame}):"",
    counts.unconfirmed?t("squad_compare_recorded",{count:counts.unconfirmed}):"",
    counts.absent?t("squad_compare_absent",{count:counts.absent}):"",
    row.marker?t("squad_compare_marker_kept"):""
  ].filter(Boolean).map(text=>`<small>${escape(text)}</small>`).join("");
  const issues=(row.issues||[]).map(issue=>{
    const reason=COMPARISON_REASONS.has(issue.reason)?issue.reason:"legacy_shape_unsupported";
    return `<li>${escape(fieldLabel(issue,t))} — ${escape(t("squad_compare_reason_"+reasonKeys[reason]))}
      (${escape(t("squad_compare_side_"+issue.side))}) <code>${reason}</code></li>`;
  }).join("");
  const fields=(row.fields||[]).filter(field=>["same","different"].includes(field.state)).map(field=>
    `<li>${escape(fieldLabel(field,t))} — ${escape(t("squad_compare_field_"+field.state))}
    · ${escape(t(field.confirmed?"squad_compare_proof":"squad_compare_reason_evidence"))}</li>`).join("");
  const gear=(row.fields||[]).filter(field=>field.category==="gear").map(field=>{
    const formats=Object.entries(field.formats||{}).filter(([,meta])=>meta).map(([side,meta])=>
      `${escape(t("squad_compare_side_"+side))} : <code>${escape(meta.inputType)} / ${escape(meta.format)}</code>`).join(" · ");
    const pieces=(field.pieces||[]).map(piece=>`<li>${escape(t("squad_compare_gear_piece",{piece:piece.piece}))}
      · <code>${escape(piece.attribute)}</code> — ${escape(t("squad_compare_field_"+piece.state))}</li>`).join("");
    return formats?`<li>${escape(fieldLabel(field,t))} — ${escape(t("squad_compare_gear_format"))} : ${formats}
      ${Object.values(field.formats||{}).some(meta=>meta?.format==="text_partial")?
        `<small>${escape(t("squad_compare_gear_partial"))}</small>`:""}${pieces?`<ul>${pieces}</ul>`:""}</li>`:"";
  }).join("");
  return summaries+(issues||fields||gear?`<details class="squadCompareDetails"><summary>${escape(t("squad_compare_details"))}</summary>
    <ul>${issues}${fields}${gear}</ul></details>`:"");
}
export function squadComparisonHtml(view,t,format=value=>value){
  if(["idle","busy"].includes(view.kind))return "";
  if(view.kind==="stale")return escape(t("squad_compare_stale"));
  if(view.kind==="error"){
    const key={auth:"auth",consent:"forbidden",forbidden:"forbidden",timeout:"timeout",
      network:"network",conflict:"conflict",server:"server",unconfirmed:"unconfirmed"}[view.reason]||"unconfirmed";
    return escape(t("squad_compare_error",{reason:t("account_sync_"+key)}));
  }
  if(view.kind!=="result")return "";
  return `<p>${escape(t("squad_compare_done",{date:format(view.at)}))}</p><ul>${
    view.rows.map(row=>`<li><b>${escape(t("squad"))} ${row.id}</b> — ${
      escape(t("squad_compare_"+row.kind,{categories:row.categories.map(category=>t("squad_compare_cat_"+category)).join(", ")}))
    }${rowDetails(row,t)}</li>`).join("")
  }</ul><small>${escape(t("squad_compare_scope"))}</small>`;
}
