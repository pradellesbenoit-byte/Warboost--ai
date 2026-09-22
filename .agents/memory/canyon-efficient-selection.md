---
name: Canyon efficient selection
description: Deterministic Canyon participant proposals using confirmed availability and evidence without opaque user-facing scores.
---

The Canyon proposal must use explicit presence first, retain uncertain availability as a lower-priority confirmation queue, exclude explicit absences from starters, and use confirmed power/activity only as tie-break evidence. It may preserve an eligible Judicator and at least one eligible R5/R4 coordinator without giving rank an automatic power advantage. The proposal remains separate from final R4/R5 validation and manual adjustments.

**Why:** roster data is partial and a missing power or participation record must never be interpreted as weakness or inactivity; the coordinator needs a fast starting point without losing decision authority.

**How to apply:** keep the selection ordering deterministic and explainable, expose human-readable reasons and missing-data indicators rather than scores, cap at 20 starters and 10 substitutes without duplicates, and persist only after explicit application.