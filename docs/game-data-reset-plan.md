# WarBoost game-data reset plan

This document prepares a future clean-game launch. It does **not** authorize or perform a reset. No production account, profile, alliance, or snapshot was changed in this work.

## Current safe preview

Run `npm run preview:game-data-reset` to print the fixed staging scope. It is intentionally read-only: it does not connect to Supabase, inspect rows, generate SQL, export a backup, or execute deletion. It accepts only branch `warboost-preview-isolation-20261110`, environment `test`, and project ref `zaioadmbhqzeihkvdjsd`. The exact row counts remain unknown until a separately authorized metadata/count review against the test project.

## Candidate scope and impact

| Table | Proposed scope | Impact |
| --- | --- | --- |
| `public.wb1_profiles` | Core game data | Removes saved player profiles and game state; Supabase Auth accounts remain. |
| `public.wb1_snapshots` | Core game data | Removes saved game snapshots/history. |
| `public.wb1_alliance_members` | Separate owner decision | Removes alliance links and R1–R5 roles; roles would need to be re-established. |
| `public.wb1_alliances` | Separate owner decision | Removes alliance records, canonical roster, invite codes, and any event state stored in the alliance record. |

Do not reset the following as part of a game-data reset: `auth.users`, `auth.identities`, beta invitation/signup policy, support tickets/messages, billing accounts/events/policy/attempts/subscriptions, or PRO grants. Those are identity, access, support, or entitlement records rather than player game state.

The alliance tables are not in the default core scope because clearing them removes membership and rank authority. A clean alliance launch requires a separate explicit decision and a plan to reassign R4/R5 roles; it must not infer roles from profile data.

## Safe preparation sequence before any future reset

1. Confirm the target is the intended Supabase **test** project by project ref and dashboard context. Do not rely on branch names or browser-selected regions.
2. Review row counts and foreign-key effects on test only. This repository cannot report counts without a separate test-project read.
3. Apply the existing schema and additive migrations to an empty test project using the documented Supabase migration workflow; validate RLS, triggers, auth ownership, scans, account restore, and alliance permissions there.
4. Before any future production reset, obtain a fresh Supabase-managed backup/PITR restore point and confirm its availability and restore scope in Supabase. Do not add an application dump/export job. A provider-level restore may roll back unrelated writes too, so it is not a table-selective undo.
5. Require a separate owner approval naming the exact tables and accepting the listed losses. Then have the owner execute the reviewed database operation in the provider workflow. No executable reset operation is included here.
6. Verify the resulting game-data tables are empty while Auth accounts, billing, support, and access policy remain intact. Do not test this against production in advance.

## Explicit non-goals

- No production reset, migration, data copy, backup export, or account deletion.
- No copying beta player values or identities to the test project.
- No new production migration or deploy hook.
- No claim that the staging preview or a physical phone was tested.
