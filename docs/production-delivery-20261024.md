# Livraison V2 autorisée : préparation avant push

Le propriétaire a explicitement autorisé le push de la release propre vers
`main` et le déploiement automatique existant sur `warboost_v4` / `warboost.fr`.
Ce n'est pas une autorisation de publier avec Replit, de modifier Supabase,
de déployer la bêta/démo, ni d'activer Stripe LIVE.

## Références de sécurité

- SHA V1 distant vérifié avant préparation :
  `59945b3e8f50c9f2c8b3cb58bd16fe8f6f1daa54`.
- Release avant configuration de livraison :
  `0b4b34cff558c855305a30f98302ecc76ab0c42c`.
- Source à pousser : HEAD de `warboost-release-v2-review-20261024`,
  jamais la branche locale `main` ancienne ni `public-beta-safe-launch`.
- Fast-forward exclusivement. Si la tête distante a changé, arrêter.
- L'historique des 54 commits et l'archive privée ne sont pas des parents
  de la release.

## Configuration et dégradation contrôlée

`vercel.json` reprend la configuration connue de la bêta : build web,
`web-dist`, API serverless conservées, fichiers de connaissance et références
de portraits inclus, en-têtes de sécurité maintenus avec CSP.

La RPC `wb1_create_alliance_atomic` est signalée absente par le propriétaire.
Son absence renvoie désormais `503 alliance_creation_unavailable`, sans
fallback d'écritures non atomiques. Seule la route de création d'alliance
appelle cette fonction ; aucune migration n'est appliquée. Les permissions
et contrôles d'identité restent inchangés.

Deux tests locaux simulés vérifient la configuration et l'unique appel RPC
refusé sans écriture de remplacement. Syntaxe et build local réussis.
Aucune nouvelle campagne Auth/RLS, Stripe ou Vision réelle.

## Retour arrière et limites

L'ancien SHA ci-dessus permet de retrouver le code V1. Un retour du code doit
être préparé par un nouveau commit contrôlé, sans force-push. Il ne constitue
pas à lui seul un rollback des données déjà écrites par des utilisateurs V2.
Une restauration complète de sauvegarde Supabase n'a pas été démontrée.

Le compte et les réglages Vercel ne sont pas accessibles par un connecteur
Vercel autorisé dans cette session. Les statuts GitHub et les réponses publiques
du site doivent être consultés après push pour distinguer livraison GitHub,
déploiement Vercel et version réellement servie.

Ce document est un état **avant push**, pas une affirmation de mise en ligne.
