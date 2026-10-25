# Scan sans fournisseur : refus avant réservation FREE

Branche de revue : `warboost-free-access-review-20261025`.
Base vérifiée : `5ddec52dfdf21947ad0a9be5ea0cda01c4312e01`.

## Défaut reproduit

Le handler validait la requête, puis appelait `requirePersonalScanUser`, qui
réservait le quota FREE avant le contrôle de configuration du fournisseur IA.
Sans fournisseur, la réponse 503 arrivait donc après la réservation.

Le nouveau fichier de régression a donné **12 PASS / 4 FAIL avant correction** :
non-consommation FREE, ordre configuration/réservation pour les deux fournisseurs,
et préflight du helper. Ces échecs ont été conservés dans la même régression,
pas supprimés pour obtenir un résultat vert.

## Correctif limité

- `api/scan.js` transmet un contrôle de configuration au helper d'accès.
- `lib/personal-scan-access.js` exécute ce contrôle après authentification,
  consentement et vérification des droits, avant toute réservation FREE.
- Sans clé OpenAI ni endpoint Vision, réponse **503 / SCAN_NOT_CONFIGURED**,
  avec le contrat `scan_provider_unavailable` existant, sans réservation ni IA.
- Les requêtes non autorisées restent refusées avant lecture de la configuration.
- Les droits PRO vérifiés, restrictions FREE et réservations compte/IP/global
  restent inchangés. Le throttling continue de bloquer l'appel IA.
- Aucun remboursement rétroactif. Un fournisseur configuré qui échoue après
  réservation reste soumis au comportement antérieur, sans remboursement ajouté.

## Vérification locale sans réseau

Commandes lancées dans un environnement vidé, avec valeurs synthétiques si
nécessaires et `scripts/release/no-network.cjs` préchargé :

1. `node --test scripts/scan-provider-quota.test.mjs scripts/free-access.test.mjs scripts/free-workspace.test.mjs scripts/workspace-mobile-feedback.test.mjs`
   : **120 PASS, 0 FAIL, 0 ignoré**, dont 16 nouveaux tests.
2. `node scripts/verify-stripe-test.mjs`
   : **21 scénarios PASS**, fournisseur Stripe factice et base locale PGlite.
3. `npm run check`, `npm run build:web`, `git diff --check` : **PASS**.
   Build : 8 pages, 155 modules navigateur.

Les 16 tests ciblés exécutent le corps complet du véritable handler avec ses
dépendances simulées et le vrai helper de réservation. Ils couvrent FREE/PRO,
OpenAI/endpoint personnalisé factices, authentification, consentement, e-mail,
requêtes invalides, grade déclaré ne donnant pas PRO, refus de quota,
throttling et panne fournisseur sans remboursement/retry ajouté.

Aucune requête Supabase/OpenAI/Stripe réelle, aucun compte ni quota réel modifié,
aucune migration, variable de fournisseur ou configuration de déploiement modifiée.
Pas de serveur, publication ou déploiement. La recette sur vraie infrastructure
reste non exécutée ; cette correction ne répare pas les quotas déjà réservés.
