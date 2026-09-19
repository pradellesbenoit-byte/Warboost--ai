---
name: Verification environment
description: Environment assumptions behind the legacy beta verification suite.
---

The full legacy beta verification suite must run with Supabase URL and service-role variables removed from the test process when it asserts the unconfigured invite-registry state.

**Why:** Replit injects the workspace Supabase secrets, so `betaConfig()` correctly reports a configured registry even when no invite registry is intended for a local verification run.

**How to apply:** Unset the Supabase variables only for that local test command; never alter the workspace secrets or production database.