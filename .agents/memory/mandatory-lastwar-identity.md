---
name: Mandatory Last War identity
description: Beta identity onboarding scope, authoritative identity preservation and packaging decisions.
---

Accounts must complete a Last War nickname and server before ordinary personal app access; alliance is optional under the [code-free FREE policy](code-free-access-policy.md). Existing complete profiles must never be interrupted; partial profiles retain their existing information. Keep consent and verified R4/R5 authorization independent of FREE access.

**Why:** The user wants scans associated with the correct player, but explicitly superseded alliance-required/private-beta onboarding with autonomous FREE access for players without an alliance.

**How to apply:** Resume the required screen until the identity is saved. Do not use a dismissible or device-wide “already onboarded” flag, disconnect the player, create a replacement profile, or automatically merge accounts. Check all supported languages and an unsupported-language fallback.

Confirmed canonical alliance identity wins incompatible form values, with an explicit explanation. Save only the authenticated account, and ignore responses from an earlier account after a session change.

**Why:** The user explicitly requires preservation of authoritative associations and isolation between accounts; a nickname alone must never transfer an account.

**How to apply:** Continue using the existing membership and canonical-link rules rather than treating form input as alliance authority. Check competing identities before saving and protect the profile revision throughout validation.

Identity completion must not re-run the generic gameplay merge or treat a normalized, unconfirmed R1 placeholder as rank evidence.

**Why:** The mobile check exposed a saved R3 declaration becoming local R1 when the partial profile lacked field-level timestamps. Defaults are not confirmed observations.

**How to apply:** Apply the identity change separately from gameplay state. Preserve canonical/confirmed ranks; restoring an existing private grade must never grant cloud verification or management permissions.

Keep the onboarding action within the existing state endpoint rather than adding a deployment function.

**Why:** The project has an established twelve-endpoint packaging contract; adding a thirteenth broke its compatibility verification.

**How to apply:** Preserve that contract for small authenticated profile actions unless deployment architecture is explicitly changed.