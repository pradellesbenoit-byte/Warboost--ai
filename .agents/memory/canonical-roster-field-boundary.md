---
name: Canonical roster field boundary
description: Security boundary for fields allowed into the shared canonical alliance roster.
---

The shared canonical roster is a gameplay record, not a copy of an imported profile. Persist only an explicit allowlist of identity, rank, lifecycle, activity, and gameplay metric fields; never forward arbitrary input fields such as email or private account metadata.

**Why:** A profile-backed roster import can contain fields that are valid locally but must not be copied into shared alliance data. A broad object spread can leak those fields during bootstrap or CAS merges.

**How to apply:** Keep the allowlist at the canonical roster normalization boundary and test that private fields are excluded while identity, history, activity, and rank data survive additive merges.