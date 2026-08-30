# WarBoost V2.5.5 — 7-Day Plan Mobile Reliability

## Objectif
Corriger le Plan Joueur 7 jours observé en Preview mobile V2.5.4 sans toucher aux données joueur ni à la migration Supabase déjà validée.

## Corrections
- actions quotidiennes distinctes : priorité, contrôle du palier, priorité secondaire, actualisation, boutique, timing VS/garde, recalcul hebdomadaire ;
- les journées d’actualisation et de recalcul ne sont plus artificiellement rattachées au héros prioritaire ;
- suppression de l’avertissement long répété sur chaque ligne ;
- une seule note de sécurité rappelle qu’aucune quantité exacte n’est inventée ;
- mise en page mobile robuste : texte repliable, aucune pastille débordante ;
- libellés ajoutés dans les 23 langues explicites ;
- protections V2.5.4 Cloud/Alliance et données existantes conservées.

## Base de données
Aucune nouvelle migration. `migration_v2_5_4.sql` reste la migration de fiabilité cloud/alliance active.
