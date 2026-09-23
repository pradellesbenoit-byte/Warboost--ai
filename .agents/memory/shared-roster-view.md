---
name: Shared roster view
description: Alliance screens must hydrate from the canonical cloud roster before applying local player enrichment.
---

When an authenticated alliance member opens the R4/R5 space, the canonical alliance roster is the display source. Local profile roster rows may enrich matching canonical members but may never replace, truncate, or delete shared rows.

**Why:** A newly connected R4/R5 can have an empty personal alliance state while the alliance already has a complete roster, which otherwise appears as “Membres 0” and prevents identity proof.

**How to apply:** Fetch the shared roster through an authenticated membership-scoped endpoint, merge only exact identity matches, preserve unlinked members, and use CAS-protected self-linking for a unique pseudo + server + alliance match.

For a linked account, the canonical roster nickname is the only display authority across the profile, identity-pending panel, badges, search results, and rank management; stale local OCR aliases must not reappear or keep the account pending.

**Why:** A successful cloud identity link can coexist briefly with an older local profile or pending alias, especially after OCR correction. Rendering either value makes one player appear twice and undermines rank-management trust.

**How to apply:** Resolve the current user's linked canonical row by `player_id`, hydrate the local display name from that row, and filter only the matching stale pending alias. Keep roster participation data and detailed player history unchanged.