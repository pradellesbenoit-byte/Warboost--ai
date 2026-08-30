# WarBoost V2.5.7 — Alliance, VS & Regression Reliability

## Objet
V2.5.7 clôt l’audit demandé après V2.5.6 avec des correctifs ciblés de sécurité Alliance et de calendrier VS, sans réinitialiser les données joueur.

## Alliance
- code d’invitation généré côté serveur ;
- aucun `upsert` sur `invite_code` ;
- partage du code d’une alliance existante réservé aux R5/R4 ;
- récupération d’une alliance déjà créée si l’adhésion du propriétaire avait été interrompue ;
- une seule appartenance cloud par `player_id` ;
- propriétaire bloqué avant changement d’alliance ;
- non-propriétaire déplacé proprement via `on_conflict=player_id` ;
- aucun code d’invitation fictif généré localement.

## VS
- dimanche = préparation, pas Jour 6 ;
- samedi reste Jour 6 ;
- reset journalier calculé sur l’heure serveur UTC-2 ;
- préparation du lundi sans dépense hors timing.

## Non-régression vérifiée
- Diagnostic PRO + Escouade 1 ;
- Plan Joueur 7 jours ;
- Boutique IA (offres vendues exclues, catalogue partiel explicite) ;
- Saison 6 sans projection de puissance inventée ;
- R5/R4, actions immédiates, Plan B, import roster ;
- 23 langues ;
- 31 héros ;
- cloud et sauvegarde locale.

## Base
`migration_v2_5_7.sql` ajoute uniquement l’unicité de `player_id` dans `wb1_alliance_members` et resserre les droits Alliance côté serveur. Aucune suppression automatique.
