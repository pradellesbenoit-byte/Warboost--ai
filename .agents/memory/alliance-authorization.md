---
name: Unified alliance authorization
description: Durable authorization rule for canonical roster writes, rank management, diagnostics, and authenticated state hydration.
---

Canonical roster writes must use one server-side authorization decision. A user is authorized only when the authenticated account is the alliance owner, has a canonical R4/R5 membership in the target alliance, or has a uniquely linked canonical roster row with R4/R5 while also holding membership in that same alliance.

**Why:** Requiring both an exact match in the imported roster and an up-to-date membership role rejected legitimate managers when a scan omitted the manager or when membership role repair lagged. Trusting browser state would allow self-promotion.

**How to apply:** Resolve authorization from authenticated user ID, alliance owner ID, canonical membership alliance ID/role, and linked canonical identity. Use the same decision for roster sync, rank management, diagnostics, and state hydration. Treat imported roster contents as data to write, not as proof of the actor's authority.