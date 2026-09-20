---
name: Exclusive scan confirmation
description: UI and validation rules for exclusive-weapon screenshot analysis.
---

An exclusive-weapon scan is only successful when at least one usable field is extracted. The editable result panel must become visible immediately, and the status must summarize the extracted result rather than showing only generic review instructions. A confirmed positive weapon power must also be merged into the matching canonical hero identity and hero profile; the weapon record alone is not enough for squad hero cards.

**Why:** The previous flow could return the generic “check visible data” message while the result panel was below the current drawer viewport, making a successful staged result look like an empty or silently failed scan.

**How to apply:** Keep OCR rows staged in memory and pending storage only; do not merge them into the saved profile until explicit confirmation. Scroll the panel into view after rendering. Use a clear no-data message for empty extraction and an explicit provider/error message for failed analysis. Partial readable rows remain valid. Only positive confirmed powers update hero power; empty/zero partial values must leave existing power untouched, and an explicit squad total should not be silently recalculated from a hero-level scan.