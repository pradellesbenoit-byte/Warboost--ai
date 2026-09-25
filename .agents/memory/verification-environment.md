---
name: Verification environment
description: Environment assumptions for local previews, beta checks, and deployment verification.
---

The full legacy beta verification suite must run with Supabase URL and service-role variables removed from the test process when it asserts the unconfigured invite-registry state.

**Why:** Replit injects the workspace Supabase secrets, so `betaConfig()` correctly reports a configured registry even when no invite registry is intended for a local verification run.

**How to apply:** Unset the Supabase variables only for that local test command; never alter the workspace secrets or production database.

The anonymous browser preview also masks private Player data and clears `#squadList`; interactive squad tests therefore need an authenticated beta session or a temporary test-only render fixture.

**Why:** A blank squad list in preview is the privacy boundary, not evidence that squad rendering or accordion handlers failed.

**How to apply:** Distinguish access masking from UI behavior before diagnosing squad DOM interactions; use a controlled fixture only for local interaction verification.

The public beta hostname may be served outside the current Replit deployment. Workspace changes and a clean local preview do not prove that beta.warboost.fr has been updated.

**Why:** The current workspace can report no associated Replit deployment while the public beta continues serving an earlier release.

**How to apply:** Treat workspace and public beta as separate until verified; after the actual hosting path is updated, confirm the public health endpoint reports the intended build before saying phones will receive it.