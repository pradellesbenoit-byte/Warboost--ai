---
name: Cloud-verified alliance rank access
description: Durable authorization rule for alliance rank management and self-role repair.
---

The rank-management UI must fail closed unless the server has verified the authenticated user's cloud membership role. A local R4/R5 value alone is never sufficient. The only recovery path for a stale cloud role is an explicit server-checked self-resynchronization from exactly one canonical roster member linked to that authenticated identity; it must use CAS and may not target or modify another member.

**Why:** A stale or divergent local role can otherwise make the R5-to-R3 workflow appear authorized while the server rejects the roster write, and broad resynchronization could become a privilege-escalation path.

**How to apply:** Keep cloud-role verification and canonical identity proof separate from local roster display data. Preserve server-side R4/R5/owner checks and surface the backend error code rather than replacing it with a generic permission message.