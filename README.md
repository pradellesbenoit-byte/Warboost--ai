# WarBoost V2.4.5 — Squad Identity Reliability

V2.4.5 corrige en priorité la fusion des scans d’escouade : les données d’un héros suivent désormais **son identité canonique** et jamais sa position 1–5. Un changement de composition est traité comme un déplacement, pas comme une copie.

## Correctifs V2.4.5
- niveaux, étoiles, puissance, EX, équipement et Awakening liés au héros, jamais au slot ;
- un héros déplacé vers une nouvelle escouade est retiré de son ancienne escouade ;
- contrôle anti-doublon global sur les 4 escouades ;
- migration automatique des doublons créés par le comportement V2.4.4, sans obliger le joueur à ressaisir ses données lorsque l’identité peut être récupérée ;
- une escouade dont la composition devient incertaine est marquée **À synchroniser** et n’est pas privilégiée par le Diagnostic PRO / Boutique IA ;
- fraîcheur d’une recommandation EX basée sur la donnée EX du héros la plus récente ;
- prix Boutique manquant : une valeur du référentiel n’est affichée que comme **référence** et uniquement sur correspondance forte de l’article et de la boutique ;
- suppression du double titre « Boutique Last War · Conseiller IA » ;
- libellés de fraîcheur « à l’instant » disponibles dans les 22 langues cibles.

Les règles Saison 6 Awakening/Reshape, le classement Boutique IA et les garde-fous de V2.4.4 sont conservés.

---

V2.4.5 consolide les garde-fous Boutique IA validés en V2.4.1–V2.4.4 et conserve la couche Saison 6 Awakening/Reshape intégrée en V2.4.4 pour le Diagnostic PRO.

## 1. Saison 6 — Awakening comme goulot distinct
WarBoost compare l’Awakening au prochain palier EX, à l’équipement, au Drone et aux technologies au lieu d’imposer un héros fixe.

Règles intégrées :
- héros Awakening S6 actuellement pris en charge : Kimberly (Tank), DVA (Aircraft), Tesla (Missile) ;
- prérequis de déverrouillage : héros 5★, arme exclusive EX20+, 50 fragments d’Awakening spécifiques au héros ;
- la complétion de l’Awakening Trial est lue lorsqu’elle est visible, sans être inventée ;
- WarBoost privilégie le héros correspondant au type de l’escouade principale et au ROI réel du compte ;
- DVA n’est jamais forcée en n°1 si une autre cible apporte un meilleur rendement pour la formation analysée.

## 2. Reshape
`Reshape` est traité comme une donnée observée / un indice relatif de décision. WarBoost ne projette jamais une puissance exacte après Awakening ou Reshape sans valeur explicitement observée ou source officielle autorisée.

`exact_power_projected = false` reste le comportement de sécurité.

## 3. Formation
Le moteur utilise le bonus de type Last War :
- 3 héros du même type : +5 % ;
- 3 + 2 : +10 % ;
- 4 du même type : +15 % ;
- 5 du même type : +20 % HP / ATK / DEF.

Une composition hybride n’est pas déclarée meilleure sans synergie mesurée. WarBoost ne considère donc pas une composition mélangeant DVA/Lucius, ou toute autre composition hybride, comme méta validée par défaut.

## 4. Technologies Saison 6
Lorsque les valeurs sont connues, le moteur peut comparer :
- Type Mastery ;
- Hero Tech ;
- Tactical Weapon ;
- Siege to Seize ;
- Defensive Fortification.

Le poids est adapté au contexte offensif / défensif et à l’écart restant jusqu’au niveau maximal.

## 5. Awakening Swap
Avant toute recommandation de Swap, WarBoost vérifie :
- les deux héros identifiés ;
- Awakening déjà débloqué des deux côtés ;
- 5★ ;
- EX20+ ;
- présence dans la base ;
- événement actif et tentatives restantes lorsque ces données sont connues ;
- fragments Awakening spécifiques encore détenus.

WarBoost avertit de dépenser les fragments spécifiques du héros cible avant un Swap lorsque cela est pertinent et ne déclenche jamais l’action automatiquement.

## 6. Boutique IA — déduplication et intégrité de monnaie
V2.4.5 conserve les correctifs de déduplication/monnaie des versions précédentes et ajoute le repli de prix référentiel sûr lorsqu’un article et sa boutique sont reconnus avec forte confiance mais que le montant n’est pas lisible.

Garde-fous :
- fusion des doublons du même article / même boutique ;
- normalisation de la monnaie uniquement lorsque la boutique possède une monnaie déterministe ;
- exclusion des articles `VENDU` ;
- suppression d’un prix numérique lorsque la lecture prix + monnaie est ambiguë ;
- aucune disponibilité live n’est déduite du seul référentiel historique ;
- les scans récents de plusieurs boutiques restent cumulés ;
- les coffres opaques restent sous les ressources directes ;
- les ressources situationnelles restent sous les goulots directs sauf contexte VS / Saison / événement explicite.

Cas de validation :
1. Fragment d’Arme Exclusive Universel — Honneur — 2 500 médailles d’Honneur ;
2. Plan d’Équipement (MR) — Honneur — 30 000 médailles d’Honneur ;
3. Pièce de Drone — VIP — 2 000 diamants.

## 7. Multilingue
Les libellés Awakening / Reshape et les explications Boutique V2.4.5 sont disponibles dans les 22 langues WarBoost. EN-GB et EN-US utilisent le même pack anglais, soit 23 options d’interface.

## 8. Sécurité / API
WarBoost reste un compagnon indépendant, lecture seule, API-ready et sans automatisation du gameplay. Toute donnée officielle Last War ne doit être branchée qu’après autorisation.
