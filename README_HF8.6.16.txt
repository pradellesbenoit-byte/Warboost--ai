WARBOOST V2.5.28 HF8.6.16 — AUTH SESSION COMMIT RELIABILITY

Purpose:
- Fix the observed Android case where Supabase password auth succeeds but WarBoost stays Local.
- The successful Supabase session returned by password / OTP / immediate signup is now applied directly.
- WarBoost no longer reports login success until cloudSession contains the authenticated user.
- HF8.6.15 timeouts, HF8.6.14 non-blocking scan migration, HF8.6.13 cloud restore and all previous safeguards remain.

Deployment target: public-beta-safe-launch only.
No Supabase migration. No file deletion. Payments remain disabled.
