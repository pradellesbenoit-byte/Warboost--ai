---
name: Alliance rank provenance
description: Confirmed manual rank changes and explicit Last War R4/R5 scans must merge by timestamp and source priority.
---

Manual R5/R4 rank-management changes are the strongest rank evidence. An explicit Last War R4/R5 scan is valid evidence only for the visible moment and can supersede an older manual state when its confirmation timestamp is newer. Missing or unreadable rank is unknown and must not become an inferred R1/R2/R3.

**Why:** Last War allows an R4 to become R3/R2/R1, while a later scan can show a subsequent promotion; treating scans as permanent or missing ranks as R1 causes stale permissions and incorrect roster grades.

**How to apply:** Preserve `rank_confirmed_at` and the source through canonical, lifecycle, local, and cloud merges. Keep manager authorization tied to the canonical current role, not to a browser-declared role or an unconfirmed scan.