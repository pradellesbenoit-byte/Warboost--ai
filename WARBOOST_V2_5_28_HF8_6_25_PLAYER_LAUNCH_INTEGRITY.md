# WarBoost V2.5.28 HF8.6.25 — Player Launch Integrity

HF8.6.25 is the consolidated player-launch hardening release built on HF8.6.24. It is designed to be installed directly on top of HF8.6.23; HF8.6.24 does not need to be installed first.

## Non-negotiable launch behaviour

WarBoost must never show contradictory states between Account, Home, Coach IA, Player, Alliance, VS and Season. One authenticated player's data must have one owner (`state.player_id`) and every private module must render from that same owned state. Data from another account must never be displayed or pushed to cloud.

A valid returning player must keep access to their already-owned local state while cloud revalidation happens in the background. A transient network error may delay cloud freshness, but must not make Coach IA say “connect” while Account is connected, and must not make Alliance show `— / 0 / —` while the owned roster is already present.

New/different accounts remain fail-closed until authentication, beta invitation and consent are valid. No old local profile from another account may leak into the new account.

Every lifecycle entry point — login, token refresh, network reconnect, page resume, BFCache restore, manual sync and retry — uses the same authenticated reconciliation path. No event is allowed to run a partial alternative restore flow.

Local changes are saved first and survive network loss. Cloud writes are owner-checked and may never overwrite a real cloud profile with an empty placeholder or a different account's state. Oversized mobile keepalive writes are deferred and retried in foreground instead of being discarded.

## Player experience

The player path must support profile, up to four squads, Drone, exclusive weapons, equipment, progression snapshots and confirmed hero identity. Scan must never silently move stats from an old hero to a new hero after a composition change. Pending scans must survive normal mobile interruptions when storage permits.

Diagnostic PRO must use the actual stored/scanned account and compare all relevant heroes/squads. It must provide ranked TOP priorities, resource efficiency, marginal return, a 7-day plan, resources to save, shop recommendations, and explicit “do not improve / buy now” guidance when evidence does not justify spending. Missing data must reduce confidence or request a scan; it must not be invented.

Shop advice must separate game currency, diamonds and real-money references. Paid recommendations require a data/evidence guard and must not present historical prices as current prices.

## Alliance R4/R5

Alliance management must use the scoped Last War identity (nickname + server + alliance), preserve roster identity, and distinguish declared role from verified management authority. R4/R5 tools include roster import/scan, rank management, confirmed activity/participation, player history, unlinked-account review, invitations, plan of war and Desert Storm planning.

Missing activity data must remain unknown; WarBoost must never label a player inactive only because data is absent.

## VS and Season

VS Live Coach must use confirmed score/snapshot data, mark stale data, track personal position when known and produce an action-oriented decision instead of a generic calculator response.

Season advice must respect lifecycle states (active / ended / interseason / unknown). Rumours or unconfirmed Season changes must never be activated as facts. Historical season data must remain visible without being presented as current.

## Support, language and diagnostics

Support/feedback must include enough diagnostics to identify release, screen, session state, beta state, consent, account ownership, cloud verification, hydration, sync status and last bootstrap failure without exposing passwords or secrets.

All visible product functions remain multilingual. A missing translation must not break a module. Mobile/PWA resume, network reconnect and service-worker updates must converge back to one consistent runtime state.

## HF8.6.25 hardening added

- unified runtime reconciliation for login, reconnect, visibility resume, BFCache restore, retry and manual sync;
- cloud-retry now reruns the complete authenticated restore state machine instead of only `/api/state`;
- owner mismatch guard before local/cloud persistence;
- cloud push requires `state.player_id === authenticated user id`;
- background cloud hydration no longer changes an already-owned visible account into a false “Synchronisation…” presentation;
- beta feedback diagnostics now report owner match, private visibility, cloud verification, hydration, dirty state and last bootstrap failure;
- regression gate asserts critical Player / PRO / Alliance / VS / Season / Support / Scan launch capabilities.

## Release gate

A build is not considered player-ready from automated tests alone. Before inviting more testers, the real deployed Preview must pass at least: existing player login + data restoration; totally new invited account; consent; profile creation; one scan; close/reopen persistence; offline/reconnect; Player; PRO; Alliance R4/R5; VS; Season; Service client; logout/login as a different account with zero cross-account leakage.
