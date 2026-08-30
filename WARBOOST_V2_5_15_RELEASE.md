# WarBoost V2.5.15 — Explainable AI Reliability

## Goal
Make Diagnostic PRO explanations internally consistent and auditable without weakening the data-preservation and private-beta safeguards inherited from V2.5.14.

## Changes
- Rank-aware EX explanations: #2/#3 can no longer claim to be the best option.
- Explicit tie-break disclosure when rounded marginal scores are equal.
- All configured heroes from the main squad are included in the EX comparison.
- EX30 is disclosed as the current 10/20/30 model cap; missing EX stays unscored and marked for verification.
- No exact fragment quantities are invented.
- Dated meta evidence is visible in the PRO panel, with source kind/date and knowledge date 2026-08-30.
- Recent Air community signals are applied only as small secondary adjustments, never as a replacement for account-specific data.
- Safer UI wording for unknown server profile, unavailable VS opponent and Alliance WarBoost-space invitation.
- 23 explicit language choices retain labels for the new UI.

## Database / authorization
No Supabase migration. No destructive operation. Official Last War integration remains pending authorization; no unauthorized source is enabled.
