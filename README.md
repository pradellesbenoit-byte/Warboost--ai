# WarBoost V2.5.25 — Public Beta Safe Launch + Support + récupération de mot de passe

Version de bêta publique **sur invitation**, construite sur V2.5.24 Safe Launch + Support.

## Ce qui reste verrouillé
- aucun accès direct au compte ou aux serveurs Last War ;
- aucune API Last War non autorisée ;
- aucun scraping ;
- aucune automatisation de gameplay ;
- aucun paiement WarBoost pendant cette bêta ;
- PRO inclus gratuitement pour les joueurs invités.

## Service client WarBoost conservé
- bouton **Service client** dans l’application ;
- création de tickets par catégorie ;
- e-mail du compte et pseudo WarBoost associés au ticket pour le traitement ;
- capture d’écran facultative, compressée côté navigateur, 2 Mo max ;
- historique des tickets ;
- statuts `received`, `in_progress`, `waiting_player`, `resolved` ;
- réponses joueur ↔ support ;
- captures privées via URLs temporaires ;
- console `/support-admin.html` réservée aux e-mails présents dans `WARBOOST_SUPPORT_ADMINS`.

## Nouveau en V2.5.25 : récupération de mot de passe
- bouton **Mot de passe oublié ?** dans le compte WarBoost ;
- demande de récupération envoyée par Supabase Auth via le SMTP déjà configuré ;
- retour du lien vers `/reset-password.html` sur **l’origine de la bêta utilisée** ;
- écran dédié **Choisir un nouveau mot de passe** avec confirmation ;
- minimum de 8 caractères côté interface, puis validation finale par Supabase Auth ;
- le mot de passe n’est jamais enregistré dans l’état joueur, les tickets support ou les logs WarBoost ;
- les jetons de récupération sont retirés de l’URL dès leur consommation ;
- l’écran de changement de mot de passe exige une vraie session de récupération et n’accepte pas une session normale arbitraire.

## Supabase
V2.5.25 **conserve** la migration support introduite en V2.5.24 :
- `supabase/migration_v2_5_24_support.sql` ;
- `wb1_support_tickets` ;
- `wb1_support_messages` ;
- bucket privé `warboost-support`.

**Aucune nouvelle migration de base de données n’est nécessaire pour V2.5.25.** La migration support existante reste idempotente et ne contient aucun `DROP TABLE`, `TRUNCATE` ou `DELETE FROM`.

Pour tester la récupération sur la bêta `public-beta-safe-launch`, conserver `https://warboost.fr` comme **Site URL** si souhaité et ajouter dans **Authentication → URL Configuration → Redirect URLs** :

`https://warboostv4-git-public-beta-safe-launch-warboost.vercel.app/reset-password.html`

Sur Vercel Preview, `/api/cloud-config` utilise automatiquement la variable système `VERCEL_BRANCH_URL` pour envoyer le lien vers **l’URL stable de la branche**, et non vers une URL de déploiement temporaire. En dehors de Vercel Preview, WarBoost revient à l’origine courante. Aucun nouveau secret Vercel n’est nécessaire pour cette fonction.

## Vercel
Le build reste à **12 fonctions serverless**. Aucun nouvel endpoint Vercel n’a été ajouté pour la récupération de mot de passe : elle utilise directement Supabase Auth depuis le navigateur, comme la connexion WarBoost existante.

## Données joueurs
Les clés de stockage existantes et le cloud joueur restent inchangés. Aucune réinitialisation des scans, escouades, Drone, Alliance, VS, Saison ou historique joueur n’est requise. La récupération du mot de passe ne supprime aucune donnée joueur.
