---
name: Read-only Git checks
description: Avoid incidental index writes when inspecting a modified worktree in the guarded Replit environment.
---

Git diff checks against a modified worktree can refresh the Git index and hit the workspace guard even though the requested operation only inspects files.

**Why:** Presentation-restoration verification hit the `.git/index.lock` guard; disabling optional locks alone did not prevent the diff refresh.

**How to apply:** Use `git -c diff.autoRefreshIndex=false diff ...` for inspection and whitespace checks, and `git --no-optional-locks status ...` for status. Do not bypass the guard or rewrite history to perform these checks.
