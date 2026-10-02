# Event strategy validation — 2026-10-02

## Result

Ready for local code review and cautious strategy proposals. This is not a certified complete/current official Last War ruleset, a production deployment, or an authenticated cloud acceptance test.

Work performed on `public-beta-safe-launch` only. No push or publication. No edits to `demo-lastwar-presentation`.

## Automated checks

Passed:

- `npm run check`
- `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_ANON_KEY npm run verify`
- `npm run test:event-strategy` (also runs after `verify`)
- `npm run test:alliance-event-workspace`
- `npm run test:desert-storm-selection`
- `npm run test:desert-storm-plan-ui`
- `npm run test:canyon-storm`
- `npm run test:availability-capacity`
- `npm run test:current-game-updates`
- `npm run test:event-availability`
- `npm run test:beta-api-imports`
- `git diff --check`
- Research renderer: all 37 citation keys and saved evidence paths resolved.

The Supabase variables were unset only in the general verification subprocess because its unconfigured-registry fixture assumes they are absent. Workspace secrets were not changed or read.

An existing workspace assertion incorrectly prohibited the separate Alliance activity-history table anywhere in the page. It now checks only the Event accordion for duplicate history, preserving the current unrelated history panel and the intended event-workspace constraint.

New checks cover capacities, explicit substitutes, unknown/absent distinction, stale/future/undated evidence, exact identities, ambiguous aliases, source placeholders, recent outcome reliability, field-specific power dates, unknown opponents, disputed rules, rule expiry, safe HTML, shared API output and the real workspace-to-engine boundary. Other event instances are excluded; stored plans do not define current attendance.

## Browser verification

One mobile event-plan journey, with narrow diagnostic follow-ups, used a **browser-only synthetic fixture**. No persisted auth bypass, credentials, account writes or cloud writes.

- 390×844 mobile: Desert/Canyon 20 starters + 10 explicit substitutes, 2 unknown and 0 absent.
- VS, Season and generic events: 32/32 active fixture members, no Storm cap.
- Named role assignments and source/provenance disclosures rendered.
- Unknown-opponent and coverage-not-win-probability guards remained visible.
- Disputed exact numbers stayed marked for confirmation.
- Copy button placed exactly the visible 868-character Desert orders into the clipboard and displayed “Copied”.
- Both existing Storm planner renderers appended the shared strategy.
- Real VS/Season UI renderer accepted mocked API-style strategy responses.
- No horizontal overflow in the mobile drawer; source-link hit test passed.
- Desktop 1365×900 sanity check passed.

The first fixture incorrectly used a timestamp as `event_instance`; it was diagnosed and corrected to `current`, without changing the engine to accept a different event. The real UI aggregation was additionally scoped to its current instance and stopped reusing stored-plan attendance.

## Remaining limits

Real signed-in cloud accounts, actual phones and production were not exercised. The public beta was not updated.

Official full rules were unavailable for several critical claims. Exact timers, Canyon numeric values and substitution procedures, VS victory weights, current game build/server applicability and newly announced launch dates remain explicitly uncertain. Research evidence and its limits are documented in `research/last-war-event-strategy.md`.