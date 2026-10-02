# Event knowledge and strategy maintenance

WarBoost does not connect to a live official Last War event-rules feed.

## Updating a rule

1. Read the current in-game rule panel or an accessible official announcement. Record server, season, game build and publication date when known. Leave unknowns explicitly null.
2. Save the evidence under `research/sources/`; add its URL and evidence path to `research/sources.json`. Private Discord contents must not be copied without permission.
3. Add a source and an atomic claim in `lib/event-knowledge.js`. An official search snippet is not a full official rules article. Community advice is never labelled official.
4. Keep the prior claim; set its `superseded_by` to the new claim ID. Add a change-log entry, verification date, confidence and review interval. Preserve prior player-confirmed observations unless newer evidence genuinely supersedes them.
5. Disputed numbers, unknown build/server scope and unsupported mechanics must remain reviewable. Exact timers and uncorroborated scoring rates must not drive calculated victory predictions.
6. Run `node scripts/verify-event-strategy.mjs` and the event regression suites. Check a mobile preview before release.

## Strategy input contract

- Use the current active canonical roster. Exact unambiguous identities only.
- Availability is event-instance scoped, sourced, dated, and not inferred from registration or a leaderboard.
- Missing, old, ambiguous or unsourced availability stays **to confirm**, not absent.
- Desert/Canyon: 20 starters and 10 explicit substitutes. Other events: active roster denominator, no substitute status.
- Squad power is preferred to account power; missing or stale values never prove weakness. Type is informational until opponent evidence establishes a matchup.
- Reliability uses only recent confirmed participation/absence outcomes; unknown, excused and not-selected outcomes are not failures.
- Opponent strength is optional and must be explicitly confirmed, sourced and recent. Otherwise every matchup response is conditional.
- Confidence describes input coverage, never a chance of winning.

## Adding an event

Add its definition and sourced claims to `lib/event-knowledge.js`, then its label and availability mapping where the UI needs them. Unsupported newly announced events use the generic coordination plan until their mechanics are actually established. Do not reuse Storm capacities for an open-roster event.

The generic engine, mobile renderer and API share one plan shape. Research report citations are rendered by `node scripts/render-event-research.mjs`; citation keys and saved evidence are checked before rendering.