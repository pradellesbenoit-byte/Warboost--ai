---
name: Shared roster view
description: Alliance screens must hydrate from the canonical cloud roster before applying local player enrichment.
---

When an authenticated alliance member opens the R4/R5 space, the canonical alliance roster is the display source. Local profile roster rows may enrich matching canonical members but may never replace, truncate, or delete shared rows.

**Why:** A newly connected R4/R5 can have an empty personal alliance state while the alliance already has a complete roster, which otherwise appears as “Membres 0” and prevents identity proof.

**How to apply:** Fetch the shared roster through an authenticated membership-scoped endpoint, merge only exact identity matches, preserve unlinked members, and use CAS-protected self-linking for a unique pseudo + server + alliance match.