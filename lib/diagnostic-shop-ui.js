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

export function renderDiagnosticShop(cards, { locale = "fr" } = {}) {
  const english = !String(locale).toLowerCase().startsWith("fr");
  const copy = english
    ? {
        heading: "AI Shop",
        free: "Free / reward",
        internal: "In-game currency",
        paid: "Real money · optional",
        unknown: "To verify",
        availability: "Availability to verify in Last War",
        observedMayVary: "Observed price · may vary",
        observedNotLive: "Observed · not live",
        provenance: "Source & observation",
        observationNote: "Availability and details are observations, not guaranteed live.",
        observedAt: "Observed",
        source: "Source"
      }
    : {
        heading: "Boutique IA",
        free: "Gratuit / récompense",
        internal: "Monnaie du jeu",
        paid: "Argent réel · optionnel",
        unknown: "À vérifier",
        availability: "Disponibilité à vérifier dans Last War",
        observedMayVary: "Prix observé · peut varier",
        observedNotLive: "Observé · non garanti en direct",
        provenance: "Source et observation",
        observationNote: "Disponibilité et détails observés, non garantis en direct.",
        observedAt: "Observé le",
        source: "Source"
      };

  const entries = (Array.isArray(cards) ? cards : [])
    .filter(card => card && typeof card === "object")
    .slice(0, 3);
  if (!entries.length) return "";

  const cardsMarkup = entries.map((card, cardIndex) => {
    const title = text(card.title);
    const note = text(card.note);
    const options = (Array.isArray(card.options) ? card.options : [])
      .filter(option => option && typeof option === "object");

    const optionRows = options.slice(0,3).map(option => {
      const kind = ["free", "internal", "paid"].includes(option.type) ? option.type : "unknown";
      const badge = copy[kind];
      const observedAt = text(option.observedAt);
      const source = text(option.source);
      const costNote = kind === "paid" && option.priceObserved !== false
        ? `<span class="diagnosticShopCostNote">${escapeHtml(copy.observedMayVary)}</span>`
        : kind === "internal" && option.fresh === false
          ? `<span class="diagnosticShopCostNote">${escapeHtml(copy.observedNotLive)}</span>`
          : "";

      return `<li class="diagnosticShopOption"><div class="diagnosticShopOptionMain"><div class="diagnosticShopItem">${escapeHtml(text(option.item))}</div><div class="diagnosticShopStore">${escapeHtml(text(option.store))}</div><div class="diagnosticShopCost">${escapeHtml(text(option.cost))}${costNote}</div></div><div class="diagnosticShopOptionMeta"><span class="diagnosticShopBadge diagnosticShopBadge--${kind}">${escapeHtml(badge)}</span>${option.fresh === false ? `<span class="diagnosticShopAvailability">${escapeHtml(copy.availability)}</span>` : ""}</div></li>`;
    });
    const optionMarkup=optionRows.slice(0,1).join("");
    const more=optionRows.length>1?`<details class="diagnosticShopProvenance"><summary>${english?"Other ways to obtain it":"Autres moyens de l’obtenir"}${options.some(o=>o.type==="paid")?` · ${english?"paid optional":"payant optionnel"}`:""}</summary><ul class="diagnosticShopOptions">${optionRows.slice(1).join("")}</ul></details>`:"";

    const provenanceOptions = options.filter(option => text(option.observedAt) || text(option.source));
    const provenance = provenanceOptions.length
      ? `<details class="diagnosticShopProvenance"><summary>${escapeHtml(copy.provenance)}</summary><div class="diagnosticShopProvenanceBody"><p>${escapeHtml(copy.observationNote)}</p><ul>${provenanceOptions.map(option => `<li>${text(option.item) ? `<strong>${escapeHtml(text(option.item))}</strong>` : ""}${text(option.observedAt) ? `<span>${escapeHtml(copy.observedAt)} : ${escapeHtml(text(option.observedAt))}</span>` : ""}${text(option.source) ? `<span>${escapeHtml(copy.source)} : ${escapeHtml(text(option.source))}</span>` : ""}</li>`).join("")}</ul></div></details>`
      : "";

    return `<article class="diagnosticShopCard"><header class="diagnosticShopCardHead"><h3>${escapeHtml(title || (english ? `Option ${cardIndex + 1}` : `Option ${cardIndex + 1}`))}</h3></header>${note ? `<p class="diagnosticShopNote">${escapeHtml(note)}</p>` : ""}${options.length ? `<ul class="diagnosticShopOptions">${optionMarkup}</ul>` : ""}${more}${provenance}</article>`;
  }).join("");

  return `<section class="diagnosticShop" lang="${english ? "en" : "fr"}" aria-label="${escapeHtml(copy.heading)}"><header class="diagnosticShopHead"><span class="diagnosticShopEyebrow">${english ? "PLAYER GUIDE" : "GUIDE JOUEUR"}</span><h2>${escapeHtml(copy.heading)}</h2></header><div class="diagnosticShopCards">${cardsMarkup}</div></section>`;
}