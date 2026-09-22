---
name: OCR power confirmation
description: Durable handling rule for exclusive-weapon OCR values that are formatted, ambiguous, or unreadable.
---

Visible OCR power must be staged before persistence. Formatted numeric text may be normalized, but text that cannot be parsed must remain available for manual correction and must never be treated as a confirmed power.

**Why:** Vision output can use alternate field names or return a visible value with punctuation and formatting that does not safely parse. Dropping it makes the user rescan indefinitely; accepting it as numeric can corrupt hero power.

**How to apply:** Keep raw text only for non-parsable values, show an explicit verification state, block confirmed-save messaging until correction, and propagate only positive parsed values to hero profiles and squad slots.