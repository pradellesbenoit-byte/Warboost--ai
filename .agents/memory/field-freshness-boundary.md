---
name: Field freshness boundary
description: Keep generic profile and state timestamps from overriding field-level confirmation evidence.
---

Use the source and timestamp attached to each changed field as the primary merge evidence. A confirmed manual or scan value outranks a generic profile write; when provenance is equal, compare that field's own timestamp. Missing, empty, unreadable, or otherwise uncertain values must not replace an existing confirmation.

Do not use a normalized top-level state timestamp as evidence for a field when the source record did not provide its own update time. Normalization may synthesize an envelope timestamp, which does not mean every field was observed at that time. For legacy data without field metadata, use an actual record timestamp only as a fallback.

**Why:** A generated envelope timestamp can make an old or partial record appear newer than explicitly reviewed field data, while a whole-profile timestamp can also hide a newer confirmation on just one field.

**How to apply:** Preserve field provenance through local normalization, cloud hydration, API advice assembly, and restoration. Compare provenance first and field time second; keep account scope in derived-analysis inputs and ignore transport-only timestamps there.

For multi-capture proposals, narrow incoming records to selected scalar fields and their evidence before applying a generic freshness merge. Complete nested-array reconciliation separately.

**Why:** A generic record merge can copy non-selected keys without arbitration, silently replacing a reconciled nested record or reintroducing a low-confidence field that the caller intentionally skipped.

**How to apply:** Treat capture fusion as a bounded proposal, not a confirmed state update. Require owner/capture-bound review; refuse confirmation when the affected facts changed while analysis was in progress.