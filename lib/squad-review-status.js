// Read-only projection of existing device state. No reconciliation, persistence,
// request, identity inference, or cloud-currentness claim belongs here.
import {confirmedCompositionForSquad} from "./squad-identity.js";

const present=value=>value!==null&&value!==undefined&&String(value).trim()!=="";
const fields=["name","level","stars","power","exclusive","gear","awakening"];
const escape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const key=code=>"squad_review_"+code;

export function squadReviewStatus(profile={}){
  const squads=Array.isArray(profile?.squads)?profile.squads:[];
  const rows=Array.from({length:4},(_,index)=>{
    const id=index+1,matches=squads.filter(squad=>String(squad?.id)===String(id));
    const squad=matches.length===1?matches[0]:matches.length===0&&squads[index]?.id==null?squads[index]:null;
    const conflict=squad?.composition_conflict||{};
    const heroes=Array.isArray(squad?.heroes)?squad.heroes:[];
    const explicitEmpty=squad?.composition_source==="explicit_swap_empty";
    const hasData=!explicitEmpty&&(present(squad?.power)&&Number(squad.power)!==0||
      heroes.some(hero=>fields.some(field=>present(hero?.[field]))));
    const recorded=conflict.reason==="squad_freshness_ambiguous";
    const names=Boolean(hasData&&!confirmedCompositionForSquad(squad));
    const duplicate=Array.isArray(conflict.heroes)&&conflict.heroes.some(record=>
      Array.isArray(record?.positions)&&record.positions.filter(position=>
        Number.isInteger(position?.squad)&&position.squad>=1&&position.squad<=4&&
        Number.isInteger(position?.slot)&&position.slot>=1&&position.slot<=5).length>1);
    const review=matches.length>1||Boolean((conflict.status==="needs_verification"||squad?.needs_rescan)&&!recorded&&!names&&!duplicate);
    const history=Boolean(Array.isArray(conflict.identity_history)&&conflict.identity_history.length&&(!hasData||names));
    const codes=[];
    if(recorded)codes.push("cloud_marker");
    if(!hasData)codes.push("empty");
    if(names)codes.push("names");
    if(duplicate)codes.push("duplicate");
    if(review)codes.push("review");
    if(history)codes.push("history");
    if(!codes.length)codes.push("clear");
    return {id,codes,hasData,namesUnconfirmed:names,recordedCloudConflict:recorded,
      cloudValidation:"not_revalidated"};
  });
  const recordedIds=rows.filter(row=>row.recordedCloudConflict).map(row=>row.id);
  return {rows,recordedIds,namesToConfirmIds:rows.filter(row=>row.namesUnconfirmed).map(row=>row.id),
    emptyIds:rows.filter(row=>!row.hasData).map(row=>row.id),
    unassignedMarker:profile?.sync?.last_error==="squad_freshness_ambiguous"&&!recordedIds.length,
    cloudValidation:"not_performed"};
}

export function squadReviewHeader(row,t){
  return t(key(row.codes[0]));
}
export function squadReviewRowHtml(row,t){
  return `<div class="squadReviewDiagnostic" data-squad-review-id="${row.id}" role="note"><ul>${
    row.codes.map(code=>`<li>${escape(t(key(code)))}</li>`).join("")
  }</ul><small>${escape(t(key("read_only")))}</small></div>`;
}
export function accountSquadReviewHtml(status,t){
  const summary=status.recordedIds.length?t(key("marker_list"),{squads:status.recordedIds.join(", ")}):
    t(key(status.unassignedMarker?"unassigned":"no_markers"));
  return `<summary><strong>${escape(t(key("title")))}</strong><span class="squadReviewSummary">${escape(summary)}</span></summary>
    <p>${escape(t(key("read_only")))}</p><p>${escape(t(key("scope")))}</p>
    ${status.rows.map(row=>`<section><b>${escape(t("squad"))} ${row.id}</b>${squadReviewRowHtml(row,t)}</section>`).join("")}
    <p>${escape(t("squad_compare_scope"))}</p>`;
}
