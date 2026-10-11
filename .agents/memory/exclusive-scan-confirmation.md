---
name: Exclusive scan confirmation
description: UI and validation rules for exclusive-weapon screenshot analysis.
---

An exclusive-weapon screenshot may contribute only its visible hero/weapon identity, weapon level, and labeled bonuses. The large number below the weapon level is not weapon or hero power and must never be extracted, staged, reviewed, or saved as either. The scan is useful when at least one allowed field is extracted; show the editable result panel immediately and summarize the extracted result rather than displaying only generic review instructions.

**Why:** The large number on real exclusive-weapon screens is not a reliable power value. The previous OCR prompt and confirmation flow could store it as weapon power and propagate it into hero power.

**How to apply:** Exclude every power alias from the exclusive-screen prompt, server sanitizer, editable review form, and save payload. Do not preserve that screen number as raw OCR text. Keep allowed OCR rows staged until explicit confirmation; scroll the panel into view after rendering. Use a clear no-data message for empty extraction and an explicit provider/error message for failed analysis. Partial readable rows remain valid. Preserve previously stored profile data unless separately authorized; only a distinct supported source may confirm hero power.