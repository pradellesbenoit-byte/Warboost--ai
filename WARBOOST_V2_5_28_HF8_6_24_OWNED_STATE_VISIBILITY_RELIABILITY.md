# WarBoost V2.5.28 HF8.6.24 — Owned State Visibility Reliability

## Bug corrigé
Un joueur pouvait être authentifié, invité et consentant, avec son profil déjà chargé en mémoire, tout en voyant le Coach IA demander de se connecter et Alliance R5/R4 afficher `— / 0 / —`.

La cause était une confusion entre deux notions :
- la sécurité d'affichage des données du compte courant ;
- la confirmation que la dernière restauration cloud est terminée.

HF8.6.24 affiche les données privées uniquement si la session est authentifiée, l'accès bêta est autorisé, le consentement est accepté et `state.player_id` correspond exactement à l'utilisateur Supabase courant. La valeur transitoire `cloudProfileVerified` ne masque plus un état déjà attribué au bon utilisateur.

## Protections conservées
- aucun état d'un autre `player_id` n'est affiché ;
- `checking`, `invite-required`, `revoked` et `expired` restent fermés ;
- le consentement reste obligatoire ;
- les retries et la restauration cloud continuent indépendamment ;
- ouverture Alliance/Joueur/VS/Saison force le rendu direct de la surface concernée.

## Régression ciblée
Le test HF8.6.24 reproduit le cas : même user id + invitation acceptée + consentement + état joueur possédé + restauration cloud transitoire. Le profil doit rester visible et cohérent.
