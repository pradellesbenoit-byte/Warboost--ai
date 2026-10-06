# Passe Sécurité & confidentialité — 6 octobre 2026

## Périmètre

Branche `public-beta-safe-launch` uniquement. Aucun push, aucune publication, aucun déploiement,
aucune connexion destructive à une base réelle. Aucune migration exécutée sur Supabase.
Les codes bêta, mécanismes d'invitation, rôles R1–R5 et droits PRO des autres comptes sont inchangés.
Aucun code Stripe/paiement modifié.
Le serveur local refuse aussi l'accès HTTP aux métadonnées Git, SQL, scripts/outillage
serveur, documents internes et captures téléversées ; seuls les parcours publics sont servis.

## Pages et parcours

- `/security.html` : résumé public du fonctionnement, stockage et fournisseurs.
- `/privacy.html` : politique actualisée ; distinction captures scan locales / pièces jointes support.
- `/delete-account.html` : instructions publiques pour la suppression et recours support.
- Compte : deux confirmations, dont une confirmation serveur signée, limitée à cinq minutes,
  liée à l'utilisateur **et à sa session**. Aucun identifiant cible fourni par le navigateur.
- `/api/support`, actions `account_delete_prepare` / `account_delete_confirm`, utilise
  `requireUser`, pas l'accès bêta ni PRO : un utilisateur doit
  pouvoir demander la suppression même après perte de ces droits.
  La délégation conserve les douze routes API historiques sans changer les actions support/bêta.
- La suppression serveur est transactionnelle pour les données relationnelles et l'identité.
  Les pièces jointes physiques sont retirées par l'API Storage avant la transaction.
  Cette opération Storage n'est pas atomique avec PostgreSQL : un échec peut laisser une
  capture déjà effacée, mais l'identité n'est jamais annoncée supprimée sans résultat positif.
  Un fichier restant ou ajouté entre-temps bloque la transaction ; le joueur peut réessayer.
- Un compte ayant des références Stripe est orienté vers le support : aucune résiliation
  ou mutation de paiement n'est entreprise dans cette passe.
- Les données d'alliance fournies collectivement restent, sans lien privé vers le compte.
  Aucune alliance n'est supprimée et aucun responsable n'est élu automatiquement.
  Un propriétaire supprimé laisse une propriété vide ; les autres R4/R5 restent inchangés.
  Une preuve explicite de déliaison empêche une copie locale obsolète de réintroduire
  l'identifiant du compte supprimé ; les données de jeu peuvent toujours enrichir le roster.
- Nettoyage local ciblé : état courant si propriétaire exact, sauvegarde encapsulée si
  propriétaire exact, sauvegarde par compte, captures IndexedDB `user:<id>`.
  Aucun effacement global du stockage d'autres comptes. Les autres appareils doivent être nettoyés.

## Migrations préparées — application exclusivement manuelle

1. `supabase/migration_security_account_deletion.sql` :
   deux RPC service-role-only, suppression des données personnelles puis `auth.users`,
   retrait des liens d'alliance et guards anti-récréation par les JWT encore valides.
   Pré-requis : schéma principal, tables de support et Storage Supabase.
2. `supabase/migration_security_function_hardening.sql` :
   liste explicite des fonctions connues ; search_path `pg_catalog,public,pg_temp`,
   révocation PUBLIC/anon/authenticated, conservation de l'accès serveur.
   Révocation CREATE sur le schéma public pour empêcher le masquage d'objets.
3. `supabase/audit_security_rls.sql` : lecture seule ; inventaire des fonctions,
   grants et policies du schéma public, y compris objets absents du dépôt.

Ne jamais installer ces fichiers dans un script automatique de démarrage, post-merge,
publication ou restauration. Commencer par un environnement de test et des sauvegardes.
Les fonctions effectivement signalées sur la base cible ne sont pas connues ici :
l'audit doit identifier les différences, sans révocation aveugle de fonctions inconnues.
Relever aussi les anciens enregistrements sans compte auth avant d'activer les guards ;
ne pas supprimer ces données ni appliquer une migration incompatible sans revue.

### Audit RLS : classification attendue

| Tables | Accès attendu |
|---|---|
| wb1_profiles | Authenticated, uniquement son profil : SELECT/INSERT/UPDATE ; policies requises |
| wb1_snapshots | Authenticated, uniquement ses snapshots : SELECT/INSERT ; policies requises |
| warboost_subscriptions | Lecture de son abonnement uniquement ; policy requise |
| wb1_alliances, wb1_alliance_members | Serveur uniquement ; aucune policy navigateur attendue |
| wb1_support_tickets, wb1_support_messages | Serveur uniquement ; aucune policy navigateur attendue |
| wb1_beta_invites, wb1_beta_signup_policy | Serveur uniquement ; aucune policy navigateur attendue |
| warboost_billing_policy, warboost_pro_grants, warboost_billing_accounts, warboost_checkout_attempts, warboost_billing_events | Serveur uniquement ; aucune policy navigateur attendue |
| Toute table non classifiée | Revue manuelle du propriétaire ; ne pas ouvrir une policy générale |

« RLS activée, sans policy » peut être intentionnel : cela refuse le navigateur tout en
permettant les contrôles des API serveur. Il faut vérifier les grants et la réalité de la
base cible, pas simplement faire disparaître un avertissement.

## Vérification isolée

`npm run test:account-deletion` teste l'entrée API réelle avec upstreams synthétiques,
les refus d'authentification/cible/confirmation, l'expiration et le cloisonnement des sessions.
Les migrations sont exécutées deux fois sur PostgreSQL éphémère PGlite, sans URL Supabase,
puis testées : SQL, ACL, audit RLS, suppression, rollback, stockage restant, blocage Stripe,
préservation d'un second compte, de ses rôles/invitations/PRO et refus des écritures orphelines.
Les contraintes Auth/Storage sont simulées : ce n'est pas une validation sur Supabase réel.
Les contrôles navigateur ont également passé sur mobile 390×844 et desktop 1280×900,
avec le dialogue réel et un compte synthétique en loopback : annulation, confirmations,
erreur de préparation, nettoyage ciblé et conservation d'un autre compte.
L'interface du compte avec une vraie session Supabase n'a pas été testée.

Les scans dépendances et confidentialité n'ont signalé aucun problème. Le scan statique
conserve une alerte HIGH générique sur la lecture d'un chemin HTTP dans le serveur local.
Le chemin est limité au répertoire projet, résolu par realpath, contrôlé sur le chemin
demandé et la cible des liens symboliques ; les extensions privées et dossiers internes
sont refusés. Les tests exécutent le résolveur réel avec traversée et liens symboliques
externes/internes vers un fichier caché, tous refusés. Cette alerte résiduelle doit être
revue comme probable faux positif ; elle n'est pas masquée ni présentée comme un scan vert.

## Verdict attendu avant les stores

Préparation technique locale, **pas une autorisation de publication stores**.
Il reste à :

- renseigner l'identité juridique complète de l'éditeur et un contact support public
  vérifié utilisable sans connexion (ne jamais inventer une adresse) ;
- préciser les régions, contrats, sous-traitants et durées réelles des journaux/backups
  et de la conservation OpenAI avec les configurations autorisées ;
- contrôler la base cible via l'audit read-only, puis décider manuellement de l'application
  des migrations sur l'environnement autorisé ;
- valider Auth/Storage, concurrence et suppression d'un compte jetable sur ce test autorisé,
  jamais avec un vrai bêta-testeur ;
- compléter les déclarations App Privacy/Data Safety et traiter les obligations commerciales
  avant toute version payante.
