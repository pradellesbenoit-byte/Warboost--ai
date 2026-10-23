# Roster : corrections locales et limites de validation

## Défauts et changements

- Le statut roster était après le brouillon et l'import. Il est maintenant
  immédiatement après le bouton d'analyse. Le ciblage du W inline est explicite
  pour le drawer Alliance, avec arrêt à la fin/erreur/expiration et reduced-motion.
  Le code local avait déjà un indicateur inline générique : le badge flottant
  observé en bêta n'a pas été reproduit dans un navigateur réel ici.
- Le prompt autorisait un grade null puis demandait d'omettre une fiche si le
  grade était illisible. Seul un pseudo non distinguable justifie désormais
  l'omission ; le grade inconnu reste null et doit être confirmé humainement.
- Une erreur 422 scan_no_useful_data abandonnait le lot avant affectation du
  brouillon. Chaque résultat utile est maintenant conservé immédiatement,
  les 422 attendues sont comptées, et les autres erreurs restent bloquantes
  avec message d'échec. Aucun nouvel appel ni retry automatique ajouté.
- L'ajout manuel ouvre une ligne vide sans grade, sous l'autorisation gestionnaire
  existante. Import additif par défaut, grade explicite et résolution d'identité
  toujours exigés. Pas de changement du backend d'import, de CAS ou de privilèges.
- L'import échoué conserve le brouillon ; les tests existants couvrent la
  persistance locale pending et le refus d'une fausse confirmation cloud.

## Preuves locales exécutées

Blocage réseau préchargé pour chaque script avec :

    node --import ./scripts/fixtures/block-external-network.mjs scripts/<script>.mjs

Neuf scripts terminés avec code 0 :

- verify-roster-scan-mobile : 13 tests, 13 PASS, 0 FAIL. Vrais handlers extraits
  dans une VM, DOM minimal et réponses synthétiques ; pas de navigateur.
- verify-analysis-indicator : assertions cycle de vie/concurrence, ciblage
  roster, placement HTML et 276 messages localisés.
- verify-roster-sync-feedback : 25 groupes PASS.
- verify-profile-roster-isolation : 23 groupes PASS, PostgreSQL en mémoire.
- verify-roster-only-sync : 14 groupes PASS.
- verify-roster-rank-persistence, verify-roster-anti-rollback,
  verify-alliance-roster-removal, verify-shared-alliance-roster : assertions PASS.

Les nouveaux tests couvrent notamment fiche structurée sans grade, I majuscule,
QG d'en-tête distinct du niveau secondaire, alliance distincte du pseudo,
doublons, images illisibles, timeout après succès, réponse tardive, autorisation
manuelle, grade absent, identité non résolue, import additif et échec cloud.
Avant correction, la première exécution avait 1 PASS et 7 FAIL ; une de ces
défaillances venait d'une fixture fournissant l'en-tête complet à la place du
pseudo structuré et a été corrigée dans le test, pas présentée comme bug produit.

`npm run check` (avec ses hooks syntaxiques), syntaxe du nouveau test,
`git diff --check` et `npm run build` : PASS.
Build : 8 pages et 149 modules navigateur. Aucun serveur démarré.

## Limites et recette ultérieure

Pas de pixels Last War, Android réel, appel Vision, Supabase distant ou écriture
joueur testés. L'exemple de fiche n'est qu'une fixture, jamais une donnée injectée.
La vraie cause d'un joueur manquant peut encore être l'OCR, une identité ambiguë,
un doublon ou une erreur cloud ; les preuves actuelles ne tranchent pas son cas.
FR et fallback anglais explicite pour les nouveaux textes, pas 22 traductions
humaines nouvelles. Aucun push ni publication effectué par cette intervention.

Après autorisation et accès de recette isolé vérifié : commencer sur Android
par « Ajouter un membre manuellement », sans capture ni import, pour vérifier
le formulaire et l'absence de grade présélectionné. Les essais OCR payants et
imports distants exigent une validation distincte ; ne pas utiliser un Preview
potentiellement relié à la production comme environnement de test.

L'ancienne archive ZIP préparée avant ces corrections ne contient pas ce correctif.
