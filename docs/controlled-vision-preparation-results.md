# Résultat de préparation — aucun essai Vision réel

Base : `d881e9518a2bf72a8227836cb5e7368e64d5b995`,
branche `warboost-free-access-review-20261025`. Aucun changement de main,
de configuration Vercel, de compte, de donnée cloud ou de Secret.
Le déploiement Git reste désactivé pour cette branche dans `vercel.json`.

## Implémentation

- `server/_controlled-vision.js` : configuration exclusivement serveur, Preview
  et branche exacts, origine dédiée, deux clés Supabase TEST dédiées, GoTrue
  authentifié, email confirmé/consentement, compte explicitement autorisé.
- `api/scan.js` : chemin de démonstration isolé de la clé ordinaire, quotas
  FREE/PRO ordinaires, contexte cloud et seconde passe ; un seul appel Responses,
  sans fallback. Les quatre types restent dans leurs sanitizeurs et revues.
  Le garde SCAN_NOT_CONFIGURED pré-réservation du parcours normal est intact.
- `supabase/{migration,audit,rollback}_controlled_vision_test.sql` :
  préparation SQL **non installée**. Tables privées sous RLS, RPC service_role,
  compteur global borné à quatre, sérialisation et lease persistante. OFF après
  installation, aucune ligne créée. Shutdown sans purge/remise à zéro.
- `app.js`, `index.html`, `lib/player-scan-batch.js` : case initialement décochée,
  confirmation explicite, refus des lots et types non autorisés. Aucun pouvoir
  d'autorisation tiré du navigateur, aucun retry.
- `lib/controlled-vision-copy.js`, `i18n.js`, `lib/analysis-indicator.js` :
  six messages dans les 22 langues, dont confirmation, OFF, blocage/limite et
  erreur ; résolution via le vrai traducteur et direction arabe conservée.

## Vérifications effectivement exécutées, exclusivement locales

Commandes lancées avec environnement synthétique `env -i` et préchargement
`scripts/release/no-network.cjs`, sans lecture de variables runtime privées :

```text
node --require ./scripts/release/no-network.cjs --test \
  scripts/controlled-vision.test.mjs \
  scripts/scan-provider-quota.test.mjs \
  scripts/verify-scan-handlers-mobile.mjs \
  scripts/free-access.test.mjs \
  scripts/free-workspace.test.mjs \
  scripts/workspace-mobile-feedback.test.mjs
```

**Dernière passe : 242 PASS, 0 FAIL, 0 skipped/cancelled/todo.**
Dont 60 tests contrôlés ajoutés et 182 tests existants. Les premières passes
ont révélé des défauts des nouvelles fixtures (email synthétique manquant et
import oublié dans un test), corrigés sans assouplir la vérification d'email.

Couverture : OFF, clé absente/fallback interdit, branche/env/origine invalides,
compte non autorisé, consentement/email, droits de routes, registre manquant,
ticket perdu/invalide, quatre types seulement, cinquième/rejeu refusés,
parallélisme simulé, erreur fournisseur non remboursée, verrou conservé,
finish perdu sans retry ; handler actuel exécuté pour les quatre types avec
transports simulés ; limiteur existant ; API OpenAI sérialisée sans tools/
redirections/store ; annulation navigateur et messages traduits.
Les anciennes suites FREE/PRO/quotas et les handlers mobiles restent vertes.

```text
node --require ./scripts/release/no-network.cjs scripts/verify-controlled-vision-sql.mjs
```

**10 groupes PostgreSQL natifs PASS, 0 FAIL**. Base jetable, socket Unix sans
port réseau ; deux vraies connexions pour la course de réservation. Contrôle
projet déclaratif, installation vide, ACL/RLS, SECURITY DEFINER/search_path/
timeouts, compte/campagne/type refusés, sérialisation, mauvais finish, quatre
tentatives et cinquième refusée, rejeu migration, arrêt OFF et verrou après échec.
La création de rôles/base ici est locale, pas dans Supabase.

```text
NODE_OPTIONS='--require ./scripts/release/no-network.cjs' npm run check
NODE_OPTIONS='--require ./scripts/release/no-network.cjs' npm run build:web
node --check server/_controlled-vision.js
node --check lib/controlled-vision-copy.js
git diff --check
```

**PASS**. Build : 8 pages, PWA, 157 modules navigateur. Module serveur et clé
dédiée non importés par le frontend. Aucun nouveau point d'entrée serverless.
La suite Stripe n'a pas été relancée : aucun code de paiement n'est modifié.

## Limites / NO-GO activation

- Aucun vrai pixel Last War, scan Android, compte réel, fournisseur ou coût
  d'inférence vérifié. Pas de prétention de précision IA.
- Aucune migration installée, aucune clé fournie, campagne créée ni activée.
  Aucun serveur/Preview démarré, aucun déploiement lancé.
- Les docs publiques OpenAI ont été consultées pour vérifier modèle/support
  images/sorties structurées et limites de projet ; aucun appel d'inférence,
  d'authentification ou de facturation fournisseur.
- Le modèle réel disponible pour le compte et les droits SQL Supabase managés
  demandent encore une vérification distincte. Le test natif n'est pas GoTrue.
- Quatre tentatives ≠ plafond monétaire. Le réglage fournisseur de 2 USD avec
  hard limit doit être configuré/revu manuellement ; même son application peut
  être retardée selon OpenAI. Si 2 USD stricts sans aucun dépassement sont une
  condition absolue non démontrée, **rester OFF**.
- Le drapeau d'approbation serveur est une déclaration opérateur, pas une lecture
  indépendante des paramètres OpenAI. Le GUC SQL ne prouve pas le projet réel ;
  un connecteur admin doit imposer TEST. Un JWT décodé ne prouve pas sa signature ;
  GoTrue/PostgREST doivent valider les clés dans le futur.
- La fusion Technologie multi-captures reste couverte localement, mais
  volontairement interdite dans cette première campagne d'une capture par type.
- Les traductions sont testées par résolution/intégrité, pas relues par
  22 locuteurs natifs. L'UX mobile réelle reste à vérifier.

**GO pour revue de cette préparation, NO-GO pour activer aujourd'hui.**
Guide opérateur/Android : `docs/controlled-vision-android.md`.
