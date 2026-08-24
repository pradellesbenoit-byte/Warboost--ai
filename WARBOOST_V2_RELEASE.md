# WarBoost V2 — Publisher Edition

Validated presentation build for the `publisher-demo` branch.

## What V2 contains
- Publisher-safe presentation for Last War / FirstFun.
- Player, Alliance R5/R4, VS and Season modules.
- PRO diagnostic and AI shop advisor from the V1.6.3 multi-source core.
- Contextual hero visuals: hero portraits appear only when a recommendation or squad mentions that hero.
- Priority #1 gets a discreet animated “Priorité IA” treatment.
- Demo hero visuals are original placeholders and are not official Last War artwork.
- Official Last War integration remains clearly marked as pending authorization.
- No gameplay automation.

## Upload
For the mobile GitHub workflow, upload root files to `publisher-demo`, then preserve the existing `api/`, `lib/` and `supabase/` folders.
The hero SVG files are also included at repository root because the live UI references `/kimberly.svg`, `/dva.svg`, etc.
