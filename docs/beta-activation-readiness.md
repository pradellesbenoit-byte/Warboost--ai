# Activation bêta — livraison locale, publication non autorisée

Branche : `public-beta-safe-launch`. Aucun push ou déploiement automatique.

## Prérequis avant utilisation sur une base distante

Appliquer **manuellement sur l’environnement Supabase explicitement autorisé** :
`supabase/migration_v2_5_32_beta_activation_atomic.sql`, après
`supabase/migration_v2_5_26_beta_invites.sql`.

Ne pas publier le serveur d’activation avant cette migration. Sans la RPC,
l’activation d’un nouveau compte retourne `503 BETA_ACTIVATION_SCHEMA_MISSING`.
Il n’existe volontairement aucun repli « compter puis insérer ».
Les comptes déjà admis restent reconnus par leur propriétaire authentifié.

La migration conserve la limite de **25** et l’échéance du code existant,
sans changer son hash, les invitations existantes, les profils, les rôles ou les droits PRO.
Le compteur conserve sa portée historique : source du code actuel, statuts
`pending` et `accepted` ; `revoked` ne consomme pas de place.
Une restauration administrative doit aussi respecter la capacité.

## Contrats et protections

- `/api/pro` : `allowed` désigne l’accès personnel ; `alliance_beta_allowed`,
  `beta_access_status` et `beta_code_eligible` décrivent séparément l’invitation.
  L’abonnement ou le droit PRO n’attribue pas un grade d’alliance.
- La RPC est réservée à `service_role`. L’UUID vient de l’authentification
  serveur et l’email est lu dans `auth.users`, jamais dans le formulaire.
- Les invitations déjà liées à un autre UUID sont refusées, sans réaffectation.
  Une modification d’email ne transfère ni invitation ni compte.
- L’acceptation d’une ancienne invitation non liée utilise un UPDATE CAS,
  contrôlant propriétaire nul, statut et expiration dans la même écriture.
- Le verrou commun est acquis avant les verrous de ligne ; les autres écritures
  d’invitation et les restaurations sont protégées par les mêmes règles.
- Une invitation expirée est refusée sans écriture ni révocation du droit PRO
  persistant. Un compte déjà accepté ne dépend pas de la date limite du code.
- Le navigateur ignore les réponses d’activation/statut appartenant à une autre
  session. Il n’affiche le succès qu’après `ok:true` et `allowed:true` du serveur.

## Tests locaux reproductibles

`npm run check` et `npm run verify`.
`npm run test:beta-activation` peut être lancé séparément.

Le test atomique utilise les outils PostgreSQL `initdb`, `pg_ctl` et `psql`,
dans un dossier temporaire, uniquement avec un socket Unix et des identités
`example.test`. Deux connexions réelles concurrentes vérifient la dernière place.
Tous les appels Supabase sont interceptés. Aucun email ni compte de production.

L’application mobile complète est vérifiée avec Chromium tactile 390×844 et
des API fictives isolées par compte ; ce n’est pas un test de la délivrabilité
des emails, de la configuration Supabase distante ou d’un téléphone physique.

## Résultats de livraison

- `npm run check` : PASS.
- `npm run verify` : PASS, y compris les anciens scripts auth/bêta remis à jour.
- PostgreSQL réel temporaire : PASS pour les identités, expiration, révocation,
  idempotence, persistance, dernière place concurrente et restauration à capacité pleine.
- Droit PRO persistant : PASS, conservé même lorsque l’invitation est expirée,
  sans écriture du droit.
- Fonctions réelles du navigateur : PASS pour les réponses POST et GET tardives
  du compte A, ignorées pendant que le compte B reste FREE.
- Navigateur tactile 390×844 : PASS pour activation/refus, faux succès HTTP 200,
  profils vide et partiel, réouverture, rechargement et séparation des comptes.
- Les fixtures mobiles ont aussi montré des dates non valides et une consigne
  de connexion dans le panneau Support malgré la connexion. Observations hors
  parcours d’activation, non reproduites avec des données réelles et non corrigées ici.

**Verdict : code validé localement ; pas prêt à pousser pour mise en service avant
application autorisée de la migration. Aucun environnement distant n’a été modifié.**