---
name: Drone OCR power evidence
description: Why Drone power needs visible raw units and screen-specific evidence before updating confirmed state.
---

Do not treat a provider's decimal `power_m` as proof of a visible Drone power. Require the exact displayed power text, a clear association with the Drone, and reliable evidence before proposing a replacement. Keep raw whole units in the review and canonical millions in saved state; an omitted or ambiguous value must not erase a confirmed power.

**Why:** A Boost de Combat screenshot can show a boost level beside another statistic. Reading that statistic as Drone power produced a plausible-looking decimal at the wrong scale, while treating its level as the general Drone level conflated two different upgrades.

**How to apply:** Classify the screenshot before mapping levels, keep Boost and general Drone levels independent, and test raw whole-unit parsing, uncertain evidence, manual review, and preservation through state normalization whenever Drone scan behavior changes.