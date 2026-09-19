---
name: Cloud-gated roster controls
description: Authorization and rendering rules for alliance roster mutation controls.
---

Alliance mutation controls must use the same verified cloud authorization predicate for visibility, disabled state, and event handling. A local R4/R5 display role must never make an unverified control appear interactive.

**Why:** A mismatch between local role display and cloud-verified management state made visible mobile checkboxes immediately undo their own changes, which looked like a touch failure.

**How to apply:** Keep mutation authorization server-side. If the authenticated user has exactly one canonical linked roster identity and is confirmed R4/R5 or owner, use the self-only CAS-protected role repair endpoint before enabling the control. Otherwise render the control disabled with a clear explanation.