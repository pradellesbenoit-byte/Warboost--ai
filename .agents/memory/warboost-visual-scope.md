---
name: WarBoost visual scope
description: Restore the pre-neon presentation while retaining functional improvements and the character loading screen.
---

Use the old WarBoost layout from before the recent neon visual redesigns. The user explicitly requested returning to the old home, Player, Alliance, Members and Events presentation.

**Why:** The user changed the visual direction: « Je veux revenir aux anciens mise en page ».

**How to apply:** Restore only presentation, not an old whole-project checkpoint. Keep all recent scan/Vision, portrait, weapon, Drone, Technology, timeout, fusion, provenance, security and permission improvements. Do not reintroduce the neon redesign without a new request.

The loading screen with characters must remain strictly unchanged.

**Why:** The user explicitly retained this constraint when requesting the old layout.

**How to apply:** Keep loading artwork, styles and startup logic out of presentation restorations.

For presentation-only requests, retain all existing sections, functional text, actions and behavior; change layout styling rather than rewriting handlers, calculations, permissions or scan flows.

**Why:** The user explicitly clarified “Fait juste nouvelle mise en page” after the larger visual restructuring.

**How to apply:** Scope changes to presentation and verify that the functional sources and character loading screen remain untouched.

Presentation work must not undo functional squad targeting or the formation-plus-weapons batch.

**Why:** The user subsequently requested explicit Escouade 1/2/3/4 targets while preserving the recent scan improvements; the earlier single-target requirement is superseded.

**How to apply:** Preserve the four explicit targets, target confirmation and slot isolation, with the current formation-plus-weapons batch. Never restore an old importer as part of a layout change.

During actual scan or AI analysis, show a small rotating WarBoost W immediately, with a localized honest message and no fake percentage. End it on result, error, cancellation or timeout; do not add artificial waiting to instant actions.

**Why:** The user asked to see that WarBoost is working, without changing the existing layout or character loading screen.

**How to apply:** Keep operation feedback transient and independent of saved player data and the startup illustration; respect reduced-motion preferences.

For screenshot scans, place the turquoise rotating W inside the existing dark scan status field, immediately left of its text; suppress the floating analysis badge while that inline feedback is active.

**Why:** The user specified the marked status rectangle under the blue analysis button and explicitly rejected duplicate feedback.

**How to apply:** Change presentation only. Keep localized status text, scan results and squad targeting unchanged; stop the inline animation on completion, failure, cancellation or timeout.
