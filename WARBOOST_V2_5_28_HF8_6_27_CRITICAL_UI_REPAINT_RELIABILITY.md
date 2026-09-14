# WarBoost V2.5.28 HF8.6.27 — Critical UI Repaint Reliability

## Why this hotfix exists
Real-device screenshots from HF8.6.26 proved that the authenticated player state itself was correct (Account, Player, Alliance and Desert Storm were populated), but three surfaces could remain visually stale after hydration:

- Coach IA could still show `Configure ton profil` even though the player profile, QG, squads and drone were already loaded.
- Synchronisation WarBoost could still show `Synchronisation...` even though Account reported the cloud profile as synchronized.
- Saison could show an empty amber warning strip even when the season lifecycle was already confirmed as ended/interseason.

These were presentation consistency bugs, not data-loss bugs.

## HF8.6.27 changes
1. Adds a critical post-hydration repaint queue for Coach IA, Synchronisation WarBoost and Saison.
2. Repaints the same critical surfaces after authenticated runtime reconciliation.
3. Coach IA now paints a player-aware baseline as soon as an owned profile name exists, before optional priority calculations. An optional calculation error can no longer leave the old pre-login card behind.
4. Synchronisation WarBoost now uses the same READY runtime access contract as Account/Player and leaves the transient `Synchronisation...` state once the owned profile is visible.
5. The Saison access notice is hard-hidden (class + hidden property + inline display guard) when lifecycle is active, ended or interseason.
6. Opening Saison forces both lifecycle notice refresh and core season summary refresh.
7. Release/cache identifiers are synchronized to HF8.6.27 across HTML, i18n, PWA manifest, service worker and `/api/health`.

## Explicitly preserved from HF8.6.26
- Single authenticated access contract and cross-account privacy boundary.
- Account/profile restoration and cloud ownership checks.
- Player squads, drone, progression and scan retention.
- ALL4 roster and R4/R5 manager tools.
- Desert Storm registered-player roster selection.
- VS stale/current separation and no advice from a previous server day.
- Season lifecycle data and historical profession handling.
- PRO beta/payment safeguards.
- Service client diagnostics.

## Deployment
Apply directly over HF8.6.26 at the root of `public-beta-safe-launch` and replace matching files. No database migration. No data deletion.
