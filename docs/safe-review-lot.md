# Lot local de revue WarBoost — 23 octobre 2026

## Origine et portée

- Branche de revue : `warboost-safe-review-20261023`.
- Base GitHub vérifiée par `git ls-remote` :
  `3de64e919709d2b3a956d6fa6d92b539580d0ec9`.
- Source des corrections :
  `4539e11bb145130b1c2e6c4a090c1f6c37e2c767`,
  branche `public-beta-safe-launch`, conservée sans réécriture.
- Le lot est un nouvel état filtré, pas une fusion des 54 commits.

## Inclus

Corrections du W et de ses cibles visibles ; roster et grades explicitement
confirmés ; conservation des brouillons ; protection contre les réponses cloud
tardives ; synchronisation et isolation des comptes ; sauvegarde et restauration
des quatre escouades ; reconnaissance prudente, conflits de portraits et
confirmation humaine ; avertissements dédoublonnés ; équipements et champs
inconnus ; Auth/récupération et traductions compatibles ; tests synthétiques.

Les modules de comparaison et de prévisualisation d'équipement sont conservés
comme dépendances de l'interface source. Leur voie d'écriture reste fermée par
`GEAR_REPAIR_RELEASE_APPROVED=false`. Aucune migration de réparation n'est incluse.

L'inventaire exact est la sortie de :

    git diff --name-status 3de64e919709d2b3a956d6fa6d92b539580d0ec9 HEAD

## Exclus des nouveaux objets

- ZIP privé et totalité de son commit d'introduction.
- Journaux de campagne, sauvegardes, données réelles, credentials et fichiers env.
- Outils backup/recovery/TOTP, bancs opérateur et charge staging.
- Diagnostic externe et son point d'entrée optionnel du serveur.
- Modifications de `.replit`, Vercel, GitHub Actions et activation des paiements.
- Nouvelles migrations/audits/rollback SQL et notes mémoire de l'agent.
- Ajout de captures ou pièces jointes personnelles ; quatre anciennes captures
  sont supprimées de l'état final, sans ajout de leurs pixels dans le lot.

## Limites de confidentialité

La base distante comporte déjà des captures dans ses anciens commits.
Les retirer de l'état final ne purge pas ces ancêtres. Une purge de cet ancien
historique serait une opération distincte, non autorisée ici.

Le contrôle des nouveaux objets cherche chemins sensibles et credentials
reconnaissables ; ce n'est pas une garantie absolue d'absence de donnée privée.
Les Secrets runtime et les journaux privés ne sont pas consultés.

## Validation locale

Tests exécutés avec environnement vidé et blocage réseau, réponses Vision
simulées, fixtures synthétiques, sans Supabase/Stripe/OpenAI réels ni serveur.
La suite de formation doit recevoir la clé **factice** prévue par sa commande npm.
Le test du build doit s'exécuter après `npm run build`.

Le mock du test de réouverture est complété avec `analysisIndicator.refresh`,
méthode déjà appelée par le code normal. Aucun seuil de reconnaissance n'est
abaissé et aucune identité n'est automatiquement confirmée.

Le compte rendu d'exécution indique séparément les scripts, les sous-tests TAP,
le check et le build. Aucun résultat ne certifie de vrais pixels ou Android.

Résultat final de cette préparation : 77 scripts de validation réussis, plus
`npm run check` et `npm run build`, soit 79 commandes de validation réussies et
aucun échec final. Les sorties TAP comptent 108 sous-tests ; les autres scripts
utilisent leurs propres assertions/groupes et ne sont pas additionnés à ce
nombre. Le test fresh-launch couvre 10 scénarios.

Les premiers échecs provenaient du mock fresh-launch incomplet, de l'absence de
clé factice lors de l'appel direct de la suite Vision et du contrôle du build
avant sa génération. Les cas concernés ont été corrigés ou relancés avec les
prérequis synthétiques appropriés, sans désactiver les assertions.

## Avant toute action GitHub

Ne pas pousser la branche originale et ses 54 commits.
Vérifier la branche sélectionnée et n'envoyer que cette branche de revue.
Un push d'une branche de revue peut déclencher Vercel Preview si l'intégration
Git le prévoit : cette configuration externe n'a pas été consultée ni modifiée.
Il faut donc vérifier/suspendre ces déclenchements avant tout push.

Ce lot n'est pas un Preview staging isolé. Ne pas lancer le serveur normal pour
créer des comptes ou scanner : sa configuration runtime n'est pas validée pour
une recette sans production. Aucun paiement ni mise en vente n'est autorisé.
