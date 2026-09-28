---
name: OCR review boundary
description: Why actionable Vision results require explicit review before merging into saved player state.
---

Treat an OCR response as a proposal, not a saved fact. Any value that can affect advice must be reviewed and correctable before it replaces confirmed state; missing or unreadable fields must leave prior confirmed values intact. A pending review belongs to the account and capture that produced it, so late responses cannot attach to a different image or session.

**Why:** The provider could mark a result as requiring confirmation while the browser still merged it immediately. Partial and asynchronous results then risked replacing reliable values or being reviewed against a different visible capture.

**How to apply:** For new scan types, define the exact actionable fields that can be staged, show their origin and scan time without implying the screenshot itself is recent, and commit only fields the user has reviewed. Keep permission-sensitive alliance roles under server-side verification; a screenshot or local edit is not proof of R4/R5 authority.

Any human-readable OCR editor that hides an internal encoding must round-trip an untouched value without dropping supported details. Do not blank unrelated OCR text merely because it resembles that encoding.

**Why:** A readable equipment editor can silently lose a second rarity, and a broad "technical text" filter can erase a shop description when the player confirms the form unchanged.

**How to apply:** Test untouched and corrected submissions separately for multi-valued fields, plus OCR text that resembles an internal key. A live language change must retranslate the review without resetting its inputs or replacing its current scan status.