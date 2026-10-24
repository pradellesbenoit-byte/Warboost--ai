# Offline billing fixtures only

Exact SQL bytes from filtered commit
`0b418e319c99de4d42dbe412e0be58eff3e07f53`, originally under `supabase/`.
They contain schema/functions/privileges and no account exports or credentials.

Loaded only by `scripts/billing-test-fixture.mjs` into an ephemeral PGlite
engine populated with synthetic accounts. Never deployment migrations, never
apply these files to Supabase. The production migration directory is unchanged.
The public web build must not contain this directory.
