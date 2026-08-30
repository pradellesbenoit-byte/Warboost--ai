# WarBoost V2.5.16 — Source Integrity Reliability

## Goal
Make the PRO meta panel auditable and prevent community evidence from silently overriding the player's real account data.

## Fixes
- Exact source title, publisher, date and URL are now stored for every displayed meta source.
- A source is labelled `Official` only when it points to a verified Last War support page.
- The former synthetic `Official Drone development guidance` card is replaced with the real Last War Support article about Level 6/7 Drone Component Chests; its claim is scoped to what that article actually says.
- Community Reddit sources are explicitly labelled `Community`, keep their original post titles and are clickable from the PRO panel.
- Community evidence no longer adds or subtracts opaque numeric points from the Diagnostic PRO score.
- The old Air coefficients that could show `+4`, `+3` or `-5` are removed from the numeric ranking path.
- Account data, next EX breakpoint, relative cost, squad role, timing and measured player context drive the score.
- Community evidence remains visible as explanatory context and can support a recommendation without pretending to be official or universal truth.
- Sources used by the current top priorities are sorted ahead of unrelated evidence.
- Missing DVA EX remains explicitly missing and cannot receive an invented rank, score or exact shard requirement.
- V2.5.15 rank-aware `Pourquoi`, five-hero EX comparison, VS/Season safety and private-beta data-preservation safeguards are preserved.

## Evidence audit performed 2026-08-30
Verified examples used by the curated evidence set:
- Last War Support: `I’ve never seen Level 6 or Level 7 Drone Chests. How can I earn points?`
- Reddit / r/LastWarMobileGame: `Exclusive weapon priority`
- Reddit / r/LastWarMobileGame: `Post S6 - Air Main Advice`
- Reddit / r/LastWarMobileGame: `Exclusive Weapon Advice`
- Reddit / r/LastWarMobileGame: `Air Squad gear priority`
- Reddit / r/LastWarMobileGame: `Gear priority`
- Reddit / r/LastWarMobileGame: `Gear advice`

## Database / authorization
No Supabase migration. No destructive operation. Official Last War integration remains pending authorization; no unauthorized game source or gameplay automation is enabled.
