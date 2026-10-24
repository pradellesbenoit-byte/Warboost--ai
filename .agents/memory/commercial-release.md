---
name: Commercial release boundaries
description: Owner-confirmed target and separation rules for upgrading the existing commercial application.
---

The owner identifies existing Vercel project `warboost_v4`, domain `warboost.fr`,
as the commercial application to upgrade. Keep `beta.warboost.fr` as the test
application and never modify `demo-lastwar-presentation`. Do not create another
application as a substitute.

**Why:** The owner explicitly requested upgrading the existing product without
losing accounts or replacing it imprudently. Separate domains do not prove
separate Supabase projects.

**How to apply:** Obtain deployment metadata and a validated code/data rollback
before promotion. Local test results do not authorize push, merge, deployment,
LIVE billing or real paid scans; final version approval is separate.
