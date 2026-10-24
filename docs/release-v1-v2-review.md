# WarBoost V1 → V2 : préparation locale, NON autorisée à déployer

## Références et périmètre

- Cible déclarée par le propriétaire : projet Vercel existant `warboost_v4`,
  domaine `warboost.fr`. Aucun nouveau site/application.
- Base commerciale : `main` à `59945b3e8f50c9f2c8b3cb58bd16fe8f6f1daa54`.
- Source fonctionnelle filtrée : `0b418e319c99de4d42dbe412e0be58eff3e07f53`.
- Release locale : `warboost-release-v2-review-20261024`, sans upstream.
- La bêta et `demo-lastwar-presentation` ne sont ni modifiées ni fusionnées.
- Copie sélective du code web/API/lib/tests et assets de référence existants.
  Aucun historique des 54 commits, ZIP, journal, compte, pièce jointe,
  capture personnelle, banc opérateur ou migration SQL ajouté.
- Les références de portraits préexistantes sont nécessaires au scan. Leur
  présence technique ne constitue PAS une validation de droits de reproduction.
- `vercel.json` et les réglages de déploiement de main restent inchangés.
  Cela ne constitue PAS une configuration V2 prête à déployer.

## Mise à jour : correctif local de conservation V1

Le P0 ci-dessous est maintenant corrigé **en local sur la release seulement**.
Voir [preuves et limites du correctif](release-v1-preservation-fix.md).
Les noms/positions/champs sauvegardés en V1 sont conservés avec provenance
ancienne, sans nouvelle confirmation V2 inventée. La fixture Stripe manquante
est désormais présente uniquement sous `scripts/fixtures/billing/`.
Les résultats et blocages ci-dessous décrivent l'intervention initiale :
ils ne remplacent pas les résultats actualisés du correctif.
La production reste **NO-GO**, notamment faute de restauration réelle et de
vérification autorisée des cibles et déclencheurs Vercel.

## P0 initial effectivement reproduit, désormais corrigé localement

L'ancien normalizer, exécuté depuis le commit main exact, produit des héros V1
sans preuves de composition V2. Le normalizer V2 peut vider leurs slots actifs
et déplacer leur identité vers ses mécanismes de revue/historique. Aucune
conversion implicite en « confirmé » n'est autorisée.

Le test `scripts/release/verify-v1-transition.mjs` exige désormais la conservation
du document V1 représentatif. Cela ne valide PAS à lui seul le parcours réel
de reconnexion : il reste à tester l'interface et les handlers sur staging
après autorisation, sans comptes commerciaux.
Attention : les chemins de restauration GET V2 peuvent aussi réparer/persister
des données. Ne pas les appeler sur les comptes commerciaux pour « auditer ».

Le helper offline conserve/restaure les documents JSON synthétiques et leurs
snapshots avec contrôle de propriétaire et checksum. Ce n'est NI un export DB,
NI une preuve de restauration PostgreSQL, NI une migration appliquée.
L'ancien texte d'équipement n'est pas une preuve de vingt équipements structurés.

## Barrières avant toute PR / push / promotion

1. **Vercel** : vérifier par métadonnées propriétaire équipe, projet
   `warboost_v4`, dépôt, branche de production, domaines et comportement des
   push/Preview. Le nom fourni ne prouve pas les réglages. Aucun connecteur
   Vercel n'est actuellement disponible. Un push n'est PAS réputé sans effet.
2. **Build** : déterminer les réglages effectifs. Le V2 nécessite le build web,
   sortie `web-dist`, API serverless et références embarquées. Ne pas exposer la
   racine Git comme répertoire statique de remplacement. Ne pas modifier la
   configuration partagée de la bêta pour résoudre ce point.
3. **Cloud** : lire seulement les métadonnées explicitement autorisées de
   l'environnement commercial : projet, schéma, colonnes, RPC, RLS, grants,
   buckets et règles Auth. Aucun appel de données ou migration automatique.
   Les domaines bêta/commercial peuvent partager une base : inconnu.
4. **Identités et données** : résoudre le P0 V1, prouver quatre escouades,
   snapshots, conflits, suppressions volontaires, grades et memberships sur
   fixtures puis handlers staging, sans réattribuer de comptes.
5. **Sauvegarde** : preuve d'une sauvegarde commerciale restaurable et d'une
   restauration isolée, sans recopier des données personnelles dans ce dépôt.
   Prévoir arrêt des écritures/versionnement et retour code + données.
6. **Recette** : Android, email/recovery autorisés, pixels Tank/Avion/Missile,
   Technologie/drone, Alliance R4/R5, événements, 22 langues (relecture humaine),
   support, droits Last War et documents commerciaux à valider.
7. **Paiements** : aucun changement d'activation ; Stripe TEST complet reste
   une preuve distincte à obtenir, aucun LIVE/PRO commercial ouvert ici.
8. Validation explicite du propriétaire de la version réellement essayée.

## Retour arrière prévu, non exécuté

Avant toute livraison : identifier le déploiement Vercel V1 exact et vérifier
que sa promotion de retour est possible ; tester les états V2 relus par V1.
Si les nouvelles écritures ne sont pas rétrocompatibles, le rollback de code
seul est insuffisant : il faut une stratégie de données validée et une fenêtre
d'arrêt contrôlée. Ne jamais restaurer aveuglément un dump par-dessus les
écritures récentes des joueurs.

**Verdict par défaut : NO-GO production.** Cette préparation ne constitue
aucune autorisation de push, PR distante, merge, migration ou déploiement.

## Commandes locales sans réseau

Depuis le worktree de release, environnement vidé et blocage réseau explicite :
`node --require ./scripts/release/no-network.cjs --test scripts/release/verify-v1-transition.mjs`

Les suites existantes à transports simulés testent leurs helpers/handlers réels,
mais ne certifient ni les pixels, ni les API externes, ni le téléphone.

## Résultats de cette intervention avant contrôle final d'historique

27 commandes distinctes : **26 PASS, 1 FAIL**, dont check et build PASS.
Les suites Node qui publient leurs compteurs rapportent **73 sous-tests PASS,
0 sous-test FAIL** ; les assertions des scripts à compteurs personnalisés ne
sont pas ajoutées artificiellement à ce total.

- Transition V1 réelle → proposition V2 : 10 sous-tests synthétiques PASS.
  Le PASS signifie notamment que l'incompatibilité est correctement détectée,
  PAS que la transition commerciale fonctionne.
- SQL local : 2 sous-tests PASS, moteur PGlite PostgreSQL **WASM en mémoire**.
  DDL profils V1 exact, rollback transactionnel et copie logique de profils
  synthétiques vers un second moteur vide. Aucun PostgreSQL natif, GoTrue,
  dump réel, RLS réel ou restauration commerciale certifié par ces deux tests.
- PASS : handlers mobiles Scan, ciblage escouades, formation Vision simulée,
  reconnaissance héros, équipements, revue, Auth, isolation comptes,
  diagnostic sauvegarde, autorisations Alliance, W, Technologie, fraîcheur,
  courses confidentialité, roster mobile/rangs/anti-retour/synchronisation,
  roster partagé, drone et i18n ; check/syntaxe et build web.
- **FAIL** : `node scripts/verify-stripe-test.mjs` s'arrête sur un fichier SQL
  de fixture absent (`migration_v2_5_28_hf8_commercial_readiness.sql`).
  Les migrations supplémentaires n'ont volontairement pas été importées dans
  cette branche depuis la bêta. Ce n'est pas une preuve de panne Stripe LIVE,
  et les tests de facturation ne sont PAS considérés validés sur cette release.
  Ne pas installer du SQL en production pour faire passer ce test.
- Deux noms de scripts initialement recherchés n'existent pas ; ils ne sont
  comptés ni comme tests exécutés ni comme tests réussis.

Exécution avec environnement Node vidé, transport réseau bloqué, clés
strictement synthétiques pour la suite Vision. Aucune base Supabase, aucun
compte, e-mail, paiement ou analyse IA externe utilisé.
Les logs de validation restent locaux sous `/tmp/warboost-v1-v2-validation/`
(temporaires, non garantis persistants, non inclus dans Git).

Un test séparé `scripts/release/verify-release-history.mjs` contrôle le commit
final depuis main : parent exact, absence du ZIP dans l'ascendance complète,
chemins privés exclus, configuration/SQL inchangés, provenance des modules
fonctionnels et recherche de formats de credentials reconnaissables.
Ce contrôle automatisé ne prouve pas tous les droits d'usage des assets ni
l'absence absolue de données privées dans tous les anciens objets publics.
