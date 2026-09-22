---
name: Current game rule provenance
description: Current Last War update rules are additive, explicitly sourced, and must not be inferred from season numbers alone.
---

Current Last War rules used by WarBoost recommendations must retain an explicit source kind and confidence. Community or user-confirmed observations are not to be labelled official. Account-specific eligibility such as Crystal Event access stays unknown until an explicit account/scan value is present.

**Why:** update facts can be region-dependent or community-sourced, while the app must avoid inventing access or silently treating a public guide as official.

**How to apply:** extend the centralized rule set and preserve prior local/cloud fields during merges; never replace a known eligibility or confirmed shop content with `null` from a partial scan.