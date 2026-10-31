import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {sanitize} from "../api/scan.js";
import {
  EXCLUSIVE_WEAPON_HERO_NAMES,
  LATE_GAME_REFERENCE,
  canonicalExclusiveHeroName,
  confirmLateGameProgression,
  confirmedLateGameProgression,
  mergeLateGameProgression,
  normalizeLateGameProgression,
  sanitizeLateGameScan
} from "../lib/late-game-progression.js";
import {createScanReviewDraft} from "../lib/scan-review.js";
import {mergeNewest, normalizeState} from "../lib/normalize.js";

const now = "2026-10-31T12:00:00.000Z";
const future = "2026-10-31T12:05:00.000Z";

function dvaScan() {
  return {
    exclusive_weapons: [{ hero_name: "DVA", weapon_name: "Lame de Frappe DVA", level: 30 }],
    power: 8170703,
    late_game_progression: {
      heroes: [{
        hero_name: "DVA",
        hero_evidence: "visible_weapon_header",
        hero_confidence: 0.99,
        base_weapon_level: 30,
        base_weapon_evidence_kind: "visible_classic_weapon_level",
        base_weapon_confidence: 0.99,
        base_weapon_visible_text: "Lv.30",
        specializations: {
          attack: {
            level: 0, node_evidence: "same_node", node_confidence: 0.99,
            level_visible_text: "Lv.0", locked: false, lock_evidence: "same_node",
            lock_confidence: 0.99, lock_visible_text: "active",
            current_bonus_all_heroes: 0, current_bonus_all_heroes_evidence: "same_node_current_bonus",
            current_bonus_all_heroes_confidence: 0.99,
            next_bonus_all_heroes: 4, next_bonus_all_heroes_evidence: "same_node_next_bonus",
            next_bonus_all_heroes_confidence: 0.99,
            current_bonus_this_hero: 0, current_bonus_this_hero_evidence: "same_node_current_bonus",
            current_bonus_this_hero_confidence: 0.99,
            fragments_owned: 29, fragments_required: 10, fragments_evidence: "same_node_fragments",
            fragments_confidence: 0.99, fragments_visible_text: "29/10",
            milestone_bonuses_this_hero: [{ level: 50, bonus: 1750, evidence_kind: "same_node_milestone", confidence: 0.99 }]
          },
          hp: {
            level: 0, node_evidence: "same_node", node_confidence: 0.99,
            locked: true, lock_evidence: "same_node", lock_confidence: 0.99
          },
          defense: {
            level: 0, node_evidence: "same_node", node_confidence: 0.99,
            locked: true, lock_evidence: "same_node", lock_confidence: 0.99
          }
        }
      }]
    }
  };
}

test("exclusive scan sanitizer stores the observed DVA nodes separately from classic weapon level", () => {
  const result = sanitize(dvaScan(), now, "exclusive");
  const dva = result.late_game_progression.heroes.DVA;
  assert.equal(result.exclusive_weapons[0].level, 30);
  assert.equal(dva.base_weapon_level, 30);
  assert.equal(dva.specializations.attack.level, 0);
  assert.equal(dva.specializations.attack.locked, false);
  assert.equal(dva.specializations.attack.current_bonus_all_heroes, 0);
  assert.equal(dva.specializations.attack.next_bonus_all_heroes, 4);
  assert.equal(dva.specializations.attack.fragments_owned, 29);
  assert.equal(dva.specializations.attack.fragments_required, 10);
  assert.deepEqual(dva.specializations.attack.milestone_bonuses_this_hero, [{ level: 50, bonus: 1750 }]);
  assert.equal(dva.specializations.hp.level, 0);
  assert.equal(dva.specializations.hp.locked, true);
  assert.equal(dva.specializations.defense.locked, true);
  assert.equal("power" in dva, false);
  assert.equal(result.late_game_progression.context.hq_level, null);
});

test("unreadable or weak evidence stays unknown; power, fragments, and preview text are not levels", () => {
  const low = sanitizeLateGameScan({
    late_game_progression: {
      heroes: [{
        hero_name: "DVA", hero_evidence: "visible_weapon_header", hero_confidence: 0.99,
        base_weapon_level: 31, base_weapon_evidence_kind: "visible_classic_weapon_level", base_weapon_confidence: 0.99,
        specializations: {
          attack: { level: 0, node_evidence: "same_node", node_confidence: 0.5 },
          hp: { level: 29, node_evidence: "same_node", node_confidence: 0.99, locked: true, lock_evidence: "same_node", lock_confidence: 0.99 },
          defense: { level: 0, node_evidence: "nearby_number", node_confidence: 0.99 }
        }
      }]
    }
  }, now);
  assert.equal(low.heroes.DVA.base_weapon_level, null);
  assert.equal(low.heroes.DVA.specializations.attack.level, null);
  assert.equal(low.heroes.DVA.specializations.defense.level, null);
  assert.equal(low.heroes.DVA.specializations.hp.level, 29);
  assert.equal(low.heroes.DVA.specializations.hp.locked, true);
  const wrongHero = sanitizeLateGameScan({ late_game_progression: { heroes: [{ hero_name: "Unknown", hero_evidence: "visible_weapon_header", hero_confidence: 1, specializations: { attack: { level: 31, node_evidence: "same_node", node_confidence: 1 } } }] } }, now);
  assert.deepEqual(wrongHero.heroes, {});
});

test("scan review carries the progression root for explicit human confirmation", () => {
  const result = sanitize(dvaScan(), now, "exclusive");
  const draft = createScanReviewDraft("exclusive", result);
  assert.equal(draft.late_game_progression.heroes.DVA.specializations.attack.level, 0);
  const unconfirmedAdvice = confirmedLateGameProgression(result.late_game_progression);
  assert.deepEqual(unconfirmedAdvice.heroes, {});
  const confirmed = confirmLateGameProgression(result.late_game_progression, now, "scan");
  assert.equal(confirmedLateGameProgression(confirmed).heroes.DVA.specializations.attack.level, 0);
});

test("state normalization, local reload, and same-account cloud merge preserve other data and partial values", () => {
  const scan = sanitize(dvaScan(), now, "exclusive");
  const confirmed = confirmLateGameProgression(scan.late_game_progression, now, "scan");
  const saved = normalizeState({
    player_id: "synthetic-account-A",
    exclusive_weapons: [{ hero_name: "DVA", weapon_name: "Lame de Frappe DVA", level: 30 }],
    late_game_progression: confirmed,
    squads: [{ id: 1, power: 45.6, heroes: [{ name: "Carlie" }] }],
    drone: { level: 100, power_m: 12 },
    technology: { branches: { oil_era: { name: "L’Ère du Pétrole", state: "percent", percent: 0, source: "manual", confirmed_at: now } } }
  });
  const reloaded = normalizeState(JSON.parse(JSON.stringify(saved)));
  assert.equal(reloaded.late_game_progression.heroes.DVA.specializations.attack.level, 0);
  assert.equal(reloaded.late_game_progression.heroes.DVA.specializations.attack.next_bonus_all_heroes, 4);
  assert.equal(reloaded.squads[0].power, 45.6);
  assert.equal(reloaded.drone.level, 100);
  assert.equal(reloaded.technology.branches.oil_era.percent, 0);
  assert.equal(reloaded.exclusive_weapons[0].level, 30);

  const partial = confirmLateGameProgression({
    heroes: { DVA: { specializations: { attack: { next_bonus_all_heroes: 5, evidence: { source: "manual", text: "later capture" } } } } }
  }, future, "manual");
  const merged = mergeNewest(saved, { player_id: "synthetic-account-A", late_game_progression: partial });
  const attack = merged.late_game_progression.heroes.DVA.specializations.attack;
  assert.equal(attack.level, 0);
  assert.equal(attack.current_bonus_all_heroes, 0);
  assert.equal(attack.next_bonus_all_heroes, 5);
  assert.equal(merged.late_game_progression.heroes.DVA.specializations.hp.locked, true);
});

test("different account restore is isolated; Skyler aliases canonicalize without rewriting unrelated fields", () => {
  assert.equal(canonicalExclusiveHeroName("Schuyler"), "Skyler");
  assert.equal(canonicalExclusiveHeroName("Shuyler"), "Skyler");
  assert.equal(canonicalExclusiveHeroName("Skyler"), "Skyler");
  assert.equal(EXCLUSIVE_WEAPON_HERO_NAMES.length, 15);
  const a = normalizeState({ player_id: "account-A", late_game_progression: confirmLateGameProgression({ heroes: { DVA: { base_weapon_level: 30, base_weapon_evidence: { source: "manual" } } } }, now) });
  const bProgress = confirmLateGameProgression({ heroes: { Skyler: { base_weapon_level: 22, base_weapon_evidence: { source: "manual" } } } }, future);
  const b = mergeNewest(a, { player_id: "account-B", late_game_progression: bProgress });
  assert.deepEqual(Object.keys(b.late_game_progression.heroes), ["Skyler"]);
  assert.equal(b.late_game_progression.heroes.Skyler.base_weapon_level, 22);
});

test("all 15 heroes keep Lv.30 classic weapons separate from Lv.0 specialization nodes", () => {
  const heroes = Object.fromEntries(EXCLUSIVE_WEAPON_HERO_NAMES.map(hero_name => [hero_name, {
    hero_evidence: "visible_weapon_header",
    hero_confidence: 0.99,
    base_weapon_level: 30,
    base_weapon_evidence_kind: "visible_classic_weapon_level",
    base_weapon_confidence: 0.99,
    specializations: Object.fromEntries(["attack", "hp", "defense"].map(key => [key, {
      level: 0,
      node_evidence: "same_node",
      node_confidence: 0.99,
      locked: key !== "attack",
      lock_evidence: "same_node",
      lock_confidence: 0.99
    }]))
  }]));
  const result = sanitizeLateGameScan({ late_game_progression: { heroes } }, now);
  assert.deepEqual(Object.keys(result.heroes).sort(), [...EXCLUSIVE_WEAPON_HERO_NAMES].sort());
  for (const hero of EXCLUSIVE_WEAPON_HERO_NAMES) {
    assert.equal(result.heroes[hero].base_weapon_level, 30);
    assert.equal(result.heroes[hero].specializations.attack.level, 0);
    assert.equal(result.heroes[hero].specializations.hp.level, 0);
    assert.equal(result.heroes[hero].specializations.hp.locked, true);
    assert.equal(result.heroes[hero].specializations.defense.locked, true);
  }
});

test("milestone partial scans retain other milestone levels and QG references never become player data", () => {
  const first = confirmLateGameProgression({
    heroes: { DVA: { specializations: { attack: {
      milestone_bonuses_this_hero: [{ level: 50, bonus: 1750 }, { level: 100, bonus: 4000 }]
    } } } }
  }, now, "manual");
  const second = confirmLateGameProgression({
    heroes: { DVA: { specializations: { attack: {
      milestone_bonuses_this_hero: [{ level: 50, bonus: 1800 }]
    } } } }
  }, future, "manual");
  const merged = mergeLateGameProgression(first, second, { sameAccount: true });
  assert.deepEqual(merged.heroes.DVA.specializations.attack.milestone_bonuses_this_hero, [
    { level: 50, bonus: 1800 },
    { level: 100, bonus: 4000 }
  ]);
  const empty = normalizeLateGameProgression({});
  assert.equal(empty.context.hq_level, null);
  assert.equal(empty.context.oil_era.percent, null);
  assert.equal(empty.context.t11.status, "unknown");
  assert.equal(LATE_GAME_REFERENCE.verified_in_game, false);
  assert.equal(LATE_GAME_REFERENCE.player_data, false);
  assert.equal(LATE_GAME_REFERENCE.specialization_max_level, null);
  assert.equal(LATE_GAME_REFERENCE.hq[35].hero_max_level, 175);
});

test("15-hero catalogue and UI/server wiring are present; no migration is needed", async () => {
  assert.equal(EXCLUSIVE_WEAPON_HERO_NAMES.length, 15);
  const [app, scan, advice, css] = await Promise.all([
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../api/scan.js", import.meta.url), "utf8"),
    readFile(new URL("../api/advice.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);
  assert.match(app, /renderExclusiveConfirmation\(rows,progression\)/);
  assert.match(app, /confirmLateGameProgression\(confirmed\.lateGame/);
  assert.match(app, /lateGameManualMarkup\(\)/);
  assert.match(app, /mergeLateGameProgression\(base\.late_game_progression,incoming\.late_game_progression/);
  assert.match(scan, /sanitizeLateGameScan\(extracted,now\)/);
  assert.match(scan, /Classic weapon level is at most 30/);
  assert.match(advice, /confirmedLateGameProgression\(s\.late_game_progression\)/);
  assert.match(css, /\.lateGameManual input/);
  assert.doesNotMatch(scan, /late_game_progression[\s\S]{0,80}power:/);
});
