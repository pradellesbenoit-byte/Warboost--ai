---
name: Mobile accordion verification
description: Durable verification rule for Samsung/Android-sensitive squad accordion behavior.
---

Accordion behavior that depends on explicit visibility, persisted state, and touch interaction must be verified in a real narrow browser viewport. A DOM-only harness can miss the browser-specific behavior that motivated the replacement.

**Why:** The native details/summary implementation appeared correct in a synthetic DOM check but still failed on Samsung/Android.

**How to apply:** For future accordion changes, exercise close, reopen, collapse-all, hero visibility, and adjacent control isolation at a mobile viewport, then keep a static regression assertion aligned with the current markup.

The native disclosure state can still be defeated by an older global `display:none` rule on the accordion body; audit legacy CSS selectors whenever switching to `details/summary`.

**Why:** Browser-native opening does not override every author stylesheet rule, so a stale body rule can make the native control report open while its content remains invisible.

**How to apply:** Verify both the `open` attribute and the rendered body geometry after each touch, and remove or explicitly scope legacy visibility rules.
