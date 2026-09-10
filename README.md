# WarBoost V2.5.28 HF8.2 — VS Live Coach

HF8.2 est la version **Public Beta Safe Launch**, en **bêta publique sur invitation**, qui transforme le module VS en coach de Duel piloté par les données visibles d'une capture joueur, tout en conservant HF8.1 PRO Visible UX et les protections HF7 Serveur + Alliance.

## VS Live Coach
- Le bouton **Scanner le VS maintenant** ouvre directement WarBoost Scan en mode VS.
- Le scan peut lire uniquement ce qui est visible : thème du jour, temps restant, serveurs, tags/alliances, scores, pourcentages, rang/score du joueur et jusqu'à 10 lignes visibles du classement.
- Un ancien `0–0` non confirmé n'est plus affiché comme un vrai score : WarBoost indique **Score non synchronisé**.
- WarBoost calcule l'écart, la part de score, la situation (forte avance / duel serré / retard) et le contexte personnel.
- Si plusieurs scans du même Jour VS sont disponibles, WarBoost compare la progression entre les captures et indique quelle alliance a accéléré sur l'intervalle.
- La décision IA tient compte du Jour VS, du score réel scanné, du temps restant et des priorités du Diagnostic PRO. Une large avance ne déclenche pas une recommandation de gaspiller des ressources uniquement pour gonfler le score.
- Le classement est strictement limité aux lignes visibles sur la capture. Absence de la liste ne signifie jamais inactivité.

## Exemple de non-régression HF8.2
Fixture issue d'une capture joueur réelle du 10/09/2026 : ALL FOR 1 [ALL4] #884 contre Fire and Brimstone [Mep] #872, 1 440 270 940 contre 667 494 056, joueur `les gladiateurs81` #3 à 43 195 000. Le moteur classe cette situation en forte avance, calcule un écart de 772 776 884 et un écart personnel de 10 200 524 vers le #2 visible, sans inventer les données non visibles.

## PRO et Safe Launch
- La carte **WarBoost PRO** reste visible depuis HF8.1.
- Prix commercial préparé : **4,99 € / mois**, mais aucun paiement n'est prélevé pendant la bêta.
- Aucun accès Last War externe non autorisé, aucun scraping, aucune automatisation de gameplay.
- Le VS Live Coach est **scan-driven** : il ne prétend pas disposer d'une télémétrie Last War temps réel.

## Données et compatibilité
- Les données Joueur, Scan, escouades, Drone, Boutique IA, VS, Saison, Alliance, activité et historique restent conservées.
- L'historique VS est stocké dans l'état WarBoost existant ; **aucune migration Supabase HF8.2 n'est requise**.
- Maximum 24 snapshots VS récents sont conservés dans l'état pour l'analyse de tendance.
- 23 langues explicites + Auto et 12 fonctions serverless sont conservées.

## Déploiement
Branche : `public-beta-safe-launch` uniquement. Ne pas toucher `main/Production` ni `publisher-demo`.

Lire `UPLOAD_GUIDE_V2_5_28_HF8_2_VS_LIVE_COACH.txt` avant installation. Le PATCH HF8.2 livré est cumulatif et peut être appliqué à HF8 Commercial Readiness ou HF8.1 PRO Visible UX.

## Socle Supabase historique à conserver
Les migrations déjà installées restent nécessaires et ne doivent pas être supprimées, notamment `supabase/migration_v2_5_24_support.sql`, `supabase/migration_v2_5_26_beta_invites.sql` et `supabase/migration_v2_5_28_hf7_alliance_scope.sql`. HF8.2 n'ajoute aucune migration de base de données.
