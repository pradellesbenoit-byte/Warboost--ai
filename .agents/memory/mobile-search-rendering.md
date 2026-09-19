---
name: Mobile search rendering
description: Android/WebView focus behavior for search fields inside access-sensitive drawers.
---

Search inputs inside the Alliance drawer must not synchronously rebuild the drawer or rewrite a focused input during the input event. Filter only the sibling results asynchronously and preserve the focused field's value and selection across scheduled access-sensitive repaints.

**Why:** Mobile keyboard/focus handling is more fragile than desktop when a synchronous sibling DOM update or transient access repaint runs during an input event; the visible field can appear present while taps or subsequent characters are lost.

**How to apply:** Keep security gating on the data and mutation controls. For search-only fields, retain the same DOM node, defer result rendering by one animation frame, and do not assign `.value` or toggle transient state in a way that disables the focused element.