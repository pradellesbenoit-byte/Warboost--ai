# Research Notes: Last War Event Strategy & Rule Freshness

**Status:** complete (limitations explicit; no complete official certification)
**Depth:** Deep
**Research date:** 2026-10-02

## Plan

- **Question:** Which Last War event rules are currently confirmed, and how should WarBoost turn them into explainable, data-grounded alliance plans?
- **Scope:** Desert Storm, Canyon Storm, Alliance Duel/VS, seasonal/alliance events, and recently confirmed event additions; official and community evidence kept separate.
- **Audience:** WarBoost maintainers and alliance R4/R5 users.
- **Deliverable:** A cited research report plus a versioned rule registry and generic strategy inputs/outputs implemented in the existing event workspace.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Desert Storm official rules, scoring, phases, map and registration | collected | 6 |
| 2 | Canyon Storm official rules, scoring, factions, objectives and phases | collected | 5 |
| 3 | Alliance Duel/VS and seasonal/alliance event mechanics | collected | 9 |
| 4 | Community battle plans, roles, timing, opponent adaptation and failure cases | collected | 10 |
| 5 | Recent confirmed events, source changes and rule-freshness process | collected | 8 |

## Coverage Checklist

- [x] Separate official evidence from community strategy; evidence cutoff 2026-10-02, game build unknown. [@canyon-official-launch] [@desert-tutorial]
- [x] Preserve observed project capacities only; public official confirmation is a limitation. [@desert-tutorial] [@canyon-handbook]
- [x] Disputed numeric mechanics are quarantined; primary confirmation is a limitation. [@desert-ldshop] [@vs-vault]
- [x] Roles use actual squad/account evidence and explicit availability; reliability uses known outcomes only. Implementation decision, not a game rule.
- [x] Unknown opponents remain unknown; A/B/C are conditional strategy proposals, not victory predictions. [@desert-tutorial] [@canyon-handbook]
- [x] No recent launch date verified; move recent-event claims to Limitations. [@official-regional]
- [x] Curated versioned atomic claims retain provenance, review intervals, supersession and change log. Implementation decision.
- [x] Shared mobile renderer and capacity checks implemented; browser verification documented separately from research.

## Findings Log

### Desert Storm

- Guide reports 20 starters + 10 substitutes per task force; 60 registrations across A/B is not a single battlefield cap. [@desert-tutorial] [@desert-ldshop]
- Oil unlock claim internally conflicts (13/20); exact timers excluded from planning. [@desert-ldshop]
- Older guide revision and unknown game build prevent official/current certification. [@desert-tutorial]

### Canyon Storm

- Official snippets support asymmetric format and relative central-objective priority only. Full articles were inaccessible. [@canyon-official-launch] [@canyon-official-report]
- Exact numbers, faction translations and substitute procedure remain uncorroborated. [@canyon-handbook]

### VS, seasons and alliance events

- Broad daily themes are community guidance; disputed victory weights are excluded. [@vs-guide] [@vs-vault] [@vs-tutorial]
- Reset/calendar and season cycles stay server/season-specific and unconfirmed officially. [@event-calendar] [@season-guide]

### Strategy and freshness architecture

- Preserve project observations separately from public source claims.
- Never infer attendance from registration, activity from missing data, or enemy strength from matchmaking anecdotes. [@desert-tutorial]
- Official promotional mentions do not prove a new launch or its mechanics. [@official-regional]
- Strict research-tier triangulation was not met for quantitative game rules; retain them as uncertain observations, not certified findings.

## Conflicts & Open Questions

- Official Desert rule text was not accessible; the official Canyon support articles rendered sign-in walls. Their search snippets support only the asymmetric format and limited objective priorities.
- Desert Oil Wells: a commercial guide reports both minute 13 and minute 20. Do not select one timer silently.
- Desert 60 registrations across A/B is not a 60-player battlefield; each match remains separate.
- Canyon faction labels differ between official snippets and community guides. Exact values, timers, skills and substitute mechanics remain insufficiently corroborated.
- VS daily victory-point weights conflict between guides. Do not use either table as a current official scoring formula.
- Sunday preparation and reset-window recommendations are community advice, not verified formal rules.
- A page updated in 2026 does not establish that its event was newly added in 2026.
- Goldvein and Season 6 are mentioned by an official regional site, but launch dates and mechanics are not established by its snippet.
- The original developer source for historical-power matchmaking was not found.
- Discord listings do not prove access to announcements; no messages were reviewed.
- No public official event-rules API was verified; the discovered API must not be represented as official.

## Gaps

- Follow-up 1 complete: four targeted searches, including French and Sep/Oct 2026; no usable primary Storm rules. Moved to Limitations.
- Follow-up 2 complete: four targeted searches, including French and Sep/Oct 2026; official VS weights/reset and new launch dates still unavailable. Moved to Limitations.
- No further retries of blocked official/Discord pages.
- Pre-draft freshness sweep covered Sep/Oct 2026 in both follow-up searches; no usable new official event-rule update surfaced.