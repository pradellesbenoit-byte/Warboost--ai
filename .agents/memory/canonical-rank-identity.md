---
name: Canonical rank identity
description: Durable identity rules for changing alliance roster ranks safely across stale client state and canonical cloud rows.
---

Rank-management drafts must carry a canonical member key derived from the canonical roster row returned by the server. Never use a legacy local roster key or a client-supplied player identifier to select the target row.

**Why:** The UI can display a merged or stale local member record while the rank API resolves against the canonical cloud roster. Rebuilding a key independently on each side caused a visible member to produce `member_not_found`.

**How to apply:** Resolve by the canonical key first. If it is absent or obsolete, fall back only to one exact match on normalized nickname, server, and alliance; reject zero or multiple matches. Preserve last-R5 and R4-limit checks after resolution.