# WarBoost V2.5.28 HF8.6.23 — Session State Machine Reliability

## Purpose

Fix the field-reported state where a player remains authenticated and their WarBoost profile is present, but the private-beta gate can remain stuck on `Synchronisation…`, causing Coach IA / Alliance / VS / Season to behave as if access is not fully ready.

## Root cause fixed

A Supabase token refresh for the same authenticated user could start a new session bootstrap. HF8.6.22 reset beta access to `checking` while retaining `cloudProfileVerified=true` from the previous token. If the revalidation request then failed transiently, the stale verified flag could be treated as restore success while the beta state remained `checking`; retry logic could also be suppressed by that same stale flag.

## HF8.6.23 changes

- Same-user token refresh preserves already verified beta access while background revalidation runs.
- New/different/revoked users still fail closed and must pass beta verification.
- A stale `cloudProfileVerified` value can no longer make a failed restore count as successful.
- Session reuse now requires a consistent verified beta state, not only a previously verified profile flag.
- Cloud profile retry remains enabled when a restore error exists, even if a previous token had already verified the profile.
- Beta verification runs in parallel with the fast profile restore and transient request races preserve a verification that already succeeded.
- `lib/session-bootstrap.js` is included in the service-worker shell for mobile/PWA reliability.
- Existing HF8.6.17–HF8.6.22 safeguards remain active.

## Deployment

Apply this patch only over WarBoost V2.5.28 HF8.6.22 on branch `public-beta-safe-launch`.

No Supabase migration is required. No player data is deleted. No existing file needs to be removed.

After deployment, the header must show `V2.5.28 HF8.6.23`.
