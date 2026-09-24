---
name: Canonical pending identity
description: Rules for removing stale WarBoost association candidates after canonical roster linking.
---

Pending WarBoost association rows are derived exclusively from the current canonical roster, not from local caches, merged snapshots, or profile fallbacks. Replace the complete pending list only when the response proves it came from the canonical cloud roster; when that source is unavailable or conflicted, expose no pending rows until a canonical refresh. A canonical roster row with `warboost_linked=true` and the same `player_id` removes the pending row even when an older local row has stale scope. Legacy rows without `player_id` may be removed for the current account only when its canonical link and exact identity scope are established; ambiguous rows remain. Clear only pending-list fields from local state, backups, and per-account caches, preserving all other player data.

**Why:** `player_id` is the canonical account identity; stale local or snapshot queues can otherwise resurrect already-linked accounts after cloud hydration or service-worker updates. Name-only cleanup still requires exact scope to avoid removing a valid account from another server or alliance.

**How to apply:** Rebuild the full queue from a canonical server response after state restore or synchronization; never synthesize pending rows from profile names or merge derived queues. Invalidate pending fields in every local cache generation, preserve unrelated player state, and display the canonical roster name for a linked current account.