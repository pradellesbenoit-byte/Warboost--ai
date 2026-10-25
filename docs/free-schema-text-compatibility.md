# Correctif local : identités TEXT et adhésions composites

## Origine et portée

Suite de la branche `warboost-free-access-review-20261025`, à partir de
`8b4e8ea3cb00c83e017649859553168a8a06f788`. Aucun accès à Supabase,
aucune migration distante. Le constat de schéma TEST a été fourni par
l'auditeur ; nous ne l'avons pas réinterrogé.

L'ancienne fixture PostgreSQL inventait des clés joueur UUID et une unicité
globale des adhésions. Ses succès locaux ne prouvaient donc pas la
compatibilité du schéma Supabase réel. Les trois erreurs sont reproduites
dans la nouvelle fixture avant vérification des corrections :

- FK UUID vers `wb1_profiles.player_id` TEXT refusée ;
- comparaison TEXT = UUID refusée ;
- `ON CONFLICT(player_id)` refusé sur la PK `(alliance_id,player_id)`.

## Changements

- Toutes les nouvelles références de joueur, propriétaire, fondateur,
  responsable de revue et espace-fondateur sont TEXT.
- `wb1_alliances.id`, l'ID d'une demande et les ID aléatoires de réservations
  restent UUID. Aucune conversion des anciennes tables ou données.
- Signatures : `wb1_reserve_free_scan(text,uuid)`,
  `wb1_reserve_free_scan_v2(text,uuid,text)`, `wb1_access_manager(text,uuid)`,
  `wb1_alliance_access_request(text,text)`,
  `wb1_review_alliance_access(text,uuid,boolean)`,
  `wb1_founder_space(text,text,jsonb,integer)`,
  `wb1_workspace_access(text,text,text)`.
- Les grants et audits suivent ces signatures. Les surcharges UUID anciennes
  inattendues provoquent un refus transactionnel, pas une exposition parallèle.
- Un contrat préalable vérifie les colonnes utilisées, types, PK et RLS des
  anciennes tables ; le contrat complet vérifie les nouveaux objets et ACL.
- L'approbation utilise `ON CONFLICT(alliance_id,player_id)` sans déplacer
  l'adhésion. Verrou de table des adhésions avant contrôle/écriture pour
  sérialiser les mutations concurrentes ; refus si une autre alliance est déjà
  liée, y compris lors d'une approbation rejouée. Aucun ajout d'UNIQUE joueur.
  Cela ne transforme pas toutes les anciennes routes en mécanisme global
  d'unicité : les autres auteurs doivent garder leurs contrôles d'autorisation.
- Le handler accepte une clé joueur TEXT opaque bornée pour la cible d'un
  espace, sans convertir objets/nombres ni normaliser une identité. Les acteurs
  viennent toujours de la session vérifiée. Les demandes canoniques restent UUID.
  Le transport RPC JSON conserve ces chaînes sans cast UUID côté JavaScript.

## Preuves locales réellement exécutées

- **44 tests Node PASS, 0 FAIL, 0 ignoré** : vrais handlers/API et transport
  RPC intercepté, identités TEXT, demandes UUID, cibles malformées, FREE/PRO,
  données A/B et quatre escouades. Aucun HTTP envoyé.
- **30 groupes PostgreSQL natif local PASS, 0 FAIL** sur PostgreSQL **16.15** :
  fixture des types/PK constatés ; installation en ordre, audits, rejeu complet
  et conservation des contraintes/colonnes anciennes, budgets et adhésions ;
  droits R3/R4/R5, isolation, refus d'ambiguïté et données héritées multiples ;
  vraies connexions concurrentes pour demandes/approbations, quotas et CAS.
- `npm run check` : PASS. `npm run build:web` : PASS, 8 pages et 152 modules.
- La fixture ne contient que des données synthétiques et les colonnes nécessaires.
  Elle reproduit les types/contraintes rapportés, pas toutes les politiques,
  privilèges managés et particularités de Supabase PostgreSQL 17.

## Installation future : toujours sous contrôle distinct

1. Sélectionner explicitement **WarBoost-Test `zaioadmbhqzeihkvdjsd`** dans
   l'outil SQL administrateur. Ces fichiers ne prouvent pas l'identité du projet.
   Ne pas cibler la production.
2. Vérifier les droits de l'administrateur (CREATE schéma, REFERENCES/lecture
   profils, lecture/UPDATE alliances, lecture/INSERT/UPDATE et verrouillage
   adhésions), sauvegarde et absence d'objets partiellement installés.
3. Après autorisation : appliquer `migration_free_access_preparation.sql`,
   puis `migration_free_workspace_budget.sql`. Ne pas activer le backend
   intermédiaire entre les deux transactions. L'ancienne signature quota est
   neutralisée par la seconde migration ; l'API utilise exclusivement v2.
4. Exécuter les deux audits correspondants en lecture seule. Toute divergence
   supplémentaire est bloquante, à corriger localement plutôt que modifier
   les types/contraintes des anciennes tables.
5. Cache PostgREST, identités/JWT réels, confidentialité des rôles, contraintes
   effectives et Android restent à valider sous autorisation séparée.
   Le secret de protection réseau reste à configurer par le canal sécurisé,
   jamais dans Git. Sans lui, les scans FREE restent bloqués avant l'IA.

**GO pour revue et tentative d'installation TEST supervisée seulement ;
NO-GO production.** Aucun test distant, paiement, compte, e-mail, scan IA,
modification de main/bêta/démo/Play Store ni déploiement effectué.
