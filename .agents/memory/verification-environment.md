---
name: Verification environment
description: Environment assumptions behind the legacy beta verification suite.
---

The full legacy beta verification suite must run with Supabase URL and service-role variables removed from the test process when it asserts the unconfigured invite-registry state.

**Why:** Replit injects the workspace Supabase secrets, so `betaConfig()` correctly reports a configured registry even when no invite registry is intended for a local verification run.

**How to apply:** Unset the Supabase variables only for that local test command; never alter the workspace secrets or production database.

The anonymous browser preview also masks private Player data and clears `#squadList`; interactive squad tests therefore need an authenticated beta session or a temporary test-only render fixture.

**Why:** A blank squad list in preview is the privacy boundary, not evidence that squad rendering or accordion handlers failed.

**How to apply:** Distinguish access masking from UI behavior before diagnosing squad DOM interactions; use a controlled fixture only for local interaction verification.