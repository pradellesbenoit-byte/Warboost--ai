# WarBoost V2.5.9 — Boutique IA Evidence & Confidence Reliability

## Pourquoi cette version
Le test réel de la Boutique IA a montré qu'un `100/100` pouvait être lu comme « certitude 100 % », alors qu'il exprimait seulement l'intérêt stratégique d'une ressource pour le compte. Le référentiel affichait aussi des valeurs exactes datées sans distinguer assez clairement prix de référence et disponibilité actuelle.

## Correctifs Boutique IA
- `100/100` devient explicitement **Pertinence 100/100** ;
- la **Confiance données** est calculée séparément selon la complétude du profil et la source ;
- la **Disponibilité** est séparée de la pertinence :
  - `official_current` : source officielle en lecture seule, si un accès autorisé existe ;
  - `observed_scan` : offre observée dans un scan récent du joueur ;
  - `reference_unverified` : entrée du référentiel daté, à contrôler en boutique ;
  - `strategy_unverified` : recommandation stratégique sans preuve de présence actuelle ;
- les prix du référentiel portent désormais leur date (`réf. 26/08/2026`) ;
- les scans récents ne sont jamais présentés comme un catalogue officiel live ;
- les offres vendues restent exclues ;
- les prix ambigus restent supprimés ;
- les offres inconnues ne reçoivent aucune recommandation d'achat.

## VIP 30 jours / diamants
Le 30/08/2026, WarBoost a recoupé le coût de **10 000 diamants pour 30 jours VIP** dans plusieurs sources publiques communautaires :
- Last War Vault — VIP Guide: https://www.lastwarvault.com/guides/general/vip-guide/
- LastWarTutorial — VIP Program: https://www.lastwartutorial.com/vip-program/
- LDShop — Last War VIP Guide: https://www.ldshop.gg/blog/last-war-survival/last-war-vip-guide.html

Cette valeur est enregistrée comme **référence datée**, avec `live_verified: false` et `requires_in_game_check: true`. Elle ne devient jamais une affirmation de prix actuel officiel.

## Multilingue
Les 23 choix de langue explicites disposent de libellés structurés pour : Pertinence, Confiance données, Disponibilité, offre observée, disponibilité non vérifiée et source officielle.

## Régressions protégées
V2.5.9 conserve les validations V2.5.2–V2.5.8 : Escouade 1 principale, 31 héros, Plan Joueur 7 jours, cloud/local protégés, Scan/OCR, R5/R4, Plan B, activité prudente, invitation Alliance serveur, appartenance Alliance unique, VS dimanche en préparation avec reset UTC−2, Saison, Boutique IA et voix par grade.

## Supabase
Aucune migration Supabase n'est nécessaire en V2.5.9.
