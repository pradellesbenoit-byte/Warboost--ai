function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function text(value) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function strings(values) {
  return (Array.isArray(values) ? values : []).map(text).filter(Boolean);
}

function list(items, className) {
  return `<ul class="${className}">${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function renderGlobalDiagnostic(report, { locale = "fr" } = {}) {
  const english = !String(locale).toLowerCase().startsWith("fr");
  const copy = english
    ? {
        label: "PLAYER GUIDE",
        title: "Your priorities",
        intro: "A short list of practical next moves.",
        priority: "PRIORITY",
        action: "Next move",
        details: "Why this matters",
        why: "Why",
        impact: "Impact",
        today: "Today",
        week: "Seven-day plan",
        keep: "Hold on to",
        spend: "Use for",
        resources: "Resources",
        shop: "Shop advice",
        missing: "Still to confirm",
        empty: "No priorities are available yet."
      }
    : {
        label: "GUIDE JOUEUR",
        title: "Tes priorités",
        intro: "Quelques actions concrètes, sans détour.",
        priority: "PRIORITÉ",
        action: "À faire",
        details: "Pourquoi c’est utile",
        why: "Pourquoi",
        impact: "Effet attendu",
        today: "Aujourd’hui",
        week: "Plan sur sept jours",
        keep: "À conserver",
        spend: "À utiliser pour",
        resources: "Ressources",
        shop: "Conseil boutique",
        missing: "À confirmer",
        empty: "Aucune priorité disponible pour le moment."
      };

  const data = report && typeof report === "object" ? report : {};
  const priorities = (Array.isArray(data.priorities) ? data.priorities : [])
    .filter(item => item && typeof item === "object")
    .slice(0, 3);
  const today = strings(data.today).slice(0, 3);
  const plan = (Array.isArray(data.seven_days) ? data.seven_days : [])
    .filter(item => item && typeof item === "object")
    .slice(0, 7)
    .map(item => ({ day: text(item.day), action: text(item.action) }))
    .filter(item => item.day || item.action);
  const keep = strings(data.resources && data.resources.keep);
  const spend = strings(data.resources && data.resources.spend);
  const purchases = (Array.isArray(data.purchases) ? data.purchases : [])
    .filter(item => item && typeof item === "object")
    .map(item => ({ name: text(item.name), reason: text(item.reason) }))
    .filter(item => item.name || item.reason);
  const missing = strings(data.missing);

  const priorityMarkup = priorities.map((item, index) => {
    const title = text(item.title);
    const why = text(item.why);
    const impact = text(item.impact);
    const action = text(item.action);
    const details = why || impact
      ? `<details class="globalDiagnosticWhy"><summary>${escapeHtml(copy.details)}</summary><div class="globalDiagnosticWhyBody">${why ? `<p><strong>${escapeHtml(copy.why)} :</strong> ${escapeHtml(why)}</p>` : ""}${impact ? `<p><strong>${escapeHtml(copy.impact)} :</strong> ${escapeHtml(impact)}</p>` : ""}</div></details>`
      : "";
    return `<li class="globalDiagnosticPriority"><div class="globalDiagnosticPriorityTop"><span class="globalDiagnosticRank">${escapeHtml(copy.priority)} ${index + 1}</span><h3>${escapeHtml(title || action)}</h3></div>${action && action !== title ? `<p class="globalDiagnosticAction"><strong>${escapeHtml(copy.action)} :</strong> ${escapeHtml(action)}</p>` : ""}${details}</li>`;
  }).join("");

  const sections = [];
  if (plan.length) {
    sections.push(`<details class="globalDiagnosticDisclosure"><summary>${escapeHtml(copy.week)}</summary><div class="globalDiagnosticDisclosureBody"><ol class="globalDiagnosticPlan">${plan.map(item => `<li><b>${escapeHtml(item.day)}</b><span>${escapeHtml(item.action)}</span></li>`).join("")}</ol></div></details>`);
  }
  if (keep.length || spend.length) {
    sections.push(`<details class="globalDiagnosticDisclosure"><summary>${escapeHtml(copy.resources)}</summary><div class="globalDiagnosticDisclosureBody">${keep.length ? `<div class="globalDiagnosticResourceGroup"><h4>${escapeHtml(copy.keep)}</h4>${list(keep, "globalDiagnosticMissing")}</div>` : ""}${spend.length ? `<div class="globalDiagnosticResourceGroup"><h4>${escapeHtml(copy.spend)}</h4>${list(spend, "globalDiagnosticMissing")}</div>` : ""}</div></details>`);
  }
  if (purchases.length) {
    sections.push(`<details class="globalDiagnosticDisclosure"><summary>${escapeHtml(copy.shop)}</summary><div class="globalDiagnosticDisclosureBody">${list(purchases.map(item => item.name && item.reason ? `${item.name} — ${item.reason}` : item.name || item.reason), "globalDiagnosticMissing")}</div></details>`);
  }
  if (missing.length) {
    sections.push(`<details class="globalDiagnosticDisclosure globalDiagnosticMissingDetails"><summary>${escapeHtml(copy.missing)} · ${missing.length}</summary><div class="globalDiagnosticDisclosureBody">${list(missing, "globalDiagnosticMissing")}</div></details>`);
  }

  return `<section class="globalDiagnostic" lang="${english ? "en" : "fr"}" aria-label="${english ? "Player priorities and plan" : "Priorités et plan joueur"}"><header class="globalDiagnosticHead"><span class="globalDiagnosticEyebrow">${escapeHtml(copy.label)}</span><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.intro)}</p></header>${priorityMarkup ? `<ol class="globalDiagnosticPriorities">${priorityMarkup}</ol>` : `<p class="globalDiagnosticEmpty">${escapeHtml(copy.empty)}</p>`}${today.length ? `<section class="globalDiagnosticToday" aria-label="${escapeHtml(copy.today)}"><h3>${escapeHtml(copy.today)}</h3>${list(today, "globalDiagnosticTodayList").replace("globalDiagnosticTodayList", "globalDiagnosticTodayItems").replace("<ul", "<ol").replace("</ul>", "</ol>")}</section>` : ""}${sections.join("")}</section>`;
}