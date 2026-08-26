# WarBoost V2.4.0 — Decision Integrity + Boutique IA

V2.4.0 part de la V2.3.9 validée et ajoute une couche de fiabilité de décision ainsi qu'un vrai moteur de comparaison Boutique multi-scan.

## 1. Decision Integrity
- Fraîcheur des données calculée par domaine : Joueur, Drone, Boutique, VS, Saison.
- Une donnée trop ancienne ou sans horodatage bloque une recommandation d'achat payant et demande une actualisation.
- La confiance du Diagnostic PRO baisse automatiquement lorsque la donnée de décision vieillit.
- Le timing VS V2.3.9 reste inchangé.

### Seuils internes WarBoost
Ces seuils sont des garde-fous WarBoost, pas des règles officielles Last War.
- Joueur / Drone : récent ≤ 48 h ; vieillissant ≤ 7 j ; à actualiser > 7 j.
- Boutique : récent ≤ 12 h ; vieillissant ≤ 36 h ; à actualiser > 36 h.
- VS : récent ≤ 12 h ; vieillissant ≤ 24 h ; à actualiser > 24 h.
- Saison : récent ≤ 24 h ; vieillissant ≤ 72 h ; à actualiser > 72 h.

## 2. Boutique IA multi-shop
Le dernier scan de boutique n'écrase plus les précédents. WarBoost conserve jusqu'à 36 instantanés de boutique et agrège les offres encore assez récentes pour les comparer ensemble.

Exemple : un joueur peut scanner VIP, Alliance, Honneur puis Campagne. Le Diagnostic PRO peut alors classer les offres visibles des quatre boutiques dans la même analyse.

## 3. Référentiel Last War issu des captures fournies
Nouveau fichier : `lib/shop-catalog.js`.

Le référentiel contient **164 entrées**, dont **163 articles/offres nommés**, répartis dans **15 familles de boutiques/écrans** :
- Centre commercial · Diamant
- Centre commercial · Briques d'Or
- Centre commercial · Pass Hebdomadaire
- Centre commercial · Super Pass Mensuel
- Centre commercial · Offres Hebdomadaires
- Centre commercial · Pack en Promotion
- Bons Plans · Mobilisation Totale
- Boutique · Diamants
- Boutique · VIP
- Boutique · Alliance
- Boutique · Honneur
- Boutique · Campagne
- Boutique · Saison
- Boutique · Cosmétiques
- Boutique · Magasin de Coupons

Le catalogue couvre notamment : plans d'équipement, fragments d'arme exclusive, fragments héros, Drone, puces, armement, badge d'affinité, accélérations, endurance, téléporteurs, ressources, Suzerain, Saison/profession, cosmétiques, coupons, Pass et packs payants observés.

## 4. Règles anti-invention
- Une offre de référence n'est jamais présentée comme disponible aujourd'hui.
- Les prix/limites non lisibles ne sont pas inventés.
- Les articles affichés `VENDU` restent connus pour la reconnaissance, sans faux prix courant.
- Une offre payante doit reposer sur des données récentes avant d'obtenir un conseil d'achat.
- Un type d'article non reconnu avec assez de confiance ne reçoit pas de recommandation d'achat.

## 5. Scoring amélioré
Le moteur distingue maintenant davantage de familles : équipement, matériaux d'équipement, arme exclusive, héros, Drone, armement, puces, entraînement, Saison/profession, accélérations, endurance, boucliers, téléporteurs, ressources, cosmétiques, packs événementiels et achats en argent réel.

Les achats en argent réel restent volontairement plafonnés sauf lorsqu'ils ciblent directement un goulot identifié et que les données sont fraîches.

## Non-régression recherchée
- 31 héros et alias conservés.
- Paliers EX10 / EX20 / EX30 inchangés.
- Aucun coût exact de fragments inventé.
- Timing VS V2.3.9 conservé.
- Alliance Reliability V2.3.6/V2.3.7 conservée.
- Schéma Supabase inchangé.
- 12 fonctions API conservées.
