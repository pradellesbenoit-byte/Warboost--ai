---
name: Localization validation
description: Why dictionary coverage alone is insufficient and how to protect gameplay data during localization.
---

Use explicit UI translation keys, never broad automatic substitutions over rendered user or gameplay data.

**Why:** Player nicknames, canonical heroes, grades, stored numbers and identifiers can match ordinary UI words; translation must not change them.

**How to apply:** Protect placeholders, tags, URLs, numbers and canonical identifiers; keep language work separate from profile persistence and recognition.

Dictionary presence is not proof that every screen or AI message is localized.

**Why:** Browser checks found untagged public navigation labels, and an older translation table could override newer localized values with English.

**How to apply:** Verify the actual translator resolves each supplied locale entry, inspect real screens, and distinguish machine-assisted copy from native-speaker review. Record authenticated/mobile/provider coverage separately from isolated tests.
