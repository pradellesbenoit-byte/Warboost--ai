---
name: Canonical roster presence evidence
description: How current canonical roster snapshots must interact with lifecycle blockers and selection persistence.
---

Canonical roster presence may defeat a review or departure blocker only when it is newer and scoped to the exact server/alliance. A removal tombstone stays authoritative until later joined/returned/canonical-presence evidence or a complete explicit roster proves re-entry; `rejoined_at` and generic `updated_at` are not evidence by themselves. Legacy `former` rows are accepted as input and archived as tombstones, not emitted as canonical membership. Tombstones retain membership/activity history, while a rejoined membership starts without the old account binding or history.

**Why:** Stale cloud timestamps and legacy `former` rows can otherwise resurrect a departure or transfer the old account identity and activity into a new membership.

**How to apply:** Compare exact-scope presence against explicit departure timestamps; require a later membership proof or complete roster to rejoin; archive old history in the tombstone; never use generic profile updates or `rejoined_at` alone to unlock it. Keep `former` compatibility input-only.