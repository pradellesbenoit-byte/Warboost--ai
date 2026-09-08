# WarBoost V2.5.28 HF2 — Declared R4/R5 Advisory Access

## Functional rule fixed
- The player's declared Last War rank (`player.role`) controls access to advisory R4/R5 tools.
- Declared R4 or R5: War Plan AI and local roster import are available.
- Declared R1/R2/R3: those advisory/command tools remain blocked.

## Security rule preserved
- Declaring R4/R5 never grants WarBoost management permission.
- Changing other members' WarBoost permissions still requires server-verified management / owner checks.
- Existing-alliance invitation management remains server-verified.
- HF1 Activity Events cloud/roster sync remains unchanged.

No Supabase migration is required.
