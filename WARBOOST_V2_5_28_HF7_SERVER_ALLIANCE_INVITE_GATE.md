# WarBoost V2.5.28 HF7 — Server + Alliance Invite Gate

Date : 2026-09-09
Base exacte : `WarBoost_V2.5.28_HF6_PLAYER_READY_FINAL_FULL.zip`
SHA-256 base HF6 : `428e637e21ec54053f9dd051e1d371e2a214560dd17388f1cfaa66677e08e323`

## Objectif
HF7 verrouille l'accès aux espaces Alliance WarBoost afin qu'un code partagé ne permette jamais, à lui seul, de rejoindre une autre alliance. Les espaces Alliance sont désormais séparés par **serveur Last War + tag d'alliance**, et seuls les R5/R4 correspondant exactement au roster de cet espace peuvent créer/partager des invitations.

## Règles d'identité Alliance
- L'e-mail sert uniquement à l'authentification et au support WarBoost.
- L'identité Alliance repose sur **pseudo Last War + serveur + tag d'alliance**.
- Un pseudo approximatif n'est jamais accepté : il faut une correspondance exacte et unique dans le roster canonique.
- Un doublon de pseudo/contexte provoque un blocage, jamais un choix automatique.
- Le rôle accordé à l'entrée est le rôle R1–R5 présent sur la ligne exacte du roster.

## R5/R4 et invitations
- Seul un R5/R4 dont l'identité exacte correspond à une ligne R5/R4 du roster peut créer ou partager l'invitation de son alliance.
- Le code d'invitation n'est **jamais** une autorisation à lui seul.
- Le joueur invité doit avoir enregistré et synchronisé son pseudo Last War, son serveur et son alliance.
- Le serveur doit correspondre exactement au serveur de l'espace invité.
- Le tag d'alliance doit correspondre exactement au tag de l'espace invité.
- Le pseudo doit être présent exactement une fois dans le roster canonique de cette alliance.
- Un joueur d'un autre serveur, d'une autre alliance ou absent du roster est refusé.
- Un joueur changeant d'espace WarBoost ne peut le faire qu'après preuve exacte dans le roster de la nouvelle alliance.
- Le propriétaire technique d'un espace ne peut pas le quitter silencieusement et rendre l'espace orphelin.

## Plusieurs serveurs / plusieurs alliances
Un R5/R4 d'un autre serveur peut utiliser WarBoost et créer **son propre espace** si son profil et son roster local établissent exactement son pseudo, son serveur, son alliance et son rôle R5/R4. WarBoost recherche d'abord un espace existant pour ce couple serveur + alliance afin d'éviter les doublons.

En l'absence d'une API officielle Last War, WarBoost ne prétend pas vérifier le roster directement dans le jeu : le **roster maintenu par les R5/R4 dans WarBoost** est l'autorité disponible pour l'admission. Cette limite reste affichée/documentée ; aucune télémétrie officielle n'est inventée.

## Roster canonique et activité
- Le roster d'admission est stocké côté serveur WarBoost après la migration HF7.
- Les champs privés tels que l'e-mail et l'identifiant de compte WarBoost ne sont pas stockés dans ce roster canonique.
- Les preuves de participation connues sont conservées lors des rafraîchissements de roster.
- Un rafraîchissement local plus petit/partiel ne remplace pas automatiquement un roster canonique plus grand.
- Les données d'activité déjà validées HF6 restent : participé / absent confirmé / non sélectionné / excusé / non renseigné.
- Une donnée manquante ne devient jamais automatiquement une absence ou une inactivité.

## Conflits / doublons historiques
La migration tente de créer une unicité `serveur + tag`. Si d'anciens espaces en doublon existent déjà, elle ne supprime et ne fusionne rien automatiquement. Les API d'invitation et de jonction **échouent alors en mode sécurisé** sur ce périmètre jusqu'à résolution du conflit.

## Bêta et invitation Alliance
Pendant la bêta publique sur invitation, l’autorisation du compte WarBoost et l’invitation Alliance restent deux contrôles séparés : le code Alliance ne contourne jamais la liste d’accès bêta.

## Safe Launch inchangé
- Bêta publique sur invitation.
- PRO inclus pour les testeurs autorisés.
- Paiements WarBoost désactivés.
- Aucun accès/API Last War non autorisé.
- Aucun scraping.
- Aucune automatisation de gameplay.
- Service client, récupération de mot de passe, invitation bêta, Scan, IA Joueur, Boutique, VS, Saison et Alliance conservés.
- 23 langues explicites + Auto.
- 12 fonctions Vercel serverless conservées.

## Migration Supabase HF7 — obligatoire une fois
Fichier : `supabase/migration_v2_5_28_hf7_alliance_scope.sql`

Cette migration est additive/idempotente. Elle ajoute :
- `server_id` à `wb1_alliances`,
- `roster` JSONB canonique,
- `roster_updated_at`,
- un index unique serveur + tag quand l'historique existant est non ambigu.

Le backfill HF6 ne copie que les champs nécessaires du roster et ne copie pas l'e-mail ni le `player_id` privé. Aucun `DROP TABLE`, `TRUNCATE` ou `DELETE FROM` n'est utilisé.
