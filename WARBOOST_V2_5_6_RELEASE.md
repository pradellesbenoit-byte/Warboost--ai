# WarBoost V2.5.6 — 7-Day Plan Logic Reliability

## Objectif

Supprimer les rattachements artificiels du héros principal dans le Plan Joueur 7 jours, sans modifier les données joueur, le cloud, Supabase, l'Alliance, le VS ou la Saison.

## Changements

- Jour 5 devient **Boutique / ressources** : décision compte-wide, sans cible héros forcée.
- Jour 6 devient **Timing VS / Saison** : décision compte-wide, sans cible héros forcée.
- Les jours héros restent ciblés uniquement quand l'action concerne réellement un héros.
- Les libellés Boutique/ressources et Timing VS/Saison sont fournis dans les 23 choix de langue explicites.
- Le cache PWA est versionné V2.5.6 pour éviter de servir une ancienne interface après mise à jour.
- Les protections V2.5.4/V2.5.5 restent intactes : cloud, RLS/service role, sauvegarde locale, Escouade 1, plan sans quantités inventées, R5/R4, voix, VS/Saison.

## Base de données

Aucune migration Supabase n'est requise. Aucun schéma, profil, snapshot ou membre n'est supprimé.
