import {knowledgeCopy} from "./knowledge-copy.js";
import {parseGear} from "./gear.js";
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
export function renderKnowledgeGuidance(data,{locale="en",squadLabel=id=>`Squad ${id}`,allowSquad4=true}={}){
  if(!data)return "";
  const copy=knowledgeCopy(locale);
  const date=value=>Number.isFinite(Date.parse(value||""))?
    new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):copy.missing;
  const valueText=field=>{
    if(field.field==="gear"){
      const parsed=parseGear(field.value);
      return parsed.segments.map(piece=>`${piece.count} × ${copy.level} ${
        (piece.levels||[piece.level]).map(level=>level??copy.missing).join("/")}`).join(" · ")||copy.missing;
    }
    if(field.value&&typeof field.value==="object")
      return Object.entries(field.value).map(([key,value])=>`${copy[key]||copy.data}: ${value}`).join(" · ")||copy.missing;
    return field.value;
  };
  const recommendations=(data.recommendations||[]).map((row,index)=>`
    <article class="card">
      <h4>${index+1}. ${esc(copy[row.topic])}${row.target?` · ${esc(row.target)}`:""}</h4>
      <p><strong>${esc(copy.data)}</strong>: ${(row.used_data||[]).map(field=>
        `${esc(copy[field.field]||field.field)} ${esc(valueText(field))} · ${esc(date(field.confirmed_at))}`).join(" / ")}</p>
      <p><strong>${esc(copy.reason)}</strong>: ${esc(row.evidence?.length?copy.official:copy.hypothesis)}</p>
      <p>${esc(copy.condition)} · ${esc(copy.confidence)}: ${esc(copy[row.confidence]||copy.missing)}</p>
      ${(row.evidence||[]).map(evidence=>`<p><a href="${esc(evidence.url)}" target="_blank" rel="noopener noreferrer">${esc(copy.official)}</a> · ${esc(date(evidence.published_at))}<br>${esc(evidence.statement)}</p>`).join("")}
    </article>`).join("");
  const missing=(data.missing||[]).map(value=>{
    const [key,target]=String(value).split(":");
    return `${copy[key]||copy.missing}${target?` · ${target}`:""}`;
  });
  return `<details class="card" open data-knowledge-guidance>
    <summary><strong>${esc(copy.title)} · ${esc(squadLabel(data.squad_id))}</strong></summary>
    <label>${esc(squadLabel(data.squad_id))} <select data-diagnostic-squad aria-label="${esc(squadLabel(data.squad_id))}">
      ${[1,2,3,4].map(id=>`<option value="${id}"${id===data.squad_id?" selected":""}${id===4&&!allowSquad4?" disabled":""}>${esc(squadLabel(id))}</option>`).join("")}
    </select></label>
    <p>${esc(copy.checked)}: ${esc(date(data.knowledge_checked_at))}<br>${esc(copy.scan)}: ${esc(date(data.last_scan_used))}</p>
    <button class="secondaryBtn" type="button" data-knowledge-refresh>${esc(copy.verify)}</button>
    <p role="status" data-knowledge-status></p>
    ${data.official_rules_available?"":`<p class="muted">${esc(copy.noOfficial)}</p>`}
    ${recommendations}
    ${missing.length?`<p>${esc(copy.missing)}: ${esc(missing.join(" · "))}</p>`:""}
    <p class="muted">${esc(copy.position)}. ${esc(copy.resource)}.</p>
    <details><summary>${esc(copy.plan)}</summary><ol>${(data.seven_day_plan||[]).map(step=>
      `<li>${esc(copy[step.phase==="confirm_missing_data"?"review":step.phase==="review_priority_and_in_game_cost"?"prioritize":"recheck"])}${step.priority?.target?` · ${esc(step.priority.target)}`:""}</li>`).join("")}</ol></details>
    <details><summary>${esc(copy.sources)}</summary>${(data.sources||[]).map(source=>{
      let label;try{label=new URL(source.url).hostname}catch{label=source.id}
      return `<p style="overflow-wrap:anywhere"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a> · ${esc(source.status==="verified"?date(source.verified_at):copy.unavailable)}</p>`;
    }).join("")}${(data.discoveries||[]).length?`<p>${esc(copy.missing)}</p>${data.discoveries.map(notice=>
      `<p style="overflow-wrap:anywhere"><a href="${esc(notice.url)}" target="_blank" rel="noopener noreferrer">${esc(notice.title)}</a> · ${esc(date(notice.published_at))}</p>`).join("")}`:""}</details>
  </details>`;
}
