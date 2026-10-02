---
name: Compact event organization
description: User-facing Alliance event plans must stay operational; evidence remains internal.
---

The user wants the Alliance R5/R4 event screen strongly simplified: no “Stratégie proposée”, detailed proposed-strategy accordion, “Ordres à copier” or “Règles et sources” blocks. Show starters with roles, reserves with roles/priorities/coverage targets/conditional entry instructions, one very short Plan B and recalculation instead.

**Why:** the user found the previous analytical blocks useless and too crowded on mobile.

**How to apply:** keep provenance/freshness safeguards in the engine but do not reintroduce their technical display on this screen. Reserves need concrete useful roles; insufficient data calls for “Réserve mobile” or “Renfort polyvalent” with “données limitées”, never “Rôle à confirmer” or an invented specialization.

Unit type may guide organizational mission preferences, not certify combat superiority or official multipliers. “Best plan” means balancing essential coverage with confirmed evidence, not guaranteeing a win.

**Why:** the user wants useful assignments without inventing weaknesses from missing data; current official combat/substitution evidence is incomplete.

**How to apply:** spread confirmed strength across essential roles, match replacements jointly, and keep entry conditional on an available slot. Do not promise automatic joining or a verified Canyon substitution procedure.

For WarBoost work, use only the real `public-beta-safe-launch` branch. Never touch `demo-lastwar-presentation`; do not push or publish automatically.

**Why:** the user repeated these project-specific restrictions.

**How to apply:** verify the actual branch and working tree before edits; finish with a local commit unless the user explicitly requests otherwise.

Each availability edit must capture the current live lineup and only unresolved
vacancies, even when a stored plan already exists.

**Why:** a saved empty plan can suppress an unsaved lineup, and an old resolved
vacancy can otherwise reappear when an accepted replacement later withdraws.

**How to apply:** do not freeze the baseline after the first edit or let historical
absence evidence override the current full lineup. Apply the same rule to both the
compact plan controls and the dedicated availability manager.