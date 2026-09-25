---
name: GitHub push fallback
description: Durable repository publishing fallback when the local HTTPS remote cannot authenticate.
---

If the local GitHub HTTPS remote rejects credentials but a GitHub integration is attached, publish and verify the exact commit through the authenticated connector instead of requesting or exposing a token.

**Why:** The local remote rejected password authentication while the attached GitHub connection could update the beta branch safely. In this Europe/Paris Replit context, the GitHub commit API stored a raw timestamp two hours earlier than the submitted ISO `Z` time.

**How to apply:** Compare the target ref and parent tree with the local commit. If recreating a commit through the API, verify the resulting tree and raw commit SHA before advancing the branch; do not assume the submitted UTC date was preserved. Update only the requested ref with fast-forward protection, then confirm its SHA.
