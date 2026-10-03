---
name: Event web evidence
description: Provider compatibility and corroboration constraints for runtime event research.
---

Not every Responses model accepts domain-filtered web search; the low-cost
gpt-4.1-mini route rejected the filters parameter in the actual provider.

**Why:** the apparently supported generic web-search configuration returned HTTP
400 before any search. Verify provider compatibility when changing model tiers.

**How to apply:** retain domain restrictions with a compatible model, and test
the real provider once rather than assuming a successful mock proves compatibility.

Cross-check actual retrieved event pages, not general combat guides or two links
from one publisher. Retrieved citations can add tracking parameters or a www alias,
while the synthesized recommendation cites the canonical page.

**Why:** literal URL comparisons incorrectly rejected the same evidence; accepting
arbitrary model-written URLs or broad combat pages would instead create false
corroboration for specific objectives.

**How to apply:** normalize page identity conservatively, retain separate publisher
checks and event scope, and explicitly fall back when insufficient evidence survives.

Evaluate asynchronous research against an authoritative response-time clock, not
an earlier health-clock snapshot.

**Why:** otherwise freshly completed research can look future-dated and be silently
rejected despite passing server evidence checks.

**How to apply:** preserve the future-evidence guard and propagate server evaluation
time instead of trusting an uncalibrated device clock or relaxing the guard.