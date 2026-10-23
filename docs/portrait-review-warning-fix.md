# Revue portraits et avertissements — correctif local

## Périmètre

Branche `public-beta-safe-launch`, base `d833cae5ca3597b71d3af8544f9d5f63ab93ea60`.
Aucun commit, push, serveur, publication ou appel externe pendant ce correctif.
Pas de capture privée, de Secret, de compte ou de journal utilisateur lu.

## Défauts reproduits et corrections

- Avant correction : 2 régressions ciblées échouent. Les représentations
  d'un même avertissement sans valeur puis avec nom donnent 6 lignes pour
  3 champs incertains ; Richard/Williams et DVA/Kimberly ne sont pas expliqués
  dans le texte lisible hors du diagnostic avancé.
- Cause des doublons : les problèmes du formulaire puis ceux du merge
  s'ajoutent au même `scan_pending`, et les deux écrans les affichent tels quels.
- La déduplication est maintenant commune aux présentations Scan et Joueur,
  par slot/champ/raison ; elle préfère la représentation renseignée et conserve
  des raisons différentes ou plusieurs valeurs non vides contradictoires.
  Elle ne modifie ni `scan_pending`, ni ses preuves, ni la résolution des champs.
- Les deux observations du diagnostic existant sont nommées seulement si elles
  appartiennent au catalogue et à un conflit dérivé de la même capture.
  Aucun héros n'est élu par son score, sa classe ou sa position.
- Le menu existant reste le choix tactile ; pas de boutons supplémentaires.
  Un choix corrigé doit maintenant aussi avoir sa case « Je confirme ce héros »
  cochée. Changer à nouveau le héros décoche seulement sa propre confirmation.
  Aucun changement des seuils de reconnaissance, du fournisseur ou des clés.
- Le JSON reste dans un `<details>` fermé, non nécessaire pour comprendre les
  deux propositions. Texte français, repli anglais explicite pour les autres
  langues ; aucune prétention de traduction humaine intégrale.

## Validations exécutées localement, sans réseau

Environnement vidé (`env -i`, PATH et HOME temporaires) et bloqueur réseau
`scripts/fixtures/block-external-network.mjs`, réponses/identités synthétiques.

| Suite | Résultat final |
|---|---|
| handlers mobile + nouvelles régressions | 32 PASS, 0 FAIL (19 existantes + 13 nouvelles) |
| ciblage des escouades | 19 contrôles PASS |
| batch formations | 36 contrôles PASS |
| arbitrage classe/position | 6 groupes PASS, 80 cas internes |
| reconnaissance catalogue | 44 scénarios PASS |
| équipements | 10 contrôles PASS |
| confirmation escouades | 21 scénarios PASS |
| preuves/statuts escouades | 11 contrôles PASS |
| scan-review | 12 groupes de vérification PASS et 2 tests sélecteur PASS |
| centre Technologie | 15 tests PASS |
| traduction | 926 clés résolues dans les 23 locales du code, PASS |
| i18n/ARIA | PASS, 23 locales et RTL arabe |
| npm run check | PASS |
| build:web | PASS, 8 pages et 149 modules |
| test:web-build | PASS |
| git diff --check | PASS |

Les anciens tests qui exécutaient des fonctions extraites ont été adaptés à
l'import du nouveau helper. L'ancien test acceptant une correction de menu
sans case cochée a été renforcé pour le nouveau contrat explicite.
Des erreurs intermédiaires du nouveau banc (nom d'export, fixture sans preuve
de composition confirmée, contexte DOM incomplet) ont été corrigées ; les
résultats ci-dessus sont ceux des dernières exécutions réussies.

Les nouvelles régressions couvrent conflits Richard/Williams et DVA/Kimberly,
autre escouade et autre slot, cases indépendantes, modification après
confirmation, affichage réel des notices Scan/Joueur, reload JSON simulé,
historique non muté, quatre escouades confirmées préservées, 20 pièces niveau
40 par formation et puissances/étoiles inconnues non inventées.
Les suites existantes couvrent Tank/Avion/Missile et Technologie 0 %, Max,
Verrouillée. Elles ne sont pas une mesure d'exactitude Vision réelle.

## Limites et recette avant publication

Pas de vrais pixels personnels analysés, d'Android réel, de navigateur lancé,
de cloud réel ni d'appel Vision. Les fixtures de pixels des suites existantes
sont synthétiques. Pas de nouvelle garantie de reconnaissance des portraits.
Le correctif change le code normal local, pas la bêta actuellement publiée.

Après autorisation et disponibilité d'une recette réellement isolée :
ouvrir une revue avec conflit, vérifier le texte des deux noms, choisir le héros,
cocher sa confirmation ; laisser trois autres noms non cochés, confirmer les
valeurs puis vérifier trois avertissements uniques dans Scan et Joueur,
également après rechargement. Vérifier les autres escouades et équipements.
Ne pas utiliser le Preview partagé historiquement lié à production pour cette
recette ; aucun nouveau scan facturable n'est autorisé par ce document.
