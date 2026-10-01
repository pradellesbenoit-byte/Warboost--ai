---
name: Confirmed player HQ provenance
description: Field-level evidence rules for the player's headquarters level across local, cloud, and account restore.
---

Treat the player's HQ level as account-owned profile data, separate from the HQ value on an alliance roster row. Its confirmation source and timestamp must travel with the level and must arbitrate independently of the profile's general `updated_at`.

Ambiguous legacy values must not lower a confirmed HQ. Two legacy values without field provenance merge upward; scans cannot confirm a decrease; an explicit manual profile confirmation may correct the value in either direction and must persist as a newer field confirmation.

**Why:** Profile-level timestamps describe unrelated changes too, and cloud compare-and-swap only protects the whole profile revision. Using either as HQ evidence can resurrect a stale lower level after restore or retry.

**How to apply:** Route new player-HQ scan, edit, normalization, restore, conflict, and server-save paths through the same field-evidence rules. Keep account ownership checks in place and do not reuse alliance-roster HQ values.