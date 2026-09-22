---
name: Hybrid event availability
description: Durable rule for synchronizing player declarations with the canonical alliance roster.
---

Player availability belongs to the player profile first, then is copied server-side only to that player's exact linked canonical roster row. The alliance view may aggregate those rows and manager declarations, while keeping source and history separate.

**Why:** The canonical roster must continue to represent members without WarBoost accounts, and a browser must never be able to edit another member's availability by submitting a forged roster.

**How to apply:** Match by canonical identity (player id when linked, otherwise exact nickname + server + alliance only for an already linked row). Keep unknown as “À confirmer”, preserve historical observations, and let a future direct player declaration outrank a manager value without deleting the manager history.