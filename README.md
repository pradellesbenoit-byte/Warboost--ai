# WarBoost V2.5.28 HF8.4 — Alliance Lifecycle Reliability

HF8.4 est la Public Beta Safe Launch **sur invitation**. Elle conserve intégralement le moteur VS HF8.3 et renforce la gestion R5/R4 : roster complet explicite, R5 importé même s’il est affiché séparément dans Last War, membres à vérifier avant tout départ, anciens membres conservés, retours et changements de grade historisés, données non renseignées visibles et comptes WarBoost en attente réellement actionnables. Le Safe Launch reste inchangé : aucun accès Last War non autorisé, aucun scraping, aucune automatisation de gameplay et aucun paiement bêta.

## Alliance Lifecycle Reliability
- Un import partiel reste additif et ne retire jamais un membre absent du fichier.
- Un R5/R4 peut cocher **roster complet actuel** : seuls les membres absents de ce snapshot passent en **À vérifier**, jamais en inactif/absent.
- Le départ exige une confirmation R5/R4 ; l’historique et les participations sont conservés dans **Anciens membres**.
- Si un ancien membre réapparaît, sa fiche est réactivée avec l’historique de retour.
- Les changements R5/R4/R3/R2/R1 sont historisés.
- Les événements affichent `❓ Non renseigné` pour les membres sans preuve connue sur la période.
- Les comptes WarBoost non associés restent hors roster et proposent une nouvelle vérification par correspondance exacte.
- À `0h00`, le VS passe en état terminé : aucune dépense ni nouveau scan n’est recommandé.

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
HF8.4 n'ajoute aucune migration Supabase et ne supprime aucune donnée. Le PATCH cible uniquement `public-beta-safe-launch` et s'applique sur la base HF8.3. Lire `UPLOAD_GUIDE_V2_5_28_HF8_4_ALLIANCE_LIFECYCLE_RELIABILITY.txt` avant déploiement.
