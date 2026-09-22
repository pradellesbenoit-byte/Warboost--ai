---
name: GitHub push fallback
description: Durable repository publishing fallback when the local HTTPS remote cannot authenticate.
---

If the local GitHub HTTPS remote rejects credentials but a GitHub integration is attached, publish and verify the exact commit through the authenticated connector instead of requesting or exposing a token.

**Why:** The local remote rejected password authentication while the attached GitHub connection could confirm and update the beta branch safely.

**How to apply:** Compare the target branch ref with the local commit, use the authenticated GitHub API for the repository operation, preserve the final newline in the commit message when reproducing a local SHA, and verify the resulting SHA plus changed files before reporting success.
