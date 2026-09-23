---
name: Canonical rank identity
description: Durable identity rules for changing alliance roster ranks safely across stale client state and canonical cloud rows.
---

Rank-management drafts must carry a canonical member key derived from the canonical roster row returned by the server. Never use a legacy local roster key or a client-supplied player identifier to select the target row.

**Why:** The UI can display a merged or stale local member record while the rank API resolves against the canonical cloud roster. Rebuilding a key independently on each side caused a visible member to produce `member_not_found`.

**How to apply:** Resolve by the canonical key first. If it is absent or obsolete, fall back only to one exact match on normalized nickname, server, and alliance; reject zero or multiple matches. Preserve last-R5 and R4-limit checks after resolution.

The canonical key must be attached to cloud roster rows before identity linking and roster merging. The rank UI should send the key plus the current source rank; fallback without that expected rank is not safe.

**Why:** Merging an unkeyed canonical row with a keyed local row can leave the client draft and server resolver using different identities, while a fallback without the source rank can target a stale duplicate.

**How to apply:** Normalize the canonical row's server and alliance context, derive its key once, preserve it through all roster merges, and require the source rank only on the fallback path.

Authenticated fast restore is not authoritative for roster controls. Rank management and Desert Storm must wait for a response marked `canonical_roster_applied`; otherwise perform the normal state restore before enabling either module.

**Why:** The login-critical restore can read a profile before the canonical alliance roster is available, leaving stable keys absent while the UI appears authenticated.

**How to apply:** Treat `restore=1` as provisional until roster canonicalization succeeds, and fail closed for rank/selection mutations while a normal canonical restore is pending.

Confirmed rank changes are versioned by `rank_confirmed_at` and `rank_confirmed_source`. A later merge may not replace a confirmed rank with an unmarked row, even when the unmarked row has a newer generic `updated_at`.

**Why:** Generic profile saves, restore retries, and roster syncs can complete out of order. Generic timestamps describe the profile write, not the business event that confirmed the rank, so using them alone reintroduced R3 after R3→R4.

**How to apply:** Preserve the confirmation fields through normalization, client hydration, canonical roster merges, and profile saves. A manager-authorized state save may CAS-repair the canonical roster when it carries a strictly newer manual confirmation; stale or unmarked rows remain non-authoritative.

When exact normalized nickname + server + alliance matching fails, a tolerant R4/R5 link is safe only for a uniquely close canonical row with the same manager rank, no existing account link, sufficient nickname length, and a confirmed `lastwar_scan` rank; ambiguous close matches stay unlinked.

**Why:** OCR can change one nickname character, but using a fuzzy match without scan-backed rank and one-to-one checks could grant management access to the wrong account.

**How to apply:** Keep exact matching first. Treat server forms such as `#884`/`884` and matching alliance display prefixes such as `[ALL4]`/`ALL4` as the same normalized scope, and persist membership only after the guarded link resolves.