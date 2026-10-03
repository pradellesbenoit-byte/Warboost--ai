# Compact Alliance event roster — validation 2026-10-02

Historical record: current reserve-only rendering and runtime research are
described in `event-war-organization-validation.md` (2026-10-03).

## Scope

Only `public-beta-safe-launch`. No push or deployment performed for this task.

Removed the shared rendered proposed-strategy heading/list, copyable orders,
rules/sources disclosures and verbose evidence text. Provenance, freshness,
event rules and internal orders remain available to the engine.

The Alliance event screen derives one compact roster with starter/reserve roles,
availability controls where already authorized, reserve priority and a
“Recalculer le plan” button. Unknown and absent players remain separate.
Existing player-name detail navigation remains available.

## Reserve matching

- Only explicitly available substitutes enter the reserve pool, up to 10 for
  Desert/Canyon; other events retain their open-roster policy and no substitutes.
- Fresh confirmed squad power ranks ahead of stale or account-level evidence.
- Known main type and known formation overlap help match a departed starter.
- Recent confirmed participation reliability breaks otherwise comparable choices.
- Concrete backup roles cover the principal lineup; missing evidence yields
  “Réserve mobile” with “Données limitées”, never an inferred weakness.
- A confirmed withdrawal produces a priority-one replacement proposal. Reserves
  stay reserves until a manager explicitly changes the candidate to present.
- The first edit captures an unsaved baseline. Recalculation preserves unresolved
  vacancies; filling the lineup suppresses unnecessary additional proposals.

## Automated verification: passed

- `npm run check`
- `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_ANON_KEY npm run verify`
- `node scripts/verify-event-strategy.mjs`
- `npm run test:alliance-event-workspace`
- `npm run test:desert-storm-selection`
- `npm run test:desert-storm-plan-ui`
- `npm run test:canyon-storm`
- `npm run test:event-availability`
- `npm run test:availability-capacity`
- `npm run test:shared-alliance-roster`
- `npm run test:roster-anti-rollback`
- `npm run test:roster-rank-persistence`
- `npm run test:beta-api-imports`
- `git diff --check`

Supabase variables were unset only for the verification subprocess's isolated
fixtures. No workspace secrets were read or changed.

Additional strategy checks cover absent reserves, unavailable/stale best candidates,
type/formation/history matching, limited-data fallback, real status writer,
first-edit baseline, real recalculation and confirmed promotion. VS/Season retain
their lifecycle/freshness protections and do not acquire a Storm capacity or reserve
status.

## Mobile interaction verification: passed

One 390×844 synthetic browser journey used a transient response-only fixture.
No persisted authorization changes, credentials, real cloud data or writes.

- Four removed blocks and their accordions absent.
- Initial Desert 20 starters + 10 reserves + 2 unknowns with roles, before any edit.
- Native p0 selector to absent: 19 starters; p20 priority-one proposed replacement.
- Native recalculation preserves the proposal.
- Native p20 selector to present: 20 starters + 9 reserves; vacancy proposal cleared.
- Canyon: 20 + 10, including a limited-data mobile reserve.
- VS/Season/generic cards: 32/32; real VS/Season renderer accepted synthetic
  32-member output with no substitutes.
- Long player names wrapped without horizontal overflow. Player modal opened and
  closed without losing the roster.

Running development workflow restarted once and came up cleanly on port 5000.

## Limit

Real account authorization, cross-account cloud synchronization, persisted reopening,
production data and physical phones were not verified by the browser fixture.
Cross-account replacement/persistence validation was proposed separately.