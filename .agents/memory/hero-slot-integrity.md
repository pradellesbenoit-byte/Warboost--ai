---
name: Persistent hero slot integrity
description: Confirmed squad compositions must survive partial scans, merges, rerenders, and duplicate repair without positional attribute transfer.
---

Persist each squad's confirmed five-name composition separately from the latest scan payload. Normalize every squad to five materialized slots and resolve attributes by canonical hero identity, not by slot movement. Partial or unreadable scans may update known fields but cannot erase a confirmed name. Duplicate repair must preserve both occurrences and mark the squad for verification instead of clearing a slot.

**Why:** Sparse OCR and cloud/local positional merges can shift heroes or erase slot 1; destructive duplicate cleanup loses the only trusted identity and its attributes.

**How to apply:** Any new scan, hydration, merge, backfill, render, or confirmation path must keep the confirmed composition authoritative until the player explicitly confirms a replacement.