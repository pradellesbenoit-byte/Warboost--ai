---
name: Mobile accordion verification
description: Durable verification rule for Samsung/Android-sensitive squad accordion behavior.
---

Accordion behavior that depends on explicit visibility, persisted state, and touch interaction must be verified in a real narrow browser viewport. A DOM-only harness can miss the browser-specific behavior that motivated the replacement.

**Why:** The native details/summary implementation appeared correct in a synthetic DOM check but still failed on Samsung/Android.

**How to apply:** For future accordion changes, exercise close, reopen, collapse-all, hero visibility, and adjacent control isolation at a mobile viewport, then keep a static regression assertion aligned with the current markup.
