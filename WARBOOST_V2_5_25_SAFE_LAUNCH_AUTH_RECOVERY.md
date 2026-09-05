# WarBoost V2.5.25 — Safe Launch + Support + Auth Recovery

## Objectif
V2.5.25 complète V2.5.24 sans modifier le modèle de données joueur : elle ajoute une récupération de mot de passe utilisable directement depuis WarBoost, tout en conservant le service client, la bêta sur invitation et les verrous Safe Launch.

## Récupération de mot de passe
- bouton **Mot de passe oublié ?** dans le tiroir Compte WarBoost ;
- envoi du lien par Supabase Auth via le SMTP déjà configuré ;
- URL de retour Vercel Preview basée sur `VERCEL_BRANCH_URL`, donc stable entre les redéploiements d’une même branche ;
- page dédiée `/reset-password.html` ;
- saisie + confirmation du nouveau mot de passe ;
- session de récupération obligatoire : une session WarBoost normale ne suffit pas à ouvrir le formulaire ;
- jetons `access_token` / `refresh_token` supprimés de l’URL dès leur consommation ;
- mot de passe transmis uniquement à Supabase Auth et jamais enregistré dans l’état joueur, les tickets support ou le stockage WarBoost ;
- déconnexion de la session de récupération après mise à jour réussie.

## Compatibilité / données
- clés `localStorage` historiques conservées ;
- aucune suppression des scans, escouades, Drone, Alliance, VS, Saison ou historique ;
- aucune nouvelle migration SQL ;
- migration support V2.5.24 conservée telle quelle ;
- 12 fonctions Vercel serverless, inchangé.

## Safe Launch conservé
- paiement désactivé ;
- PRO gratuit pour les comptes invités ;
- aucune API Last War non autorisée ;
- aucun scraping ;
- aucune automatisation de gameplay ;
- aucun accès externe au jeu ;
- disclaimer d’indépendance conservé.

## Configuration Supabase nécessaire pour la Preview
Dans **Authentication → URL Configuration → Redirect URLs**, ajouter :

`https://warboostv4-git-public-beta-safe-launch-warboost.vercel.app/reset-password.html`

Le **Site URL** peut rester `https://warboost.fr` tant que la production n’est pas basculée sur cette version.

## Vérifications réalisées
- syntaxe JS complète : PASS ;
- suite de régression WarBoost V2.5.25 : PASS ;
- simulation API Support V2.5.24 : PASS ;
- récupération Supabase simulée : mail → session recovery → nouveau mot de passe : PASS ;
- suppression des jetons de récupération de l’URL : PASS ;
- mot de passe absent du stockage Auth WarBoost : PASS ;
- 23 langues explicites : PASS ;
- 31 héros partagés : PASS ;
- 12 fonctions Vercel : PASS ;
- migration support non destructive : PASS ;
- verrous paiement / accès jeu / scraping : PASS.
