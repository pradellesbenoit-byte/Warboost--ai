# WarBoost V2.3.4 — Diagnostic PRO Reliability Patch

V2.3.4 est un correctif ciblé construit sur V2.3.3. Aucun module Joueur, Alliance R5/R4, VS, Saison, Scan, Boutique IA, cloud ou migration n'est supprimé.

## Corrections
- Liaison explicite entre chaque priorité IA et son héros : le portrait ne dépend plus du texte secondaire de la carte.
- Table héros unique partagée par Scan, IA, cloud et interface : 31 héros, avec alias robustes `Morrison` / `Morrisson`, `Skyler` / `Schuyler` / `Shuyler`, `Braz` / `Blaz`, `Stetmann` / `Stetman`, `Kimberly` / `Kimberley` et `DVA`.
- Les portraits utilisent en priorité `assets/heroes/*` avec repli sur les anciens assets racine.
- Chaque priorité héros peut afficher l'état actuel → la cible (ex. `Morrison · EX10 → EX20`).
- Les paliers d'arme exclusive restent strictement `EX0–9 → EX10`, `EX10–19 → EX20`, `EX20–29 → EX30`.
- La terminologie utilisateur est uniformisée sur `EX` (plus de `EW20/EW30` dans les raisons méta).
- Le bandeau éditeur, le moteur API, le manifest, le health check, le cache PWA et les 22 langues sont alignés sur V2.3.4.
- Le cache PWA inclut désormais l'UI éditeur et les 8 portraits héros pour éviter un rendu incohérent après mise à jour.

## Sécurité / prudence conservées
- Aucun coût exact de fragments n'est inventé sans table officielle validée.
- Aucune donnée Last War non autorisée n'est récupérée.
- Scan + saisie + cloud restent utilisables pendant l'attente d'une éventuelle autorisation officielle.
- Les données existantes du joueur restent protégées pendant les migrations/restaurations.

- Audit global des 31 héros : chaque identité possède un type d’unité et un visuel WarBoost dédié ; aucune carte ne réutilise le portrait d’un autre héros.
- Farhad est classé Tank dans la table commune ; les variantes de nom ne peuvent plus faire perdre le type ou le lien vers une arme exclusive.
