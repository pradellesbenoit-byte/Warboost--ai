---
name: Private test captures
description: Publication boundary for private player screenshots and local recovery backups.
---

Private player screenshots must not be included in commits prepared for GitHub.
Use synthetic images for committed geometry/transport tests and label mocked
recognition explicitly. Keep historical real-test findings without distributing
the private inputs.

**Why:** The user required removal of private screenshots and their metadata
from the entire unpushed history, not just the final working tree.

**How to apply:** Check all newly reachable Git objects before publication.
If private inputs are already in unpushed commits, create an excluded local
recovery bundle first and rewrite only the unpublished branch range. Preserve
the remote base and other branches. Local recovery bundles may contain the old
private inputs: never push backup refs, upload bundles or deploy their directory.
