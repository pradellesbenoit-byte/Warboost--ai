# Technologie et propositions de portraits — correction locale

## Périmètre et état

Branche vérifiée avant modification : `warboost-free-access-review-20261025`.
Base : `2b16313a26f60a4addd2ef7f4ca8eb316477f1f6`.
Modifications locales pour relecture, sans push, commit ou déploiement.
Aucune configuration, clé, base distante, campagne ou entitlement modifié.
La campagne Vision annoncée terminée 4/4 n'a pas été consultée ni relancée.

## Causes reproduites et corrections

1. `path.includes("heroes")` confondait la branche
   `technology.branches.heroes.name` avec un nom de personnage. Le rendu et le
   vrai collecteur de formulaire reconnaissent maintenant uniquement un chemin
   complet `squads[0..3].heroes[0..4].name`. « Héros » 94 % est un texte éditable,
   comme les autres branches. Le sélecteur et l'accord explicite restent
   obligatoires pour les vrais héros nécessitant confirmation.
2. Le handler contrôlé omettait les atlas locaux et ne transmettait pas leurs
   références au sanitizeur. Il joint maintenant les mêmes références publiques,
   validées par manifeste/SHA256, à son unique requête puis au sanitizeur.
   Aucun nouvel asset, ajustement de seuil, indice de composition, passage zoom,
   fallback, retry ou appel IA supplémentaire. L'ordre des cinq lignes, les
   propositions contradictoires et les variantes déjà attestées continuent
   d'utiliser l'arbitrage existant. Une référence attestée n'est pas une
   correspondance de pixels certifiée (`match_verified=false`).
3. Une fixture ancienne de diagnostic cloud ne fournissait ni email ni date de
   confirmation. Elle échouait 403 avant d'atteindre les erreurs SQL simulées.
   Correction du faux utilisateur uniquement ; ajout d'un cas non confirmé
   refusé avant toute lecture/écriture cloud. Le code public reste `access_denied`
   conformément à la liste fermée du diagnostic, sans exposer le détail interne.

## Vérifications exécutées, hors réseau

Environnement effacé puis exclusivement valeurs synthétiques ; préchargement
de `scripts/release/no-network.cjs`. Les fournisseurs et transports cloud sont
simulés, les références sont lues uniquement depuis les assets publics locaux.

- Avant correction : deux fichiers ciblés, **87 entrées Node, 63 PASS,
  24 FAIL, 0 ignorée** : défaut Technologie dans les 22 langues, son vrai handler
  de formulaire et absence d'atlas dans le vrai handler contrôlé.
- Régression : **24 fichiers de tests**, **354 entrées Node**. Première passe :
  **353 PASS / 1 FAIL**, la fixture cloud obsolète ci-dessus. Après réparation de
  cette fixture, seul ce fichier a été relancé : **1 PASS / 0 FAIL**, avec
  **28 groupes internes**. Bilan par fichier au terme de la correction :
  **354 PASS, aucun échec restant, aucun test ignoré**. Les scripts à assertions
  internes comptent comme une entrée Node ; ne pas additionner leurs groupes
  au compteur Node.
- Inclus : 36 contrôles de formation avec fournisseur simulé ; reconnaissance
  du catalogue entier et variantes admissibles ; contradictions Richard/Williams
  et DVA/Kimberly ; confirmation partielle ; 10 contrôles équipements ; 19
  contrôles de cibles d'escouades ; quatre escouades/sauvegarde/rechargement,
  réponses tardives, isolation comptes ; transition V1 synthétique ;
  Technologie 0 %, max/verrouillée sans faux 100 %, fusion et confirmation ;
  drone ; FREE, espaces séparés, notice et libellés multilingues.
- Le vrai handler contrôlé reçoit cinq propositions synthétiques sans texte
  lisible, dans l'ordre Carlie/Lucius/DVA/Morrison/Skyler, avec les vrais IDs de
  références locales. Il joint les atlas à la même requête, renvoie cinq noms
  nécessitant confirmation, sans inventer niveau, étoiles, puissance ou gear.
  Quatre types donnent exactement quatre réservations et quatre appels simulés.
- `npm run check` : **PASS**.
- `npm run build:web` : **PASS**, 8 pages et 157 modules navigateur.
- `git diff --check` : **PASS**.

Fichiers exécutés via `node --require ./scripts/release/no-network.cjs --test` :

```
scripts/scan-technology-portrait-regression.test.mjs
scripts/controlled-vision.test.mjs
scripts/scan-provider-quota.test.mjs
scripts/verify-formation-vision-batch.mjs
scripts/verify-hero-recognition.mjs
scripts/verify-portrait-review-regression.mjs
scripts/verify-equipment-scan.mjs
scripts/verify-scan-review.mjs
scripts/verify-scan-review-presentation.mjs
scripts/verify-scan-review-markup.mjs
scripts/verify-squad-scan-review.mjs
scripts/verify-technology-center.mjs
scripts/verify-technology-scan.mjs
scripts/verify-drone-scan.mjs
scripts/verify-scan-handlers-mobile.mjs
scripts/verify-squad-scan-targets.mjs
scripts/verify-hero-slot-integrity-v2.5.28.mjs
scripts/verify-squad-confirmed-restore.mjs
scripts/verify-hero-power-sync.mjs
scripts/verify-cloud-save-diagnostic.mjs
scripts/release/verify-v1-transition.mjs
scripts/free-access.test.mjs
scripts/free-workspace.test.mjs
scripts/workspace-mobile-feedback.test.mjs
```

## Limites et décision

GO pour relecture du correctif local, pas pour annoncer la reconnaissance réelle
fiable. Aucun nouveau scan de pixels utilisateur ni essai Android/iPhone,
cloud réel ou migration PostgreSQL exécuté. Les fixtures de formation sont
synthétiques ; les atlas attestés ne prouvent pas l'exactitude d'un fournisseur.
Les fonctions SQL, RLS, quotas, accès PRO et le schéma n'ont pas été modifiés.
Les écrans réellement vus sur téléphone restent à vérifier sous autorisation
distincte, sans réarmer la campagne terminée.

Les atlas ajoutent des tokens d'entrée, pas des appels : aucune garantie de
dépense monétaire absolue ne découle de la limite à quatre tentatives.
Le guide conserve cette limite et exige toujours la configuration privée
autorisée avant un quelconque futur essai réel.
