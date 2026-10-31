const HERO_SEASONS = [
  { season: 1, heroes: ["Kimberly", "DVA", "Tesla"] },
  { season: 2, heroes: ["Murphy", "Carlie", "Swift"] },
  { season: 3, heroes: ["Marshall", "Skyler", "McGregor"] },
  { season: 4, heroes: ["Williams", "Lucius", "Adam"] },
  { season: 5, heroes: ["Stetmann", "Morrison", "Fiona"] }
];

const SPECIALIZATION_KEYS = ["attack", "hp", "defense"];
const BONUS_FIELDS = [
  "current_bonus_all_heroes",
  "current_bonus_this_hero",
  "next_bonus_all_heroes",
  "next_bonus_this_hero"
];
const EVIDENCE_SOURCES = new Set(["capture", "scan", "manual"]);
const OIL_STATES = new Set(["percent", "max", "locked", "unknown"]);
const T11_STATES = new Set(["unknown", "locked", "available", "unlocked"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const EXCLUSIVE_WEAPON_HEROES = deepFreeze(HERO_SEASONS);
export const EXCLUSIVE_WEAPON_HERO_NAMES = deepFreeze(
  HERO_SEASONS.flatMap(({ heroes }) => heroes)
);
export const EXCLUSIVE_SPECIALIZATION_KEYS = deepFreeze([...SPECIALIZATION_KEYS]);

// These are community estimates/reference notes, never initialized as player data.
export const LATE_GAME_REFERENCE = deepFreeze({
  status: "community_estimate_unverified",
  verified_in_game: false,
  player_data: false,
  specialization_max_level: null,
  hq: {
    30: { hero_max_level: 150, petroleum_requirement_estimate: 0 },
    31: { hero_max_level: 155, petroleum_requirement_estimate: 1440000 },
    32: { hero_max_level: 160, petroleum_requirement_estimate: 2304000 },
    33: { hero_max_level: 165, petroleum_requirement_estimate: 3916800 },
    34: { hero_max_level: 170, petroleum_requirement_estimate: 7050240 },
    35: { hero_max_level: 175, petroleum_requirement_estimate: 14100480 }
  },
  oil_era: {
    technology_key: "oil_era",
    related_research: "QG Expansion",
    status: "community_reference_unverified",
    requires_capture_confirmation: true
  },
  t11: {
    status: "community_reference_unverified",
    requirements_are_not_verified: true,
    possible_requirements: [
      { kind: "season", value: 4 },
      { kind: "barracks", level: 35 },
      { kind: "facility", name: "Institut d’armement", level: null }
    ],
    hq_level_requirement: null,
    requires_capture_confirmation: true
  }
});

function nameKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HERO_BY_KEY = new Map(
  EXCLUSIVE_WEAPON_HERO_NAMES.map(name => [nameKey(name), name])
);
HERO_BY_KEY.set("schuyler", "Skyler");
HERO_BY_KEY.set("shuyler", "Skyler");

export function canonicalExclusiveHeroName(value) {
  return HERO_BY_KEY.get(nameKey(value)) || null;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNonnegative(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !/^\+?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value.trim().replace(/^\+/, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nonnegativeInteger(value) {
  const parsed = finiteNonnegative(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeEvidence(value) {
  if (typeof value === "string") {
    const text = value.trim().slice(0, 240);
    return text ? { source: "capture", text } : null;
  }
  const raw = objectOrEmpty(value);
  const source = EVIDENCE_SOURCES.has(raw.source) ? raw.source : null;
  const text = typeof raw.text === "string"
    ? raw.text.trim().slice(0, 240)
    : typeof raw.excerpt === "string"
      ? raw.excerpt.trim().slice(0, 240)
      : "";
  const confidence = finiteNonnegative(raw.confidence);
  if (!source && !text && confidence === null) return null;
  return {
    ...(source ? { source } : {}),
    ...(text ? { text } : {}),
    ...(confidence !== null && confidence <= 1 ? { confidence } : {})
  };
}

function normalizeMilestones(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const milestones = [];
  for (const raw of value.slice(0, 12)) {
    const row = objectOrEmpty(raw);
    const level = nonnegativeInteger(row.level);
    const bonus = finiteNonnegative(row.bonus);
    if (level === null || bonus === null || seen.has(level)) continue;
    seen.add(level);
    milestones.push({ level, bonus });
  }
  return milestones.sort((a, b) => a.level - b.level);
}

export function normalizeSpecialization(value) {
  const raw = objectOrEmpty(value);
  const level = nonnegativeInteger(raw.level);
  const locked = typeof raw.locked === "boolean" ? raw.locked : null;
  const result = {
    level,
    locked,
    current_bonus_all_heroes: finiteNonnegative(raw.current_bonus_all_heroes),
    current_bonus_this_hero: finiteNonnegative(raw.current_bonus_this_hero),
    next_bonus_all_heroes: finiteNonnegative(raw.next_bonus_all_heroes),
    next_bonus_this_hero: finiteNonnegative(raw.next_bonus_this_hero),
    fragments_owned: nonnegativeInteger(raw.fragments_owned),
    fragments_required: nonnegativeInteger(raw.fragments_required),
    evidence: normalizeEvidence(raw.evidence),
    confirmed_at: timestamp(raw.confirmed_at),
    // Milestones are distinct from the next-level bonus (for example, a level-50 target).
    milestone_bonuses_this_hero: Array.isArray(raw.milestone_bonuses_this_hero)
      ? normalizeMilestones(raw.milestone_bonuses_this_hero)
      : null
  };
  return result;
}

function normalizeWeaponProgression(value) {
  const raw = objectOrEmpty(value);
  const baseLevel = nonnegativeInteger(raw.base_weapon_level);
  return {
    base_weapon_level: baseLevel !== null && baseLevel <= 30 ? baseLevel : null,
    base_weapon_evidence: normalizeEvidence(raw.base_weapon_evidence),
    base_weapon_confirmed_at: timestamp(raw.base_weapon_confirmed_at),
    specializations: Object.fromEntries(
      SPECIALIZATION_KEYS.map(key => [key, normalizeSpecialization(raw.specializations?.[key])])
    )
  };
}

function hasWeaponData(weapon) {
  return weapon.base_weapon_level !== null
    || weapon.base_weapon_evidence !== null
    || weapon.base_weapon_confirmed_at !== null
    || SPECIALIZATION_KEYS.some(key => {
      const spec = weapon.specializations[key];
      return spec.level !== null
        || spec.locked !== null
        || BONUS_FIELDS.some(field => spec[field] !== null)
        || spec.fragments_owned !== null
        || spec.fragments_required !== null
        || spec.evidence !== null
        || spec.confirmed_at !== null
        || (spec.milestone_bonuses_this_hero?.length || 0) > 0;
    });
}

function normalizeOilEra(value) {
  const raw = objectOrEmpty(value);
  let state = OIL_STATES.has(raw.state) ? raw.state : "unknown";
  let percent = finiteNonnegative(raw.percent);
  if (state === "percent" && (percent === null || percent > 100)) {
    state = "unknown";
    percent = null;
  }
  if (state !== "percent") percent = null;
  const prerequisite = typeof raw.prerequisite === "string"
    ? raw.prerequisite.trim().slice(0, 240) || null
    : null;
  return {
    state,
    percent,
    prerequisite,
    evidence: normalizeEvidence(raw.evidence),
    confirmed_at: timestamp(raw.confirmed_at)
  };
}

function normalizeT11(value) {
  const raw = objectOrEmpty(value);
  return {
    status: T11_STATES.has(raw.status) ? raw.status : "unknown",
    evidence: normalizeEvidence(raw.evidence),
    confirmed_at: timestamp(raw.confirmed_at)
  };
}

function normalizeContext(value) {
  const raw = objectOrEmpty(value);
  const hq = nonnegativeInteger(raw.hq_level);
  return {
    hq_level: hq !== null && hq >= 30 && hq <= 35 ? hq : null,
    hq_evidence: normalizeEvidence(raw.hq_evidence),
    hq_confirmed_at: timestamp(raw.hq_confirmed_at),
    oil_era: normalizeOilEra(raw.oil_era),
    t11: normalizeT11(raw.t11)
  };
}

export function createEmptyLateGameProgression() {
  return {
    version: 1,
    heroes: {},
    context: normalizeContext({})
  };
}

export function normalizeLateGameProgression(value) {
  const raw = objectOrEmpty(value);
  const heroes = {};
  for (const [rawName, rawWeapon] of Object.entries(objectOrEmpty(raw.heroes))) {
    const name = canonicalExclusiveHeroName(rawName);
    if (!name) continue;
    const weapon = normalizeWeaponProgression(rawWeapon);
    if (!hasWeaponData(weapon)) continue;
    const previous = heroes[name];
    heroes[name] = previous
      ? mergeWeaponProgression(previous, weapon)
      : weapon;
  }
  return {
    version: 1,
    heroes,
    context: normalizeContext(raw.context)
  };
}

const SCAN_CONFIDENCE_THRESHOLD = 0.9;
const SCAN_EVIDENCE = new Set([
  "visible_weapon_header",
  "visible_classic_weapon_level",
  "same_node",
  "same_node_current_bonus",
  "same_node_next_bonus",
  "same_node_fragments",
  "same_node_milestone"
]);

function confidentEvidence(raw, evidenceField, confidenceField, allowed) {
  const evidence = String(raw?.[evidenceField] || "");
  const confidence = finiteNonnegative(raw?.[confidenceField]);
  return allowed.has(evidence) && confidence !== null && confidence >= SCAN_CONFIDENCE_THRESHOLD;
}

function scannedEvidence(raw, source = "scan") {
  const text = typeof raw?.visible_text === "string"
    ? raw.visible_text.trim().slice(0, 180)
    : "";
  const confidence = finiteNonnegative(raw?.confidence);
  return normalizeEvidence({
    source,
    ...(text ? { text } : {}),
    ...(confidence !== null && confidence <= 1 ? { confidence } : {})
  });
}

/**
 * Accept only explicit same-screen evidence from the exclusive-weapon scan.
 * In particular, generic OCR confidence or a nearby number is not enough to
 * populate a specialization field.
 */
export function sanitizeLateGameScan(extracted, now = new Date().toISOString()) {
  const rawRoot = objectOrEmpty(extracted?.late_game_progression);
  const rows = Array.isArray(rawRoot.heroes)
    ? rawRoot.heroes
    : Object.entries(objectOrEmpty(rawRoot.heroes)).map(([hero_name, row]) => ({ hero_name, ...objectOrEmpty(row) }));
  const heroes = {};
  for (const raw of rows.slice(0, 15)) {
    const name = canonicalExclusiveHeroName(raw?.hero_name);
    if (!name || !confidentEvidence(raw, "hero_evidence", "hero_confidence", new Set(["visible_weapon_header"]))) continue;
    const weapon = { specializations: {} };
    if (confidentEvidence(raw, "base_weapon_evidence_kind", "base_weapon_confidence", new Set(["visible_classic_weapon_level"]))) {
      const level = nonnegativeInteger(raw.base_weapon_level);
      if (level !== null && level <= 30) {
        weapon.base_weapon_level = level;
        weapon.base_weapon_evidence = scannedEvidence({
          visible_text: raw.base_weapon_visible_text,
          confidence: raw.base_weapon_confidence
        });
      }
    }
    for (const key of SPECIALIZATION_KEYS) {
      const node = objectOrEmpty(raw.specializations?.[key]);
      const spec = {};
      const nodeEvidence = confidentEvidence(node, "node_evidence", "node_confidence", new Set(["same_node"]));
      if (nodeEvidence) {
        const level = nonnegativeInteger(node.level);
        if (level !== null) {
          spec.level = level;
          spec.evidence = scannedEvidence({ visible_text: node.level_visible_text, confidence: node.node_confidence });
        }
      }
      if (confidentEvidence(node, "lock_evidence", "lock_confidence", new Set(["same_node"])) && typeof node.locked === "boolean") {
        spec.locked = node.locked;
        spec.evidence ||= scannedEvidence({ visible_text: node.lock_visible_text, confidence: node.lock_confidence });
      }
      for (const field of BONUS_FIELDS) {
        const expected = field.startsWith("next_") ? "same_node_next_bonus" : "same_node_current_bonus";
        if (!confidentEvidence(node, `${field}_evidence`, `${field}_confidence`, new Set([expected]))) continue;
        const value = finiteNonnegative(node[field]);
        if (value === null) continue;
        spec[field] = value;
        spec.evidence ||= scannedEvidence({ visible_text: node[`${field}_visible_text`], confidence: node[`${field}_confidence`] });
      }
      if (confidentEvidence(node, "fragments_evidence", "fragments_confidence", new Set(["same_node_fragments"]))) {
        const owned = nonnegativeInteger(node.fragments_owned);
        const required = nonnegativeInteger(node.fragments_required);
        if (owned !== null) spec.fragments_owned = owned;
        if (required !== null) spec.fragments_required = required;
        if (owned !== null || required !== null) {
          spec.evidence ||= scannedEvidence({ visible_text: node.fragments_visible_text, confidence: node.fragments_confidence });
        }
      }
      if (Array.isArray(node.milestone_bonuses_this_hero)) {
        const milestones = node.milestone_bonuses_this_hero.filter(item =>
          confidentEvidence(item, "evidence_kind", "confidence", new Set(["same_node_milestone"]))
        ).map(item => ({ level: item.level, bonus: item.bonus }));
        if (milestones.length) {
          spec.milestone_bonuses_this_hero = milestones;
          spec.evidence ||= scannedEvidence({ visible_text: node.milestone_visible_text, confidence: node.milestone_confidence });
        }
      }
      if (Object.keys(spec).length) {
        spec.confirmed_at = null;
        weapon.specializations[key] = spec;
      }
    }
    const normalized = normalizeWeaponProgression(weapon);
    if (hasWeaponData(normalized)) heroes[name] = mergeWeaponProgression(heroes[name] || normalizeWeaponProgression({}), normalized);
  }
  return {
    version: 1,
    heroes,
    context: createEmptyLateGameProgression().context,
    scanned_at: timestamp(now)
  };
}

export function confirmLateGameProgression(value, confirmedAt, source = "scan") {
  const state = normalizeLateGameProgression(value);
  const at = timestamp(confirmedAt);
  if (!at) return state;
  for (const weapon of Object.values(state.heroes)) {
    if (weapon.base_weapon_level !== null) {
      weapon.base_weapon_confirmed_at = at;
      weapon.base_weapon_evidence ||= { source, text: "Manually reviewed", confidence: 1 };
    }
    for (const spec of Object.values(weapon.specializations)) {
      const hasValue = spec.level !== null || spec.locked !== null
        || BONUS_FIELDS.some(field => spec[field] !== null)
        || spec.fragments_owned !== null || spec.fragments_required !== null
        || (spec.milestone_bonuses_this_hero?.length || 0) > 0;
      if (!hasValue) continue;
      spec.confirmed_at = at;
      spec.evidence ||= { source, text: "Manually reviewed", confidence: 1 };
    }
  }
  return state;
}

/** Only confirmed account facts may be passed to advice/technology logic. */
export function confirmedLateGameProgression(value) {
  const normalized = normalizeLateGameProgression(value);
  const heroes = {};
  for (const [name, weapon] of Object.entries(normalized.heroes)) {
    const baseConfirmed = Boolean(weapon.base_weapon_confirmed_at);
    const specializations = Object.fromEntries(SPECIALIZATION_KEYS.map(key => {
      const row = weapon.specializations[key];
      return [key, row.confirmed_at ? row : normalizeSpecialization({})];
    }));
    const anyConfirmed = Object.values(specializations).some(row => row.confirmed_at)
      || baseConfirmed;
    if (!anyConfirmed) continue;
    heroes[name] = {
      base_weapon_level: baseConfirmed ? weapon.base_weapon_level : null,
      base_weapon_confirmed_at: baseConfirmed ? weapon.base_weapon_confirmed_at : null,
      specializations
    };
  }
  const context = normalizeContext(normalized.context);
  const confirmedContext = {
    hq_level: context.hq_confirmed_at ? context.hq_level : null,
    hq_confirmed_at: context.hq_confirmed_at,
    oil_era: context.oil_era.confirmed_at ? context.oil_era : normalizeOilEra({}),
    t11: context.t11.confirmed_at ? context.t11 : normalizeT11({})
  };
  return { version: 1, heroes, context: confirmedContext };
}

function mergeRecordFields(baseValue, incomingValue, fields, options = {}) {
  const base = objectOrEmpty(baseValue);
  const incoming = objectOrEmpty(incomingValue);
  const baseAt = timestamp(base.confirmed_at);
  const incomingAt = timestamp(incoming.confirmed_at);
  const eligible = !baseAt || (incomingAt !== null && Date.parse(incomingAt) >= Date.parse(baseAt));
  if (!eligible) return { ...base };

  const result = { ...base };
  for (const field of fields) {
    if (incoming[field] !== null && incoming[field] !== undefined) result[field] = incoming[field];
  }
  if (incoming.evidence !== null && incoming.evidence !== undefined) {
    result.evidence = incoming.evidence;
  }
  if (incomingAt) result.confirmed_at = incomingAt;

  if (options.clearPercentForStates?.includes(incoming.state)) result.percent = null;
  return result;
}

function mergeSpecialization(base, incoming) {
  const merged = mergeRecordFields(
    base,
    incoming,
    [
      "level",
      "locked",
      ...BONUS_FIELDS,
      "fragments_owned",
      "fragments_required"
    ]
  );
  const baseMilestones = Array.isArray(base?.milestone_bonuses_this_hero)
    ? base.milestone_bonuses_this_hero
    : [];
  const incomingMilestones = Array.isArray(incoming?.milestone_bonuses_this_hero)
    ? incoming.milestone_bonuses_this_hero
    : [];
  if (incomingMilestones.length) {
    const byLevel = new Map(baseMilestones.map(item => [item.level, item]));
    for (const item of incomingMilestones) byLevel.set(item.level, item);
    merged.milestone_bonuses_this_hero = [...byLevel.values()]
      .sort((a, b) => a.level - b.level)
      .slice(0, 12);
  } else if (baseMilestones.length) {
    merged.milestone_bonuses_this_hero = baseMilestones;
  }
  return merged;
}

function mergeWeaponProgression(base, incoming) {
  const baseAt = timestamp(base.base_weapon_confirmed_at);
  const incomingAt = timestamp(incoming.base_weapon_confirmed_at);
  const baseEligible = !baseAt || (incomingAt && Date.parse(incomingAt) >= Date.parse(baseAt));
  const merged = {
    base_weapon_level: baseEligible && incoming.base_weapon_level !== null
      ? incoming.base_weapon_level
      : base.base_weapon_level,
    base_weapon_evidence: baseEligible && incoming.base_weapon_evidence
      ? incoming.base_weapon_evidence
      : base.base_weapon_evidence,
    base_weapon_confirmed_at: baseEligible && incomingAt
      ? incomingAt
      : base.base_weapon_confirmed_at,
    specializations: {}
  };
  for (const key of SPECIALIZATION_KEYS) {
    merged.specializations[key] = mergeSpecialization(
      base.specializations[key],
      incoming.specializations[key]
    );
  }
  return merged;
}

function mergeOilEra(base, incoming) {
  if (incoming.state === "unknown") return { ...base };
  return mergeRecordFields(
    base,
    incoming,
    ["state", "percent", "prerequisite"],
    { clearPercentForStates: ["max", "locked"] }
  );
}

function mergeT11(base, incoming) {
  if (incoming.status === "unknown") return { ...base };
  return mergeRecordFields(base, incoming, ["status"]);
}

function mergeContext(base, incoming) {
  const baseHqAt = timestamp(base.hq_confirmed_at);
  const incomingHqAt = timestamp(incoming.hq_confirmed_at);
  const hqEligible = !baseHqAt
    || (incomingHqAt !== null && Date.parse(incomingHqAt) >= Date.parse(baseHqAt));
  return {
    hq_level: hqEligible && incoming.hq_level !== null ? incoming.hq_level : base.hq_level,
    hq_evidence: hqEligible && incoming.hq_evidence ? incoming.hq_evidence : base.hq_evidence,
    hq_confirmed_at: hqEligible && incomingHqAt ? incomingHqAt : base.hq_confirmed_at,
    oil_era: mergeOilEra(base.oil_era, incoming.oil_era),
    t11: mergeT11(base.t11, incoming.t11)
  };
}

export function mergeLateGameProgression(baseValue, incomingValue, { sameAccount = false } = {}) {
  const incoming = normalizeLateGameProgression(incomingValue);
  if (!sameAccount) return incoming;

  const base = normalizeLateGameProgression(baseValue);
  const heroes = { ...base.heroes };
  for (const [name, weapon] of Object.entries(incoming.heroes)) {
    heroes[name] = heroes[name]
      ? mergeWeaponProgression(heroes[name], weapon)
      : weapon;
  }
  return {
    version: 1,
    heroes,
    context: mergeContext(base.context, incoming.context)
  };
}
