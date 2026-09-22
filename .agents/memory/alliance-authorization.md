---
name: Unified alliance authorization
description: Durable authorization rule for canonical roster writes, rank management, diagnostics, and authenticated state hydration.
---

Canonical roster writes must use one server-side authorization decision. A user is authorized only when the authenticated account is the alliance owner or has a uniquely linked canonical roster row with canonical R4/R5 in the target alliance and a matching canonical membership.

**Why:** A membership role or a browser-declared role alone cannot prove that the account owns the exact Last War identity; the canonical link and membership must agree after server-side repair.

**How to apply:** Resolve authorization from authenticated user ID, alliance owner ID, canonical membership alliance ID/role, and linked canonical identity. Use the same decision for roster sync, rank management, diagnostics, and state hydration. Treat imported roster contents as data to write, not as proof of the actor's authority.