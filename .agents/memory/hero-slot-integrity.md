---
name: Persistent hero slot integrity
description: Confirmed squad compositions must survive partial scans, merges, rerenders, and duplicate repair without positional attribute transfer.
---

Persist each squad's explicitly confirmed five-name composition separately from the latest scan payload. Completeness and timestamps alone are not confirmation proof. Legacy backfills, old profile-slot migrations, uncertain OCR, and the historically inferred “manual confirmation” label must remain unconfirmed history, never current slot identities or Vision hints. Preserve their data for review instead of deleting it. Only a reliable explicit user confirmation, or an explicit relocation of such a confirmation, may make a composition authoritative.

Normalize every squad to five materialized slots and resolve attributes by canonical hero identity, not by slot movement. Partial or unreadable scans may update known fields but cannot erase a genuinely confirmed name. Duplicate repair of genuinely confirmed compositions must preserve both occurrences and mark the squad for verification instead of clearing a slot. Bind compositions and hints to the correct owner and squad identity, not merely an array position.

**Why:** Sparse OCR and cloud/local positional merges can shift heroes or erase slot 1; destructive duplicate cleanup loses the only trusted identity and its attributes. A user reported that inherited names did not match their actual formation; treating complete inherited names as confirmed had allowed a partial scan to preserve and reuse them incorrectly.

**How to apply:** Every scan, hydration, merge, backfill, render, or confirmation path must require explicit provenance before restoring names or supplying Vision hints. Preserve confirmed composition and its provenance together until the player explicitly confirms a replacement. Never promote archived identities because another field or the total power was confirmed.