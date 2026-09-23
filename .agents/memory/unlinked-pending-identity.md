---
name: Canonical pending identity
description: Rules for removing stale WarBoost association candidates after canonical roster linking.
---

Pending WarBoost association rows are a derived view, not an identity source. A canonical roster row with `warboost_linked=true` and the same `player_id` removes the pending row even when an older local row has stale server/alliance scope. Legacy rows without `player_id` may be removed for the current account when its canonical link and exact identity scope are established; ambiguous rows remain.

**Why:** `player_id` is the canonical account identity; allowing stale local scope to preserve that ID kept already-linked accounts visible after cloud hydration. Name-only cleanup still requires scope to avoid removing a valid account from another server or alliance.

**How to apply:** Normalize pending rows during server normalization, cloud hydration, state merges, local-storage migration, and rendering. Preserve `player_id` in future pending rows and display the canonical roster name for a linked current account.