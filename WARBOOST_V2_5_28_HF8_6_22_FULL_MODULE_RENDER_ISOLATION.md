# WarBoost V2.5.28 HF8.6.22 — Full Module Render Isolation

Base required: HF8.6.21 on `public-beta-safe-launch`.

## Corrected field issue
A partially completed render could update the Home badges (for example QG 30 / ALL4 · R4) while leaving the Alliance drawer and Coach AI in their previous empty/sign-in state. HF8.6.22 gives Home Player, Home Alliance, Home VS, Player summary, Account, Alliance summary, VS, Season, Coach and Provider independent render boundaries.

Every protected data drawer (Account, Player, Alliance, VS, Season) refreshes from the current authenticated state immediately before opening. A rendering error in one module is recorded as a `RENDER_*` diagnostic and cannot block the remaining modules.

## Data safety
- No Supabase migration.
- No destructive operation.
- No player data deletion.
- Existing HF8.6.17–HF8.6.21 cloud/auth/account isolation safeguards are retained.
- Apply only to `public-beta-safe-launch`; do not apply to `main` or `publisher-demo` unless explicitly validated later.

## Verification
`npm run check` and the full `npm run verify` regression suite must pass after applying this patch to a clean HF8.6.21 tree.
