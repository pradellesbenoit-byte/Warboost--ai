# WarBoost V2.5.28 HF8.3 — VS Decision Engine

HF8.3 est la version Public Beta Safe Launch **sur invitation** qui rend le module VS **orienté décision**. WarBoost n'utilise plus le classement visible comme élément principal : il met en avant la décision, l'urgence, les ressources à utiliser/conserver, la tendance et le risque conditionnel de remontée.

## VS Decision Engine
- Un scan donne le score réel visible, thème, temps restant et contexte du duel.
- La décision IA est : scanner, économiser, surveiller, protéger l'avance, pousser ou pousser fort.
- Le moteur combine écart réel, part du score, temps restant et, à partir du deuxième scan, rythme de progression des deux alliances.
- Les projections de rattrapage sont conditionnelles au rythme observé et ne prédisent jamais un résultat garanti.
- Le classement joueur est replié dans Détails du scan et reste un simple contexte. WarBoost ne recommande pas une dépense pour courir après un rang sans bénéfice vérifié.
- Une absence du classement visible n'est jamais interprétée comme une inactivité.

## Non-régression conservée
- Diagnostic PRO personnalisé TOP 3 et Boutique IA alignée.
- WarBoost PRO visible, futur prix 4,99 €/mois, aucun paiement en bêta.
- Alliance HF7 cloisonnée par serveur + alliance + pseudo exact ; invitations R5/R4 sécurisées.
- Suivi Alliance fondé sur preuves ; donnée manquante ≠ absent/inactif.
- S6 terminée / entre-saisons ; aucune S7 inventée.
- Scan fiable, équipements/EX/Drone conservés.
- Support, récupération de mot de passe et invitations bêta conservés.
- 23 langues explicites + Auto.
- 12 fonctions serverless.
- Aucun accès Last War externe, scraping ou automatisation de gameplay.

## Migrations déjà installées à conserver
- `supabase/migration_v2_5_24_support.sql`
- `supabase/migration_v2_5_26_beta_invites.sql`
- `supabase/migration_v2_5_28_hf7_alliance_scope.sql`

## Données / déploiement
HF8.3 n'ajoute aucune migration Supabase et ne supprime aucune donnée. Le PATCH cible uniquement `public-beta-safe-launch` sur la base HF8.2. Lire `UPLOAD_GUIDE_V2_5_28_HF8_3_VS_DECISION_ENGINE.txt` avant déploiement.
