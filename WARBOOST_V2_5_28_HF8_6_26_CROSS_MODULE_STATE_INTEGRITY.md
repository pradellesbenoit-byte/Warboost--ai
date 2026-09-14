# WarBoost V2.5.28 HF8.6.26 — Cross-Module State Integrity

## Purpose
HF8.6.26 is the consolidated public-beta reliability patch built on HF8.6.25. It addresses the defects observed in the real Android screenshots where Account, Coach, Sync, Alliance and Desert Storm could disagree about the same authenticated player.

This patch is designed to be installed directly over HF8.6.24 or HF8.6.25 on `public-beta-safe-launch`. It includes the HF8.6.25 launch-integrity lineage. No Supabase migration is required and no player data is deleted.

## Correctness contract
A single runtime access state now governs private-data visibility across the UI. The state is derived from:
- active Supabase user id;
- beta invitation/access status;
- beta consent on the current device;
- exact ownership match between the authenticated user id and `state.player_id`.

The resulting phases are: `signed-out`, `syncing`, `access-denied`, `consent-required`, and `ready`. A revoked/expired/invite-required state always fails closed, even if an older in-memory flag still says access was allowed.

When phase is `ready`, Account, Coach IA, Player, Sync, Alliance, Desert Storm, VS, Season and PRO are required to use the same owned state. When it is not ready, they show the same access/synchronization reason instead of contradictory “sign in” messages.

## Fixes from the visual audit
- Coach IA uses the central runtime access contract.
- WarBoost Sync uses the same access contract and no longer asks an authenticated/accepted player to sign in.
- Desert Storm uses the same access contract, refreshes when Alliance opens, and exposes the active roster when the current player is an authorized R4/R5.
- Player activity uses the same access reason instead of a hard-coded sign-in message.
- Account beta status shows synchronized/ready once invitation + consent + owned state are valid instead of continuing to ask for consent.
- Alliance roster shows a warning when a non-empty roster contains zero R5 entries. Missing R5 is treated as a roster-integrity problem, never silently as a healthy roster.
- VS stale data is separated from live data. A previous-day score is not rendered as the current live score; historical scores stay in the stale warning/context.
- PRO with objective VS and no current VS snapshot explicitly warns that the VS context is stale before showing general progression priorities.
- Season access notice is hidden once the lifecycle is confirmed (`active`, `ended` or `interseason`), removing the empty warning bar seen in the audit. Unknown season state still shows a warning.
- Support displays the exact build (`V2.5.28 · HF8.6.26`) so player tickets can identify the running hotfix.
- Scan copy clarifies that only the temporary raw screenshot expires after up to 48 h; validated scan data remains saved.
- Release label/cache lineage is unified to HF8.6.26. This also fixes the previous i18n tail override that could make a newer build visually report HF8.6.24.

## Preserved safeguards
- Cross-account private data remains fail-closed.
- No missing participation data is interpreted as inactivity or absence.
- Existing roster history, former members, rank management and R5 protection are retained.
- Existing Scan, squad identity, hero data, Drone, progression, PRO, Shop advisor, VS freshness, Season lifecycle, support and Safe Launch protections remain in place.
- No external Last War API, scraping or gameplay automation is enabled.
- No payment is enabled by this patch.

## Validation performed on the patch worktree
- JavaScript syntax checks: `app.js`, `i18n.js`, `sw.js`, `lib/session-bootstrap.js`, `api/health.js`, and HF8.6.26 verifier.
- HF8.6.24 owned-state regression verifier: PASS.
- HF8.6.25 player-launch-integrity verifier: PASS.
- HF8.6.26 cross-module-state-integrity verifier: PASS.
- HF8.6.26 verifier covers ready/signed-out/consent/mismatch/checking/revoked states, including stale `allowed=true` with revoked access.
- Static HTML audit: duplicate DOM ids rejected; all declared static i18n keys resolve through every configured locale/fallback; locale count preserved.
- ZIP integrity and install simulation are performed when the final archive is built.

Note: the local packaging worktree contains the patch files, not every historical repository file. Therefore this document does not claim that the entire historical `npm run verify` chain was re-executed locally. The current and immediately preceding HF8.6.24/HF8.6.25/HF8.6.26 regression gates were executed against the packaged lineage.
