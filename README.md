# WarBoost V2.5.28 HF8.6 — Roster Scan + Progression + Combat AI

HF8.6 est une mise à jour additive de **WarBoost V2.5.28 HF8.5 FINAL**, toujours en bêta publique **sur invitation**, destinée à la branche `public-beta-safe-launch`.

Cette build ajoute :
- import principal du roster Alliance par **plusieurs captures Last War** avec vérification avant import ;
- exclusion robuste des anciens membres dans tous les sélecteurs/événements même après resynchronisation cloud ;
- plans de guerre qui utilisent **la puissance d’escouade en priorité**, la puissance du compte uniquement en fallback ;
- historique de **progression joueur daté** (compte, escouades, QG, Drone) ;
- boutons d’**actualisation rapide** Profil / Escouade principale / Drone ;
- baisse de confiance quand les données d’escouade ont plus de 14 jours.

Les protections VS Freshness Guard, Alliance Lifecycle, Tempête du Désert, Safe Launch, Auth, Support, Scan, PRO, Saison et Boutique IA des versions précédentes restent conservées.

## Installation
Appliquer uniquement le PATCH HF8.6 sur la HF8.5 FINAL actuellement déployée dans `public-beta-safe-launch`. Ne pas modifier `main`, Production ou `publisher-demo` pendant le test.

## Supabase
**Aucune migration Supabase HF8.6.** Les nouveaux instantanés de progression sont stockés dans le payload JSON déjà existant.

## Smoke test obligatoire après Preview Vercel
1. Vérifier que les données joueur existantes sont intactes.
2. Retirer un membre puis vérifier qu’il disparaît aussi de Tempête du Désert après une synchronisation.
3. Réintégrer le membre et vérifier son retour sans doublon.
4. Scanner plusieurs captures du roster et vérifier/corriger le brouillon avant import.
5. Vérifier qu’une liste partielle ne supprime personne.
6. Vérifier le scénario 300 M / 38 M contre 250 M / 52 M : le second doit être prioritaire en combat grâce à son escouade.
7. Vérifier une donnée d’escouade ancienne : confiance réduite, aucune puissance inventée.
8. Vérifier la progression après deux états datés.
9. Vérifier VS, Saison, Support, PRO, Boutique IA et Tempête du Désert pour non-régression.
10. Tester ensuite `beta.warboost.fr` sur un appareil non connecté à Vercel.

## Migrations déjà installées à conserver
HF8.6 n'ajoute rien au schéma. **Aucune nouvelle migration de base de données n’est nécessaire.** Les migrations historiques requises par la bêta restent notamment `migration_v2_5_24_support.sql` et `migration_v2_5_26_beta_invites.sql` ; ne pas les supprimer ni les rejouer inutilement.
