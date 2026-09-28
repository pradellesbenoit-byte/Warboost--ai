---
name: Vercel server import compatibility
description: Keep cache busting in browser URLs, not in shared Node/Vercel module imports.
---

Use plain relative ESM specifiers inside modules reachable from `api/*.js`. Keep browser cache-busting query strings on browser entry URLs, and precache any resulting plain module URLs in the service worker.

**Why:** Beta API functions returned `FUNCTION_INVOCATION_FAILED` after query-versioned imports were introduced in shared shop modules, while nearby routes responded normally. Vercel's internal stack trace was unavailable, so this is a strong environment-specific risk pattern rather than a confirmed exception.

**How to apply:** When a Vercel function fails after a shared-module import change, inspect its transitive imports and keep server-side specifiers query-free. Add a route import smoke test; local Node import success alone does not prove Vercel compatibility.