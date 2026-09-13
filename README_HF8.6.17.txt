WARBOOST V2.5.28 HF8.6.17 — CLOUD PROFILE RESTORE RELIABILITY
Date: 2026-09-13
Base: HF8.6.16 Auth Session Commit Reliability
Target: public-beta-safe-launch only

PURPOSE
HF8.6.16 proved that Supabase authentication could succeed while the player's cloud profile was still not restored into the browser. HF8.6.17 fixes the authenticated profile bootstrap rather than changing passwords or deleting/recreating player data.

ROOT CAUSES FIXED
1. Same-session bootstrap could be treated as already applied after a degraded attempt merely because the auth token was present. HF8.6.17 only reuses a signed-in bootstrap after the authenticated cloud profile has actually been verified.
2. A meaningful local fallback (for example HQ/alliance values from local storage) incorrectly stopped cloud pull retries. It no longer does.
3. Returning online or reopening the app retried cloud restore only when local state was blank. It now retries whenever the authenticated cloud profile has not yet been verified.
4. Consent activation could be blocked by an unverified client-side beta state. It now calls the authoritative /api/state route first; that server route validates invitation + consent itself.
5. A direct read-only fallback can read the authenticated user's own wb1_profiles row through existing Supabase RLS, but only after WarBoost has verified that beta access is allowed.
6. The runtime language layer could overwrite the displayed release number with HF8.6.11. The displayed version/cache key now truthfully identify HF8.6.17.
7. During invitation verification WarBoost no longer shows the misleading legacy “beta not configured” state.

DATA SAFETY
- No Supabase migration.
- No table changes.
- No localStorage.clear().
- No player profile deletion.
- No roster deletion.
- No rescan requirement introduced.
- Existing HF8.6.16 auth reliability and all earlier Safe Launch protections remain.

LIVE DATABASE DIAGNOSIS USED FOR THIS FIX
The affected-account diagnosis confirmed that authentication succeeds, the cloud profile row exists and is populated, the beta invitation is accepted, RLS policies/grants allow the authenticated owner to read the row, and the profile payload is small. This is why HF8.6.17 targets browser bootstrap/retry logic instead of recreating data.

SERVER READINESS CHECK
Before player presentation, /api/health must report cloud_profile_restore_server_ready=true and beta.database_invites_available=true. This specifically catches a Preview environment where browser authentication works but the server-side invitation registry is unavailable.

IMPORTANT
Automated tests can verify the source and package, but the final acceptance test is still the real Vercel Preview on a phone. Do not present the player build until the HF8.6.17 header is visible and the cloud identity/profile returns after a fresh reopen.
