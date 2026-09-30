---
name: Release contract verification
description: Keep release checks tied to the actual version users receive, not historical markers.
---

Release verification should compare the package version with the health API version, structured release and matching build slug; parse the actual HTML `<title>` element; and require a versioned service-worker cache. Localized visible taglines should contain the same current version label. Avoid accepted-version lists and source-wide text searches that can match legacy comments.

**Why:** During a release update, older HF verifiers contained pinned build and tagline values. Broad source matching could be satisfied by retained historical markers even while the visible release label had moved, and an earlier test passing did not prove later gates were current.

**How to apply:** Reuse the shared release-contract assertion in historical release gates, and run the full verification chain before release changes are considered ready.