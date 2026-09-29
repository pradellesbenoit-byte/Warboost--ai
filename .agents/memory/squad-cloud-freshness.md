---
name: Squad cloud freshness
description: Evidence rules for reconciling squad compositions across device storage and cloud responses.
---

Treat each stable squad slot as an independent confirmation history. A profile's overall timestamp is not evidence that its squad composition is newer. An explicit swap confirms both destination slots, including an intentionally emptied slot; that empty operation must survive normalization and cannot be filled from an older cloud snapshot.

**Why:** Restores and delayed sync responses can have a newer profile revision while carrying an older squad. A swap between populated and empty slots can otherwise restore the old squad twice. Power observed after a different composition is real data, but cannot be presented as confirmed power for the newly confirmed names.

**How to apply:** When changing restore, manual sync, scan confirmation, normalization, or swapping, compare account ownership and per-slot confirmation evidence first. Preserve newer independent observations with review/pending status when they refer to different compositions. On equal or absent evidence with differing contents, ask for confirmation rather than silently choosing a cloud write.