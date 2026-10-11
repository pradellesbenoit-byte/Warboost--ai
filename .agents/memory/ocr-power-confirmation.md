---
name: OCR power boundaries
description: Classify OCR power sources before parsing; exclude the central number on exclusive-weapon screens.
---

Only supported, explicitly labeled OCR power evidence may be staged before persistence. Never interpret the large number below the weapon level on an exclusive-weapon screen as power, even if the provider returns it under `power`, `power_raw`, or another alias. For other supported power sources, formatted numeric text may be normalized, but unreadable text remains unconfirmed.

**Why:** A visually prominent number is not necessarily power. On exclusive-weapon screens this specific number must not be assigned to either the weapon or its hero.

**How to apply:** Classify the screen and numeric region before parsing. Strip exclusive-screen power aliases at the provider prompt, API sanitizer, review form, and save boundary; preserve raw OCR text only for other supported fields that can be corrected safely.