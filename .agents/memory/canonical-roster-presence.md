---
name: Canonical roster presence evidence
description: How current canonical roster snapshots must interact with lifecycle blockers and selection persistence.
---

An explicit member in the current canonical roster is positive membership evidence. A review or former-members entry may exclude it only when its explicit departure/absence evidence is strictly newer than the canonical presence evidence.

**Why:** Lifecycle history is intentionally retained, but stale blockers previously hid canonical members and caused selection keys to be removed during rerenders.

**How to apply:** Carry the canonical snapshot timestamp through server and client normalization, compare it against `left_at`/`missing_from_snapshot_at`, and preserve canonical-first key aliases for cumulative selections.