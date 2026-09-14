# WarBoost V2.5.28 HF8.6.28 — Mobile UI Stabilization

## Why this hotfix exists
Real-device screenshots from HF8.6.27 confirmed that the core authenticated state was correct (Player, Alliance, Desert Storm and Saison were already usable), but two access-sensitive surfaces could still visually remain on the transient `Synchronisation...` state after the profile was already visible:

- Coach IA on the home screen.
- Player self-reported activity inside the Player drawer.

The screenshots also confirmed two HF8.6.27 fixes were successful and must remain untouched:

- Saison no longer shows the empty amber warning strip for a confirmed ended/interseason lifecycle.
- Tempête du Désert now receives the ALL4 roster and allows R4/R5 to select registered players.

## Root cause addressed
HF8.6.27 used a single `requestAnimationFrame` critical repaint. On some Android/WebView session/resume timings, the transient CHECKING render could occur before the authenticated runtime had fully settled and a later repaint could be missed for small independent surfaces. Player Activity was also not part of the critical repaint list at all.

## HF8.6.28 changes
1. Replaces the one-shot critical repaint with an idempotent mobile stabilization sequence:
   - immediate pass;
   - next animation frame;
   - 120 ms;
   - 500 ms;
   - 1500 ms.
   Newer repaint requests invalidate older delayed passes.
2. The same critical pass now refreshes:
   - Coach IA;
   - Synchronisation WarBoost;
   - Player Activity;
   - Saison access state;
   - Player core/activity while Player is open;
   - Desert Storm while Alliance is open.
3. Player Activity paints a READY baseline before calculating recent confirmations. A secondary calculation failure can no longer leave the old `Synchronisation...` message visible.
4. Player Activity now uses a safe clock fallback (`Date.now()`) if the Last War server clock object is temporarily unavailable/invalid.
5. Window focus, online, visible and pageshow/BFCache resumes all request an immediate critical repaint before/alongside runtime reconciliation.
6. Service-client diagnostics now include the current runtime access phase and the visible Coach / Sync / Player Activity texts. This makes any future UI contradiction diagnosable from a ticket without collecting passwords or secrets.
7. Release/cache identifiers are synchronized to HF8.6.28 across HTML, i18n, PWA manifest, service worker and `/api/health`.

## Explicitly preserved
- HF8.6.27 Saison hard-hide fix.
- HF8.6.26 single access contract and account isolation.
- ALL4 / R4/R5 Alliance data and Desert Storm roster picker.
- VS current-vs-historical score separation.
- Player squads, drone, progression, scans and cloud persistence.
- PRO beta/payment safeguards.
- No Last War external access, scraping or gameplay automation.

## Database / data
- Database migration: NONE.
- Data deletion: NONE.
- Existing player state remains untouched.

## Deployment
Apply directly over HF8.6.27 at the root of `public-beta-safe-launch` and replace matching files.
