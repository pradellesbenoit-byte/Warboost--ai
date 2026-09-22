---
name: Confirmed hero power
description: Durable rules for parsing, merging, displaying, and syncing hero and squad power values.
---

Hero power values can arrive as raw numbers or localized unit strings such as `5,65 M`. Normalize them through one parser before merging or displaying. Positive values are confirmed; zero, empty, and malformed values are unknown in the current data model.

**Why:** Partial scans and mixed provider formats previously allowed `0` or stale totals to overwrite confirmed values, which made squad cards show false `0 M` powers.

**How to apply:** Keep positive confirmed hero values during merges and use canonical hero profiles or the already-confirmed exclusive-weapon power as fallbacks when a slot is empty or zero. An explicit confirmed exclusive scan is authoritative for that hero's power field, even if an older generated timestamp exists. Remote empty/zero copies must not replace a positive local value. Render the selected value once in the right-hand power column, not again in the descriptive line. Do not derive squad totals by summing heroes. If a partial scan does not confirm the squad total, preserve the previous total separately as history, clear the current total, and mark it pending until a later scan confirms it.