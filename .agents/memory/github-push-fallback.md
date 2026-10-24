---
name: GitHub push fallback
description: Durable repository publishing fallback when the local HTTPS remote cannot authenticate.
---

If the local GitHub HTTPS remote rejects credentials but a GitHub integration is attached, publish and verify the exact commit through the authenticated connector instead of requesting or exposing a token.

**Why:** The local remote rejected password authentication while the attached GitHub connection could update the beta branch safely. In this Europe/Paris Replit context, the GitHub commit API stored a raw timestamp two hours earlier than the submitted ISO `Z` time.

**How to apply:** Compare the target ref and parent tree with the local commit. If recreating a commit through the API, verify the resulting tree and raw commit SHA before advancing the branch; do not assume the submitted UTC date was preserved. Update only the requested ref with fast-forward protection, then confirm its SHA.

The configured HTTPS origin may use `github.replit.internal`. Do not reject or replace that managed origin solely because it is not `github.com`; verify the repository path and authenticated GitHub ref, then prefer a normal authorized fast-forward push.

**Why:** Native Git through that origin successfully delivered the exact local commit, without reconstructing commits through the API or handling a token.

**How to apply:** Validate the exact repository, branch and expected remote SHA before pushing, and verify the result through GitHub afterward. Inspect every Vercel status context: one main push can trigger multiple existing projects, so a successful Git push does not prove either deployment success or site isolation.

Verify a worktree's actual top-level directory before any Git operation; do not trust its directory name or a previous worktree listing.

**Why:** A restored workspace retained private release files and worktree metadata but lost the worktree's `.git` marker. `git -C` silently operated on the parent repository instead of the intended release.

**How to apply:** Require `git -C <worktree> rev-parse --show-toplevel` to equal the intended worktree path. If it differs, preserve the old directory and create a valid separate corrective worktree from the verified release commit rather than editing or pushing through the ambiguous path.
