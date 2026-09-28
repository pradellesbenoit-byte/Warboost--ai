---
name: Current game rule provenance
description: Current Last War update rules are additive, explicitly sourced, and must not be inferred from season numbers alone.
---

Current Last War rules used by WarBoost recommendations must retain an explicit source kind and confidence. Community or user-confirmed observations are not to be labelled official. Account-specific eligibility such as Crystal Event access stays unknown until an explicit account/scan value is present.

**Why:** update facts can be region-dependent or community-sourced, and captured shop balances can go stale; treating either as live or comparing unlike currencies would create misleading recommendations.

**How to apply:** extend the centralized rule set and preserve prior local/cloud fields during merges; never replace a known eligibility or confirmed shop content with `null` from a partial scan. Keep shop references dated and server/update-caveated. Use a captured wallet balance for ranking only when it is at most 24 hours old, compare prices only within that same currency, and otherwise keep source ordering neutral. Keep purchases inside the game's own store.