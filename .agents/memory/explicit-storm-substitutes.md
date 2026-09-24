---
name: Explicit storm substitutes
description: Availability states and legacy compatibility rules for Desert and Canyon Storm planning
---

Only Tempête du Désert and Tempête du Canyon may use the explicit `substitute` availability state. VS, Saison, and generic alliance events must normalize that state back to unknown. Desert Storm's R5/R4 picker also stores its selected Participant/Remplaçant assignment separately from post-event attendance, so selecting a player never confirms participation.

**Why:** The product distinguishes confirmed participants from deliberately chosen replacements, while older data had no replacement state and must remain usable without rewriting historical statuses.

**How to apply:** Keep display and plan grouping driven by the same event-scoped availability source. Preserve `uncertain` as a confirmation state and expose `substitute` only in the two storm workflows.