---
name: Equipment reading policy
description: Keep current equipment observations separate from preserved confirmed values.
---

Read equipment only from visible pieces belonging to the current hero in the current capture. Never fill a detection from another hero or an old scan. A partially readable set remains partial; ambiguous color does not establish rarity.

**Why:** The user explicitly requires equipment recognition without invention, while retaining already confirmed data.

**How to apply:** Keep piece positions and capture/hero context intact, including unreadable gaps. Do not confuse hero, skill or exclusive-weapon levels with equipment levels. Preserving confirmed values during final review is not evidence that those values were newly detected. Legacy grouped equipment with differing values cannot establish individual piece positions.

An unknown equipment level is not level zero. A historical parser accepting a readable-looking string is not proof that it preserves partial readings correctly.

**Why:** Comparing a historical parser on synthetic partial-level input exposed conversion of an unreadable position to zero and loss of subsequent levels. Full-readable examples alone did not reveal this.

**How to apply:** Before any selective scan restoration, validate unreadable gaps, genuine zeros and piece associations, not just complete equipment lists. Require evidence for the intended capture type before identifying a historical version as working.

Reproduce scans with the frontend's image encoding and inspect the subtype/refinement path, not just the original stored image or the provider's confidence.

**Why:** A real Tank PNG entered details refinement, while its JPEG reproduction was classified as an overview and skipped equipment refinement. Provider scores remained high despite wrong identity proposals.

**How to apply:** Check explicit layout evidence before choosing a crop geometry. Same-source agreement cannot establish independent accuracy. Keep contradictory identities unresolved; do not undo confidence or provenance protections to improve apparent completion.
