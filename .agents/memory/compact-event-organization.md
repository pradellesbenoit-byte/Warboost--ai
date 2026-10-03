---
name: Compact event organization
description: User-facing Alliance event plans must stay operational; evidence remains internal.
---

The user wants the Alliance R5/R4 event screen strongly simplified: no “Stratégie proposée”, detailed proposed-strategy accordion, “Ordres à copier” or “Règles et sources” blocks. Show simple starters, separate reserves with one precise task and replacement priority, one optional very short Plan B and recalculation.

**Why:** the user found the previous analytical blocks useless and too crowded on mobile.

**How to apply:** keep provenance/freshness safeguards internal. Do not add artificial roles or repeated presence badges to starters. Never fill lists with “Renfort polyvalent”. Reserves need an event/need-specific task; if information is insufficient, use a prudent named-player cover or “rôle à définir selon le plan”, without invented specialization.

The user explicitly requested that WarBoost itself research internet strategies, not just have its developer research once. Keep verification dates, cross-check event-specific sources and distinguish official rules, game observations and community advice; do not display source blocks.

**Why:** the user repeated: “Je t'ai demandé juste d'intégrer les remplaçants de leur donner une tâche et de faire en sorte que l'IA cherche sur internet, les meilleures stratégies des plans de guerre”.

**How to apply:** preserve actual server-side web research with cautious cached/dated fallback. Never claim live game data without an official API or let external advice fabricate opponents, faction, timers or current objective ownership.

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