---
name: Canonical nickname changes
description: Identity and atomicity decisions for mutable Last War nicknames.
---

Renaming is a mutation of the existing member, never a re-keying or account transfer.
Persist the authoritative name and audit together in the canonical roster; project
that name onto current views instead of independently rewriting every private profile.
Keep historical snapshots and opaque event selection keys.

**Why:** The user requires preservation of identity, associations and history.
The existing roster revision check can atomically protect the rename and audit;
independent profile writes would introduce partial cross-account updates.

**How to apply:** Canonical name evidence must outrank generic profile timestamps
on sync and restore. Client-supplied rename evidence must not authorize canonical
name changes. An old nickname is not enough to move an established account:
require its existing stable member/account identity and exact scope, and reject
competing account IDs or orphan keys rather than automatically merging them.