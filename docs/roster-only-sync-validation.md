# Correction de portée de l’import roster — 12 octobre 2026

## Correction effective

L’import et sa retentative passent par `POST /api/sync`, avec
`operation: "alliance_roster"`, une version roster et un `roster_patch` limité.
Ils ne transmettent ni profil personnel, ni escouades, ni liens de comptes,
ni historique, ni données de combat personnelles. Le serveur applique sa
propre liste blanche, même si un client fournit des champs supplémentaires.

L’identité de l’acteur et la portée serveur/alliance proviennent du profil
cloud du compte authentifié. L’autorisation utilise le propriétaire ou
l’association canonique R4/R5 et la membership existante. Une association
absente ou un rôle seulement déclaré dans le navigateur ne suffit jamais.
L’authentification, le consentement et l’accès bêta restent exigés.

La fusion part du roster canonique cloud. Une version roster différente
est refusée ; le PATCH utilise aussi le CAS existant sur `updated_at`.
Le serveur relit ensuite le roster et vérifie la portée, la version et
son contenu avant de renvoyer une confirmation.

Cette opération ne sauvegarde aucun profil, snapshot ni membership.
La sauvegarde locale de son résultat ne programme pas non plus une
synchronisation personnelle automatique. Les données personnelles locales
et leurs éventuels changements en attente restent indépendants.

Les anciens appels sans `operation` mais avec un roster `pending` sont
isolés de la même façon ; leur version explicite reste requise. Leur réponse
est roster-only : recharger les nouveaux assets est nécessaire pour l’ancienne
interface. Le cache PWA est incrémenté sans effacer session ou données locales.

La synchronisation personnelle explicite utilise `operation: "player_sync"`.
Ses contrôles de fraîcheur des escouades sont inchangés ; un vrai conflit
reste `409 squad_freshness_ambiguous`, avant toute écriture.

## Pas de suppression implicite ni de répétition aveugle

Cet import est additif, même pour une capture marquée complète : l’absence
d’un membre ne devient pas une instruction de suppression. Les suppressions
restent dans le parcours explicite existant, avec ses propres autorisations.
Les tombstones cloud existants sont conservés.

Refus avant écriture : `write_state: not_attempted`. PATCH dont la réponse
est perdue : `unknown`. PATCH attesté mais relecture échouée : `confirmed`,
sans déclarer l’opération finalisée. Une retentative avec l’ancienne version
est refusée et ne réécrit pas le roster ; aucune retentative automatique
aveugle n’est ajoutée. Relire et vérifier la version canonique avant de
confirmer à nouveau. Le diagnostic contient uniquement des codes autorisés,
le statut HTTP, l’état d’écriture et l’autorisation lorsqu’elle a été évaluée.

## Vérifications exécutées

- `npm run test:roster-sync-feedback` : PASS, 24 groupes feedback/import
  navigateur/API et 14 groupes de l’opération roster-only.
- `npm run check` : PASS, precheck/check/postcheck.
- PASS : `test:alliance-authorization`, `test:roster-rank-persistence`,
  `test:roster-anti-rollback`, `test:shared-alliance-roster`,
  `test:canonical-roster-count`, `test:alliance-ui-targeted`,
  `test:alliance-event-workspace`, `test:companion-navigation`.
- PASS : `test:squad-provenance` (12 cas), `test:squad-restore`,
  `test:squad-scan-targets` (15 cas), `test:scan-review`,
  `test:formation-vision-batch`, `test:squad-mixed-captures` (25 cas),
  `test:analysis-indicator`, `test:mobile-auth-isolation`.
- `npm run build:web`, `npm run test:web-build`,
  `npm run build:mobile`, `npm run test:mobile-wrapper` : PASS.
- `git diff --check` : PASS.
- Après redémarrage du workflow de développement : serveur port 5000 actif,
  POST roster sans session sur le domaine Preview réel : HTTP 401,
  `AUTH_REQUIRED`, `write_state: not_attempted`, aucune écriture.
- Capture Preview à 390 × 844 : écran initial avec personnages présent et
  inchangé. Cette capture initiale ne valide pas un parcours R4/R5 connecté.

Les tests roster exécutent le handler, les fonctions de fusion et
d’autorisation réelles, et les fonctions navigateur réelles en DOM/stockage
isolés. Les transports d’authentification et de base de données sont
contrôlés, avec uniquement des fixtures synthétiques. Ils couvrent les
conflits, les écritures partielles, le rejet des liens/rôles non attestés,
les doublons et les retentatives. Ils ne prouvent pas les permissions RLS,
la configuration Vercel ou la synchronisation d’un vrai compte bêta.

## Validation restante et limites

Avant push : revue du diff. Après autorisation explicite du propriétaire,
validation authentifiée sur téléphone du même parcours avec un compte R4/R5
déjà lié, une version roster cloud relue et une confirmation consciente
de l’écriture. Vérifier l’accusé canonique et l’absence de changement des
quatre escouades. Ne pas simplement répéter une précédente tentative 409.

Un refus de session, consentement, liaison canonique, version ou permissions
Supabase peut encore exister indépendamment du bug de portée réparé.
Aucun test réel Android/iOS, aucune écriture de compte réel, migration,
nouveau secret/service, modification de production, push ou déploiement
n’est effectué dans cette passe.
