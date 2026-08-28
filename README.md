# WarBoost V2.4.9 — Adaptive Ranking Reliability

WarBoost V2.4.9 corrige les régressions observées sur la Preview V2.4.8 sans retirer le moteur contextuel introduit dans V2.4.8.

## Correctif principal : le moteur adaptatif complète le Diagnostic PRO

Le classement adaptatif intervient désormais **après** la reconstruction du pool fiable de candidats du Diagnostic PRO. Il ne doit plus réduire l'analyse à une seule famille simplement parce qu'une donnée héros n'est pas directement présente dans le slot courant.

Le Diagnostic compare, lorsqu'elles sont réellement documentées :

- niveaux et étoiles des héros ;
- armes exclusives et paliers EX10 / EX20 / EX30 ;
- Éveil / Reshape de Saison 6 ;
- équipement ;
- technologies renseignées ;
- Drone ;
- timing VS / Saison ;
- et, lorsqu'une donnée critique manque, une action explicite de vérification au lieu d'inventer une amélioration.

Le moteur contextuel conserve ensuite l'objectif Auto/Équilibré/PvP/PvE/VS/Saison, le contexte serveur/compte connu, le rendement marginal, la certitude et les conditions de dépense pour classer les candidats fiables.

## Mémoire héros réellement utilisée par le Diagnostic

V2.4.9 branche le registre `hero_profiles` de V2.4.7 dans le Diagnostic PRO.

Ordre de récupération par **identité de héros** :

1. mémoire `hero_profiles` du même héros ;
2. données visibles du héros dans l'escouade courante ;
3. progression héros enregistrée du même héros ;
4. scan d'arme exclusive du même héros, lorsqu'il existe.

Les champs inconnus ne remplacent jamais une valeur connue. Aucun champ n'est récupéré par numéro de slot. Un héros nouvellement placé à une position ne peut donc pas hériter du niveau, de l'EX, de l'équipement ou de l'Éveil du héros précédent.

Kimberly EX19 reste conservable comme donnée confirmée. Une valeur réellement absente de toutes les sources fiables reste inconnue : WarBoost ne l'invente pas.

## Garde-fou si les EX sont incomplètes

Si moins de trois améliorations héros fiables peuvent être construites et que certaines armes exclusives de l'escouade principale sont inconnues, WarBoost ajoute une action **Vérifier les armes exclusives**. Cette action empêche le Drone d'être présenté comme unique priorité certaine alors que les EX des héros n'ont pas encore été confirmées.

Le Diagnostic peut donc afficher moins de trois améliorations uniquement lorsqu'il existe réellement moins de trois actions fiables. Il ne fabrique jamais un faux TOP 3.

## Correctif mobile des priorités non-héros

La carte Drone/Technologie/Scan de V2.4.8 pouvait placer son contenu dans la colonne réservée au portrait héros, ce qui comprimait le texte en une colonne étroite. V2.4.9 utilise une grille spécifique aux cartes sans héros : le titre, l'impact, l'efficacité ressources, le rendement marginal et l'action occupent à nouveau toute la largeur disponible sur mobile.

## Compteur traduit

Le résumé utilise désormais une formulation neutre de type **« Options comparées : 1 »** / **« Options comparées : 6 »**, ce qui évite l'erreur « 1 options comparées ». La chaîne est fournie dans les 23 choix de langue explicites de WarBoost, plus le mode Auto.

## Protections conservées

V2.4.9 conserve sans changement de principe :

- anti-doublon inter-escouades ;
- confirmation des identités héros lors des scans ambigus ;
- scan partiel sans effacement des anciennes valeurs fiables ;
- 31 héros et leurs portraits ;
- Saison 6 Awakening / Reshape et absence de projection exacte inventée ;
- Boutique IA en catalogue partiel, cumul des scans, fusion des doublons, exclusion des articles vendus et disponibilité non affirmée sans preuve ;
- Alliance R5/R4 et fiabilité d'activité ;
- intégration Last War approval-first / API-ready, sans automatisation de gameplay ni accès non autorisé.

## Déploiement

Valider V2.4.9 sur `publisher-demo` avant toute fusion dans `main`. Le test prioritaire est le Diagnostic PRO avec l'Escouade 1 actuelle : vérifier que les données héroïques récupérables réapparaissent, que Kimberly EX19 reste attachée à Kimberly, qu'une donnée EX inconnue déclenche une vérification plutôt qu'une invention, et que les cartes Drone/Technologie ne sont plus comprimées sur mobile.
