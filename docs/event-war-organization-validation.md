# War organization validation — 2026-10-02

## Scope and limits

Local changes only on `public-beta-safe-launch`. No push/publication and no change
to `demo-lastwar-presentation`. This is a deterministic planning heuristic based
on available confirmed evidence, not a guaranteed winning strategy or a certified
current official ruleset.

## Calculation

- Essential attack, defense, capture and rapid-response coverage comes first;
  retake/support allocations complete the lineup. Canyon and Desert use different
  balancing preferences; a sourced recent known stronger/weaker opponent changes
  them. Unknown opposition stays neutral, with no invented enemy roster.
- Confirmed recent main-squad power, known fresh type/formation and actual
  participation outcomes guide role matching. Missing power/history is unknown,
  not proof of weakness or unreliability.
- Bounded maximum-weight matching within strength tiers avoids concentrating
  the principal forces on a single mission. Type preferences organize the team;
  they are not official Tank/Missile/Aircraft combat bonuses.
- Reserves come only from explicit current substitute declarations. All eligible
  reserves may be considered, but at most ten are selected for Desert/Canyon.
- Real vacancies receive the first priorities; joint matching avoids greedily
  consuming another vacancy's only suitable reserve. Next priorities cover role
  deficits and diversified contingency missions/individual starters.
- Every reserve has a mission, priority, covered starter role, an individual target
  when one exists, and a conditional entry trigger requiring a free slot.
- Limited evidence yields a mobile reserve with a useful conditional coverage task.
  No implicit promotion, invented specialization or absent player in the reserve pool.
- Saved assignments preserve withdrawal evidence, not current attendance. The
  current declarations define the roster; recalculation stores the new organization.

## Automated validation: passed

- `npm run check`
- `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_ANON_KEY npm run verify`
- Strategy tests including `scripts/verify-event-war-organization.mjs`
- Alliance event workspace, Desert selection/plan UI, Canyon
- Event availability/capacity, shared roster, rank persistence/anti-rollback
- Beta API import checks and `git diff --check`

New assertions include joint matching versus a greedy counterexample, six useful
main missions, distinct type-guided missions, every reserve instruction field,
diversified individual backup targets, priority order, two simultaneous withdrawals,
recalculation persistence, twenty withdrawals with only ten reserves, unknown/
stale/future/wrong-instance opponent guards, limited data, stale type/formation
isolation and escaping of target names. Actual status-writer checks also cover an
old empty saved plan and a second withdrawal after accepting the first replacement,
without reviving the resolved original vacancy. Existing tests retain VS/Season open-roster
and freshness/lifecycle guards.

The Supabase variables were unset only in the isolated verification subprocess;
workspace configuration/secrets were not read or modified.

## Mobile validation

A 390×844 browser-only synthetic journey passed: six main mission types, all ten
reserve instruction fields, useful limited-data fallback, native withdrawal,
recalculation preserving the same proposal, manual promotion restoring 20+9,
long-name modal open/close, Canyon 20+10 and VS/Season cards at 32/32.
Document/drawer/detail had no horizontal overflow. The enemy remained unknown;
known-enemy adaptation was exercised in automated tests, not with live enemy data.

Final ancillary confirmation/absence lists were removed from the plan detail and
checked with scoped workspace assertions; status management remains available in
the dedicated availability panel. The mobile role/layout pass remains relevant;
final baseline/second-withdrawal changes were confirmed by the real writer VM tests.

Browser-only fixtures cannot certify real account authorization, cross-account
cloud persistence, production data or physical-phone behavior. No persisted auth
bypass, credentials or real cloud/account writes were used.