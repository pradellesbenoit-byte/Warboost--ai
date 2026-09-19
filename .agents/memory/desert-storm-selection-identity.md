---
name: Desert Storm selection identity
description: Stable selection keys and non-destructive rerender behavior for the cumulative Desert Storm picker.
---

Desert Storm selections should be stored under the canonical roster key, while accepting the lifecycle key as a migration alias. Registration is unbounded; tactical plan capacity is separate and must never truncate `registered_keys`. Rerenders and filtered views must preserve unknown selections, keep picker row order stable while tapping, and only remove known inactive roster entries.

**Why:** A filtered picker does not contain the complete selection set, and deriving a different key during a rerender, moving selected rows between taps, or applying a storage cap can silently erase players selected before a search, roster refresh, or cloud round trip.

**How to apply:** Normalize aliases against the full active roster before rendering, keep the rendered roster order independent of selection state, toggle only the touched key from the complete set, and let plan generation resolve both canonical and legacy aliases with per-member deduplication.