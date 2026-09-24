---
name: Exact roster association reconciliation
description: Durable rule for reconciling WarBoost accounts with the canonical Last War roster.
---

An active WarBoost association requires one exact Last War nickname, server, and alliance match. A mutable grade must not participate in the identity key, so R1–R5 changes preserve the association.

**Why:** Cloud profile data can retain an old nickname or duplicate player/member links. Trusting only player_id causes stale accounts to remain linked and distorts the canonical roster counters.

**How to apply:** Keep every canonical roster row and its history. Deactivate duplicate or stale active links, move a cloud account only to its unique exact canonical row, and expose unmatched accounts as derived pending rows with a blocking reason.