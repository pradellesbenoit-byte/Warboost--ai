# WarBoost V2.5.28 HF8.6.1 — Additive Roster Capture Queue

HF8.6.1 est un correctif ciblé de **WarBoost V2.5.28 HF8.6**, toujours en bêta publique **sur invitation**, destiné à la branche `public-beta-safe-launch`.

Il corrige le sélecteur de captures du roster sur mobile/Android : ouvrir plusieurs fois le sélecteur ajoute maintenant les nouvelles captures à la file existante au lieu de remplacer les précédentes.

Cette build conserve intégralement HF8.6 :
- import principal du roster Alliance par captures Last War avec brouillon vérifiable ;
- anciens membres exclus des outils actifs et réintégrables sans doublon ;
- puissance d’escouade prioritaire pour les plans de guerre, puissance compte en fallback ;
- progression datée compte / escouades / QG / Drone ;
- actualisation rapide Profil / Escouade / Drone ;
- VS Freshness Guard, Tempête du Désert IA, Alliance Lifecycle, Safe Launch, Auth, Support, Scan, PRO, Saison et Boutique IA.

## Correctif HF8.6.1
- les captures sont conservées dans une **file cumulative** entre plusieurs ouvertures du sélecteur Android ;
- le `FileList` natif est réinitialisé après chaque choix sans vider la file WarBoost ;
- un doublon exact n’est ajouté qu’une fois ;
- jusqu’à **24 captures** peuvent être préparées avant analyse ;
- chaque capture ajoutée est visible dans la liste et peut être retirée individuellement ;
- le bouton **Analyser les captures** traite la file cumulée ;
- aucune modification du roster n’est appliquée avant validation du brouillon ;
- l’import final vide la file seulement après réussite.

## Installation
Appliquer uniquement le PATCH HF8.6.1 sur la **HF8.6 actuellement déployée** dans `public-beta-safe-launch`. Ne pas modifier `main`, Production ou `publisher-demo` pendant le test.

## Supabase
**Aucune migration Supabase HF8.6.1.** Ne rien exécuter dans Supabase.

## Smoke test obligatoire après Preview Vercel
1. Ouvrir Scanner le roster.
2. Ajouter une première capture : le compteur doit afficher 1.
3. Rouvrir le sélecteur et ajouter une deuxième capture : le compteur doit afficher 2, pas revenir à 1.
4. Répéter avec plusieurs captures choisies une par une sur Android.
5. Ajouter deux fois la même capture : elle ne doit pas être dupliquée.
6. Retirer une capture avec × : les autres restent présentes.
7. Analyser la file et vérifier que les joueurs de toutes les captures sont fusionnés dans le brouillon.
8. Vérifier/corriger le brouillon avant import.
9. Vérifier que les données joueur, anciens membres, Tempête du Désert, progression, VS, Saison, Support et PRO sont intactes.
10. Tester ensuite `beta.warboost.fr` sur un appareil non connecté à Vercel.

## Migrations historiques à conserver
HF8.6.1 n’ajoute aucun schéma. Conserver les migrations déjà installées, notamment `migration_v2_5_24_support.sql` et `migration_v2_5_26_beta_invites.sql`. Ne pas les supprimer ni les rejouer inutilement.
