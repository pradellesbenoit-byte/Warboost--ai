# WarBoost V2.5.9

V2.5.9 corrige le dernier défaut observé dans la Boutique IA : un score `100/100` ne doit jamais ressembler à une certitude sur le prix ou la disponibilité d’une offre.

## Boutique IA — preuve, confiance et disponibilité

- le score est maintenant explicitement une **Pertinence / Relevance** pour le compte du joueur ;
- la **Confiance données** est affichée séparément et dépend de la qualité du profil + du type de source ;
- la **Disponibilité** est une troisième information indépendante : source officielle, offre observée dans un scan récent, ou disponibilité non vérifiée ;
- un référentiel daté ne peut jamais être présenté comme une boutique live ;
- les prix issus du référentiel affichent désormais leur date (`réf. 26/08/2026`) ;
- les offres vendues restent exclues ;
- les prix ambigus restent supprimés ;
- une offre inconnue ne reçoit toujours aucune recommandation d’achat.

## Référence VIP 30 jours

Le coût de 10 000 diamants pour 30 jours VIP a été recoupé le 30/08/2026 dans plusieurs sources publiques communautaires. WarBoost le conserve uniquement comme **référence datée**, jamais comme prix live garanti. L’interface exige toujours une vérification du coût actuel dans Last War avant achat.

Références de contrôle utilisées pour cette version : Last War Vault — VIP Guide ; LastWarTutorial — VIP Program ; LDShop — Last War VIP Guide. Ces sources ne remplacent pas une donnée officielle Last War.

## Régressions protégées

V2.5.9 conserve les validations précédentes : Escouade 1 prioritaire, Plan Joueur 7 jours, 23 langues, 31 héros, Scan/OCR, Boutique IA, VS dimanche en préparation avec reset UTC-2, Saison, R5/R4, Plan B, rôles tactiques uniquement pour les actifs confirmés, invitation Alliance serveur, appartenance Alliance unique, cloud Supabase et sauvegarde locale.

## Supabase

Aucune migration Supabase n’est requise en V2.5.9. Les migrations V2.5.4 et V2.5.7 restent la base active.

## Vérification

```bash
npm run check
npm run verify
```

Les deux commandes doivent retourner PASS.

## Notes héritées


V2.5.5 corrige le Plan Joueur 7 jours sur mobile tout en conservant les protections Cloud/Alliance V2.5.4 et les données joueur existantes.

# WarBoost V2.5.4 — Cloud & Alliance Access Reliability

WarBoost V2.5.4 continue directement V2.5.3 et corrige le point de fiabilité cloud découvert pendant l’audit Supabase : les fonctions serveur utilisaient bien `SUPABASE_SERVICE_ROLE_KEY`, mais les tables `wb1_*` ne donnaient pas au rôle `service_role` les droits SQL nécessaires. Cette version corrige le projet et la base de production sans supprimer aucune donnée joueur.

## Correctif principal V2.5.4

- `service_role` reçoit les droits minimaux réellement utilisés par les API WarBoost :
  - `wb1_profiles` : SELECT / INSERT / UPDATE ;
  - `wb1_snapshots` : SELECT / INSERT ;
  - `wb1_alliances` : SELECT / INSERT / UPDATE ;
  - `wb1_alliance_members` : SELECT / INSERT / UPDATE.
- `anon` n’a aucun accès aux quatre tables `wb1_*`.
- `authenticated` garde uniquement l’accès direct à son propre profil et à ses propres snapshots ; les tables Alliance restent serveur uniquement.
- les politiques RLS profil/snapshot utilisent `(select auth.uid())` pour éviter la réévaluation par ligne signalée par Supabase.
- la migration est idempotente et ne contient aucun `DROP TABLE`, `TRUNCATE` ou `DELETE FROM`.

## Surveillance cloud ajoutée

`lib/supabase.js` distingue maintenant :
- `database_schema_missing` : schéma `wb1_*` absent ;
- `database_permissions_missing` : droits SQL incomplets.

`/api/health` exécute également un contrôle de lecture non destructif sur les quatre tables serveur et expose `database_service_probe`. Cela permet de détecter immédiatement une future régression de permissions au lieu de laisser les fonctions Cloud/Alliance échouer silencieusement.

## Garanties de données

La V2.5.4 conserve les protections de V2.5.3 :
- clé locale principale inchangée (`warboost_v1_core_state`) ;
- sauvegarde `warboost_last_good_state` ;
- fusion cloud/local protégée ;
- aucune réponse cloud vide ne doit écraser un compte local renseigné ;
- historique héros et snapshots conservés ;
- import roster manuel conservé lors des synchronisations cloud ;
- aucune migration ne doit obliger le joueur à rescanner son compte après une mise à jour.

## Fonctions conservées

- Diagnostic PRO IA avec Escouade 1 prioritaire lorsqu’elle est renseignée ;
- plan Joueur 7 jours sans quantités inventées ;
- 31 héros canoniques et armes exclusives ;
- Scan/OCR, Drone, Boutique IA, VS, Saison 6 et contexte adaptatif ;
- R5/R4 avec import roster, actions immédiates, Plan B et changements de grade contrôlés ;
- salutation vocale par grade ;
- 23 choix de langue explicites (22 familles + en-GB/en-US séparés), plus Auto ;
- intégration Last War officielle toujours désactivée tant que Last War / FirstFun n’a pas donné son autorisation.

## Supabase

Migration de référence :

`supabase/migration_v2_5_4.sql`

Elle peut être relancée sans effacer les lignes existantes. Le fichier `supabase/schema.sql` est maintenant aligné sur les mêmes permissions pour éviter que le défaut soit recréé lors d’une nouvelle installation.

## Vérification locale

```bash
npm run check
npm run verify
```

V2.5.4 ajoute notamment un test simulant une erreur PostgreSQL `42501` afin de vérifier qu’une perte de droits `service_role` est détectée comme `database_permissions_missing`.

## Déploiement

Pour une mise à jour complète, remplacer les fichiers du projet par le contenu du dossier V2.5.4 en conservant les variables d’environnement Vercel existantes. Ne jamais placer `SUPABASE_SERVICE_ROLE_KEY` dans le navigateur, dans GitHub public ou dans un fichier client.

La migration V2.5.4 a été appliquée à la base WarBoost de production le 29 août 2026 et les contrôles post-migration ont confirmé que les profils et snapshots existants étaient toujours présents.
