---
name: Exact roster association reconciliation
description: Durable rule for reconciling WarBoost accounts with the canonical Last War roster.
---

Creating or moving an active WarBoost association requires one exact Last War nickname, server, and alliance match. A mutable grade must not participate in the identity key, so R1–R5 changes preserve the association. If an incoming cloud row has a player ID already attached to an established canonical row but its nickname is stale, preserve that existing link and suppress the duplicate pending row; do not move or rewrite the canonical identity from the stale row.

**Why:** Cloud profile data can retain an old nickname or duplicate player/member links. Exact identity is still required to create or move a link, but an already-established player ID must not be deactivated and shown as pending solely because an older cloud nickname differs; that would undo the canonical association and resurrect a false pending row.

**How to apply:** Keep every canonical roster row and its history. Deactivate genuine duplicate links, move a cloud account only to its unique exact canonical row, preserve an existing established link when the same player ID arrives under an old name, and expose unmatched accounts as derived pending rows with a blocking reason. A missing ID plus a different nickname stays pending unless an explicitly verified alias exists.