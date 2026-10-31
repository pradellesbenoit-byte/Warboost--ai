import assert from "node:assert/strict";
import test from "node:test";
import {
  EXCLUSIVE_SPECIALIZATION_KEYS,
  EXCLUSIVE_WEAPON_HEROES,
  EXCLUSIVE_WEAPON_HERO_NAMES,
  LATE_GAME_REFERENCE,
  canonicalExclusiveHeroName,
  createEmptyLateGameProgression,
  mergeLateGameProgression,
  normalizeLateGameProgression,
  normalizeSpecialization
} from "../lib/late-game-progression.js";

const confirmedAt = "2026-10-31T12:00:00.000Z";
const evidence = { source: "capture", text: "Lame de Frappe — DVA", confidence: 1 };

test("catalogue exactly the 15 exclusive-weapon heroes by season", () => {
  assert.equal(EXCLUSIVE_WEAPON_HEROES.length, 5);
  assert.equal(EXCLUSIVE_WEAPON_HERO_NAMES.length, 15);
  assert.equal(new Set(EXCLUSIVE_WEAPON_HERO_NAMES).size, 15);
  assert.deepEqual(EXCLUSIVE_SPECIALIZATION_KEYS, ["attack", "hp", "defense"]);
  assert.deepEqual(EXCLUSIVE_WEAPON_HEROES.map(row => row.season), [1, 2, 3, 4, 5]);
});

test("canonicalizes Skyler aliases without inventing unknown heroes", () => {
  assert.equal(canonicalExclusiveHeroName("Schuyler"), "Skyler");
  assert.equal(canonicalExclusiveHeroName("Shuyler"), "Skyler");
  assert.equal(canonicalExclusiveHeroName("skyler"), "Skyler");
  assert.equal(canonicalExclusiveHeroName("AnUnknownHero"), null);
});

test("keeps classic weapon level 30 separate from observed DVA specializations", () => {
  const state = normalizeLateGameProgression({
    heroes: {
      DVA: {
        base_weapon_level: 30,
        base_weapon_confirmed_at: confirmedAt,
        base_weapon_evidence: evidence,
        displayed_global_power: 8170703,
        specializations: {
          attack: {
            level: 0,
            locked: false,
            current_bonus_all_heroes: 0,
            current_bonus_this_hero: 0,
            next_bonus_all_heroes: 4,
            fragments_owned: 29,
            fragments_required: 10,
            milestone_bonuses_this_hero: [{ level: 50, bonus: 1750 }],
            evidence: {
              source: "capture",
              text: "Attaque Lv.0; ATQ Héros 0+4; niveau 50 +1750; 29/10",
              confidence: 1
            },
            confirmed_at: confirmedAt
          },
          hp: { level: 0, locked: true, evidence, confirmed_at: confirmedAt },
          defense: { level: 0, locked: true, evidence, confirmed_at: confirmedAt }
        }
      }
    },
    context: {
      oil_era: { state: "percent", percent: 0, evidence, confirmed_at: confirmedAt },
      t11: { status: "locked", evidence, confirmed_at: confirmedAt }
    }
  });
  const dva = state.heroes.DVA;
  assert.equal(dva.base_weapon_level, 30);
  assert.equal(dva.specializations.attack.level, 0);
  assert.equal(dva.specializations.attack.locked, false);
  assert.equal(dva.specializations.attack.current_bonus_all_heroes, 0);
  assert.equal(dva.specializations.attack.next_bonus_all_heroes, 4);
  assert.equal(dva.specializations.attack.fragments_owned, 29);
  assert.equal(dva.specializations.attack.fragments_required, 10);
  assert.deepEqual(dva.specializations.attack.milestone_bonuses_this_hero, [
    { level: 50, bonus: 1750 }
  ]);
  assert.equal(dva.specializations.attack.next_bonus_this_hero, null);
  assert.equal(dva.specializations.hp.level, 0);
  assert.equal(dva.specializations.hp.locked, true);
  assert.equal(dva.specializations.defense.level, 0);
  assert.equal(dva.specializations.defense.locked, true);
  assert.equal(Object.hasOwn(dva, "displayed_global_power"), false);
  assert.equal(Object.hasOwn(dva, "power"), false);
});

test("does not turn a specialization level into weapon level 31 or impose a 50-level cap", () => {
  const state = normalizeLateGameProgression({
    heroes: {
      DVA: { base_weapon_level: 31, level: 31, specializations: { attack: { level: 300 } } }
    }
  });
  assert.equal(state.heroes.DVA.base_weapon_level, null);
  assert.equal(state.heroes.DVA.specializations.attack.level, 300);
  assert.equal(LATE_GAME_REFERENCE.specialization_max_level, null);
  assert.equal(LATE_GAME_REFERENCE.hq[35].hero_max_level, 175);
});

test("keeps HQ 31, real oil-era 0%, and specialization level 0 in separate fields", () => {
  const state = normalizeLateGameProgression({
    context: {
      hq_level: 31,
      hq_confirmed_at: confirmedAt,
      hq_evidence: { source: "capture", text: "QG 31", confidence: 1 },
      oil_era: { state: "percent", percent: 0, evidence, confirmed_at: confirmedAt }
    },
    heroes: {
      DVA: { specializations: { attack: { level: 0, confirmed_at: confirmedAt, evidence } } }
    }
  });
  assert.equal(state.context.hq_level, 31);
  assert.equal(state.context.oil_era.state, "percent");
  assert.equal(state.context.oil_era.percent, 0);
  assert.equal(state.heroes.DVA.specializations.attack.level, 0);
  assert.equal(state.context.t11.status, "unknown");
  assert.equal(Object.hasOwn(state.context, "petroleum_requirement_estimate"), false);
  assert.equal(Object.hasOwn(state.heroes.DVA, "petroleum_requirement_estimate"), false);
});

test("community HQ, petroleum and T11 notes are explicitly non-player estimates", () => {
  assert.equal(LATE_GAME_REFERENCE.verified_in_game, false);
  assert.equal(LATE_GAME_REFERENCE.player_data, false);
  assert.deepEqual(
    Object.values(LATE_GAME_REFERENCE.hq).map(row => row.petroleum_requirement_estimate),
    [0, 1440000, 2304000, 3916800, 7050240, 14100480]
  );
  assert.deepEqual(
    Object.values(LATE_GAME_REFERENCE.hq).map(row => row.hero_max_level),
    [150, 155, 160, 165, 170, 175]
  );
  assert.equal(LATE_GAME_REFERENCE.oil_era.technology_key, "oil_era");
  assert.equal(LATE_GAME_REFERENCE.oil_era.requires_capture_confirmation, true);
  assert.equal(LATE_GAME_REFERENCE.t11.hq_level_requirement, null);
  assert.equal(LATE_GAME_REFERENCE.t11.requires_capture_confirmation, true);
  assert.equal(LATE_GAME_REFERENCE.t11.possible_requirements[2].level, null);
});

test("missing values remain null and do not become zero or unlocked", () => {
  const specialization = normalizeSpecialization({});
  assert.equal(specialization.level, null);
  assert.equal(specialization.locked, null);
  assert.equal(specialization.current_bonus_all_heroes, null);
  assert.equal(specialization.fragments_owned, null);
  assert.equal(specialization.evidence, null);

  const empty = createEmptyLateGameProgression();
  assert.deepEqual(empty.heroes, {});
  assert.equal(empty.context.hq_level, null);
  assert.equal(empty.context.oil_era.percent, null);
  assert.equal(empty.context.oil_era.state, "unknown");
  assert.equal(empty.context.t11.status, "unknown");
});

test("normalization preserves an explicit locked Lv.0 node and does not auto-unlock it", () => {
  const state = normalizeLateGameProgression({
    heroes: { DVA: { specializations: { hp: { level: 0, locked: true } } } }
  });
  assert.equal(state.heroes.DVA.specializations.hp.level, 0);
  assert.equal(state.heroes.DVA.specializations.hp.locked, true);
  assert.equal(state.heroes.DVA.specializations.attack.locked, null);
  assert.equal(state.heroes.DVA.specializations.defense.locked, null);
});

test("a partial same-account update preserves confirmed sibling specializations and fields", () => {
  const old = normalizeLateGameProgression({
    heroes: {
      DVA: {
        base_weapon_level: 30,
        base_weapon_confirmed_at: confirmedAt,
        specializations: {
          attack: {
            level: 0,
            locked: false,
            next_bonus_all_heroes: 4,
            fragments_owned: 29,
            fragments_required: 10,
            evidence,
            confirmed_at: confirmedAt
          },
          hp: { level: 0, locked: true, evidence, confirmed_at: confirmedAt },
          defense: { level: 0, locked: true, evidence, confirmed_at: confirmedAt }
        }
      }
    },
    context: {
      oil_era: { state: "percent", percent: 0, evidence, confirmed_at: confirmedAt },
      t11: { status: "locked", evidence, confirmed_at: confirmedAt }
    }
  });
  const partial = normalizeLateGameProgression({
    heroes: {
      DVA: {
        specializations: {
          attack: {
            level: 1,
            locked: false,
            next_bonus_all_heroes: 8,
            evidence: { source: "capture", text: "Attaque Lv.1", confidence: 1 },
            confirmed_at: "2026-11-01T12:00:00.000Z"
          }
        }
      }
    }
  });
  const merged = mergeLateGameProgression(old, partial, { sameAccount: true });
  assert.equal(merged.heroes.DVA.base_weapon_level, 30);
  assert.equal(merged.heroes.DVA.specializations.attack.level, 1);
  assert.equal(merged.heroes.DVA.specializations.attack.next_bonus_all_heroes, 8);
  assert.equal(merged.heroes.DVA.specializations.attack.fragments_owned, 29);
  assert.equal(merged.heroes.DVA.specializations.hp.level, 0);
  assert.equal(merged.heroes.DVA.specializations.hp.locked, true);
  assert.equal(merged.heroes.DVA.specializations.defense.level, 0);
  assert.equal(merged.heroes.DVA.specializations.defense.locked, true);
  assert.equal(merged.context.oil_era.state, "percent");
  assert.equal(merged.context.oil_era.percent, 0);
  assert.equal(merged.context.t11.status, "locked");
});

test("an older or unconfirmed partial capture cannot overwrite confirmed values", () => {
  const base = normalizeLateGameProgression({
    heroes: {
      DVA: {
        specializations: {
          attack: {
            level: 2,
            locked: false,
            current_bonus_all_heroes: 4,
            evidence,
            confirmed_at: "2026-10-31T12:00:00.000Z"
          }
        }
      }
    }
  });
  const oldCapture = normalizeLateGameProgression({
    heroes: {
      DVA: {
        specializations: {
          attack: {
            level: 1,
            locked: true,
            current_bonus_all_heroes: 0,
            confirmed_at: "2026-10-30T12:00:00.000Z"
          }
        }
      }
    }
  });
  const unconfirmed = normalizeLateGameProgression({
    heroes: { DVA: { specializations: { attack: { level: 0, locked: true } } } }
  });
  for (const update of [oldCapture, unconfirmed]) {
    const merged = mergeLateGameProgression(base, update, { sameAccount: true });
    assert.equal(merged.heroes.DVA.specializations.attack.level, 2);
    assert.equal(merged.heroes.DVA.specializations.attack.locked, false);
    assert.equal(merged.heroes.DVA.specializations.attack.current_bonus_all_heroes, 4);
  }
});

test("different accounts never inherit the previous account's progression", () => {
  const accountA = normalizeLateGameProgression({
    heroes: { DVA: { base_weapon_level: 30, specializations: { attack: { level: 9 } } } },
    context: { hq_level: 35 }
  });
  const accountB = mergeLateGameProgression(accountA, createEmptyLateGameProgression(), {
    sameAccount: false
  });
  assert.deepEqual(accountB.heroes, {});
  assert.equal(accountB.context.hq_level, null);
});

test("reference estimates and unknown fields cannot be normalized as player facts", () => {
  const state = normalizeLateGameProgression({
    heroes: {
      "Unknown Hero": { base_weapon_level: 30, specializations: { attack: { level: 50 } } }
    },
    context: {
      hq_level: 36,
      petroleum_requirement_estimate: 14100480,
      t11: { status: "enabled_by_hq31" }
    }
  });
  assert.deepEqual(state.heroes, {});
  assert.equal(state.context.hq_level, null);
  assert.equal(state.context.t11.status, "unknown");
  assert.equal(Object.hasOwn(state.context, "petroleum_requirement_estimate"), false);
});
