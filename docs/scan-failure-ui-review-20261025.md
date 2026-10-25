# Message sûr après refus de scan non configuré

Branche : `warboost-free-access-review-20261025`.
Base distante vérifiée : `714043f59ba7779be749a8961f369bd83d7d3232`.

## Cause

Le batch convertissait la réponse HTTP en erreur en ne conservant que le code.
Le gestionnaire partagé ne reconnaissait que le timeout et affichait sinon
`scan_error`. La branche UI examinant `j.code` n'était donc pas atteinte.

## Correctif limité

- Transmission structurée du statut HTTP, du code et de la seule preuve de
  non-réservation ; aucun message brut du fournisseur n'est affiché.
- Liste fermée pour indisponibilité, timeout, quota, authentification, consentement,
  e-mail et PRO. Les erreurs inconnues restent génériques.
- Messages traduits dans les 22 langues, via le véritable résolveur de traduction.
  Arabe RTL conservé ; aucune transformation des données des joueurs.
- Même traitement pour scan personnel, arme exclusive et roster.

### Preuve indispensable, sans changement des quotas

`SCAN_NOT_CONFIGURED` peut aussi provenir du chemin tardif quand un fournisseur
configuré renvoie un résultat vide **après** réservation. Le seul code/503 ne
suffit donc pas à promettre l'absence de débit.

La réponse du garde pré-réservation porte désormais `quota_reserved: false`.
Cet ajout est une métadonnée de réponse : la réservation, les limites et les droits
restent inchangés. Le message complet nécessite HTTP 503, le code exact et ce
booléen explicite. Sans preuve, une indisponibilité sans promesse de gratuité
s'affiche. Un lot ayant déjà traité une requête ne prétend pas n'avoir rien débité.

Le refus pré-réservation n'entraîne toujours aucune réservation. Aucun
remboursement ou changement des quotas déjà enregistrés.

## Résultats locaux

Environnement vidé, valeurs synthétiques, bloqueur réseau préchargé :

- `node --test scripts/verify-scan-handlers-mobile.mjs scripts/scan-provider-quota.test.mjs scripts/free-access.test.mjs scripts/free-workspace.test.mjs scripts/workspace-mobile-feedback.test.mjs`
  : **182 PASS, 0 FAIL, 0 ignoré**.
- `node scripts/verify-analysis-indicator.mjs` : **PASS**, y compris 276 messages
  localisés, cycle de chargement, concurrence et nettoyage d'indicateurs.
- `npm run check`, syntaxe du nouveau module, `git diff --check` : **PASS**.
- `npm run build:web` : **PASS**, 8 pages, 156 modules navigateur.

Les handlers réels et listeners sont exécutés sur DOM simulé : profil, escouade,
technologie et exclusif en FR/EN/ES/AR ; roster en ES avec et sans preuve.
Les 22 langues sont vérifiées sur leurs clés effectives. Les tests couvrent
également preuve absente/fausse, mauvais statut, lot partiellement traité, erreur
inconnue et `SCAN_NOT_CONFIGURED` tardif sans preuve de non-débit.

Aucun essai Android réel relancé, aucun appel Supabase/Vision/Stripe, aucun compte,
quota réel, migration, Secret ou configuration distante modifié. Aucun serveur ou
déploiement. L'ancienne Preview n'est pas automatiquement mise à jour par ce rapport.
Un ancien serveur sans la nouvelle métadonnée reçoit le message prudent, sans
assertion injustifiée d'absence de débit.
