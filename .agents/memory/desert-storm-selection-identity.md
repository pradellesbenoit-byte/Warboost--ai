---
name: Desert Storm selection identity
description: Stable selection keys and non-destructive rerender behavior for the cumulative Desert Storm picker.
---

Desert Storm selections should be stored under the canonical roster key, while accepting the lifecycle key as a migration alias. Rerenders and filtered views must preserve unknown selections; only known inactive roster entries may be removed.

**Why:** A filtered picker does not contain the complete selection set, and deriving a different key during a rerender can silently erase players selected before a search or roster refresh.

**How to apply:** Normalize aliases against the full active roster before rendering, toggle only the touched key from the complete set, and let plan generation resolve both canonical and legacy aliases with per-member deduplication.