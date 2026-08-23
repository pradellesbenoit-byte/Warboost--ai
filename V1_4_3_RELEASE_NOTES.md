# WarBoost V1.4.3 — Release Candidate

Cette version regroupe les correctifs V1.4 en un seul paquet testable avant production.

## Inclus
- Architecture Last War « approval-first » : aucun accès non autorisé.
- Lecture/écriture cloud Supabase via session utilisateur sécurisée avec RLS.
- Compatibilité Preview Vercel sans exposition de la Service Role Key.
- Chemins de logo/PWA corrigés pour les icônes placées à la racine du dépôt.
- Service worker mis à jour pour ces chemins et nouveau cache `warboost-v1-4-3`.
- Version applicative harmonisée à 1.4.3.

## Données cloud déjà restaurées
- Profil : pseudo et rôle restaurés depuis les données historiques validées.
- Escouade 1 : détails restaurés.
- Escouades 2 et 3 : puissances historiques connues restaurées uniquement ; détails héros à rescanner.

## Règle de mise en production
Ne pas fusionner vers `main` tant que le Preview Vercel n'a pas validé : logo, connexion, profil, 3 puissances d'escouade, scan et recommandations IA.
