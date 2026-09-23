---
name: Alliance player modal lifecycle
description: Reliable mobile closing, history behavior, scroll restoration, and body scroll locking for the event player profile.
---

The event player profile must use one stable modal mount with delegated close handling for the top-right button, bottom button, and backdrop. Opening adds a same-document history entry so Android back closes the modal before leaving the app; Escape follows the same close path.

Programmatic close actions should clean the temporary history state with `replaceState`, not call asynchronous `history.back()`. This avoids a delayed `popstate` closing a newly reopened profile during rapid repeated open/close cycles.

**Why:** Mobile browser back is asynchronous, and an old pending back can otherwise race with a new modal opening. Body scroll locking must not set `touch-action:none` on `body`, because that can block scrolling inside the modal on Android.

**How to apply:** Capture the Alliance drawer scroll position before opening, restore it after close, lock only body overflow, and keep the modal card independently scrollable with overscroll containment.