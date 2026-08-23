# WarBoost V1.4.9 — No-placeholder persistence

- `Garder sans noms` now persists an explicitly blank identity state instead of allowing generic `Hero 1…5` placeholders to reach the cloud.
- Generic hero placeholders are cleared from the scanned squad before any automatic state save.
- The Scan drawer `Enregistrer les noms` flow now waits for `/api/state` confirmation before clearing selections.
- Failed hero-name saves keep the user selections visible for retry.
- Per-item gear levels such as `levels=38,36,36,36` are rendered as localized UI text instead of exposing raw canonical storage strings.
- Confirmed hero names and other trusted squad data remain preserved during rescans.
- Hero naming is canonicalized consistently as `Morrisson` across Scan, Player and AI advice, while accepting the common `Morrison` spelling as an input alias.
