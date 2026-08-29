# WarBoost V2.5.4 — Cloud & Alliance Access Reliability

## Objet
Corriger la régression de permissions Supabase qui empêchait `service_role` d’accéder aux tables `wb1_*`, tout en préservant intégralement les données et les protections utilisateur de V2.5.3.

## Changements
- migration `supabase/migration_v2_5_4.sql` idempotente ;
- permissions `service_role` minimales et explicites sur les quatre tables `wb1_*` ;
- suppression des privilèges de table inutiles pour `anon` et pour les accès navigateur Alliance ;
- RLS profil/snapshot optimisée avec `(select auth.uid())` ;
- détection explicite `database_permissions_missing` pour les erreurs PostgreSQL `42501` ;
- nouveau `probeServiceAccess()` ;
- `/api/health` vérifie réellement la lisibilité serveur des quatre tables ;
- metadata application/PWA/moteur IA alignées sur `2.5.4` ;
- test de non-régression supplémentaire pour la perte de permissions cloud.

## Production Supabase
Migration appliquée avec succès sur le projet Warboost. Contrôle post-migration : 2 profils et 9 snapshots conservés ; lecture `service_role` opérationnelle sur les quatre tables `wb1_*` ; accès anonyme aux profils refusé ; accès direct `authenticated` aux tables Alliance refusé.

## Non modifié
- aucune suppression ou transformation destructive de données ;
- aucune API Last War non autorisée ;
- logique Escouade 1, Diagnostic PRO, Boutique IA, VS, Saison, Scan/OCR, R5/R4 et multilingue conservée.
