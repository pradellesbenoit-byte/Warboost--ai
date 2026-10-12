---
name: Unified alliance authorization
description: Durable authorization rule for canonical roster writes, rank management, diagnostics, and authenticated state hydration.
---

Canonical roster writes must use one server-side authorization decision. A user is authorized only when the authenticated account is the alliance owner or has a uniquely linked canonical roster row with canonical R4/R5 in the target alliance and a matching canonical membership.

**Why:** A membership role or a browser-declared role alone cannot prove that the account owns the exact Last War identity; the canonical link and membership must agree after server-side repair.

**How to apply:** Resolve authorization from authenticated user ID, alliance owner ID, canonical membership alliance ID/role, and linked canonical identity. Use the same decision for roster sync, rank management, diagnostics, and state hydration. Treat imported roster contents as data to write, not as proof of the actor's authority.

Une erreur de synchronisation du roster ne garantit pas l'annulation de toutes les écritures cloud. Ne jamais supprimer ou remplacer le roster canonique pour réparer cette erreur, ni annoncer une synchronisation sur le seul succès HTTP ; les retentatives doivent relire les versions cloud et conserver la date du constat initial.

**Why:** Le propriétaire exige de préserver les membres, grades et droits même lorsqu'une opération cloud n'est que partiellement terminée.

**How to apply:** Pour les futures confirmations et retentatives d'import, distinguer données locales en attente, écritures cloud déjà attestées et finalisation complète, sans contourner les contrôles de rôle ou d'identité.

Un import roster et une synchronisation personnelle sont des intentions distinctes. L’import ne doit jamais transmettre le profil personnel ni programmer implicitement sa sauvegarde cloud.

**Why:** L’ancien import envoyait les escouades du navigateur : un conflit légitime de fraîcheur d’escouade bloquait alors le roster. Même une sauvegarde locale pouvait ensuite déclencher une sauvegarde du profil entier.

**How to apply:** Autoriser et fusionner l’import depuis l’identité et le roster cloud canoniques, indépendamment des escouades locales. Garder les garde-fous de fraîcheur pour la synchronisation personnelle. Un import, même déclaré complet, ne remplace pas une action explicite de départ/suppression.