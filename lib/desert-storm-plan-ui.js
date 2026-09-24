function hasRenderableGroups(plan) {
  if (!plan || !Array.isArray(plan.starters) || !plan.starters.length || !Array.isArray(plan.groups) || !plan.groups.length) return false;
  if (!plan.groups.every(group => Array.isArray(group?.members) && group.members.length)) return false;
  return plan.groups.reduce((count, group) => count + group.members.length, 0) === plan.starters.length;
}

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.classList.toggle("hidden", hidden);
}

export function renderDesertStormPlanInto(box, copyButton, plan, {
  translate = key => key,
  escapeHtml = value => String(value ?? ""),
  missionLabel = value => String(value ?? ""),
  warningText = () => "",
  copyText = () => "",
  rulesetDate = "",
  scrollIntoView = false
} = {}) {
  if (!box) return { ok: false, error: "desert_storm_plan_container_missing" };
  if (!hasRenderableGroups(plan)) {
    box.innerHTML = "";
    setHidden(box, true);
    setHidden(copyButton, true);
    return { ok: false, error: "desert_storm_plan_invalid" };
  }

  const warnings = (Array.isArray(plan.warnings) ? plan.warnings : []).map(warningText).filter(Boolean);
  const substitutes = (Array.isArray(plan.substitutes) ? plan.substitutes : []).map(row => row?.name).filter(Boolean);
  const groupsHtml = plan.groups.map((group, groupIndex) => {
    const missionContext = { groupIndex };
    const names = group.members.map(member => member?.name).filter(Boolean).join(" · ");
    return `<div class="dsPlanGroup"><div class="dsGroupHead"><b>G${escapeHtml(group.id ?? groupIndex + 1)} · ${escapeHtml(group.captain || translate("ds_captain"))}</b><span>${escapeHtml(group.members.length)}</span></div><small class="dsGroupNames">${escapeHtml(names || "—")}</small><div class="dsMission"><span><b>${escapeHtml(translate("ds_opening"))}</b>${escapeHtml(missionLabel(group.mission?.opening, missionContext))}</span><span><b>${escapeHtml(translate("ds_center"))}</b>${escapeHtml(missionLabel(group.mission?.center, missionContext))}</span><span><b>${escapeHtml(translate("ds_late"))}</b>${escapeHtml(missionLabel(group.mission?.late, missionContext))}</span></div></div>`;
  }).join("");
  const html = `<div class="dsPlanTop"><div><b>${escapeHtml(translate("ds_plan_ready"))}</b><small>${escapeHtml(translate("ds_starters"))} ${plan.starters.length}/20 · ${escapeHtml(translate("ds_substitutes"))} ${substitutes.length}/10 · ${escapeHtml(translate("ds_confidence"))} ${escapeHtml(plan.confidence)}%</small></div><span class="pill">${escapeHtml(translate("ds_team"))} ${escapeHtml(plan.team)}</span></div>${warnings.length ? `<div class="notice warn dsWarnings">${warnings.map(message => `<div>⚠️ ${escapeHtml(message)}</div>`).join("")}</div>` : ""}<div class="dsPlanGroups">${groupsHtml}</div>${substitutes.length ? `<div class="dsSubs"><b>${escapeHtml(translate("ds_substitutes"))}</b><small>${escapeHtml(substitutes.join(" · "))}</small></div>` : ""}<div class="dsShortOrders"><b>📣 ${escapeHtml(translate("ds_short_orders"))}</b><pre>${escapeHtml(copyText(plan))}</pre></div><p class="activityNote">${escapeHtml(translate("ds_ruleset_note", { date: rulesetDate }))}</p>`;

  box.innerHTML = html;
  setHidden(box, false);
  setHidden(copyButton, false);
  if (scrollIntoView && typeof box.scrollIntoView === "function") {
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return {
    ok: !box.hidden && !box.classList.contains("hidden") && Boolean(String(box.innerHTML || "").trim()),
    groupCount: plan.groups.length,
    participantCount: plan.starters.length,
    substituteCount: substitutes.length
  };
}