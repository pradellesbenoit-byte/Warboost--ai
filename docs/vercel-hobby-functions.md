# Existing commercial Vercel deployment: Hobby compatibility

Target: the existing `warboost_v4` project, not Replit Publish or the beta.

## Change

Vercel CLI 65.2.0 generated **14** functions for the previous commercial
commit `2cde1309e787f1b129f518e2c37735b592a77ef6`, exceeding Hobby's 12.
It generates **12** functions for this correction. These are actual `.func`
directories in `.vercel/output/functions`, not a source-file estimate.

`/api/sync`, `/api/time` and `/api/cron-sync` share the `sync` function.
Six exact rewrites preserve the two relocated endpoints and their slash/`.js`
aliases. Dispatch uses the original request pathname, never a client query
parameter. The original time and cron implementations are unchanged byte for
byte. Cron still requires its own authorization; synchronization still requires
the original authenticated user and permission checks. No catch-all rewrite,
new permission or database fallback is added.

Utilities live outside `api/`; scan and advice remain separate functions.
Their includeFiles configuration is retained. Account, alliance, support,
scan, advice and Stripe handlers retain their methods and guards; Stripe's
request-body behavior is not altered.

## Reproducible local checks

- `node scripts/release/verify-hobby-routing.mjs`
- `node scripts/release/verify-vercel-delivery.mjs`
- `node scripts/release/verify-legacy-preservation.mjs`
- Existing synthetic formation, scan-timeout, hero-reference and knowledge tests
  (the first two require the **dummy** provider key from their npm test commands,
  and mock all provider responses).
- `npm run check`
- Local `vercel build --prod`, followed by
  `node scripts/release/verify-vercel-output.mjs`
- After committing: `node scripts/release/verify-release-history.mjs`

The local Vercel build uses dummy offline project identifiers, no provider
credentials and no `vercel pull`, `link`, `deploy` or project creation. The
artifact verifier checks generated function count, all public route mappings,
static pages and required scan/advice resources. Vercel's `filePathMap` may
reference source files for the packager rather than physically duplicate them
inside each `.func`; those references are checked to remain inside the project
and to exist. Do not transfer only `.func` folders and omit these sources.

Local synthetic checks are not real Vision, Stripe, cloud-account or Android
tests. No database migration or commercial payment activation is required.
Only push a fast-forward correction descended from the previous three clean
commercial commits; never push the old beta/private-archive history. Observe
the actual GitHub deployment status and public site after the authorized push;
a local build alone does not establish deployment success.
