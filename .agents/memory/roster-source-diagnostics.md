---
name: Roster source diagnostics
description: Rules for explaining whether a roster count comes from canonical cloud data or a legacy local import cap.
---

Treat a roster total of 100 as ambiguous until its source is checked. Prefer a read-only canonical-roster diagnostic; identify the legacy local cap only when explicit migration evidence exists, and otherwise report the source as unknown.

**Why:** The historical local migration truncated imported rosters at 100, while the canonical cloud roster can legitimately contain exactly 100 members. Guessing from the count alone can mislead alliance managers.

**How to apply:** Keep the diagnostic read-only, never merge or delete roster rows automatically, and preserve an explicit unknown state when neither source can be proven.