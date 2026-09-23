---
name: Event workspace capacities
description: Capacity and close-state rules for the R5/R4 event workspace.
---

Tempête du Désert and Tempête du Canyon are the only event types with a 20-player participant limit and 10 substitutes. VS, Saison, and the generic alliance event are open-roster events: every active member can be a participant, there are no substitutes, and the denominator is the current active roster size.

The event detail view is independently open/closed from the event cards. Its selected event and drawer scroll position must survive rerenders; selecting the already-open card closes the detail. A temporary same-document history state lets Android back close the detail before page navigation.

**Why:** Applying the Desert/Canyon registration model to all events incorrectly excluded members and displayed misleading 0/20 and 0/10 counters. An always-visible detail also left mobile users without a reliable way to return to the card list.

**How to apply:** Keep open-roster classification uncapped and status-driven: present → participants, unknown/uncertain → confirming, explicit absent → absent. Render substitute UI only for the two capped storm events.