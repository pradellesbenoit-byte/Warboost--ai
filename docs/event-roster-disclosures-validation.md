# Alliance event disclosure validation — 2026-10-03

## Scope

Only `public-beta-safe-launch`. UI-only changes; no changes to the war-plan
engine, role matching, reserve selection, availability rules or backend.
No push/publication and no change to `demo-lastwar-presentation`.

## Behavior

- Starters and substitutes are two independent, sibling disclosures, closed by
  default. Each header displays its actual player count and a changing chevron.
- A native button opens/closes its list in one tap, or Enter/Space. `aria-expanded`
  and `aria-controls` match the explicitly hidden body; closed rows cannot receive
  keyboard focus. No nested disclosure component was introduced.
- Tab-session storage remembers each event/group through rerenders and reloads.
  An in-memory fallback keeps toggling usable if browser storage is blocked.
  This UI preference never writes player/alliance state.
- Player names and existing status controls share a compact row. Names wrap;
  reserve tasks remain visible when expanded. Status touch targets are at least
  44px high. Chevron/reveal motion is short and disabled for reduced-motion users.

## Automated checks

`npm run check`, `npm run verify` and `git diff --check` pass. The verification
subprocess alone unsets Supabase variables; workspace secrets/configuration
are not changed.

`scripts/verify-event-roster-disclosures.mjs` checks 12/5 counts, initially hidden
bodies, independent repeated open/close, retained status controls and reserve
instructions, session reload, blocked storage, unchanged plan data, explicit
visibility and reduced-motion support.

## Browser verification

The browser-only synthetic fixture at 390×844 passed:

- French headers 12 starters / 5 substitutes, both initially closed.
- Repeated one-tap open/close of each section; both can stay open independently.
- Visible row geometry, chevron orientation and `aria-expanded` agree.
- Counts, all 17 original status values, reserve tasks and Plan B remain unchanged.
- Clicking a long player name opens its profile without collapsing the lists;
  a native status-control interaction does not collapse either section.
- Event close/reopen and same-tab reload preserve both expanded states.
- No horizontal overflow: drawer 358/358px, event detail 302/302px and list
  bodies 260/260px (scroll/client width). Long names wrap readably.

Backend/provider requests were intentionally blocked, causing only the expected
blocked-network messages. No game data was written or plan recalculated. This
does not certify physical-phone behavior, real-account access or cloud sync.