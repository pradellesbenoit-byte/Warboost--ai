---
name: Behavior-oriented UI checks
description: Durable guidance for maintaining static checks around dynamic roster rendering.
---

When a UI list is intentionally reordered or grouped, verification should assert the behavior-producing helper and its inputs rather than an exact implementation string such as a particular filter expression.

**Why:** A legitimate presentation change from roster-order filtering to stable grouping can break a syntax-shaped assertion even when the requested behavior is correct.

**How to apply:** Prefer assertions that identify the ordering/grouping contract, and reserve exact-string checks for security or persistence boundaries where the implementation form itself is meaningful.

Reactive roster tests must exercise the real status writer and subsequent recalculation, not only the renderer or the pure strategy engine.

**Why:** discarding a stored plan on an availability change can silently lose the withdrawal baseline, even while independent engine and rendering tests pass.

**How to apply:** use the real domain helpers in a complete test scope, with a consistent clock and event instance. Check withdrawal, recalculation and confirmation of the replacement as one stateful sequence.