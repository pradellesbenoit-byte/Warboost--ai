# WarBoost V2.4.6 — Local-first Squad Synchronisation

## Correctif principal

Le bouton de confirmation des 5 héros ne dépend plus de la réponse de `/api/state` pour terminer l’action. En V2.4.5, le clic était bien détecté (le bouton passait sur « Synchronisation… »), mais une réponse cloud lente ou bloquée pouvait laisser l’interface figée.

V2.4.6 enregistre désormais l’escouade **immédiatement en local**, ferme la confirmation, met l’interface Joueur à jour, puis pousse la sauvegarde cloud en arrière-plan via le mécanisme WarBoost existant.

## Flux réparés

- confirmation après scan d’Escouade 1–4 ;
- confirmation inline d’une escouade marquée « À synchroniser » ;
- action « Garder sans noms » ;
- conservation du modèle V2.4.5 lié à l’identité du héros : aucune donnée ne suit la position 1–5 ;
- un héros déplacé conserve ses propres niveau, étoiles, arme exclusive, équipement et Éveil ;
- un héros déplacé n’est jamais copié dans deux escouades.

## Données et sécurité

Aucune donnée existante n’est supprimée. Le cloud reste best-effort et peut être resynchronisé ensuite. Les données locales du joueur restent la source immédiate après confirmation.

## Langues

Le correctif n’ajoute aucune nouvelle phrase non traduite. Les libellés existants de confirmation/synchronisation restent couverts dans les 22 langues WarBoost ; seule la version affichée passe à V2.4.6.
